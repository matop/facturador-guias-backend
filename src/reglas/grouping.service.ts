import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Regla } from './entities/regla.entity.js';
import { Cliente } from '../clientes/entities/cliente.entity.js';
import { REGLA_REGISTRY } from './parsers/regla-registry.js';

export interface AgrupadorResult {
  guiReglaidl: string;
  guiValorAgrupador: string;
}

@Injectable()
export class GroupingService {
  constructor(
    @InjectRepository(Regla)
    private readonly reglaRepository: Repository<Regla>,
    @InjectRepository(Cliente)
    private readonly clienteRepository: Repository<Cliente>,
  ) {}

  /**
   * Computes the agrupador for a single guía.
   * Delegates to batchComputeAgrupadores — one code path for both single and batch.
   */
  async computeAgrupador(
    empkey: string,
    gclirut: string,
    xml: string,
  ): Promise<AgrupadorResult | null> {
    const result = await this.batchComputeAgrupadores(empkey, [
      { gclirut, xml },
    ]);
    return result.get(gclirut) ?? null;
  }

  /**
   * Batch version: fetches Clientes and Reglas in bulk, computes agrupador per item.
   * Returns Map<gclirut, AgrupadorResult | null>.
   */
  async batchComputeAgrupadores(
    empkey: string,
    items: Array<{ gclirut: string; xml: string }>,
  ): Promise<Map<string, AgrupadorResult | null>> {
    const result = new Map<string, AgrupadorResult | null>();
    if (items.length === 0) return result;

    const gcliruts = items.map((i) => i.gclirut);

    // Batch fetch clients
    const clientes = await this.clienteRepository.find({
      where: gcliruts.map((gclirut) => ({ empkey, gclirut })),
    });
    const clienteMap = new Map<string, string | null>();
    for (const c of clientes) {
      clienteMap.set(c.gclirut, c.reglaidl ?? null);
    }

    // Batch fetch reglas for unique reglaidls
    const reglaidls = [
      ...new Set(
        clientes.map((c) => c.reglaidl).filter((r): r is string => r !== null),
      ),
    ];
    if (reglaidls.length === 0) {
      for (const { gclirut } of items) result.set(gclirut, null);
      return result;
    }

    const reglas = await this.reglaRepository.find({
      where: reglaidls.map((reglaidl) => ({ reglaidl })),
    });
    const reglaMap = new Map(reglas.map((r) => [r.reglaidl, r.reglaconfig]));

    // Compute per item
    for (const { gclirut, xml } of items) {
      const reglaidl = clienteMap.get(gclirut) ?? null;
      if (!reglaidl) {
        result.set(gclirut, null);
        continue;
      }

      const reglaconfig = reglaMap.get(reglaidl);
      if (!reglaconfig) {
        result.set(gclirut, null);
        continue;
      }

      const handler =
        REGLA_REGISTRY[reglaconfig.fn as keyof typeof REGLA_REGISTRY];
      if (!handler) {
        result.set(gclirut, null);
        continue;
      }

      const guiValorAgrupador = handler(reglaconfig, xml);
      if (!guiValorAgrupador) {
        result.set(gclirut, null);
        continue;
      }

      result.set(gclirut, { guiReglaidl: reglaidl, guiValorAgrupador });
    }

    return result;
  }
}
