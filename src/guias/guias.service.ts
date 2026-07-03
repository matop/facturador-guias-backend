import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Guia } from './entities/guia.entity.js';
import { GuiaImpuesto } from './entities/guia-impuesto.entity.js';
import { BackofficeAdapterService } from '../backoffice-adapter/backoffice-adapter.service.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { XmlParserService } from '../xml/xml-parser.service.js';
import { GroupingService } from '../reglas/grouping.service.js';
import { normalizeToXml, toCsvRut } from '../utils/rut.js';

const XML_FETCH_CHUNK_SIZE = 5;

@Injectable()
export class GuiasService {
  constructor(
    @InjectRepository(Guia)
    private readonly guiaRepository: Repository<Guia>,
    @InjectRepository(GuiaImpuesto)
    private readonly guiaImpuestoRepository: Repository<GuiaImpuesto>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly backofficeAdapterService: BackofficeAdapterService,
    private readonly clientesService: ClientesService,
    private readonly xmlParserService: XmlParserService,
    private readonly groupingService: GroupingService,
  ) {}

  async findAll(empkey: string): Promise<Guia[]> {
    return this.guiaRepository.find({ where: { empkey } });
  }

  async findByRut(empkey: string, gclirut: string): Promise<Guia[]> {
    return this.guiaRepository.find({ where: { empkey, gclirut } });
  }

  async findById(empkey: string, guitipo: number, guifolio: string): Promise<Guia> {
    const guia = await this.guiaRepository.findOne({
      where: { empkey, guitipo, guifolio },
    });
    if (!guia) {
      throw new NotFoundException(
        `Guia no encontrada: empkey=${empkey}, guitipo=${guitipo}, guifolio=${guifolio}`,
      );
    }
    return guia;
  }

  async syncFromReporte(
    empkey: string,
    rut: string,
    fechaInicial: string,
    fechaFinal: string,
  ): Promise<{ synced: number; clientesCreated: number }> {
    const rows = await this.backofficeAdapterService.getGuias(rut, fechaInicial, fechaFinal);

    const guias = rows
      .filter(row => row['Folio'] && row['Codigo Tipo'])
      .map(row => {
        const guia = new Guia();
        guia.empkey = empkey;
        guia.guitipo = parseInt(row['Codigo Tipo'], 10);
        guia.guifolio = row['Folio'];
        guia.guiestadoregistro = row['Estado Registro'] ?? '';
        guia.guiestadoacuse = row['Estado Acuse Mercaderia'] ?? '';
        guia.guiestadoanulacion = row['Estado Anulacion'] ?? '';
        guia.guisuccod = row['Codigo Sucursal'] ?? '';
        guia.guifechaemision = row['Fecha Emision'];
        guia.gclirut = normalizeToXml(toCsvRut(row['RUT Cliente']));
        guia.guitotneto = row['Monto Neto'];
        guia.guitotexento = row['Monto Exento'];
        guia.guitotiva = row['Monto IVA'];
        guia.guiotrosimpuestos = row['Monto Otros Impuestos'];
        guia.guitotdoc = row['Monto Total'];
        guia.guiiddoc = row['Identificador Documento'] ?? '';
        guia.guifilepath = row['Link XML'] ?? '';
        guia.guiloteidl = row['Identificador Lote'] ?? '';
        guia.guireglaidl = null;
        guia.guivaloragrupador = null;
        return guia;
      });

    if (guias.length === 0) {
      return { synced: 0, clientesCreated: 0 };
    }

    // ── FASE 1: Clientes (sin transacción) ───────────────────────────────────
    // Clientes deben existir ANTES de insertar guías (FK iguia1).
    // Se deduplica por gclirut y se fetchean XMLs en paralelo (chunks de N).

    const uniqueRutMap = new Map<string, Guia>(); // gclirut → primer guía con ese RUT
    for (const guia of guias) {
      if (guia.gclirut && !uniqueRutMap.has(guia.gclirut)) {
        uniqueRutMap.set(guia.gclirut, guia);
      }
    }

    const uniqueGuiasList = [...uniqueRutMap.values()];
    const seenRuts = new Map<string, { rawXml: string }>();
    let clientesCreated = 0;

    for (let i = 0; i < uniqueGuiasList.length; i += XML_FETCH_CHUNK_SIZE) {
      const chunk = uniqueGuiasList.slice(i, i + XML_FETCH_CHUNK_SIZE);
      const fetched = await Promise.all(
        chunk.map(g => this.xmlParserService.fetchDocument(g.guifilepath)),
      );
      for (let j = 0; j < chunk.length; j++) {
        const doc = fetched[j];
        const result = await this.clientesService.findOrCreate(empkey, doc.receptor);
        if (result.created) clientesCreated++;
        seenRuts.set(chunk[j].gclirut, { rawXml: doc.rawXml });
      }
    }

    // ── FASE 2: Guías + Impuestos + Agrupadores (en transacción) ────────────
    // Todo o nada: si falla impuestos o agrupadores, se revierte la inserción de guías.

    await this.dataSource.transaction(async (manager: EntityManager) => {
      await manager.save(Guia, guias);

      const impuestos: GuiaImpuesto[] = rows
        .filter(row => row['Folio'] && row['Codigo Tipo'] && row['Monto IVA'] && row['Monto IVA'] !== '0')
        .map(row => {
          const imp = new GuiaImpuesto();
          imp.empkey = empkey;
          imp.guitipo = parseInt(row['Codigo Tipo'], 10);
          imp.guifolio = row['Folio'];
          imp.guiimpcod = 14;
          imp.guiimpsubid = '0';
          imp.guiimpmonto = row['Monto IVA'];
          return imp;
        });

      if (impuestos.length > 0) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(GuiaImpuesto)
          .values(impuestos)
          .orIgnore()
          .execute();
      }

      if (seenRuts.size > 0) {
        const items = Array.from(seenRuts.entries()).map(([gclirut, { rawXml }]) => ({
          gclirut,
          xml: rawXml,
        }));
        const agrupadores = await this.groupingService.batchComputeAgrupadores(empkey, items);

        for (const guia of guias) {
          if (!guia.gclirut) continue;
          const agrupadorResult = agrupadores.get(normalizeToXml(toCsvRut(guia.gclirut))) ?? null;
          if (agrupadorResult !== null) {
            await manager.update(
              Guia,
              { empkey: guia.empkey, guitipo: guia.guitipo, guifolio: guia.guifolio },
              {
                guireglaidl: agrupadorResult.guiReglaidl,
                guivaloragrupador: agrupadorResult.guiValorAgrupador,
              },
            );
          }
        }
      }
    });

    return { synced: guias.length, clientesCreated };
  }
}
