import { REGLA_REGISTRY } from './regla-registry.js';
import type { ReglaConfig } from './regla-config.types.js';

const xml = `<DTE>
  <Receptor>
    <RUTRecep>77004250-K</RUTRecep>
    <CmnaRecep>RENCA</CmnaRecep>
    <RznSocRecep>Aceros SA</RznSocRecep>
    <DirRecep>Av Test 123</DirRecep>
  </Receptor>
</DTE>`;

describe('REGLA_REGISTRY', () => {
  describe('extraeTagLista', () => {
    it('retorna el valor cuando el tag existe en el XML', () => {
      const config: ReglaConfig = {
        fn: 'extraeTagLista',
        reglaTags: ['CmnaRecep'],
      };
      expect(REGLA_REGISTRY[config.fn](config, xml)).toBe('RENCA');
    });

    it('retorna null cuando el tag no existe en el XML', () => {
      const config: ReglaConfig = {
        fn: 'extraeTagLista',
        reglaTags: ['TagInexistente'],
      };
      expect(REGLA_REGISTRY[config.fn](config, xml)).toBeNull();
    });

    it('concatena múltiples tags con ";" y retorna el string compuesto', () => {
      const config: ReglaConfig = {
        fn: 'extraeTagLista',
        reglaTags: ['RznSocRecep', 'DirRecep'],
      };
      expect(REGLA_REGISTRY[config.fn](config, xml)).toBe(
        'Aceros SA;Av Test 123',
      );
    });

    it('retorna null cuando todos los tags de una regla compuesta están ausentes', () => {
      const config: ReglaConfig = {
        fn: 'extraeTagLista',
        reglaTags: ['TagA', 'TagB'],
      };
      expect(REGLA_REGISTRY[config.fn](config, xml)).toBeNull();
    });

    it('omite tags ausentes y retorna solo los encontrados', () => {
      const config: ReglaConfig = {
        fn: 'extraeTagLista',
        reglaTags: ['CmnaRecep', 'TagInexistente'],
      };
      expect(REGLA_REGISTRY[config.fn](config, xml)).toBe('RENCA');
    });
  });
});
