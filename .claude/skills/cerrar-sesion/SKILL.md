---
name: cerrar-sesion
description: Cierra el día/sesión de trabajo en guias-middleware — audita branches/worktrees pendientes, mergea a main lo que ya está verificado, sincroniza checkouts con origin/main, actualiza docs/ESTADO.md y la memoria del proyecto, y deja registro en Obsidian. Use when el usuario dice "cerremos el día", "cierra la sesión", "merge everything y cerremos", "wrap up", o invoca /cerrar-sesion.
---

# Cerrar Sesión — Auditoría + Merge + Docs + Memoria + Obsidian

Contraparte de cierre de `sesion-start`. Ejecutar como checklist, no como script rígido —
cada paso puede saltarse si no aplica, pero no saltarse sin decir por qué.

## Paso 1: Auditar git

En paralelo:
- `git worktree list` — todos los worktrees activos y sus branches.
- `gh pr list --state open --json number,title,headRefName,isDraft` — PRs abiertas del repo.

Para cada worktree/branch con trabajo propio del proyecto (ignorar ramas de dependabot):
- ¿Tiene PR abierta? Si no, y tiene commits que no están en `origin/main`
  (`git merge-base --is-ancestor <HEAD-del-branch> origin/main` → "no"), es candidato a PR.
- ¿Quedó un commit "huérfano" tras el merge de una PR relacionada? Pasa seguido: se hace un
  commit de seguimiento en el mismo branch después de que su PR ya se mergeó (squash), y ese
  commit no tiene PR propia. Detectarlo comparando `git log <branch> --oneline` contra
  `git log origin/main --oneline` — si el tip del branch no es ancestro de `origin/main` pero
  el PR de esa branch ya aparece MERGED (`gh pr list --state all --head <branch>`), es este caso.

Reportar un resumen tipo tabla antes de tocar nada: branch → estado (limpio / PR abierta /
commit huérfano / código sin verificar).

## Paso 2: Mergear lo que ya está verificado

Para cada pieza de trabajo con **evidencia de verificación real** (tests en verde, E2E
confirmado contra QA, o explícitamente aprobado por el usuario en la conversación) que
todavía no está en `main`:

1. `gh pr create` (si no existe ya una).
2. Mergear:
   - **Automático, sin preguntar**: cambios doc-only (`docs/*.md`, `ESTADO.md`, `CONTEXT.md`,
     memoria) o de scripts de test sintético — bajo riesgo, reversible con un revert.
   - **Preguntar antes de mergear**: cualquier cambio de código funcional (`src/**`) no trivial,
     migraciones SQL, cambios de config/CI. Mostrar qué se va a mergear y esperar confirmación.
   - **Nunca automático**: force-push, borrar branches remotas, `git reset --hard` sobre
     branches compartidas.
3. `gh pr merge <n> --squash --delete-branch=false` (dejar los branches; borrarlos es una
   decisión aparte, preguntar si el usuario quiere limpiarlos).

## Paso 3: Sincronizar checkouts con origin/main

Después de cada merge, sincronizar **todo checkout activo que corra código de la app**
(especialmente el que sirve el server de dev, típicamente `:3334`) con `git merge origin/main`
y avisar si hace falta reiniciar el proceso.

Gotcha recurrente (pasó el 2026-07-09): un E2E que da un resultado que contradice un diseño
ya implementado y testeado casi siempre es un checkout desincronizado, no un bug de lógica.
Verificar con `git merge-base --is-ancestor <commit-del-fix> HEAD` en el checkout que corre el
server ANTES de asumir que hay que debuggear código.

## Paso 4: Actualizar docs/ESTADO.md

- Agregar una entrada nueva en `## Historial Técnico` con: qué se confirmó/cerró hoy, evidencia
  real (folioSii, IDs de test, output de comandos), y cualquier gotcha descubierto.
- Actualizar la línea de cabecera de sesiones (fecha + resumen de una línea) al tope del archivo.
- Si algo quedaba como "pendiente" en una entrada anterior y hoy se resolvió, edita esa entrada
  en vez de solo agregar una nueva — evita que el estado quede contradictorio entre secciones.

## Paso 5: Actualizar memoria del proyecto

Revisar los archivos de memoria (`~/.claude/projects/<proyecto>/memory/`) relevantes al trabajo
de la sesión — normalmente el mismo archivo que ya se venía actualizando en sesiones previas
sobre este tema. Actualizar:
- Pendientes que se resolvieron (marcar cerrado, no dejar "falta X" si X ya se hizo).
- Gotchas nuevos descubiertos (ver ejemplo del Paso 3).
- El índice `MEMORY.md` si el resumen de una línea quedó desactualizado.

No crear un archivo de memoria nuevo por sesión — actualizar el existente sobre el tema.

## Paso 6: Registrar en Obsidian

Invocar el skill `obsidian-log` con un resumen de la sesión: decisiones tomadas, causa raíz de
cualquier bug encontrado (no solo el síntoma), qué quedó mergeado, y qué queda pendiente para
la próxima sesión. Dejar que ese skill decida si toca `Metas.md` o crea una nota en `Ideas/`.

## Cierre

Terminar con un resumen corto: qué se mergeó (número de PRs), qué quedó pendiente y por qué
(bloqueado, necesita decisión del usuario, o simplemente no era parte del alcance de hoy).
