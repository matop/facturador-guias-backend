import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GuiasController } from './guias.controller.js';
import { GuiasService } from './guias.service.js';
import { Guia } from './entities/guia.entity.js';
import { GuiaImpuesto } from './entities/guia-impuesto.entity.js';
import { BackofficeAdapterModule } from '../backoffice-adapter/backoffice-adapter.module.js';
import { ClientesModule } from '../clientes/clientes.module.js';
import { XmlModule } from '../xml/xml.module.js';
import { ReglasModule } from '../reglas/reglas.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Guia, GuiaImpuesto]),
    BackofficeAdapterModule,
    ClientesModule,
    XmlModule,
    ReglasModule,
  ],
  controllers: [GuiasController],
  providers: [GuiasService],
  exports: [GuiasService],
})
export class GuiasModule {}
