# PRD — Emisión de Factura Electrónica (DTE Tipo 33)

## Problem Statement

El operador necesita enviar Facturas Proforma aprobadas al sistema de emisión de Enternet para generar el DTE tipo 33 oficial. Actualmente el paso `APROBADA → EMITIDA` es un stub. Sin esta funcionalidad no existe cierre del ciclo tributario: las guías de despacho agrupadas nunca se liquidan ante el SII.

---

## Solution

Implementar la lógica de emisión que, al aprobar una Factura Proforma, construye el `Mensaje` en formato Enternet V5 y lo envía vía `backoffice-adapter` a la API REST de Enternet. El sistema persiste el folio SII oficial y los links al PDF/XML retornados. Las emisiones fallidas quedan en estado `FALLIDA` para reintento manual.

**Nota:** Esta decisión actualiza el ADR 0002 — el mecanismo de integración con Enternet es una API REST JSON (no SOAP). El razonamiento del ADR se mantiene válido.

---

## User Stories

1. Como operador, quiero que al aprobar una proforma se dispare la emisión automáticamente, para no tener que realizar un paso adicional.
2. Como operador, quiero ver el estado `EMITIDA` en la proforma tras una emisión exitosa, para confirmar que el DTE fue generado.
3. Como operador, quiero ver el folio SII oficial asignado por Enternet en la proforma emitida, para tener trazabilidad tributaria.
4. Como operador, quiero acceder al link de visualización (PDF) de la factura emitida directamente desde el listado, para poder descargarlo o enviarlo al cliente.
5. Como operador, quiero acceder al link del XML del DTE emitido, para adjuntarlo a sistemas contables externos.
6. Como operador, quiero que una proforma con error de red quede en estado `FALLIDA`, para poder reintentarla sin perder la información.
7. Como operador, quiero que una proforma rechazada por el SII quede en estado `RECHAZADA`, para saber que requiere corrección antes de reintentar.
8. Como operador, quiero poder seleccionar múltiples proformas `FALLIDA` y reintentarlas en batch, para recuperar emisiones fallidas eficientemente.
9. Como operador, quiero que la factura con menos de 20 guías muestre cada guía como una línea de detalle, para que el cliente pueda identificar exactamente qué guías se están cobrando.
10. Como operador, quiero que la factura con 20 o más guías muestre un ladrillo de referencias en la glosa, para mantener trazabilidad sin exceder los límites del formato.
11. Como operador, quiero que cada línea de detalle de Modo 1 muestre el número de guía, para identificar fácilmente qué guía referencia cada línea.
12. Como operador, quiero que el ladrillo de Modo 2 incluya encabezado y una línea por guía con folio, fecha y monto, para facilitar la lectura del documento al receptor.
13. Como operador, quiero que las referencias a guías en el DTE usen el tipo de documento correcto (Guía de Despacho Electrónica), para que la guía quede liquidada correctamente en los sistemas del SII.
14. Como operador, quiero que el folio interno (`gfacfolio`) se mantenga como identificador de trazabilidad interna, independiente del folio SII oficial asignado por Enternet.
15. Como operador, quiero que la fecha de vencimiento de la factura se calcule según los días de crédito configurados en la regla, para reflejar los plazos pactados con cada cliente.
16. Como sistema, quiero que el `TransaccionIdL` enviado a Enternet sea determinista por proforma, para que reintentos no generen facturas duplicadas.
17. Como sistema, quiero que errores de red/timeout resulten en estado `FALLIDA` (reintentable), y errores de validación SII resulten en `RECHAZADA` (requiere corrección), para guiar correctamente al operador.

---

## Implementation Decisions

### Modos de construcción del `Mensaje`

El criterio de selección de modo es exclusivo por número de guías de la proforma:

| Condición | Modo |
|---|---|
| guías < 20 | **Modo 1** — una línea de detalle por guía |
| guías ≥ 20 | **Modo 2** — una línea de detalle con el total + ladrillo en `GLOSA` |

---

### Modo 1 — Detalle por guía (< 20 guías)

- **Líneas de detalle (`3:|`):** una por guía.
  - `DESCRIPCION = "Guía de Despacho N° {guifolio}"`
  - `TIPO ITEM = AFECTO`
  - `CANTIDAD = 1`
  - `PRECIO = monto neto de la guía`
- **Referencias (`4:|` / `5:|`):** una por guía.
  - `TIPO DE REFERENCIA = "Guia de Despacho Electronica"` (código `52`)
  - `FOLIO = guifolio`
  - `FECHA = guifechaemision` (formato `dd/MM/yyyy`)
  - `RAZON REFERENCIA` vacío

---

### Modo 2 — Ladrillo en GLOSA (≥ 20 guías)

- **Línea de detalle (`3:|`):** una sola, con el total neto del período.
  - `DESCRIPCION = "Facturación período {YYYY-MM}"`
  - `TIPO ITEM = AFECTO`
  - `CANTIDAD = 1`
  - `PRECIO = suma de montos netos de todas las guías`
- **Sin referencias** (`4:|` / `5:|`): no se incluyen.
- **`GLOSA` (encabezado):** ladrillo con header + una línea por guía:
  ```
  TIPO DOC  FOLIO   FECHA        MONTO
  GD        64261   06-04-2026   $1.250.000
  GD        64262   07-04-2026   $890.000
  ...
  ```
  Saltos de línea representados con `\n` (límite: ALFA 1000). Casos con > 27 guías aproximadas que desborden el campo quedan fuera del scope de este PRD.

---

### Campos del encabezado del `Mensaje`

| Campo | Valor |
|---|---|
| `TIPO DOCUMENTO` | `FACTURA ELECTRONICA` |
| `FOLIO TRIBUTARIO DOCUMENTO` | `0` (Enternet asigna el folio oficial) |
| `FORMA DE PAGO DESCRIPCION` | `Crédito` (hardcodeado) |
| `FECHA DE VENCIMIENTO` | fecha emisión + `dias_credito` de la `Regla` (default: 30) |
| `RUT EMISOR` | `empkey` en formato con guión |
| `RUT CLIENTE` | `gclirut` de la proforma |
| `MONTO NETO` | suma de `guitotneto` de las guías |
| `IMPUESTO IVA` | suma de `guitotiva` |
| `MONTO EXENTO` | suma de `guitotexento` |
| `MONTO TOTAL` | suma de `guitotdoc` |

---

### Contrato del request a la API de Enternet

```
POST https://emi.sb.enternet.cl/EmisorV2503/WS/Emision/APIEmision/dtes
Header: apiKey: <generado vía strControl>
Body: {
  RutEmisor, RutUsuario, TransaccionIdL, Formato: "V5", Mensaje, Modo: "MODOIMPRESION;PDF"
}
```

- `TransaccionIdL = "{empkey}-{gfackey}"` — determinista, permite idempotencia en reintentos.
- `RutUsuario` — RUT de usuario de servicio configurado en `secrets.json` por empresa.
- `apiKey` — generado dinámicamente con `buildControlStringEmitirDTE(campos...) → strControl → getAuthToken(strControl)`. Patrón análogo al token SOAP existente.

---

### Respuesta de la API y persistencia

Del `ResultadoDTE`:

| Campo respuesta | Campo en `Factura` |
|---|---|
| `FolioDocumento` | `gfacfolio_sii` (nuevo) |
| `LinkVisualizacion` | `gfaclink_pdf` (nuevo) |
| `LinkXML` | `gfaclink_xml` (nuevo) |

---

### Cambios de esquema — entidad `Factura`

Nuevas columnas en `gde.factura`:

- `gfacfolio_sii` — `VARCHAR`, nullable. Folio oficial SII asignado por Enternet.
- `gfaclink_pdf` — `VARCHAR`, nullable. Link al PDF de visualización.
- `gfaclink_xml` — `VARCHAR`, nullable. Link al XML del DTE.

---

### Cambio de esquema — entidad `Regla`

Nueva columna:

- `dias_credito` — `INTEGER`, default `30`. Días para calcular `FECHA DE VENCIMIENTO`.

---

### Estados de error en la transición `APROBADA → EMITIDA`

| Condición | Estado resultante | ¿Reintentable? |
|---|---|---|
| HTTP 5xx / timeout | `FALLIDA` | Sí — batch manual |
| HTTP 4xx / `EstadoEmision = RECHAZADO` | `RECHAZADA` | No — requiere corrección |

---

### Trigger de emisión

1. **Flujo feliz:** `PATCH /empresas/:empkey/facturas/:gfackey/aprobar` llama a `emitir()` al completar la aprobación. Si la emisión falla, la proforma queda en `APROBADA` y se registra el error como `FALLIDA`.
2. **Reintento batch:** `POST /empresas/:empkey/facturas/emitir` recibe un array de `gfackey` en estado `FALLIDA` y los procesa secuencialmente.

---

### Módulos a construir / modificar

1. **`MensajeBuilder`** (`guias-middleware`) — módulo puro que recibe una `Factura` con sus `Guia[]` y retorna el string `Mensaje` V5. Encapsula la lógica Modo 1 / Modo 2. Interfaz simple, fácilmente testeable en aislamiento.

2. **`EmisionClient`** (`backoffice-adapter`) — cliente HTTP para la API REST de Enternet. Recibe el payload completo, genera el `apiKey` vía `strControl`, hace el POST, mapea la respuesta. Análogo al `SoapClient` existente.

3. **`EmisionService`** (`guias-middleware`) — orquesta: carga la proforma + guías → `MensajeBuilder` → llama a `backoffice-adapter` via HTTP → persiste `gfacfolio_sii`, `gfaclink_pdf`, `gfaclink_xml` → actualiza `estado`.

4. **`FacturasController`** (`guias-middleware`) — nuevos endpoints: `aprobar` (ya existe como stub), `POST /emitir` (batch reintento).

---

### Pendientes (escalar a dev senior)

- **Datos del cliente** para el `Mensaje` (`NOMBRE CLIENTE`, `DIRECCION`, `COMUNA`, `CIUDAD`, `GIRO`): candidato es parsear el XML de la guía (`guifilepath`) y extraer el tag `<Receptor>`. La entidad `clientes` no tiene estos campos hoy.
- **Detalles del `strControl`** para generación del `apiKey` de emisión — función `buildControlStringEmitirDTE` y `getAuthToken` pendiente de documentación.

---

## Testing Decisions

### Qué constituye un buen test

Testear el comportamiento observable, no los detalles de implementación. Para `MensajeBuilder`: dado un set de guías, verificar el string `Mensaje` resultante (secciones, líneas, campos clave). Para `EmisionService`: verificar las transiciones de estado y los campos persistidos, mockeando el cliente HTTP.

### Módulos con tests

- **`MensajeBuilder`** — unit tests exhaustivos:
  - Modo 1 con 1, 10 y 19 guías: verificar líneas `3:|`, `4:|`, `5:|` generadas correctamente.
  - Modo 2 con 20, 25 y 30 guías: verificar que no hay `4:|5:|`, que `GLOSA` contiene header + líneas.
  - Caso borde: exactamente 19 guías → Modo 1; exactamente 20 guías → Modo 2.
  - Cálculo de `FECHA DE VENCIMIENTO` con `dias_credito` distintos.
  - Formateo de montos y fechas.

- **`EmisionService`** — unit tests:
  - Emisión exitosa: `APROBADA → EMITIDA`, campos `gfacfolio_sii`, `gfaclink_pdf`, `gfaclink_xml` persistidos.
  - HTTP 5xx → estado `FALLIDA`.
  - HTTP 4xx / EstadoEmision rechazado → estado `RECHAZADA`.
  - Reintento batch: solo procesa proformas en `FALLIDA`.

### Prior art

Tests existentes en `guias-middleware` bajo `src/facturas/*.spec.ts` y `src/guias/*.spec.ts` siguen el patrón de mockear repositorios TypeORM e inyectar dependencias vía NestJS testing module. `MensajeBuilder` se puede testear como clase pura sin NestJS.

---

## Out of Scope

- Envío de facturas de exportación u otros tipos de DTE.
- Manejo de `GLOSA` cuando supera 1000 caracteres (> ~27 guías en Modo 2).
- Descarga del PDF/XML en el frontend (solo se expone el link).
- Gestión de CAF (folios SII) — Enternet los administra.
- Anulación de facturas emitidas (`EMITIDA → ANULADA` en el SII).
- Intercambio electrónico (`EstadoIntercambio`) — Enternet lo gestiona.
- Notificaciones por email al cliente al emitir.

---

## Further Notes

- El ADR 0002 indicaba integración SOAP; la realidad es que Enternet expone una API **REST JSON** con formato de `Mensaje` pipe-delimited V5. El razonamiento del ADR (delegar al backoffice legado) se mantiene válido.
- URL QA: `https://emi.sb.enternet.cl/EmisorV2503/WS/Emision/APIEmision/dtes`. URL productiva TBD.
- Los folios internos (`gfacfolio`) mantienen su rol de secuencia interna por tenant para ordenamiento y trazabilidad. El folio SII oficial vive en `gfacfolio_sii`.
- RUTs QA disponibles: `764079302`, `968880004`, `921760000`.
