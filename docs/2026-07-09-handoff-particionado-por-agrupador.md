# Handoff 2026-07-09 — ¿debe `generarProformas` partir por `guivaloragrupador` (1 factura : 1 OC : 1 HES)?

## Contexto: de dónde sale este handoff

Sesión 2 del `docs/PLAN-verificacion-e2e-completa.md` (ejercitar `extraeReferenciaPorTipo` de punta a punta contra QA real) **se ejecutó con éxito el 2026-07-09**:

- Camino real completo confirmado: `POST /reglas` → `PUT /clientes/:rut/regla?recomputar=true` → `POST /sync` → `POST /generar` → `PATCH /aprobar`.
- El fix de recompute (PR #20, `.trim()` en llaves de Map de `GroupingService`) quedó confirmado en el server real `:3334`: las 2 guías sintéticas se agruparon bien (folio 990301 → OC `555001`, folio 990302 → HES `777002`).
- **Emisión real contra Enternet QA: folioSii=411228, EMITIDA** (gfackey=139, folio interno 122, montoTotal 42840). El XML emitido lleva las 4 referencias correctas: `801/555001` (OC), `HES/777002`, `52/990301`, `52/990302`. Script: `scripts/test-referencia-por-tipo-e2e.js`.

Durante esa ejecución se **confirmó el pendiente `OPEN-2`**: `generar` metió las 2 guías (con `guivaloragrupador` DISTINTO: 555001 vs 777002) en **una sola proforma**, no una por OC/HES. El usuario quiere resolver esto en una sesión dedicada. Este doc deja el estado exacto para que otro agente lo resuelva sin re-investigar.

## La decisión de negocio (dicho por el usuario, 2026-07-09)

> "1 factura por OC o HES. **1 Factura : 1 OC : 1 HES**. Si se indica que son juntos es otra cosa (OC+HES). Una cosa es **cómo agrupamos las guías en una factura** y otra **la referencia que trae una factura**."

Lectura del pedido:

- La regla `extraeReferenciaPorTipo` (agrupar por OC/HES) **SÍ debe particionar**: cada OC distinta → su propia factura; cada HES distinta → su propia factura. No mezclar OCs/HES distintas en una misma factura.
- El caso "OC+HES juntos en una misma factura" es un caso aparte y explícito (no el default).
- Distinción clave que el usuario recalca: **el particionado (qué guías caen en qué factura) es independiente de las referencias que la factura emite**. Hoy las referencias salen bien (re-parseando el XML de cada guía en emisión); lo que falta es el particionado.

## Estado real del código HOY (verificado 2026-07-09)

1. **`guivaloragrupador` se computa y persiste correctamente** por guía (`GroupingService.batchComputeAgrupadores` → `REGLA_REGISTRY.extraeReferenciaPorTipo`, `src/reglas/grouping.service.ts`). Para OC/HES = el `FolioRef` de la referencia. Confirmado en QA.

2. **`generarProformas` NO usa `guivaloragrupador` para nada.** Agrupa SOLO por `(gclirut, guireglaidl)`:
   - `src/facturas/facturas.service.ts:251-266` — el SELECT de guías disponibles **ni siquiera trae** `guivaloragrupador`.
   - `src/facturas/facturas.service.ts:269-274` — `const key = ${guia.gclirut}|${guia.guireglaidl}`.
   - `src/facturas/facturas.service.ts:285-296` — el chequeo de "BORRADOR ya existente" es por `(empkey, gclirut, reglaidl, periodo)`.
   - `crearManual` (`:308+`) tiene la misma lógica: filtra por `(gclirut, reglaidl)`, no por valor.

3. **`guivaloragrupador` en producción solo se LEE en un lugar**: `src/empresas/empresas.service.ts:141` (`const key = g.guivaloragrupador || '_sin_regla'`), para armar el preview read-only `GET /empresas/:empkey/guias/agrupadas`. No toca facturas ni emisión.

4. **Las `<Referencia>` OC/HES de la factura NO vienen de `guivaloragrupador`.** Vienen de re-parsear el XML de cada guía en emisión:
   - `src/facturas/facturas.service.ts:616-630` — `_extraerReferenciasExternas(docs)` → `parseReferencias(doc.rawXml)`.
   - `src/mensaje/mensaje-builder.ts:349-362` — emite las líneas `5:|801|...` y `5:|HES|...`.
   - Esto explica por qué la factura combinada del folioSii=411228 salió con AMBAS referencias (OC y HES) aunque son de guías distintas: cada guía aportó su referencia parseada.

### Consecuencia

Hoy `extraeReferenciaPorTipo` es **funcionalmente equivalente a cualquier otra regla** para el particionado: mete todas las guías del cliente+regla en una factura. El valor de agrupador solo cambia lo que muestra el preview `/guias/agrupadas`. El nombre de la regla y el paso 4 del plan ("cada proforma = una OC/HES distinta") describen la intención deseada, NO el comportamiento actual.

## El problema a resolver (y el riesgo)

El fix "natural" sería que `generarProformas` (y `crearManual`) agrupen por `(gclirut, guireglaidl, guivaloragrupador)` en vez de `(gclirut, guireglaidl)`.

**RIESGO PRINCIPAL — regresión de `extraeTagLista`:** `generarProformas` es un camino compartido por TODAS las reglas. `extraeTagLista` (ej. `por_comuna`) está en uso productivo desde 2026-05 con folios reales. Si se agrega `guivaloragrupador` a la llave de forma global, `extraeTagLista` **también** empezaría a partir por su valor (una factura por comuna, por razón social, etc.). Hay que confirmar si eso es deseado o si rompería el comportamiento que producción espera hoy (posiblemente "1 factura por cliente" independiente de la comuna).

## Preguntas abiertas que el agente debe resolver ANTES de codear

1. **¿El particionado por valor debe ser por-regla o global?**
   - Opción A (global): cambiar la llave a `(gclirut, guireglaidl, guivaloragrupador)` para todas las reglas. Simple, pero cambia `extraeTagLista`. ¿Es aceptable / deseado?
   - Opción B (por-regla): marcar en la config de la regla (`reglaconfig` JSONB) si particiona por valor (ej. `particionaPorValor: true`), y que `generar` solo agregue `guivaloragrupador` a la llave cuando el flag esté activo. Más seguro (no toca `extraeTagLista`), más código. **Recomendación tentativa: opción B**, pero confirmar con el usuario.

2. **¿Qué hace `extraeTagLista` HOY en producción con clientes que tienen guías de valores distintos?** ¿Ya produce 1 factura por cliente (juntando comunas distintas)? Si es así, ¿está bien o es un bug latente que nadie notó porque los clientes reales tienen un solo valor? Verificar con datos reales de QA / preguntar al usuario.

3. **El caso "OC+HES juntos" que mencionó el usuario:** ¿cómo se indica? ¿Es una regla distinta (`tiposReferencia: ['801','HES']` con semántica "juntar") vs una que particiona? Hoy `tiposReferencia: ['801','HES']` produce `guivaloragrupador` = el folio del PRIMER tipo que matchee (ver `extrae-referencia-por-tipo.ts`). Revisar cómo se comporta una guía que tiene AMBAS (OC y HES) — ¿a qué grupo cae? Esto afecta el diseño del particionado.

4. **Chequeo de BORRADOR existente y `crearManual`:** si se cambia la llave de agrupación, hay que actualizar TAMBIÉN el chequeo de duplicados (`:285-296`) y la lógica de `crearManual` (`:308+`) para que sean consistentes con la nueva llave, o se generarán duplicados / falsos skips.

## Puntos de anclaje en el código (para el que implemente)

- `src/facturas/facturas.service.ts:235-306` — `generarProformas` (la función a cambiar).
- `src/facturas/facturas.service.ts:308+` — `crearManual` (misma lógica, cambiar en paralelo).
- `src/facturas/facturas.service.ts:616-630` — `_extraerReferenciasExternas` (referencias; NO tocar, ya funciona).
- `src/reglas/parsers/referencia-por-tipo/extrae-referencia-por-tipo.ts` — cómo se computa el agrupador OC/HES.
- `src/reglas/parsers/regla-config.types.ts` — tipos de `reglaconfig`, si se va por opción B (flag por regla).
- Tests a extender: `src/facturas/facturas.service.spec.ts`, `src/reglas/dto/create-regla.dto.spec.ts` (si se agrega flag).

## Cómo reproducir / verificar en QA

Script listo: `scripts/test-referencia-por-tipo-e2e.js` (cliente `76407930-2` / empkey `1163`, periodo `2026-08`, guías sintéticas `guitipo=993` folios 990301/990302, restaura el `reglaidl` del cliente al final).

```
node scripts/test-referencia-por-tipo-e2e.js --reset            # sin emitir (preview)
node scripts/test-referencia-por-tipo-e2e.js --reset --aprobar  # emite real contra Enternet QA
```

Requiere server en `:3334` con el código de la branch. Tras el fix esperado: `generar` debería crear **2 proformas** (una para 555001, otra para 777002), no 1. Actualizar la aserción del script (hoy solo verifica el agrupador, no cuenta proformas) para chequear el particionado.

## Evidencia dejada en QA esta sesión

- folioSii=411228 EMITIDA (factura combinada OC+HES — es el comportamiento VIEJO, dejada como línea base / evidencia de que el pipeline emite bien).
- gde.regla `test_referencia_oc_hes` y gde.reglaempresa `(1163, test_referencia_oc_hes)` persisten (reusables).
- Cliente `(1163, 76407930-2)` con `reglaidl` restaurado a `por_comuna` (valor previo, no roto).
