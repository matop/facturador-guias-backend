import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Cliente } from './entities/cliente.entity.js';
import type { ReceptorData } from '../xml/xml-parser.service.js';

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clienteRepository: Repository<Cliente>,
  ) {}

  async findAll(empkey: string): Promise<Cliente[]> {
    return this.clienteRepository.find({ where: { empkey } });
  }

  async findByRut(empkey: string, gclirut: string): Promise<Cliente> {
    const cliente = await this.clienteRepository.findOne({
      where: { empkey, gclirut },
    });
    if (!cliente) {
      throw new NotFoundException(
        `Cliente no encontrado: empkey=${empkey}, gclirut=${gclirut}`,
      );
    }
    return cliente;
  }

  async findOrCreateBatch(
    empkey: string,
    receptores: ReceptorData[],
  ): Promise<{ clientes: Cliente[]; created: number }> {
    if (receptores.length === 0) return { clientes: [], created: 0 };

    const uniqueReceptores = new Map<string, ReceptorData>();
    for (const receptor of receptores) {
      if (!uniqueReceptores.has(receptor.rutReceptor)) {
        uniqueReceptores.set(receptor.rutReceptor, receptor);
      }
    }
    const ruts = [...uniqueReceptores.keys()];

    const existing = await this.clienteRepository.find({
      where: { empkey, gclirut: In(ruts) },
    });
    const existingRuts = new Set(existing.map((c) => c.gclirut));

    const nuevos = ruts
      .filter((rut) => !existingRuts.has(rut))
      .map((rut) => {
        const cliente = new Cliente();
        cliente.empkey = empkey;
        cliente.gclirut = rut;
        cliente.gclinom = uniqueReceptores.get(rut)!.razonSocial;
        return cliente;
      });

    if (nuevos.length > 0) {
      await this.clienteRepository
        .createQueryBuilder()
        .insert()
        .into(Cliente)
        .values(nuevos)
        .orIgnore()
        .execute();
    }

    return { clientes: [...existing, ...nuevos], created: nuevos.length };
  }
}
