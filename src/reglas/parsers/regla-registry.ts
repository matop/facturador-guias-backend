import type { ReglaConfig } from './regla-config.types.js';
import { extraeTagLista } from './tag-list/index.js';
import { extraeReferenciaPorTipo } from './referencia-por-tipo/index.js';

type Handler = (config: ReglaConfig, xml: string) => string | null;

export const REGLA_REGISTRY: Record<ReglaConfig['fn'], Handler> = {
  extraeTagLista(config, xml) {
    if (config.fn !== 'extraeTagLista') return null;
    const valor = extraeTagLista(config.reglaTags, xml);
    return valor || null;
  },
  extraeReferenciaPorTipo(config, xml) {
    if (config.fn !== 'extraeReferenciaPorTipo') return null;
    const valor = extraeReferenciaPorTipo(config.tiposReferencia, xml);
    return valor || null;
  },
};
