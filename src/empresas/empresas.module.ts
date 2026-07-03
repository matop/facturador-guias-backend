import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmpresasController } from './empresas.controller.js';
import { EmpresasService } from './empresas.service.js';
import { Guia } from '../guias/entities/guia.entity.js';
import { Cliente } from '../clientes/entities/cliente.entity.js';
import { GuiasModule } from '../guias/guias.module.js';
import { ReglasModule } from '../reglas/reglas.module.js';
import { XmlModule } from '../xml/xml.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Guia, Cliente]),
    GuiasModule,
    ReglasModule,
    XmlModule,
  ],
  controllers: [EmpresasController],
  providers: [EmpresasService],
})
export class EmpresasModule {}
