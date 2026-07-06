# CONTEXT — guias-middleware

## Fuentes oficiales
- **Enternet V5** (formato pipe del Mensaje): `docs/FormatodeIntegracinbasadoenEtiquetasEstndarv5.html` — consultar ante cualquier duda de campo/formato, no asumir.
- **SII** (normas GDE/LGDE): usar skill `consult-sii-norms`.

## Glosario

### Tenant / Empresa
La empresa que usa la app (guías-middleware). Es el **Emisor** de las guías de despacho.
En el XML SII corresponde al nodo `<Emisor>`.
Identificada por `empkey` en todas las tablas.
`emprutemi` = `<RUTEmisor>` (ej: ACEROS AZA S.A = 92176000-0, empkey=977).
Se crea automáticamente durante el sync si no existe, leyendo `<Emisor>` del XML.
Se almacena en `gde.empresa` (PK: `empkey`).

### Cliente
La empresa que **recibe** las guías emitidas por el Tenant.
En el XML SII corresponde al nodo `<Receptor>`.
`gclirut` = `<RUTRecep>` sin guión, `gclinom` = `<RznSocRecep>`.
Se crea automáticamente durante el sync si no existe, leyendo `<Receptor>` del XML.
Se almacena en `gde.clientes` (PK compuesta: `empkey` + `gclirut`).
Un mismo RUT receptor puede existir para distintos tenants — son filas separadas.

### Guía
Documento tributario electrónico tipo 52 emitido por el Tenant hacia un Cliente.
Se almacena en `gde.guia` (PK compuesta: `empkey` + `guitipo` + `guifolio`).
El XML completo del documento es accesible vía `guifilepath` (campo `"Link XML"` del CSV).

### Sync
Proceso que consulta `backoffice-adapter` (`GET /reportes`), parsea el CSV resultante
y persiste los datos en `gde.guia`. Como efecto secundario:
- Si el Tenant (`gde.empresa`) no existe → lo crea leyendo `<Emisor>` del XML de cualquier guía del batch.
- Por cada guía: si el Cliente (`gde.clientes`) no existe → lo crea leyendo `<Receptor>` del XML de esa guía.
Solo descarga el XML cuando es necesario (lazy — minimiza requests al backoffice).

### empkey
Clave de tenant. Presente en todas las tablas de `gde`. Siempre requerida como filtro.
No viene del CSV — la provee el caller del sync.

### Período
Mes calendario (año + mes) usado como filtro principal en todas las consultas del frontend.
Formato: `YYYY-MM`. El frontend siempre opera en contexto de un período.
- **Período activo**: el mes en curso.
- **Período anterior**: el mes calendario inmediatamente anterior al activo.

### Guías con Entrega Pendiente
Guías cuya `guifechaemision` cae en el **período anterior** al activo.
Por ley SII, las guías solo pueden facturarse dentro del mes de emisión o hasta 10 días hábiles después del cierre del mes. Las guías del período anterior representan entregas que el Tenant aún puede — y debe — sanar.
No es un estado almacenado en BD; se deriva comparando `guifechaemision` con el período activo.

### Factura Proforma
Documento interno que consolida un grupo de Guías bajo una Regla, pendiente de aprobación del operador.
Se almacena en `gde.factura` (PK compuesta: `empkey` + `gfackey`).
`gfackey` = identificador local generado por secuencia PostgreSQL (`GENERATED ALWAYS AS IDENTITY`). Lo genera la BD en el INSERT; la app lo lee post-insert. No es el folio SII.
`gfacfolio` = identificador local (no es el folio oficial del DTE).
Campo `estado` con ciclo de vida: `BORRADOR` → `APROBADA` → `EMITIDA`. También puede ser `ANULADA` (cancelada antes de emitirse).
Cuando el operador aprueba, este sistema envía los datos de la proforma + sus Guías referenciadas al backoffice legado para que emita el DTE tipo 33. El scope de este sistema termina en ese envío — la emisión real al SII la maneja el backoffice.
Dos flujos de creación: **manual** (el operador revisa y aprueba grupo por grupo) y **automatizado** (`POST /empresas/:empkey/facturas/generar` — genera todas las proformas del período en estado `BORRADOR`; la aprobación sigue siendo un acto manual del operador).

### Regla
Criterio de agrupación que determina cómo se agrupan Guías para generar una Factura proforma.
Siempre agrupa por **un solo campo** (no agrupación compuesta).
Un Cliente puede tener **múltiples Reglas configuradas**, pero exactamente **una activa** en cualquier momento.
La Regla activa es la que aplica al calcular el agrupador de cada Guía.

### Asignación de Regla a Cliente
Acto explícito del operador que vincula un Cliente con una o más Reglas del Tenant, marcando una como activa.

### Nombre de Regla
Etiqueta legible que el operador asigna a una Regla al activarla (ej: "Por comuna", "Por OC", "Por obra").


### Modo de Detalle de Factura
Determina cómo se construye la sección `<Detalle>` del DTE tipo 33 generado a partir de una Proforma.
Solo dos valores son configurables explícitamente — **S.G.** y **Por Producto**. Precio Constante/Variable no es config, se deriva en runtime; Global es un override automático por volumen, no un modo elegible.
- **S.G. (Según Guías)**: una sola línea `"Facturación según guías período {periodo}"` (período `YYYY-MM`, sin lista de folios — validado con dev senior sobre PDF real 2026-07-01, reemplaza la decisión anterior de listar folios en esta línea). Default cuando el cliente no tiene Modo de Detalle configurado.
- **Por Producto — Precio Constante**: agrupa líneas `<Detalle>` por `NmbItem` + `IndExe` (clave compuesta — nunca se mezclan montos exentos y afectos del mismo producto en una sola línea, es una distinción tributaria SII, no solo de presentación), suma `QtyItem`. Aplica cuando el mismo `NmbItem`+`IndExe` tiene el mismo `PrcItem` en todas las guías de la proforma. La línea incluye el código de producto (`CODIGO`).
- **Por Producto — Precio Variable**: agrupa por `NmbItem` + `IndExe` (misma clave compuesta que Precio Constante) + rango de fechas donde el precio no varía (caso típico: combustibles). Detectado en runtime cuando `PrcItem` cambia para el mismo `NmbItem`+`IndExe`. Subcaso de Por Producto, no un modo configurable aparte. Texto de línea: `"{NmbItem} ({fechaInicio} al {fechaFin})"` con fechas en formato dd-MM-yyyy (mismo formato que `formatDateDash`). Sin caso especial para tramos de un solo día — se repite la misma fecha en ambos lados.
- **Global (overflow)**: se activa cuando el total de referencias (guías individuales + OC deduplicadas + HES deduplicadas) supera el límite MAX de 40, sin importar el Modo de Detalle configurado. Texto propio, distinto a S.G.: `"Segun Guias: {folio1} {folio2} ..."` — folios completos, separados por espacio, sin abreviar y sin prefijo `f`. Las `<Referencia>` usan una referencia global en vez de guías individuales.
  - ✅ **Implementado 2026-07-02** en `mensaje-builder.ts` (`MAX_REFERENCIAS_INDIVIDUALES = 40`, `isGlobal = guias.length > 40`) — **solo cuenta guías por ahora**, no OC/HES (esas referencias no existen todavía en el pipeline, ver sección "OC"/"HES" abajo — TODO explícito para sesión futura, no bloquea).
  - `NmbItem` = `"Segun Guias:"` (fijo, sin folios) + folios completos separados por espacio en un campo nuevo `DESCRIPCION ADICIONAL` (9na columna del `2:|`, solo declarada cuando `isGlobal` — en los demás modos se omite para no tocar el formato ya confirmado en Casos 1-3). `MontoItem` = neto total (`sumNeto`), no el total con IVA — confirmado contra 5 XML de salida real de Enternet (facturas de terceros, no de este sistema) provistos por el usuario en `docs/ejemplos caso 4/`.
  - Referencia: en vez de líneas `4:|`/`5:|` individuales, se agregan 3 campos al encabezado `1:|`: `TIPO DOC REFERENCIA=52`, `FOLIO DOC REFERENCIA=0`, `ACCION REFERENCIA=5`. **Hipótesis sin confirmar contra Enternet QA todavía** — el spec V5 documenta `ACCION REFERENCIA` como aplicable "SOLO SI ES NOTA DE CREDITO O DEBITO", no para Factura; se usa igual por indicación explícita del usuario (sesión 2026-07-02), pendiente de validar con una emisión real de >40 guías antes de confiar en el resultado. Si Enternet lo rechaza o no genera `IndGlobal=1`/`FolioRef=0`, hay que revisar este mecanismo.

**Formato exacto de texto S.G. vs Global** (son intencionalmente distintos, no el mismo texto):
- S.G.: `"Facturación según guías período {periodo}"` — sin lista de folios, el detalle de guías va solo en `<Referencia>`.
- Global: `"Según guías: {folio1} {folio2} ..."` — folios completos, sin prefijo, separados por espacio.

La configuración (S.G. vs Por Producto) es propiedad del **Cliente**, independiente de la Regla de agrupación activa — un cliente puede tener cualquier Regla de agrupación y cualquier Modo de Detalle, son ejes ortogonales. Ver ADR-0001.

### Referencia de Guía en Factura
Las referencias al conjunto de Guías en el DTE tipo 33 siguen dos formatos según el modo:
- **Detalle**: una `<Referencia>` por guía (tipo 52) + OCs deduplicadas (tipo 801) + HES deduplicadas. Aplica cuando el total ≤ 40.
- **Global**: lista de folios separados por espacio (`525104 525105 525106 ...`) en el campo de referencia + OCs + HES. Aplica cuando el total > 40. Límite: 143 guías por proforma (límite de página en PDF del DTE).

### GLOSA del encabezado
Campo libre del Mensaje V5 (`1:|GLOSA|...`), `ALFA(1000)`, sin `;` ni saltos de línea reales (se representan con `"\n"` literal). Es una descripción larga del documento, **no** un mecanismo de referencia a guías — distinto de `RAZON REFERENCIA` (ver Pipe-format de Referencia).
El código legacy actual usa este campo para listar guías en tabla (Modo 2, threshold 20 guías) — ese uso queda **obsoleto** con el nuevo Modo de Detalle (S.G./Por Producto reemplazan el Modo 1/2 actual).
✅ Resuelto (validado con dev senior sobre PDF real 2026-07-01): en Caso 1 (S.G.), `GLOSA` **no se envía**. El PDF de Enternet mostraba esta tabla como bloque "Observaciones", duplicando la información ya visible en `<Referencia>` — puro ruido, sin aportar nada. Se elimina por completo, no se reemplaza por otro contenido.
Nota del senior: existiría un campo separado en Enternet ("descripción adicional", 1000 caracteres) que no se imprime en el PDF, donde en teoría podría ir este ladrillo sin generar ruido visual. Sin confirmar si es un campo real y distinto de `GLOSA` o el mismo campo con otro nombre de UI — **investigación futura, fuera de alcance de Caso 1**.

### Split de Proforma por Volumen
Cuando un agrupador tiene más de 143 guías, `generar` divide automáticamente en múltiples proformas del mismo agrupador (sin intervención del operador).
⚠️ Aplica solo a Modo de Detalle **Por Producto** — el límite 143 viene de la paginación del `<Detalle>` (una línea por producto/tramo, puede crecer mucho). En Modo **S.G.** el `<Detalle>` es siempre 1 sola línea, nunca se desborda — no hay split por volumen en S.G., sin importar cuántas guías tenga la proforma.
Modelo de 3 niveles (aplica a `<Referencia>`, independiente del Modo de Detalle). El umbral es siempre sobre el **total de referencias** (1 por guía + OC deduplicadas + HES deduplicadas) — nunca sobre "cantidad de guías" como unidad separada:
1. **Total de refs ≤ 40**: modo refs individuales.
2. **Total de refs > 40**: modo global (lista de folios como texto) — independiente de cuántas guías sean (una proforma con muchas OC/HES y pocas guías también puede caer aquí).
3. **> 143 guías** (esta unidad sí es "cantidad de guías", no total de refs — ver razón abajo): en Por Producto, split automático en `generar` → múltiples proformas de máx 143 guías cada una. En S.G., no aplica split — la `<Referencia>` sigue en modo global sin tope superior conocido.

⚠️ OPEN (2026-07-01): la explicación de por qué el límite es 143 guías necesita reconfirmarse — no está claro todavía si el límite real de paginación del PDF viene del `<Detalle>` (una línea por producto/tramo) o del formato `folio1 folio2 folio3 ...` de `<Referencia>` en modo Global. El usuario indicó que corregirá esto más adelante — no bloquea Caso 3.
⚠️ TODO (Caso 3, Precio Variable): el split de 143 asume que el número de líneas de `<Detalle>` escala ~1:1 con la cantidad de guías. Con Precio Variable esto ya no es cierto — un solo producto con muchos tramos de precio puede generar más líneas de `<Detalle>` que guías en la proforma, pudiendo desbordar la paginación del PDF sin llegar a 143 guías. Riesgo conocido, sin acción en este pase — revisar junto con Caso 4 (Global/overflow).

### OC (Orden de Compra)
Referencia tipo 801 en el SII DTE. Viene embebida en la sección `<Referencia>` del XML de cada Guía.
Se extrae en runtime al parsear el XML de las guías incluidas en la Proforma.
Se deduplica por clave **`(tipo, folio)`**, no por folio solo — una OC y una HES pueden coincidir en número de folio al ser numeraciones de terceros independientes entre sí; deduplicar solo por folio las trataría como el mismo documento por error.
En el pipe-format de salida hacia Enternet: `5:|801|{folio}|{fecha}|Orden de Compra` — código oficial (no texto), con `RAZON REFERENCIA` ("Orden de Compra") como 4ta columna.
Confirmado también en el formato XML alternativo de la spec V5 (sección de ejemplo de salida): `<REFERENCIA><TIPO_DE_REFERENCIA>801</TIPO_DE_REFERENCIA><FOLIO>...</FOLIO><FECHA_DEL_DOCUMENTO>...</FECHA_DEL_DOCUMENTO></REFERENCIA>` — ese ejemplo es del lado de **salida hacia Enternet**, no dice nada sobre el formato de entrada (XML de guía SII que este sistema parsea).
Fase 1 de implementación (sesión 2026-07-03, ver `docs/PRD-referencias-oc-hes.md`): se asume **1:1** (una sola OC por guía). Si una guía trae más de una, se toma la primera ocurrencia y se sigue (mismo criterio que ya existe para `CODIGO` inconsistente en modo Por Producto) — no bloquea la emisión. La multiplicidad N (varias OC por guía) se diseña recién después de validar 1:1 contra una emisión real en QA.

### HES (Hoja de Entrada de Servicios)
Referencia que viene embebida en la sección `<Referencia>` del XML de cada Guía.
Se extrae en runtime, se deduplica por clave `(tipo, folio)` — mismo criterio y misma razón que OC (ver arriba).
Código oficial Enternet V5 confirmado: `HES` (código libre 3 caracteres, listado en la spec de TIPO DE REFERENCIA junto a los códigos SII estándar) — confirmado tanto en pipe-format como en el formato XML alternativo de la spec (ver ejemplo en sección OC).
En el pipe-format de salida: `5:|HES|{folio}|{fecha}|Hoja de Entrada de Servicios`.
⚠️ OPEN (acotado): lo confirmado es el código de **salida** hacia Enternet. Sigue sin confirmarse que el XML de guía SII (DTE 52, *entrada*) real use el mismo código `HES` en su propio `<TpoDocRef>` — no hay XML real de un cliente con este caso todavía. No bloquea: se avanza con datos sintéticos (ver PRD) y se busca en paralelo un XML real de confirmación (mismo patrón usado para confirmar `CODIGO` con XML de San Damaso).
Fase 1 de implementación: mismo criterio 1:1 + "toma la primera" que OC (ver arriba).

### Pipe-format de Referencia (Mensaje V5)
Cada referencia en el mensaje Enternet V5 tiene 4 campos: `TIPO DE REFERENCIA` (código — oficial SII como `52`/`801` o código libre 3 caracteres como `HES`, NO texto descriptivo), `FOLIO` (C18), `FECHA` (dd/mm/aaaa), `RAZON REFERENCIA` (C90, texto libre opcional).
- Guías individuales: `5:|52|{folio}|{fecha}` — sin RAZON, el tipo ya es autoexplicativo.
- OC: `5:|801|{folio}|{fecha}|Orden de Compra`.
- HES: `5:|HES|{folio}|{fecha}|Hoja de Entrada de Servicios`.
⚠️ Migración: el código legacy actual (`mensaje-builder.ts`) escribe `"Guia de Despacho Electronica"` (texto) en vez del código `52` para las referencias de guía — al implementar el diseño nuevo, este código existente también debe migrar a usar `52`.

### CODIGO (código de producto)
Identificador de producto en las líneas de Detalle del modo Por Producto.
Se extrae del XML de la guía (DTE tipo 52): `<CdgItem><VlrCodigo>...</VlrCodigo></CdgItem>`.
✅ Confirmado con XML real (`<TpoCodigo>INTERNO</TpoCodigo><VlrCodigo>RSL00001448</VlrCodigo>`) — 2026-06-30.
No forma parte de la clave de agrupación (`NmbItem`+`IndExe`). Si el mismo `NmbItem`+`IndExe` trae distinto `CODIGO` entre guías de la misma proforma (inconsistencia de datos del emisor), se usa el de la primera ocurrencia — no bloquea la emisión por un problema de datos que escapa a este sistema.
**Requerido solo en Precio Constante.** En Precio Variable (líneas de tramo) se omite — ver ADR-0002. Corrige nota previa que decía "ambos subcasos".

### Línea no-producto en Detalle de guía
Algunos emisores (ej. San Damaso) agregan una línea `<Detalle>` adicional que no representa un producto facturable — convención para colar comentarios cuando no hay campo de glosa por línea en el XML (visto como `NmbItem="OBSERVACIONES"`, `IndExe=2`, texto libre en `DscItem`).
**Criterio de detección** (estructural, no por texto): ausencia de `<CdgItem>` **Y** `MontoItem=0`. Ambas condiciones a la vez — evita excluir por error un producto real sin código pero con cobro efectivo (rompería la consistencia entre el `<Detalle>` agrupado y los totales de la factura).
Se **excluye** del `<Detalle>` agrupado en modo Por Producto (no se agrupa ni se suma).
⚠️ OPEN: si el texto de `DscItem` debe trasladarse a alguna referencia/observación del DTE factura — pendiente de confirmar con dev senior, no bloquea el resto del diseño.