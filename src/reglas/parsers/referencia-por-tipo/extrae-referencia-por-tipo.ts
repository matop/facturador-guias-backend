import {
  parseReferencias,
  type TipoReferenciaExterna,
} from '../../../xml/xml-parser.utils.js';

/**
 * Función pura que extrae, por guía, el folio de cada tipo de referencia
 * externa pedido (OC='801', HES o ambos) y los concatena con ';' en el orden
 * de `tiposReferencia` (no en el orden en que aparecen en el XML).
 * Si ninguno de los tipos pedidos está presente, devuelve string vacío.
 *
 * `parseReferencias` lanza cuando un 801/HES reconocido viene sin FolioRef o
 * FchRef porque bloquear la emisión (Mensaje V5) es correcto ahí, pero esta
 * función corre en el pipeline de agrupación, donde ningún handler del
 * REGLA_REGISTRY lanza — se atrapa el throw y se trata como "sin esa referencia".
 */
export function extraeReferenciaPorTipo(
  tiposReferencia: TipoReferenciaExterna[],
  xml: string,
): string {
  let referencias: ReturnType<typeof parseReferencias>['referencias'];
  try {
    referencias = parseReferencias(xml).referencias;
  } catch {
    referencias = [];
  }

  return tiposReferencia
    .map((tipo) => referencias.find((r) => r.tipo === tipo)?.folio)
    .filter((folio): folio is string => Boolean(folio))
    .join(';');
}
