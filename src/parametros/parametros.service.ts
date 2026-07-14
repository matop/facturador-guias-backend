import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PARAM_REGISTRY } from './param-registry.js';

export interface GetParametroOpts {
  empkey: string;
  alcance?: string;
}

interface CacheEntry {
  valor: string | undefined;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class ParametrosService {
  private readonly logger = new Logger(ParametrosService.name);
  private readonly sidecarUrl: string;
  private readonly appIdl: string;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly configService: ConfigService) {
    this.sidecarUrl = this.configService.get<string>(
      'PARAMETROS_SIDECAR_URL',
      'http://localhost:3002',
    );
    this.appIdl = this.configService.get<string>(
      'PARAMETROS_APP_IDL',
      'FacturadorGuias',
    );
  }

  async get(
    parametroId: string,
    { empkey, alcance }: GetParametroOpts,
  ): Promise<string | undefined> {
    const cacheKey = `${parametroId}:${empkey}:${alcance ?? ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.valor;
    }

    const valor = await this.fetchValor(parametroId, empkey, alcance);
    this.cache.set(cacheKey, { valor, expiresAt: Date.now() + CACHE_TTL_MS });
    return valor;
  }

  private async fetchValor(
    parametroId: string,
    empkey: string,
    alcance?: string,
  ): Promise<string | undefined> {
    const url = new URL('/parameter/value', this.sidecarUrl);
    url.searchParams.set('app', this.appIdl);
    url.searchParams.set('parametro', parametroId);
    url.searchParams.set('empkey', empkey);
    if (alcance) {
      url.searchParams.set('alcance', alcance);
    }

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        this.logger.warn(
          `Sidecar de parámetros respondió HTTP ${response.status} para ${parametroId}`,
        );
        return undefined;
      }
      const body = (await response.json()) as { valor?: string };
      return body.valor;
    } catch (error) {
      this.logger.warn(
        `Error al consultar sidecar de parámetros para ${parametroId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    }
  }

  async getMaximoGuias(empkey: string): Promise<number> {
    const def = PARAM_REGISTRY.MaximoGuias;
    const valor = await this.get('MaximoGuias', { empkey });
    if (valor === undefined) {
      return def.default;
    }
    const parsed = Number(valor);
    if (Number.isNaN(parsed)) {
      this.logger.warn(
        `Valor no numérico para MaximoGuias: "${valor}", usando default ${def.default}`,
      );
      return def.default;
    }
    return parsed;
  }
}
