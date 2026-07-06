import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Regla } from './entities/regla.entity.js';
import { ReglaEmpresa } from './entities/regla-empresa.entity.js';
import type { CreateReglaDto } from './dto/create-regla.dto.js';

@Injectable()
export class ReglasService {
  constructor(
    @InjectRepository(Regla)
    private readonly reglaRepository: Repository<Regla>,
    @InjectRepository(ReglaEmpresa)
    private readonly reglaEmpresaRepository: Repository<ReglaEmpresa>,
  ) {}

  async findAll(): Promise<Regla[]> {
    return this.reglaRepository.find();
  }

  async findById(id: string): Promise<Regla | null> {
    return this.reglaRepository.findOne({ where: { reglaidl: id } });
  }

  async findByEmpresa(empkey: string): Promise<ReglaEmpresa[]> {
    return this.reglaEmpresaRepository.find({ where: { empkey } });
  }

  async create(dto: CreateReglaDto): Promise<Regla> {
    const existe = await this.reglaRepository.findOne({
      where: { reglaidl: dto.reglaidl },
    });
    if (existe)
      throw new ConflictException(
        `Ya existe una regla con id '${dto.reglaidl}'`,
      );
    const regla = this.reglaRepository.create({
      reglaidl: dto.reglaidl,
      regladescripcion: dto.regladescripcion,
      reglaconfig: { fn: dto.fn, reglaTags: dto.reglaTags },
    });
    return this.reglaRepository.save(regla);
  }

  async update(id: string, dto: Partial<CreateReglaDto>): Promise<Regla> {
    const regla = await this.reglaRepository.findOne({
      where: { reglaidl: id },
    });
    if (!regla) throw new NotFoundException(`Regla '${id}' no encontrada`);
    if (dto.regladescripcion) regla.regladescripcion = dto.regladescripcion;
    if (dto.fn && dto.reglaTags)
      regla.reglaconfig = { fn: dto.fn, reglaTags: dto.reglaTags };
    else if (dto.reglaTags) regla.reglaconfig.reglaTags = dto.reglaTags;
    return this.reglaRepository.save(regla);
  }

  async remove(id: string): Promise<void> {
    const regla = await this.reglaRepository.findOne({
      where: { reglaidl: id },
    });
    if (!regla) throw new NotFoundException(`Regla '${id}' no encontrada`);
    await this.reglaRepository.remove(regla);
  }

  async findReglasDisponibles(
    empkey: string,
  ): Promise<{ reglaIdl: string; reglaDesc: string }[]> {
    const asignaciones = await this.reglaEmpresaRepository.find({
      where: { empkey },
    });
    if (asignaciones.length === 0) return [];
    const ids = asignaciones.map((a) => a.reglaidl);
    const reglas = await this.reglaRepository.find({
      where: ids.map((reglaidl) => ({ reglaidl })),
    });
    const map = new Map(reglas.map((r) => [r.reglaidl, r.regladescripcion]));
    return ids
      .filter((id) => map.has(id))
      .map((id) => ({ reglaIdl: id, reglaDesc: map.get(id)! }));
  }
}
