import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  assertPuedeAprobar,
  assertPuedeAnular,
} from './proforma-transitions.js';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, Between, DataSource } from 'typeorm';
import { Factura } from '../facturacion/entities/factura.entity.js';
import { FacturaGuia } from '../facturacion/entities/factura-guia.entity.js';
import { Cliente } from '../clientes/entities/cliente.entity.js';
import { Regla } from '../reglas/entities/regla.entity.js';
import { BackofficeAdapterService } from '../backoffice-adapter/backoffice-adapter.service.js';
import type { ResultadoDTE } from '../backoffice-adapter/backoffice-adapter.service.js';
import { FacturacionService } from '../facturacion/facturacion.service.js';
import { XmlParserService } from '../xml/xml-parser.service.js';
import { periodoToRange } from '../empresas/utils/periodo-to-range.js';
import { normalizeToXml, toCsvRut } from '../utils/rut.js';
import {
  buildMensaje,
  type MensajeResult,
  type ModoDetalle,
  type DetalleItemParaMensaje,
  type ReferenciaExternaParaMensaje,
} from '../mensaje/mensaje-builder.js';
import { parseReferencias } from '../xml/xml-parser.utils.js';
import type { FetchedDocument } from '../xml/xml-parser.utils.js';
import { ParametrosService } from '../parametros/parametros.service.js';

export interface FacturaResumenDto {
  id: string;
  folio: string;
  fecha: string;
  estadoRegistro: string;
  estadoAnulacion: string;
  rutCliente: string;
  totNeto: string;
  totExento: string;
  totIva: string;
  totImpuestos: string;
  totDoc: string;
  loteId: string;
}

export interface FacturasPorPeriodoDto {
  facturas: FacturaResumenDto[];
  totales: {
    cantidad: number;
    montoNeto: string;
    montoIva: string;
    montoTotal: string;
  };
}

export interface FacturasSyncResult {
  synced: number;
}

export interface ProformaDto {
  id: string;
  folio: string;
  cliente: { rut: string; nombre: string };
  regla: { id: string; descripcion: string };
  cantidadGuias: number;
  montoTotal: string;
  estado: string;
  fecha: string;
  valorAgrupador: string;
  folioSii?: number | null;
  linkPdf?: string | null;
  linkXml?: string | null;
}

export interface ProformaGenerarResult {
  created: number;
  skipped: number;
}

export interface ProformaLimpiarResult {
  anuladas: number;
}

export interface CrearProformaBody {
  periodo: string;
  gclirut: string;
  reglaidl: string;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

interface GuiaParaProformaRow {
  empkey: string;
  guitipo: number;
  guifolio: string;
  gclirut: string;
  guireglaidl: string;
  guivaloragrupador: string | null;
  guitotneto: string;
  guitotiva: string;
  guitotdoc: string;
  guifilepath: string;
}

interface GrupoProforma {
  gclirut: string;
  reglaidl: string;
  valorAgrupador: string | null;
  guias: GuiaParaProformaRow[];
}

/**
 * 1 grupo por (gclirut, guireglaidl, guivaloragrupador): cada OC/HES/comuna
 * distinta cae en su propia Proforma, en vez de mezclarse en una sola por
 * cliente+regla como ocurría antes de resolver OPEN-2.
 */
function agruparPorValorAgrupador(
  guias: GuiaParaProformaRow[],
): GrupoProforma[] {
  const groups = new Map<string, GrupoProforma>();
  for (const guia of guias) {
    const key = `${guia.gclirut}|${guia.guireglaidl}|${guia.guivaloragrupador ?? ''}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        gclirut: guia.gclirut,
        reglaidl: guia.guireglaidl,
        valorAgrupador: guia.guivaloragrupador,
        guias: [],
      };
      groups.set(key, group);
    }
    group.guias.push(guia);
  }
  return [...groups.values()];
}

/** Fecha de hoy (YYYY-MM-DD) en huso America/Santiago. */
function todayInChile(): string {
  return new Date()
    .toLocaleString('sv-SE', { timeZone: 'America/Santiago' })
    .split(' ')[0];
}

@Injectable()
export class FacturasService {
  private readonly logger = new Logger(FacturasService.name);

  constructor(
    @InjectRepository(Factura)
    private readonly facturaRepository: Repository<Factura>,
    @InjectRepository(Cliente)
    private readonly clienteRepository: Repository<Cliente>,
    @InjectRepository(Regla)
    private readonly reglaRepository: Repository<Regla>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly backofficeAdapterService: BackofficeAdapterService,
    private readonly facturacionService: FacturacionService,
    private readonly xmlParserService: XmlParserService,
    private readonly configService: ConfigService,
    private readonly parametrosService: ParametrosService,
  ) {}

  // ─── Sync tipo 33 desde backoffice ─────────────────────────────────────────

  async sync(
    empkey: string,
    periodo: string,
    rut: string,
  ): Promise<FacturasSyncResult> {
    const { fechaInicial, fechaFinal } = periodoToRange(periodo);
    const rows = await this.backofficeAdapterService.getGuias(
      rut,
      fechaInicial,
      fechaFinal,
      33,
    );

    const facturas = rows
      .filter((row) => row['Folio'] && row['Codigo Tipo'])
      .map((row) => {
        const f = new Factura();
        f.empkey = empkey;
        f.gfackey = row['Folio'];
        f.gfactipo = row['Codigo Tipo'];
        f.gfacfolio = row['Folio'];
        f.gfacestadoregistro = row['Estado Registro'] ?? '';
        f.gfacestadoanulacion = row['Estado Anulacion'] ?? '';
        f.gfacfecha = row['Fecha Emision'];
        f.gclirut = row['RUT Cliente'] ?? '';
        f.gfactotneto = row['Monto Neto'] ?? '0';
        f.gfactotexento = row['Monto Exento'] ?? '0';
        f.gfactotiva = row['Monto IVA'] ?? '0';
        f.gfactotimpuestos = row['Monto Otros Impuestos'] ?? '0';
        f.gfactotdoc = row['Monto Total'] ?? '0';
        f.gfacfilepath = row['Link XML'] ?? '';
        f.gfacloteidl = row['Identificador Lote'] ?? '';
        f.esProforma = false;
        return f;
      });

    if (facturas.length > 0) {
      await this.facturaRepository.save(facturas);
    }
    return { synced: facturas.length };
  }

  async getFacturasPorPeriodo(
    empkey: string,
    periodo: string,
  ): Promise<FacturasPorPeriodoDto> {
    const { fechaInicial, fechaFinal } = periodoToRange(periodo);
    const facturas = await this.facturaRepository.find({
      where: { empkey, gfacfecha: Between(fechaInicial, fechaFinal) },
    });

    const facturasMapped: FacturaResumenDto[] = facturas.map((f) => ({
      id: f.gfackey,
      folio: f.gfacfolio,
      fecha: f.gfacfecha,
      estadoRegistro: f.gfacestadoregistro,
      estadoAnulacion: f.gfacestadoanulacion,
      rutCliente: f.gclirut,
      totNeto: f.gfactotneto,
      totExento: f.gfactotexento,
      totIva: f.gfactotiva,
      totImpuestos: f.gfactotimpuestos,
      totDoc: f.gfactotdoc,
      loteId: f.gfacloteidl,
    }));

    return {
      facturas: facturasMapped,
      totales: {
        cantidad: facturas.length,
        montoNeto: facturas
          .reduce((s, f) => s + BigInt(f.gfactotneto), 0n)
          .toString(),
        montoIva: facturas
          .reduce((s, f) => s + BigInt(f.gfactotiva), 0n)
          .toString(),
        montoTotal: facturas
          .reduce((s, f) => s + BigInt(f.gfactotdoc), 0n)
          .toString(),
      },
    };
  }

  async getGuiasPorFactura(
    empkey: string,
    gfackey: string,
  ): Promise<FacturaGuia[]> {
    const factura = await this.facturaRepository.findOne({
      where: { empkey, gfackey },
    });
    if (!factura)
      throw new NotFoundException(`Factura no encontrada: gfackey=${gfackey}`);
    return this.facturacionService.getGuiasByFactura(empkey, gfackey);
  }

  // ─── Factura Proforma ───────────────────────────────────────────────────────

  async generar(
    empkey: string,
    periodo: string,
  ): Promise<ProformaGenerarResult> {
    const { fechaInicial, fechaFinal } = periodoToRange(periodo);

    // Guías disponibles del período: con regla agrupadora asignada y no bloqueadas
    const guias = await this.dataSource.query<GuiaParaProformaRow[]>(
      `SELECT g.empkey, g.guitipo, g.guifolio, g.gclirut, g.guireglaidl, g.guivaloragrupador,
              g.guitotneto, g.guitotiva, g.guitotdoc, g.guifilepath
       FROM gde.guia g
       WHERE g.empkey = $1
         AND g.guifechaemision BETWEEN $2 AND $3
         AND g.guireglaidl IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM gde.facturaguias fg
           JOIN gde.factura f ON f.empkey = fg.empkey AND f.gfackey = fg.gfackey
           WHERE fg.empkey = g.empkey
             AND fg.guitipo = g.guitipo
             AND fg.guifolio = g.guifolio
             AND f.estado IN ('BORRADOR', 'APROBADA', 'EMITIDA')
         )`,
      [empkey, fechaInicial, fechaFinal],
    );

    // Agrupar por (gclirut, reglaidl, guivaloragrupador): 1 proforma por cada
    // combinación cliente+regla+valor (ej. una por OC, una por HES, una por comuna).
    const groups = agruparPorValorAgrupador(guias);

    let created = 0;
    let skipped = 0;

    for (const {
      gclirut,
      reglaidl,
      valorAgrupador,
      guias: groupGuias,
    } of groups) {
      const yaExiste = await this.existeProformaActivaParaValor(
        empkey,
        gclirut,
        reglaidl,
        valorAgrupador,
        fechaInicial,
        fechaFinal,
        ['BORRADOR', 'EMITIDA'],
      );

      if (yaExiste) {
        skipped++;
        continue;
      }

      const maximoGuias = await this.parametrosService.getMaximoGuias(empkey);
      const chunks = chunkArray(groupGuias, maximoGuias);
      for (const chunk of chunks) {
        const rutEmisor = await this._resolverRutEmisor(chunk);
        await this.insertProforma(empkey, gclirut, reglaidl, chunk, rutEmisor);
        created++;
      }
    }

    return { created, skipped };
  }

  /**
   * El RUT emisor no es un dato que el operador elija: viene estampado en el
   * propio XML de cada guía (`<Encabezado><Emisor><RUTEmisor>`) y puede variar
   * de una guía a otra (distintas sucursales/cuentas del ERP legado bajo el
   * mismo tenant). Se deriva desde las guías que van a esa proforma en vez de
   * asumir uno por defecto — si difieren dentro del mismo grupo, es una señal
   * real de que esas guías no deberían facturarse juntas.
   */
  private async _resolverRutEmisor(
    guias: { guifolio: string; guifilepath: string }[],
  ): Promise<string> {
    const docs = await Promise.all(
      guias.map((g) => this.xmlParserService.fetchDocument(g.guifilepath)),
    );
    const rutsEmisor = new Set(
      docs.map((d) => d.emisor.rutEmisor).filter((rut) => rut !== ''),
    );

    if (rutsEmisor.size === 0) {
      throw new UnprocessableEntityException(
        `No se pudo determinar el RUT emisor: ninguna de las guías (folios ${guias
          .map((g) => g.guifolio)
          .join(', ')}) tiene <RUTEmisor> en su XML`,
      );
    }
    if (rutsEmisor.size > 1) {
      throw new UnprocessableEntityException(
        `Las guías (folios ${guias.map((g) => g.guifolio).join(', ')}) tienen RUT emisor distinto entre sí (${[...rutsEmisor].join(', ')}) — no pueden agruparse en la misma factura`,
      );
    }
    return [...rutsEmisor][0];
  }

  /** Cuenta cuántas proformas en alguno de `estados` ya cubren guías con ese `valorAgrupador`. */
  private async existeProformaActivaParaValor(
    empkey: string,
    gclirut: string,
    reglaidl: string,
    valorAgrupador: string | null,
    fechaInicial: string,
    fechaFinal: string,
    estados: string[],
  ): Promise<boolean> {
    const [existing] = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count
       FROM gde.factura f
       JOIN gde.facturaguias fg ON fg.empkey = f.empkey AND fg.gfackey = f.gfackey
       JOIN gde.guia g ON g.empkey = fg.empkey AND g.guitipo = fg.guitipo AND g.guifolio = fg.guifolio
       WHERE f.empkey = $1 AND f.gclirut = $2 AND f.reglaidl = $3
         AND f.es_proforma = true AND f.estado = ANY($4)
         AND f.gfacfecha BETWEEN $5 AND $6
         AND g.guivaloragrupador IS NOT DISTINCT FROM $7`,
      [
        empkey,
        gclirut,
        reglaidl,
        estados,
        fechaInicial,
        fechaFinal,
        valorAgrupador,
      ],
    );
    return parseInt(existing.count) > 0;
  }

  async crearManual(
    empkey: string,
    body: CrearProformaBody,
  ): Promise<ProformaDto> {
    const { periodo, gclirut, reglaidl } = body;
    const { fechaInicial, fechaFinal } = periodoToRange(periodo);

    // Guías disponibles para este cliente + regla + período
    const guias = await this.dataSource.query<GuiaParaProformaRow[]>(
      `SELECT g.empkey, g.guitipo, g.guifolio, g.gclirut, g.guireglaidl, g.guivaloragrupador,
              g.guitotneto, g.guitotiva, g.guitotdoc, g.guifilepath
       FROM gde.guia g
       WHERE g.empkey = $1 AND g.gclirut = $2 AND g.guireglaidl = $3
         AND g.guifechaemision BETWEEN $4 AND $5
         AND NOT EXISTS (
           SELECT 1 FROM gde.facturaguias fg
           JOIN gde.factura f ON f.empkey = fg.empkey AND f.gfackey = fg.gfackey
           WHERE fg.empkey = g.empkey
             AND fg.guitipo = g.guitipo
             AND fg.guifolio = g.guifolio
             AND f.estado IN ('BORRADOR', 'APROBADA', 'EMITIDA')
         )`,
      [empkey, gclirut, reglaidl, fechaInicial, fechaFinal],
    );

    if (guias.length === 0) {
      throw new UnprocessableEntityException(
        `No hay guías disponibles para cliente=${gclirut}, regla=${reglaidl} en período ${periodo}`,
      );
    }

    // 1 proforma por cada guivaloragrupador distinto (ej. una por OC, una por HES).
    const groups = agruparPorValorAgrupador(guias);

    // Verificar conflicto ANTES de insertar nada: si algún grupo ya tiene una
    // Proforma activa, se aborta completo en vez de crear el resto a medias.
    for (const { valorAgrupador } of groups) {
      const yaExiste = await this.existeProformaActivaParaValor(
        empkey,
        gclirut,
        reglaidl,
        valorAgrupador,
        fechaInicial,
        fechaFinal,
        ['BORRADOR', 'APROBADA', 'EMITIDA'],
      );
      if (yaExiste) {
        throw new ConflictException(
          `Ya existe una Proforma activa para este cliente, regla${
            valorAgrupador ? ` y agrupador (${valorAgrupador})` : ''
          } en el período ${periodo}`,
        );
      }
    }

    const maximoGuias = await this.parametrosService.getMaximoGuias(empkey);
    const gfackeys: string[] = [];
    for (const { guias: groupGuias } of groups) {
      const chunks = chunkArray(groupGuias, maximoGuias);
      for (const chunk of chunks) {
        const rutEmisor = await this._resolverRutEmisor(chunk);
        const key = await this.insertProforma(
          empkey,
          gclirut,
          reglaidl,
          chunk,
          rutEmisor,
        );
        gfackeys.push(key);
      }
    }
    const factura = await this.facturaRepository.findOne({
      where: { empkey, gfackey: gfackeys[0] },
    });
    return this.buildProformaDto(factura!);
  }

  async listarProformas(
    empkey: string,
    periodo: string,
    estado?: string,
  ): Promise<ProformaDto[]> {
    const { fechaInicial, fechaFinal } = periodoToRange(periodo);
    const estadoFiltro = estado ?? 'BORRADOR';

    const rows = await this.dataSource.query<
      {
        gfackey: string;
        gfacfolio: string;
        gclirut: string;
        reglaidl: string | null;
        estado: string;
        gfacfecha: string;
        gclinom: string | null;
        regladescripcion: string | null;
        cantidad_guias: string;
        monto_total: string;
        valor_agrupador: string | null;
      }[]
    >(
      `SELECT f.gfackey, f.gfacfolio, f.gclirut, f.reglaidl, f.estado, f.gfacfecha,
              c.gclinom,
              r.regladescripcion,
              COUNT(fg.guifolio)::text AS cantidad_guias,
              COALESCE(SUM(g.guitotdoc::bigint), 0)::text AS monto_total,
              MIN(g.guivaloragrupador) AS valor_agrupador
       FROM gde.factura f
       LEFT JOIN gde.clientes c ON c.empkey = f.empkey AND c.gclirut = f.gclirut
       LEFT JOIN gde.regla r ON r.reglaidl = f.reglaidl
       LEFT JOIN gde.facturaguias fg ON fg.empkey = f.empkey AND fg.gfackey = f.gfackey
       LEFT JOIN gde.guia g ON g.empkey = fg.empkey AND g.guitipo = fg.guitipo AND g.guifolio = fg.guifolio
       WHERE f.empkey = $1 AND f.es_proforma = true AND f.estado = $2
         AND f.gfacfecha BETWEEN $3 AND $4
       GROUP BY f.gfackey, f.gfacfolio, f.gclirut, f.reglaidl, f.estado, f.gfacfecha,
                c.gclinom, r.regladescripcion`,
      [empkey, estadoFiltro, fechaInicial, fechaFinal],
    );

    return rows.map((r) => ({
      id: r.gfackey,
      folio: r.gfacfolio,
      cliente: { rut: r.gclirut, nombre: r.gclinom ?? '' },
      regla: { id: r.reglaidl ?? '', descripcion: r.regladescripcion ?? '' },
      cantidadGuias: parseInt(r.cantidad_guias),
      montoTotal: r.monto_total,
      estado: r.estado,
      fecha: r.gfacfecha,
      valorAgrupador: r.valor_agrupador ?? '_sin_regla',
    }));
  }

  async aprobar(empkey: string, gfackey: string): Promise<ProformaDto> {
    const factura = await this.facturaRepository.findOne({
      where: { empkey, gfackey, esProforma: true },
    });
    if (!factura)
      throw new NotFoundException(`Proforma no encontrada: gfackey=${gfackey}`);
    assertPuedeAprobar(factura);

    factura.estado = 'APROBADA';
    await this.facturaRepository.save(factura);

    try {
      const resultado = await this._emitir(factura);
      factura.gfacfolioSii = resultado.FolioDocumento;
      factura.gfaclinkPdf = resultado.LinkVisualizacion;
      factura.gfaclinkXml = resultado.LinkXML;
      factura.estado = 'EMITIDA';
      await this.facturaRepository.save(factura);
      this.logger.log(
        `DTE emitido: empkey=${empkey} gfackey=${gfackey} folio=${resultado.FolioDocumento}`,
      );
    } catch (err) {
      factura.estado = 'FALLIDA';
      await this.facturaRepository.save(factura);
      this.logger.warn(
        `Emisión fallida: empkey=${empkey} gfackey=${gfackey} — ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }

    return this.buildProformaDto(factura);
  }

  async emitirPendientes(empkey: string): Promise<{
    emitidas: number;
    fallidas: number;
    detalle: { gfackey: string; error: string }[];
  }> {
    const pendientes = await this.facturaRepository.find({
      where: { empkey, esProforma: true, estado: 'FALLIDA' },
    });

    let emitidas = 0;
    const detalle: { gfackey: string; error: string }[] = [];

    for (const factura of pendientes) {
      try {
        const resultado = await this._emitir(factura);
        factura.gfacfolioSii = resultado.FolioDocumento;
        factura.gfaclinkPdf = resultado.LinkVisualizacion;
        factura.gfaclinkXml = resultado.LinkXML;
        factura.estado = 'EMITIDA';
        await this.facturaRepository.save(factura);
        emitidas++;
        this.logger.log(
          `Re-emisión exitosa: empkey=${empkey} gfackey=${factura.gfackey} folio=${resultado.FolioDocumento}`,
        );
      } catch (err) {
        detalle.push({
          gfackey: factura.gfackey,
          error: err instanceof Error ? err.message : String(err),
        });
        this.logger.warn(
          `Re-emisión fallida: empkey=${empkey} gfackey=${factura.gfackey}`,
        );
      }
    }

    return { emitidas, fallidas: detalle.length, detalle };
  }

  async anular(empkey: string, gfackey: string): Promise<ProformaDto> {
    const factura = await this.facturaRepository.findOne({
      where: { empkey, gfackey, esProforma: true },
    });
    if (!factura)
      throw new NotFoundException(`Proforma no encontrada: gfackey=${gfackey}`);
    assertPuedeAnular(factura);

    await this.dataSource.query(
      `DELETE FROM gde.facturaguias WHERE empkey = $1 AND gfackey = $2`,
      [empkey, gfackey],
    );
    factura.estado = 'ANULADA';
    await this.facturaRepository.save(factura);
    return this.buildProformaDto(factura);
  }

  async limpiar(
    empkey: string,
    periodo: string,
  ): Promise<ProformaLimpiarResult> {
    const { fechaInicial, fechaFinal } = periodoToRange(periodo);

    const borradores = await this.facturaRepository.find({
      where: {
        empkey,
        esProforma: true,
        estado: 'BORRADOR',
        gfacfecha: Between(fechaInicial, fechaFinal),
      },
    });

    for (const f of borradores) {
      await this.dataSource.query(
        `DELETE FROM gde.facturaguias WHERE empkey = $1 AND gfackey = $2`,
        [f.empkey, f.gfackey],
      );
      f.estado = 'ANULADA';
    }

    if (borradores.length > 0) {
      await this.facturaRepository.save(borradores);
    }

    return { anuladas: borradores.length };
  }

  // ─── Helpers de emisión ─────────────────────────────────────────────────────

  private async _cargarGuiasParaEmision(empkey: string, gfackey: string) {
    const guias = await this.dataSource.query<
      {
        guitipo: number;
        guifolio: string;
        guitotneto: string;
        guitotiva: string;
        guitotdoc: string;
        guitotexento: string;
        guifechaemision: string;
        guifilepath: string;
      }[]
    >(
      `SELECT g.guitipo, g.guifolio, g.guitotneto, g.guitotiva, g.guitotdoc,
              g.guitotexento, g.guifechaemision::text, g.guifilepath
       FROM gde.guia g
       JOIN gde.facturaguias fg
         ON fg.empkey = g.empkey AND fg.guitipo = g.guitipo AND fg.guifolio = g.guifolio
       WHERE fg.empkey = $1 AND fg.gfackey = $2
       ORDER BY g.guifolio::bigint`,
      [empkey, gfackey],
    );
    if (guias.length === 0) {
      throw new UnprocessableEntityException(
        `Proforma ${gfackey} no tiene guías asociadas`,
      );
    }
    return guias;
  }

  private async _resolveModoDetalle(
    empkey: string,
    gclirut: string,
  ): Promise<ModoDetalle> {
    const cliente = await this.clienteRepository.findOne({
      where: { empkey, gclirut: normalizeToXml(toCsvRut(gclirut)) },
    });
    return cliente?.modoDetalle === 'POR_PRODUCTO' ? 'POR_PRODUCTO' : 'SG';
  }

  private _construirDetalleItems(
    guias: { guifechaemision: string }[],
    docs: FetchedDocument[],
  ): DetalleItemParaMensaje[] {
    return docs.flatMap((d, i) =>
      d.detalle.map((item) => ({
        nmbItem: item.nmbItem,
        qtyItem: item.qtyItem,
        prcItem: item.prcItem,
        codigo: item.codigo,
        indExe: item.indExe,
        montoItem: item.montoItem,
        fecha: guias[i].guifechaemision,
      })),
    );
  }

  /**
   * Extrae las referencias a OC/HES de cada guía de la factura. Las
   * `descartadas` (TpoDocRef no reconocido) se loguean, no bloquean la
   * emisión — ver parseReferencias en xml-parser.utils.ts.
   */
  private _extraerReferenciasExternas(
    docs: FetchedDocument[],
  ): ReferenciaExternaParaMensaje[] {
    const referencias: ReferenciaExternaParaMensaje[] = [];
    for (const doc of docs) {
      const parsed = parseReferencias(doc.rawXml);
      referencias.push(...parsed.referencias);
      for (const descartada of parsed.descartadas) {
        this.logger.warn(
          `Referencia descartada al extraer OC/HES: tipo=${descartada.tipo} — ${descartada.motivo}`,
        );
      }
    }
    return referencias;
  }

  private async _emitir(factura: Factura): Promise<ResultadoDTE> {
    const guias = await this._cargarGuiasParaEmision(
      factura.empkey,
      factura.gfackey,
    );
    // Se fetchea el XML de todas las guías (no solo la primera): las
    // referencias a OC/HES pueden venir en cualquiera de ellas.
    const docs = await Promise.all(
      guias.map((g) => this.xmlParserService.fetchDocument(g.guifilepath)),
    );
    const { receptor } = docs[0];
    const modoDetalle = await this._resolveModoDetalle(
      factura.empkey,
      factura.gclirut,
    );
    const detalleItems =
      modoDetalle === 'POR_PRODUCTO'
        ? this._construirDetalleItems(guias, docs)
        : [];
    const referenciasExternas = this._extraerReferenciasExternas(docs);
    // Enternet exige que la fecha de emisión sea la de hoy — no la de creación de la proforma
    // (que puede ser de días/meses atrás si quedó pendiente de aprobación).
    factura.gfacfecha = todayInChile();
    const { mensaje } = buildMensaje({
      transaccionIdL: `${factura.empkey}-${factura.gfackey}`,
      fechaDocumento: factura.gfacfecha,
      diasCredito: 30,
      rutEmisor: factura.rutEmisor,
      rutCliente: receptor.rutReceptor,
      nombreCliente: receptor.razonSocial,
      direccion: receptor.dirRecep,
      comuna: receptor.cmnaRecep,
      ciudad: receptor.ciudadRecep,
      giro: receptor.giroRecep,
      guias: guias.map((g) => ({
        folio: g.guifolio,
        fechaEmision: g.guifechaemision,
        totneto: g.guitotneto,
        totiva: g.guitotiva,
        totdoc: g.guitotdoc,
        totexento: g.guitotexento,
      })),
      modoDetalle,
      detalleItems,
      referenciasExternas,
    });
    const rutUsuario =
      this.configService.get<string>('FACTURACION_RUT_USUARIO') ??
      factura.rutEmisor;
    return this.backofficeAdapterService.emitirDte({
      RutEmisor: normalizeToXml(toCsvRut(factura.rutEmisor)),
      RutUsuario: rutUsuario,
      TransaccionIdL: `${factura.empkey}-${factura.gfackey}`,
      Mensaje: mensaje,
    });
  }

  // ─── Preview Mensaje V5 ─────────────────────────────────────────────────────

  async previewMensaje(
    empkey: string,
    gfackey: string,
  ): Promise<MensajeResult> {
    const factura = await this.facturaRepository.findOne({
      where: { empkey, gfackey, esProforma: true },
    });
    if (!factura)
      throw new NotFoundException(`Proforma no encontrada: gfackey=${gfackey}`);

    const guias = await this._cargarGuiasParaEmision(empkey, gfackey);
    const docs = await Promise.all(
      guias.map((g) => this.xmlParserService.fetchDocument(g.guifilepath)),
    );
    const { receptor } = docs[0];
    const modoDetalle = await this._resolveModoDetalle(empkey, factura.gclirut);
    const detalleItems =
      modoDetalle === 'POR_PRODUCTO'
        ? this._construirDetalleItems(guias, docs)
        : [];
    const referenciasExternas = this._extraerReferenciasExternas(docs);

    return buildMensaje({
      transaccionIdL: `${empkey}-${gfackey}`,
      fechaDocumento: todayInChile(),
      diasCredito: 30,
      rutEmisor: factura.rutEmisor,
      rutCliente: receptor.rutReceptor,
      nombreCliente: receptor.razonSocial,
      direccion: receptor.dirRecep,
      comuna: receptor.cmnaRecep,
      ciudad: receptor.ciudadRecep,
      giro: receptor.giroRecep,
      guias: guias.map((g) => ({
        folio: g.guifolio,
        fechaEmision: g.guifechaemision,
        totneto: g.guitotneto,
        totiva: g.guitotiva,
        totdoc: g.guitotdoc,
        totexento: g.guitotexento,
      })),
      modoDetalle,
      detalleItems,
      referenciasExternas,
    });
  }

  // ─── Helpers privados ───────────────────────────────────────────────────────

  private async insertProforma(
    empkey: string,
    gclirut: string,
    reglaidl: string,
    guias: {
      guitipo: number;
      guifolio: string;
      guitotneto: string;
      guitotiva: string;
      guitotdoc: string;
    }[],
    rutEmisor: string,
  ): Promise<string> {
    return this.dataSource.transaction(async (manager) => {
      // gfacfolio: siguiente secuencial por tenant
      const [folioRow] = await manager.query<{ max: string }[]>(
        `SELECT COALESCE(MAX(gfacfolio::bigint), 0)::text AS max FROM gde.factura WHERE empkey = $1`,
        [empkey],
      );
      const folio = (parseInt(folioRow.max) + 1).toString();

      // Totales desde guías
      const totNeto = guias
        .reduce((s, g) => s + BigInt(g.guitotneto), 0n)
        .toString();
      const totIva = guias
        .reduce((s, g) => s + BigInt(g.guitotiva), 0n)
        .toString();
      const totDoc = guias
        .reduce((s, g) => s + BigInt(g.guitotdoc), 0n)
        .toString();
      const today = todayInChile();

      const [facturaRow] = await manager.query<{ gfackey: string }[]>(
        `INSERT INTO gde.factura
           (empkey, gfactipo, gfacfolio, gfacestadoregistro, gfacestadoanulacion,
            gfacfecha, gfactotneto, gfactotexento, gfactotiva, gfactotimpuestos,
            gfactotdoc, gfacfilepath, gfacloteidl, gclirut, estado, es_proforma, reglaidl, rut_emisor)
         VALUES ($1,'33',$2,'','',$3,$4,'0',$5,'0',$6,'','',$7,'BORRADOR',true,$8,$9)
         RETURNING gfackey`,
        [
          empkey,
          folio,
          today,
          totNeto,
          totIva,
          totDoc,
          normalizeToXml(toCsvRut(gclirut)),
          reglaidl,
          rutEmisor,
        ],
      );
      const gfackey = facturaRow.gfackey.toString();

      for (const guia of guias) {
        await manager.query(
          `INSERT INTO gde.facturaguias (empkey, gfackey, guitipo, guifolio) VALUES ($1,$2,$3,$4)`,
          [empkey, gfackey, guia.guitipo, guia.guifolio],
        );
      }

      return gfackey;
    });
  }

  private async buildProformaDto(factura: Factura): Promise<ProformaDto> {
    const [row] = await this.dataSource.query<
      {
        cantidad_guias: string;
        monto_total: string;
        valor_agrupador: string | null;
      }[]
    >(
      `SELECT COUNT(fg.guifolio)::text AS cantidad_guias,
              COALESCE(SUM(g.guitotdoc::bigint), 0)::text AS monto_total,
              MIN(g.guivaloragrupador) AS valor_agrupador
       FROM gde.facturaguias fg
       LEFT JOIN gde.guia g ON g.empkey = fg.empkey AND g.guitipo = fg.guitipo AND g.guifolio = fg.guifolio
       WHERE fg.empkey = $1 AND fg.gfackey = $2`,
      [factura.empkey, factura.gfackey],
    );

    const cliente = await this.clienteRepository.findOne({
      where: {
        empkey: factura.empkey,
        gclirut: normalizeToXml(toCsvRut(factura.gclirut)),
      },
    });

    const regla = factura.reglaidl
      ? await this.reglaRepository.findOne({
          where: { reglaidl: factura.reglaidl },
        })
      : null;

    return {
      id: factura.gfackey,
      folio: factura.gfacfolio,
      cliente: { rut: factura.gclirut, nombre: cliente?.gclinom ?? '' },
      regla: {
        id: factura.reglaidl ?? '',
        descripcion: regla?.regladescripcion ?? '',
      },
      cantidadGuias: parseInt(row.cantidad_guias),
      montoTotal: row.monto_total,
      estado: factura.estado,
      fecha: factura.gfacfecha,
      valorAgrupador: row.valor_agrupador ?? '_sin_regla',
      folioSii: factura.gfacfolioSii ?? null,
      linkPdf: factura.gfaclinkPdf ?? null,
      linkXml: factura.gfaclinkXml ?? null,
    };
  }
}
