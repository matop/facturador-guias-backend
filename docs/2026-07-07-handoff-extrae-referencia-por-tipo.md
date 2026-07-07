# Handoff — Implementar `extraeReferenciaPorTipo` en el REGLA_REGISTRY

Sesión de grilling ya cerrada. Diseño confirmado por el usuario. Esta sesión nueva debe ir directo a `/implement` (TDD → wireo → code-review → commit), sin volver a discutir el diseño salvo que aparezca un hecho nuevo del código.

## Contexto / motivación

`extraeTagLista` (`src/reglas/parsers/tag-list/`) es la única `fn` del `REGLA_REGISTRY` hoy — hace un regex plano `<tag>valor</tag>` sobre el XML completo. Funciona para tags únicos (`CmnaRecep`, `RznSocRecep`), pero se demostró con un spec descartable que es **ambiguo/incorrecto** para agrupar por OC: el folio de la OC vive en `<FolioRef>` dentro de un bloque `<Referencia>`, y ese mismo nombre de tag se repite para HES (y otras referencias). `extraeTagLista(['FolioRef'], xml)` toma el primer match del XML completo sin mirar el `<TpoDocRef>` hermano — si la HES viene antes que la OC en el XML, devuelve el folio de la HES creyendo que es la OC. Bug confirmado en vivo (no es hipótesis).

Ya existe `parseReferencias(xml)` en `src/xml/xml-parser.utils.ts` que sí es *block-aware* (empareja `TpoDocRef`+`FolioRef`+`FchRef` dentro de cada `<Referencia>`, fase 1 asume 1:1 OC+HES por guía — ver `docs/PRD-referencias-oc-hes.md` líneas 19-23), pero solo está wireada a `mensaje-builder.ts` (emisión), no al pipeline de agrupación (`GroupingService` / `REGLA_REGISTRY`).

El encargado del proyecto ya aprobó implementar una nueva función para agrupar por OC/HES.

## Diseño confirmado (no re-discutir)

1. **Nuevo tipo en `ReglaConfig`** (`src/reglas/parsers/regla-config.types.ts`):
   ```ts
   export type ReglaConfig =
     | { fn: 'extraeTagLista'; reglaTags: string[] }
     | { fn: 'extraeReferenciaPorTipo'; tiposReferencia: TipoReferenciaExterna[] };
   ```
   `TipoReferenciaExterna` (`'801' | 'HES'`) ya está exportado desde `src/xml/xml-parser.utils.ts` — reusar, no redefinir.

2. **Genérico por tipo, no hardcodeado a OC** — mismo mecanismo sirve para OC solo, HES solo, o ambos juntos, según lo que el cliente configure en `tiposReferencia` (dato en la tabla `regla`, no código nuevo):
   - Solo OC → `tiposReferencia: ['801']`
   - Solo HES → `tiposReferencia: ['HES']`
   - Ambos → `tiposReferencia: ['801', 'HES']` → concatena los folios encontrados con `;` (mismo criterio que `extraeTagLista` con múltiples tags), ej. `"OC-1000;HES-2000"`.
   - El orden de concatenación sigue el orden de `tiposReferencia` en la config, no el orden en que aparecen en el XML.
   - Si no encuentra ninguno de los tipos pedidos → `''` (mismo criterio que `extraeTagLista`).

3. **Manejo de errores**: la nueva función llama a `parseReferencias(xml)` para el parseo (no duplicar la lógica de bloques), pero **atrapa el throw** que `parseReferencias` lanza cuando un 801/HES reconocido no trae `FolioRef` o `FchRef`. Ese caso se trata igual que "sin esa referencia" (no aporta al resultado) — no debe tumbar el agrupamiento completo. Razón: `parseReferencias` fue diseñado para bloquear la *emisión* (Mensaje V5), pero el `GroupingService` corre en otra etapa del pipeline donde ningún handler del registry lanza excepción (todos devuelven `string | null`).

4. **Wireo en `REGLA_REGISTRY`** (`src/reglas/parsers/regla-registry.ts`): mismo patrón que el handler de `extraeTagLista` — `if (config.fn !== 'extraeReferenciaPorTipo') return null;` luego llama la función pura y aplica `valor || null`.

5. **Ubicación del código**: carpeta propia siguiendo el patrón de `tag-list/`, ej. `src/reglas/parsers/referencia-por-tipo/extrae-referencia-por-tipo.ts` + su spec al lado.

6. **Alcance**: la función opera **por guía** (igual que `extraeTagLista` hoy). El agrupamiento en la misma proforma/factura es consecuencia de que varias guías compartan el mismo valor de agrupador — no hay lógica nueva "por factura". Consistente con el scope MVP de 1 OC + 1 HES por guía ya en el PRD.

## Plan de implementación (TDD, en ese orden)

1. Spec de la función pura (`extrae-referencia-por-tipo.spec.ts`) cubriendo: solo OC, solo HES, OC+HES, ninguno, tipo repetido en `tiposReferencia`, y el caso del bug (801/HES mal formado en el XML → no revienta, contribuye `''`/se omite).
2. Implementar la función pura hasta que el spec pase.
3. Extender `ReglaConfig` (paso 1 del diseño).
4. Wireo en `REGLA_REGISTRY` + extender `regla-registry.spec.ts` (mismo patrón que ya está probado para `extraeTagLista`).
5. `/code-review` (Standards + Spec) antes de commitear.

## Archivos clave a tocar

- `src/reglas/parsers/regla-config.types.ts`
- `src/reglas/parsers/regla-registry.ts` + `regla-registry.spec.ts`
- `src/reglas/parsers/referencia-por-tipo/extrae-referencia-por-tipo.ts` (nuevo) + spec
- `src/xml/xml-parser.utils.ts` (solo lectura — reusar `parseReferencias` y `TipoReferenciaExterna`, no modificar)

## Qué NO hacer

- No reabrir la discusión de diseño (ya confirmada por el usuario en la sesión de grilling previa).
- No implementar multiplicidad N (varias OC/HES por guía) — eso es fase 2, fuera de scope.
- No tocar `mensaje-builder.ts` ni el flujo de emisión — este cambio es solo para el pipeline de agrupación (`GroupingService`).
