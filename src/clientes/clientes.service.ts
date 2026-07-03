import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async findOrCreate(
    empkey: string,
    data: ReceptorData,
  ): Promise<{ cliente: Cliente; created: boolean }> {
    const existing = await this.clienteRepository.findOne({
      where: { empkey, gclirut: data.rutReceptor },
    });
    if (existing) return { cliente: existing, created: false };

    const cliente = new Cliente();
    cliente.empkey = empkey;
    cliente.gclirut = data.rutReceptor;
    cliente.gclinom = data.razonSocial;

    const saved = await this.clienteRepository.save(cliente);
    return { cliente: saved, created: true };
  }
}
