import type { TipoReferenciaExterna } from '../../xml/xml-parser.utils.js';

/** Discriminated union por `fn` — una entrada por familia de reglas. */
export type ReglaConfig =
  | { fn: 'extraeTagLista'; reglaTags: string[] }
  | { fn: 'extraeReferenciaPorTipo'; tiposReferencia: TipoReferenciaExterna[] };
