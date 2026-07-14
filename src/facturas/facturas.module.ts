import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacturasController } from './facturas.controller.js';
import { FacturasService } from './facturas.service.js';
import { Factura } from '../facturacion/entities/factura.entity.js';
import { Cliente } from '../clientes/entities/cliente.entity.js';
import { Regla } from '../reglas/entities/regla.entity.js';
import { BackofficeAdapterModule } from '../backoffice-adapter/backoffice-adapter.module.js';
import { FacturacionModule } from '../facturacion/facturacion.module.js';
import { XmlModule } from '../xml/xml.module.js';
import { ParametrosModule } from '../parametros/parametros.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Factura, Cliente, Regla]),
    BackofficeAdapterModule,
    FacturacionModule,
    XmlModule,
    ParametrosModule,
  ],
  controllers: [FacturasController],
  providers: [FacturasService],
})
export class FacturasModule {}
