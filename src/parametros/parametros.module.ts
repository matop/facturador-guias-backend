import { Module } from '@nestjs/common';
import { ParametrosService } from './parametros.service.js';

@Module({
  providers: [ParametrosService],
  exports: [ParametrosService],
})
export class ParametrosModule {}
