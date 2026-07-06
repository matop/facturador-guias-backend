// Pure XML parsing functions — no side effects, no HTTP, no DI.
// XmlParserService delegates here; these can be tested directly with string fixtures.

export interface EmisorData {
  rutEmisor: string;
  razonSocial: string;
  giro: string;
  telefono: string;
  acteco: string;
}

export interface ReceptorData {
  rutReceptor: string;
  razonSocial: string;
  cdgIntRecep: string;
  contacto: string;
  dirRecep: string;
  cmnaRecep: string;
  ciudadRecep: string;
  giroRecep: string;
}

export interface DetalleItem {
  nmbItem: string;
  dscItem: string;
  kvMap: Map<string, string>;
  qtyItem: string;
  prcItem: string;
  indExe: string;
  montoItem: string;
  codigo: string;
}

export interface DteDocument {
  emisor: EmisorData;
  receptor: ReceptorData;
  detalle: DetalleItem[];
}

export interface FetchedDocument extends DteDocument {
  rawXml: string;
}

export function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`));
  if (!match) throw new Error(`Tag <${tag}> no encontrado en el XML del DTE`);
  return match[1].trim();
}

export function extractTagOptional(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`));
  return match ? match[1].trim() : '';
}

export function extractTagMultiline(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : '';
}

export function parseKv(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.substring(0, colonIdx).trim();
    const value = line.substring(colonIdx + 1).trim();
    if (key) map.set(key, value);
  }
  return map;
}

export function parseDetalle(xml: string): DetalleItem[] {
  const result: DetalleItem[] = [];
  const pattern = /<Detalle>([\s\S]*?)<\/Detalle>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const block = match[1];
    const nmbItem = extractTagOptional(block, 'NmbItem');
    const dscItem = extractTagMultiline(block, 'DscItem');
    const qtyItem = extractTagOptional(block, 'QtyItem');
    const prcItem = extractTagOptional(block, 'PrcItem');
    const indExe = extractTagOptional(block, 'IndExe');
    const montoItem = extractTagOptional(block, 'MontoItem');
    const codigo = extractTagOptional(block, 'VlrCodigo');
    result.push({
      nmbItem,
      dscItem,
      kvMap: parseKv(dscItem),
      qtyItem,
      prcItem,
      indExe,
      montoItem,
      codigo,
    });
  }
  return result;
}

export type TipoReferenciaExterna = '801' | 'HES';

export interface ReferenciaExterna {
  tipo: TipoReferenciaExterna;
  folio: string;
  fecha: string; // YYYY-MM-DD, tal como viene en <FchRef>
}

export interface ReferenciaDescartada {
  tipo: string;
  motivo: string;
}

export interface ParseReferenciasResult {
  referencias: ReferenciaExterna[];
  descartadas: ReferenciaDescartada[];
}

const TIPOS_REFERENCIA_EXTERNA: TipoReferenciaExterna[] = ['801', 'HES'];

function esTipoReferenciaExterna(tipo: string): tipo is TipoReferenciaExterna {
  return (TIPOS_REFERENCIA_EXTERNA as string[]).includes(tipo);
}

/**
 * Extrae las referencias a OC (801) y HES embebidas en el <Referencia> del
 * XML de una guía. Fase 1: asume 1:1 (una sola OC y una sola HES por guía) —
 * si hay más de una del mismo tipo, toma la primera ocurrencia y sigue.
 *
 * Tipos no reconocidos (ni 801 ni HES, incluye 52) se ignoran y se reportan
 * en `descartadas` en vez de bloquear — es responsabilidad del caller loguear.
 * Un 801/HES reconocido pero con FolioRef o FchRef faltante SÍ bloquea (throw),
 * ya que es dato incompleto en un tipo de interés (ver PRD-referencias-oc-hes.md).
 */
export function parseReferencias(xml: string): ParseReferenciasResult {
  const referencias: ReferenciaExterna[] = [];
  const descartadas: ReferenciaDescartada[] = [];
  const vistos = new Set<TipoReferenciaExterna>();

  const pattern = /<Referencia>([\s\S]*?)<\/Referencia>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const block = match[1];
    const tipo = extractTagOptional(block, 'TpoDocRef');

    if (!esTipoReferenciaExterna(tipo)) {
      descartadas.push({
        tipo,
        motivo: `TpoDocRef "${tipo}" no reconocido (se esperaba 801 o HES)`,
      });
      continue;
    }

    if (vistos.has(tipo)) continue; // fallback fase 1: solo la primera ocurrencia
    vistos.add(tipo);

    const folio = extractTagOptional(block, 'FolioRef');
    if (!folio) {
      throw new Error(`Referencia ${tipo} sin <FolioRef> en el XML de la guía`);
    }

    const fecha = extractTagOptional(block, 'FchRef');
    if (!fecha) {
      throw new Error(
        `Referencia ${tipo} folio ${folio} sin <FchRef> en el XML de la guía`,
      );
    }

    referencias.push({ tipo, folio, fecha });
  }

  return { referencias, descartadas };
}

export function parseDocument(xml: string): DteDocument {
  return {
    emisor: {
      rutEmisor: extractTag(xml, 'RUTEmisor'),
      razonSocial: extractTag(xml, 'RznSoc'),
      giro: extractTag(xml, 'GiroEmis'),
      telefono: extractTagOptional(xml, 'Telefono'),
      acteco: extractTagOptional(xml, 'Acteco'),
    },
    receptor: {
      rutReceptor: extractTag(xml, 'RUTRecep'),
      razonSocial: extractTag(xml, 'RznSocRecep'),
      cdgIntRecep: extractTagOptional(xml, 'CdgIntRecep'),
      contacto: extractTagOptional(xml, 'Contacto'),
      dirRecep: extractTagOptional(xml, 'DirRecep'),
      cmnaRecep: extractTagOptional(xml, 'CmnaRecep'),
      ciudadRecep: extractTagOptional(xml, 'CiudadRecep'),
      giroRecep: extractTagOptional(xml, 'GiroRecep'),
    },
    detalle: parseDetalle(xml),
  };
}
