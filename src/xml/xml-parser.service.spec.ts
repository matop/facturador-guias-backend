import { XmlParserService } from './xml-parser.service.js';
import { buildGuiaXml } from './xml-test-builders.js';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<DTE xmlns="http://www.sii.cl/SiiDte">
  <Documento>
    <Encabezado>
      <Emisor>
        <RUTEmisor>12345678-9</RUTEmisor>
        <RznSoc>Empresa Test SA</RznSoc>
        <GiroEmis>Comercio al por mayor</GiroEmis>
        <Telefono>223456789</Telefono>
        <Acteco>461090</Acteco>
      </Emisor>
      <Receptor>
        <RUTRecep>98765432-1</RUTRecep>
        <RznSocRecep>Cliente Test Ltda</RznSocRecep>
      </Receptor>
    </Encabezado>
  </Documento>
</DTE>`;

const SAMPLE_XML_CON_DETALLE = `<?xml version="1.0" encoding="UTF-8"?>
<DTE xmlns="http://www.sii.cl/SiiDte">
  <Documento>
    <Encabezado>
      <Emisor>
        <RUTEmisor>12345678-9</RUTEmisor>
        <RznSoc>Empresa Test SA</RznSoc>
        <GiroEmis>Comercio al por mayor</GiroEmis>
      </Emisor>
      <Receptor>
        <RUTRecep>98765432-1</RUTRecep>
        <RznSocRecep>Cliente Test Ltda</RznSocRecep>
      </Receptor>
    </Encabezado>
    <Detalle>
      <NmbItem>PRODUCTO A</NmbItem>
      <DscItem>COLOR:ROJO
TALLA:M</DscItem>
      <QtyItem>10</QtyItem>
      <PrcItem>1500</PrcItem>
      <IndExe>0</IndExe>
      <MontoItem>15000</MontoItem>
      <CdgItem>
        <TpoCodigo>INTERNO</TpoCodigo>
        <VlrCodigo>RSL00001448</VlrCodigo>
      </CdgItem>
    </Detalle>
    <Detalle>
      <NmbItem>OBSERVACIONES</NmbItem>
      <DscItem>ASOCIADO:PROVEEDOR X
ORDENCOMPRA:OC-12345
OBRA:PROYECTO NORTE</DscItem>
      <IndExe>2</IndExe>
      <MontoItem>0</MontoItem>
    </Detalle>
  </Documento>
</DTE>`;

describe('XmlParserService', () => {
  let service: XmlParserService;

  beforeEach(() => {
    service = new XmlParserService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('parseDocument', () => {
    it('extrae EmisorData completo del XML', () => {
      const result = service.parseDocument(SAMPLE_XML);

      expect(result.emisor).toEqual({
        rutEmisor: '12345678-9',
        razonSocial: 'Empresa Test SA',
        giro: 'Comercio al por mayor',
        telefono: '223456789',
        acteco: '461090',
      });
    });

    it('extrae ReceptorData completo del XML', () => {
      const result = service.parseDocument(SAMPLE_XML);

      expect(result.receptor).toEqual({
        rutReceptor: '98765432-1',
        razonSocial: 'Cliente Test Ltda',
        cdgIntRecep: '',
        contacto: '',
        dirRecep: '',
        cmnaRecep: '',
        ciudadRecep: '',
        giroRecep: '',
      });
    });

    it('lanza error descriptivo cuando falta un tag requerido', () => {
      const xmlSinEmisor =
        '<DTE><Documento><Encabezado></Encabezado></Documento></DTE>';

      expect(() => service.parseDocument(xmlSinEmisor)).toThrow('RUTEmisor');
    });
  });

  describe('parseDetalle', () => {
    it('retorna array vacío cuando no hay nodos <Detalle>', () => {
      const result = service.parseDetalle(SAMPLE_XML);
      expect(result).toEqual([]);
    });

    it('parsea múltiples nodos <Detalle> con NmbItem y DscItem', () => {
      const result = service.parseDetalle(SAMPLE_XML_CON_DETALLE);
      expect(result).toHaveLength(2);
      expect(result[0].nmbItem).toBe('PRODUCTO A');
      expect(result[1].nmbItem).toBe('OBSERVACIONES');
    });

    it('construye kvMap desde DscItem con saltos de línea', () => {
      const result = service.parseDetalle(SAMPLE_XML_CON_DETALLE);
      const obs = result[1];
      expect(obs.kvMap.get('ASOCIADO')).toBe('PROVEEDOR X');
      expect(obs.kvMap.get('ORDENCOMPRA')).toBe('OC-12345');
      expect(obs.kvMap.get('OBRA')).toBe('PROYECTO NORTE');
    });

    it('incluye detalle en parseDocument', () => {
      const result = service.parseDocument(SAMPLE_XML_CON_DETALLE);
      expect(result.detalle).toHaveLength(2);
    });

    it('parseDocument con XML sin <Detalle> retorna detalle vacío', () => {
      const result = service.parseDocument(SAMPLE_XML);
      expect(result.detalle).toEqual([]);
    });

    it('extrae qtyItem, prcItem, indExe, montoItem, codigo de cada <Detalle>', () => {
      const result = service.parseDetalle(SAMPLE_XML_CON_DETALLE);
      expect(result[0]).toMatchObject({
        qtyItem: '10',
        prcItem: '1500',
        indExe: '0',
        montoItem: '15000',
        codigo: 'RSL00001448',
      });
    });

    it('codigo vacío cuando no hay <CdgItem>', () => {
      const result = service.parseDetalle(SAMPLE_XML_CON_DETALLE);
      expect(result[1].codigo).toBe('');
      expect(result[1].montoItem).toBe('0');
    });
  });

  describe('parseKv', () => {
    it('parsea líneas CLAVE:VALOR', () => {
      const map = service.parseKv('CLAVE1:VALOR1\nCLAVE2:VALOR2');
      expect(map.get('CLAVE1')).toBe('VALOR1');
      expect(map.get('CLAVE2')).toBe('VALOR2');
    });

    it('ignora líneas sin dos puntos', () => {
      const map = service.parseKv('SIN_DOS_PUNTOS\nCLAVE:VALOR');
      expect(map.size).toBe(1);
      expect(map.get('CLAVE')).toBe('VALOR');
    });

    it('preserva el resto del valor cuando hay más de un dos puntos', () => {
      const map = service.parseKv('OC:TEST2 / 0010108427');
      expect(map.get('OC')).toBe('TEST2 / 0010108427');
    });

    it('retorna mapa vacío para string vacío', () => {
      expect(service.parseKv('')).toEqual(new Map());
    });
  });

  describe('parseReferencias', () => {
    it('guía sin <Referencia> retorna vacío', () => {
      const xml = buildGuiaXml();
      const result = service.parseReferencias(xml);
      expect(result).toEqual({ referencias: [], descartadas: [] });
    });

    it('guía con solo OC', () => {
      const xml = buildGuiaXml({
        referencias: [{ tipo: '801', folio: '111', fecha: '2026-05-10' }],
      });
      const result = service.parseReferencias(xml);
      expect(result.referencias).toEqual([
        { tipo: '801', folio: '111', fecha: '2026-05-10' },
      ]);
      expect(result.descartadas).toEqual([]);
    });

    it('guía con solo HES', () => {
      const xml = buildGuiaXml({
        referencias: [{ tipo: 'HES', folio: '222', fecha: '2026-05-11' }],
      });
      const result = service.parseReferencias(xml);
      expect(result.referencias).toEqual([
        { tipo: 'HES', folio: '222', fecha: '2026-05-11' },
      ]);
    });

    it('guía con OC y HES', () => {
      const xml = buildGuiaXml({
        referencias: [
          { tipo: '801', folio: '111', fecha: '2026-05-10' },
          { tipo: 'HES', folio: '222', fecha: '2026-05-11' },
        ],
      });
      const result = service.parseReferencias(xml);
      expect(result.referencias).toEqual([
        { tipo: '801', folio: '111', fecha: '2026-05-10' },
        { tipo: 'HES', folio: '222', fecha: '2026-05-11' },
      ]);
    });

    it('guía con 2+ OC toma la primera ocurrencia, no bloquea', () => {
      const xml = buildGuiaXml({
        referencias: [
          { tipo: '801', folio: '111', fecha: '2026-05-10' },
          { tipo: '801', folio: '999', fecha: '2026-05-20' },
        ],
      });
      const result = service.parseReferencias(xml);
      expect(result.referencias).toEqual([
        { tipo: '801', folio: '111', fecha: '2026-05-10' },
      ]);
    });

    it('guía con 2+ HES toma la primera ocurrencia, no bloquea', () => {
      const xml = buildGuiaXml({
        referencias: [
          { tipo: 'HES', folio: '222', fecha: '2026-05-11' },
          { tipo: 'HES', folio: '888', fecha: '2026-05-21' },
        ],
      });
      const result = service.parseReferencias(xml);
      expect(result.referencias).toEqual([
        { tipo: 'HES', folio: '222', fecha: '2026-05-11' },
      ]);
    });

    it('TpoDocRef no reconocido (52 dentro de la guía) se ignora y aparece en descartadas', () => {
      const xml = buildGuiaXml({
        referencias: [{ tipo: '52', folio: '333', fecha: '2026-05-12' }],
      });
      const result = service.parseReferencias(xml);
      expect(result.referencias).toEqual([]);
      expect(result.descartadas).toHaveLength(1);
      expect(result.descartadas[0].tipo).toBe('52');
    });

    it('TpoDocRef desconocido (código inventado) se ignora y aparece en descartadas', () => {
      const xml = buildGuiaXml({
        referencias: [{ tipo: 'XYZ', folio: '444', fecha: '2026-05-13' }],
      });
      const result = service.parseReferencias(xml);
      expect(result.referencias).toEqual([]);
      expect(result.descartadas).toHaveLength(1);
      expect(result.descartadas[0].tipo).toBe('XYZ');
    });

    it('801 sin FolioRef lanza error identificando tipo', () => {
      const xml = buildGuiaXml({
        referencias: [{ tipo: '801', fecha: '2026-05-10' }],
      });
      expect(() => service.parseReferencias(xml)).toThrow(/801/);
    });

    it('801 sin FchRef lanza error identificando tipo y folio', () => {
      const xml = buildGuiaXml({
        referencias: [{ tipo: '801', folio: '555' }],
      });
      expect(() => service.parseReferencias(xml)).toThrow(/801/);
      expect(() => service.parseReferencias(xml)).toThrow(/555/);
    });

    it('HES sin FolioRef lanza error identificando tipo', () => {
      const xml = buildGuiaXml({
        referencias: [{ tipo: 'HES', fecha: '2026-05-10' }],
      });
      expect(() => service.parseReferencias(xml)).toThrow(/HES/);
    });

    it('HES sin FchRef lanza error identificando tipo y folio', () => {
      const xml = buildGuiaXml({
        referencias: [{ tipo: 'HES', folio: '666' }],
      });
      expect(() => service.parseReferencias(xml)).toThrow(/HES/);
      expect(() => service.parseReferencias(xml)).toThrow(/666/);
    });
  });

  describe('fetchDocument', () => {
    it('lanza error cuando la respuesta HTTP no es ok', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      await expect(
        service.fetchDocument('http://example.com/dte.xml'),
      ).rejects.toThrow('404');
    });

    it('retorna documento parseado para URL válida', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(SAMPLE_XML),
      } as Response);

      const result = await service.fetchDocument('http://example.com/dte.xml');

      expect(result.emisor.rutEmisor).toBe('12345678-9');
      expect(result.receptor.rutReceptor).toBe('98765432-1');
    });
  });
});
