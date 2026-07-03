import { Module } from '@nestjs/common';
import { BackofficeAdapterService } from './backoffice-adapter.service.js';

@Module({
  providers: [BackofficeAdapterService],
  exports: [BackofficeAdapterService],
})
export class BackofficeAdapterModule {}
