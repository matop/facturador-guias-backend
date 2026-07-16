export interface ParamDef<T> {
  tipo: 'number' | 'string' | 'boolean';
  default: T;
}

export const PARAM_REGISTRY = {
  // SII acepta máximo 40 referencias explicitas o sino es referenciaGLOBAL (5:|) por Mensaje (subido de 20 el
  // 2026-07-02, confirmado con E2E real: 40 guías, folioSii=411207).
  MaximoGuias: { tipo: 'number', default: 40 } as ParamDef<number>,
} as const;

export type ParametroId = keyof typeof PARAM_REGISTRY;
