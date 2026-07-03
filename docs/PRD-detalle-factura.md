# PRD — Modo de Detalle y Referencia de Factura (DTE Tipo 33)

## Problem Statement

Hoy, al emitir una Factura (DTE tipo 33) a partir de una Proforma, el `<Detalle>` del mensaje se construye con una lógica obsoleta (Modo 1/2 por umbral de 20 guías, con un ladrillo de texto en `GLOSA`). Esta lógica no permite describir el contenido facturado por producto cuando el cliente lo necesita, no soporta el modelo de referencias por volumen que exige Enternet V5, y usa texto descriptivo en vez de códigos oficiales SII en las referencias — lo que es incorrecto frente al SII.

El operador necesita que la Factura describa correctamente lo que se está cobrando (por guía o por producto, según cada cliente) y que las referencias a guías/OC/HES en el DTE usen el formato y los códigos oficiales, sin importar cuántas guías tenga la proforma.

## Solution

Reemplazar la construcción de `<Detalle>` y `<Referencia>` del `Mensaje` V5 por 4 casos de Detalle (S.G., Por Producto–Precio Constante, Por Producto–Precio Variable, Global) y un modelo de 3 niveles de Referencia, ambos derivados de datos ya presentes en el XML de cada guía (DTE 52) y de una configuración nueva por Cliente (Modo de Detalle). El Modo 1/2 actual y el bloque `GLOSA` quedan obsoletos.

---

## User Stories

1. Como operador, quiero que una factura de un cliente sin Modo de Detalle configurado muestre una sola línea "Facturación según guías: f{folio1}, f{folio2}, ...", para mantener el comportamiento simple por defecto.
2. Como operador, quiero poder configurar el Modo de Detalle "Por Producto" para un cliente, para que sus facturas describan los productos/servicios facturados en vez de solo listar guías.
3. Como operador, quiero que en Modo Por Producto las líneas con el mismo producto y mismo precio en todas las guías de la proforma se agrupen en una sola línea con la cantidad sumada, para no repetir información.
4. Como operador, quiero que en Modo Por Producto, si el precio de un producto varía entre guías (ej. combustibles), la línea muestre el rango de fechas en que el precio se mantuvo constante, para reflejar correctamente los distintos precios cobrados.
5. Como operador, quiero que cada línea de producto en Modo Por Producto incluya el código de producto (`CODIGO`), para que el cliente pueda conciliar contra su propio sistema.
6. Como operador, quiero que las líneas de comentario/observación que algunos emisores incluyen en el `<Detalle>` de la guía (sin código, sin monto) NO aparezcan como producto en la factura agrupada, para no generar líneas falsas o vacías.
7. Como operador, quiero que un producto exento y el mismo producto afecto a IVA nunca se mezclen en una sola línea de detalle, para mantener la distinción tributaria correcta frente al SII.
8. Como operador, quiero que cuando el total de referencias (guías + OC + HES) de una proforma sea mayor a 40, la factura cambie automáticamente a modo de referencia Global, sin importar el Modo de Detalle configurado, para no exceder los límites del formato Enternet V5.
9. Como operador, quiero que el texto del modo Global ("Segun Guias: {folio1} {folio2} ...") sea visualmente distinto al de S.G., para que sea reconocible que se trata de una facturación masiva.
10. Como operador, quiero que cada guía referenciada en el DTE factura use el código oficial SII `52` (no el texto "Guía de Despacho Electrónica"), para que el documento sea válido frente al SII.
11. Como operador, quiero que cada Orden de Compra referenciada en las guías de la proforma aparezca deduplicada por folio en la factura, con el código oficial `801` y la razón "Orden de Compra", para evitar referencias repetidas.
12. Como operador, quiero que cada Hoja de Entrada de Servicios (HES) referenciada en las guías de la proforma aparezca deduplicada por folio en la factura, con el código `HES` y la razón "Hoja de Entrada de Servicios", para evitar referencias repetidas.
13. Como operador, quiero que una proforma en Modo Por Producto con más de 143 guías se divida automáticamente en múltiples proformas del mismo agrupador al generarse, para no exceder el límite de paginación del `<Detalle>` del DTE.
14. Como operador, quiero que una proforma en Modo S.G. nunca se divida por volumen de guías, ya que su `<Detalle>` es siempre una sola línea, para no fragmentar innecesariamente la facturación de clientes con muchas guías.
15. Como desarrollador, quiero que el Modo de Detalle sea una propiedad del Cliente, independiente de la Regla de agrupación activa, para poder cambiar una sin afectar la otra.
16. Como desarrollador, quiero que `QtyItem`, `PrcItem` y el código de producto se extraigan junto al resto de los campos de `DetalleItem` en el parser de XML existente, para mantener un único lugar de parsing del `<Detalle>` de la guía.

---

## Implementation Decisions

### Modo de Detalle — configuración

- Columna nueva en `gde.clientes` (no en `ReglaConfig`, no en la Proforma). Ver ADR-0001. Default `NULL` = **S.G.**
- Valores configurables explícitamente: **S.G.** y **Por Producto**. Precio Constante/Variable son subcasos derivados en runtime de Por Producto, no configurables aparte. **Global** es un override automático por volumen, nunca elegible por el operador.

### S.G. (Según Guías) — default

- Una sola línea de `<Detalle>`: `"Facturación según guías: f{folio1}, f{folio2}, ..."`.
- Folios abreviados a máximo 6 dígitos, prefijo `f`, separados por coma.
- Nunca se desborda — siempre 1 línea, sin importar cuántas guías tenga la proforma. No aplica split por volumen.

### Por Producto — agrupación

- Clave de agrupación: **`NmbItem` + `IndExe`** (no solo `NmbItem`). Nunca se mezclan montos exentos y afectos del mismo producto en una sola línea — es una distinción tributaria SII, no de presentación.
- **Precio Constante**: aplica cuando el mismo `NmbItem`+`IndExe` tiene el mismo `PrcItem` en todas las guías de la proforma. Se suma `QtyItem`. Línea incluye `CODIGO`.
- **Precio Variable**: se activa en runtime cuando `PrcItem` cambia para el mismo `NmbItem`+`IndExe` (caso típico: combustibles). Agrupa por rango de fechas donde el precio no varía. Texto: `"{NmbItem} ({fechaInicio} al {fechaFin})"`, fechas en `dd-MM-yyyy` (mismo formato que `formatDateDash`). Tramos de 1 día repiten la misma fecha en ambos lados, sin caso especial.
- **`CODIGO`**: se extrae de `<CdgItem><VlrCodigo>` del XML de la guía (DTE 52) — confirmado contra XML real (`<TpoCodigo>INTERNO</TpoCodigo><VlrCodigo>RSL00001448</VlrCodigo>`). No forma parte de la clave de agrupación: si el mismo `NmbItem`+`IndExe` trae distinto `CODIGO` entre guías (inconsistencia de datos del emisor), se usa el de la primera ocurrencia, sin bloquear la emisión.
- **Líneas no-producto**: cualquier `<Detalle>` de la guía sin `<CdgItem>` **Y** con `MontoItem=0` se excluye del agrupado — no se suma ni se muestra. Criterio estructural, no por texto (visto en la práctica como `NmbItem="OBSERVACIONES"`, `IndExe=2`, texto libre en `DscItem`, pero no se filtra por ese nombre literal).

### Global (overflow automático)

- Se activa cuando el **total de referencias** (1 por guía + OC deduplicadas + HES deduplicadas) supera 40 — sin importar el Modo de Detalle configurado. El umbral es siempre sobre total de referencias, nunca sobre "cantidad de guías" como unidad separada (una proforma con pocas guías pero muchas OC/HES también puede activar Global).
- Texto propio, distinto a S.G.: `"Segun Guias: {folio1} {folio2} ..."` — folios completos, separados por espacio, sin abreviar y sin prefijo `f`.
- Las `<Referencia>` usan una referencia global (lista de folios como texto) en vez de referencias individuales.

### Modelo de 3 niveles de Referencia (independiente del Modo de Detalle)

1. **Total de refs ≤ 40**: modo refs individuales — una `<Referencia>` por guía + OC dedup + HES dedup.
2. **Total de refs > 40**: modo Global — lista de folios como texto + OC + HES.
3. **> 143 guías** (esta unidad es "cantidad de guías", no total de refs — viene de la paginación del `<Detalle>`, no de las referencias): en Por Producto, split automático en `generar` → múltiples proformas de máx. 143 guías cada una, mismo agrupador. En S.G., no aplica split — la `<Referencia>` sigue en modo Global sin tope superior conocido.

### Pipe-format de Referencia (Mensaje V5)

Cada referencia: `TIPO DE REFERENCIA` (código oficial — `52`, `801`, o código libre `HES`; nunca texto descriptivo), `FOLIO` (C18), `FECHA` (dd/mm/aaaa), `RAZON REFERENCIA` (C90, opcional).

- Guía individual: `5:|52|{folio}|{fecha}` — sin razón, el tipo ya es autoexplicativo.
- OC: `5:|801|{folio}|{fecha}|Orden de Compra`.
- HES: `5:|HES|{folio}|{fecha}|Hoja de Entrada de Servicios`.

**Migración:** el código legacy actual escribe `"Guia de Despacho Electronica"` (texto) en vez del código `52` para referencias de guía — debe migrar al implementar este diseño.

### Cambios de parsing — `xml-parser.utils.ts`

- Extender `DetalleItem` con `qtyItem`, `prcItem`, `codigo`, `indExe` (mismo lugar que `nmbItem`/`dscItem` — sin parsing aislado en el builder).
- Nueva función pura `parseReferencias(xml)` para extraer el bloque `<Referencia>` de la guía (OC, HES) — necesaria para el nivel 1/2 de Referencia.

### Cambios de construcción — `mensaje-builder.ts`

- Implementar los 4 casos de Detalle + lógica de 3 niveles de Referencia + split por volumen.
- Eliminar Modo 1/2 actual (umbral de 20 guías) y el bloque `GLOSA` de tabla.
- Migrar referencias de guía al código oficial `52`.

### Cambios de orquestación — `facturas.service.ts`

- Adaptar `_emitir()` para pasar los nuevos datos (Modo de Detalle del cliente, referencias parseadas) al builder.

---

## Testing Decisions

- Buen test: verifica comportamiento observable (el `Mensaje` string resultante: líneas `<Detalle>`/`<Referencia>` generadas, no la implementación interna del agrupador).
- **Capa nueva**: fixtures XML end-to-end (ej. `mensaje-builder.integration.spec.ts`) que cubran los 4 casos de Detalle + los 3 niveles de Referencia con datos reales de guía — sin reemplazar los unit tests aislados existentes de parser y builder.
- Casos a cubrir explícitamente:
  - S.G. con folios > 6 dígitos (verificar truncado correcto).
  - Por Producto–Precio Constante: mismo producto en 2+ guías, mismo precio, IndExe igual.
  - Por Producto: mismo `NmbItem` con `IndExe` distinto → 2 líneas separadas.
  - Por Producto–Precio Variable: mismo producto con 2+ tramos de precio, incluyendo un tramo de 1 día.
  - Línea no-producto (sin `CdgItem`, `MontoItem=0`) excluida del agrupado.
  - `CODIGO` inconsistente entre guías para el mismo `NmbItem`+`IndExe` → usa el de la primera ocurrencia.
  - Total de refs exactamente en el borde de 40 (40 vs 41) → individual vs Global.
  - Split en 143 guías exactas vs 144 guías (Por Producto).
  - Referencia de OC y HES deduplicadas por folio.
- Prior art: `src/facturas/*.spec.ts`, `src/reglas/grouping.service.spec.ts` — mocks de repos TypeORM vía NestJS testing module. Parsers y builder son funciones/clases puras, testeables sin DI.

---

## Out of Scope

- **OPEN-1**: confirmar que el XML de guía (DTE 52, de entrada) usa el código `HES` en su propio `<TpoDocRef>` — sin XML real con `<Referencia>` HES disponible aún. Se avanza con la hipótesis (alta confianza, código `HES` ya confirmado en la spec de salida Enternet V5); se confirma en implementación/QA cuando aparezca un caso real.
- **OPEN-5**: uso de `GLOSA` del encabezado en el diseño nuevo — queda sin definir, no bloquea.
- Traslado del texto de `DscItem` de líneas no-producto a alguna referencia/observación del DTE factura — pendiente de consulta con dev senior.
- Casos borde adicionales no explorados en esta sesión (ej. orden de evaluación cuando coinciden Por Producto + split + Global simultáneamente) — a grillar en sesión futura.

---

## Further Notes

- Nada de este diseño está implementado todavía (verificado contra código real 2026-06-30): `mensaje-builder.ts` sigue en el sistema Modo 1/2 con `GLOSA`; `xml-parser.utils.ts` no tiene `parseReferencias` ni `QtyItem`/`PrcItem`/`codigo`. Es 100% greenfield.
- Glosario completo y razones de cada decisión en `CONTEXT.md`. Decisión de ubicación del Modo de Detalle en `docs/adr/0001-modo-detalle-vive-en-cliente.md`.
- XML de ejemplo usado para confirmar `CODIGO` y descubrir el patrón de línea no-producto: `EMISB-QASC-FOL410-86520.xml` (emisor San Damaso, RUT `968880004`).
