# facturador-guias-backend

Backend NestJS que sincroniza guías de despacho electrónicas (DTE tipo 52) desde
`backoffice-adapter` y las agrupa/emite como facturas (DTE tipo 33) hacia Enternet (SII).

## Stack

- NestJS + TypeScript + TypeORM + PostgreSQL
- Puerto por defecto: `3334`
- Schema de base de datos: `gde` (`synchronize: false` — no usar migraciones automáticas de TypeORM)
- Gestor de paquetes: **pnpm** (no usar npm)

## Conceptos de dominio

Ver `CONTEXT.md` para el glosario completo (Tenant/Empresa, Cliente, Guía, Sync, `empkey`) y
los documentos en `docs/` para el diseño de features (Detalle+Referencia de Factura, OC/HES,
normas SII consultadas).

## Setup local

```bash
pnpm install
cp .env.example .env   # completar credenciales/DB locales
pnpm run start:dev
```

### Variables de entorno (`.env`)

Ver `.env.example` para la lista completa: puerto, conexión a PostgreSQL (`facturagdes2`),
URL de `backoffice-adapter` (`http://localhost:3333` en local) y credenciales de facturación.

### Integraciones

- Consume `backoffice-adapter` (`:3333`) vía HTTP para obtener guías raw.
- Es consumido por `facturaGdes` (`:5173`) vía proxy Vite (`/empresas → localhost:3334`).

## Scripts

```bash
pnpm run start:dev    # desarrollo, watch mode
pnpm run build        # compilar
pnpm run start:prod   # producción (dist/main)
pnpm run test         # unit tests
pnpm run test:cov     # unit tests con cobertura
pnpm run test:e2e     # e2e
pnpm run lint         # eslint --fix
pnpm run format       # prettier
```

## Documentación

- `CONTEXT.md` — glosario de dominio, siempre al día.
- `docs/` — PRDs de features, consultas a Enternet/SII, ADRs (`docs/adr/`).
