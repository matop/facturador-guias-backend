# Plan — Emitir OC > HES en la zona de Referencia también en modo Global

Fecha de creación: 2026-07-09. Rama: `feat-referencias-oc-hes-en-global`.
Fuentes de verdad: `CONTEXT.md` (glosario "Modo de Detalle" / "Referencia de Guía en Factura" / "Pipe-format de Referencia"), `src/mensaje/mensaje-builder.ts`, `docs/PRD-referencias-oc-hes.md`, memoria persistente del agente.

> **Este doc es un HANDOFF.** Está pensado para que una sesión nueva lo lea, lo revise (¿el diseño es correcto?) y lo implemente con TDD. La sección **"Handoff — qué hacer"** al final es el guion de ejecución.

---

## 1. Qué pidió el usuario

En las **emisiones globales** (Caso 4 — overflow > 40 referencias), agregar en la **zona de referencia** del DTE las referencias **OC > HES > Ref Guías**, igual que como ya funcionan en los casos individuales (≤ 40 refs). Hoy, en Global, esas referencias **solo aparecen embebidas como texto en el Detalle** (`DESCRIPCION ADICIONAL`), no como `<Referencia>` reales.

### Evidencia (emisión global real observada 2026-07-09)

```
3:|1|AFECTO|Segun Guias:|1|60000|0|60000|OC: 555001 - 996300 996301 996302 ... 996359
1:|TIPO DOC REFERENCIA|52
1:|FOLIO DOC REFERENCIA|0
1:|ACCION REFERENCIA|5
4:|TIPO DE REFERENCIA|FOLIO|FECHA
5:|52|0|09/07/2026
```

- La **OC 555001** viaja embebida en `DESCRIPCION ADICIONAL` del detalle (`OC: 555001 - <folios guía>`).
- La zona de referencia (`4:|`/`5:|` tras Totales) **solo** tiene la referencia global `5:|52|0|09/07/2026`.
- No hay línea `5:|801|555001|...` (OC como referencia real). Eso es lo que falta.

---

## 2. Estado actual del código (`src/mensaje/mensaje-builder.ts`)

`buildMensaje` bifurca por `isGlobal = (guias + oc + hes) > MAX_REFERENCIAS_INDIVIDUALES (40)`:

| | Detalle (`3:|`) | Zona de Referencia (`4:|`/`5:|`) |
|---|---|---|
| **Individual (≤40)** | 1 línea S.G. o N líneas Por Producto (sin `DESCRIPCION ADICIONAL`) | **OC > HES > guías** — líneas `5:|801/HES/52` reales (líneas 337-363) |
| **Global (>40)** | 1 línea `Segun Guias:` con `DESCRIPCION ADICIONAL` = `OC: … - HES: … - <folios guía>` (líneas 303-319) | **solo** referencia global `5:|52|0|{fecha}` (líneas 377-383) |

El bloque individual (líneas 337-363) **ya hace exactamente lo que se pide**, incluyendo la regla de consistencia de campos de Enternet (ver §4). El bloque Global (líneas 377-383) hoy solo emite la referencia global.

---

## 3. Restricción dura: en Global las guías NO se pueden listar una por una

Global se activa **precisamente porque** el total de referencias supera 40. Ese umbral coincide con el tope del SII de **40 `<Referencia>` por DTE** (XSD `RefLineas`, maxOccurs=40 — **CONFIRMAR con `consult-sii-norms`/XSD**; en los docs actuales el 40 se documenta como umbral empírico "medido en 20, subido a 40", conviene amarrar que es el tope SII y no solo un límite de PDF).

Consecuencia: **"Ref Guías" en modo Global = la referencia global única `5:|52|0|{fecha}` (IndGlobal=1)**, que representa TODAS las guías. No se puede —ni se debe— emitir una `5:|52|folio|` por guía en Global (serían >40, viola el tope).

Por lo tanto lo único que hay que **agregar** en Global son las **OC (801) y HES**, que son pocas (deduplicadas por `(tipo,folio)`), como referencias reales antes de la referencia global. El orden pedido **OC > HES > Ref Guías** se mapea a:

```
5:|801|{folio}|{fecha}|Orden de Compra          ← OC (cada una deduplicada)
5:|HES|{folio}|{fecha}|Hoja de Entrada de Servicios   ← HES (cada una deduplicada)
5:|52|0|{fechaDocumento}[|]                      ← referencia global (guías), ya existente
```

### Semántica SII de IndGlobal (para el review)
`IndGlobal=1` es un atributo **por `<Referencia>`**, no del documento entero. Un DTE puede mezclar libremente referencias globales (guías, `52`/folio 0) con referencias individuales (OC `801`, HES) en el mismo bloque, mientras el total de `<Referencia>` no exceda 40. → **CONFIRMAR con `consult-sii-norms`** que la coexistencia global + individual es válida en el XSD del DTE 33 (no debería haber problema, pero es load-bearing).

---

## 4. Gotcha de formato Enternet — regla de consistencia de campos (NO omitir)

Enternet valida que el nº de campos de cada línea `5:|` coincida **exactamente** con las etiquetas declaradas en el `4:|` de su bloque, o rechaza con `[ParseErr001]` (confirmado en QA 2026-07-06, ver `referencias-oc-hes.md` y comentario en `mensaje-builder.ts:338-343`).

Las líneas OC/HES agregan un 4to campo `RAZON REFERENCIA`. Entonces, cuando haya al menos una OC o HES en Global:
- El header debe ser `4:|TIPO DE REFERENCIA|FOLIO|FECHA|RAZON REFERENCIA`.
- **TODAS** las líneas `5:|` del bloque —incluida la global `5:|52|0|{fecha}`— deben declarar el 4to campo (vacío para la global): `5:|52|0|{fecha}|`.
- Si NO hay OC ni HES → el bloque Global queda **idéntico al de hoy** (`4:|TIPO DE REFERENCIA|FOLIO|FECHA` + `5:|52|0|{fecha}`), sin regresión.

Esta es exactamente la misma lógica que el bloque individual ya aplica con `tieneReferenciasExternas` (líneas 343-362). **Reutilizar ese patrón**, no reinventarlo.

---

## 5. Decisiones de diseño (con recomendación)

### D1 — ¿Se quitan OC/HES del `DESCRIPCION ADICIONAL` del Detalle al pasarlas a la zona de referencia?
- **Opción A (recomendada):** quitar los segmentos `OC:`/`HES:` del `DESCRIPCION ADICIONAL` y dejar ahí **solo los folios de guía**. Las OC/HES pasan a ser `<Referencia>` reales (su lugar semánticamente correcto), sin duplicar la info. Coincide con el pedido "ahora solo se están mostrando en el detalle" → se mueven, no se duplican.
- **Opción B:** mantenerlas también en el detalle (redundancia visual en el PDF). Más conservador respecto al formato ya confirmado en QA, pero deja la OC en dos lugares.
- **Recomendación: A**, confirmándolo contra una emisión QA real (el PDF de Enternet no debería mostrar la OC dos veces). Si el review prefiere minimizar cambios sobre el detalle ya confirmado, B es aceptable como paso intermedio.

### D2 — ¿Qué pasa si `oc.length + hes.length + 1 (global) > 40`?
Caso borde: muchas OC/HES distintas (ej. 45 OC + 3 guías → global por total 48, pero 45 refs OC + 1 global = 46 > 40 → excede el tope SII).
- **Recomendación:** detectar y **loguear+truncar** (nunca romper la emisión, mismo criterio tolerante del resto del pipeline) o, mejor, **frenar con error claro** si se decide que es un dato anómalo que requiere revisión. Decidir en el review. En la práctica OC/HES son pocas, pero el plan debe dejar el comportamiento explícito y testeado, sin truncado silencioso (ver preferencia de "no silent caps").

### D3 — Orden dentro del bloque
OC > HES > referencia global de guías (mismo orden que el individual: OC > HES > guías). Confirmado como convención del proyecto (PR #11, orden OC > HES > guías).

---

## 6. Implementación propuesta (Fase única, TDD)

Todo el cambio es en `src/mensaje/mensaje-builder.ts`, bloque `if (isGlobal)` (líneas 377-383). No toca parsing, ni `facturas.service.ts`, ni el pipeline de extracción — `oc`/`hes` ya están disponibles y deduplicados en `buildMensaje` (línea 254).

Reescribir el bloque Global de referencia para que, cuando `oc.length || hes.length`:
1. Emita el header con `RAZON REFERENCIA`.
2. Emita las líneas `5:|801|…|Orden de Compra` (cada OC) y `5:|HES|…|Hoja de Entrada de Servicios` (cada HES).
3. Emita la referencia global con el 4to campo vacío: `5:|52|0|{fechaDocumento}|`.
4. Si no hay OC ni HES → comportamiento actual intacto.

Y (según D1-A) ajustar la construcción de `DESCRIPCION ADICIONAL` (líneas 312-316) para dejar solo los folios de guía.

**Nota de reuso:** los helpers `RAZON_REFERENCIA_EXTERNA`, `dedupeReferenciasExternas`, `formatDateSlash` ya existen y se usan en el bloque individual. El bloque de referencia individual y el global comparten ~90% de la lógica de OC/HES — evaluar extraer un helper `buildLineasReferenciaExterna(oc, hes)` que devuelva las líneas `5:|801`/`5:|HES` + el flag `tieneReferenciasExternas`, y usarlo en ambos bloques (individual y global). Sube cohesión y evita divergencia futura. (Revisar altura del cambio: si el helper agrega complejidad sin pagar, dejar los dos bloques con la lógica inline pero idéntica.)

---

## 7. Tests a agregar (TDD — rojo primero)

En `src/mensaje/mensaje-builder.spec.ts`, `describe('buildMensaje — Caso 4 (Global)')` (o en el archivo aparte `mensaje-builder-referencias-global.spec.ts` si ya existe para bordes de 40 — verificar):

1. **Global + 1 OC → emite `5:|801|{folio}|{fecha}|Orden de Compra` en la zona de referencia**, y la global pasa a `5:|52|0|{fecha}|` (con 4to campo vacío), y el header a `…|RAZON REFERENCIA`.
2. **Global + 1 HES → emite `5:|HES|…|Hoja de Entrada de Servicios`** análogo.
3. **Global + OC + HES → orden OC > HES > global**, todas con 4 campos.
4. **Global SIN OC ni HES → bloque idéntico al actual** (`4:|TIPO DE REFERENCIA|FOLIO|FECHA` + `5:|52|0|{fecha}`, 3 campos) — **regression guard**, no romper Caso 4 ya confirmado en QA (folioSii=411219).
5. **(D1-A) `DESCRIPCION ADICIONAL` ya no incluye `OC:`/`HES:`** cuando esas pasan a la zona de referencia — solo folios de guía. (Ajustar el test existente `mensaje-builder.spec.ts:647` que hoy espera los folios; y revisar si hay tests que esperan `OC:` en el adicional en modo Global.)
6. **(D2) Caso borde OC+HES+1 > 40** → comportamiento decidido en review (error claro o truncado logueado), testeado explícitamente.

Correr `pnpm test` — mantener **264/264 + los nuevos** verdes, 0 skips.

---

## 8. Verificación E2E (QA real)

Tras los tests unit, emitir en QA real una proforma que caiga en Global **y** tenga al menos 1 OC (empkey de emisión = `1163`, ver `emision-dte-historial.md`). Confirmar en el XML del DTE:
- Aparece `<Referencia>` con `TpoDocRef=801` (OC) + su `RazonRef`.
- Aparece `<Referencia>` con `TpoDocRef=52`, `FolioRef=0`, `IndGlobal=1` (guías).
- El PDF de Enternet no duplica la OC (si se aplicó D1-A).
- Sin `[ParseErr001]`.

⚠️ `isGlobal` con OC/HES estuvo históricamente bloqueado por un bug de parser de Enternet (`isGlobal×40`, reconfirmado roto 2026-07-07). **Confirmar con Enternet que ese bug está resuelto** antes de dar por cerrada la verificación E2E — puede que este cambio lo destrabe o que siga bloqueado del lado de ellos (no bloqueante para el trabajo de código + tests, sí para el cierre E2E).

---

## 9. Handoff — qué hacer (guion para la sesión nueva)

1. **Leer** este doc + `mensaje-builder.ts` (bloques líneas 303-319 y 337-383) + `CONTEXT.md` glosario de Referencia.
2. **Review del diseño** (§3-§5): validar la restricción de las guías (§3), confirmar §D1/§D2 con el usuario si hace falta, y **consultar `consult-sii-norms`** para amarrar (a) tope de 40 `<Referencia>` por DTE y (b) coexistencia IndGlobal + OC/HES individuales.
3. **Implementar con TDD** (§6-§7): tests rojos primero, luego el cambio en el bloque Global, reutilizando el patrón del bloque individual.
4. **`pnpm test`** verde (NUNCA npm — usar pnpm).
5. **Verificar E2E** en QA (§8) si Enternet confirma que el bug de parser global está resuelto.
6. **PR** contra `main`, actualizar `CONTEXT.md` (glosario "Referencia de Guía en Factura" y "Modo de Detalle > Global": hoy dicen "OC/HES colapsan en DESCRIPCION ADICIONAL, no se listan aparte" — eso cambia) y `docs/ESTADO.md`.

## 10. Pendientes / a confirmar
1. **SII:** tope de 40 `<Referencia>`/DTE y coexistencia IndGlobal + individuales (§3).
2. **Enternet:** ¿resuelto el bug de parser en modo global con referencias individuales? (§8).
3. **D1:** ¿mover OC/HES fuera del `DESCRIPCION ADICIONAL` o duplicar? (recomendado: mover).
4. **D2:** comportamiento cuando OC+HES+global > 40 (recomendado: error claro, sin truncado silencioso).
