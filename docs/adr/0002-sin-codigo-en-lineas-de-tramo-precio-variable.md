# Sin CODIGO en líneas de tramo de Precio Variable

En Precio Constante, la línea de `<Detalle>` agrupada incluye `CODIGO` usando el de la "primera ocurrencia" cuando el mismo `NmbItem`+`IndExe` trae códigos distintos entre guías (inconsistencia de datos del emisor, no bloquea emisión). En Precio Variable, cada tramo puede provenir de guías distintas, así que ese mismo criterio de "primera ocurrencia" aplicado a un tramo específico podría mostrar un `CODIGO` que no representa a todos los items del tramo.

Se decidió: **omitir `CODIGO` en las líneas de tramo de Precio Variable**. La línea usa solo `"{NmbItem} ({fechaInicio} al {fechaFin})"`. Es una decisión preventiva — no fue validada contra un PDF real de Enternet con un caso de Precio Variable (a diferencia de la eliminación de `GLOSA` en Caso 1, que sí se validó así). Si al validar con un caso real se confirma que el `CODIGO` de primera ocurrencia no genera ambigüedad, se puede revertir y volver a incluirlo.
