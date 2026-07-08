# Plan de Implantación - facturador-guias-backend

**Fecha de impacto planificada:** 26/08/2026
**Responsable del despliegue:** [NOMBRE]
**Ticket/RFC asociado:** [TICKET]

# Aplicaciones

* facturador-guias-backend (NestJS — API de agrupación/emisión de facturas DTE 33 desde guías DTE 52)

# Plataforma

* Ambiente Producción
  * App Server
    * [SERVER] [PUERTO 3334 o el asignado en prod]
  * BD Server
    * [SERVER] [BDSERVER] [BDNAME — equivalente prod de `facturagdes2`, schema `gde`]
* Ambiente QA Conf
  * App Server
    * [SERVER] [PUERTO]
  * BD Server
    * [SERVER] [BDSERVER] [BDNAME]
* Ambiente QA
  * App Server
    * [SERVER] [PUERTO] (hoy validado localmente contra QA de Enternet — ver Recursos)
  * BD Server
    * [SERVER] [BDSERVER] [BDNAME]

# Recursos

* Repositorio: `facturador-guias-backend` (rama `main`, último commit incluido en este PIM: `0cb15d5`)
* Runtime: Node.js + pnpm (**no usar npm** — el proyecto está fijado a pnpm, sin lockfile de npm)
* Build: `pnpm install && pnpm run build` → `dist/`
* Arranque prod: `pnpm run start:prod` (`node dist/main`)
* Variables de entorno requeridas (ver `.env.example`):
  * `PORT` (default `3334`)
  * `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
  * `BACKOFFICE_ADAPTER_URL` (URL de `backoffice-adapter` en el ambiente correspondiente)
  * `FACTURACION_RUT_USUARIO` (RUT de encargado de facturación registrado en Enternet — **este valor puede caducar/cambiar del lado de Enternet sin aviso, verificar vigencia antes del impacto**, ver `docs/emision-dte-historial.md`)
* Migraciones SQL pendientes de aplicar en Producción (`sql/`, orden correlativo):
  * `008-rut-emisor-factura.sql` — agrega `gde.factura.rut_emisor VARCHAR(20) NOT NULL DEFAULT ''`
  * `009-modo-detalle-cliente.sql` — agrega `gde.clientes.modo_detalle VARCHAR(20) NULL`
  * ⚠️ Confirmar contra la BD de Producción cuáles de estas ya fueron aplicadas antes del impacto (`synchronize: false`, no hay migraciones automáticas de TypeORM — el historial de qué se corrió en cada ambiente no queda registrado en el repo).
* Integraciones externas involucradas:
  * `backoffice-adapter` (provee guías raw vía HTTP) — confirmar URL/disponibilidad en Producción antes del impacto.
  * Enternet (emisión DTE 33 vía REST) — confirmar credenciales/endpoint de Producción (distinto de QA).
  * `facturaGdes` (frontend, consumidor de esta API) — confirmar que su build de Producción apunta a la URL correcta de este backend tras el despliegue.

# Cuadro de impacto

- [ ] Verificaciones generales
- [ ] Respaldos
  - [ ] Backup de `gde.factura`, `gde.clientes`, `gde.facturaguias`, `gde.guia` antes de aplicar migraciones
- [ ] sh previo impacto
- [ ] impacto
  - [ ] Detener servicio actual
  - [ ] Aplicar migraciones SQL pendientes (`008`, `009` si corresponde)
  - [ ] Desplegar build nuevo (`pnpm install --frozen-lockfile && pnpm run build`)
  - [ ] Actualizar/verificar variables de entorno (`.env`) del ambiente
- [ ] sh post impacto
- [ ] deploy war
  - [ ] N/A — no aplica (proyecto Node.js, no Java/WAR). Reemplazar por: iniciar servicio (`pnpm run start:prod` o proceso administrado — PM2/systemd/servicio Windows según infraestructura real)
- [ ] sh posterior deploy war
- [ ] configuraciones extras
  - [ ] Confirmar `FACTURACION_RUT_USUARIO` vigente en Enternet Producción
  - [ ] Confirmar `BACKOFFICE_ADAPTER_URL` apunta al backoffice-adapter de Producción

# Plan (paso a paso)

1. Congelar sincronizaciones/emisiones en curso (evitar procesos activos de `sync`/`aprobar` durante el impacto).
2. Respaldar base de datos de Producción (tablas listadas en Cuadro de impacto).
3. Verificar cuáles migraciones SQL (`008`, `009`) ya están aplicadas en Producción; aplicar las que falten en orden correlativo.
4. Detener el servicio `facturador-guias-backend` en el App Server de Producción.
5. Desplegar el nuevo build (`pnpm install --frozen-lockfile`, `pnpm run build`) desde el commit `0cb15d5` de `main`.
6. Verificar/actualizar `.env` de Producción (variables listadas en Recursos).
7. Iniciar el servicio.
8. Ejecutar Prueba de ambientación (ver sección siguiente).
9. Confirmar con el equipo/dev senior que el resultado es el esperado antes de dar por cerrado el impacto.

# Prueba de ambientación

* Levantar el servicio y confirmar `GET` de health/endpoint básico responde 200.
* Ejecutar un `sync` (`POST /empresas/:empkey/sync?rut=...`) contra un `empkey` de prueba y confirmar que trae guías sin error.
* Generar una proforma (`crearManual` o `generar`) y correr `preview-mensaje` para un caso conocido (Caso 1 S.G.) y confirmar que el Mensaje V5 generado tiene el formato esperado (no requiere emitir contra Enternet real en este paso).
* Si el ambiente lo permite (QA/QA Conf), ejecutar una emisión real (`PATCH /aprobar`) de un caso de bajo riesgo y confirmar `folioSii` válido — evitar esto en Producción salvo autorización explícita, dado que genera un DTE real ante el SII.

# RollBack

1. Detener el servicio recién desplegado.
2. Restaurar el build/versión anterior del artefacto (commit previo a `0cb15d5`).
3. Si se aplicaron migraciones (`008`/`009`) y es necesario revertir:
   * `009`: `ALTER TABLE gde.clientes DROP COLUMN modo_detalle;`
   * `008`: revertir requiere evaluar impacto — la columna `rut_emisor` es `NOT NULL`, confirmar que ningún dato productivo depende de ella antes de un `DROP COLUMN gde.factura.rut_emisor;`
4. Restaurar el respaldo de base de datos tomado en el paso de Respaldos si el rollback de columnas no es suficiente (p.ej. si ya se procesaron facturas con el nuevo esquema).
5. Reiniciar el servicio con la versión anterior y confirmar con la Prueba de ambientación que el comportamiento vuelve al estado previo.
6. Notificar al equipo y a Enternet/backoffice-adapter si hubo alguna emisión real fallida durante el impacto.
