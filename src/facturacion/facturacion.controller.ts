import { Controller, Get, Param, Query } from '@nestjs/common';
import { FacturacionService } from './facturacion.service.js';
import { Factura } from './entities/factura.entity.js';
import { FacturaGuia } from './entities/factura-guia.entity.js';

@Controller('facturacion')
export class FacturacionController {
  constructor(private readonly facturacionService: FacturacionService) {}

  @Get()
  async findAll(@Query('empkey') empkey: string): Promise<Factura[]> {
    return this.facturacionService.findAll(empkey);
  }

  @Get(':gfackey')
  async findById(
    @Query('empkey') empkey: string,
    @Param('gfackey') gfackey: string,
  ): Promise<Factura> {
    return this.facturacionService.findById(empkey, gfackey);
  }

  @Get(':gfackey/guias')
  async getGuiasByFactura(
    @Query('empkey') empkey: string,
    @Param('gfackey') gfackey: string,
  ): Promise<FacturaGuia[]> {
    return this.facturacionService.getGuiasByFactura(empkey, gfackey);
  }
}
