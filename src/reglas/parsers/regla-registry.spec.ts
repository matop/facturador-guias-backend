import { REGLA_REGISTRY } from './regla-registry.js';
import type { ReglaConfig } from './regla-config.types.js';
import { buildGuiaXml } from '../../xml/xml-test-builders.js';

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

  describe('extraeReferenciaPorTipo', () => {
    it('retorna el folio cuando el tipo de referencia pedido existe en el XML', () => {
      const xmlConReferencias = buildGuiaXml({
        referencias: [{ tipo: '801', folio: '111', fecha: '2026-05-10' }],
      });
      const config: ReglaConfig = {
        fn: 'extraeReferenciaPorTipo',
        tiposReferencia: ['801'],
      };
      expect(REGLA_REGISTRY[config.fn](config, xmlConReferencias)).toBe('111');
    });

    it('retorna null cuando el tipo de referencia pedido no existe en el XML', () => {
      const xmlSinReferencias = buildGuiaXml();
      const config: ReglaConfig = {
        fn: 'extraeReferenciaPorTipo',
        tiposReferencia: ['801'],
      };
      expect(REGLA_REGISTRY[config.fn](config, xmlSinReferencias)).toBeNull();
    });

    it('concatena OC y HES con ";" cuando se pide ambos tipos', () => {
      const xmlConReferencias = buildGuiaXml({
        referencias: [
          { tipo: '801', folio: '111', fecha: '2026-05-10' },
          { tipo: 'HES', folio: '222', fecha: '2026-05-11' },
        ],
      });
      const config: ReglaConfig = {
        fn: 'extraeReferenciaPorTipo',
        tiposReferencia: ['801', 'HES'],
      };
      expect(REGLA_REGISTRY[config.fn](config, xmlConReferencias)).toBe(
        '111;222',
      );
    });

    it('retorna null en vez de lanzar cuando la referencia pedida viene mal formada en el XML', () => {
      const xmlMalformado = buildGuiaXml({
        referencias: [{ tipo: '801', fecha: '2026-05-10' }], // sin FolioRef
      });
      const config: ReglaConfig = {
        fn: 'extraeReferenciaPorTipo',
        tiposReferencia: ['801'],
      };
      expect(() =>
        REGLA_REGISTRY[config.fn](config, xmlMalformado),
      ).not.toThrow();
      expect(REGLA_REGISTRY[config.fn](config, xmlMalformado)).toBeNull();
    });
  });
});
