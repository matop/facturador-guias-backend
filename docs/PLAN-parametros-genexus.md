# Plan — Consumo de parámetros GeneXus en guias-middleware (nivel aplicación / empresa / dispositivo)

Fecha de creación: 2026-07-08. Fuente de verdad de contexto: `docs/ESTADO.md`, memoria persistente del agente, y el proyecto de referencia `Parameter-device-js` (sidecar NestJS ya existente y probado en QA).

## Por qué este plan

Necesitamos que guias-middleware pueda leer **parámetros de configuración resueltos por nivel** (aplicación, empresa y opcionalmente dispositivo) en vez de tener valores hardcodeados en código. El caso disparador concreto:

- `src/facturas/facturas.service.ts:96` → `const MAX_GUIAS_POR_FACTURA = 40;` — hoy es una constante fija; debería poder variar por empresa (y tener un default de aplicación).

La buena noticia: **no hay que construir un sistema de configuración desde cero**. Ya existe un servidor de parámetros GeneXus (`Api/ObtencionParametros` en `nod16.enternet.cl`) que resuelve la jerarquía server-side, y un sidecar NestJS probado (`Parameter-device-js`) que lo consume. Este plan reusa esa infraestructura; guias-middleware solo agrega un cliente delgado.

## Cómo modela GeneXus los "niveles"

El servidor de parámetros ya tiene las dimensiones que necesitamos como parámetros de la query `GetParametrosValues`, y devuelve `ParametroJerarquia`/`ValorJerarquia` (la cascada se resuelve **del lado de GeneXus**, no en el middleware):

| Nivel | Campo en la API | Valor para este proyecto |
|---|---|---|
| Aplicación | `Aplicacion_Idl` | `FacturadorGuias` |
| Empresa | `Empkey` | el `empkey`/`tenantId` del request |
| Dispositivo (acotador opcional) | `AlcanceId` | `NULL`/vacío (todos) o un `DispositivoId` (ej. `Disp05062026151646`) para acotar solo a parámetros de dispositivos |
| Ambiente | `AmbienteId` | derivado del dispositivo (Desarrollo/QA/Producción) |

Nota: `AlcanceId` **no** es un "nivel de negocio" — es un filtro opcional que acota el alcance a parámetros de dispositivo. Puede ir vacío.

## Decisión de arquitectura: reusar el sidecar como proceso aparte

**guias-middleware NO embebe la lógica de parámetros. Consume el sidecar `Parameter-device-js` por HTTP.**

Se despliega el mismo código del sidecar (sin cambios) en el servidor donde corre la app, escuchando en `:3002`, y guias-middleware le pega por `http://localhost:3002`.

Razones:

1. **La auth exige la identidad de dispositivo.** El `ApiKey` que pide GeneXus se genera desde `DeviceService` (`DispInfo.txt` → `tokenGen` → cripto AES/MD5 + persistencia en disco). No existe una versión "solo parámetros, sin device": embeber obligaría a traer `DeviceModule` + cripto + lectura de paths con layout de Tomcat dentro de un middleware de DTE/Postgres. Cero ganancia, mucha superficie ajena.
2. **El sidecar lee archivos locales del host** (DispInfo, `parms202501.xml`, dirs de persistencia). Es infra acoplada al dispositivo/host; no pertenece dentro del middleware.
3. **Ya está construido, probado y desplegado en QA.** Riesgo de portar = 0. Es la opción más acotada.
4. **Separación de responsabilidades.** El sidecar es "el gateway a GeneXus (params + device)". Si a futuro otro servicio necesita parámetros —o la parte device sí resulta útil— ya está disponible y reusable, no se descartó.

Costo asumido: dos procesos + un hop HTTP. Trivial en localhost, y se mitiga con cache en el lado del middleware.

## Autenticación

Auth por **pareo de dispositivo** (mecanismo existente del sidecar):

- **Local (dev):** se usa el dispositivo ya referenciado `Disp05062026151646` vía `DISPOSITIVO_DATA_ROOT` apuntando a su `DATA/`.
- **Servidor:** apuntar `DISPOSITIVO_DATA_ROOT` (y `ecosystem.config.js` de PM2) al dispositivo/ambiente correcto del servidor.

`AmbienteId` se deriva automáticamente del dispositivo (`GetDispositivoInformacion`), no se hardcodea.

## Fases

### Fase 0 — Confirmaciones (sin código)

**Estado (2026-07-14): Fase 0 completa, plan desbloqueado.**

- [x] `Aplicacion_Idl` = `FacturadorGuias` (corregido; el valor original `Plugin` era incorrecto para este proyecto).
- [x] `AlcanceId` = `NULL`/vacío o un `DispositivoId` (acotador opcional).
- [x] Definir el parámetro `MaximoGuias` en el servidor GeneXus. **Confirmado (2026-07-14) vía `GET /parameter/values` contra `Parameter-device-js`:** existe a nivel `01 APLICACION`, `ValorParametroValor: "40"`, vigente `2026-07-14` → `2090-12-31`. Coincide con el default actual en código (`MAX_GUIAS_POR_FACTURA = 40`), sin cambio de comportamiento al migrar.
- [x] Confirmar el `DispositivoId`/ambiente del servidor de producción/QA donde correrá el sidecar. → `Dispositivo: ServEmisorSB`, `Ambiente: QA` (confirmado).

### Fase 1 — Sidecar en el servidor

**Estado (2026-07-14): deploy real delegado al usuario (credenciales/PM2 fuera del alcance del agente). Fases 2 y 3 avanzaron en paralelo porque no dependen del deploy — el fallback en código las hace seguras sin sidecar arriba.**

- [ ] Deploy de `Parameter-device-js` (PM2, `:3002`), env apuntando al dispositivo/ambiente correcto. — **pendiente, lo hace el usuario manualmente.**
- [ ] Verificar en el servidor: `GET /parameter/values?app=FacturadorGuias&parametro=MaximoGuias&empkey=<E>` devuelve el valor esperado.
- [x] Endpoint `GET /parameter/value` (valor único resuelto, `{ parametroId, valor }`) — **agregado (2026-07-14)** en `Parameter-device-js` por el usuario. Ya no es dependencia externa bloqueante; falta desplegarlo junto con el resto del sidecar y verificarlo end-to-end en el servidor.

### Fase 2 — Cliente `ParametrosModule` en guias-middleware (lo único nuevo)

**Estado (2026-07-14): completa vía TDD.** `src/parametros/{parametros.service.ts,parametros.module.ts,param-registry.ts}` + `parametros.service.spec.ts` (9 tests). Contrastado en vivo contra un sidecar real corriendo en `:3002` durante el desarrollo (devolvió el valor real `40` para `MaximoGuias`).

- [x] `ParametrosModule` + `ParametrosService`: cliente HTTP al sidecar.
  - Config: `PARAMETROS_SIDECAR_URL` (default `http://localhost:3002`), `PARAMETROS_APP_IDL` (default `FacturadorGuias`).
  - `get(parametroId, { empkey, alcance? }): Promise<string | undefined>`.
- [x] **Cache TTL en memoria** (5 min, por `parametroId:empkey:alcance`).
- [x] **Fallback a default en código** si el sidecar no responde (error de red o HTTP no-ok) o el valor no es numérico → nunca lanza, siempre resuelve.
- [x] Mini-registro tipado `PARAM_REGISTRY` (`src/parametros/param-registry.ts`), equivalente liviano al `REGLA_REGISTRY` que ya usa el repo:
  ```ts
  export const PARAM_REGISTRY = {
    MaximoGuias: { tipo: 'number', default: 40 },
  } as const;
  ```
- [x] Getter tipado: `getMaximoGuias(empkey): Promise<number>`.
- [x] Tests unit con `fetch` mockeado (patrón `jest.spyOn(global, 'fetch')`), incluyendo cache, aislamiento por empkey, y los 3 paths de fallback (HTTP no-ok, error de red, valor no numérico).

### Fase 3 — Primer uso real (TDD)

**Estado (2026-07-14): completa salvo la verificación E2E real (bloqueada por Fase 1).**

- [x] Reemplazar `MAX_GUIAS_POR_FACTURA` (era constante en `facturas.service.ts`, usada en el chunking de `generar` y `crearManual`) por `this.parametrosService.getMaximoGuias(empkey)`. `ParametrosService` inyectado en `FacturasService`; `ParametrosModule` importado en `FacturasModule`. El comentario de contexto de negocio (por qué 40 — límite de referencias de Enternet) se movió a `PARAM_REGISTRY`.
- [x] Mantener `40` como default de código (fallback, vía `PARAM_REGISTRY.MaximoGuias.default`) — comportamiento actual sin cambios si el parámetro no está definido o el sidecar no responde. Test dedicado (`facturas.service.spec.ts`: "usa el máximo de guías resuelto por ParametrosService en vez de un valor fijo") confirma que el valor resuelto por el servicio efectivamente gobierna el chunking.
- [ ] Verificar E2E en QA. — **bloqueado hasta que Fase 1 (deploy del sidecar en el servidor) esté lista.**

## Parámetros

**Confirmado (uso inmediato):**
- `MaximoGuias` — máximo de guías por factura. Externaliza `MAX_GUIAS_POR_FACTURA=40`.

**Candidatos a futuro (sugerencias del agente, a validar — NO bloquean este plan):**
- `PlazoFacturacionDias` — plazo (días) para facturar guías según norma SII; podría variar por empresa.
- `PermiteReferenciaGlobal` — feature flag por empresa para el Caso 4 (Global / `IndGlobal`), hoy condicionado por el bug de Enternet.
- `OrdenReferencias` — orden de referencias OC > HES > guías, hoy hardcodeado (PR #11).

Si ninguno de los candidatos aplica, el plan arranca perfectamente solo con `MaximoGuias`.

## Pendientes / a confirmar

_Actualizado 2026-07-14: Fase 0 desbloqueada; Fases 2 y 3 completadas en código (vía TDD) en paralelo al deploy de Fase 1. Único pendiente real: Fase 1 (deploy manual del usuario) y la verificación E2E que depende de ella._

1. `MaximoGuias` en GeneXus — **resuelto**: confirmado creado y con valor (`40`, nivel aplicación).
2. `DispositivoId`/ambiente del servidor — **resuelto**: `ServEmisorSB` / `QA`.
3. Endpoint `GET /parameter/value` en `Parameter-device-js` — **resuelto**: agregado por el usuario; queda pendiente el deploy/verificación end-to-end (Fase 1, manual, a cargo del usuario).
4. `Aplicacion_Idl` — **corregido**: es `FacturadorGuias`, no `Plugin` (dato erróneo en la versión original del plan).
5. Candidatos a futuro (`PlazoFacturacionDias`, `PermiteReferenciaGlobal`, `OrdenReferencias`) — sin cambios, no bloquean.
6. `ParametrosModule`/`ParametrosService` (Fase 2) — **resuelto**: implementado vía TDD, 9 tests, cache TTL + fallback + registry tipado.
7. Reemplazo de `MAX_GUIAS_POR_FACTURA` (Fase 3) — **resuelto** en código; falta solo la verificación E2E en QA, bloqueada por Fase 1.
