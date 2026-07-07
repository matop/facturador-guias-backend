import { extraeReferenciaPorTipo } from './extrae-referencia-por-tipo.js';
import { buildGuiaXml } from '../../../xml/xml-test-builders.js';

describe('extraeReferenciaPorTipo', () => {
  it('extrae solo el folio de la OC (801) cuando se pide únicamente ese tipo', () => {
    const xml = buildGuiaXml({
      referencias: [
        { tipo: '801', folio: '111', fecha: '2026-05-10' },
        { tipo: 'HES', folio: '222', fecha: '2026-05-11' },
      ],
    });
    expect(extraeReferenciaPorTipo(['801'], xml)).toBe('111');
  });

  it('extrae solo el folio de la HES cuando se pide únicamente ese tipo', () => {
    const xml = buildGuiaXml({
      referencias: [
        { tipo: '801', folio: '111', fecha: '2026-05-10' },
        { tipo: 'HES', folio: '222', fecha: '2026-05-11' },
      ],
    });
    expect(extraeReferenciaPorTipo(['HES'], xml)).toBe('222');
  });

  it('concatena OC y HES con ";" siguiendo el orden de tiposReferencia, no el orden del XML', () => {
    // HES aparece primero en el XML, pero tiposReferencia pide 801 antes de HES.
    const xml = buildGuiaXml({
      referencias: [
        { tipo: 'HES', folio: '222', fecha: '2026-05-11' },
        { tipo: '801', folio: '111', fecha: '2026-05-10' },
      ],
    });
    expect(extraeReferenciaPorTipo(['801', 'HES'], xml)).toBe('111;222');
  });

  it('retorna string vacío cuando el tipo pedido no está presente en el XML', () => {
    const xml = buildGuiaXml({
      referencias: [{ tipo: 'HES', folio: '222', fecha: '2026-05-11' }],
    });
    expect(extraeReferenciaPorTipo(['801'], xml)).toBe('');
  });

  it('retorna string vacío cuando el XML no tiene ningún <Referencia>', () => {
    const xml = buildGuiaXml();
    expect(extraeReferenciaPorTipo(['801'], xml)).toBe('');
  });

  it('repite el mismo folio si el tipo aparece repetido en tiposReferencia', () => {
    const xml = buildGuiaXml({
      referencias: [{ tipo: '801', folio: '111', fecha: '2026-05-10' }],
    });
    expect(extraeReferenciaPorTipo(['801', '801'], xml)).toBe('111;111');
  });

  it('no revienta si parseReferencias lanza por un 801 sin FolioRef — lo trata como ausente', () => {
    const xml = buildGuiaXml({
      referencias: [{ tipo: '801', fecha: '2026-05-10' }], // sin folio
    });
    expect(() => extraeReferenciaPorTipo(['801'], xml)).not.toThrow();
    expect(extraeReferenciaPorTipo(['801'], xml)).toBe('');
  });

  it('no revienta si parseReferencias lanza por una HES sin FchRef — lo trata como ausente', () => {
    const xml = buildGuiaXml({
      referencias: [{ tipo: 'HES', folio: '666' }], // sin fecha
    });
    expect(() => extraeReferenciaPorTipo(['HES'], xml)).not.toThrow();
    expect(extraeReferenciaPorTipo(['HES'], xml)).toBe('');
  });
});
