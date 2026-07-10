# Handoff 2026-07-10 — Sesión 3 del plan E2E: multi-cliente/multi-regla en un solo sync (versión "ez pz")

## Contexto: de dónde sale este handoff

`docs/PLAN-verificacion-e2e-completa.md` deja la **Sesión 3** pendiente: confirmar que `syncFromReporte`
y `generarProformas` no mezclan clientes ni reglas cuando hay 2+ clientes con reglas de agrupación
distintas en la misma corrida. Nunca se probó porque todos los scripts sintéticos existentes usan un
único tenant (`empkey=1163`/`gclirut=76407930-2`).

El 2026-07-10 se usó el skill `grilling` para encontrar la vía más barata de ejecutar esta sesión (el
usuario pidió explícitamente una versión "ez pz"). Este doc deja el plan ya acordado con el usuario
para que otro agente lo ejecute sin re-derivar las decisiones. **No se ejecutó nada todavía — es
plan aprobado, pendiente de implementación.**

## Investigación de código ya hecha (no repetir)

- `generar` exige `?rut=` a nivel de **controller** (`facturas.controller.ts:51-61`, 400 si falta),
  pero `FacturasService.generar()` (`facturas.service.ts:276-338`) **no usa ese `rut` como filtro de
  cliente** — el SELECT de guías ya trae todos los clientes del `empkey`, y `agruparPorValorAgrupador`
  ya particiona por `(gclirut, reglaidl, valorAgrupador)` sin importar cuántos clientes/reglas haya.
  El `rut` se guarda tal cual como `rut_emisor` del DTE (issuer), no filtra nada.
- `GroupingService.batchComputeAgrupadores` (`grouping.service.ts:41-83`) ya está indexado por
  `gclirut` de forma genérica (`Map` keyed by client, trimmed tras el fix de PR #20), sin ningún caso
  especial según qué `fn` de regla (`extraeTagLista` vs `extraeReferenciaPorTipo`) tenga cada cliente.
- **Conclusión:** el código YA soporta multi-cliente/multi-regla en un solo batch/generar. Lo que
  falta es *evidencia* de que efectivamente funciona así en la práctica, no un cambio de código.
- `empkey=977` (empresa real "ACEROS AZA S.A.") ya tiene **13 clientes reales con 4 reglas
  `extraeTagLista` distintas mezcladas** (`por_comuna` ×9, `por_razon_social` ×1, `por_ciudad` ×1,
  `por_direccion` ×1) corriendo en sync real desde 2026-05 — es decir, el lado `extraeTagLista` del
  riesgo YA está probado por el uso productivo diario. **Se descartó usarlo de todos modos** (ver
  decisiones) porque el usuario indicó que ese empkey no tiene la config de emisor lista, a
  diferencia de `1163`.
- `gde.reglaempresa` para `empkey=1163` ya tiene 3 reglas asignadas: `por_razon_social`,
  `por_comuna`, `test_referencia_oc_hes` — no hace falta crear ninguna regla nueva, `por_comuna` ya
  está disponible para asignar al cliente nuevo.
- `gde.clientes` tiene columnas simples: `empkey, gclirut, gclinom, reglaidl (nullable), modo_detalle
  (nullable)`. FK `iclientes1` exige que `(empkey, reglaidl)` ya exista en `reglaempresa` antes de
  setear `reglaidl` en el cliente — insertar el cliente nuevo con `reglaidl=NULL` primero, asignar
  después vía `PUT /clientes/:rut/regla`.

## Decisiones ya acordadas con el usuario (grillado 2026-07-10, no volver a preguntar)

1. **Sí se emite al final** (no frenar en `generar` — llegar a `PATCH /aprobar` con folioSii real).
2. **Todo bajo `empkey=1163`.** No tocar `empkey=977` ni ninguna otra empresa real — el usuario
   explícitamente pidió no usar 977 porque no tiene la config de emisor lista y cambiarla es
   trabajoso.
3. **Diseño de 2 clientes, ambos bajo `empkey=1163`:**
   - Cliente existente `gclirut=76407930-2` → sigue con `extraeReferenciaPorTipo` (OC/HES), mismo
     patrón que la Sesión 2 (`scripts/test-referencia-por-tipo-e2e.js`).
   - Cliente **nuevo sintético** (rut ficticio con dígito verificador válido, formato
     `character(20)` estilo `76407930-2`, no reservado por ningún otro script) → regla `por_comuna`
     (`extraeTagLista`) con **2 valores de tag (comuna) distintos** en sus guías sintéticas, para que
     también parta en 2 proformas por sí solo.
   - Ambos clientes reciben guías sintéticas en el **mismo período nuevo** y se corre **un solo**
     `POST /sync` (informativo) + **un solo** `POST /generar` que debe cubrir a los dos.
4. **Se saltea forzar chunking (40 guías) / Caso Global** en esta sesión — ya está confirmado en
   sesiones anteriores (folioSii 411211, 411219, 411226, 411227) y no aporta nada nuevo acá.

## Implementación propuesta

Nuevo script `scripts/test-multi-cliente-multi-regla-e2e.js`, clonando el patrón de
`scripts/test-referencia-por-tipo-e2e.js` (mismo estilo: flags `--reset`/`--aprobar`, conexión
directa a Postgres + fetch real a `localhost:3334`):

- **Constantes:** `EMPKEY='1163'`, `RUT_EMISOR='968880004'` (mismo par vigente), `PERIODO='2026-09'`
  (próximo período futuro libre — los ya usados por otros scripts son 2025-11, 2025-12, 2026-01,
  2026-02-10, 2026-03-10, 2026-04, 2026-08).
- **`guitipo` sintéticos nuevos** (los usados hoy son 993/994/995/996/997/998/999): usar `992` para
  las guías del cliente nuevo (`por_comuna`) y nuevos folios bajo `993` para 2 guías OC/HES
  adicionales del cliente existente en el período `2026-09` (reusar los fixtures
  `test/fixtures/oc-hes/guia-oc.xml` y `guia-hes.xml`, mismo patrón `toDataUrl`).
- **Cliente nuevo — setup previo (dentro del script):**
  1. Elegir un RUT sintético con dígito verificador válido, no reservado por ningún otro script.
  2. `INSERT INTO gde.clientes (empkey, gclirut, gclinom, reglaidl) VALUES ('1163', '<rut-nuevo>', 'Cliente Sintético Multi-Regla', NULL)`.
  3. Insertar 2 guías sintéticas para este cliente (`guitipo=992`) **sin `guireglaidl`/
     `guivaloragrupador`** (igual que `test-referencia-por-tipo-e2e.js`, para que el recompute real
     las agrupe), con 2 valores de tag de comuna distintos (revisar `src/reglas/parsers/` /
     `REGLA_REGISTRY` para el tag exacto que lee `por_comuna` vía `extraeTagLista`).
- **Flujo del script (idéntico orden que `test-referencia-por-tipo-e2e.js`):**
  1. `--reset`: borra `facturaguias`/`guia` de ambos `guitipo` (992 y los folios nuevos de 993), y el
     cliente nuevo de `gde.clientes` si existe.
  2. Insertar guías sintéticas (ambos clientes).
  3. `PUT /empresas/1163/clientes/<rut-nuevo>/regla` con `{ reglaIdl: 'por_comuna', recomputar: true, periodo: '2026-09' }`.
  4. `PUT /empresas/1163/clientes/76407930-2/regla` con `{ reglaIdl: 'test_referencia_oc_hes', recomputar: true, periodo: '2026-09' }` (la regla ya existe desde la Sesión 2 — verificar que sigue en `gde.regla` antes de asumirlo, no volver a `POST /reglas` si no hace falta).
  5. Verificar en DB que `guivaloragrupador` quedó bien para las 4 guías (2 comunas distintas + OC/HES).
  6. `POST /empresas/1163/sync?rut=968880004&periodo=2026-09` (informativo, una sola vez, cubre ambos clientes).
  7. `POST /empresas/1163/facturas/proforma/generar?rut=968880004&periodo=2026-09` (una sola vez, sin filtrar por cliente).
  8. Verificar en DB: deben aparecer **4 proformas** (2 por las comunas distintas del cliente nuevo +
     2 por OC/HES del cliente existente), cada una con las guías correctas y **sin mezclar `gclirut`
     entre proformas**.
  9. Con `--aprobar`: `PATCH /aprobar` de cada una de las 4 → confirmar 4 folioSii reales.
  10. `finally`: restaurar `reglaidl` previo del cliente `76407930-2` (compartido con otros scripts).
      El cliente nuevo es dedicado a esta sesión, no lo comparte nadie más — no necesita restore.

## Verificación

- No se toca código de producción, solo un script nuevo — correr `pnpm test` de todos modos por las
  dudas (no debería cambiar nada, pero confirma que no se rompió nada mientras tanto).
- Correr primero **sin** `--aprobar` para validar el particionado en BORRADOR antes de gastar folios
  reales.
- **Criterio de éxito:** 1 corrida de `sync`+`generar` produce exactamente 4 proformas correctamente
  repartidas (2 comunas + OC + HES), ninguna guía cruzada entre `gclirut`, y con `--aprobar` las 4
  quedan `EMITIDA` con folioSii reales.
- Al cerrar: actualizar `docs/PLAN-verificacion-e2e-completa.md` (marcar Sesión 3 con resultado y
  folios) y `docs/ESTADO.md`, siguiendo el mismo formato que las Sesiones 1 y 2. Actualizar también
  la memoria del agente (`plan-verificacion-e2e.md`) con el resultado.

## Cómo continuar (para el agente que retome esto)

1. Leer este doc completo antes de tocar nada.
2. Verificar que las 3 reglas de `gde.reglaempresa` para `empkey=1163` siguen siendo
   `por_razon_social`, `por_comuna`, `test_referencia_oc_hes` (pueden haber cambiado entre sesiones).
3. Escribir el script, correrlo sin `--aprobar`, revisar el particionado en BORRADOR, y solo después
   correr con `--aprobar` contra QA real.
4. Dejar el resultado (folios, gfackeys, cualquier hallazgo) documentado en este mismo archivo o en
   uno de cierre de sesión, y actualizar el checklist de `docs/PLAN-verificacion-e2e-completa.md`.
