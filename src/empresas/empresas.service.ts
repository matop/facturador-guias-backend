import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindOptionsWhere } from 'typeorm';
import { Guia } from '../guias/entities/guia.entity.js';
import { Cliente } from '../clientes/entities/cliente.entity.js';
import { GuiasService } from '../guias/guias.service.js';
import { GroupingService, AgrupadorResult } from '../reglas/grouping.service.js';
import { ReglasService } from '../reglas/reglas.service.js';
import { XmlParserService } from '../xml/xml-parser.service.js';
import { periodoToRange } from './utils/periodo-to-range.js';
import { normalizeToXml, toCsvRut } from '../utils/rut.js';

export interface ClienteConGuiasDto {
  rut: string;
  nombre: string;
  cantidadGuias: number;
  montoTotal: string;
  reglaIdl: string | null;
}

export interface GrupoDto {
  valorAgrupador: string;
  reglaIdl: string | null;
  cantidadGuias: number;
  montoTotal: string;
  folios: Array<{ folio: string; fecha: string }>;
}

export interface GuiasAgrupadasItemDto {
  cliente: { rut: string; nombre: string };
  grupos: GrupoDto[];
}

@Injectable()
export class EmpresasService {
  constructor(
    @InjectRepository(Guia) private readonly guiaRepository: Repository<Guia>,
    @InjectRepository(Cliente) private readonly clienteRepository: Repository<Cliente>,
    private readonly guiasService: GuiasService,
    private readonly groupingService: GroupingService,
    private readonly xmlParserService: XmlParserService,
    private readonly reglasService: ReglasService,
  ) {}

  async sync(
    empkey: string,
    rut: string,
    periodo: string,
  ): Promise<{ synced: number; clientesCreated: number }> {
    const { fechaInicial, fechaFinal } = periodoToRange(periodo);
    return this.guiasService.syncFromReporte(empkey, rut, fechaInicial, fechaFinal);
  }

  async getClientesConGuias(empkey: string, periodo: string): Promise<ClienteConGuiasDto[]> {
    const { fechaInicial, fechaFinal } = periodoToRange(periodo);
    const guias = await this.guiaRepository.find({
      where: {
        empkey,
        guifechaemision: Between(fechaInicial, fechaFinal) as any,
      },
    });
    if (guias.length === 0) return [];

    const byRut = new Map<string, Guia[]>();
    for (const g of guias) {
      if (!byRut.has(g.gclirut)) byRut.set(g.gclirut, []);
      byRut.get(g.gclirut)!.push(g);
    }

    const gcliruts = [...byRut.keys()];
    const xmlRuts = gcliruts.map(r => normalizeToXml(toCsvRut(r)));
    const clientes = await this.clienteRepository.find({
      where: xmlRuts.map(gclirut => ({ empkey, gclirut })),
    });
    const clienteMap = new Map(clientes.map(c => [c.gclirut, c]));

    const result: ClienteConGuiasDto[] = [];
    for (const [gclirut, guiasCli] of byRut) {
      const xmlRut = normalizeToXml(toCsvRut(gclirut));
      const cliente = clienteMap.get(xmlRut);
      result.push({
        rut: gclirut,
        nombre: cliente?.gclinom ?? '',
        cantidadGuias: guiasCli.length,
        montoTotal: guiasCli.reduce((s, g) => s + BigInt(g.guitotdoc ?? 0), 0n).toString(),
        reglaIdl: cliente?.reglaidl ?? null,
      });
    }
    return result;
  }

  async getGuiasAgrupadas(
    empkey: string,
    periodo: string,
    rut?: string,
  ): Promise<GuiasAgrupadasItemDto[]> {
    const { fechaInicial, fechaFinal } = periodoToRange(periodo);
    const where: FindOptionsWhere<Guia> = {
      empkey,
      guifechaemision: Between(fechaInicial, fechaFinal) as any,
    };
    if (rut) where.gclirut = rut;

    const guias = await this.guiaRepository.find({ where });
    if (guias.length === 0) return [];

    const byRut = new Map<string, Guia[]>();
    for (const g of guias) {
      if (!byRut.has(g.gclirut)) byRut.set(g.gclirut, []);
      byRut.get(g.gclirut)!.push(g);
    }

    const gcliruts = [...byRut.keys()];
    const xmlRuts = gcliruts.map(r => normalizeToXml(toCsvRut(r)));
    const clientes = await this.clienteRepository.find({
      where: xmlRuts.map(gclirut => ({ empkey, gclirut })),
    });
    const clienteMap = new Map(clientes.map(c => [c.gclirut, c]));

    const result: GuiasAgrupadasItemDto[] = [];
    for (const [gclirut, guiasCli] of byRut) {
      const xmlRut = normalizeToXml(toCsvRut(gclirut));
      const cliente = clienteMap.get(xmlRut);

      const byAgrupador = new Map<string, Guia[]>();
      for (const g of guiasCli) {
        const key = g.guivaloragrupador || '_sin_regla';
        if (!byAgrupador.has(key)) byAgrupador.set(key, []);
        byAgrupador.get(key)!.push(g);
      }

      const grupos: GrupoDto[] = Array.from(byAgrupador.entries()).map(([valorAgrupador, gs]) => ({
        valorAgrupador,
        reglaIdl: gs[0]?.guireglaidl ?? null,
        cantidadGuias: gs.length,
        montoTotal: gs.reduce((s, g) => s + BigInt(g.guitotdoc ?? 0), 0n).toString(),
        folios: gs.map(g => ({ folio: g.guifolio, fecha: g.guifechaemision })),
      }));

      result.push({
        cliente: { rut: gclirut, nombre: cliente?.gclinom ?? '' },
        grupos,
      });
    }
    return result;
  }

  async getReglasParaEmpresa(empkey: string): Promise<{ reglaIdl: string; reglaDesc: string }[]> {
    return this.reglasService.findReglasDisponibles(empkey);
  }

  async assignRegla(
    empkey: string,
    rutCsv: string,
    reglaIdl: string,
    opciones?: { recomputar: boolean; periodo?: string },
  ): Promise<void> {
    const rutXml = normalizeToXml(toCsvRut(rutCsv));

    // Leer reglaidl previo antes de actualizar
    const clientePrevio = await this.clienteRepository.findOne({ where: { empkey, gclirut: rutXml } });
    const reglaPrevia = clientePrevio?.reglaidl ?? null;

    await this.clienteRepository.update({ empkey, gclirut: rutXml }, { reglaidl: reglaIdl } as any);

    // Recomputar guías del período si se solicita explícitamente
    if (opciones?.recomputar === true) {
      if (!opciones.periodo) throw new BadRequestException('periodo es obligatorio cuando recomputar=true');
      await this._recomputarGuiasClientePorPeriodo(empkey, rutCsv, opciones.periodo);
    }
  }

  async assignModoDetalle(
    empkey: string,
    rutCsv: string,
    modoDetalle: 'SG' | 'POR_PRODUCTO',
  ): Promise<void> {
    const rutXml = normalizeToXml(toCsvRut(rutCsv));
    await this.clienteRepository.update({ empkey, gclirut: rutXml }, { modoDetalle } as any);
  }

  async recomputarTodasLasGuias(
    empkey: string,
    periodo: string,
  ): Promise<{ procesados: number; actualizados: number; errores: number }> {
    const { fechaInicial, fechaFinal } = periodoToRange(periodo);

    const guias = await this.guiaRepository.find({
      where: { empkey, guifechaemision: Between(fechaInicial, fechaFinal) as any },
    });

    const byRut = new Map<string, typeof guias>();
    for (const g of guias) {
      if (!byRut.has(g.gclirut)) byRut.set(g.gclirut, []);
      byRut.get(g.gclirut)!.push(g);
    }

    let actualizados = 0;
    let errores = 0;

    for (const [rutXml, guiasCli] of byRut) {
      for (const guia of guiasCli) {
        let agrupadorResult: AgrupadorResult | null = null;
        try {
          const doc = await this.xmlParserService.fetchDocument(guia.guifilepath);
          agrupadorResult = await this.groupingService.computeAgrupador(empkey, rutXml, doc.rawXml);
        } catch (e) {
          console.warn(`[recompute-bulk] XML no accesible para guía ${guia.guifolio}: ${e}`);
          errores++;
        }
        await this.guiaRepository.update(
          { empkey: guia.empkey, guitipo: guia.guitipo, guifolio: guia.guifolio },
          {
            guireglaidl: agrupadorResult?.guiReglaidl ?? null,
            guivaloragrupador: agrupadorResult?.guiValorAgrupador ?? null,
          } as any,
        );
        if (agrupadorResult) actualizados++;
      }
    }

    return { procesados: guias.length, actualizados, errores };
  }

  private async _recomputarGuiasClientePorPeriodo(
    empkey: string,
    rutCsv: string,
    periodo: string,
  ): Promise<void> {
    const rutXml = normalizeToXml(toCsvRut(rutCsv));
    const { fechaInicial, fechaFinal } = periodoToRange(periodo);
    const guias = await this.guiaRepository.find({
      where: {
        empkey,
        gclirut: rutXml,
        guifechaemision: Between(fechaInicial, fechaFinal) as any,
      },
    });
    for (const guia of guias) {
      let agrupadorResult: AgrupadorResult | null = null;
      try {
        const doc = await this.xmlParserService.fetchDocument(guia.guifilepath);
        agrupadorResult = await this.groupingService.computeAgrupador(empkey, rutXml, doc.rawXml);
      } catch (e) {
        // XML not accessible — leave as null (_sin_regla)
        console.warn(`[recompute] XML no accesible para guía ${guia.guifolio}: ${e}`);
      }
      await this.guiaRepository.update(
        { empkey: guia.empkey, guitipo: guia.guitipo, guifolio: guia.guifolio },
        {
          guireglaidl: agrupadorResult?.guiReglaidl ?? null,
          guivaloragrupador: agrupadorResult?.guiValorAgrupador ?? null,
        } as any,
      );
    }
  }
}
