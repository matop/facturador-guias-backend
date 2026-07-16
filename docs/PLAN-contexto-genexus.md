# Contexto/parámetros GeneXus — diagrama comparativo y roadmap de encapsulamiento

Fecha: 2026-07-16. Sesión de pura ideación (sin código tocado en este documento salvo el propio doc) en respuesta a un cuestionamiento de gerencia sobre si `guias-middleware` encapsula suficientemente las llamadas a parámetros/contexto GeneXus.

## Motivación

El jefe del usuario (dev senior, formado en paradigmas GeneXus más antiguos) cuestionó si el acceso a parámetros/contexto GeneXus está suficientemente encapsulado. Este documento resume el análisis hecho contra trazas reales (`InicializaContextoSession`, `InitContextoSession`, trazas App Emisor/PoS, `initapiparametroswrut.java`, `intemisor.java` — fuera de este repo, en `C:\Proyectos\getParametros\docs\`) y contra el código real del sidecar `Parameter-device-js`.

**Conclusión adelantada:** no hace falta un seam nuevo. El seam correcto ya existe (`src/parametros/`, `ParametrosModule`/`ParametrosService`, mergeado vía PR #53) — solo necesita generalizarse a medida que aparezcan más parámetros.

> Nota de fidelidad: el diagrama y la tabla de abajo reconstruyen fielmente lo discutido en una sesión de chat anterior (nunca se había persistido a disco). La lectura "GeneXus evolucionó del patrón A (EmisorV24) al patrón B (`202302`)" es una inferencia a partir de la evidencia de trazas (namespace `202302`, ambos patrones coexistiendo en las trazas), **no** una confirmación leída directamente en el código fuente histórico de GeneXus.

## Diagrama — 3 patrones

```
┌─────────────────────────────┐   ┌─────────────────────────────────┐   ┌──────────────────────────────────┐
│  PANEL 1 — EmisorV24 (viejo)│   │  PANEL 2 — GeneXus moderno       │   │  PANEL 3 — guias-middleware       │
│                              │   │  (namespace 202302)              │   │                                   │
│  Utiles.Parametros.Get.*    │   │  ParmApp.InterfazParametro202302 │   │  src/parametros/                 │
│  (1 objeto POR parámetro)   │   │                                  │   │                                   │
│                              │   │  1) InicializaParametrosDispositivo │  Parameter-device-js (sidecar,   │
│  pmMAILASUNTO   ─┐          │   │     (priming, token de dispositivo) │  NestJS, :3002)                  │
│  pathXSLTED      ├─ c/u:    │   │  2) InicializaParametrosNegocio     │      │                            │
│  pmOTROPARAM     │  LEEARCHIVO│  │     (priming, mismo token)          │      ▼                            │
│  ... (15+)      ─┘  PARAMETROS│  │                                  │  GET /parameter/value            │
│                     +        │   │  N) GetParametroValorReducido(id)│  (contrato estable, resuelto)     │
│                     BUSCAPAR-│   │     — nunca lanza, cachea vacío  │      │                            │
│                     AMETROENXML│  │     1 día si no existe          │      ▼                            │
│                     (c/u lee │   │                                  │  ParametrosService.get()         │
│                     parametros│  │                                  │  (MOTOR INTERNO — nunca sale     │
│                     .xml local│  │                                  │  de src/parametros)              │
│                     + fallback)│ │                                  │  cache TTL 5min, nunca lanza,     │
│                              │   │                                  │  fallback a default de código    │
│                              │   │                                  │      │                            │
│                              │   │                                  │      ▼                            │
│                              │   │                                  │  getMaximoGuias(empkey)           │
│                              │   │                                  │  (1 método dedicado y TIPADO      │
│                              │   │                                  │  por parámetro — única fachada    │
│                              │   │                                  │  visible para el resto del repo)  │
└─────────────────────────────┘   └─────────────────────────────────┘   └──────────────────────────────────┘
```

## Tabla comparativa

| Aspecto | EmisorV24 (viejo) | GeneXus moderno (`202302`) | guias-middleware |
|---|---|---|---|
| Duplicación por parámetro | Sí — 15+ objetos, cada uno reimplementa lectura + fallback | No — motor único + N llamadas baratas | No — motor único (`ParametrosService.get()`) + N fachadas dedicadas (`getMaximoGuias`, futuras) |
| Fuente de datos | XML local (`parametros.xml`) en el dispositivo | API GeneXus (servidor), vía priming de contexto | API GeneXus, vía sidecar `Parameter-device-js` |
| Parámetro faltante/no definido | Comportamiento variable por objeto, sin contrato único | Nunca lanza; cachea vacío 1 día | Nunca lanza; fallback a default en código (`PARAM_REGISTRY`) + cache TTL 5 min |
| Autenticación | N/A (archivo local, sin red) | Token de dispositivo (par device + timestamp + hash) | Mismo mecanismo de token de dispositivo, delegado en el sidecar (`DeviceService.tokenGen`) |
| Alcance/scope soportado | Solo local, sin jerarquía | Dispositivo + Negocio (2 llamadas de priming separadas) | Empresa (`Empkey`) + Dispositivo (`AlcanceId`, opcional) en una sola llamada — GeneXus resuelve la cascada server-side |
| Acceso externo al motor genérico | N/A (cada objeto ES la fachada) | No aplica — `GetParametroValorReducido` ya es la fachada | Prohibido por convención — nadie fuera de `src/parametros` llama `.get()` directamente |

## Fase 1 del roadmap — resuelta (2026-07-16)

**Pregunta abierta que quedaba:** ¿el sidecar `Parameter-device-js` ya prima el scope "Negocio" (equivalente a `InicializaParametrosNegocio` en la traza GeneXus original) además de "Dispositivo"?

**Respuesta, leyendo el código real** (`C:\Proyectos\Parameter-device-js\src\modules\parameter\parameter.service.ts` y `parameter.controller.ts`):

El sidecar no modela "Negocio" como un scope separado — lo que en la traza GeneXus se llama `InicializaParametrosNegocio` corresponde aquí al campo `Empkey` (nivel Empresa), que **ya viaja en todas las llamadas reales**: `ParameterController.getValue()` exige `empkey` como parámetro requerido del endpoint `GET /parameter/value`, y `ParameterService.obtenerParametroValue()` lo reenvía sin transformar a `consumoGetParametrosValues()` → GeneXus `GetParametrosValues`, junto con `AlcanceId` (Dispositivo, opcional). GeneXus resuelve la cascada `ParametroJerarquia`/`ValorJerarquia` del lado del servidor con ambos campos ya presentes en la request.

**Conclusión:** no hay gap. El sidecar ya prima Empresa + Dispositivo en una sola llamada. El paso condicional "extender el sidecar si falta Negocio" del roadmap original queda cerrado como **no aplica** — no se requiere ningún cambio en `Parameter-device-js`.

## Roadmap actualizado

1. ~~Auditoría del sidecar~~ — **resuelto** (ver arriba). No hay gap de scope.
2. Formalizar como regla documentada (ADR o línea en `CONTEXT.md`): todo acceso a datos GeneXus pasa por `src/parametros`; nadie más hace fetch directo al sidecar/GeneXus.
3. Generalizar `PARAM_REGISTRY` con los candidatos ya anotados en `docs/PLAN-parametros-genexus.md` (`PlazoFacturacionDias`, `PermiteReferenciaGlobal`, `OrdenReferencias`), cada uno con su propio método dedicado — siguiendo el patrón `getMaximoGuias`.
4. ~~Extender el sidecar~~ — **no aplica** (ver Fase 1).
5. Blindaje anti-regresión (grep-able check o lint que impida llamar `.get()` fuera de `src/parametros`) — diferir hasta que haya más parámetros/devs; no crear tooling prematuro para 1 solo parámetro real.

Relacionado: `docs/PLAN-parametros-genexus.md` (plan cerrado que dejó el `ParametrosModule` base).
