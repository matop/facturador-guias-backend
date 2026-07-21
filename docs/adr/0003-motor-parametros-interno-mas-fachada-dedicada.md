---
status: superseded by 0004
---

# Acceso a parámetros/contexto GeneXus: motor interno único + fachada dedicada por parámetro

> **Superseded (2026-07-17):** la parte de este ADR que ubica el motor + la fachada dedicada dentro de `src/parametros/` del propio repo quedó superada por [ADR-0004](0004-extraccion-modulo-parametros-fuera-del-repo.md), a pedido explícito del dev senior en la conversación de gerencia del 2026-07-17. El patrón "motor único + fachada dedicada tipada por parámetro" (la parte conceptual de esta decisión) sigue vigente — lo que cambia es **dónde vive el código**, no el patrón en sí.

**Contexto:** gerencia (dev senior, formado en paradigmas GeneXus antiguos) cuestionó si el acceso a parámetros/contexto GeneXus en guías-middleware está suficientemente encapsulado, disparado por el patrón que existe en la KB de GeneXus EmisorV24 (`Utiles.Parametros.Get.*` — un objeto distinto por parámetro, ej. `pmMAILASUNTO`, `pathXSLTED`, 15+ en total).

**Decisión:** no crear un seam nuevo. `src/parametros/` (`ParametrosModule`/`ParametrosService`, PR #53) ya es el seam correcto. `ParametrosService.get(parametroId, opts)` queda como **motor interno** — nunca se llama fuera de `src/parametros`. Cada parámetro nuevo expone su propio **método dedicado y tipado** (mismo patrón que `getMaximoGuias(empkey)` en `facturas.service.ts`), que es la única fachada visible para el resto del repo.

**Why:** resuelve la falsa dicotomía "motor genérico vs. un objeto dedicado por parámetro". EmisorV24 (GeneXus viejo) resolvía esto duplicando lectura+fallback en 15+ objetos, cada uno reimplementando `LEEARCHIVOPARAMETROS`/`BUSCAPARAMETROENXML` contra un XML local — sin motor común. GeneXus moderno (namespace `202302`) ya separó esto en 2 llamadas de priming (`InicializaParametrosDispositivo`/`InicializaParametrosNegocio`) seguidas de N llamadas baratas a un getter reducido (`GetParametroValorReducido`) que nunca lanza. El diseño de guías-middleware sigue ese mismo espíritu — un motor común (cache TTL 5 min, nunca lanza, fallback a default de código) + N fachadas baratas — pero, a diferencia de GeneXus moderno (donde la fachada *es* el motor genérico `GetParametroValorReducido(id: string)`), en TypeScript preferimos forzar un método explícito y tipado por parámetro en vez de esparcir llamadas a un `get(id: string)` no tipado por todo el código. Ver `docs/PLAN-contexto-genexus.md` para el diagrama de los 3 patrones y la tabla comparativa completa.

## Considered Options

- **Exponer `ParametrosService.get()` directamente a cualquier consumer** — rechazado: pierde tipado y hace imposible saber por grep qué parámetros se usan dónde.
- **Un módulo/clase separada por parámetro**, imitando el patrón `Utiles.Parametros.Get.*` de EmisorV24 — rechazado: reintroduce la duplicación de lectura+fallback que se buscaba eliminar.

## Consequences

Checklist al agregar un parámetro nuevo: (1) entrada en `PARAM_REGISTRY`, (2) método dedicado tipado en `ParametrosService`, (3) nunca llamar `.get()` desde fuera de `src/parametros`. Todavía sin enforcement automático (lint/grep-check) — se difiere hasta que haya más de un parámetro real o entre otro dev al equipo (ver `docs/PLAN-contexto-genexus.md`, paso 5 del roadmap).

Referencias: `docs/PLAN-contexto-genexus.md` (diagrama comparativo completo, Fase 1 del roadmap resuelta), `docs/PLAN-parametros-genexus.md` (historial de implementación de `ParametrosModule`).
