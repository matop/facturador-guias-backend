# Casos de uso y diagramas de secuencia — guías-middleware

Complemento al guion de demo en vivo (`docs/demo-dev-senior-2026-07-17.md`). Mismos 6 flujos, en formato de casos de uso + diagrama de secuencia, para quien necesita la vista conceptual sin correr curl en vivo.

**Actores**:
- **Operador**: persona/proceso que dispara las llamadas HTTP (equivalente al usuario de negocio o a un job automatizado).
- **guias-middleware**: este backend (`:3334`).
- **backoffice-adapter**: adaptador legado SOAP/GeneXus (`:3333`).
- **Parameter-device-js**: sidecar de parámetros GeneXus (`:3002`).
- **Enternet**: servicio externo de emisión DTE real.
- **BD (`gde.*`)**: PostgreSQL, schema `gde`.

---

## CU-1 — Sincronizar guías del período desde el legado

**Actor principal**: Operador.
**Precondición**: credencial (`rut`) con password configurado en `backoffice-adapter` para el `empkey` del tenant.
**Objetivo**: traer al middleware las guías de despacho visibles con esa credencial para un período dado, y dar de alta los clientes reales que aparezcan.
**Resultado**: guías insertadas en `gde.guia` (+ impuestos), clientes creados/actualizados en `gde.clientes`. Respuesta `{"synced": N, "clientesCreated": M}`.

**Flujo principal**:
1. Operador dispara el sync para un `empkey` + `periodo` + `rut` (credencial SOAP).
2. Fase 1 (sin transacción): el middleware pide al legado los XML de guías en chunks de 5 en paralelo, y resuelve/crea los clientes que aparecen en las guías.
3. Fase 2 (en transacción): inserta guías + impuestos, calcula agrupadores en batch. Todo o nada.
4. Devuelve el conteo de guías sincronizadas y clientes creados.

**Nota de diseño**: el fetch de XML (I/O de red lento) queda deliberadamente fuera de la transacción para no bloquear filas de `clientes` mientras se espera al legado.

```mermaid
sequenceDiagram
    actor Operador
    participant MW as guias-middleware
    participant BOA as backoffice-adapter
    participant DB as BD (gde.*)

    Operador->>MW: POST /empresas/{empkey}/sync?periodo&rut
    Note over MW: Fase 1 — sin transacción
    loop chunks de 5 guías (Promise.all)
        MW->>BOA: fetch XML de guías (SOAP)
        BOA-->>MW: XML guías
    end
    MW->>DB: resolver/crear clientes reales
    Note over MW: Fase 2 — en transacción (todo o nada)
    MW->>DB: BEGIN
    MW->>DB: insert guías + impuestos
    MW->>DB: calcular agrupadores (batch)
    MW->>DB: COMMIT
    MW-->>Operador: 200 {synced: N, clientesCreated: M}
```

---

## CU-2 — Asignar regla de agrupación a un cliente

**Actor principal**: Operador.
**Precondición**: cliente existente (creado por CU-1), sin regla o con regla a cambiar.
**Objetivo**: asociar una regla de agrupación (`por_comuna`, `por_razon_social`, `por_ciudad`, `por_direccion`, ...) a un cliente, y opcionalmente recalcular de inmediato las guías ya sincronizadas.
**Resultado**: `clientes.reglaidl` actualizado; si se pide `recomputar`, además `guias.guireglaidl` / `guivaloragrupador` quedan calculados para el período indicado.

**Flujo principal (con recompute)**:
1. Operador hace `PUT` de la regla para un cliente, con `reglaIdl`, `recomputar: true` y `periodo`.
2. El middleware actualiza `clientes.reglaidl`.
3. Como `recomputar` es `true`, dispara `_recomputarGuiasClientePorPeriodo`: recorre las guías del cliente en ese período y aplica la función de la regla (vía `REGLA_REGISTRY`, dispatch por el campo `fn`) para asignar `guireglaidl` / `guivaloragrupador`.
4. Guías quedan agrupables de inmediato (`GET guias/agrupadas` ya no da `[]`).

**Flujo alternativo (sin recompute)**: si no se manda `recomputar: true` + `periodo`, el `PUT` solo deja la regla guardada para el **próximo** sync — las guías ya insertadas quedan sin agrupador hasta que corra un sync nuevo.

```mermaid
sequenceDiagram
    actor Operador
    participant MW as guias-middleware
    participant DB as BD (gde.*)

    Operador->>MW: PUT /empresas/{empkey}/clientes/{rut}/regla<br/>{reglaIdl, recomputar: true, periodo}
    MW->>DB: UPDATE clientes.reglaidl
    alt recomputar = true
        MW->>DB: SELECT guías del cliente en el período
        loop cada guía
            MW->>MW: aplicar función de la regla (REGLA_REGISTRY[fn])
        end
        MW->>DB: UPDATE guias.guireglaidl / guivaloragrupador
        MW-->>Operador: 200 (guías agrupadas de inmediato)
    else recomputar = false / ausente
        MW-->>Operador: 200 (regla guardada, efecto solo en próximo sync)
    end
```

---

## CU-3 — Generar proformas agrupadas por reglas

**Actor principal**: Operador.
**Precondición**: existen guías con `guireglaidl` ya asignado (CU-2) en el período.
**Objetivo**: agrupar todas las guías disponibles del período en proformas, una por cada combinación `(gclirut, guireglaidl, guivaloragrupador)`.
**Resultado**: N proformas en estado `BORRADOR` en `gde.factura`. Respuesta `{"created": N, "skipped": M}`.

**Flujo principal**:
1. Operador dispara la generación para un `empkey` + `periodo` (no filtra clientes).
2. El middleware toma todas las guías del período con `guireglaidl` asignado, sin importar el cliente, **excluyendo las que ya estén atadas a una proforma en `BORRADOR`/`APROBADA`/`EMITIDA`** (guardrail anti-doble-facturación, fix del Issue #48).
3. Agrupa por `(gclirut, guireglaidl, guivaloragrupador)`: cada combinación distinta (OC/HES/comuna, etc.) es una proforma propia.
4. Si un grupo excede `maximoGuias` (parámetro resuelto vía Parameter-device-js, default 40), lo particiona en varias proformas (cada partición es su propia unidad de emisor, ver punto 5).
5. Por cada partición, el `rutEmisor` se deriva del propio XML de las guías (`<Encabezado><Emisor><RUTEmisor>` en `guifilepath`) — **no** es un input del operador, porque no es fijo por empresa/cliente. Si las guías de una misma partición tienen `RUTEmisor` distinto entre sí (o alguna no lo trae), se aborta esa partición con `422` en vez de adivinar.
6. Inserta las proformas en `BORRADOR`.

```mermaid
sequenceDiagram
    actor Operador
    participant MW as guias-middleware
    participant PDJ as Parameter-device-js
    participant XML as XML guía (guifilepath)
    participant DB as BD (gde.*)

    Operador->>MW: POST /empresas/{empkey}/facturas/proforma/generar?periodo
    MW->>DB: SELECT guías con guireglaidl asignado (período)
    Note over MW,DB: excluye guías ya en proforma BORRADOR/APROBADA/EMITIDA<br/>(fix doble facturación, Issue #48)
    MW->>PDJ: getMaximoGuias(empkey)
    PDJ-->>MW: maximoGuias (o default 40 si no responde)
    MW->>MW: agrupar por (gclirut, guireglaidl, guivaloragrupador)
    loop cada grupo
        alt grupo > maximoGuias
            MW->>MW: particionar en varias proformas
        end
        MW->>XML: fetchDocument(guifilepath) por cada guía de la partición
        XML-->>MW: RUTEmisor
        alt RUTEmisor inconsistente o ausente
            MW-->>Operador: 422 (no se pudo determinar el emisor)
        else RUTEmisor único
            MW->>DB: INSERT factura (estado BORRADOR, rut_emisor derivado)
        end
    end
    MW-->>Operador: 200 {created: N, skipped: M}
```

---

## CU-4 — Previsualizar el Mensaje V5 sin comprometerse

**Actor principal**: Operador.
**Precondición**: proforma en `BORRADOR` (`gfackey` obtenido de CU-3, vía consulta a `gde.factura`).
**Objetivo**: ver el Mensaje V5 (formato pipe-delimited) que se enviaría a Enternet, sin emitir nada todavía.
**Resultado**: texto del mensaje devuelto en la respuesta; ningún estado cambia.

```mermaid
sequenceDiagram
    actor Operador
    participant MW as guias-middleware
    participant DB as BD (gde.*)

    Operador->>MW: GET /empresas/{empkey}/facturas/proforma/{gfackey}/preview-mensaje
    MW->>DB: SELECT proforma + guías agrupadas + cliente
    MW->>MW: construir Mensaje V5 (pipe-delimited)<br/>bloque Referencias: Global si > MAX_REFERENCIAS_INDIVIDUALES (40), individual si no
    MW-->>Operador: 200 texto Mensaje V5 (sin persistir cambio de estado)
```

---

## CU-5 — Aprobar y emitir una proforma

**Actor principal**: Operador.
**Precondición**: proforma en `BORRADOR`.
**Objetivo**: aprobar la proforma y emitirla contra Enternet en el mismo llamado.
**Resultado (camino feliz)**: proforma pasa a `EMITIDA`.
**Resultado (camino de fallo)**: si `_emitir()` falla (ej. empresa no configurada para operar en el dispositivo), la proforma cae a `FALLIDA` y el error se re-lanza como 4xx/5xx real al caller HTTP.

```mermaid
sequenceDiagram
    actor Operador
    participant MW as guias-middleware
    participant ENT as Enternet
    participant DB as BD (gde.*)

    Operador->>MW: PATCH /empresas/{empkey}/facturas/proforma/{gfackey}/aprobar
    MW->>DB: UPDATE factura SET estado = 'APROBADA' (transición)
    MW->>ENT: emitir DTE (Mensaje V5)
    alt emisión exitosa
        ENT-->>MW: DTE emitido OK
        MW->>DB: UPDATE factura SET estado = 'EMITIDA'
        MW-->>Operador: 200 (emitida)
    else emisión falla (ej. dispositivo no configurado)
        ENT-->>MW: error (ej. InitAPIPWRUTErr001)
        MW->>DB: UPDATE factura SET estado = 'FALLIDA'
        MW-->>Operador: 4xx/5xx (error real re-lanzado)
    end
```

---

## CU-6 — Reintentar emisión de proformas fallidas en batch

**Actor principal**: Operador.
**Precondición**: existen proformas en estado `FALLIDA` para el `empkey` (dejadas por CU-5).
**Objetivo**: reintentar la emisión de todas las `FALLIDA` de la empresa, sin abortar en el primer error.
**Resultado**: cada proforma pasa a `EMITIDA` o se mantiene/actualiza como `FALLIDA` con su error puntual. Respuesta con detalle por proforma.

```mermaid
sequenceDiagram
    actor Operador
    participant MW as guias-middleware
    participant ENT as Enternet
    participant DB as BD (gde.*)

    Operador->>MW: POST /empresas/{empkey}/facturas/emision
    MW->>DB: SELECT facturas WHERE estado = 'FALLIDA'
    loop cada proforma FALLIDA (continúa aunque una falle)
        MW->>ENT: reintentar emisión
        alt éxito
            ENT-->>MW: DTE emitido OK
            MW->>DB: UPDATE estado = 'EMITIDA'
        else falla de nuevo
            ENT-->>MW: error puntual
            MW->>DB: mantener/actualizar 'FALLIDA' + detalle de error
        end
    end
    MW-->>Operador: 200 {emitidas: X, fallidas: Y, detalle: [...]}
```

---

## Nota de origen

Estos casos de uso y diagramas son una re-expresión conceptual de los flujos ya probados en vivo el 2026-07-17 (ver checklist en `docs/demo-dev-senior-2026-07-17.md`). No agregan comportamiento nuevo — documentan el mismo contrato observado en esa corrida real.
