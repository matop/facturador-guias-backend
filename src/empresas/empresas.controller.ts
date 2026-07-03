import { Controller, Get, Post, Put, Param, Query, Body, BadRequestException } from '@nestjs/common';
import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsIn } from 'class-validator';
import { EmpresasService } from './empresas.service.js';

class AssignReglaBody {
  @IsString()
  @IsNotEmpty()
  reglaIdl!: string;

  @IsOptional()
  @IsBoolean()
  recomputar?: boolean;

  @IsOptional()
  @IsString()
  periodo?: string;
}

class AssignModoDetalleBody {
  @IsIn(['SG', 'POR_PRODUCTO'])
  modoDetalle!: 'SG' | 'POR_PRODUCTO';
}

@Controller('empresas')
export class EmpresasController {
  constructor(private readonly empresasService: EmpresasService) {}

  @Post(':empkey/sync')
  async sync(
    @Param('empkey') empkey: string,
    @Query('periodo') periodo: string,
    @Query('rut') rut: string,
  ) {
    if (!periodo) throw new BadRequestException('periodo es obligatorio (YYYY-MM)');
    if (!rut) throw new BadRequestException('rut es obligatorio');
    return this.empresasService.sync(empkey, rut, periodo);
  }

  @Get(':empkey/reglas')
  async getReglas(@Param('empkey') empkey: string) {
    return this.empresasService.getReglasParaEmpresa(empkey);
  }

  @Get(':empkey/clientes')
  async getClientes(
    @Param('empkey') empkey: string,
    @Query('periodo') periodo: string,
  ) {
    if (!periodo) throw new BadRequestException('periodo es obligatorio (YYYY-MM)');
    return this.empresasService.getClientesConGuias(empkey, periodo);
  }

  @Get(':empkey/guias/agrupadas')
  async getGuiasAgrupadas(
    @Param('empkey') empkey: string,
    @Query('periodo') periodo: string,
    @Query('rut') rut?: string,
  ) {
    if (!periodo) throw new BadRequestException('periodo es obligatorio (YYYY-MM)');
    return this.empresasService.getGuiasAgrupadas(empkey, periodo, rut);
  }

  @Post(':empkey/guias/recomputar')
  async recomputarGuias(
    @Param('empkey') empkey: string,
    @Query('periodo') periodo: string,
  ) {
    if (!periodo) throw new BadRequestException('periodo es obligatorio (YYYY-MM)');
    return this.empresasService.recomputarTodasLasGuias(empkey, periodo);
  }

  @Put(':empkey/clientes/:rut/regla')
  async assignRegla(
    @Param('empkey') empkey: string,
    @Param('rut') rut: string,
    @Body() body: AssignReglaBody,
  ) {
    if (!body?.reglaIdl) throw new BadRequestException('reglaIdl es obligatorio');
    const opciones =
      body.recomputar !== undefined
        ? { recomputar: body.recomputar, periodo: body.periodo }
        : undefined;
    await this.empresasService.assignRegla(empkey, rut, body.reglaIdl, opciones);
  }

  @Put(':empkey/clientes/:rut/modo-detalle')
  async assignModoDetalle(
    @Param('empkey') empkey: string,
    @Param('rut') rut: string,
    @Body() body: AssignModoDetalleBody,
  ) {
    if (!body?.modoDetalle) throw new BadRequestException('modoDetalle es obligatorio');
    await this.empresasService.assignModoDetalle(empkey, rut, body.modoDetalle);
  }
}
