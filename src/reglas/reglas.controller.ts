import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode } from '@nestjs/common';
import { ReglasService } from './reglas.service.js';
import { CreateReglaDto } from './dto/create-regla.dto.js';
import { Regla } from './entities/regla.entity.js';
import { ReglaEmpresa } from './entities/regla-empresa.entity.js';

@Controller('reglas')
export class ReglasController {
  constructor(private readonly reglasService: ReglasService) {}

  @Get()
  async findAll(): Promise<Regla[]> {
    return this.reglasService.findAll();
  }

  @Get('empresa/:empkey')
  async findByEmpresa(@Param('empkey') empkey: string): Promise<ReglaEmpresa[]> {
    return this.reglasService.findByEmpresa(empkey);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<Regla | null> {
    return this.reglasService.findById(id);
  }

  @Post()
  async create(@Body() dto: CreateReglaDto): Promise<Regla> {
    return this.reglasService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: Partial<CreateReglaDto>): Promise<Regla> {
    return this.reglasService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    return this.reglasService.remove(id);
  }
}
