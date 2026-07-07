# PRD — Referencias Externas de Guía en Factura (OC / HES)

## Problem Statement

Hoy, el modelo de Referencia del DTE tipo 33 (`docs/PRD-detalle-factura.md`, Casos 1-4) solo referencia guías (código `52`). El diseño ya contempla que las Órdenes de Compra (código `801`) y las Hojas de Entrada de Servicio (`HES`) embebidas en el `<Referencia>` del XML de cada guía deben propagarse, deduplicadas, al DTE factura — pero esa pieza nunca se implementó: `xml-parser.utils.ts` no tiene `parseReferencias`, y `mensaje-builder.ts` no emite ningún código `801`/`HES`.

Las OC son muy usadas a nivel de guías de despacho — sin esta pieza, el DTE factura omite referencias que el cliente (comprador) espera ver para conciliar contra su propia orden de compra o proceso de recepción de servicios.

## Solution

Extender el pipeline de Detalle+Referencia (`docs/PRD-detalle-factura.md`) con: (1) un parser `parseReferencias(xml)` que extrae OC/HES del XML de guía, (2) deduplicación por `(tipo, folio)`, y (3) su inclusión en el modelo de 3 niveles de Referencia ya implementado (individual ≤40 / Global >40 / split >143), tratando OC/HES como parte del mismo "total de referencias" que ya cuenta las guías.

Feature unificada — "Referencias Externas de Guía" — cubre OC y HES con el mismo mecanismo, aunque HES tiene una confirmación pendiente adicional (ver Out of Scope).

---

## Decisiones de diseño

### Multiplicidad — fase 1: 1:1

Se asume que cada guía trae **una sola OC y una sola HES** (cardinalidad 0 o 1 por tipo). Si una guía real trae más de una del mismo tipo, `parseReferencias` toma **la primera ocurrencia** y sigue — no bloquea la emisión. Mismo criterio ya usado para `CODIGO` inconsistente en modo Por Producto (`docs/PRD-detalle-factura.md`).

La multiplicidad N (varias OC/HES por guía) queda **fuera de esta fase** — se diseña después de validar 1:1 contra una emisión real en QA, igual que se hizo con el umbral de 40 (medido en 20, subido a 40 tras confirmación real).

### Deduplicación — clave `(tipo, folio)`

No deduplicar por folio solo: una OC y una HES pueden compartir número de folio (numeraciones de terceros, independientes entre sí). La clave de dedup es siempre el par `(tipo, folio)`.

### Texto de `RAZON REFERENCIA` — fijo, no tomado del XML de entrada

El texto de la 4ta columna del pipe-format (`"Orden de Compra"` / `"Hoja de Entrada de Servicios"`) es **siempre fijo**, ignorando cualquier `<RazonRef>` que traiga el XML de guía de entrada. Motivos: consistencia con el resto del diseño (guías tipo `52` tampoco llevan razón), evita reventar el pipe-format con texto libre de terceros sin sanitizar (ej. caracteres `|`).

### Conversión de formato de fecha

- Entrada (`<FchRef>` en XML de guía, estándar SII): `YYYY-MM-DD`.
- Salida (columna 3 del pipe-format `5:|`): `dd/mm/aaaa`.
- Reusar/generalizar el helper de formato de fecha ya usado para las referencias de guía tipo `52` (no crear un tercer formateador de fecha distinto del ya existente para Precio Variable, que usa `dd-MM-yyyy`).

### Interacción con el umbral de 40 refs / split de 143

OC y HES cuentan hacia el **total de referencias** que determina el modo individual (≤40) vs Global (>40) — ya definido en `docs/PRD-detalle-factura.md`, sin cambios de diseño aquí. Lo nuevo es que el total ya no es solo "cantidad de guías": una proforma con pocas guías pero varias OC/HES también puede caer en modo Global.

### Interacción con Modo Global simultáneo (resuelto en sesión 2026-07-06)

Cuando el total (guías + OC deduplicadas + HES deduplicadas) supera 40 y se activa Global, **OC/HES colapsan junto con las guías** en el mismo campo `DESCRIPCION ADICIONAL` del Detalle — no se listan aparte en líneas `5:|` individuales, ni se ignoran/descartan.

Formato exacto: `"{folios guía espacio-separados} | OC: {folios OC espacio-separados} | HES: {folios HES espacio-separados}"`. Si no hay OC (o no hay HES), se omite ese segmento completo — no queda `"| OC: "` colgando vacío. Mismo separador (espacio) dentro de cada segmento que el ya confirmado para guías.

Se descartó la alternativa de listar OC/HES individuales vía `4:|`/`5:|` aun con guías en modo Global, porque el mecanismo de Referencia confirmado y funcionando contra Enternet QA (emisión real, folioSii=411211) es **omitir el bloque `<Referencia>` por completo** en modo Global (ver `docs/detalle-factura.md`, sección Caso 4). Reintroducir líneas `5:|` solo para OC/HES arriesgaría reproducir el bug de parser de Enternet ya confirmado (genera bloques `<Referencia>` contradictorios), sin necesidad — el propio umbral de 40 ya asume que "demasiadas referencias para listar individualmente" aplica al conjunto completo, no solo a guías.

### Manejo de errores de XML malformado (resuelto en sesión 2026-07-06)

Dos escenarios distintos, con tratamiento distinto:

1. **`<TpoDocRef>` no reconocido** (ni `52`, ni `801`, ni `HES`) — incluye tanto códigos SII válidos pero fuera de alcance de este parser (ej. la propia guía referenciando otra guía/documento tipo `52`) como códigos genuinamente desconocidos. Se **ignora, no bloquea la emisión**, pero se reporta: `parseReferencias` sigue siendo puro (sin side effects, mismo criterio que el resto de `xml-parser.utils.ts`) y devuelve también las ocurrencias descartadas (`{ tipo, motivo }` o similar) junto al resultado principal. Es el **caller** (`XmlParserService` o `facturas.service.ts`, con acceso a `Logger` de Nest) quien decide loguear. No hay caso especial para `52` — se trata igual que cualquier otro tipo no-OC/HES, sin distinguir "SII válido pero irrelevante" de "desconocido".
2. **`801`/`HES` reconocido pero con `<FolioRef>` o `<FchRef>` faltante** (dato incompleto en un tipo que sí es de interés) — se **propaga un error (throw)**, bloqueando la emisión de esa factura. A diferencia del resto de la política MVP tolerante de esta fase (multiplicidad, `CODIGO` inconsistente), acá se prefiere frenar y forzar revisión manual del XML de origen antes de facturar una referencia incompleta — decisión explícita del usuario, más estricta que la alternativa de descartar la ocurrencia y seguir.

---

## Testing Decisions

### Builder programático (nuevo patrón en el repo)

Hoy `xml-parser.service.spec.ts` arma XML de test como strings literales inline, caso por caso — no existe builder reusable. Para esta feature se introduce:

- `buildGuiaXml(opts)` — arma XML crudo de guía con `<Referencia>` parametrizable (0, 1 o N bloques OC/HES/52 para casos borde). Vive en `src/xml/xml-test-builders.ts`, junto al código que testea (mismo criterio de organización por feature que `src/reglas/parsers/`).
- `buildDteDocument(opts)` (o nombre a definir en implementación) — arma el objeto ya parseado (`DteDocument`/`DetalleItem[]` + referencias), para tests de `mensaje-builder` que no necesitan pasar por XML real.

Ambos comparten archivo para que otros specs (ej. `facturas.service.spec.ts`, si necesita simular guías con OC) no reinventen un tercer helper.

### Matriz de casos a cubrir

- Guía sin `<Referencia>` → `parseReferencias` retorna vacío.
- Guía con solo OC, solo HES, ambas, y ninguna.
- Guía con 2+ OC (fallback: toma la primera, no bloquea) — mismo para HES.
- Dedup: dos guías de la misma proforma con la misma OC (mismo folio) → una sola referencia en el DTE factura.
- Dedup no colapsa OC folio `123` con HES folio `123` (clave `(tipo, folio)`, no folio solo).
- Conversión de fecha `YYYY-MM-DD` → `dd/mm/aaaa`, incluyendo mes/día de un dígito (`2026-01-05` → `05/01/2026`, caso de padding).
- `RAZON REFERENCIA` siempre el texto fijo, sin importar qué traiga `<RazonRef>` en el XML de entrada.
- `<TpoDocRef>` no reconocido (ej. `52` dentro del `<Referencia>` de la guía, o un código inventado) → se ignora, no aparece en el resultado, y sí aparece en la lista de descartadas devuelta por `parseReferencias`.
- `801`/`HES` sin `<FolioRef>` → throw. `801`/`HES` sin `<FchRef>` → throw. Mensaje de error debe identificar tipo y folio (si hay) para facilitar debugging.

### Test aparte para interacción con umbral 40/143

**Archivo de test separado** (no mezclado con los specs existentes de Detalle/Referencia) para los casos borde donde OC/HES empujan el total de referencias sobre 40 sin que la cantidad de guías por sí sola lo haga. Ej.:
- 38 guías + 1 OC + 1 HES = 40 refs exactas → modo individual.
- 38 guías + 2 OC + 1 HES = 41 refs → dispara modo Global.
- Global con OC y HES presentes → `DESCRIPCION ADICIONAL` = `"{folios guía} | OC: {folios OC} | HES: {folios HES}"`.
- Global con guías > 40 pero sin ninguna OC/HES → sin segmentos `OC:`/`HES:` (formato ya confirmado en Caso 4, sin regresión).
- Global con OC pero sin HES (o viceversa) → solo el segmento correspondiente aparece, sin `"| HES: "` vacío colgando.

### Plan de validación con dato real (opción combinada, sin bloquear desarrollo)

No existe todavía ningún XML real de guía con OC/HES poblada. Plan:
1. Implementar y testear con datos 100% sintéticos (builder de arriba) — no bloquea el desarrollo.
2. En paralelo, buscar un XML real de un cliente que sí traiga OC/HES (mismo mecanismo usado para confirmar `CODIGO` con el XML de San Damaso, o los 5 XML de Caso 4) — para confirmar que el parseo de entrada coincide con la práctica real, no solo con el estándar SII.
3. Validar el envío completo (`801`/`HES` en el DTE de salida) con una emisión real contra Enternet QA, mismo patrón que Caso 4.

---

## Out of Scope

- **Multiplicidad N** (varias OC/varias HES por la misma guía) — fase 2, posterior a validar 1:1 en QA real.
- **Confirmación del código `HES` en el XML de guía de entrada** (DTE 52 real, `<TpoDocRef>`): el código `HES` está confirmado en la spec de **salida** de Enternet V5 (pipe-format y formato XML alternativo), pero no hay XML real de entrada que lo confirme todavía. Se avanza con la hipótesis (ver Plan de validación arriba).
- Uso de `<RazonRef>` del XML de entrada como texto de referencia (se descartó a favor de texto fijo, ver Decisiones de diseño) — no revisar salvo pedido explícito de un cliente.

---

## Further Notes

- Nada de esto está implementado todavía (sesión de planificación 2026-07-03, greenfield; sesión de grill 2026-07-06 resolvió los dos ángulos pendientes del handoff, ver más abajo). Continúa el patrón de `docs/PRD-detalle-factura.md`.
- Glosario actualizado en `CONTEXT.md` (secciones OC / HES / Referencia de Guía en Factura / Manejo de errores de `parseReferencias`) con la clave de dedup `(tipo, folio)`, el criterio de fase 1 (1:1 + fallback "primera ocurrencia"), la interacción con Global, y el manejo de XML malformado.
- ⚠️ **Nota de contexto (2026-07-06), no bloqueante para esta feature pero relevante**: el mecanismo de Referencia en modo Global sigue sin estar cerrado del lado de Enternet — hay un bloque EXPERIMENTAL activo en `mensaje-builder.ts` (retesteando `ACCION REFERENCIA=5`) bloqueado esperando que Enternet corrija un bug confirmado de su parser. El diseño de esta sección (OC/HES colapsan en `DESCRIPCION ADICIONAL`) se apoya en el mecanismo YA CONFIRMADO (sin bloque `<Referencia>`), no en el experimental — no depende de que ese bug se resuelva.

## Handoff anterior (resuelto en sesión 2026-07-06)

Esta sección documentaba los dos ángulos que quedaron sin resolver tras la sesión de planificación 2026-07-03. Ambos se resolvieron en la sesión de grill del 2026-07-06 (ver "Interacción con Modo Global simultáneo" y "Manejo de errores de XML malformado" arriba). Se deja el registro por trazabilidad:

1. ~~Interacción con Modo de Detalle Global simultáneo~~ → resuelto: OC/HES colapsan junto con las guías en `DESCRIPCION ADICIONAL`.
2. ~~Casos de error de parseo XML malformado~~ → resuelto: tipo desconocido se ignora+reporta, dato incompleto en tipo reconocido bloquea (throw).

Sigue pendiente (no bloqueante, en paralelo): conseguir un XML real de un cliente con OC/HES poblada para confirmar el parseo de entrada (ver "Plan de validación con dato real" arriba).

## Próximo paso

Con ambos ángulos resueltos, el diseño está completo para empezar implementación con TDD (mismo patrón que Casos 1-4: `parseReferencias` primero con datos sintéticos, luego integración en `mensaje-builder.ts`, luego validación con emisión real en QA).

### Estado (sesión 2026-07-06, TDD)

✅ Hechos: `parseReferencias(xml)` en `xml-parser.utils.ts` con todos los casos de la matriz de arriba (dedup 1:1 por tipo, tipo no reconocido → descartada, `801`/`HES` incompleto → throw); integración en `mensaje-builder.ts` (`MensajeInput.referenciasExternas`, dedup por `(tipo, folio)`, líneas individuales `5:|801|.../5:|HES|...` con RAZON REFERENCIA fija, colapso en `DESCRIPCION ADICIONAL` cuando el total supera 40). Builder `buildGuiaXml` en `src/xml/xml-test-builders.ts`. Suite completa: 232/234 verdes (2 skips preexistentes de Caso 4, no relacionados).

✅ Wireado en `facturas.service.ts` y validado con emisión real contra Enternet QA (folioSii=411212/411213/411214) — ver `docs/ESTADO.md` para el detalle sesión por sesión (fix de separador, hallazgo isGlobal×chunking).

Pendiente (no bloqueante): conseguir un XML real de cliente con OC/HES poblada para confirmar el parseo de entrada (sigue sin existir, ver "Plan de validación con dato real").
