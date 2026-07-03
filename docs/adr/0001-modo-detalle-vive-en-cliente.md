# Modo de Detalle de Factura vive en el Cliente, no en la Regla

El Modo de Detalle (S.G. vs Por Producto) determina cómo se construye el `<Detalle>` del DTE tipo 33. Se consideraron tres lugares para esta configuración: un campo en `ReglaConfig` (atado a la Regla de agrupación activa), una config separada en el Cliente, o un parámetro elegido al generar/aprobar la Proforma.

Se decidió: **columna nueva en `gde.clientes`**, independiente de `reglaidl`. La Regla de agrupación (cómo se juntan las guías) y el Modo de Detalle (cómo se describe el contenido facturado) son ejes ortogonales — un cliente puede cambiar su Regla sin que cambie su Modo de Detalle, y viceversa. Atarlo a `ReglaConfig` habría acoplado dos decisiones independientes; dejarlo como parámetro de Proforma habría obligado al operador a elegirlo en cada generación en vez de configurarlo una vez por cliente.

Default cuando la columna es `NULL`: **S.G.**
