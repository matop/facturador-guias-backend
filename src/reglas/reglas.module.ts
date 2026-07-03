import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReglasController } from './reglas.controller.js';
import { ReglasService } from './reglas.service.js';
import { GroupingService } from './grouping.service.js';
import { Regla } from './entities/regla.entity.js';
import { ReglaEmpresa } from './entities/regla-empresa.entity.js';
import { Cliente } from '../clientes/entities/cliente.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Regla, ReglaEmpresa, Cliente])],
  controllers: [ReglasController],
  providers: [ReglasService, GroupingService],
  exports: [ReglasService, GroupingService],
})
export class ReglasModule {}
