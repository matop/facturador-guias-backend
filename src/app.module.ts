import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module.js';
import { BackofficeAdapterModule } from './backoffice-adapter/backoffice-adapter.module.js';
import { GuiasModule } from './guias/guias.module.js';
import { ClientesModule } from './clientes/clientes.module.js';
import { FacturacionModule } from './facturacion/facturacion.module.js';
import { ReglasModule } from './reglas/reglas.module.js';
import { EmpresasModule } from './empresas/empresas.module.js';
import { FacturasModule } from './facturas/facturas.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    BackofficeAdapterModule,
    GuiasModule,
    ClientesModule,
    FacturacionModule,
    ReglasModule,
    EmpresasModule,
    FacturasModule,
  ],
})
export class AppModule {}
