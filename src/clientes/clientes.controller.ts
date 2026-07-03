import { Controller, Get, Param, Query } from '@nestjs/common';
import { ClientesService } from './clientes.service.js';
import { Cliente } from './entities/cliente.entity.js';

@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  async findAll(@Query('empkey') empkey: string): Promise<Cliente[]> {
    return this.clientesService.findAll(empkey);
  }

  @Get(':gclirut')
  async findByRut(
    @Query('empkey') empkey: string,
    @Param('gclirut') gclirut: string,
  ): Promise<Cliente> {
    return this.clientesService.findByRut(empkey, gclirut);
  }
}
