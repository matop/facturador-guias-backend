# Resumen de avance — reunión con dev senior (2026-07-07)

Fuente de verdad detallada: `docs/PRD-referencias-oc-hes.md` y `docs/PRD-detalle-factura.md`. Este documento es el resumen ejecutivo para la reunión, no reemplaza los PRD.

## Cerrado y confirmado en QA real (folioSii real, no solo tests unitarios)

| Feature | folioSii |
|---|---|
| Caso 1 (S.G. — Según Guías) | — (validado con dev senior sobre PDF real, sin emisión con folio dedicado) |
| Caso 2+3 combinado (Por Producto) | 411208 |
| Caso 2 solo (Precio Constante) | 411209 |
| Caso 3 solo (Precio Variable) | 411210 |
| Caso 4 (Global, >40 guías) | 411211 |
| OC+HES combinado (PR #9) | 411212 |
| OC solo (39 guías, umbral) | 411213 |
| HES solo (39 guías, umbral) | 411214 |

PR #9 (`parseReferencias` OC/HES + integración en `mensaje-builder.ts`) ya está **"Ready for review"**, no draft.

## Decisión que necesitamos del dev senior

El umbral `isGlobal` (`guías + OC + HES > 40`) usa la misma constante que el chunking de proformas grandes (`MAX_GUIAS_POR_FACTURA = 40`). Un chunk de exactamente 40 guías + cualquier OC/HES cae sin aviso en modo Global, que hoy sigue roto del lado de Enternet (ver siguiente punto).

Opciones a decidir:
1. Separar las dos constantes (umbral de Global ≠ tamaño de chunk).
2. Subir el umbral de Global.
3. Aceptar el riesgo tal cual está documentado (ya aceptado explícitamente al marcar el PR #9 como ready).

## Bloqueado — no es un bug nuestro

Modo Global (>40 refs) con OC/HES falla con `[FirmaErr002] ... '-  -' is not a valid value for 'date'` — bug confirmado del lado del parser de Enternet (bloque EXPERIMENTAL con `folio=0`). El separador `' - '` que sí era responsabilidad nuestra (causaba `[ParseErr001]` por un `|` de más en `DESCRIPCION ADICIONAL`) ya se corrigió y se confirmó en QA. Depende 100% de que Enternet corrija su parser — ver `enternet-v5-referencia-global-en-progreso` en memoria de sesión.

## Pendiente aceptado, no bloqueante

Falta un XML real de un cliente con OC/HES poblada para confirmar el parseo de **entrada** contra datos reales — hoy solo probado con sintéticos (`scripts/test-oc-hes-sintetico.js`, `scripts/test-oc-hes-chunking-sintetico.js`). El mecanismo de **salida** (Mensaje V5 → XML final) ya está 100% confirmado en QA.

## Demo sugerida (Postman actualizado)

Collection: `guias-middleware.postman_collection.json`, carpeta **"Referencias OC/HES (PR #9)"**:
- `GET preview-mensaje ejemplo OC+HES (gfackey=108)` — muestra el Mensaje V5 con las líneas `5:|801|...` y `5:|HES|...` de una proforma ya emitida en QA.
- `PATCH aprobar proforma con OC/HES (seed nueva)` — para demo en vivo: correr `node scripts/test-oc-hes-sintetico.js --reset`, tomar el gfackey que imprime el script, y aprobar contra QA real.
