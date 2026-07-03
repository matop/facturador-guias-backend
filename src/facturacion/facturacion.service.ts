import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Factura } from './entities/factura.entity.js';
import { FacturaGuia } from './entities/factura-guia.entity.js';

@Injectable()
export class FacturacionService {
  constructor(
    @InjectRepository(Factura)
    private readonly facturaRepository: Repository<Factura>,
    @InjectRepository(FacturaGuia)
    private readonly facturaGuiaRepository: Repository<FacturaGuia>,
  ) {}

  async findAll(empkey: string): Promise<Factura[]> {
    return this.facturaRepository.find({ where: { empkey } });
  }

  async findById(empkey: string, gfackey: string): Promise<Factura> {
    const factura = await this.facturaRepository.findOne({
      where: { empkey, gfackey },
    });
    if (!factura) {
      throw new NotFoundException(
        `Factura no encontrada: empkey=${empkey}, gfackey=${gfackey}`,
      );
    }
    return factura;
  }

  async getGuiasByFactura(empkey: string, gfackey: string): Promise<FacturaGuia[]> {
    return this.facturaGuiaRepository.find({
      where: { empkey, gfackey },
    });
  }
}
