import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacturacionController } from './facturacion.controller.js';
import { FacturacionService } from './facturacion.service.js';
import { Factura } from './entities/factura.entity.js';
import { FacturaGuia } from './entities/factura-guia.entity.js';
import { GuiasModule } from '../guias/guias.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Factura, FacturaGuia]), GuiasModule],
  controllers: [FacturacionController],
  providers: [FacturacionService],
  exports: [FacturacionService],
})
export class FacturacionModule {}
