# Historial de sesiones — guias-middleware (2026-05-27 a 2026-07-13)

> Archivo de respaldo. Todo el contenido de este documento fue movido acá desde `docs/ESTADO.md`
> el 2026-07-13 para mantener ese archivo corto y legible — nada de esto se perdió, es historial
> de features ya cerradas/mergeadas a `main`. Para el estado actual del proyecto ver `docs/ESTADO.md`.
> Para el detalle exacto de cada cambio, `git log`/PRs cerrados en GitHub son la fuente de verdad.

Sesiones: 2026-05-28, 2026-05-29 (×2), 2026-05-30, 2026-06-01 (×3), 2026-06-02 (×4), 2026-06-03 (×4), 2026-06-19, 2026-06-30, 2026-07-01 (×2), 2026-07-02 (×3), 2026-07-03, 2026-07-06 (×7, branch `worktree-oc-hes-prd-grill`, PR #9 marcado Ready for review, luego mergeado), 2026-07-07 (×3: branch `worktree-oc-hes-orden-oc-hes-guias` PR #11 mergeado; triage/PRs #10 #12 mergeados; branch `worktree-test-caso1-real` PR #13 mergeado — Caso 1 confirmado aislado en QA real), 2026-07-08 (Caso 4 Global cerrado; wiring API de extraeReferenciaPorTipo; branch `worktree-fusion-referencia-por-tipo-definitiva` PR #18 mergeado — fusión de PR #14+#17, PR #17 cerrado sin mergear; PR #19 doc-ESTADO mergeado; branch `fix-recompute-bpchar-padding` PR #20 mergeado — bug de recompute (padding bpchar en Map de GroupingService) diagnosticado, fijado y verificado E2E en QA real), 2026-07-09 (OC/HES como `<Referencia>` reales también en modo Global — branch `worktree-oc-hes-global-impl` PR #24 mergeado, PR #23 cerrado; E2E confirmado en QA: OC Global folioSii=411226, HES Global folioSii=411227, ambas EMITIDAS; PR #22 doc-only parámetros GeneXus mergeado; OPEN-2 resuelto — branch `worktree-particionado-guivaloragrupador` PR #27 mergeado, particionado de Proformas por `guivaloragrupador` en `generar`/`crearManual`, E2E confirmado en QA real: folioSii=411230 (OC) y folioSii=411231 (HES); PR #28 (plan histórico) y #29 (doc por_comuna) doc-only mergeados — día cerrado), 2026-07-10 (Sesión 3 del plan E2E — Issue #32, multi-cliente/multi-regla: 1 `sync` + 1 `generar` sobre 2 clientes de `empkey=1163` con reglas distintas (`por_comuna` + `test_referencia_oc_hes`) → 4 proformas aisladas, todas EMITIDA (folioSii 411232-411235); fix de bug en `scripts/test-multi-cliente-multi-regla-e2e.js` (`finally` corrompía `reglaidl` de cliente compartido) + reparación de datos aprobada por el usuario), 2026-07-13 (Prefijo global de rutas `/facturador-guias-backend/api` (`app.setGlobalPrefix`) — PR #36 mergeado, tests 273/273; limpieza de git housekeeping: 5 branches locales+remotas obsoletas borradas (contenido ya mergeado vía PRs previas) + branch `feat-referencias-oc-hes-en-global` borrada tras mergear su único commit pendiente — main quedó como única branch activa. Pendiente: actualizar proxy Vite de `facturaGdes` (repo externo) para apuntar a `/facturador-guias-backend/api`)

## Historial Técnico

### 2026-07-13 — Prefijo global de rutas + limpieza de git housekeeping

**Contexto:** sesión de mantenimiento, sin cambios de lógica de negocio. Quedaba un commit sin PR sobre `feat-referencias-oc-hes-en-global` (creado localmente antes de esta sesión) que agregaba un prefijo global de rutas HTTP, y el repo acumulaba varias branches locales/remotas ya obsoletas de sesiones de worktree anteriores.

**Cambio (`src/main.ts`):** `app.setGlobalPrefix('facturador-guias-backend/api')` — todas las rutas HTTP del backend ahora viven bajo `/facturador-guias-backend/api`, para namespacear la API cuando se sirve detrás de un proxy compartido. Se actualizaron los 8 scripts E2E/sintéticos y la colección Postman para usar el nuevo `BASE_URL`. **PR #36 creado y mergeado a `main`** (squash), tests 273/273 verdes antes del merge.

**Pendiente (bloqueante para el flujo de dev de `facturaGdes`):** el proxy Vite de `facturaGdes` (repo externo, `:5173`) todavía apunta a `/empresas → localhost:3334`; debe actualizarse a `/facturador-guias-backend/api → localhost:3334` o el front dejará de encontrar las rutas del backend en desarrollo local.

**Git housekeeping:**
- `main` local estaba 9 commits detrás de `origin/main` — fast-forward aplicado.
- Branches locales+remotas borradas por estar 100% mergeadas vía PRs ya cerradas, sin contenido único: `cierre-sesion-2026-07-10` (PR #33), `worktree-docs-estado-oc-hes-global` (PR #25), `worktree-particionado-guivaloragrupador` (PR #27/#29), `worktree-sesion2-referencia-por-tipo-handoff` (PR #26), `pr27-update-docs` (duplicado local sin remoto propio, mismo contenido que PR #29).
- `feat-referencias-oc-hes-en-global` (branch de trabajo de esta feature, con el feature en sí ya cerrado hace días) borrada tras mergear su único commit pendiente (el prefijo de rutas) — sin contenido único restante vs `main`.
- Repo quedó con **una sola branch activa (`main`) y un solo worktree** (el checkout principal). No había otros worktrees en disco pese a los nombres `worktree-*` de las branches — eran solo refs de branch remanentes de sesiones anteriores donde sí se usó `git worktree add`, ya eliminados en su momento.

**Verificación:** `pnpm test` → 273/273 verde antes y después del merge de PR #36. No se ejecutó E2E contra QA (cambio de infraestructura de rutas, no de lógica de negocio; sin server de dev activo en `:3334` durante la sesión).

### 2026-07-10 — Verificación E2E multi-cliente / multi-regla (Sesión 3, Issue #32)

**Contexto:** Sesión 3 del plan `docs/PLAN-verificacion-e2e-completa.md` (Issue #32, verification-only, sin cambio de código de producción). Objetivo: probar que **un solo** `POST /sync` + **un solo** `POST /generar` (sin `?rut=`) sobre 2 clientes bajo el mismo `empkey=1163` con reglas de agrupación **distintas** produce 4 proformas aisladas sin mezcla entre clientes. Se usó el cliente compartido `76407930-2` con `test_referencia_oc_hes` (OC/HES) + un cliente sintético nuevo `81234567-2` (RUT con DV válido) con `por_comuna` (2 comunas → 2 grupos). Se descartó usar `empkey=977` real por config de emisor (ver handoff `docs/2026-07-10-handoff-sesion3-multi-cliente-multi-regla.md`).

**Cambio (solo script de prueba, no producción):** `scripts/test-multi-cliente-multi-regla-e2e.js`. Se corrigió un bug del propio script: el `finally` restauraba `reglaidl` del cliente compartido `76407930-2` con un centinela `null` si una falla temprana (p.ej. el `--reset`) ocurría **antes** de capturar el valor previo, corrompiendo un cliente que otros scripts sintéticos comparten. Fix: (1) capturar el `reglaidl` previo **antes** de cualquier operación destructiva; (2) inicializar el centinela como `undefined` y restaurar en el `finally` sólo si la captura realmente ocurrió. El `--reset` también borra `factura`/`facturaguias` del cliente nuevo dedicado antes de borrar su fila de `clientes` (FK `ifactura1`).

**Reparación de datos:** la corrida previa (antes de este fix) dejó `76407930-2.reglaidl = NULL`. Con aprobación explícita del usuario se restauró a `'por_comuna'` (valor previo real confirmado por el log del draft run que corrió antes de la corrupción) vía `UPDATE gde.clientes ... WHERE empkey='1163' AND gclirut='76407930-2'`. Nota: el valor "canónico" que asumen 5 scripts `-sintetico` es `por_razon_social`, pero funcionalmente da igual porque cada script sobreescribe el `reglaidl` al correr; se eligió `por_comuna` por ser el estado exacto previo a la corrupción (mínima sorpresa).

**Archivos modificados:**
- `scripts/test-multi-cliente-multi-regla-e2e.js` — captura previa al reset + guarda de `finally` con centinela `undefined`.
- `docs/PLAN-verificacion-e2e-completa.md` — Sesión 3 marcada como ejecutada con resultado.

**Verificación:** **E2E confirmado contra QA real 2026-07-10** (`node scripts/test-multi-cliente-multi-regla-e2e.js --reset --aprobar`): `generar` → `{"created":4,"skipped":0}`, **4 proformas particionadas por `gclirut` (1 cliente cada una), todas EMITIDA**: `gfackey=152`→folioSii **411232** (`81234567-2`, SANTIAGO), `153`→**411233** (`81234567-2`, PROVIDENCIA), `154`→**411234** (`76407930-2`, OC `801|555001`), `155`→**411235** (`76407930-2`, HES `HES|777002`). `reglaidl` de `76407930-2` restaurado correctamente a `por_comuna`. Confirma que `GroupingService` (batch de agrupadores) y `generarProformas` sin `?rut=` no mezclan clientes ni reglas heterogéneas en una sola corrida. Punto 4 del plan (chunking/Global con datos 100% reales) queda abierto: no había cliente real con volumen suficiente, no se forzó. Suite unit intacta (273/273, sin tocar código de producción).

### 2026-07-09 — Particionado de Proformas por `guivaloragrupador` (OPEN-2)

**Contexto:** la Sesión 2 del plan de verificación E2E (`docs/2026-07-09-handoff-particionado-por-agrupador.md`) confirmó `OPEN-2`: `generarProformas`/`crearManual` agrupaban guías solo por `(gclirut, guireglaidl)`, así que una OC y una HES distintas (`guivaloragrupador` diferente) caían en la misma factura. El usuario definió la intención de negocio: **1 Factura : 1 OC : 1 HES** — el particionado de guías en facturas es independiente de qué `<Referencia>` trae la factura (eso ya funcionaba bien, ver PR #24).

**Cambio (`src/facturas/facturas.service.ts`):** nueva llave de agrupación `(gclirut, guireglaidl, guivaloragrupador)` vía el helper `agruparPorValorAgrupador`, usado tanto en `generar` como en `crearManual`. El chequeo de "Proforma activa ya existente" (`existeProformaActivaParaValor`) se movió a un método compartido que hace `JOIN` contra `gde.guia` para filtrar por `guivaloragrupador` (antes solo miraba `(empkey, gclirut, reglaidl, periodo)`). `crearManual` valida TODOS los grupos antes de insertar nada (evita crear la mitad y abortar a mitad de camino).

**Decisión de diseño (Opción A, global, no por-regla) — impacto en `por_comuna` revisado y confirmado 2026-07-09:** el particionado por valor aplica a **todas** las reglas que usan `guivaloragrupador`, no solo a `extraeReferenciaPorTipo` — incluye `extraeTagLista` (`por_comuna`, `por_ciudad`, `por_direccion`, `por_razon_social`). Antes del fix, un cliente con guías de comunas distintas bajo la misma regla se consolidaba en 1 sola proforma; con el fix, cada valor de agrupador (cada comuna, cada OC, cada HES) cae en su propia proforma. El handoff previo dejaba esto como pregunta abierta (alternativa: flag por-regla en `reglaconfig`, Opción B). Se revisó contra la DB (`gde.regla`, `gde.factura`/`facturaguias`/`guia`) antes de mergear:
  - `por_comuna`/`por_ciudad`/`por_direccion` **nunca generaron ninguna factura** en esta base — cero riesgo de romper histórico.
  - `por_razon_social` (60 facturas históricas) tiene **100% un solo valor distinto de `guivaloragrupador` por factura** — el nuevo particionado no cambia nada para esos casos reales.
  - El propio nombre de la regla ("Agrupar por comuna del receptor") ya implica 1 factura por comuna — la consolidación antigua era el mismo bug que OPEN-2, no un comportamiento a preservar.
  - `existeProformaActivaParaValor` hace `JOIN` contra `gde.guia` filtrando por `guivaloragrupador`, así que una proforma vieja que ya mezclara valores sigue detectándose correctamente para cada uno de ellos — no genera duplicados retroactivos.
  Con esto se descarta la Opción B y se confirma la Opción A (global) como definitiva. Caveat: la revisión fue contra la DB local/QA (`facturagdes2`), no contra producción real — si `por_comuna` tiene datos reales en producción que no se pudieron consultar desde aquí, vale una confirmación final ahí.

**Archivos modificados:**
- `src/facturas/facturas.service.ts` — helper `agruparPorValorAgrupador` + `existeProformaActivaParaValor`, wireados en `generar` y `crearManual`.
- `src/facturas/facturas.service.spec.ts` — +3 tests (partición en `generar`, BORRADOR de un valor no bloquea al otro, partición en `crearManual`).
- `scripts/test-referencia-por-tipo-e2e.js` — asserta que se crean tantas proformas como `guivaloragrupador` distintos (antes solo logueaba, no fallaba si quedaban consolidadas).

**Verificación:** suite **273/273 verde**, lint 0 errores, build limpio. **E2E confirmado contra QA real 2026-07-09** (`test-referencia-por-tipo-e2e.js --reset --aprobar`): `generar` devolvió `{"created":2,"skipped":0}` → `gfackey=142` (OC, folio 990301) y `gfackey=143` (HES, folio 990302), ambas **EMITIDAS** (folioSii=411230 y folioSii=411231 respectivamente). OPEN-2 100% cerrado, sin pendientes.

**Gotcha del primer intento (no era bug de diseño):** la primera corrida del script dio `{"created":1,"skipped":0}` — ambas guías cayeron en la misma proforma. No era ambigüedad de la partición (que agrupa por el *valor* concreto de `guivaloragrupador`, no por "tipo OC vs HES" — dos valores distintos siempre separan, sea cual sea su origen). La causa real: el checkout que corría el server de dev (`feat-referencias-oc-hes-en-global`, checkout principal) estaba desactualizado respecto a `origin/main` y no tenía el commit de PR #27 (`git merge-base --is-ancestor` confirmó que no era ancestro de `HEAD`). Se resolvió con `git merge origin/main` + reinicio del server; con el código correcto corriendo, el resultado fue el esperado. Moraleja: ante un resultado de partición/recompute que no calza con el diseño, verificar primero que el proceso vivo corre el código actual antes de asumir bug de lógica.

### 2026-07-09 — OC/HES como `<Referencia>` reales también en modo Global (PR #24)

**Contexto:** hasta ahora, en modo Global (>40 referencias, `isGlobal`), las OC/HES no se emitían como bloques `<Referencia>` propios sino embebidas como texto dentro del campo `DESCRIPCION ADICIONAL` del Detalle colapsado (junto con los folios de guía). El usuario pidió que OC/HES pasaran a ser `<Referencia>` reales también en Global, igual que en el modo individual. El diseño quedó documentado como plan en PR #23 (`feat-referencias-oc-hes-en-global`, doc + handoff) y la implementación se hizo en PR #24 (`worktree-oc-hes-global-impl`).

**Cambio (`src/mensaje/mensaje-builder.ts`):** en modo Global, las OC (801) y HES ahora se emiten como líneas `<Referencia>` reales (no como texto en `DESCRIPCION ADICIONAL`), más el bloque de Referencia Global (`52`/`IndGlobal`). Orden **OC > HES > global**. Se extrajo un helper compartido para armar las líneas de referencia OC/HES, reusado por el modo individual y el Global (elimina la duplicación previa). Regla D2: si el total de referencias supera el tope de 40, se lanza error explícito.

**Archivos modificados:**
- `src/mensaje/mensaje-builder.ts` — helper compartido de líneas OC/HES + emisión como `<Referencia>` real en Global (+82/−41).
- `src/mensaje/mensaje-builder.spec.ts` — +6 tests del nuevo comportamiento en Global.
- `src/mensaje/mensaje-builder-referencias-global.spec.ts` — asserts actualizados (OC/HES ya no van en `DESCRIPCION ADICIONAL`).
- `docs/PLAN-referencias-oc-hes-en-global.md` (nuevo, plan de PR #23) y `CONTEXT.md`.

**Verificación:** suite **270/270 verde, 0 skips**. **E2E contra QA real confirmado:** OC Global → **EMITIDA, folioSii=411226**; HES Global → **EMITIDA, folioSii=411227**. XML de salida verificado: bloques `801`/HES limpios. Punto clave: el **bug histórico del parser de Enternet** (el que bloqueaba Caso 4 Global antes del hotfix del 2026-07-08) **NO afecta este diseño**, porque OC/HES se emiten como `<Referencia>` reales, no dependen del camino problemático.

**Observación (no bloqueante):** la referencia global `52`/`0` sale duplicada en la salida (el trío de encabezado + una línea `5:|52|0|`). No rompe la emisión; quedó comentada en PR #24 como mejora a futuro, junto con la simplificación pendiente del parser de Enternet.

**PRs:** **PR #24 mergeado a main** (2026-07-09); **PR #23 cerrado** (supersedido — era plan+handoff doc-only). Feature 100% en main y confirmado E2E.

### 2026-07-08 — Bug de recompute resuelto: padding bpchar en Map de GroupingService (PR #20)

**Contexto:** con PR #19 (doc ESTADO de la fusión) ya mergeado, se atacó el BUG ABIERTO que dejó la sesión anterior: `guireglaidl`/`guivaloragrupador` quedaban `NULL` tras `PUT .../clientes/:rut/regla?recomputar=true`.

**Diagnóstico:** la causa raíz es **padding `bpchar` en las llaves de los `Map` en memoria** de `GroupingService.batchComputeAgrupadores`, **no** el SQL. `gde.clientes.gclirut` es `character(20)` y `reglaidl`/`regla.reglaidl` son `character(30)`; TypeORM devuelve esos valores con espacios de relleno. `clienteMap` se indexaba por `c.gclirut` (padded) pero se consultaba con el `rutXml` normalizado (unpadded) → `Map.get` con igualdad estricta falla → `null`. El `find()` SQL (comparación bpchar) ignora el padding y sí traía la fila, por eso la hipótesis previa "padding no es la causa" era falsa: probó la capa SQL, no el `Map`. El path de `sync` no sufría el bug porque ahí ambos lados salen de objetos en memoria unpadded.

**Fix (`src/reglas/grouping.service.ts`):** `.trim()` al construir las llaves de `clienteMap`/`reglaMap` y al derivar `reglaidls`.

**Archivos modificados:**
- `src/reglas/grouping.service.ts` — trim de padding en las 3 llaves.
- `src/reglas/grouping.service.spec.ts` — regresión con mock `padEnd(20/30, ' ')` (roja antes del fix).
- `docs/ESTADO.md` — bug marcado resuelto + OPEN-2.

**Verificación:** suite 264/264, lint 0 errores, build limpio. **E2E contra QA real** (`node scripts/test-referencia-por-tipo-e2e.js --reset`, sin `--aprobar`): recompute → `990301=555001`, `990302=777002`; `generar` creó proforma `gfackey=133`; preview con refs `801/555001`, `HES/777002` + dos `52`. `cliente.reglaidl` restaurado. **PR #20 mergeado.**

**Observación (OPEN-2):** `generar` produjo **1 sola** proforma para dos `guivaloragrupador` distintos — falta confirmar si `extraeReferenciaPorTipo` debe partir la proforma por valor. Ajeno al bug de recompute; depende de `FacturasService.generarProformas`.

### 2026-07-08 — Fusión definitiva del wiring API de `extraeReferenciaPorTipo` (PR #18)

**Contexto:** el wiring de `extraeReferenciaPorTipo` en `/reglas` se implementó **dos veces en paralelo**: PR #14 (`worktree-plan-verificacion-e2e`, mergeado a main 21:17) y PR #17 (`worktree-ejercitar-referencia-por-tipo`, draft creado 21:46 — la sesión no notó que #14 ya había mergeado el mismo feature). El usuario pidió comparar ambas con code-review, tomar lo mejor de cada una y fusionarlo en un PR definitivo.

**Comparación (code-review):**
- **Lógica core (DTO + service):** equivalente. #14 marginalmente superior — `FUNCIONES_SOPORTADAS as const` para el type de `fn`, reutiliza `buildReglaConfig` dentro de `update` en vez de inlinear literales.
- **`reglas.service.spec.ts`:** #14 es superset — cubre create + **ambas** ramas de update (cambiar `fn` y actualizar solo `tiposReferencia`); #17 solo cubría cambiar `fn`.
- **`create-regla.dto.spec.ts`:** solo #14 (7 casos de validación).
- **Único valioso de #17:** test controller de creación `extraeReferenciaPorTipo`, script E2E (`scripts/test-referencia-por-tipo-e2e.js`) y handoff doc del bug de recompute.

**Resolución:** PR #18 (`worktree-fusion-referencia-por-tipo-definitiva`) partió de main (core + specs superiores de #14) e injertó las 3 piezas únicas de #17. Suite **263/263 verde**, lint 0 errores, build limpio. **PR #18 mergeado (squash)**; **PR #17 cerrado sin mergear** (core redundante con main, valor único ya integrado).

**Archivos:** `src/reglas/reglas.controller.spec.ts` (test controller), `scripts/test-referencia-por-tipo-e2e.js` (harness E2E, nuevo), `docs/2026-07-08-handoff-extrae-referencia-por-tipo-e2e.md` (handoff, nuevo).

### 2026-07-07 (sesión 9) — Caso 1 (S.G.) confirmado aislado con emisión real en QA

**Contexto:** con PR #11 ya mergeado y sin diffs/PRs propios pendientes, el usuario pidió probar Caso 1 (S.G. — Según Guías, el modo por defecto) con una emisión real dedicada — hasta ahora solo se había validado con PDF real (sesión 2026-07-01) o como parte de pruebas de chunking (folios 411203-411207), nunca en aislamiento con su propio script reusable como los demás casos.

**Script nuevo:** `scripts/test-caso1-sg-sintetico.js` + `test/fixtures/caso1-sg/guia.xml` (mismo patrón `data:` URL que los demás scripts sintéticos) — 3 guías sintéticas (`empkey=1163`, emisor `968880004`, `guitipo=996`, período `2025-11`), sin `<Referencia>` OC/HES en el XML.

**Resultado:** preview confirmó el formato exacto esperado (1 línea `3:\|1\|AFECTO\|Facturación según guías período 2025-11\|1\|45000\|0\|45000` + 3 líneas `5:\|52\|{folio}\|{fecha}`). Emisión real (`PATCH /aprobar`) → **`gfackey=126` EMITIDA, folioSii=411218**. XML descargado (`linkXml`) verificado: 1 `<Detalle>` con `MontoItem=45000`, 3 bloques `<Referencia TpoDocRef=52>` sin `RazonRef` — exactamente el diseño de Caso 1, sin regresión tras todos los cambios de OC/HES y reordenamientos de la semana.

**Archivos modificados:** `scripts/test-caso1-sg-sintetico.js` (nuevo), `test/fixtures/caso1-sg/guia.xml` (nuevo).

**Tests:** 250/252 verdes (mismos 2 skips preexistentes de Caso 4 Global).

**PR:** #13, branch `worktree-test-caso1-real` — mergeado a `main`.

### 2026-07-08 — Caso 4 (Global): Enternet corrigió el bug de su parser, `<Referencia IndGlobal=1>` confirmado en QA

**Contexto:** el usuario pidió reintentar el mismo escenario bloqueado desde 2026-07-03 (`scripts/test-caso4-global-sintetico.js --reset --aprobar`), avisando que Enternet aplicó un hotfix a su parser V5 ese mismo día.

**Reintento sin cambios de código:** el bloque EXPERIMENTAL de `mensaje-builder.ts` (header `TIPO/FOLIO/ACCION REFERENCIA` + línea `5:|52|0|{fecha}`) se dejó intacto desde 2026-07-03. Resultado: `gfackey=127` (empkey 1163, 41 guías sintéticas) → **EMITIDA, folioSii=411219**.

**Verificación del XML de salida** (descargado desde `linkXml` de la respuesta de `/aprobar`):
```xml
<Referencia>
    <NroLinRef>1</NroLinRef>
    <TpoDocRef>52</TpoDocRef>
    <IndGlobal>1</IndGlobal>
    <FolioRef>0</FolioRef>
    <FchRef>2026-07-08</FchRef>
    <RazonRef>Referencia global</RazonRef>
</Referencia>
<Referencia>
    <NroLinRef>2</NroLinRef>
    <TpoDocRef>52</TpoDocRef>
    <FolioRef>0</FolioRef>
    <FchRef>2026-07-08</FchRef>
</Referencia>
```
`FchRef` ya sale correcto en ambos bloques (antes el bloque `NroLinRef=1` salía vacío, `'-  -'`, rompiendo la firma XML con `[FirmaErr002]`). Enternet sigue generando 2 bloques `<Referencia>` separados en vez de fusionarlos en uno (el segundo no lleva `IndGlobal`), pero como ambos traen fecha válida, la firma y validación del SII pasan sin error — no se investigó más allá porque el resultado práctico (emisión válida, folio SII real) ya cumple el objetivo.

**Código promovido de EXPERIMENTAL a definitivo** en `src/mensaje/mensaje-builder.ts` — comentario del bloque `if (isGlobal)` actualizado para reflejar el fix confirmado (sin cambios funcionales en el código).

**Tests actualizados** en `src/mensaje/mensaje-builder.spec.ts` (describe `buildMensaje — Caso 4 (Global)`): los 2 `it.skip` que asumían ausencia del bloque de referencia (hipótesis descartada mientras el bug estaba activo) se reemplazaron por 2 tests que confirman su presencia (líneas `4:|`/`5:|` de la Referencia Global + campos `TIPO/FOLIO/ACCION REFERENCIA` en el encabezado). Suite completa: **252/252 verdes, 0 skips** (antes 250/252 con 2 skips).

**Docs actualizados:** `docs/consulta-enternet-referencia-global.md` — nueva sección "Resuelto — 2026-07-08" con el detalle completo del fix y el XML final.

**Archivos modificados:** `src/mensaje/mensaje-builder.ts`, `src/mensaje/mensaje-builder.spec.ts`, `docs/consulta-enternet-referencia-global.md`.

**Resultado:** Caso 4 (Global) queda **100% cerrado** end-to-end — Detalle colapsado + `DESCRIPCION ADICIONAL` con folios (confirmado 2026-07-03) + bloque `<Referencia IndGlobal=1>` (confirmado 2026-07-08). No queda pendiente de este issue.

---

### 2026-07-07 — Feedback del dev senior en revisión de PR #9: reordenar OC > HES > guías

**Contexto:** revisión de PR #9 (ya mergeado a `main` en este punto) con el dev senior. Validó que la interacción OC/HES con guías referenciadas se ve bien, y pidió por separado un cambio de orden: cuando hay OC y/o HES junto con guías referenciadas en la Factura, el orden debe ser **OC > HES > guías** (antes era guías > OC > HES).

**Cambio:** `mensaje-builder.ts` — en modo individual (líneas `5:|`) se reordenaron los 3 loops (antes guías→OC→HES, ahora OC→HES→guías); en modo Global, el array `segmentos` de `DESCRIPCION ADICIONAL` se reordena igual (antes `[guías, OC, HES]`, ahora `[OC, HES, guías]`). Tests actualizados en `mensaje-builder.spec.ts` (test explícito de orden) y `mensaje-builder-referencias-global.spec.ts` (assert exacto del `DESCRIPCION ADICIONAL` + los 2 tests de "solo OC"/"solo HES" que ya no esperan un separador `-` líder). `docs/PRD-referencias-oc-hes.md` actualizado con el formato exacto y el nuevo orden.

**Resultado:** 236/238 tests unitarios verdes (mismos 2 skips preexistentes de Caso 4). Cambio de comportamiento puro, sin nuevos casos de borde. Branch nuevo `worktree-oc-hes-orden-oc-hes-guias` desde `main` (el branch original `worktree-oc-hes-prd-grill` ya estaba mergeado vía PR #9 y quedó diverged/stale).

**Archivos modificados:** `src/mensaje/mensaje-builder.ts`, `src/mensaje/mensaje-builder.spec.ts`, `src/mensaje/mensaje-builder-referencias-global.spec.ts`, `docs/PRD-referencias-oc-hes.md`.

---

### 2026-07-06 (sesión 7) — Fix del separador de DESCRIPCION ADICIONAL, confirmado en QA: elimina el ParseErr001, revela el bug real pendiente (bloqueado en Enternet)

**Contexto:** el usuario pidió arreglar el separador de `DESCRIPCION ADICIONAL` (causa raíz identificada en la sesión 6) para comprobar en QA real que efectivamente era eso lo que rompía OC/HES con 40 guías.

**Fix (commit siguiente):** `mensaje-builder.ts` línea ~311, `segmentos.join(' | ')` → `segmentos.join(' - ')`. El Mensaje V5 es pipe-delimited de punta a punta, así que ningún separador legible dentro de un campo puede usar `|`. Tests actualizados en `mensaje-builder-referencias-global.spec.ts` (4 asserts con `' | '`/`'| OC'`/`'| HES'` → `' - '`/`'- OC'`/`'- HES'`). Suite completa: 236/238 verdes (mismos 2 skips), lint y build limpios.

**Re-test contra Enternet QA real (`test-oc-hes-chunking-sintetico.js --reset --aprobar`):**
- OC N=40 y HES N=40: el `[ParseErr001]` **desapareció** — el Detalle (línea `3:|`) ya no se rechaza por conteo de columnas. Confirma que el separador era la causa raíz de ese error específico.
- Pero N=40 **sigue fallando**, ahora por un error distinto y ya conocido: `[FirmaErr002] Falla en el Proceso de Firma del XML, cvc-datatype-valid.1.2.1: '-  -' is not a valid value for 'date'` — el bloque EXPERIMENTAL de `buildMensaje` (líneas `TIPO/FOLIO/ACCION REFERENCIA` + `5:|52|0|{fecha}`) que se agrega siempre que `isGlobal=true`. Este es exactamente el bug de Enternet ya documentado y pausado en `enternet-v5-referencia-global-en-progreso.md` — no relacionado con OC/HES, no es un hallazgo nuevo.
- OC N=39 y HES N=39: sin cambios (ya `EMITIDA` de la sesión 6, `isGlobal=false` no pasa por este código en absoluto).

**Conclusión:** el fix del separador era necesario y correcto (elimina un bug real y propio), pero no alcanza para que 40 guías + 1 OC/HES emitan — el modo Global sigue bloqueado por el bug del lado de Enternet, ahora sin el ruido del `ParseErr001` encima. El plan de "resolver el hallazgo `isGlobal`×chunking antes de sacar el PR de draft" pasa a depender 100% de que Enternet corrija su parser (ver Pendientes) — de nuestro lado ya no queda nada más que arreglar en este camino.

**Archivos modificados:** `src/mensaje/mensaje-builder.ts`, `src/mensaje/mensaje-builder-referencias-global.spec.ts`.

---

### 2026-07-06 (sesión 6) — Confirmado en QA real: OC y HES por separado con 40 guías rompen la emisión; con 39 funcionan

**Contexto:** siguiente paso del hallazgo abierto #3 de la sesión 5 (interacción `isGlobal` × chunking de 40). El usuario pidió probar la emisión real de OC y HES **por separado** (no combinadas, ya confirmado con ambas juntas en folioSii=411212) con 40 guías cada una, y si fallaba, repetir con 39.

**Script nuevo:** `scripts/test-oc-hes-chunking-sintetico.js --tipo=oc|hes --n=<N> [--reset] [--aprobar]` — inserta N guías sintéticas directo en BD (bypass de `crearManual`, igual que `test-caso4-global-sintetico.js`, para controlar el N exacto sin el chunking de `MAX_GUIAS_POR_FACTURA`), donde solo la primera guía lleva la `<Referencia>` externa (OC o HES, fixtures reusados de `test/fixtures/oc-hes/`) y el resto son guías planas (fixture de `test/fixtures/caso4-global/guia-global.xml`). Folios no se solapan entre corridas de distinto `(tipo, N)`.

**Resultado — los 4 casos confirmaron exactamente la hipótesis del hallazgo #3:**
- OC, N=40 (total 41 referencias > 40 → `isGlobal`): **RECHAZADO**, `gfackey=109`.
- OC, N=39 (total 40 referencias, no > 40 → modo individual): **EMITIDA, folioSii=411213**, `gfackey=110`.
- HES, N=40: **RECHAZADO**, `gfackey=111` (mismo error).
- HES, N=39: **EMITIDA, folioSii=411214**, `gfackey=112`.

**Causa raíz del rechazo en N=40 (más específica que la hipótesis original del hallazgo #3):** no es (solo) que el modo Global esté roto en general — es que `segmentos.join(' | ')` en `mensaje-builder.ts` (línea ~311) usa `" | "` como separador legible entre los segmentos de guías/OC/HES dentro de un único campo `DESCRIPCION ADICIONAL`, pero como todo el Mensaje V5 es pipe-delimited, ese `|` literal se cuenta como un separador de columna más. Enternet rechaza con `[ParseErr001] Numero de campos del detalle no coincide con el número de etiquetas en la linea 15`, señalando exactamente la línea `3:|...|994300 ... 994339 | OC: 555001` — el header `2:|` declara 8 columnas pero la línea `3:|` con el segmento `OC:`/`HES:` agregado tiene 9 (por el `|` de separación). El bloque EXPERIMENTAL final de `buildMensaje` (líneas `TIPO/FOLIO/ACCION REFERENCIA`) nunca llega a ejecutarse contra Enternet porque el rechazo ocurre antes, al parsear el Detalle.

**Nota:** el caso 4 puro (solo guías, sin OC/HES, folioSii=411211) no tiene este problema porque `segmentos` tiene un solo elemento y `join(' | ')` no agrega ningún `|` de más.

**Archivos modificados:** `scripts/test-oc-hes-chunking-sintetico.js` (nuevo, activo permanente reusable).

---

### 2026-07-06 (sesión 5) — Code review de PR #9 (8 ángulos + verify), 2 fixes aplicados, 2 hallazgos abiertos

**Contexto:** retomando el handoff de la sesión 4 (paso sugerido: correr `code-review` antes de marcar PR #9 como "Ready for review"). Se corrió una revisión con 8 agentes finder en paralelo (line-by-line, removed-behavior, cross-file, reuse, simplification, efficiency, altitude, conventions) sobre `git diff main...HEAD`, seguida de verificación manual (lectura directa del código + diff) de cada candidato antes de reportar.

**Fixes aplicados (commit `0dd64da`, pusheado):**
1. `xml-parser.utils.ts` — `parseReferencias` descartaba en silencio una 2da+ ocurrencia del mismo tipo (801/HES) dentro de una guía (`if (vistos.has(tipo)) continue`), sin la visibilidad que sí tienen los `TpoDocRef` no reconocidos (`descartadas` + log). Ahora también reporta la repetida en `descartadas`.
2. `mensaje-builder.ts` — `TipoReferenciaExterna`/`ReferenciaExternaParaMensaje` redeclaraban el mismo shape que `TipoReferenciaExterna`/`ReferenciaExterna` en `xml-parser.utils.ts`. Ahora se importan en vez de redeclararse.

**Hallazgos abiertos — requieren decisión, no se tocaron (ver comentario en PR #9):**
3. **Interacción `isGlobal` × chunking de 40 guías** (`mensaje-builder.ts:273`): `isGlobal` ahora cuenta `guias + oc + hes` contra el mismo umbral (40) que `MAX_GUIAS_POR_FACTURA` usa para trocear proformas grandes. Un chunk de exactamente 40 guías + cualquier OC/HES activa el modo Global — hoy confirmado roto en el parser de Enternet y pausado (ver fila "Caso 4 Global" arriba). Una factura normal podría caer sin aviso en el camino sabido-roto.
4. **Fetch de todas las guías en `_emitir`/`previewMensaje`**: ya documentado como cambio de comportamiento explícito en la sesión 3 (no es hallazgo nuevo) — se re-confirma acá que sigue siendo un trade-off consciente, no un bug, probablemente inevitable dado que OC/HES pueden venir en cualquier guía.

**Tests:** 236/238 verdes (mismos 2 skips preexistentes) tras los 2 fixes — se extendieron 2 tests existentes en `xml-parser.service.spec.ts` para cubrir el nuevo reporte en `descartadas`.

---

### 2026-07-06 (sesión 4) — Emisión real OC/HES confirmada en Enternet QA, bug de header `4:|` corregido

**Contexto:** continuación directa de la sesión 3 del mismo día (wiring de `parseReferencias` en `facturas.service.ts`, commit `4ea5fd6`). El usuario pidió "probar la emisión para ver cómo responde QA Enternet" — el paso pendiente #2 de la sesión anterior.

**Preparación:** se creó `scripts/test-oc-hes-sintetico.js` + `test/fixtures/oc-hes/{guia-oc,guia-hes}.xml` (mismo patrón `data:` URL usado en `test-por-producto-sintetico.js`/`test-caso4-global-sintetico.js`): 2 guías sintéticas (`empkey=1163`, emisor `968880004`, `RutUsuario=16714595-7`), una con `<Referencia><TpoDocRef>801</TpoDocRef>...` (OC folio 555001) y otra con `<TpoDocRef>HES</TpoDocRef>` (folio 777002). El servidor de desarrollo se corrió sobre el propio worktree (no sobre el checkout principal) para que `preview-mensaje`/`aprobar` ejercitaran el código de la branch `worktree-oc-hes-prd-grill`, no `main`.

**Primer intento real (`PATCH /aprobar`) — RECHAZADO por Enternet QA:**
```
[DTEErr001] No fue posible emitir el documento. | [ParseErr001] Número de campos de la
linea de referencia no coincide con el número de etiquetas en la linea 19/20 |
[4:|TIPO DE REFERENCIA|FOLIO|FECHA] | [5:|801|555001|10/01/2026|Orden de Compra]
```
El preview (`preview-mensaje`, que no valida contra Enternet) se veía correcto y no detectó el problema — solo `/aprobar` contra QA real lo expuso.

**Causa raíz (confirmada releyendo la spec V5, `docs/FormatodeIntegracinbasadoenEtiquetasEstndarv5.html`):** el header `4:|` declara las columnas de las líneas `5:|` siguientes, y Enternet valida que el número de campos corresponda exactamente. La spec sí documenta un campo opcional `RAZON REFERENCIA` (C90) para un 4to campo — pero el código emitía el header fijo de 3 columnas (`4:|TIPO DE REFERENCIA|FOLIO|FECHA`) incluso cuando las líneas de OC/HES agregaban una 4ta (la razón fija "Orden de Compra"/"Hoja de Entrada de Servicios").

**Fix en `src/mensaje/mensaje-builder.ts` (commit `b6f7086`):** cuando hay al menos una OC/HES, el header pasa a 4 columnas (`4:|TIPO DE REFERENCIA|FOLIO|FECHA|RAZON REFERENCIA`) y las líneas `5:|52|...` de guía agregan un 4to campo vacío (`5:|52|{folio}|{fecha}|`) para mantener la correspondencia exigida. Sin OC/HES, el header sigue igual que antes (sin afectar Casos 1-4 ya validados).

**Segundo intento — EMITIDA:** `gfackey=108` (empkey 1163) → **EMITIDA, folioSii=411212**. Se descargó el XML final (`linkXml`) y se verificaron los 4 bloques `<Referencia>` generados por Enternet: 2× `TpoDocRef=52` (guías, sin `RazonRef`) + 1× `TpoDocRef=801` + 1× `TpoDocRef=HES` (ambos con `<RazonRef>` poblado con el texto fijo esperado) — confirma el diseño de punta a punta contra QA real.

**Archivos modificados:**
- `src/mensaje/mensaje-builder.ts` — fix de header/campo vacío descrito arriba.
- `src/mensaje/mensaje-builder.spec.ts` — test nuevo verificando header de 4 columnas + campo vacío en línea de guía cuando hay OC/HES.
- `scripts/test-oc-hes-sintetico.js` (nuevo) + `test/fixtures/oc-hes/guia-{oc,hes}.xml` (nuevos) — activos permanentes reusables con `--reset`/`--aprobar`.

**Tests:** 236/238 verdes (mismos 2 skips preexistentes de Caso 4 Global, sin relación). Lint y build limpios.

---

### 2026-07-06 (sesión 3) — Prueba con datos sintéticos + wiring de OC/HES en `facturas.service.ts`

**Contexto:** trabajo en el worktree `worktree-oc-hes-prd-grill` (PR #9, draft), que ya traía `parseReferencias()` + integración en `mensaje-builder.ts` implementados con TDD en una sesión anterior del mismo día (ver `docs/PRD-referencias-oc-hes.md`). El usuario pidió primero "probar la feature con datos sintéticos" y luego "wirear `parseReferencias` en `facturas.service.ts`".

**Prueba con datos sintéticos (no commiteada, script ad-hoc descartado al terminar):** usando `buildGuiaXml` (`src/xml/xml-test-builders.ts`) + `parseReferencias` + `buildMensaje` directamente (sin pasar por NestJS ni DB), se confirmaron 4 casos: modo individual con OC+HES en guías distintas, modo Global (30 guías + 13 OC/HES = 43 > 40, colapsa en `DESCRIPCION ADICIONAL`), `TpoDocRef` desconocido (`52`) descartado sin bloquear, y `801`/`HES` sin `FolioRef` lanza error. Sirvió para confirmar el comportamiento antes de tocar el service real — ningún archivo de producción se tocó en este paso.

**Wiring en `facturas.service.ts` (commit `4ea5fd6`, pusheado a `worktree-oc-hes-prd-grill`):**
- `_emitir` y `previewMensaje`: antes solo fetcheaban el XML de la primera guía (salvo modo `POR_PRODUCTO`, que fetcheaba todas). Ahora ambos hacen `Promise.all(guias.map(fetchDocument))` **siempre**, porque OC/HES pueden venir en cualquier guía, no solo la primera.
- Nuevo método privado `_extraerReferenciasExternas(docs)`: corre `parseReferencias(doc.rawXml)` por cada doc fetcheado, concatena las `referencias` (sin dedup — lo hace `buildMensaje` internamente por `(tipo, folio)`) y loguea cada `descartada` (`TpoDocRef` no reconocido) con `this.logger.warn`, sin bloquear la emisión.
- `_construirDetalleItems` dejó de fetchear por su cuenta (ya no es `async`) — recibe los `docs` ya fetcheados una sola vez, reusados tanto para detalle-por-producto como para extracción de referencias.
- **Cambio de comportamiento explícito:** se eliminó la optimización previa "modo SG/cliente=null → solo 1 fetchDocument aunque haya 2+ guías" (ya no aplica: ahora siempre se fetchea 1 XML por guía). El test que verificaba esa optimización se actualizó para reflejar el nuevo comportamiento (`facturas.service.spec.ts`).

**Archivos modificados:**
- `src/facturas/facturas.service.ts` — cambios descritos arriba.
- `src/facturas/facturas.service.spec.ts` — 3 tests nuevos (OC+HES en 2 guías → líneas `5:` en el Mensaje; `TpoDocRef` desconocido no bloquea; `previewMensaje` incluye OC/HES) + 1 test existente actualizado (fetch de todas las guías incluso en modo SG).

**Tests:** 235/237 verdes (2 skips preexistentes de Caso 4 Global, sin relación). Lint y build limpios.

---

### 2026-07-03 — Reintentos Caso 4 (Global) en QA real, bug confirmado del lado de Enternet

**Contexto:** se retomó la validación empírica del mecanismo de `<Referencia>`/`IndGlobal` para Caso 4 (pendiente desde la sesión 2026-07-02 #3), reintentando en QA real contra Enternet con el script `scripts/test-caso4-global-sintetico.js` (41 guías sintéticas, `empkey=1163`, emisor `968880004`, cliente `76407930-2`).

**Intento 2 repetido (folio=0, fecha=hoy):** se reintrodujo temporalmente en `mensaje-builder.ts` el header `TIPO/FOLIO/ACCION REFERENCIA` + línea `5:|52|0|{fecha de hoy}` (ya documentado como fallido en la sesión anterior con `ErrorRefTipDoc01`). Primera corrida del día: mismo error (`ErrorRefTipDoc01`, folio inválido).

**Intento 4 (misma tarde, sin cambios de nuestro lado):** se repitió exactamente el mismo Mensaje V5 y el error **cambió** a `[FirmaErr002] Falla en el Proceso de Firma del XML` — señal de que Enternet modificó algo en su procesamiento entre la mañana y la tarde. El detalle del error mostró el XML interno: Enternet arma **dos** bloques `<Referencia>` a partir de un solo Mensaje V5 — uno desde el header `ACCION REFERENCIA=5` (genera `IndGlobal=1` correctamente, confirmando que el mecanismo existe) pero con `CodRef=3`/`RazonRef="Corrige Montos..."` hardcodeado y `FchRef` vacío (rompe la firma XML); y otro desde la línea `5:|52|0|{fecha}` con `FchRef` correcto pero sin `IndGlobal`. El parser de Enternet no está tomando la fecha de la línea `5:|` para completar el bloque `IndGlobal=1`.

**Conclusión:** confirmado con el propio equipo de Enternet que es un bug de su parser/generador de XML, no un problema del Mensaje V5 que enviamos (que es correcto y estable). Enternet está corrigiendo su lado; **se pausa el trabajo de este caso hasta que avisen** (estimado: día siguiente).

**Decisión explícita:** se deja el código EXPERIMENTAL sin revertir en `src/mensaje/mensaje-builder.ts` (rama `if (isGlobal)` al final de `buildMensaje`, agrega `TIPO/FOLIO/ACCION REFERENCIA` + `5:|52|0|{fecha}`) para poder reintentar de inmediato con `scripts/test-caso4-global-sintetico.js --reset --aprobar` sin rearmar el código. **Los tests unitarios de `mensaje-builder.spec.ts` (Caso 4 Global) no reflejan este código experimental** — no se tocaron porque el bloque no es la solución final, solo una prueba en curso.

**Detalle completo:** `docs/consulta-enternet-referencia-global.md`, sección "Actualización 2026-07-03 (tarde)".

---

### 2026-07-02 (sesión 3) — Caso 4 (Global/overflow >40 refs) implementado, SIN validar en QA

**Contexto:** el usuario aportó 5 XML de salida reales de Enternet (`docs/ejemplos caso 4/*.xml` — facturas de terceros/panaderías, no emitidas por este sistema) para confirmar el formato objetivo de Caso 4 antes de implementarlo, y pidió construir fixtures propios con el trío empkey/emisor/cliente ya confirmado vigente.

**Análisis de los 5 XML de ejemplo:** confirmaron el formato ya predicho por el PRD:
- `<Detalle>`: 1 sola línea, `NmbItem="Segun Guias:"`, `DscItem` = folios completos separados por espacio, `MontoItem` = **neto total** (no el total con IVA).
- `<Referencia>`: 1 sola línea `TpoDocRef=52`, `IndGlobal=1`, `FolioRef=0`, `FchRef`=fecha del documento — sin listar cada guía.

**Punto sin resolver:** ni el spec Enternet V5 ni `CONTEXT.md` documentan qué pipe-format (`4:\|`/`5:\|`) dispara ese `IndGlobal=1`/`FolioRef=0` del lado de Enternet. El usuario señaló la tabla `ACCION REFERENCIA` del spec (valores 1-5, incluyendo "5 = REFERENCIA GLOBAL") como la referencia a usar — pero esa tabla está documentada explícitamente como aplicable "SOLO SI ES NOTA DE CREDITO O DEBITO", no para Factura. Se implementó igual por indicación explícita del usuario; **queda como hipótesis sin confirmar** hasta hacer una emisión real.

**Archivos modificados:**
- `src/mensaje/mensaje-builder.ts` — `MAX_REFERENCIAS_INDIVIDUALES = 40` (export). `isGlobal = guias.length > 40` (cuenta solo guías, no OC/HES — decisión explícita de alcance de esta sesión, ver Pendientes). Cuando `isGlobal`:
  - Detalle: `3:|1|AFECTO|Segun Guias:|1|{sumNeto}|0|{sumNeto}|{folios espacio-separados}` — anula `modoDetalle` (S.G. o POR_PRODUCTO). Requiere una 9na columna `DESCRIPCION ADICIONAL` en el header `2:|`, declarada **solo si isGlobal** (los demás modos no tocan el header ya confirmado en Casos 1-3, para no arriesgar esas emisiones ya validadas).
  - Referencia: se omiten las líneas `4:|`/`5:|` y se agregan al encabezado `1:|`: `TIPO DOC REFERENCIA=52`, `FOLIO DOC REFERENCIA=0`, `ACCION REFERENCIA=5`.
- `src/mensaje/mensaje-builder.spec.ts` — describe nuevo `buildMensaje — Caso 4 (Global)`, 6 tests (boundary 40 vs 41, anula POR_PRODUCTO, suma de neto, ausencia de `4:|`/`5:|`, presencia de los 3 campos de encabezado, ausencia de esos campos en ≤40).
- `CONTEXT.md` — sección "Modo de Detalle de Factura" → Global, documentando la implementación y la advertencia de hipótesis sin confirmar.

**Decisión de alcance explícita:** el diseño completo (PRD/CONTEXT.md) exige que el umbral de 40 cuente el total de referencias (guías + OC 801 deduplicadas + HES deduplicadas), pero `parseReferencias()` y todo el manejo de OC/HES **no existen todavía en el código**. Se decidió NO construirlos en esta sesión — el umbral de esta implementación cuenta solo guías. Queda como TODO explícito para una sesión futura.

**Tests:** 210/210 verdes (15 suites), sin regresión en Casos 1-3.

**Handoff:** `C:\tmp\handoff-guias-middleware-caso4-global-20260702.md`.

---

### 2026-07-02 (sesión 2) — Emisión real QA de Casos 2/3 (Por Producto) con guías sintéticas

**Sin cambios de código funcionales**, salvo fixes permanentes en `scripts/test-por-producto-sintetico.js` (constantes de fecha/emisor). Motivo: retest pedido por el usuario ("intentemos a ver si pasa con los datos sintéticos") para confirmar Casos 2/3 con `/aprobar` real, no solo `preview-mensaje` (la sesión de creación de fixtures del 2026-07-01 nunca había tocado Enternet).

**Resultado: ✅ `gfackey=98` (empkey 1163) → EMITIDA, folioSii=411208** — 7 guías sintéticas (3 Caso 2 + 4 Caso 3) en una sola factura, PDF/XML generados por Enternet.

**Camino hasta el resultado (2 bloqueadores encontrados y resueltos):**
1. **Emisor `764079302` (el hardcodeado en el script original) ya no tiene RutUsuario registrado en Enternet QA.** Se probaron `18467599-4` y `16714595-7` (ambos habían funcionado en sesiones previas para distintos emisores) → los dos rechazados con `[TraductorErr1] Codigo de encargado de Facturacion {rut} no está Registrado en Enternet`. El registro de encargados en Enternet QA cambió/se reseteó entre el 2026-06-19 y el 2026-07-02 sin aviso. Fix: cambiar el script a emisor `968880004` (el mismo que emitió `gfackey=86`/folioSii=411207 el mismo día), que sí tiene `16714595-7` vigente.
2. **Fechas sintéticas en año 2099 (elegidas para no chocar con guías reales del cliente, que solo tiene datos en `2026-06`) rompen la validación real de Enternet** — `preview-mensaje` no lo detecta (no valida contra Enternet), pero `/aprobar` sí: `[ErrorRefFecha01] Fecha de Referencia de Documento Tipo 52 invalida {dd}/{mm}/99` (Enternet trunca el año a 2 dígitos y lo rechaza como inválido). Fix: usar `2026-05` en vez de `2099-01` como período sintético (sigue sin chocar con datos reales del cliente).

**Archivos modificados:**
- `scripts/test-por-producto-sintetico.js` — `RUT_EMISOR` cambiado a `'968880004'`, `PERIODO` a `'2026-05'`, fechas de `GUIAS[]` actualizadas a mayo 2026 (antes 2099-01).

---

### 2026-07-02 — Fix redondeo IVA/MONTO TOTAL + límite de 40 referencias confirmado E2E (Enternet ya lo subió)

**Bug real encontrado y arreglado — redondeo de IVA (`src/mensaje/mensaje-builder.ts`):**
- Síntoma en QA: al emitir una proforma de 40 guías reales (empresa `1163`, cliente `76407930-2`), Enternet rechazó con `[ValNormativaErr1] Error:FEE Folio 0, Neto x TasaIVA <> IVA , 31080 x 19.00 <> (5920/100)`.
- Causa: `sumIva` sumaba los `totiva` **ya redondeados por guía** (40×148=5920), pero Enternet valida `IVA == round(Neto_total × 19%)` (31080×0.19=5905.2→5905). Con pocas guías el drift acumulado no alcanzaba a romper la validación; con 40 guías del mismo perfil de montos, sí.
- Fix: `sumIva = Math.round(Number(sumNeto) × 0.19)` en vez de sumar `totiva` por guía; `MONTO TOTAL` (`sumDoc`) también corregido a `sumNeto + sumIva + sumExento`.

**E2E real — límite de 40 referencias confirmado:** `gfackey=86` (40 guías reales) → `POST /empresas/1163/facturas/emision` → **EMITIDA, folioSii=411207**. Confirma que Enternet subió el límite de 20 a 40. `MAX_GUIAS_POR_FACTURA` queda en `40` permanente en `facturas.service.ts`.

---

### 2026-07-01 (sesión 2) — Test E2E real: límite de referencias confirmado en 20 (no 40)

**Resultado: el límite real de Enternet en ese momento era 20**, confirmado con 3 casos independientes (30 guías reales, 40 reales, 40 sintéticas, todas fallaron con `[TraductorErr1] Numeración de líneas de Mensaje Incorrecta`; 4 proformas ya EMITIDA tenían exactamente 20 guías cada una). El umbral subió a 40 recién en la sesión del 2026-07-02 (arriba), tras coordinación con el otro dev de Enternet.

---

### 2026-07-01 — grill-with-docs: Caso 1 (S.G.) validado con dev senior, GLOSA eliminado

**Decisiones tomadas (actualizadas en `CONTEXT.md`):**
- **Texto Caso 1 (S.G.) corregido**: `"Facturación según guías período {periodo}"` — reemplaza la decisión anterior de listar folios. Esa idea de listar folios queda para Caso 4 (Global) únicamente.
- **`GLOSA` eliminado en Caso 1**: no se envía `1:|GLOSA|...`. El PDF mostraba esto como bloque "Observaciones" duplicando `<Referencia>` — puro ruido según el senior.
- **Documento oficial Enternet V5 localizado**: `docs/FormatodeIntegracinbasadoenEtiquetasEstndarv5.html`.

---

### 2026-06-30 — Auditoría de memoria (MEMORY.md) contra código real: drift corregido

**Hallazgos (memoria desactualizada vs. código real):** modelo de datos de Proforma cambió y nunca quedó documentado (`gde.factura` con `gclirut`/`reglaidl` propios + tabla puente `gde.facturaguias`); `generar()` agrupa por `(gclirut, guireglaidl)` no por `guivaloragrupador`; `MAX_GUIAS_POR_FACTURA=20` en ese momento; estado `ANULADA` nuevo sin documentar; `assignRegla` ya no distingue "primera activación" vs "cambio de regla"; filtro real de disponibilidad es `guireglaidl IS NOT NULL`; migraciones `006`/`007` ya no existen como archivos en `sql/`.

**Lección para el futuro:** la memoria persistente describe intención/diseño de una sesión puntual y puede quedar desactualizada silenciosamente cuando el código sigue evolucionando sin que se actualice la memoria en el mismo PR. Conviene re-verificar contra el código fuente cuando se sospeche drift.

---

### 2026-06-19 — E2E QA via PATCH /aprobar confirmado: folioSii=917, emisor 764079302

Migración `sql/008-rut-emisor-factura.sql` aplicada en DB local. `POST /empresas/977/guias/recomputar` para 66 guías con `guivaloragrupador=NULL`. E2E completo `generar`→`aprobar` → `EMITIDA, folioSii=917`. Descubrimiento: `generar` filtra `guivaloragrupador IS NULL`; ejecutar `recomputar` si el sync fue incompleto. `listarProformas` filtra por `gfacfecha` (fecha de creación), no por período de las guías.

---

### 2026-06-03 (4 sesiones) — Flujo de emisión DTE completo

- Fix `backoffice-adapter.service.ts`: `emitirDte()` devuelve `ResultadoDTE` plano, no envuelto — el service leía `body.ResultadoDTE` y siempre tiraba 422 aunque Enternet respondiera OK.
- `rut_emisor` almacenado en `gde.factura` (migración `sql/008`) — fuente única de verdad para el emisor, independiente del XML de la guía. `generar`/`crearProforma` exigen `?rut=` igual que `sync`.
- `RutUsuario` en emisión = encargado de facturación registrado en Enternet (≠ `RutEmisor`), configurable vía `FACTURACION_RUT_USUARIO` en `.env`.
- Flujo completo `aprobar()`→emite→`EMITIDA`/`FALLIDA`; retry batch `emitirPendientes`/`POST /facturas/emision`.
- Bug de test recurrente: mutar el mismo objeto `factura` en 2 `save()` consecutivos rompe `toHaveBeenNthCalledWith` — usar `objectContaining` sin `nth`.

---

### 2026-06-02 (4 sesiones) — MensajeBuilder V5, Preview Mensaje, bugfixes de RUT/columnas

- `MensajeBuilder` (`src/mensaje/mensaje-builder.ts`) implementado, 39 tests. Preview Mensaje: Modo 1 (<20 guías, 1 línea por guía) y Modo 2 (≥20, total + GLOSA con tabla) aprobados en QA real.
- Bugfix `assignRegla`: early return bloqueaba recompute en primera activación; `_recomputarGuiasClientePorPeriodo` buscaba con `CsvRut` en vez de `XmlRut` (0 resultados siempre).
- Bugfix `column g.guireglaagrupadora does not exist`: migración `006` renombró la columna a `guireglaidl`/`guivaloragrupador`, un query raw en `facturas.service.ts` seguía con el nombre viejo.

---

## Bugs Resueltos (histórico, ya en código desde hace tiempo)

- Redondeo de IVA/MONTO TOTAL (2026-07-02): `sumIva`/`sumDoc` deben derivarse de los totales agregados, no sumar valores ya redondeados por guía.
- `clientes.reglaidl` NOT NULL violation: migración creó la columna NOT NULL pese a `nullable: true` en la entity — corregido con `ALTER TABLE ... DROP NOT NULL`.
- FK `iguia1` violation por mismatch de formato de RUT (CSV sin guión vs XML con guión) — normalizar con `toCsvRut`+`normalizeToXml` antes de insertar.

## Lecciones Aprendidas (histórico)

- Cuando un bug está confirmado del lado de un proveedor externo y se pausa el trabajo, dejar el código "listo para reintentar" (marcado EXPERIMENTAL) sin revertir permite confirmar el fix con un solo comando en cuanto avisan.
- No asumir umbrales de un PRD como verificados solo porque suenan razonables — validar contra el sistema externo antes de diseñar sobre un número no confirmado (ej. el umbral de 40 refs resultó ser 20 hasta que Enternet lo subió).
- Un par RutUsuario+emisor confirmado funcional en una sesión anterior puede dejar de funcionar sin aviso — retestear antes de asumir que sigue vigente.
- Sumar valores ya redondeados por unidad (IVA, totales) en vez de redondear la suma agregada acumula drift silencioso que solo aparece a escala.
- Cuando se introduce una tabla puente o columnas nuevas en una entity, actualizar la memoria persistente en el mismo momento — si no, la próxima sesión parte de un modelo mental incorrecto.
- Los archivos de migración SQL pueden desaparecer del repo después de aplicarse — para verificar el schema real, preferir `\d gde.<tabla>` contra la DB antes que buscar el archivo.

## Contexto Crítico (histórico — mayormente migrado a la memoria persistente del agente)

Ver memoria persistente del agente (`archivos-clave.md`, `schema-db.md`, `reglas-y-sync.md`, `gotchas.md`, `emision-dte-historial.md`, `api-endpoints.md`) para las versiones vigentes de estos datos. Este bloque queda solo como respaldo textual de cómo estaban documentados al 2026-07-13.
