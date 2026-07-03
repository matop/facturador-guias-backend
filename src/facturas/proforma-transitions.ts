import { UnprocessableEntityException } from '@nestjs/common';
import type { Factura } from '../facturacion/entities/factura.entity.js';

export function assertPuedeAprobar(factura: Factura): void {
  if (factura.estado !== 'BORRADOR') {
    throw new UnprocessableEntityException(
      `Solo se puede aprobar una Proforma en estado BORRADOR (estado actual: ${factura.estado})`,
    );
  }
}

export function assertPuedeAnular(factura: Factura): void {
  if (!['BORRADOR', 'APROBADA'].includes(factura.estado)) {
    throw new UnprocessableEntityException(
      `Solo se puede anular una Proforma en estado BORRADOR o APROBADA (estado actual: ${factura.estado})`,
    );
  }
}
