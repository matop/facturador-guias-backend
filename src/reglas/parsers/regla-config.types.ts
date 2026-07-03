/** Discriminated union por `fn` — una entrada por familia de reglas. */
export type ReglaConfig =
  | { fn: 'extraeTagLista'; reglaTags: string[] };
