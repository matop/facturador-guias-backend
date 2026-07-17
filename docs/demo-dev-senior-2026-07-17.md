# Demo para dev senior — guías-middleware (15-20 min)

Guión de demo en vivo. Formato: comando/acción → qué mirar → qué decir. Pensado para tenerlo abierto en una pantalla mientras la demo corre en otra. `empkey=977` es el tenant QA de referencia (E2E generales); `1163` si se necesita un caso de emisión real.

---

## 1. Apertura — elevator pitch + arquitectura (2 min)

**Qué resuelve el sistema**: puente entre un legado GeneXus/SOAP y facturación electrónica SII (DTE 33), con un motor de reglas configurable para agrupar guías de despacho en proformas antes de emitir.

**Las 4 piezas** (dibujar en pizarra o mostrar):

```
backoffice-adapter (legado SOAP, :3333)
        │  REST
        ▼
guias-middleware (este backend, :3334)
   prefijo /facturador-guias-backend/api
        │  REST
        ▼
Enternet (emisión DTE real)

Parameter-device-js (:3002) ── sidecar de parámetros GeneXus, consultado
                               desde guias-middleware, fuera del flujo caliente
```

**Frase de apertura**: "Nunca hablamos SOAP directo — eso lo abstrae `backoffice-adapter`. Nuestro trabajo es agrupar guías según reglas de negocio configurables por cliente, y emitir facturas electrónicas válidas para el SII."

---

## 2. Flujo de negocio end-to-end (8-10 min) — el corazón de la demo

### 2.1 Sync

```bash
curl -X POST "localhost:3334/facturador-guias-backend/api/empresas/977/sync?periodo=2026-07&rut=92176000-0"
```

> **Ojo con el `rut` de este paso**: NO es "el rut del cliente cuyas guías quiero" — es la credencial contra el webservice SOAP legado (debe tener password configurado en `config/secrets.json` de `backoffice-adapter`; en QA hay 3 disponibles, `92176000-0` es la más cómoda para `empkey=977`). El sync trae **todas** las guías del período visibles con esa credencial y crea/actualiza los clientes reales que aparezcan en la respuesta (verificado en vivo: con `92176000-0` llegaron guías de 3 clientes distintos — `76568660-1`, `96511460-2`, `77304550-K` —, ninguno es el rut usado en la llamada). La respuesta trae `{"synced": N, "clientesCreated": M}`.

Mirar los logs mientras corre. Señalar las **2 fases** (`src/guias/guias.service.ts:53-196`):
- **Fase 1, sin transacción**: fetch de XML en chunks de 5 (`Promise.all`), resolución de clientes.
- **Fase 2, en transacción**: insert de guías + impuestos + cálculo batch de agrupadores. Todo o nada.

> **Decir**: "El fetch de XML es I/O de red lento — deliberadamente lo dejamos fuera de la transacción para no tener filas bloqueadas en `clientes` mientras esperamos al legado."

### 2.2 Motor de reglas en acción

Después del sync, elegí (de los clientes que trajo) uno que haya quedado **sin regla** — `getClientes` o una consulta a `gde.clientes` lo confirman. Ahí el efecto del PUT se ve de verdad:

```bash
curl -X PUT "localhost:3334/facturador-guias-backend/api/empresas/977/clientes/76568660-1/regla" \
  -H "Content-Type: application/json" \
  -d '{"reglaIdl": "por_comuna", "recomputar": true, "periodo": "2026-07"}'

curl "localhost:3334/facturador-guias-backend/api/empresas/977/guias/agrupadas?periodo=2026-07&rut=76568660-1"
```

> **Importante, confirmado en vivo**: sin `"recomputar": true` (+ `"periodo"`) en el body, el PUT solo actualiza `clientes.reglaidl` para el **próximo** sync — las guías ya insertadas quedan con `guireglaidl`/`guivaloragrupador` en `NULL` y `guias/agrupadas` devuelve `[]`. Con `recomputar: true` sí dispara `_recomputarGuiasClientePorPeriodo` y agrupa las guías existentes al toque — así se vio en la demo real. Acá el `rut` del path SÍ es el rut del cliente (a diferencia del paso 2.1).

Mostrar `sql/seeds/reglas.sql` (reglas `por_comuna`, `por_razon_social`, `por_ciudad`, `por_direccion`) y el discriminated union:

```ts
// src/reglas/parsers/regla-config.types.ts:4-6
type ReglaConfig =
  | { fn: 'extraeTagLista'; reglaTags: string[] }
  | { fn: 'extraeReferenciaPorTipo'; tiposReferencia: TipoReferenciaExterna[] };
```

> **Decir**: "El campo `fn` hace doble trabajo: discrimina el tipo en TypeScript y es literalmente la key de dispatch en `REGLA_REGISTRY` (`regla-registry.ts:7-18`) — no hay switch, no hay if/else, se agrega una regla nueva agregando una entrada al registry."

### 2.3 Generación de proforma

```bash
curl -X POST "localhost:3334/facturador-guias-backend/api/empresas/977/facturas/proforma/generar?periodo=2026-07&rut=76407930-2"
```

> **Otro `rut` con significado distinto**: acá es `rutEmisor` — el RUT que se grava en el DTE como emisor —, no un filtro de cliente. `generar` toma **todas** las guías del período con `guireglaidl` ya asignado (sin importar el cliente) y crea una proforma por cada combinación `(gclirut, guireglaidl, guivaloragrupador)`; confirmado en vivo con 3 clientes agrupados de una sola llamada → `{"created": 3, "skipped": 0}`. El valor de `rutEmisor` no bloquea la generación — importa recién al aprobar/emitir (ver 2.5).

Señalar `agruparPorValorAgrupador` — **1 proforma por combinación** `(gclirut, guireglaidl, guivaloragrupador)`: cada OC/HES/comuna distinta cae en su propia proforma. Y el **chunking**: si un grupo excede `maximoGuias` (parámetro resuelto vía el sidecar, default 40), se parte en varias proformas.

El `gfackey` de cada proforma creada no viene en la respuesta de `generar` — sacarlo de `gde.factura` (`estado='BORRADOR'`, ordenado por `gfackey desc`) para los pasos siguientes.

### 2.4 Preview del mensaje sin comprometerse

```bash
curl "localhost:3334/facturador-guias-backend/api/empresas/977/facturas/proforma/<gfackey>/preview-mensaje"
```

Mostrar el Mensaje V5 pipe-delimited crudo, sin haber emitido nada todavía. Confirmado en vivo — la respuesta trae el bloque `RUT CLIENTE` / `DIRECCION` / `COMUNA` real del cliente y el detalle de `Referencias` con folio y fecha de cada guía agrupada.

> **Anécdota**: "`MAX_REFERENCIAS_INDIVIDUALES=40` decide si el bloque de Referencias va en modo Global o individual — y hay un bug de `FchRef` con Enternet que corregimos el 2026-07-08. Buen ejemplo de debugging contra un proveedor externo con un formato pipe propietario."

### 2.5 Aprobar + emitir

```bash
curl -X PATCH "localhost:3334/facturador-guias-backend/api/empresas/977/facturas/proforma/<gfackey>/aprobar"
```

`aprobar()` (`facturas.service.ts:499-530`) hace la transición de estado **y** la emisión en el mismo llamado: si `_emitir()` falla, la proforma cae a `FALLIDA` y el error se re-lanza (el caller HTTP ve el 4xx/5xx real).

> **En QA, `empkey=977` no está habilitado para emitir de verdad** — solo `1163` tiene el dispositivo configurado en Enternet (ver la nota de la cabecera del doc). Corrido en vivo contra `977`, `aprobar` devuelve un 422 real: `{"message":"[InitAPIPWRUTErr001] Empresa [<rutEmisor>] no esta configurada para operar en este dispositivo",...}` y la proforma efectivamente queda en `FALLIDA` — es la demo perfecta del contrato "cae a FALLIDA y re-lanza" sin necesitar nada sintético. Para mostrar una emisión 100% exitosa hay que repetir 2.1-2.5 completo con `empkey=1163`.

### 2.6 Retry batch (con la `FALLIDA` que quedó del paso 2.5)

```bash
curl -X POST "localhost:3334/facturador-guias-backend/api/empresas/977/facturas/emision"
```

Reintenta todas las `FALLIDA` de la empresa, una por una, sin abortar en el primer error. Confirmado en vivo: `{"emitidas":0,"fallidas":2,"detalle":[{"gfackey":"181","error":"...no esta configurada..."},{"gfackey":"1","error":"...No se pudo obtener la definición de la empresa"}]}` — dos `FALLIDA` distintas, dos errores distintos, el batch sigue hasta el final igual.

---

## 3. Calidad de ingeniería (3-4 min)

**RUT branded types** (`src/utils/rut.ts:8-20`):

```ts
type CsvRut = string & { readonly _brand: 'CsvRut' };
type XmlRut = string & { readonly _brand: 'XmlRut' };
```

> **Decir**: "Sin el brand, un RUT crudo del CSV del legado y uno ya normalizado para XML son el mismo `string` para el compilador. Con el brand, es imposible escribir un RUT sin normalizar al XML del DTE sin que TypeScript se queje."

**Issue #48 en vivo** — doble facturación real:
- Bug: `generar()`/`crearManual()` en `facturas.service.ts` no excluían guías en estado `EMITIDA` de la subquery de "guías disponibles" — una proforma ya emitida liberaba sus guías para volver a facturarse.
- Fix: commit `2dd185e`, 4 sitios corregidos (líneas ~295, ~320, ~392, ~416).
- 4 tests de regresión (`facturas.service.spec.ts:930-1049`) que verifican el SQL/params literales — patrón de "test de regresión por contrato SQL".
- El commit trae coautoría `Co-authored-by: Claude Sonnet 5` — gancho para hablar de flujo agente+humano en bugfixing real sobre un incidente productivo.

```bash
pnpm test
```

290/290 tests, 0 skips, ~4s. Señalar los warnings esperados de `ParametrosService` (sidecar no disponible → fallback a default 40, nunca lanza) — se ve el "nunca lanza" funcionando en vivo, sin el sidecar corriendo.

**CI**: `pnpm/action-setup@v6` pineado a versión exacta `11.10.0` — un rango `11` dejaba que la action se auto-actualizara a una versión que rompía su propio instalador, tumbando CI en todas las branches sin cambiar una línea del repo.

---

## 4. Trabajo reciente / cierre (2 min)

- **ADR-0003** (`docs/adr/0003-motor-parametros-interno-mas-fachada-dedicada.md`): motor de parámetros interno + fachada tipada por parámetro (ej. `getMaximoGuias(empkey)`), en respuesta directa a comparar con el patrón GeneXus viejo (`Utiles.Parametros.Get.*`, 15+ objetos KB duplicando lectura de XML). Buen gancho si el dev senior tiene background GeneXus.
- **Prefijo global de rutas** (`/facturador-guias-backend/api`, `src/main.ts:9`): para convivir con otros backends detrás del mismo gateway/dominio.
- **Estado transparente**: 290 tests verdes, plan de parámetros GeneXus cerrado (4 fases, PR #22/#53), plan de verificación E2E con la sesión 5 pendiente (solo cierre/consolidación) — mostrar qué queda sin barrer nada bajo la alfombra.

---

## Checklist antes de la demo real

Guión corrido de punta a punta el 2026-07-17 contra los 3 servicios reales (`guias-middleware:3334`, `backoffice-adapter:3333`, `Parameter-device-js:3002`), `empkey=977`. Todo lo marcado abajo fue confirmado en esa corrida, no solo leído del código.

- [x] Los 3 servicios están arriba y responden — confirmado con un check de puerto simple antes de arrancar.
- [x] Sync real funciona con `rut=92176000-0` como credencial (password configurado en `config/secrets.json` de `backoffice-adapter`) — trajo 9 guías, creó 1 cliente nuevo.
- [x] Asignar regla + `guias/agrupadas` funciona, **pero solo si se manda `recomputar: true` + `periodo`** en el PUT — sin eso, `agrupadas` da `[]` aunque el sync haya sido exitoso. Esto no se veía en el código estático; salió al correrlo.
- [x] `generar` funciona y confirma el 1-proforma-por-`(gclirut, guireglaidl, guivaloragrupador)` con datos reales (3 proformas de una corrida).
- [x] `preview-mensaje` devuelve el Mensaje V5 real y legible, sin haber emitido nada.
- [x] `aprobar` sobre `empkey=977` da 422 real (`InitAPIPWRUTErr001`, dispositivo no configurado) y la proforma cae a `FALLIDA` — esperado, no es un bug: solo `empkey=1163` emite de verdad en QA. Usar esto a favor: es la demo en vivo del contrato de fallo, sin nada sintético.
- [x] Retry batch (2.6) reintenta la `FALLIDA` real que dejó el paso anterior — no hace falta fabricar una.
- [x] `pnpm test` → 290/290, 19 suites, ~4s, con los warnings esperados de `ParametrosService` (404 / `ECONNREFUSED` / valor no numérico → fallback a 40, nunca lanza).
- [ ] Si se quiere mostrar una emisión 100% exitosa (no solo el contrato de fallo), repetir 2.1-2.5 con `empkey=1163` antes de la demo — no se ejecutó esta corrida porque no era necesaria para validar el guión.
