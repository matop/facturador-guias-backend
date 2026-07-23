// MensajeBuilder — genera el string Mensaje en formato Enternet V5 (pipe-delimited).
// Módulo puro: sin side-effects, sin NestJS DI, sin HTTP. Testeable en aislamiento.

import type {
  TipoReferenciaExterna,
  ReferenciaExterna,
} from '../xml/xml-parser.utils.js';

export type { TipoReferenciaExterna };

export interface GuiaParaMensaje {
  folio: string;
  fechaEmision: string; // YYYY-MM-DD
  totneto: string;
  totiva: string;
  totdoc: string;
  totexento: string;
}

export type ModoDetalle = 'SG' | 'POR_PRODUCTO';

/**
 * Umbral de referencias individuales. Sobre este número, el Detalle colapsa
 * a una sola línea "Segun Guias:" y la Referencia pasa a modo Global — ver
 * CONTEXT.md "Modo de Detalle de Factura" / "Split de Proforma por Volumen".
 * Cuenta guías + OC deduplicadas + HES deduplicadas (total de referencias).
 */
export const MAX_REFERENCIAS_INDIVIDUALES = 40;

/** Referencia a OC/HES extraída de una guía — ver parseReferencias en xml-parser.utils.ts. */
export type ReferenciaExternaParaMensaje = ReferenciaExterna;

const RAZON_REFERENCIA_EXTERNA: Record<TipoReferenciaExterna, string> = {
  '801': 'Orden de Compra',
  HES: 'Hoja de Entrada de Servicios',
};

/**
 * Deduplica por clave (tipo, folio) — una OC y una HES pueden compartir folio
 * (numeraciones de terceros independientes), por eso no se deduplica por folio
 * solo. Preserva el orden de primera aparición.
 */
function dedupeReferenciasExternas(
  referencias: ReferenciaExternaParaMensaje[],
): {
  oc: ReferenciaExternaParaMensaje[];
  hes: ReferenciaExternaParaMensaje[];
} {
  const vistos = new Set<string>();
  const oc: ReferenciaExternaParaMensaje[] = [];
  const hes: ReferenciaExternaParaMensaje[] = [];

  for (const r of referencias) {
    const key = `${r.tipo}|${r.folio}`;
    if (vistos.has(key)) continue;
    vistos.add(key);
    (r.tipo === '801' ? oc : hes).push(r);
  }

  return { oc, hes };
}

/**
 * Header `4:|` + líneas `5:|` de OC (801) y HES para el bloque de Referencia.
 * Compartido por el modo individual y el Global: ambos listan las OC/HES
 * deduplicadas con `RAZON REFERENCIA` como 4to campo. Devuelve el flag
 * `tieneReferenciasExternas` para que el caller sepa si las líneas `5:|` de
 * guía (tipo 52) deben declarar ese 4to campo vacío — Enternet exige que todas
 * las líneas `5:|` de un bloque tengan el mismo número de campos que su header
 * `4:|`, o rechaza con [ParseErr001] (confirmado en QA 2026-07-06).
 */
function buildReferenciasExternasLines(
  oc: ReferenciaExternaParaMensaje[],
  hes: ReferenciaExternaParaMensaje[],
  columnaExtra?: string,
): { header: string; lineas: string[]; tieneReferenciasExternas: boolean } {
  const tieneReferenciasExternas = oc.length > 0 || hes.length > 0;
  const columnas = ['TIPO DE REFERENCIA', 'FOLIO', 'FECHA'];
  if (tieneReferenciasExternas) columnas.push('RAZON REFERENCIA');
  if (columnaExtra) columnas.push(columnaExtra);
  const header = `4:|${columnas.join('|')}`;
  // Cuando el caller pide una columna extra (ej. CODIGO REFERENCIA para la
  // referencia global), las líneas 5:| de OC/HES deben declarar ese campo
  // vacío para no romper la regla de consistencia de nº de campos de Enternet.
  const sufijo = columnaExtra ? '|' : '';
  const lineas = [
    ...oc.map(
      (r) =>
        `5:|801|${r.folio}|${formatDateSlash(r.fecha)}|${RAZON_REFERENCIA_EXTERNA['801']}${sufijo}`,
    ),
    ...hes.map(
      (r) =>
        `5:|HES|${r.folio}|${formatDateSlash(r.fecha)}|${RAZON_REFERENCIA_EXTERNA['HES']}${sufijo}`,
    ),
  ];
  return { header, lineas, tieneReferenciasExternas };
}

export interface DetalleItemParaMensaje {
  nmbItem: string;
  qtyItem: string;
  prcItem: string;
  codigo: string;
  indExe: string;
  montoItem: string;
  fecha: string; // YYYY-MM-DD — viene de la guía contenedora, no del XML del item
}

export interface MensajeInput {
  transaccionIdL: string;
  fechaDocumento: string; // YYYY-MM-DD
  diasCredito: number; // default 30 — TODO: dependerá de criterio emisor/receptor
  rutEmisor: string; // cualquier formato (con/sin puntos y guión)
  rutCliente: string; // cualquier formato (con/sin puntos y guión)
  nombreCliente: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  giro: string;
  guias: GuiaParaMensaje[];
  modoDetalle?: ModoDetalle; // default 'SG'
  detalleItems?: DetalleItemParaMensaje[]; // ignorado salvo POR_PRODUCTO
  referenciasExternas?: ReferenciaExternaParaMensaje[]; // OC/HES, ya extraídas de las guías, sin deduplicar
}

export interface MensajeResult {
  mensaje: string;
}

// ─── Helpers de fecha ──────────────────────────────────────────────────────────

/** YYYY-MM-DD → dd/MM/yyyy  (formato Enternet encabezado y referencias) */
export function formatDateSlash(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/** YYYY-MM-DD → dd-MM-yyyy */
export function formatDateDash(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${y}`;
}

/** Suma diasCredito días a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD */
export function addDias(dateStr: string, dias: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().substring(0, 10);
}

// ─── Helpers de RUT ────────────────────────────────────────────────────────────

/**
 * RUT EMISOR en el Mensaje V5: sin puntos ni guión.
 * Ej: "76407930-2" → "764079302" | "76.407.930-2" → "764079302"
 */
export function formatRutEmisor(rut: string): string {
  return rut.replace(/\./g, '').replace(/-/g, '');
}

/**
 * RUT CLIENTE en el Mensaje V5: con puntos y guión.
 * Ej: "78041840-0" → "78.041.840-0" | "780418400" → "78.041.840-0"
 */
export function formatRutCliente(rut: string): string {
  const clean = rut.replace(/\./g, '').replace(/-/g, '');
  const verif = clean.slice(-1);
  const digits = clean.slice(0, -1);
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted}-${verif}`;
}

// ─── Detalle Por Producto (Precio Constante / Precio Variable) ─────────────────

interface ItemGrupo {
  prcItem: string;
  qtyItem: string;
  montoItem: string;
  codigo: string;
  fecha: string;
}

interface GrupoPorProducto {
  nmbItem: string;
  indExe: string;
  items: ItemGrupo[];
}

const sumaQty = (items: ItemGrupo[]): number =>
  items.reduce((s, it) => s + Number(it.qtyItem), 0);

const sumaMonto = (items: ItemGrupo[]): string =>
  items.reduce((s, it) => s + BigInt(it.montoItem), 0n).toString();

/**
 * Agrupa DetalleItem por NmbItem+IndExe y suma QtyItem/MontoItem.
 * Si el PrcItem es constante dentro del grupo → 1 línea (incluye CODIGO).
 * Si varía → 1 línea por tramo de fechas con precio constante (sin CODIGO),
 * ordenando primero los items por fecha (Caso 3 — Precio Variable).
 */
export function buildDetallePorProducto(
  items: DetalleItemParaMensaje[],
): string[] {
  const grupos = new Map<string, GrupoPorProducto>();

  for (const item of items) {
    const esNoProducto = item.codigo === '' && item.montoItem === '0';
    if (esNoProducto) continue;

    const key = `${item.nmbItem}|${item.indExe}`;
    const itemGrupo: ItemGrupo = {
      prcItem: item.prcItem,
      qtyItem: item.qtyItem,
      montoItem: item.montoItem,
      codigo: item.codigo,
      fecha: item.fecha,
    };
    const existente = grupos.get(key);
    if (!existente) {
      grupos.set(key, {
        nmbItem: item.nmbItem,
        indExe: item.indExe,
        items: [itemGrupo],
      });
    } else {
      existente.items.push(itemGrupo);
    }
  }

  let n = 1;
  const lines: string[] = [];
  for (const g of grupos.values()) {
    const tipoItem = g.indExe && g.indExe !== '0' ? 'EXENTO' : 'AFECTO';
    const ordenados = [...g.items].sort((a, b) =>
      a.fecha.localeCompare(b.fecha),
    );
    const precioConstante = ordenados.every(
      (it) => it.prcItem === ordenados[0].prcItem,
    );

    if (precioConstante) {
      lines.push(
        `3:|${n}|${tipoItem}|${g.nmbItem} (${ordenados[0].codigo})|${sumaQty(ordenados)}|${ordenados[0].prcItem}|0|${sumaMonto(ordenados)}`,
      );
      n++;
      continue;
    }

    let tramo: ItemGrupo[] = [ordenados[0]];
    for (let i = 1; i <= ordenados.length; i++) {
      const item = ordenados[i];
      if (item && item.prcItem === tramo[0].prcItem) {
        tramo.push(item);
        continue;
      }
      const fechaIni = formatDateDash(tramo[0].fecha);
      const fechaFin = formatDateDash(tramo[tramo.length - 1].fecha);
      lines.push(
        `3:|${n}|${tipoItem}|${g.nmbItem} (${fechaIni} al ${fechaFin})|${sumaQty(tramo)}|${tramo[0].prcItem}|0|${sumaMonto(tramo)}`,
      );
      n++;
      if (item) tramo = [item];
    }
  }
  return lines;
}

// ─── Builder principal ─────────────────────────────────────────────────────────

export function buildMensaje(input: MensajeInput): MensajeResult {
  const {
    transaccionIdL,
    fechaDocumento,
    diasCredito,
    rutEmisor,
    rutCliente,
    nombreCliente,
    direccion,
    comuna,
    ciudad,
    giro,
    guias,
    modoDetalle,
    detalleItems,
    referenciasExternas,
  } = input;

  if (guias.length === 0) throw new Error('La proforma no tiene guías');

  const { oc, hes } = dedupeReferenciasExternas(referenciasExternas ?? []);

  const fechaVenc = addDias(fechaDocumento, diasCredito);

  const sumNetoN = guias.reduce((s, g) => s + BigInt(g.totneto), 0n);
  const sumExentoN = guias.reduce((s, g) => s + BigInt(g.totexento), 0n);

  const sumNeto = sumNetoN.toString();
  const sumExento = sumExentoN.toString();
  // Enternet valida IVA == round(Neto_total * 19%); sumar los totiva ya
  // redondeados por guía acumula drift de redondeo con muchas guías.
  const sumIvaN = BigInt(Math.round(Number(sumNetoN) * 0.19));
  const sumIva = sumIvaN.toString();
  // MONTO TOTAL se deriva de los totales ya recalculados, no de sumar
  // los totdoc por guía (que arrastran el mismo drift que totiva).
  const sumDoc = (sumNetoN + sumIvaN + sumExentoN).toString();

  // Período de facturación (S.G.): derivado de la fecha de la primera guía
  const periodo = guias[0].fechaEmision.substring(0, 7);

  const totalReferencias = guias.length + oc.length + hes.length;
  const isGlobal = totalReferencias > MAX_REFERENCIAS_INDIVIDUALES;

  const lines: string[] = [];

  // ── Encabezado ──
  lines.push(`1:|IDENTIFICADOR UNICO TRANSACCION|${transaccionIdL}`);
  lines.push(`1:|TIPO DOCUMENTO|Factura Electronica`);
  lines.push(`1:|RUT EMISOR|${formatRutEmisor(rutEmisor)}`);
  lines.push(`1:|FOLIO TRIBUTARIO DOCUMENTO|0`);
  lines.push(`1:|FECHA DE DOCUMENTO|${formatDateSlash(fechaDocumento)}`);
  lines.push(`1:|FECHA DE VENCIMIENTO|${formatDateSlash(fechaVenc)}`);
  lines.push(`1:|FORMA DE PAGO DESCRIPCION|Credito`);
  lines.push(`1:|RUT CLIENTE|${formatRutCliente(rutCliente)}`);
  lines.push(`1:|NOMBRE CLIENTE|${nombreCliente}`);
  lines.push(`1:|DIRECCION|${direccion}`);
  lines.push(`1:|COMUNA|${comuna}`);
  lines.push(`1:|CIUDAD|${ciudad}`);
  lines.push(`1:|GIRO|${giro}`);

  // ── Detalle ──
  // El campo DESCRIPCION ADICIONAL solo se declara en modo Global (lleva la
  // lista de folios) — se omite en los demás modos para no tocar el formato
  // ya confirmado contra Enternet QA en Casos 1-3.
  lines.push(
    isGlobal
      ? `2:|ITEM|TIPO ITEM|DESCRIPCION|CANTIDAD|PRECIO|DESCUENTO MONTO|TOTAL LINEA|DESCRIPCION ADICIONAL`
      : `2:|ITEM|TIPO ITEM|DESCRIPCION|CANTIDAD|PRECIO|DESCUENTO MONTO|TOTAL LINEA`,
  );
  if (isGlobal) {
    // OC/HES ya NO se embeben acá: viajan como <Referencia> reales
    // (`5:|801|…`/`5:|HES|…`) en el bloque de Referencia Global tras los
    // Totales (D1-A del plan PLAN-referencias-oc-hes-en-global.md — su lugar
    // semánticamente correcto, sin duplicar la info). DESCRIPCION ADICIONAL
    // lleva solo los folios de guía (siempre hay al menos una).
    // El separador es espacio, NUNCA "|": el Mensaje V5 completo es
    // pipe-delimited, así que un "|" dentro de este campo se cuenta como
    // columna extra y Enternet rechaza con [ParseErr001] (confirmado en QA
    // 2026-07-06, ver referencias-oc-hes.md).
    const descripcionAdicional = guias.map((g) => g.folio).join(' ');
    lines.push(
      `3:|1|AFECTO|Segun Guias:|1|${sumNeto}|0|${sumNeto}|${descripcionAdicional}`,
    );
  } else if (modoDetalle === 'POR_PRODUCTO') {
    lines.push(...buildDetallePorProducto(detalleItems ?? []));
  } else {
    lines.push(
      `3:|1|AFECTO|Facturación según guías período ${periodo}|1|${sumNeto}|0|${sumNeto}`,
    );
  }

  // ── Referencias ──
  // Global: las líneas 4:|/5:| de referencia individual por guía se omiten
  // acá — en Global va el bloque de Referencia Global (header TIPO/FOLIO/ACCION
  // REFERENCIA + OC/HES como 5:|801|/5:|HES| + la línea 5:|52|0|{fecha} de la
  // referencia global de guías) después de los Totales, ver bloque
  // `if (isGlobal)` más abajo. Antes de que Enternet corrigiera su parser
  // (2026-07-08) este bloque se omitía por completo y los folios viajaban solo
  // en DESCRIPCION ADICIONAL del Detalle; ver
  // enternet-v5-referencia-global-en-progreso.md para el historial de
  // intentos fallidos contra QA 2026-07-03.
  if (!isGlobal) {
    // OC (801) > HES > una línea 52 por guía. El header y las líneas de OC/HES
    // se arman con el helper compartido (mismo patrón que el bloque Global);
    // cuando hay OC/HES, TODAS las líneas 5:| —incluidas las de guía— declaran
    // el 4to campo (RAZON REFERENCIA, vacío para guías) por la regla de
    // consistencia de campos de Enternet ([ParseErr001]).
    const { header, lineas, tieneReferenciasExternas } =
      buildReferenciasExternasLines(oc, hes);
    lines.push(header, ...lineas);
    for (const g of guias) {
      const linea = `5:|52|${g.folio}|${formatDateSlash(g.fechaEmision)}`;
      lines.push(tieneReferenciasExternas ? `${linea}|` : linea);
    }
  }

  // ── Totales ──
  lines.push(`1:|MONTO EXENTO|${sumExento}`);
  lines.push(`1:|MONTO NETO|${sumNeto}`);
  lines.push(`1:|IMPUESTO IVA|${sumIva}`);
  lines.push(`1:|MONTO TOTAL|${sumDoc}`);

  // Referencia Global (IndGlobal=1): hasta 2026-07-21 se armaba con un trío
  // de encabezado 1:|TIPO/FOLIO/ACCION REFERENCIA, que Enternet terminaba
  // desdoblando en dos <Referencia> separadas en el XML de salida (ver
  // docs/emision-dte-historial.md, "Reintento 2026-07-14" y PR #47: no se
  // pudo evitar el duplicado con ese mecanismo). Info nueva de Enternet
  // (2026-07-22, parser corregido): la referencia global va como una línea
  // 5:| normal del mismo bloque 4:|/5:| de OC/HES, agregando una columna
  // CODIGO REFERENCIA=5 (mismo código que antes llevaba ACCION REFERENCIA)
  // en vez del header separado — sin duplicar el bloque. Hipótesis A a
  // validar con emisión real en QA antes de confirmar como definitiva.
  if (isGlobal) {
    // Tope SII: máx 40 <Referencia> por DTE. En Global las guías colapsan en
    // UNA referencia global (52 / folio 0), así que el conteo relevante es
    // OC + HES + esa global. OC/HES suelen ser pocas; si aun así superan el
    // tope, frenamos con error claro en vez de truncar en silencio (D2 del
    // plan).
    if (oc.length + hes.length + 1 > MAX_REFERENCIAS_INDIVIDUALES) {
      throw new Error(
        `Modo Global: ${oc.length} OC + ${hes.length} HES + 1 referencia global = ${oc.length + hes.length + 1} excede el tope SII de ${MAX_REFERENCIAS_INDIVIDUALES} <Referencia> por DTE`,
      );
    }
    // OC/HES van como <Referencia> individuales en el mismo bloque 4:|/5:|
    // que la referencia global de guías (52/0); todas comparten la columna
    // CODIGO REFERENCIA, vacía salvo en la línea de la referencia global.
    const { header, lineas, tieneReferenciasExternas } =
      buildReferenciasExternasLines(oc, hes, 'CODIGO REFERENCIA');
    lines.push(header, ...lineas);
    const globalLine = tieneReferenciasExternas
      ? `5:|52|0|${formatDateSlash(fechaDocumento)}||5`
      : `5:|52|0|${formatDateSlash(fechaDocumento)}|5`;
    lines.push(globalLine);
  }

  return { mensaje: lines.join('\r\n') };
}
