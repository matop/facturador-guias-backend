# Issue tracker: GitHub

Issues y specs/PRDs para este repo viven como GitHub issues en `matop/facturador-guias-backend`. Usar la CLI `gh` para todas las operaciones.

## Conventions

- **Crear un issue**: `gh issue create --title "..." --body "..."`. Usar heredoc para bodies multilínea.
- **Leer un issue**: `gh issue view <number> --comments`, filtrando comentarios con `jq` y trayendo también los labels.
- **Listar issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` con `--label`/`--state` según corresponda.
- **Comentar un issue**: `gh issue comment <number> --body "..."`
- **Aplicar / quitar labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Cerrar**: `gh issue close <number> --comment "..."`

El repo se infiere de `git remote -v` — `gh` lo hace automáticamente al correr dentro del clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** Repo de un solo desarrollador (`matop`), sin PRs externos de comunidad — el flujo actual del proyecto es 100% vía PRs propios ya revisados directamente (ver `gh pr list`, 30+ PRs mergeados/cerrados históricos). `/triage` no debe tratar PRs como cola de solicitudes.

## When a skill says "publish to the issue tracker"

Crear un GitHub issue con `gh issue create`.

## When a skill says "fetch the relevant ticket"

Correr `gh issue view <number> --comments`.
