# Estado del Proyecto — guias-middleware
Sesiones: 2026-05-28, 2026-05-29 (×2), 2026-05-30, 2026-06-01 (×3), 2026-06-02 (×4), 2026-06-03 (×4), 2026-06-19, 2026-06-30, 2026-07-01 (×2), 2026-07-02 (×3), 2026-07-03

## Estado de Componentes
| Componente | Estado | Nota |
|------------|--------|------|
| Sync SOAP→DB (`POST /empresas/:empkey/sync`) | ✅ Funcional | Requiere `?rut=` query param |
| Clientes findOrCreate | ✅ Funcional | `reglaidl` nullable en DB |
| Guías bulk insert | ✅ Funcional | `gclirut` normalizado a XML format |
| Impuestos upsert | ✅ Funcional | IVA cod=14 idempotente |
| Agrupadores batch | ✅ Funcional | Lookup por RUT XML format |
| Regla Agrupadora v4 | ✅ Implementada | `extraeTagLista` + `REGLA_REGISTRY` + `reglaconfig jsonb` |
| Detalle+Referencia Factura (DTE 33) — Casos 1/2/3 | ✅ Validados en QA real | `src/mensaje/mensaje-builder.ts` — Caso 1 (S.G.) validado en QA con PDF real; Casos 2/3 (Por Producto — Precio Constante/Variable) **emisión real confirmada 2026-07-02** (`gfackey=98`, folioSii=411208, guías sintéticas). |
| Detalle+Referencia Factura (DTE 33) — Caso 4 (Global) | ⏳ Bloqueado — bug confirmado del lado de Enternet | `src/mensaje/mensaje-builder.ts` — Detalle (1 línea "Segun Guias:") funcional y confirmado en QA (folioSii=411211). Bloque `<Referencia>`/`IndGlobal` sigue en código **EXPERIMENTAL** (rama `if (isGlobal)` al final de `buildMensaje`) dejado a propósito sin revertir — Enternet confirmó que el problema es de su parser/generador de XML (no del Mensaje V5 enviado) y está corrigiéndolo. Reintentar cuando avisen. Ver Historial 2026-07-03 y `docs/consulta-enternet-referencia-global.md`. |
| GroupingService batch | ✅ Funcional | Evita N+1, 2 queries |
| assignRegla + recomputo | ✅ Funcional | RUT en query usa XmlRut. **Corrección 2026-06-30**: no existe distinción real "primera activación" vs "cambio" en el código actual — comportamiento es uniforme, ver Historial 2026-06-30 |
| Proforma — modelo `factura`+`facturaguias` | ✅ Implementado | `gde.facturaguias` tabla puente factura↔guía; `factura.gclirut`/`reglaidl` propios; chunking `MAX_GUIAS_POR_FACTURA=40` (confirmado E2E 2026-07-02); estados +`ANULADA` vía `anular`/`limpiar` |
| CRUD catálogo de reglas | ✅ Completo | `POST/PUT/DELETE /reglas` — 2026-05-29 |
| Reglas disponibles por empresa | ✅ Completo | `GET /empresas/:empkey/reglas` → `{ reglaIdl, reglaDesc }[]` — 2026-05-29 |
| PRD discover-por-cliente | ✅ Completo | service + controller + tests — 2026-05-27 |
| Migración SQL 007 | ✅ Aplicada | BD local actualizada 2026-05-29 |
| Limpieza código legacy | ✅ Completo | `src/empresa/` + 7 DTOs huérfanos + `toXmlRut` eliminados — 2026-05-29 |
| Tests unitarios | ✅ **210 tests verdes** | 15 suites — +6 tests Caso 4 (Global) — 2026-07-02 |
| FacturasService / Proformas | ✅ Funcional | `empresaRepository` eliminado — `sync` usa `?rut=` query param — 2026-05-29 |
| MensajeBuilder V5 | ✅ Implementado | `src/mensaje/mensaje-builder.ts` — módulo puro, 39 tests — 2026-06-02 |
| Preview Mensaje endpoint | ✅ **Aprobado en QA** | Modo 1 (<20 guías) y Modo 2 (≥20) verificados contra servidor real — 2026-06-02 |
| Emisión DTE tipo 33 (Enternet REST) | ✅ Completo | `aprobar` emite automáticamente; `POST /facturas/emision` batch retry; DB migrada — 2026-06-03 |
| Migración SQL 008 (`rut_emisor`) | ✅ Aplicada en local | `gde.factura` tiene columna `rut_emisor` — 2026-06-19 |
| E2E QA via `PATCH /aprobar` | ✅ **Confirmado** | folioSii=917, EMITIDA, emisor `764079302` — 2026-06-19 |
| sync Fase 1/2 + transacción | ✅ Implementado | Clientes sin tx, Guías+Impuestos+Agrupadores en una tx — 2026-05-29 |
| XML fetch paralelo (chunks 5) | ✅ Implementado | Promise.all por chunks en Fase 1 — 2026-05-29 |
| GroupingService single→batch | ✅ Implementado | computeAgrupador delega a batchComputeAgrupadores — 2026-05-29 |
| xml-parser.utils.ts | ✅ Creado | Funciones puras extraídas de XmlParserService — 2026-05-29 |
| proforma-transitions.ts | ✅ Creado | assertPuedeAprobar / assertPuedeAnular — 2026-05-29 |

## Historial Técnico

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

**Pendiente al cierre de la sesión:** armar un fixture sintético de 41+ guías (mismo patrón que `test/fixtures/por-producto/` + `scripts/test-por-producto-sintetico.js`) con el trío confirmado vigente (`empkey=1163`, emisor `968880004`, cliente `76407930-2`, `RutUsuario=16714595-7`) y hacer una emisión real (`PATCH /aprobar`) contra Enternet QA para confirmar o refutar la hipótesis de Referencia Global. **No se hizo en esta sesión.**

**Handoff:** `C:\tmp\handoff-guias-middleware-caso4-global-20260702.md`.

---

### 2026-07-02 (sesión 2) — Emisión real QA de Casos 2/3 (Por Producto) con guías sintéticas

**Sin cambios de código funcionales**, salvo fixes permanentes en `scripts/test-por-producto-sintetico.js` (constantes de fecha/emisor). Motivo: retest pedido por el usuario ("intentemos a ver si pasa con los datos sintéticos") para confirmar Casos 2/3 con `/aprobar` real, no solo `preview-mensaje` (la sesión de creación de fixtures del 2026-07-01 nunca había tocado Enternet).

**Resultado: ✅ `gfackey=98` (empkey 1163) → EMITIDA, folioSii=411208** — 7 guías sintéticas (3 Caso 2 + 4 Caso 3) en una sola factura, PDF/XML generados por Enternet.

**Camino hasta el resultado (2 bloqueadores encontrados y resueltos):**
1. **Emisor `764079302` (el hardcodeado en el script original) ya no tiene RutUsuario registrado en Enternet QA.** Se probaron `18467599-4` y `16714595-7` (ambos habían funcionado en sesiones previas para distintos emisores) → los dos rechazados con `[TraductorErr1] Codigo de encargado de Facturacion {rut} no está Registrado en Enternet`. El registro de encargados en Enternet QA cambió/se reseteó entre el 2026-06-19 y el 2026-07-02 sin aviso. Fix: cambiar el script a emisor `968880004` (el mismo que emitió `gfackey=86`/folioSii=411207 el mismo día), que sí tiene `16714595-7` vigente.
2. **Fechas sintéticas en año 2099 (elegidas para no chocar con guías reales del cliente, que solo tiene datos en `2026-06`) rompen la validación real de Enternet** — `preview-mensaje` no lo detecta (no valida contra Enternet), pero `/aprobar` sí: `[ErrorRefFecha01] Fecha de Referencia de Documento Tipo 52 invalida {dd}/{mm}/99` (Enternet trunca el año a 2 dígitos y lo rechaza como inválido). Fix: usar `2026-05` en vez de `2099-01` como período sintético (sigue sin chocar con datos reales del cliente).

**Archivos modificados:**
- `scripts/test-por-producto-sintetico.js` — `RUT_EMISOR` cambiado a `'968880004'`, `PERIODO` a `'2026-05'`, fechas de `GUIAS[]` actualizadas a mayo 2026 (antes 2099-01). El script sigue llamando solo a `preview-mensaje`, no a `/aprobar` — la emisión real de esta sesión se hizo aparte, manualmente vía `curl PATCH /aprobar` contra `gfackey=98` (creada a mano con `crearManual?rut=968880004`, reusando las mismas guías sintéticas ya sembradas).

**Evidencia dejada en DB (no limpiada):** `gfackey=74` (FALLIDA, emisor `764079302`, fechas 2099 — bloqueador #1) y `gfackey=97` (FALLIDA, emisor `968880004`, fechas 2099 — bloqueador #2, encargado ya resuelto en este intento). `gfackey=98` queda `EMITIDA` como resultado válido.

**`.env`:** `FACTURACION_RUT_USUARIO` quedó en `16714595-7` (valor original — se probó `18467599-4` temporalmente durante el diagnóstico y se revirtió).

---

### 2026-07-02 — Fix redondeo IVA/MONTO TOTAL + límite de 40 referencias confirmado E2E (Enternet ya lo subió)

**Contexto:** retest del umbral individual→Global de referencias (sesión 2026-07-01 #2 lo había medido en 20) tras confirmación del usuario de que Enternet subió el límite a 40. Se recuperó vía handoff (`handoff-guias-middleware-2026-07-02.md`).

**Corrección de drift de documentación (no de código):** los Casos 2/3 (Por Producto — Precio Constante/Variable) del diseño Detalle+Referencia Factura ya estaban implementados con TDD desde antes de esta sesión (`buildDetallePorProducto` en `mensaje-builder.ts` + ADR `0002-sin-codigo-en-lineas-de-tramo-precio-variable.md`). `MEMORY.md` y este documento los tenían como pendientes — corregido en la tabla de componentes arriba. Solo falta Caso 4 (Global/overflow).

**Bug real encontrado y arreglado — redondeo de IVA (`src/mensaje/mensaje-builder.ts`):**
- Síntoma en QA: al emitir una proforma de 40 guías reales (empresa `1163`, cliente `76407930-2`), Enternet rechazó con `[ValNormativaErr1] Error:FEE Folio 0, Neto x TasaIVA <> IVA , 31080 x 19.00 <> (5920/100)`.
- Causa: `sumIva` sumaba los `totiva` **ya redondeados por guía** (40×148=5920), pero Enternet valida `IVA == round(Neto_total × 19%)` (31080×0.19=5905.2→5905). Con pocas guías el drift acumulado no alcanzaba a romper la validación (por eso los casos anteriores de 4-20 guías emitieron bien); con 40 guías del mismo perfil de montos (neto=777/iva=148 c/u), sí.
- Fix: `sumIva = Math.round(Number(sumNeto) × 0.19)` en vez de sumar `totiva` por guía.
- Efecto colateral encontrado y corregido en el mismo fix: `MONTO TOTAL` (`sumDoc`) también sumaba `totdoc` pre-calculado por guía, con el mismo drift. Ahora se deriva como `sumNeto + sumIva + sumExento` (fórmula que exige Enternet: `Total == Exento + Neto + IVA + Impuesto Específico`).
- TDD: 2 tests nuevos en `mensaje-builder.spec.ts` (caso de 40 guías neto=777/iva=148 → IVA=5905, Total=36985) + 1 test preexistente corregido (su fixture tenía `totdoc` inconsistente con `totexento`, mismo bug latente sin cubrir). 203 tests verdes tras el fix (`pnpm test`).

**E2E real — límite de 40 referencias confirmado:**
- `gfackey=86` (empresa `1163`, 40 guías reales del cliente `76407930-2`, período `2026-06`) → `POST /empresas/1163/facturas/emision` → **EMITIDA, folioSii=411207**.
- Confirma que Enternet efectivamente subió el límite de 20 a 40 (contradice la medición de la sesión 2026-07-01 #2, que era correcta *en ese momento* — el cambio del otro dev ya se concretó).
- `MAX_GUIAS_POR_FACTURA` queda en `40` de forma permanente (ya no "temporal") en `facturas.service.ts`.
- Aclaración de datos: para este test, el emisor real es `968880004` (no `764079302` — ese es el emisor de otro escenario de prueba, folios 411203-411206, con el mismo `empkey=1163` pero corresponde a datos de otra sesión). `RutUsuario=16714595-7` (de `.env`) funciona correctamente contra emisor `968880004` — no hubo problema de configuración, la sospecha del handoff previo era una falsa pista (el verdadero bloqueador era el bug de redondeo de IVA).

**Limpieza:** ninguna pendiente — `gfackey=86` queda `EMITIDA` como resultado válido del test, no hace falta anular.

---

### 2026-07-01 (sesión 2) — Test E2E real: límite de referencias confirmado en 20 (no 40)

**Sin cambios de código funcionales** (solo `MAX_GUIAS_POR_FACTURA` tocado temporalmente y revertido al final).

**Motivo:** el PRD (`docs/PRD-detalle-factura.md`) asume que el umbral individual→Global del modelo de 3 niveles de Referencia es **40**, pero ese valor nunca se verificó empíricamente contra Enternet. El código (`facturas.service.ts`) tenía `MAX_GUIAS_POR_FACTURA=20` con un comentario de una prueba E2E anterior que decía "N=20 OK, N=21+ falla". Se decidió validar en QA con datos reales + sintéticos de la empresa de pruebas (`empkey=1163`) antes de tocar el diseño.

**Pasos ejecutados:**
- Bypass temporal de `MAX_GUIAS_POR_FACTURA` a 30 y luego a 40.
- Aprobado `gfackey=60` (30 guías reales del cliente `76407930-2`, regla `por_razon_social`) → **FALLIDA**: `[TraductorErr1] Numeración de líneas de Mensaje Incorrecta, se esperaba línea 1`.
- Aprobado `gfackey=73` (40 guías **sintéticas**, folios `999201-999240`, período `2026-08`) → mismo error.
- Se encontró que `gfackey=23` (40 guías reales, de una prueba previa no documentada) ya había fallado con el mismo error.
- Contraste: 4 proformas ya `EMITIDA` (`gfackey` 24/36/37/38, folios SII 411203-411206) tenían **exactamente 20 guías** cada una.

**Resultado: el límite real de Enternet es 20, confirmado con 3 casos independientes (30 real, 40 real, 40 sintético) — el umbral de 40 propuesto en el PRD es incorrecto.**

**Decisión del usuario:** no actualizar el PRD todavía — el límite del lado de Enternet va a ser modificado por el otro dev ("ya hice el levantamiento con él, puede estar listo en minutos u horas"). Revisar el PRD **después** de confirmar si ese cambio se concreta.

**Limpieza post-test:** `MAX_GUIAS_POR_FACTURA` revertido a `20`. Proformas de prueba (`gfackey` 59-73, incluida la preexistente 23) anuladas — `facturaguias` borradas, `estado='ANULADA'`. 40 guías sintéticas (`guifolio` 999201-999240) borradas de `gde.guia`. `empkey=1163` queda solo con `ANULADA` (55) y `EMITIDA` (4), sin `FALLIDA` pendientes.

---

### 2026-07-01 — grill-with-docs: Caso 1 (S.G.) validado con dev senior, GLOSA eliminado

**Sin cambios de código.** Sesión de grilling (skill `grill-with-docs`) sobre el diseño de `docs/PRD-detalle-factura.md`, retomando el handoff de la sesión anterior (`C:\tmp\handoff-guias-middleware-detalle-factura.md`).

**Motivo:** el usuario tuvo reunión con dev senior mostrando un PDF real de factura emitida — el senior corrigió/priorizó el diseño antes de que se hubiera empezado a implementar.

**Decisiones tomadas (actualizadas en `CONTEXT.md`):**
- **Texto Caso 1 (S.G.) corregido**: `"Facturación según guías período {periodo}"` — reemplaza la decisión anterior (`"Facturación según guías: f{folio1}, f{folio2}, ..."`, con lista de folios). Esa idea de listar folios queda para Caso 4 (Global) únicamente: `"Según guías: {folio1} {folio2} ..."` (sin cambios, ya estaba así).
- **`GLOSA` eliminado en Caso 1**: no se envía `1:|GLOSA|...` en absoluto. El PDF mostraba esto como bloque "Observaciones" — tabla `TIPO DOC|FOLIO|FECHA|MONTO` duplicando la info ya visible en `<Referencia>`, puro ruido según el senior. Cierra OPEN-5 para este caso.
- Idea futura sin confirmar: existiría un campo "descripción adicional" (1000 chars) en Enternet que no se imprime en el PDF — podría usarse para el ladrillo sin generar ruido. Sin confirmar si es un campo real distinto de `GLOSA`. **Fuera de alcance actual.**
- **Prioridad de implementación redefinida por el senior**: terminar Caso 1 completo primero (ya "casi listo" según el senior, solo faltaba el fix de GLOSA), luego Casos 2/3 (Por Producto) y Caso 4 (Global) **encapsulados por separado** — no mezclar lógica de Por Producto con el override de Global todavía, aunque se pueda reusar código auxiliar.
- **Documento oficial Enternet V5 localizado**: `docs/FormatodeIntegracinbasadoenEtiquetasEstndarv5.html` — agregado a `CONTEXT.md` y a memoria persistente como fuente de verdad a consultar ante cualquier duda de formato (reemplaza/complementa la ruta vieja en Downloads citada en sesión 2026-06-02).

**Pregunta abierta explorada y cerrada parcialmente (sin cambio de diseño):** se planteó la tensión entre el umbral Global (>40 refs) y el umbral de split (>143 guías) en modo Por Producto — cualquier proforma con ≥40 guías cae en Global antes de acercarse al límite de split. El usuario decidió no resolverlo ahora: tratar Por Producto y Global como implementaciones separadas por el momento: revisar si aporta valor una vez armado Caso 1.

**Acción tomada:** `CONTEXT.md` actualizado in-place (texto Caso 1, formato S.G. vs Global, sección GLOSA con OPEN-5 resuelto para Caso 1, nueva sección "Fuentes oficiales"). `MEMORY.md` actualizado con nueva sección de diseño. Este documento actualizado en consecuencia.

**Próximo paso:** implementar Caso 1 vía TDD (parseo `<Referencia>` con código `52`, texto de Detalle nuevo, sin `GLOSA`) — ver PRD para casos de test sugeridos.

---

### 2026-06-30 — Auditoría de memoria (MEMORY.md) contra código real: drift corregido

**Sin cambios de código.** Sesión de auditoría/limpieza de documentación (memoria persistente del agente + `docs/ESTADO.md`).

**Motivo:** el usuario advirtió que la lógica de regla agrupadora / proformas cambió mucho desde que se escribió la memoria, y pidió verificar qué seguía vigente.

**Hallazgos (memoria desactualizada vs. código real, verificado leyendo `facturas.service.ts`, `empresas.service.ts`, `grouping.service.ts`, entities y `\d` contra la DB real):**
- **Modelo de datos de Proforma cambió y nunca quedó documentado:** `gde.factura` ahora tiene columnas propias `gclirut` y `reglaidl` (no se infieren de las guías), y existe una tabla puente nueva `gde.facturaguias` (empkey, gfackey, guitipo, guifolio) que vincula factura↔guía. Antes no había vínculo explícito documentado.
- **`generar()` agrupa por `(gclirut, guireglaidl)`**, no por `guivaloragrupador` como decía la memoria vieja.
- **`MAX_GUIAS_POR_FACTURA = 20`** — chunking duro en `generar`/`crearManual`: un grupo cliente+regla con más de 20 guías en el período genera varias proformas BORRADOR. Coincide con el límite real de Enternet (rechaza sobre 20 líneas `3:|`/`5:|` con `[TraductorErr1] Numeración incorrecta`) y con `MODO2_THRESHOLD` en `mensaje-builder.ts`.
- **Estado `ANULADA` nuevo** — `anular(empkey, gfackey)` borra filas de `facturaguias` y marca `ANULADA`; `limpiar(empkey, periodo)` anula en bloque los BORRADOR del período. Ninguno de los dos estaba documentado.
- **`assignRegla` ya no distingue "primera activación" vs "cambio de regla"** — la memoria describía una rama condicional sobre `reglaPrevia` que ya no existe: el código lee el valor previo pero la variable queda sin usar; el comportamiento de recompute es idéntico sea o no la primera vez.
- **Filtro de disponibilidad de `generar`/`crearManual` es `guireglaidl IS NOT NULL`**, no `guivaloragrupador IS NOT NULL` como decía la memoria.
- `sql/006-regla-agrupadora-v3.sql` y `sql/007-regla-agrupadora-v4.sql` (citados en sesiones anteriores) **ya no existen como archivos** en `sql/` — solo quedan `003`, `004`, `005`, `008`. Se aplicaron en su momento pero el archivo no quedó versionado.
- Módulo `src/facturacion/` (`facturacion.service.ts` + `facturacion.controller.ts`, read-only sobre facturas reales sincronizadas, distinto de `src/facturas/` que maneja proformas) no estaba mencionado en memoria.
- Un pendiente de QA (`sql/008` por ejecutar) seguía marcado como abierto en memoria pese a estar resuelto desde el 2026-06-19.

**Acción tomada:** `MEMORY.md` actualizado con secciones nuevas ("Proforma — modelo de datos", "Schema actual") y correcciones in-place en las secciones de `assignRegla`, "Gotchas críticos" (fusionadas dos cabeceras duplicadas) y "Archivos clave". Este documento (`docs/ESTADO.md`) actualizado en consecuencia.

**Lección para el futuro:** la memoria persistente describe intención/diseño de una sesión puntual y puede quedar desactualizada silenciosamente cuando el código sigue evolucionando sin que se actualice la memoria en el mismo PR. Conviene re-verificar contra el código fuente (no solo contra otra entrada de memoria) cuando se sospeche drift, especialmente en módulos con cambios frecuentes como la regla agrupadora / proformas.

---

### 2026-06-19 — E2E QA via PATCH /aprobar confirmado: folioSii=917, emisor 764079302

**Sin cambios de código.** Sesión de verificación operacional.

**Pasos ejecutados:**
- Aplicada migración `sql/008-rut-emisor-factura.sql` en DB local (`facturagdes2`) — columna `rut_emisor VARCHAR(20) NOT NULL DEFAULT ''` agregada a `gde.factura`
- Diagnosticado que 66 guías en `empkey=977` tenían `guivaloragrupador=NULL` — el sync previo no había computado los agrupadores
- `POST /empresas/977/guias/recomputar?periodo=2026-05` → `{ procesados: 34, actualizados: 34, errores: 0 }` — agrupadores computados vía fetch XML a Enternet
- `POST /empresas/977/facturas/proforma/generar?rut=764079302&periodo=2026-05` → `{ created: 1, skipped: 0 }` — proforma `gfackey=12` creada
- `PATCH /empresas/977/facturas/proforma/12/aprobar` → `{ estado: "EMITIDA", folioSii: "917", linkPdf: "https://emi.qa.enternet.cl/..." }` ✅

**Resultado E2E:**
- Emisor: `764079302`, RutUsuario: `18467599-4` (FACTURACION_RUT_USUARIO en .env)
- Cliente: `78170790-2` (ARMACERO - MATCO S A), 5 guías, $49.047.040
- `EstadoEmision: XFIRMAR` — DTE creado en Enternet, pendiente firma digital via `LinkVisualizacion`

**Pendientes marcados como resueltos:**
- ✅ E2E QA via `PATCH /aprobar` (bloqueador levantado)
- ✅ Migración 008 local

**Descubrimiento:** `generar` filtra guías donde `guivaloragrupador IS NULL`. Si las guías se insertaron sin agrupadores (sync incompleto o primeros datos), ejecutar `POST /guias/recomputar` antes de generar proformas.

**Nota:** `listarProformas` filtra por `gfacfecha` (fecha de creación de la proforma), no por el período de las guías. Una proforma generada hoy para guías de `2026-05` aparece en `periodo=2026-06`, no en `2026-05`.

---

### 2026-06-03 (sesión 4) — Fix backoffice-adapter.service: ResultadoDTE sin wrapper

**Archivos modificados:**
- `src/backoffice-adapter/backoffice-adapter.service.ts` — Fix bug en `emitirDte()` líneas 71-81: el adapter devuelve `ResultadoDTE` plano (no envuelto en `{ ResultadoDTE: ... }`), pero el servicio leía `body.ResultadoDTE` → siempre tiraba 422 "sin ResultadoDTE" incluso cuando Enternet respondía OK. Fix: separar el path de error (`!response.ok`) del path de éxito, devolver `response.json()` directamente.

**Verificado E2E directo (via `scripts/test-emision.mjs` en backoffice-adapter):**
- Emisor `764079302`, RutUsuario `18467599-4` → HTTP 201 ✅
- `EstadoEmision: "XFIRMAR"`, `FolioDocumento: "884"`, `LinkVisualizacion` presente
- `18467599-4` SÍ está registrado para emisor `764079302`; el bloqueador era solo para `921760000`

**Tests:** 179/179 ✅ (sin cambios en tests, solo fix de lógica en runtime)

---

### 2026-06-03 (sesión 3) — Tracer Bullet 1: rut_emisor almacenado en gde.factura

**Archivos modificados:**
- `sql/008-rut-emisor-factura.sql` — **creado** — `ALTER TABLE gde.factura ADD COLUMN rut_emisor VARCHAR(20) NOT NULL DEFAULT ''`
- `src/facturacion/entities/factura.entity.ts` — +columna `rutEmisor` (`rut_emisor`, varchar 20, default `''`)
- `src/facturas/facturas.service.ts` — `generar` y `crearManual` reciben `rutEmisor: string` como tercer parámetro; `insertProforma` lo recibe y lo pasa como `$9` en el INSERT; `_emitir` y `previewMensaje` ahora usan `factura.rutEmisor` en lugar de `emisor.rutEmisor` del XML (solo `receptor` se extrae del XML)
- `src/facturas/facturas.controller.ts` — `generarProformas` y `crearProforma` requieren `?rut=` query param obligatorio; se pasa a service
- `src/facturas/facturas.service.spec.ts` — `ConfigService` mock agregado al TestingModule; `makeProforma` incluye `rutEmisor: '92176000-0'`; 4 calls a `generar` y 3 a `crearManual` actualizados con tercer param; assertion `RutEmisor` en test `aprobar` cambió de `'76407930-2'` (XML) a `'92176000-0'` (proforma); +1 test nuevo: verifica que `insertProforma` incluye `rut_emisor` en SQL y params

**Decisiones:**
- `rut_emisor` se almacena en `gde.factura` al crear la proforma — fuente única de verdad para el emisor, independiente del XML de la guía
- `_emitir` sigue parseando el XML para obtener datos del `receptor` (cliente) — solo deja de leer `emisor`
- `generar` y `crearProforma` ahora exigen `?rut=` igual que `sync` — consistencia de interfaz

**Pendiente (QA):** ejecutar `sql/008-rut-emisor-factura.sql` contra `facturagdes2` una vez que los tests pasen en CI/QA.

**Tests:** 179/179 ✅ (+1 neto)

---

### 2026-06-03 (sesión 2) — E2E emisión QA: RutUsuario configurable + fix propagación error

**Archivos modificados:**
- `src/facturas/facturas.service.ts` — `ConfigService` inyectado. `_emitir()` ahora usa `FACTURACION_RUT_USUARIO` env var para `RutUsuario` (con fallback a `emisor.rutEmisor`). Causa raíz: `RutUsuario` es el encargado de facturación registrado en Enternet, no el emisor.
- `src/backoffice-adapter/backoffice-adapter.service.ts` — Fix: `body.error ?? body.message` → `body.message ?? body.error`. NestJS pone el texto real en `message`; `error` siempre es el nombre genérico (`"Unprocessable Entity"`).
- `.env` — `FACTURACION_RUT_USUARIO=18467599-4` (QA, pendiente confirmar con Enternet).

**Decisiones:**
- `FACTURACION_RUT_USUARIO` por variable de entorno — permite diferente encargado por ambiente (QA/prod) sin cambio de código.

**Bloqueado:** `18467599-4` no está registrado en Enternet para emisor `921760000`. Confirmar con Enternet el RUT correcto.

**Tests:** 178/178 ✅ (verificar que ConfigService esté mockeado en facturas.service.spec.ts al correr en próxima sesión).

---

### 2026-06-03 — Flujo emisión DTE completo: aprobar→emitir + batch retry + migración DB

**Archivos modificados:**
- `src/facturacion/entities/factura.entity.ts` — +3 columnas nullable: `gfacfolioSii` (int), `gfaclinkPdf` (varchar), `gfaclinkXml` (varchar). Mapeadas a `gfacfolio_sii`, `gfaclink_pdf`, `gfaclink_xml`.
- `src/backoffice-adapter/backoffice-adapter.service.ts` — nuevo método `emitirDte(input)`. Usa `fetch` nativo. `BadGatewayException` en error de red, `UnprocessableEntityException` en error de negocio. Interfaces `EmitirDteInput` + `ResultadoDTE` exportadas.
- `src/facturas/facturas.service.ts` — `aprobar()` ahora emite después de guardar APROBADA: éxito → EMITIDA + guarda folio/links; falla → FALLIDA + rethrow. Helper privado `_emitir(factura)`: carga guías, parsea XML, buildMensaje, llama `backofficeAdapterService.emitirDte`. Helper privado `_cargarGuiasParaEmision(empkey, gfackey)`: SQL JOIN extraído de `previewMensaje` (reutilizado). Nuevo método público `emitirPendientes(empkey)`: busca FALLIDA, re-emite, retorna `{ emitidas, fallidas, detalle }`. `previewMensaje` refactorizado para usar `_cargarGuiasParaEmision`. `ProformaDto` extendido con `folioSii?`, `linkPdf?`, `linkXml?`.
- `src/facturas/facturas.controller.ts` — nuevo endpoint `POST /empresas/:empkey/facturas/emision`.
- `src/facturas/facturas.service.spec.ts` — `mockBackofficeAdapterService` extendido con `emitirDte: jest.fn()`. `makeProforma` incluye `gfacfolioSii/Pdf/Xml: null`. Test "aprobar happy path" actualizado → espera EMITIDA + folioSii. +1 test aprobar FALLIDA. +4 tests `emitirPendientes`.

**DB (ejecutado):**
```sql
ALTER TABLE gde.factura ADD COLUMN IF NOT EXISTS gfacfolio_sii int,
  ADD COLUMN IF NOT EXISTS gfaclink_pdf varchar,
  ADD COLUMN IF NOT EXISTS gfaclink_xml varchar;
```

**Decisiones:**
- `_emitir` es privado — el estado de la proforma se gestiona en `aprobar` y `emitirPendientes`, no dentro del helper. Permite reutilizar sin efectos colaterales.
- `emitirPendientes` NO lanza si alguna factura falla — acumula errores en `detalle` y continúa. El caller decide si 200 con `fallidas > 0` es problema.
- `assertPuedeAprobar` no se extiende a FALLIDA — el retry se hace vía `emitirPendientes`, no volviendo a aprobar.
- `buildProformaDto` ahora incluye `folioSii/linkPdf/linkXml` opcionales para que el frontend los pueda mostrar.

**Tests:** 178/178 ✅ (+5 netos)

**Bug en test corregido:**
- `toHaveBeenNthCalledWith(1, { estado: 'APROBADA' })` falla porque el service muta el mismo objeto `factura` — Jest guarda la referencia, no snapshot. Fix: usar `toHaveBeenCalledWith(objectContaining({ estado: 'EMITIDA', gfacfolioSii: 999 }))` sin nth.

---

### 2026-06-02 (sesión 4) — QA preview-mensaje: Modo 1 y Modo 2 aprobados

**Verificado end-to-end contra servidor real (localhost:3334):**
- Modo 1 (<20 guías): una `3:|` por guía + sección `4:|5:|` referencias — ✅
- Modo 2 (≥20 guías): una `3:|` con total + `1:|GLOSA|` ladrillo con tabla — ✅
- RUT EMISOR sin puntos/guión (`921760000`) — ✅
- RUT CLIENTE con puntos y guión (`77.004.250-K`) — ✅
- TransaccionIdL determinista (`977-{gfackey}`) — ✅
- Estructura etiquetas V5 correcta en ambos modos — ✅

**Nota:** Modo 2 testeado con datos sintéticos (20 guías insertadas y limpiadas, `guifolio` 999001-999020).

---

### 2026-06-02 (sesión 3) — Bugfixes: assignRegla primera activación + RUT format en recompute

**Archivos modificados:**
- `src/empresas/empresas.service.ts` — Bug 1: `assignRegla` tenía early return en `reglaPrevia === null` que bloqueaba recompute aunque `recomputar=true`. Fix: permitir recompute en primera activación. Bug 2: `_recomputarGuiasClientePorPeriodo` buscaba guías con `gclirut: rutCsv` (`77004250K`) pero tabla almacena XmlRut (`77004250-K`) → 0 resultados siempre. Fix: convertir a XmlRut antes del query.
- `src/empresas/empresas.service.spec.ts` — tests actualizados para ambos bugs.

**Causa raíz:** branded types `CsvRut`/`XmlRut` — el parámetro que llega a `assignRegla` es `CsvRut`, pero `gde.guia.gclirut` es `XmlRut`. Mismo patrón que el gotcha de `guias.service.ts`.

**Tests:** 173/173 ✅

**Bug `crearManual` cerrado:** verificado 2026-06-03 — el código ya usa `g.guireglaidl` correctamente. La nota era memoria desactualizada.

---

### 2026-06-02 — Bugfixes: createQueryBuilder mock + columna guireglaagrupadora

**Archivos modificados:**
- `src/guias/guias.service.spec.ts` — `mockManager` extendido con `createQueryBuilder` (cadena fluent: `insert → into → values → orIgnore → execute`). Fix necesario porque la sesión anterior cambió el insert de `GuiaImpuesto` de `manager.save()` a `manager.createQueryBuilder().insert()...orIgnore()`. Assertions actualizadas: ya no verifica `mockManager.save(GuiaImpuesto, ...)` sino `mockManager.createQueryBuilder.mock.results[0].value.into/values`.
- `src/facturas/facturas.service.ts` — método `generar()`: `g.guireglaagrupadora` → `g.guireglaidl` en SELECT, WHERE, y en la key de agrupación (`guia.guireglaagrupadora` → `guia.guireglaidl`). Tipo TS del resultado de query actualizado en consecuencia.
- `src/facturas/facturas.service.spec.ts` — 5 ocurrencias de `guireglaagrupadora: '...'` en objetos mock → `guireglaidl: '...'`.

**Causa raíz `guireglaagrupadora`:** migración `006-regla-agrupadora-v3.sql` eliminó la columna y creó `guireglaidl` + `guivaloragrupador`. La entidad `Guia` ya estaba actualizada; el query raw en `facturas.service.ts` no.

**Tests:** 173/173 ✅

---

### Bug `column g.guireglaagrupadora does not exist` al generar proformas
- **Síntoma:** `POST /empresas/:empkey/facturas/proforma/generar` → 500 `QueryFailedError: column g.guireglaagrupadora does not exist`
- **Causa:** Migración `006-regla-agrupadora-v3.sql` eliminó la columna `guireglaagrupadora` y la reemplazó por `guireglaidl` + `guivaloragrupador`. La entidad `Guia` (TypeORM) ya usaba los nombres nuevos, pero el query raw en `facturas.service.ts::generar()` seguía referenciando el nombre viejo.
- **Solución:** Renombrar `guireglaagrupadora` → `guireglaidl` en SELECT, WHERE y key de agrupación en `facturas.service.ts`. Actualizar mocks en spec.

## Bugs Resueltos

### Redondeo de IVA/MONTO TOTAL en `mensaje-builder.ts` — 2026-07-02
- **Síntoma:** Enternet rechaza con `[ValNormativaErr1] Error:FEE Folio 0, Neto x TasaIVA <> IVA , 31080 x 19.00 <> (5920/100)` al emitir una proforma de 40 guías reales (neto=777/iva=148 c/u).
- **Causa:** `sumIva` sumaba los `totiva` ya redondeados por guía (40×148=5920) en vez de `round(Neto_total × 19%)` (31080×0.19=5905.2→5905). Con pocas guías el drift acumulado no rompía la validación; con 40 sí. Mismo problema en `MONTO TOTAL` (`sumDoc`, sumaba `totdoc` por guía).
- **Solución:** `sumIva = Math.round(Number(sumNeto) * 0.19)`; `sumDoc = sumNeto + sumIva + sumExento` (fórmula real que exige Enternet). TDD: 2 tests nuevos + 1 preexistente corregido (fixture con `totdoc` inconsistente ocultaba el mismo bug).

### `clientes.reglaidl` NOT NULL violation
- **Síntoma:** `null value in column "reglaidl" of relation "clientes" violates not-null constraint`
- **Causa:** La migración creó la columna con NOT NULL pero la entidad la define como `nullable: true`
- **Solución:** `ALTER TABLE gde.clientes ALTER COLUMN reglaidl DROP NOT NULL`

### FK `iguia1` violation — RUT format mismatch
- **Síntoma:** `insert or update on table "guia" violates foreign key constraint "iguia1"` — `Key (empkey, gclirut)=(977, 77004250K) is not present in table "clientes"`
- **Causa:** CSV devuelve RUT sin guión (`77004250K`), XML usa guión (`77004250-K`). `clientes` se insertaba con RUT del XML, `guia.gclirut` quedaba con RUT del CSV → FK rota
- **Solución:** En `guias.service.ts` línea 65: `guia.gclirut = normalizeToXml(toCsvRut(row['RUT Cliente']))`

## Pendientes
### Alta prioridad
- [x] **`FacturasService` usa `gde.empresa` (tabla eliminada)** — resuelto 2026-05-29: `empresaRepository` eliminado, `sync` usa `?rut=` query param

### Alta prioridad
- [x] **PRD v5 backend**: `EmpresasService.assignRegla` — detección primera activación, recompute selectivo por período, nueva firma DTO — resuelto 2026-06-01

### Alta prioridad
- [x] **Implementar `MensajeBuilder`** — `src/mensaje/mensaje-builder.ts`, 39 tests — 2026-06-02
- [x] **Implementar `EmisionClient`** — `backoffice-adapter` ✅ 2026-06-02
- [x] **Implementar `EmisionService`** — `guias-middleware` orquesta aprobar→emitir + batch retry ✅ 2026-06-03
- [x] **Migración DB** — `gfacfolio_sii`, `gfaclink_pdf`, `gfaclink_xml` aplicadas ✅ 2026-06-03
- [x] **Datos del cliente para Mensaje** — `<Receptor>` del XML guía ✅ (resuelto en MensajeBuilder)
- [x] **Detalles `strControl`** para `apiKey` de emisión — confirmado GeneXus, implementado ✅ 2026-06-02
- [x] **Verificar con Enternet** que `Disp21072025101717` está habilitado — ✅ confirmado 2026-06-03
- [x] **Tracer Bullet 1: rut_emisor en gde.factura** — columna + entity + service + controller + tests ✅ 2026-06-03 — pendiente migración manual en QA (`sql/008`)
- [x] **E2E QA real directo (backoffice-adapter)** — ✅ confirmado 2026-06-03: HTTP 201, folio 884, emisor `764079302`
- [x] **E2E QA via `PATCH /aprobar`** — ✅ confirmado 2026-06-19: folioSii=917, emisor `764079302`, EMITIDA
- [x] **Migración QA** — ✅ ejecutada 2026-06-19: columna `rut_emisor` en `gde.factura` (DB local)

### Alta prioridad
- [x] **Implementar Caso 1 (S.G.) del nuevo Detalle+Referencia** vía TDD — ✅ 2026-07-01, validado con PDF real en QA.
- [x] **Decidir umbral individual→Global del modelo de 3 niveles de Referencia** — ✅ 2026-07-02: Enternet subió el límite a 40 (el otro dev concretó el cambio). Confirmado E2E real: `gfackey=86`, 40 guías, folioSii=411207. `MAX_GUIAS_POR_FACTURA=40` permanente en `facturas.service.ts`. `docs/PRD-detalle-factura.md` ya asumía 40, no requirió cambios.
- [x] **Fix redondeo de IVA/MONTO TOTAL en `mensaje-builder.ts`** — ✅ 2026-07-02, ver Bugs Resueltos.

### Media prioridad
- [x] Implementar Casos 2/3 (Por Producto) — ✅ ya estaban implementados con TDD antes de 2026-07-02 (drift de documentación corregido esa sesión), ver ADR 0002.
- [x] Implementar Caso 4 (Global/overflow >40 refs) en `mensaje-builder.ts` — ✅ 2026-07-02, **pero sin validar en QA** (ver Historial sesión 3). El pendiente real ahora es la validación empírica, no la implementación.
- [ ] **Validar Caso 4 con emisión real contra Enternet QA** — 2026-07-03: fixture y script ya armados (`scripts/test-caso4-global-sintetico.js`), reintentado varias veces contra QA. **Bug confirmado del lado de Enternet** (parser no completa `FchRef` del bloque `IndGlobal=1` generado desde `ACCION REFERENCIA=5`, ver Historial 2026-07-03). Bloqueado hasta que Enternet corrija su parser — no seguir iterando desde nuestro lado hasta tener novedades. Código experimental queda sin revertir en `mensaje-builder.ts` para reintentar rápido con `--reset --aprobar`.
- [ ] Deduplicar OC (801) y HES en el conteo de "total de referencias" de Caso 4 — hoy el umbral de 40 solo cuenta guías porque `parseReferencias()` no existe en el código.
- [ ] OPEN-1: confirmar `TpoDocRef=HES` en XML de guía (DTE 52) de entrada — falta XML real con `<Referencia>` HES

### Baja prioridad
- [ ] Filtro `IndTraslado=1` — solo guías que constituyen venta deben facturarse
- [ ] Alerta 10 días hábiles en UI — plazo SII para facturar guías del mes anterior
- [ ] HES (Hoja de Entrada de Servicios): campo 802 del DTE — mecanismo de ingreso sin definir
- [ ] GLOSA overflow (legacy, Modo 2 > ~27 guías supera 1000 chars) — obsoleto una vez migrado a Caso 1 nuevo, no atacar
- [ ] URL productiva Enternet para emisión
- [ ] Campo "descripción adicional" en Enternet (no impreso en PDF) — investigar si es real y distinto de `GLOSA`, sin bloquear nada

## Lecciones Aprendidas

### Agregadas 2026-07-02 (sesión 3)
- Cuando un spec de integración documenta un campo como aplicable solo a un tipo de documento específico (ej. `ACCION REFERENCIA` "SOLO SI ES NOTA DE CREDITO O DEBITO"), no asumir que el proveedor externo lo valida estrictamente — puede aceptarlo igual para otro tipo de documento, o ignorarlo silenciosamente. La única forma de saberlo es probar contra el ambiente real; no bloquear la implementación esperando que el spec sea 100% preciso, pero sí dejar la hipótesis marcada como no confirmada en la documentación hasta testear.
- Al agregar una columna nueva a un formato pipe-delimited posicional-por-nombre (Enternet V5), es más seguro declararla condicionalmente solo en el modo que la necesita, en vez de agregarla siempre — evita arriesgar el formato de emisiones ya confirmadas en QA por un cambio que en teoría es "aditivo".
- Cuando el diseño completo de una feature tiene una dependencia no implementada todavía (OC/HES para el conteo de referencias de Caso 4), es mejor implementar la parte que sí se puede probar ahora (conteo por guías) y dejar la dependencia como TODO explícito, en vez de bloquear toda la feature esperando construir el prerequisito completo.

### Agregadas 2026-07-02 (sesión 2)
- Un par RutUsuario+emisor confirmado funcional en una sesión anterior puede dejar de funcionar sin aviso (registro de encargados en Enternet QA cambia del lado de ellos) — retestear antes de asumir que sigue vigente, no confiar ciegamente en la memoria de sesiones pasadas para credenciales de un ambiente externo.
- Fechas sintéticas "lejanas en el futuro" (ej. año 2099, elegidas para evitar colisión con datos reales) pueden pasar `preview-mensaje` sin problema pero fallar en `/aprobar` real porque el validador externo (Enternet) tiene sus propias reglas de rango de fecha que un preview local no replica. Para tests con guías sintéticas que van a emitirse de verdad, usar fechas recientes reales (mismo año, mes distinto a los datos reales) en vez de años arbitrariamente lejanos.
- Guías vinculadas a una factura `FALLIDA` (a diferencia de `BORRADOR`/`APROBADA`) no bloquean crear una nueva proforma con las mismas guías (`generar`/`crearManual` solo excluyen por `estado IN ('BORRADOR','APROBADA')`) — se puede reintentar un escenario fallido creando una proforma nueva sin necesidad de anular la anterior.

### Agregadas 2026-07-02
- Sumar valores ya redondeados por unidad (IVA, totales) en vez de redondear la suma agregada acumula drift silencioso — no se manifiesta con pocos registros y aparece recién a escala (4-20 guías OK, 40 guías falla). Cuando un validador externo exige una fórmula sobre el agregado (`IVA == round(Neto_total × 19%)`), replicar exactamente esa fórmula, no una suma de resultados intermedios ya redondeados.
- Antes de asumir que un fallo de emisión es un problema de configuración (RutUsuario, emisor), verificar primero que el Mensaje generado sea aritméticamente consistente — un bug de redondeo puede disfrazarse de problema de credenciales si el mensaje de error no es el primero que se investiga a fondo.
- Cuando la memoria persistente documenta un "dato fijo" (ej: "empkey=1163 → emisor 764079302"), tratarlo como válido solo para el escenario específico en que se registró — un mismo empkey/cliente puede tener guías de test con distintos emisores reales según la sesión que las generó. Verificar el emisor real del XML antes de reusar un dato de memoria para crear proformas de prueba.

### Agregadas 2026-07-01 (sesión 2)
- No asumir umbrales de un PRD como verificados solo porque suenan razonables — el umbral de 40 referencias nunca se probó contra Enternet real y resultó ser incorrecto (el límite real es 20, igual que el legacy). Validar contra el sistema externo antes de diseñar sobre un número no confirmado.
- Para tests E2E que requieren "muchas guías" sin cliente real disponible, insertar guías sintéticas reutilizando el mismo `guifilepath` real de una guía existente es válido — el código solo fetchea el XML de `guias[0]` para datos del receptor, no uno por guía.
- `assertPuedeAnular` no acepta estado `FALLIDA` — para limpiar una proforma FALLIDA de prueba hay que hacerlo directo por SQL (`DELETE facturaguias` + `UPDATE estado='ANULADA'`), no vía el endpoint `anular`.

### Agregadas 2026-06-30
- Cuando se introduce una tabla puente nueva (`gde.facturaguias`) o columnas nuevas en una entity (`factura.gclirut`/`reglaidl`), actualizar la memoria persistente del agente en el mismo momento, no solo el código. Si no, la próxima sesión parte de un modelo mental incorrecto y puede proponer cambios que rompen el diseño real (ej: asumir que la proforma no tiene vínculo explícito con sus guías).
- Al simplificar una función (ej: `assignRegla` eliminando la rama "primera activación"), revisar si queda una variable muerta (`reglaPrevia`) que sugiere lógica condicional que ya no existe — es una señal de que la documentación/memoria asociada a esa función probablemente quedó desactualizada.
- Los archivos de migración SQL pueden desaparecer del repo después de aplicarse (no versionados o limpiados) sin que el código deje de funcionar — para verificar el schema real, preferir `\d gde.<tabla>` contra la DB antes que buscar el archivo de migración.

### Agregadas 2026-06-19
- El sync inserta guías en DB pero si las guías ya existían (idempotente), `synced:0` no recomputa agrupadores. Si `guivaloragrupador` es NULL en guías existentes, ejecutar `POST /empresas/:empkey/guias/recomputar?periodo=YYYY-MM` antes de intentar `generar` proformas.
- `listarProformas` filtra por `gfacfecha` (fecha de creación de la proforma), no por el período de las guías incluidas. Una proforma creada hoy para guías de mayo aparece en `periodo=2026-06`, no `2026-05`. Tenerlo en cuenta al hacer pruebas.
- El endpoint `POST /guias/recomputar` hace fetch de los XMLs desde Enternet (`guifilepath`) — requiere conectividad a `nod1.enternet.cl`. Si hay error de red, las guías quedan sin agrupador y se reportan en `errores`.

### Agregadas 2026-06-03
- Cuando un service NestJS muta el mismo objeto `factura` en dos llamadas consecutivas a `repo.save()`, Jest guarda la referencia y ambas llamadas muestran el estado final mutado. `toHaveBeenNthCalledWith(1, { estado: 'APROBADA' })` siempre falla. Usar `toHaveBeenCalledWith(objectContaining({ estado: 'EMITIDA' }))` o snapshots de copia al momento del mock.
- Métodos retry/batch (`emitirPendientes`) deben capturar errores internamente por ítem y acumular en `detalle[]` — no propagar la excepción, o el primer fallo aborta el resto del lote.
- Al agregar columnas nullable a una entity TypeORM con `synchronize: true`, aplicar también el `ALTER TABLE IF NOT EXISTS` en la DB — el sync automático puede fallar si la tabla ya tiene filas y la columna aparece como NOT NULL por defecto en la definición.

### Agregadas 2026-06-02
- Al cambiar `manager.save()` por `manager.createQueryBuilder().insert()...` en producción, actualizar el mock del manager en el spec para añadir `createQueryBuilder` como jest.fn() que devuelve un objeto chainable. Si no, todos los tests que ejecutan la transacción fallan con `TypeError: manager.createQueryBuilder is not a function`.
- Para assertar sobre un builder chainable sin re-invocar el mock (que incrementaría el call count), usar `mockFn.mock.results[0].value` para obtener el objeto retornado por la primera llamada.
- Cuando una migración renombra/elimina columnas, buscar activamente queries SQL crudas (`dataSource.query(...)`) en el código — TypeORM solo actualiza las queries generadas automáticamente, no las crudas. Los raw queries son puntos de falla silenciosos hasta que el endpoint se ejecuta en runtime.

### Agregadas 2026-05-29 sesión 2
- Las migraciones de TypeORM pueden crear columnas NOT NULL aunque la entidad diga `nullable: true`. Verificar con `\d gde.<tabla>` en psql.
- CSV del backoffice: RUT sin guión (`77004250K`). XML DTE: RUT con guión (`77004250-K`). Formato canónico en DB = XML con guión.
- FK `iguia1`: `guia(empkey, gclirut) → clientes(empkey, gclirut)` — ambas columnas deben tener el mismo formato de RUT.
- Entidades TypeORM huérfanas (no registradas en módulo) no generan error en runtime pero son dead code confuso — borrar apenas se detecten.
- Al escribir mocks de test, usar siempre el schema real del entity (no strings legacy de versiones anteriores).
- Al inyectar un nuevo servicio en un `@Injectable()` que ya tiene tests con `TestingModule`, siempre agregar el mock correspondiente al módulo de test o los 15+ tests existentes fallarán con error de DI.
- `pnpm test --testPathPatterns="..."` (con `s`) — la forma sin `s` fue deprecada en versiones recientes de Jest.
- Al mover guard functions a archivo separado, revisar que todos los throws del service original estén cubiertos — `crearManual` tenía su propio `UnprocessableEntityException` que no es un guard de estado.
- Para testear transacciones TypeORM: mock `DataSource.transaction` capturando el manager en variable de módulo (`let mockManager`), así los tests pueden assertar sobre `mockManager.save(Entity, [...])`.
- Si `computeAgrupador` delega a `batchComputeAgrupadores`, los tests que moquean `findOne` deben cambiar a `find` (batch usa find en plural, no findOne).
- Interfaces en utils para evitar circular dependency: utils importa nada del service; service importa funciones de utils y re-exporta tipos.
- Al extender un método con `findOne`, siempre agregar `findOne: jest.fn()` al mock del repo en el spec — si no, todos los tests existentes del describe fallan con `mockClienteRepo.findOne is not a function`.
- `_recomputarGuiasCliente` (toda la historia) fue eliminado. El recompute ahora siempre es por período. No recrear el método genérico.
- Al inyectar un nuevo servicio en `FacturasService`, siempre agregar su mock en el `TestingModule` de `facturas.service.spec.ts` — aunque los tests existentes no lo usen, NestJS lanza error de DI si falta el provider.
- Módulos puros (sin side-effects) no necesitan ser `@Injectable` — pueden ser funciones exportadas directamente, más fáciles de testear y sin overhead de NestJS.
- `dataSource.query` con JOIN es preferible a inyectar `Repository<Guia>` cuando solo se necesita una query puntual en un módulo distinto — evita crecer el grafo de dependencias.

## Contexto Crítico
- `gde.empresa` NO EXISTE — tabla eliminada, nunca recrear
- `POST /empresas/:empkey/sync` requiere `?rut=<rut_emisor>` como query param
- `POST /empresas/:empkey/facturas/sync` también requiere `?rut=<rut_emisor>` como query param (post fix 2026-05-29)
- Formato canónico de RUT en DB: XML con guión (`77004250-K`, `78170790-2`)
- psql local: `"C:\Program Files\PostgreSQL\18\bin\psql.exe"` — no está en PATH
- API Enternet emisión: REST JSON, NO SOAP. `POST https://emi.qa.enternet.cl/EmisorV2503/WS/Emision/APIEmision/dtes` (QA). ADR 0002 desactualizado en ese detalle.
- Formato Mensaje Enternet: pipe-delimited V5. `1:|` encabezado, `2:|3:|` detalle, `4:|5:|` referencias. Saltos de línea en GLOSA con `\n`. Fechas `dd/MM/yyyy`.
- `TransaccionIdL` es idempotente por proforma — no generar UUID aleatorio en reintentos o se duplican DTEs.
- `backoffice-adapter.service.ts` ya expone `emitirDte()` con interfaces `EmitirDteInput`/`ResultadoDTE` exportadas — importar desde `'../backoffice-adapter/backoffice-adapter.service.js'` con `import type`.
- Estados proforma: BORRADOR → APROBADA → EMITIDA (feliz) | FALLIDA (error emisión) | ANULADA (vía `anular`/`limpiar`, no es parte del flujo de emisión). `assertPuedeAprobar` solo acepta BORRADOR. Retry de FALLIDA via `POST /facturas/emision`, no via `PATCH aprobar`.
- **Modelo de datos de Proforma (confirmado 2026-06-30 contra `\d` real):** `gde.factura` tiene `gclirut` y `reglaidl` propios; `gde.facturaguias` (empkey, gfackey, guitipo, guifolio) es la tabla puente factura↔guía. `generar()` agrupa guías por `(gclirut, guireglaidl)` — no por `guivaloragrupador`. `MAX_GUIAS_POR_FACTURA = 40` en `facturas.service.ts` (permanente desde 2026-07-02) — chunking duro si un grupo cliente+regla supera 40 guías en el período.
- **Límite real de referencias en Enternet: 40, confirmado empíricamente 2026-07-02** (`gfackey=86`, 40 guías reales, folioSii=411207). La sesión 2026-07-01 lo había medido en 20 (correcto en ese momento) — Enternet subió el límite del lado de ellos entre ambas sesiones, cambio coordinado con el otro dev. `docs/PRD-detalle-factura.md` ya asumía 40 y no requirió actualización.
- Empresa de pruebas QA: `empkey=1163`, cliente `76407930-2` (Enternet Sociedad Anonima), regla `por_razon_social`. **El emisor NO es fijo** — depende del escenario: folios 411203-411206 (20 guías, 2026-07-01) usaron emisor `764079302`; `gfackey=86` (40 guías, 2026-07-02) usó `968880004` (el real del XML de esas guías). Verificar el emisor real antes de reusar datos de una sesión anterior para crear proformas de prueba nuevas.
- `Disp21072025101717` — ✅ confirmado habilitado en QA 2026-06-03.
- `RutUsuario` en emisión = encargado de facturación registrado en Enternet (≠ `RutEmisor`). Variable `FACTURACION_RUT_USUARIO` en `.env`. `16714595-7` funciona para emisor `968880004` (confirmado 2026-07-02, dos veces la misma sesión); para `921760000` requiere confirmar con Enternet. No asumir que un `RutUsuario` sirve para todos los emisores. ⚠️ **`18467599-4` con emisor `764079302` dejó de estar registrado entre el 2026-06-19 y el 2026-07-02** (estaba confirmado, retesteado y rechazado) — el registro de encargados en Enternet QA no es estable entre sesiones, retestear antes de reusar un par de una sesión anterior.
- Enternet devuelve HTTP 200 para errores de negocio: `{ Messages: [{Id, Description}] }`. Solo devuelve `{ ResultadoDTE }` en éxito. Backoffice-adapter detecta el `Messages` y lanza error antes de devolver al middleware.
- **El adapter devuelve `ResultadoDTE` plano** — `response.json()` ya ES el ResultadoDTE, no `{ ResultadoDTE: { ... } }`. `backoffice-adapter.service.ts` corregido para esto.
- `EstadoEmision: "XFIRMAR"` = borrador creado, pendiente firma digital. `LinkVisualizacion` = URL del plugin firmador Enternet. `Modo: "MODOFIRMA;RETORNALINKPARAFIRMAR"` es el modo correcto para flujo con firma.
- `LinkXML` viene vacío en modo MODOFIRMA (esperado — se llena después de la firma).
- Folio `0` en el Mensaje = Enternet asigna folio SII. El folio interno `gfacfolio` es solo trazabilidad interna.
- RUT EMISOR en Mensaje V5: sin puntos ni guión (`764079302`). RUT CLIENTE: con puntos y guión (`78.041.840-0`). El XML del DTE devuelve RUTs con guión sin puntos (`76407930-2`) → aplicar `formatRutEmisor` / `formatRutCliente` antes de insertar en el Mensaje.
- Datos emisor de la factura provienen de `factura.rutEmisor` (almacenado al crear la proforma via `?rut=`). Datos receptor (cliente) del tag `<Receptor>` del XML de la guía. **Ya NO se lee `<Emisor>` del XML en `_emitir`.**
- `diasCredito` default 30 para `FECHA DE VENCIMIENTO` — diseño final depende de criterio emisor/receptor (no de la `Regla`). Campo `dias_credito` en `gde.regla` del PRD es un placeholder; decisión pendiente.
- Spec del formato V5: `docs/FormatodeIntegracinbasadoenEtiquetasEstndarv5.html` (agregada al repo 2026-07-01; reemplaza la referencia vieja en `Downloads` de la sesión 2026-06-02) — consultar ante cualquier duda de formato/campos del Mensaje V5, no asumir.
- Diseño de Detalle+Referencia Factura (DTE 33): Casos 1 (S.G.), 2 y 3 (Por Producto) **implementados con TDD** (`mensaje-builder.ts`, ADR 0002). Caso 1 validado con dev senior 2026-07-01: texto `"Facturación según guías período {periodo}"`, sin `GLOSA`. Caso 4 (Global) **implementado 2026-07-02 pero sin validar en QA** — ver Historial sesión 3 e Historial Técnico.
- **Caso 4 (Global) — mecanismo de Referencia es hipótesis sin confirmar:** `mensaje-builder.ts` agrega `1:|TIPO DOC REFERENCIA|52`, `1:|FOLIO DOC REFERENCIA|0`, `1:|ACCION REFERENCIA|5` al encabezado cuando hay más de 40 guías, basado en la tabla `ACCION REFERENCIA` del spec V5 — que el spec documenta como aplicable solo a NC/ND, no a Factura. Nadie ha probado todavía si Enternet genera `IndGlobal=1`/`FolioRef=0` con este input. No asumir que funciona sin antes hacer una emisión real de prueba.
- **Fix redondeo IVA/MONTO TOTAL (2026-07-02):** `sumIva` y `sumDoc` en `buildMensaje` deben derivarse de los totales agregados (`round(sumNeto × 19%)`, `sumNeto+sumIva+sumExento`), no sumar `totiva`/`totdoc` ya redondeados por guía — con muchas guías (40+) el drift de redondeo acumulado rompe la validación de Enternet.
