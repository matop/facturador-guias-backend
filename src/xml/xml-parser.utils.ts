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
