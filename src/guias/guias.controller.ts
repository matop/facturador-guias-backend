import { Controller, Get, Post, Query, Param, Body, ParseIntPipe } from '@nestjs/common';
import { GuiasService } from './guias.service.js';
import { Guia } from './entities/guia.entity.js';
import { SyncGuiaDto } from './dto/sync-guia.dto.js';

@Controller('guias')
export class GuiasController {
  constructor(private readonly guiasService: GuiasService) {}

  @Get()
  async findAll(@Query('empkey') empkey: string): Promise<Guia[]> {
    return this.guiasService.findAll(empkey);
  }

  @Get('rut/:gclirut')
  async findByRut(
    @Query('empkey') empkey: string,
    @Param('gclirut') gclirut: string,
  ): Promise<Guia[]> {
    return this.guiasService.findByRut(empkey, gclirut);
  }

  @Get(':guitipo/:guifolio')
  async findById(
    @Query('empkey') empkey: string,
    @Param('guitipo', ParseIntPipe) guitipo: number,
    @Param('guifolio') guifolio: string,
  ): Promise<Guia> {
    return this.guiasService.findById(empkey, guitipo, guifolio);
  }

  @Post('sync')
  async syncFromReporte(
    @Body() syncDto: SyncGuiaDto,
  ): Promise<{ synced: number }> {
    return this.guiasService.syncFromReporte(
      syncDto.empkey,
      syncDto.rut,
      syncDto.fechaInicial,
      syncDto.fechaFinal,
    );
  }
}
