import type { ReglaConfig } from './regla-config.types.js';
import { extraeTagLista } from './tag-list/index.js';

type Handler = (config: ReglaConfig, xml: string) => string | null;

export const REGLA_REGISTRY: Record<ReglaConfig['fn'], Handler> = {
  extraeTagLista(config, xml) {
    if (config.fn !== 'extraeTagLista') return null;
    const valor = extraeTagLista(config.reglaTags, xml);
    return valor || null;
  },
};
