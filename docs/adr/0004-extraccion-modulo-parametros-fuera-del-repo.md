---
status: accepted (mecanismo concreto pendiente)
---

# Módulo de parámetros: extraído fuera de `src/` de guias-middleware

**Contexto:** en la conversación de gerencia del 2026-07-17, el dev senior objetó explícitamente que el módulo de parámetros (`src/parametros/` — `ParametrosService`, `PARAM_REGISTRY` y las fachadas dedicadas como `getMaximoGuias`, decisión de [ADR-0003](0003-motor-parametros-interno-mas-fachada-dedicada.md)) esté mezclado bajo el mismo `src/` que los módulos de negocio (facturas, reglas, clientes). Quiere el módulo separado del repo de guias-middleware; que guias-middleware solo lo consuma.

Para destrabar el entendimiento se comparó contra el patrón real de GeneXus (KB `AndesPOS2407N`): `ParmApp.InterfazParametro202302.GetParametro` (motor genérico, KB/app aparte — análogo a nuestro sidecar `Parameter-device-js`, ya externo) vs. `Utiles.Parametros` (wrapper con ~30 gets dedicados por parámetro, que en GeneXus vive **dentro** de la KB de la app consumidora, POS). Se le planteó esta comparación al usuario como hipótesis de que tal vez solo pedía separación *lógica* dentro de `src/` (análoga a `Utiles.*` viviendo dentro de la KB consumidora). Su respuesta fue que aplican **ambas cosas**: (1) sí, separación/nomenclatura más clara dentro de `src/`, y (2) además, el wrapper de fachadas dedicadas debe salir físicamente del repo como paquete/dependencia — yendo más lejos que el propio patrón GeneXus, donde `Utiles.Parametros` no sale de la KB consumidora.

**Decisión:** el módulo de parámetros (motor + fachadas dedicadas, hoy `src/parametros/`) se extrae fuera de `src/` de guias-middleware. Guias-middleware pasa a ser puramente consumidor: llama al módulo extraído y usa el resultado, sin alojar la lógica de resolución (registry, cache TTL, fallback a default) como código fuente propio del repo.

El patrón conceptual de ADR-0003 (motor único + fachada dedicada y tipada por parámetro, nunca `.get()` genérico esparcido por el código consumidor) **se mantiene** — solo cambia la ubicación física del código, no el diseño de la API.

**Mecanismo concreto de extracción: pendiente de definir.** Opciones sobre la mesa, ninguna descartada ni elegida todavía:
- Absorber el motor + las fachadas dedicadas dentro del sidecar `Parameter-device-js` existente (ya es un proceso externo separado), exponiendo endpoints dedicados por parámetro en vez de solo el genérico `GET /parameter/value`.
- Extraer `src/parametros/` a un paquete npm o repo separado (workspace o git dependency) que guias-middleware importa como librería, corriendo dentro del mismo proceso.
- Un tercer microservicio propio, distinto tanto de guias-middleware como del sidecar `Parameter-device-js`.

**Why:** feedback directo y explícito del dev senior — prioriza la separación física de módulos por proceso/paquete sobre la organización lógica por carpeta dentro de un mismo repo. No se profundizó en el *por qué* detrás de esa preferencia (paradigma de equipo, plan de reuso entre proyectos, u otro) más allá de la referencia a "aplicación de consumo" + "interfaz para consumir esa app" como patrón que su equipo usa siempre.

## Considered Options

- **No hacer nada, mantener ADR-0003 tal cual** — rechazado: contradice feedback explícito y reciente de gerencia.
- **Solo reorganizar dentro de `src/`** (ej. mover a `src/integrations/parametros/`) sin extraer del repo — rechazado como decisión final (el usuario confirmó que no alcanza), aunque podría servir como paso intermedio de claridad mientras se define el mecanismo de extracción real.

## Consequences

No implementar código nuevo de parámetros (ej. generalizar `PARAM_REGISTRY` con los candidatos de `docs/PLAN-parametros-genexus.md`) hasta que el mecanismo concreto de extracción esté definido — evita construir sobre una ubicación que va a moverse. Próximo paso: el usuario debe confirmar con su jefe cuál de las 3 opciones de mecanismo aplica antes de tocar `src/parametros/`.

Referencias: [ADR-0003](0003-motor-parametros-interno-mas-fachada-dedicada.md) (decisión parcialmente superada), `docs/PLAN-contexto-genexus.md` (diagrama de los 3 patrones GeneXus), `docs/PLAN-parametros-genexus.md` (implementación actual de `ParametrosModule`, PR #53).
