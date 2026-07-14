# Estado del Proyecto — guias-middleware

Última actualización: 2026-07-14 (fix Issue #48 — exclusión de `EMITIDA` en `facturas.service.ts`, doble facturación). Historial completo de sesiones anteriores (mayo–julio 2026)
en `docs/archive/HISTORIAL-2026-05-a-07.md` y en `git log`/PRs cerrados en GitHub — no
duplicar esa narrativa acá, solo el estado vigente y lo pendiente.

## Estado de Componentes

| Componente | Estado | Nota |
|------------|--------|------|
| Sync SOAP→DB | ✅ Funcional | `POST /empresas/:empkey/sync?rut=` — 2 fases (clientes sin tx, guías+impuestos+agrupadores en tx) |
| Regla Agrupadora (`extraeTagLista`, `extraeReferenciaPorTipo`) | ✅ Funcional | `REGLA_REGISTRY` + `reglaconfig jsonb`, discriminated union por `fn`. Ver memoria `reglas-y-sync` |
| GroupingService (batch) | ✅ Funcional | `batchComputeAgrupadores`, evita N+1; recorta padding `character(20)` de `gclirut` en el lookup interno (PR #37) |
| Detalle+Referencia Factura (DTE 33) — Casos 1-4 (S.G./Por Producto/Global) | ✅ Confirmado E2E en QA real | `src/mensaje/mensaje-builder.ts` |
| Referencias OC (801) / HES en Factura, incl. modo Global | ✅ Confirmado E2E en QA real | `parseReferencias()` en `xml-parser.utils.ts`; falta XML real de cliente con OC/HES poblada (solo sintéticos hasta ahora) |
| Proforma (`factura` + `facturaguias`) | ✅ Funcional | partición `(gclirut, guireglaidl, guivaloragrupador)` — 1 proforma por valor de agrupador; chunking `MAX_GUIAS_POR_FACTURA=40`; estados BORRADOR→APROBADA→EMITIDA\|FALLIDA\|ANULADA |
| Emisión DTE tipo 33 (Enternet REST) | ✅ Funcional | `aprobar` emite automático; `POST /facturas/emision` retry batch de FALLIDA |
| Prefijo global de rutas HTTP | ✅ Aplicado | `/facturador-guias-backend/api` (`app.setGlobalPrefix`, `src/main.ts`) |
| Tests unitarios | ✅ 280/280, 0 skips | 18 suites |

## Pendientes

- **[Issue #48](https://github.com/matop/facturador-guias-backend/issues/48) corregido**: el bug de doble facturación (guías `EMITIDA` no se excluían de las queries de "guías disponibles" en `generar()`/`crearManual()`, `src/facturas/facturas.service.ts`) fue corregido en los 4 sitios afectados (líneas ~297, ~322, ~393, ~417), con 4 tests de regresión nuevos. Se confirmó que los folios SII citados como evidencia (411204/411207) son de ambiente QA, no producción real — no hubo exposición tributaria. Issues secundarios de hardening abiertos por separado, baja prioridad: [#49](https://github.com/matop/facturador-guias-backend/issues/49) (CHECK constraint en `gde.factura.estado`), [#50](https://github.com/matop/facturador-guias-backend/issues/50) (validar `estado` en `GET .../facturas/proforma?estado=`).
- **Pregunta de producto abierta (no bug)**: `assertPuedeAnular` bloquea anular una proforma desde estado `FALLIDA` — solo se puede reintentar la emisión vía `emitirPendientes`. Parece intencional (evita anular algo que aún podría reintentarse), pero no está confirmado con el usuario. No corregir sin antes validar la intención de producto.
- **Proxy Vite de `facturaGdes`** (repo externo) — actualizar de `/empresas → localhost:3334` a `/facturador-guias-backend/api → localhost:3334`. Bloqueante para dev local del front.
- **Plan verificación E2E** (`docs/PLAN-verificacion-e2e-completa.md`) — sesiones 1-4 cerradas (Sesión 4 ejecutada 2026-07-13, folioSii=411236, encontró y corrigió el bug de padding de `gclirut` en recompute bulk); **sesión 5 pendiente** (cierre/consolidación final).
- **Plan parámetros GeneXus** (`docs/PLAN-parametros-genexus.md`, PR #22 abierto, doc-only) — externalizar `MAX_GUIAS_POR_FACTURA` y otros valores hardcodeados vía el sidecar `Parameter-device-js`. Ver memoria `plan-parametros-genexus`.
- XML real de cliente con `<Referencia>` OC (801)/HES poblada — sigue sin existir, solo validado con fixtures sintéticos.
- Filtro `IndTraslado=1` — solo guías que constituyen venta deberían facturarse (sin implementar).
- Alerta de 10 días hábiles en UI (plazo SII para facturar guías del mes anterior) — sin implementar.
- HES (Hoja de Entrada de Servicios, campo 802 del DTE) — mecanismo de ingreso al sistema sin definir.
- URL productiva de Enternet para emisión — solo QA configurado hasta ahora.
- Modo Global + OC/HES: la referencia global `52`/`0` sale duplicada en el XML de salida (trío de encabezado + línea `5:|52|0|`) — no bloquea la emisión, mejora cosmética a futuro.

## Contexto operativo

Ver la memoria persistente del agente para lo que antes vivía acá disperso en "Contexto Crítico"/"Lecciones Aprendidas": `archivos-clave.md`, `schema-db.md`, `reglas-y-sync.md`, `gotchas.md`, `emision-dte-historial.md`, `api-endpoints.md`.
