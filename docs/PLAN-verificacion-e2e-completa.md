# Plan de verificación E2E completa del backend — sync → agrupación → facturación → emisión

Fecha de creación: 2026-07-08. Fuente de verdad de contexto: `docs/ESTADO.md` (historial técnico completo), memoria persistente del agente (`referencias-oc-hes.md`, `extrae-referencia-por-tipo.md`, `detalle-factura.md`, `reglas-y-sync.md`, `schema-db.md`).

## Por qué este plan

Hasta el 2026-07-08 cada pieza del backend fue validada **aislada**:

- Casos 1-4 de Detalle+Referencia (S.G., Por Producto, Global) y OC/HES: confirmados en QA real, pero casi siempre insertando guías sintéticas **directo en la BD** (`scripts/test-*-sintetico.js`) o vía `crearManual` apuntando a un cliente de prueba dedicado (`empkey=1163`). Estos scripts **bypasean** el sync real y, en varios casos, el cómputo de agrupador.
- `extraeReferenciaPorTipo` (agrupar guías por OC/HES, PR #10) está mergeado, con tests unitarios verdes, pero **nunca se creó una regla de este tipo vía API real** ni se corrió un sync real que la ejercite — el `CreateReglaDto` ni siquiera acepta ese `fn` todavía.
- Nunca se confirmó el camino 100% natural: `POST /sync` real (backoffice) → `GroupingService` computa agrupador real → `generarProformas` (sin bypass) agrupa correctamente → `aprobar` emite — para ninguno de los dos `fn` de agrupación (`extraeTagLista`, `extraeReferenciaPorTipo`) al mismo tiempo que los casos de Detalle/Referencia ya validados.

El pedido de esta sesión es ampliar el campo de visión: dejar de verificar features aisladas y confirmar que **la máquina completa** (sync real → agrupación real por ambas funciones → facturación → emisión) funciona de punta a punta con documentos reales, no solo con atajos sintéticos.

## Metodología: tracer bullet

Cada sesión ejecuta primero un camino **angosto pero completo** (un cliente, una regla, un período) recorriendo TODAS las etapas antes de ampliar cobertura. No profundizar en una etapa sin haber cerrado el círculo completo primero. Motivo: si algo del "cableado" entre etapas está roto (por ejemplo, `generarProformas` con datos reales de un cliente nunca tocado por scripts), es más barato descubrirlo con el camino más corto posible.

Cada sesión termina con: qué se confirmó, qué se encontró roto (si algo), y qué evidencia queda en QA (folioSii, gfackey) para que el usuario la revise.

⚠️ Nota operativa: varias sesiones de este plan hacen `PATCH /aprobar` real contra Enternet QA (emisión real, folios SII reales, mutación de estado compartido). Esto ya es una práctica establecida en el proyecto (ver historial), pero cada sesión debe confirmarlo explícitamente antes de ejecutar contra QA, no asumir luz verde permanente.

## Gap actual (qué falta probar, concretamente)

| Función de agrupación | Wireada vía API | Probada con sync real | Probada con `generarProformas` real | Emisión real confirmada |
|---|---|---|---|---|
| `extraeTagLista` | ✅ | ✅ (uso normal desde 2026-05) | ✅ | ✅ |
| `extraeReferenciaPorTipo` | ❌ (`CreateReglaDto` no acepta este `fn`) | ❌ | ❌ | ❌ |

| Camino | Confirmado con datos reales de punta a punta (sin scripts de bypass) |
|---|---|
| `sync` → agrupador → `generarProformas` → `aprobar`, Caso 1 (S.G.) | Parcial — validado el Detalle/Referencia, pero folios históricos (884, 917, 411203-411207) fueron pre-Detalle-nuevo o mezclados con chunking, no una corrida "limpia" reciente |
| Ídem con Casos 2/3 (Por Producto) | ❌ — todo folioSii de Por Producto (411208-411210, 411215-411216) viene de `test-por-producto-sintetico.js`, que inserta guías sintéticas y usa `crearManual` con período aislado |
| Ídem con Caso 4 (Global, >40 guías) | ❌ — folioSii 411211/411219 vienen de `test-caso4-global-sintetico.js`, inserción directa en BD (bypassa `MAX_GUIAS_POR_FACTURA` a propósito) |
| Ídem con OC/HES | ❌ — todos los folios (411212-411214, 411217) vienen de guías sintéticas; sigue sin existir un XML real de cliente con `<Referencia>` 801/HES poblada (pendiente `OPEN-1` en `ESTADO.md`) |
| Multi-cliente / multi-regla en un mismo `sync` | ❌ — no hay evidencia registrada de una corrida real con 2+ clientes con reglas distintas en la misma ejecución |
| `assignRegla` + recompute sobre volumen real de guías ya sincronizadas (no 3-7 guías de fixture) | ❌ |

## Sesiones

### Sesión 1 — Tracer bullet base: sync real → `extraeTagLista` → `generarProformas` → `aprobar`

**Estado (2026-07-08): cerrada sin ejecutar, no bloqueante.** Decisión del usuario: `extraeTagLista` ya está en uso productivo desde 2026-05 con folios reales (ver gap table arriba), y encontrar un cliente QA no contaminado por scripts sintéticos depende de terceros (tiempo de espera de semanas, ya ocurrido antes). El costo de re-confirmar este camino con un tracer bullet dedicado no se justifica frente al gap real (Sesión 2). Se retoma solo si aparece evidencia concreta de que el camino natural de `extraeTagLista` está roto.

**Objetivo original (referencia, no ejecutado):** confirmar el camino 100% natural para el `fn` que ya está en producción, con un cliente real (no dedicado a pruebas) y sin ningún script de bypass.

1. Elegir un cliente real de QA con regla `extraeTagLista` ya asignada, que **no** haya sido tocado por los scripts sintéticos de sesiones anteriores (evitar `empkey=1163`/cliente `76407930-2` si es posible, o usar un período limpio de ese cliente — confirmar con `SELECT to_char(guifechaemision,'YYYY-MM'), count(*) ... GROUP BY 1` antes de elegir).
2. `POST /empresas/:empkey/sync?rut=...` real contra `backoffice-adapter` — NO insertar guías a mano.
3. Verificar en BD que `guireglaidl`/`guivaloragrupador` se computaron correctamente para las guías nuevas (comparar contra la config de la regla).
4. `POST /empresas/:empkey/facturas/proforma/generar?rut=&periodo=` (no `crearManual`) — confirmar que agrupa correctamente por `(gclirut, guireglaidl)` y produce el número esperado de proformas BORRADOR.
5. `PATCH /aprobar` sobre una proforma real → confirmar `EMITIDA` con folioSii nuevo.

**Criterio de éxito (si se retoma):** 1 folioSii real producido por el camino natural completo, sin ningún script de bypass, con un cliente no contaminado por pruebas previas.

### Sesión 2 — Cerrar el gap de `extraeReferenciaPorTipo`: wiring de API + tracer bullet propio

**Estado (2026-07-09): EJECUTADA con éxito.** Tracer bullet completo confirmado de punta a punta contra QA real: `POST /reglas` → `PUT /clientes/:rut/regla?recomputar=true` (recompute OK, agrupó 990301→OC 555001, 990302→HES 777002) → `POST /sync` → `POST /generar` → `PATCH /aprobar`. **Emisión real: folioSii=411228 EMITIDA** (gfackey=139, montoTotal 42840); XML con las 4 referencias correctas (`801/555001`, `HES/777002`, `52/990301`, `52/990302`). El fix de recompute (PR #20) quedó reconfirmado en el server real. El paso 1 (wiring del DTO) ya estaba en main (PR #14) — no requirió cambio.

**Hallazgo abierto (`OPEN-2`, derivado a handoff):** `generar` metió las 2 guías con `guivaloragrupador` distinto en **1 sola proforma** (agrupa solo por `(gclirut, guireglaidl)`, ignora `guivaloragrupador`). El usuario definió la intención: **1 Factura : 1 OC : 1 HES** (particionar por valor de agrupador), distinguiendo "cómo se agrupan las guías" de "qué referencia trae la factura". Se resuelve en sesión dedicada — ver `docs/2026-07-09-handoff-particionado-por-agrupador.md` (incluye riesgo de regresión de `extraeTagLista`, opciones global vs por-regla, y puntos de anclaje en el código).

**Estado original (2026-07-08): próxima sesión a ejecutar** — prioridad del usuario tras cerrar Sesión 1 sin ejecutar. Aquí está el gap real (nunca ejercitado vía API/sync real).

**Objetivo:** llevar `extraeReferenciaPorTipo` (agrupar por OC/HES) del estado "función pura testeada" a "camino real ejercitado de punta a punta".

**Nota de scope/PR:** el paso 1 (wiring del DTO/controller) es un cambio de código autocontenido y testeable en aislamiento — va en un PR chico y separado (mismo patrón que PR #10/#11). Los pasos 2-5 (crear regla, sync, generar, aprobar) son la sesión de verificación en sí — no generan PR propio, se documentan acá y en `ESTADO.md`.

1. Wirear `CreateReglaDto`/`ReglasController` para aceptar `fn: 'extraeReferenciaPorTipo'` (pendiente documentado desde PR #10 — hoy el DTO solo valida `extraeTagLista`). **PR separado.**
2. Crear una regla real de este tipo (ej. agrupar por OC) vía `POST /reglas`, asignarla a un cliente de prueba vía `PUT /empresas/:empkey/clientes/:rut/regla`.
3. Sync real (o, si no hay guías reales con `<Referencia>` OC/HES disponibles, el mínimo de guías sintéticas necesario pero pasando por el `sync` real, no por insert directo) → confirmar que `guivaloragrupador` refleja el folio de OC/HES esperado, incluyendo: guía con ambas referencias (concatenadas con `;`), guía con solo una, guía sin ninguna.
4. `generarProformas` → confirmar que agrupa por folio de OC/HES (cada proforma = una OC/HES distinta), no por cliente+regla plano como en el caso normal.
5. `aprobar` una proforma real → confirmar que el Detalle/Referencia final (`parseReferencias`, ya confirmado en Sesión previa de OC/HES) sigue funcionando cuando el agrupador ADEMÁS viene de esta función nueva.

**Criterio de éxito:** 1 folioSii real agrupado correctamente por OC/HES vía el pipeline completo real, con la regla creada y asignada por API (no SQL directo).

### Sesión 3 — Regresión ampliada: multi-cliente / multi-regla en un solo sync real

**Objetivo:** confirmar que `syncFromReporte` (fases 1/2, batch de agrupadores) y `generarProformas` sin `?rut=` siguen siendo correctos con datos heterogéneos reales, no solo el trío histórico de siempre.

1. Buscar o preparar un escenario con 2+ clientes reales de QA con reglas **distintas** (`extraeTagLista` con tags distintos, y `extraeReferenciaPorTipo`) sincronizando en la misma corrida.
2. Confirmar que el batch de agrupadores no mezcla clientes/reglas y que la transacción sigue siendo todo-o-nada.
3. `generarProformas` sin `?rut=` (todos los clientes de la empresa) → confirmar el conjunto correcto de proformas por grupo.
4. Si existe un cliente real con volumen suficiente, intentar activar naturalmente el chunking `MAX_GUIAS_POR_FACTURA=40` y/o Caso 4 (Global) **sin** insertar guías sintéticas — documentar si no existe tal cliente en QA (en cuyo caso el gap de Caso 4/chunking con datos 100% reales queda explícitamente abierto, no se fuerza).

**Resultado (2026-07-10, Issue #32):** EJECUTADA con datos sintéticos (se descartó `empkey=977` real por config de emisor; ver handoff `docs/2026-07-10-handoff-sesion3-multi-cliente-multi-regla.md`). Script `scripts/test-multi-cliente-multi-regla-e2e.js`. Un solo `POST /sync` + un solo `POST /generar` (sin `?rut=`) sobre 2 clientes de `empkey=1163` con reglas distintas produjo **4 proformas correctamente particionadas, 1 `gclirut` cada una, todas EMITIDA**:

| gfackey | cliente | regla / agrupador | folioSii |
|---------|---------|-------------------|----------|
| 152 | `81234567-2` | `por_comuna` / SANTIAGO | 411232 |
| 153 | `81234567-2` | `por_comuna` / PROVIDENCIA | 411233 |
| 154 | `76407930-2` | `test_referencia_oc_hes` / OC `801\|555001` | 411234 |
| 155 | `76407930-2` | `test_referencia_oc_hes` / HES `HES\|777002` | 411235 |

Confirma que el batch de agrupadores (`GroupingService`) y `generarProformas` sin `?rut=` no mezclan clientes ni reglas heterogéneas en una sola corrida. Punto 4 (chunking/Global con datos 100% reales) queda abierto (no había cliente real con volumen; no se forzó). **Hallazgo colateral corregido:** el `finally` del script podía corromper el `reglaidl` del cliente compartido `76407930-2` (NULL) si una falla temprana ocurría antes de capturar el valor previo; el script ahora captura *antes* del reset y sólo restaura si capturó (centinela `undefined`). La corrupción dejada por el primer intento se reparó restaurando `reglaidl='por_comuna'` (valor previo confirmado por el log del draft run).

### Sesión 4 — `assignRegla` / recompute con volumen real

**Objetivo:** confirmar que cambiar de regla y recomputar agrupadores funciona sobre guías reales ya sincronizadas (no las 3-7 guías de fixture de siempre).

1. Cambiar la regla de un cliente real (no el dedicado a pruebas) y confirmar `_recomputarGuiasClientePorPeriodo` sobre guías reales ya en BD.
2. Confirmar `POST /guias/recomputar?periodo=` sobre un período real completo (requiere conectividad a Enternet para fetch de XMLs, ver gotcha en `ESTADO.md`).
3. Verificar que el cambio de regla efectivamente redirige las guías a la proforma correcta al `generar` de nuevo.

### Sesión 5 — Cierre: limpieza QA + consolidación

**Objetivo:** dejar QA limpio y la documentación consolidada tras las 4 sesiones anteriores.

1. Anular/limpiar cualquier proforma `FALLIDA` o de prueba dejada durante las sesiones 1-4 (`anular` o `limpiar` según corresponda; recordar que `FALLIDA` no acepta `anular` vía endpoint — requiere SQL directo, ver gotcha en `ESTADO.md`).
2. Actualizar `docs/ESTADO.md`, `MEMORY.md` y PRDs relevantes con cualquier bug encontrado en las sesiones 1-4.
3. Resumen final para el dev senior (mismo formato que `docs/2026-07-07-resumen-avance-dev-senior.md`): "app backend validada de punta a punta con datos reales, no solo casos aislados" + lista de hallazgos.

## Cómo continuar este plan en una sesión nueva

1. Leer este documento completo antes de empezar cualquier sesión.
2. Verificar contra el código actual que los pendientes citados (ej. `CreateReglaDto` sin `extraeReferenciaPorTipo`) siguen vigentes — puede haber cambiado entre sesiones.
3. Al cerrar cada sesión, marcar en este archivo qué sesión se completó y con qué resultado (folioSii, gfackey, hallazgos), para que el usuario pueda revisar el avance acumulado sin tener que releer el historial completo de `ESTADO.md`.

## Estado de avance

- [x] Sesión 1 — tracer bullet base (`extraeTagLista`) — **cerrada sin ejecutar 2026-07-08**, ver nota en la sesión (decisión del usuario, no bloqueante)
- [x] Sesión 2 — `extraeReferenciaPorTipo` wireado + tracer bullet — **EJECUTADA 2026-07-09** (folioSii=411228 EMITIDA). Dejó `OPEN-2` (particionado por `guivaloragrupador`) en handoff dedicado.
- [x] Sesión 3 — multi-cliente/multi-regla — **EJECUTADA 2026-07-10** (Issue #32). 1 `sync` + 1 `generar` sobre 2 clientes bajo `empkey=1163` con reglas distintas (`por_comuna` para el cliente sintético nuevo `81234567-2`, `test_referencia_oc_hes` para `76407930-2`) → **4 proformas aisladas, todas EMITIDA**, sin mezcla de `gclirut`: `folioSii` 411232 (SANTIAGO), 411233 (PROVIDENCIA), 411234 (OC `801\|555001`), 411235 (HES `HES\|777002`). Script: `scripts/test-multi-cliente-multi-regla-e2e.js`. Ver nota de resultado en la sección Sesión 3 arriba.
- [ ] Sesión 4 — `assignRegla`/recompute a volumen real
- [ ] Sesión 5 — cierre y consolidación
