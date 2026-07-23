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

## Actualización 2026-07-03 (tarde) — intento 4, confirma bug del lado de Enternet

Reintentamos el mismo Mensaje V5 del intento 2 (header `TIPO/FOLIO/ACCION REFERENCIA` +
línea `5:|52|0|{fecha de hoy}`) sin cambiar nada de nuestro lado. Esta vez el error **cambió**
de `[ErrorRefTipDoc01]` (folio inválido) a `[FirmaErr002]` (falla de firma XML) — señal de que
Enternet modificó algo en su procesamiento entre la mañana y la tarde del mismo día:

```
[DTEErr001] No fue posible emitir el documento. |
[FirmaErr002] Falla en el Proceso de Firma del XML, cvc-datatype-valid.1.2.1:
'-  -' is not a valid value for 'date'.
        <Referencia>
                <NroLinRef>1</NroLinRef>
                <TpoDocRef>52</TpoDocRef>
                <IndGlobal>1</IndGlobal>
                <FolioRef>0</FolioRef>
                <FchRef>    -  -  </FchRef>
                <CodRef>3</CodRef>
                <RazonRef>Corrige Montos de mas de 20 Documentos</RazonRef>
        </Referencia>
        <Referencia>
                <NroLinRef>2</NroLinRef>
                <TpoDocRef>52</TpoDocRef>
                <FolioRef>0</FolioRef>
                <FchRef>2026-07-03</FchRef>
        </Referencia>
```

**Diagnóstico:** con un mismo Mensaje V5 de entrada, Enternet arma **dos** bloques
`<Referencia>` en el XML de salida — uno por el header `ACCION REFERENCIA=5` (que sí genera
`IndGlobal=1`, confirmando que el mecanismo existe) y otro por la línea `5:|52|0|{fecha}`. El
bloque generado desde el header trae `CodRef=3` / `RazonRef="Corrige Montos de mas de 20
Documentos"` **hardcodeado** (valor de ACCION REFERENCIA=3, no 5 — posible bug de mapeo interno)
y **no toma la fecha de la línea `5:|`**, dejando `FchRef` vacío (`'-  -'`), lo que rompe la
firma del XML. Es decir: el bloque `IndGlobal=1` casi funciona, pero el parser del emisor de
Enternet no le está inyectando `FchRef` desde donde correspondería.

**Conclusión:** el problema no es de nuestro Mensaje V5 (que ya es correcto y estable — no
cambia entre corridas) sino un bug del lado del parser/generador de XML de Enternet. Enternet
está al tanto y trabajando en su parser; quedamos a la espera de que lo corrijan para reintentar.
No se seguirá iterando desde nuestro lado hasta tener novedades de ellos.

**Estado del código:** se dejó a propósito el bloque experimental en
`src/mensaje/mensaje-builder.ts` (dentro de `buildMensaje`, rama `if (isGlobal)` al final) que
genera `TIPO/FOLIO/ACCION REFERENCIA` + línea `5:|52|0|{fecha}` — no se revirtió para poder
reintentar sin rearmar el código cuando Enternet confirme el fix.

## Resuelto — 2026-07-08, hotfix de Enternet

Enternet aplicó un hotfix a su parser el 2026-07-08. Reintentamos el mismo Mensaje V5 (sin
cambios de nuestro lado) contra QA con `scripts/test-caso4-global-sintetico.js --reset
--aprobar` y esta vez **se emitió correctamente**: `gfackey=127`, `folioSii=411219`.

XML de salida verificado (descargado desde `linkXml` de la respuesta de `/aprobar`):

```xml
<Referencia>
    <NroLinRef>1</NroLinRef>
    <TpoDocRef>52</TpoDocRef>
    <IndGlobal>1</IndGlobal>
    <FolioRef>0</FolioRef>
    <FchRef>2026-07-08</FchRef>
    <RazonRef>Referencia global</RazonRef>
</Referencia>
<Referencia>
    <NroLinRef>2</NroLinRef>
    <TpoDocRef>52</TpoDocRef>
    <FolioRef>0</FolioRef>
    <FchRef>2026-07-08</FchRef>
</Referencia>
```

`FchRef` ahora sale correcto en **ambos** bloques (antes el bloque `NroLinRef=1` salía con
`FchRef` vacío, `'-  -'`, rompiendo la firma XML con `FirmaErr002`). Enternet sigue armando dos
`<Referencia>` separadas en vez de fusionarlas en una (el bloque `NroLinRef=2` no lleva
`IndGlobal`), pero como ambas traen fecha válida, la firma y validación del SII pasan sin
error. No se investigó más allá porque el resultado práctico (emisión válida, folio SII real)
ya cumple el objetivo — si en el futuro el SII u otro sistema exige una sola `<Referencia>`
global limpia, retomar con Enternet la fusión de bloques.

**Código promovido de EXPERIMENTAL a definitivo** en `mensaje-builder.ts` (bloque `if
(isGlobal)` tras los Totales) — ver commit correspondiente. Tests de `mensaje-builder.spec.ts`
(Caso 4 Global) actualizados: los 2 `it.skip` que asumían ausencia de `4:|`/`5:|`/header de
referencia fueron reemplazados por asserts que confirman su presencia. 252/252 unit tests
verdes.

## Reintento 2026-07-14 — se confirma que la línea `5:|52|0|{fecha}` sigue siendo necesaria

Se probó quitar la línea `5:|52|0|{fecha}` (dejando solo el trío del encabezado
`TIPO/FOLIO/ACCION REFERENCIA`) para eliminar el `<Referencia>` duplicado
(`NroLinRef` extra, mismo `TpoDocRef 52`/`FolioRef 0`, sin `RazonRef`) que
Enternet sigue emitiendo en el XML de salida. Emisión real contra QA
(`scripts/test-caso4-global-sintetico.js --reset --aprobar`, gfackey=178):

```
HTTP 422 [DTEErr001] No fue posible emitir el documento. |
[FirmaErr002] Falla en el Proceso de Firma del XML, cvc-datatype-valid.1.2.1:
'-  -' is not a valid value for 'date'.
```

Mismo error que el intento 1 de 2026-07-03, pre-hotfix: sin la línea `5:|`, el
bloque `IndGlobal=1` armado desde el encabezado sigue sin `FchRef`. El hotfix
de Enternet del 2026-07-08 corrigió que ambos bloques trajeran fecha válida
*cuando la línea está presente*, pero no eliminó la dependencia de esa línea
para poblar `FchRef` en el bloque del encabezado. **Conclusión: el
`<Referencia>` duplicado no se puede evitar desde nuestro Mensaje V5 con el
parser actual de Enternet — cambio revertido.** Si se quiere una sola
`<Referencia>` global limpia, el único camino sigue siendo que Enternet fusione
los dos bloques de su lado (ver conclusión de la sección anterior).

## Intento 5 — 2026-07-22, aviso de Enternet sobre `CODIGO REFERENCIA` (parafraseado, sin confirmar)

El equipo de parser de Enternet avisó (de palabra, sin ejemplo escrito) que habían
corregido el tema de referencias: "no hay que enviarlo duplicado, hay que
enviarlo como referencia y agregar la etiqueta CODIGO REFERENCIA y el valor 5
en la siguiente línea". Esta etiqueta **no existe** en la spec V5 documentada
(`FormatodeIntegracinbasadoenEtiquetasEstndarv5.html`) — es un mecanismo nuevo
no documentado del lado de Enternet.

Probamos la interpretación más ajustada al patrón real de la spec (pares
posicionales `4:|`/`5:|`): en vez de reenviar el trío de header
`TIPO/FOLIO/ACCION REFERENCIA`, la referencia global va como una línea `5:|`
normal del mismo bloque `4:|`/`5:|` que ya usan OC/HES, agregando una columna
`CODIGO REFERENCIA` con valor `5`:

```
4:|TIPO DE REFERENCIA|FOLIO|FECHA|CODIGO REFERENCIA
5:|52|0|22/07/2026|5
```

Emisión real contra QA (`scripts/test-caso4-global-sintetico.js --reset
--aprobar`, gfackey=183):

```
HTTP 422 [DTEErr001] No fue posible emitir el documento. |
[FirmaErr002] Falla en el Proceso de Firma del XML, cvc-datatype-valid.1.2.1:
'-  -' is not a valid value for 'date'.
```

Mismo `[FirmaErr002]` de siempre, pero la traza del parser (log de
`WS.Emision.APIEmision`) trae una línea nueva y reveladora:

```
(publicador.TxtParseTokenGenericoOff000)Se recibe 'FECHA' de la REFERENCIA y
se ignora por ser referencia de cabecera del DTE
```

**Diagnóstico:** a diferencia de los intentos 1-4 (donde Enternet armaba *dos*
`<Referencia>`), acá el parser reconoce la línea con `CODIGO REFERENCIA=5`
como la referencia de cabecera única — no hay evidencia de duplicado en esta
corrida. Pero el parser **descarta explícitamente** el valor de `FECHA` que
viene en esa misma línea "por ser referencia de cabecera del DTE", dejando
`FchRef` vacío igual que antes. Es decir: el mecanismo de columna extra en la
línea `5:|` sí es reconocido como señal de "esto es la referencia de
cabecera", pero el parser espera la fecha desde **otro lugar** que todavía no
identificamos — no desde el campo `FECHA` de esa línea de detalle.

(Ruido aparte en la traza: `CodRefPermitidos` y `SeparadorEtiquetasLibres`
salen como "parámetro no definido" en este ambiente QA, igual que
`MODOVISUALIZACION`, `MODOCORREO`, `MODOBATCH`, `FirmaDiferida`,
`AseguraRecurso` — parece ruido genérico de parámetros no configurados en QA,
no algo específico de esta referencia.)

**Conclusión: NO se confirma la Hipótesis A. No se sigue iterando a ciegas** —
cada intento real cuesta una emisión en QA y ya son 5 variantes fallidas.
Falta la pregunta puntual a Enternet: dado que el parser confirma que ignora
la `FECHA` de la línea `5:|` para una "referencia de cabecera del DTE",
¿de qué campo del Mensaje V5 debe tomar `FchRef` en ese caso? ¿Hay una
etiqueta `1:|` de cabecera separada para la fecha de la referencia global
(análoga a `TIPO DOC REFERENCIA`/`FOLIO DOC REFERENCIA` de los intentos
viejos), o debería tomar automáticamente `FECHA DE DOCUMENTO` del header y
esto es un bug de su lado (similar al de `FchRef` vacío que ya corrigieron el
2026-07-08 para el mecanismo anterior)?

**Estado del código:** el bloque `if (isGlobal)` en `mensaje-builder.ts` queda
tal cual (columna `CODIGO REFERENCIA` en la línea `5:|`), marcado como
"Hipótesis A a validar" en el comentario — no se promueve a definitivo. Tests
en `mensaje-builder.spec.ts` / `mensaje-builder-referencias-global.spec.ts`
actualizados y verdes (290/290), pero reflejan un formato aún no confirmado
contra QA real.

## Intento 6 — 2026-07-22, A/B fecha vacía vs fecha de hoy en la línea `5:|`

Para aislar si el contenido del campo `FECHA` de la línea `5:|52|0|{fecha}|5`
influye en algo, se corrió el mismo Mensaje V5 dos veces contra QA real
(servidor de diagnóstico levantado desde este mismo worktree en el puerto
3335, para no interferir con el servidor `:3334` en uso), cambiando solo ese
campo:

- **Variante A — fecha vacía:** `5:|52|0||5` (gfackey=185).
- **Variante B — fecha de hoy (control, igual al Intento 5):** `5:|52|0|22/07/2026|5` (gfackey=186).

Resultado: **idéntico en ambas**, carácter por carácter:

```
HTTP 422 [DTEErr001] No fue posible emitir el documento. |
[FirmaErr002] Falla en el Proceso de Firma del XML, cvc-datatype-valid.1.2.1:
'-  -' is not a valid value for 'date'.
```

**Conclusión:** el contenido del campo `FECHA` en esa línea es irrelevante —
vacío o con una fecha válida, el resultado es el mismo. Esto es consistente
con (y refuerza) el hallazgo del Intento 5: el parser de Enternet descarta
por completo ese valor para la referencia de cabecera, sin siquiera intentar
parsearlo. No aporta una pista nueva sobre de dónde debería tomar `FchRef` —
solo descarta la hipótesis de que fuera un problema de formato/contenido del
valor enviado. Sigue pendiente la pregunta puntual a Enternet planteada en el
Intento 5 antes de seguir iterando.

(Nota de proceso: estas dos corridas no se hicieron contra el servidor
`:3334` compartido — se levantó un segundo servidor Nest desde el worktree en
`:3335`, apuntando a la misma BD `facturagdes2`, para no pisar el estado del
dev server principal. Los cambios de código de esta prueba (columna `FECHA`
forzada a vacío) fueron temporales y se revirtieron antes de comitear;
`mensaje-builder.ts` vuelve a quedar igual al Intento 5.)

## Intento 7 — 2026-07-23, aviso de hotfix del parser, error nuevo (ParseErr0021)

Enternet avisó (de palabra, parafraseado, sin ejemplo escrito) que habían
aplicado un nuevo hotfix al parser. El código de `mensaje-builder.ts` **no
cambió** respecto al Intento 5/6 (mismo formato `CODIGO REFERENCIA` en la
línea `5:|`):

```
4:|TIPO DE REFERENCIA|FOLIO|FECHA|CODIGO REFERENCIA
5:|52|0|23/07/2026|5
```

Reintentamos la emisión real contra QA dos veces, mismo servidor de
diagnóstico en `:3335` (worktree `worktree-referencia-global-codigo-referencia`,
sin tocar `:3334`):

- gfackey=187 (`--reset --aprobar`, primera corrida).
- gfackey=188 (`--reset --aprobar`, segunda corrida, mismo Mensaje V5 exacto).

Ambas corridas dieron **el mismo error nuevo**, distinto a `[FirmaErr002]` de
los intentos 5/6:

```
HTTP 422 [DTEErr001] No fue posible emitir el documento. |
[ParseErr0021] Acción sobre Documento de Referencia = 5, Tipo de Dato no
Corresponde, 5 <> DATE  , en línea 2
```

**Diagnóstico:** el hotfix sí cambió el comportamiento del parser (error
distinto al de los intentos 5/6, reproducido de forma determinística en
ambas corridas) — ya no descarta la fecha en silencio. El mensaje nombra un
campo `Acción sobre Documento de Referencia` (nombre que coincide con el
`ACCION REFERENCIA` del mecanismo viejo, pre-`CODIGO REFERENCIA`, ver
Intentos 1-4) y dice que espera tipo `DATE` pero recibió `5` — sugiere que el
parser post-hotfix está leyendo nuestra columna `CODIGO REFERENCIA` (valor
`5`) en la posición donde él espera la fecha de esa "acción", es decir el
mapeo posicional de columnas cambió con el hotfix y ya no coincide con el
que probamos en el Intento 5.

**No se itera más a ciegas sobre esto.** El usuario ya escaló este error
puntual a Enternet el mismo día (2026-07-23) y confirman que lo están
corrigiendo esa misma mañana. Queda pendiente reintentar cuando avisen que
el fix está desplegado — no cambiar `mensaje-builder.ts` mientras tanto,
sigue reflejando la Hipótesis A sin confirmar.
