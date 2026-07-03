import { extraeTagLista } from './extrae-tag-lista.js';

const xml = `<DTE>
  <Receptor>
    <RUTRecep>77004250-K</RUTRecep>
    <RznSocRecep>Aceros SA</RznSocRecep>
    <CmnaRecep>RENCA</CmnaRecep>
    <CiudadRecep>SANTIAGO</CiudadRecep>
    <DirRecep>Av Test 123</DirRecep>
  </Receptor>
</DTE>`;

describe('extraeTagLista', () => {
  it('extrae el valor de un tag encontrado en el XML', () => {
    expect(extraeTagLista(['CmnaRecep'], xml)).toBe('RENCA');
  });

  it('retorna string vacío cuando el tag no existe en el XML', () => {
    expect(extraeTagLista(['TagInexistente'], xml)).toBe('');
  });

  it('concatena múltiples tags encontrados con ";"', () => {
    expect(extraeTagLista(['RznSocRecep', 'DirRecep'], xml)).toBe('Aceros SA;Av Test 123');
  });

  it('omite tags ausentes en la concatenación', () => {
    expect(extraeTagLista(['CmnaRecep', 'TagInexistente', 'CiudadRecep'], xml)).toBe('RENCA;SANTIAGO');
  });

  it('retorna string vacío cuando todos los tags están ausentes', () => {
    expect(extraeTagLista(['TagA', 'TagB'], xml)).toBe('');
  });

  it('retorna string vacío con XML vacío', () => {
    expect(extraeTagLista(['CmnaRecep'], '')).toBe('');
  });

  it('hace trim de los valores extraídos', () => {
    const xmlConEspacios = '<DTE><CmnaRecep>  RENCA  </CmnaRecep></DTE>';
    expect(extraeTagLista(['CmnaRecep'], xmlConEspacios)).toBe('RENCA');
  });

  it('soporta tags en cualquier nodo del XML (no solo Receptor)', () => {
    const xmlDetalle = '<DTE><Emisor><RznSoc>Empresa Emisora</RznSoc></Emisor></DTE>';
    expect(extraeTagLista(['RznSoc'], xmlDetalle)).toBe('Empresa Emisora');
  });
});
