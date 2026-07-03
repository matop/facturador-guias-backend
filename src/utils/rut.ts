/**
 * RUT format normalization.
 * CSV (backoffice): no hyphen, no leading zeros → '77004250K', '781707902'
 * XML (DTE):        hyphen before DV              → '77004250-K', '78170790-2'
 *
 * normalizeToXml: CSV → XML format (idempotent — skips if already has hyphen)
 */
export type CsvRut = string & { readonly _brand: 'CsvRut' }
export type XmlRut = string & { readonly _brand: 'XmlRut' }

export function toCsvRut(s: string): CsvRut { return s as CsvRut }

export function normalizeToXml(rut: CsvRut): XmlRut {
  if (rut.includes('-')) return rut as unknown as XmlRut;
  const s = rut.replace(/^0+/, '');
  if (s.length < 2) return rut as unknown as XmlRut;
  return (s.slice(0, -1) + '-' + s.slice(-1)) as XmlRut;
}
