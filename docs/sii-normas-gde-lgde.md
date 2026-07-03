# Referencia SII — GDE (DTE Tipo 52) y Facturación (DTE Tipo 33)

> Documento de referencia interno para **guias-middleware**. Fuentes: Resolución Exenta SII N°154 (2025), Resolución Exenta N°52 (2026), documentación técnica SII.
>
> Actualizado: 2026-07-01

---

## 0. Alcance en este proyecto — leer primero

**guias-middleware NO emite GDEs (DTE 52).** Las guías ya llegan emitidas desde el backoffice legado (sync). Este proyecto:
- **Agrupa** guías DTE 52 ya emitidas por cliente + regla → genera Proformas.
- **Emite DTE 33** (factura) que **referencia** esas guías 52 (+ OC tipo 801 + HES).
- El scope termina al enviar la Proforma al backoffice para su emisión — la emisión real al SII la maneja el backoffice.

Por esto, normas de **transporte** (Patente, RUTChofer, IndTraslado como dato de la guía, estados de aceptación SII de la guía como ACD/RLV/RMD) **no aplican al código de este proyecto** — son responsabilidad del backoffice legado que emite las GDEs. Se documentan abajo solo como contexto general, no como algo a implementar aquí.

**Fuente de verdad para el mapeo específico de este proyecto** (formato de referencias en el DTE 33, CODIGO de producto, IndExe en agrupación de Detalle, pipe-format Enternet V5): ver `CONTEXT.md` (raíz del repo), secciones "Referencia de Guía en Factura", "OC", "HES", "Pipe-format de Referencia", "CODIGO". Este documento NO duplica eso.

---

## 1. Qué es una GDE (Guía de Despacho Electrónica)

- **DTE tipo 52** — documento que acredita el traslado físico de mercaderías.
- **No genera hecho tributario por sí sola** — se referencia desde la factura definitiva (DTE 33), que es lo que hace este proyecto.
- Cada GDE corresponde a un solo transporte y un solo vehículo (regla de negocio del emisor, no relevante para el agrupador).

---

## 2. Plazo legal para facturar guías — relevante para este proyecto

Por norma SII, las guías solo pueden facturarse dentro del mes de emisión o hasta **10 días hábiles** después del cierre del mes. Las guías del período anterior representan entregas que el Tenant aún puede — y debe — facturar dentro de ese plazo.

- Estado en este proyecto: `[ ] Alerta 10 días hábiles en UI` — pendiente (ver `docs/ESTADO.md`, backlog).

---

## 3. IndTraslado — filtro pendiente

| Valor | Descripción |
|-------|-------------|
| 1     | Operación constituye venta |
| 2     | Ventas por efectuar |
| 3     | Consignaciones |
| 4     | Entrega gratuita |
| 5     | Traslados internos |
| 6     | Otros traslados no venta |
| 7     | Devolución de Mercaderías |
| 8     | Traslado para exportación (no venta) |
| 9     | Venta para exportación |

**Pendiente en este proyecto** (`docs/ESTADO.md` backlog): `[ ] Filtro IndTraslado=1 — solo guías que constituyen venta deben facturarse`. Hoy `generar`/`crearManual` no filtran por este campo — agrupan todas las guías con `guireglaidl IS NOT NULL`, sin distinguir si la guía constituye venta.

---

## 4. Distinción tributaria afecto/exento (IndExe)

`IndExe` en el XML de la guía distingue líneas afectas (IVA) de exentas. En este proyecto es clave de agrupación en el Modo de Detalle "Por Producto" (nunca se mezclan montos exentos y afectos del mismo producto en una línea de Detalle del DTE 33) — ver `CONTEXT.md` para el detalle de implementación.

---

## 5. Normativa vigente

| Norma                          | Descripción                                                 | Vigencia |
|--------------------------------|---------------------------------------------------------------|----------|
| XSD DTE v10 SII                | Schema base para todos los DTE                                | Vigente  |
| Resolución Exenta N°154 (2025) | Nuevos campos de trazabilidad logística en GDE (transporte)   | **Nov 1, 2026** — no afecta a este proyecto (campos de transporte, no de facturación) |
| Resolución Exenta N°52 (2026)  | Posterga Res. 154 de Mayo a Noviembre 2026                    | Vigente  |

---

## 6. Retención legal

- **6 años** desde la fecha de emisión.
- Nunca eliminar documentos — solo marcar como `ANULADA` (ya implementado para Proformas — ver estado `ANULADA` en `CONTEXT.md`/memoria).

---

## 7. Fuentes

- [Resolución Exenta N°154 — SII (PDF)](https://www.sii.cl/normativa_legislacion/resoluciones/2025/reso154.pdf)
- [Formato DTE 2026-02 v2.5 — SII (PDF)](https://www.sii.cl/factura_electronica/factura_mercado/formato_dte_202602.pdf) — copia local en `docs/formato_dte_202602.pdf`
- Formato Mensaje Enternet V5 (pipe-format, fuente de verdad para campos del Mensaje): `docs/FormatodeIntegracinbasadoenEtiquetasEstndarv5.html`
