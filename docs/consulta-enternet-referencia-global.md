# Consulta a soporte Enternet — Referencia Global en Factura (Tipo 33)

## Contexto

Estamos emitiendo Facturas Electrónicas (DTE 33) vía Mensaje V5 a partir de más de 40 guías
de despacho (Tipo 52) asociadas. Cuando el número de guías supera el umbral de referencias
individuales, queremos generar una `<Referencia>` de tipo **Global** en el XML resultante,
con esta forma (según ejemplos reales de facturas emitidas por otros sistemas que sí la
incluyen):

```xml
<Referencia>
  <TpoDocRef>52</TpoDocRef>
  <IndGlobal>1</IndGlobal>
  <FolioRef>0</FolioRef>
  <FchRef>2026-07-03</FchRef>
</Referencia>
```

## El campo SÍ es válido para Factura según el SII

La documentación oficial del SII (Formato DTE Versión 2.5, sección "Referencias", pág. 46)
define el campo `IndGlobal` (N° 3, "Indicador de Referencia Global") como aplicable a
**todos** los tipos de documento de la tabla, incluyendo explícitamente la columna **FACT**
(Factura Electrónica) — no solo Notas de Crédito/Débito:

> Indicador de Referencia Global (`<IndGlobal>`): Documento afecta a un número de más de 20
> documentos del mismo Tipo Documento de referencia. Se explicita la Razón en Razón
> Referencia. Valor = 1. Ejemplo: Factura de todas las guías del mes.

Es decir, a nivel de norma SII/DTE, una Factura (Tipo 33) puede perfectamente llevar
`<Referencia><IndGlobal>1</IndGlobal>...</Referencia>`. Esto contrasta con lo que dice la spec
del **Mensaje V5 de Enternet** (`FormatodeIntegracinbasadoenEtiquetasEstndarv5`), que documenta
el campo `ACCION REFERENCIA` del encabezado `1:|` (valores 1 a 5, donde 5 = "Referencia
Global") como aplicable **"solo si es Nota de Crédito o Débito"**. Entendemos que esa
restricción es de la capa de abstracción del Mensaje V5 de Enternet, no del DTE/SII en sí —
por eso consultamos cuál es el mecanismo correcto para lograrlo en Factura vía Mensaje V5.

## Qué probamos

Aun con esa restricción documentada, probamos tres variantes contra QA para confirmar o
descartar que `ACCION REFERENCIA` funcionara igual en Factura:

1. **Header `TIPO DOC REFERENCIA=52` / `FOLIO DOC REFERENCIA=0` / `ACCION REFERENCIA=5`**, sin
   líneas `4:|`/`5:|` de detalle de referencia.
   → Enternet arma un `<Referencia>` pero sin `FchRef`, y la firma del XML falla:
   `[FirmaErr002] Falla en el Proceso de Firma del XML, cvc-datatype-valid.1.2.1: '-  -' is not
   a valid value for 'date'`.

2. Mismo header + línea `5:|52|0|{fecha}` (folio=0, fecha del documento) para completar el
   `FchRef` faltante.
   → `[ErrorRefTipDoc01] Folio de Documento de Referencia Invalido: 52` — Enternet valida el
   folio de esa línea contra un documento real tipo 52 existente; folio=0 no es aceptado.

3. Mismo header + un campo `FECHA DOC REFERENCIA` inventado (siguiendo el patrón de nombres de
   `TIPO/FOLIO DOC REFERENCIA`) para aportar la fecha sin usar la línea `5:|`.
   → `[ParseErr001] Etiqueta [FECHA DOC REFERENCIA], en el encabezado es inválida` — etiqueta no
   reconocida por el parser.

Con esto, y dado que la spec ya marca `ACCION REFERENCIA` como exclusivo de NC/ND, dejamos de
iterar por prueba y error (cada intento requiere una emisión real en QA).

## Estado actual (funcional, sin el bloque deseado)

Actualmente omitimos por completo el bloque de Referencia en el Mensaje cuando hay más de 40
guías: sin header `TIPO/FOLIO/ACCION REFERENCIA`, sin líneas `4:|`/`5:|`. Los folios de las
guías viajan solo como texto libre en la `DESCRIPCION ADICIONAL` del Detalle (columna 9 de la
línea `3:|`). Enternet acepta el documento y emite folio SII válido (confirmado en QA:
folioSii=411211), pero el XML resultante no contiene ningún `<Referencia>` — a diferencia de
los ejemplos reales que muestran `IndGlobal=1`.

## Pregunta para Enternet

Dado que el propio formato DTE del SII permite `IndGlobal=1` en Facturas (no solo NC/ND, ver
cita arriba), ¿cuál es el campo o mecanismo correcto en el **Mensaje V5** para que una
**Factura** genere un bloque `<Referencia>` con `IndGlobal=1` y `FolioRef=0` (referencia
global a más de 20 documentos Tipo 52, en nuestro caso guías de despacho), considerando que:

- `ACCION REFERENCIA` está documentado en la spec V5 de Enternet como aplicable solo a Nota de
  Crédito/Débito, y
- las tres variantes que probamos (arriba) fueron rechazadas por distintos motivos (firma XML,
  validación de folio, etiqueta no reconocida)?

¿Existe un campo no documentado en la spec V5 para esto, o el mecanismo para lograr
`IndGlobal=1` en una Factura pasa por otro canal (por ejemplo, un flag separado del Mensaje
V5)? Si la respuesta es que Facturas simplemente no soportan este campo vía Mensaje V5 pese a
que el SII lo permite a nivel de DTE, nos sirve igual saberlo para dejar de investigar de
nuestro lado y quedarnos con el workaround actual (folios en `DESCRIPCION ADICIONAL`, sin
bloque `<Referencia>`).

Adjuntamos como referencia:
- Los mensajes de error exactos arriba.
- Ejemplo de Mensaje V5 enviado en el intento 1 (o el que soporte solicite).
- XML de salida real sin `<Referencia>` (folioSii=411211) para comparar contra el formato
  esperado.
