# Domain Docs

Cómo deben consumir los skills de ingeniería la documentación de dominio de este repo al explorar el código.

## Antes de explorar, leer esto

- **`CONTEXT.md`** en la raíz del repo — glosario y vocabulario de dominio (tenant/empresa, guías, proformas, reglas de agrupación, etc.).
- **`docs/adr/`** — leer los ADRs que tocan el área en la que se va a trabajar:
  - `0001-modo-detalle-vive-en-cliente.md`
  - `0002-sin-codigo-en-lineas-de-tramo-precio-variable.md`

No existe `CONTEXT-MAP.md` — este es un repo **single-context**.

## Estructura de archivos

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-modo-detalle-vive-en-cliente.md
│   └── 0002-sin-codigo-en-lineas-de-tramo-precio-variable.md
└── src/
```

## Usar el vocabulario del glosario

Cuando la salida de un skill nombra un concepto de dominio (en el título de un issue, una propuesta de refactor, una hipótesis, el nombre de un test), usar el término tal como está definido en `CONTEXT.md`. No derivar a sinónimos que el glosario evita explícitamente.

Si el concepto que se necesita no está todavía en el glosario, eso es una señal — o se está inventando lenguaje que el proyecto no usa (reconsiderar), o hay un gap real (anotarlo para `/domain-modeling`).

## Marcar conflictos con ADRs

Si la salida contradice un ADR existente, mostrarlo explícitamente en vez de sobreescribirlo en silencio.
