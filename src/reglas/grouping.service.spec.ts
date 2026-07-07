import { GroupingService } from './grouping.service.js';
import { buildGuiaXml } from '../xml/xml-test-builders.js';

// ── GroupingService tests ─────────────────────────────────────────────────────
//
// computeAgrupador(empkey, gclirut, xml) — delega a batchComputeAgrupadores.
// batchComputeAgrupadores(empkey, items[{gclirut, xml}]) — batch con 2 queries.

const mockReglaRepo = { find: jest.fn(), findOne: jest.fn() };
const mockClienteRepo = { find: jest.fn(), findOne: jest.fn() };

function makeService(): GroupingService {
  return new GroupingService(mockReglaRepo as any, mockClienteRepo as any);
}

const xmlRenca = `<DTE><Receptor>
  <RUTRecep>77004250-K</RUTRecep>
  <RznSocRecep>Aceros SA</RznSocRecep>
  <CmnaRecep>RENCA</CmnaRecep>
  <DirRecep>Av Test 123</DirRecep>
</Receptor></DTE>`;

const xmlSantiago = `<DTE><Receptor>
  <RUTRecep>78170790-2</RUTRecep>
  <RznSocRecep>Servicios Ltda</RznSocRecep>
  <CmnaRecep>SANTIAGO</CmnaRecep>
</Receptor></DTE>`;

describe('GroupingService', () => {
  let service: GroupingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
  });

  describe('computeAgrupador', () => {
    it('retorna AgrupadorResult correcto cuando cliente tiene regla por_comuna', async () => {
      mockClienteRepo.find.mockResolvedValue([
        { empkey: '977', gclirut: '77004250-K', reglaidl: 'por_comuna' },
      ]);
      mockReglaRepo.find.mockResolvedValue([
        {
          reglaidl: 'por_comuna',
          reglaconfig: { fn: 'extraeTagLista', reglaTags: ['CmnaRecep'] },
        },
      ]);

      const result = await service.computeAgrupador(
        '977',
        '77004250-K',
        xmlRenca,
      );

      expect(result).toEqual({
        guiReglaidl: 'por_comuna',
        guiValorAgrupador: 'RENCA',
      });
    });

    it('retorna null si el cliente no existe en BD', async () => {
      mockClienteRepo.find.mockResolvedValue([]);

      expect(
        await service.computeAgrupador('977', '77004250-K', xmlRenca),
      ).toBeNull();
      expect(mockReglaRepo.find).not.toHaveBeenCalled();
    });

    it('retorna null si el cliente tiene reglaidl null', async () => {
      mockClienteRepo.find.mockResolvedValue([
        { empkey: '977', gclirut: '77004250-K', reglaidl: null },
      ]);

      expect(
        await service.computeAgrupador('977', '77004250-K', xmlRenca),
      ).toBeNull();
      expect(mockReglaRepo.find).not.toHaveBeenCalled();
    });

    it('retorna null si la regla no existe en el catálogo', async () => {
      mockClienteRepo.find.mockResolvedValue([
        { empkey: '977', gclirut: '77004250-K', reglaidl: 'regla_inexistente' },
      ]);
      mockReglaRepo.find.mockResolvedValue([]);

      expect(
        await service.computeAgrupador('977', '77004250-K', xmlRenca),
      ).toBeNull();
    });

    it('retorna null si el tag configurado no existe en el XML', async () => {
      mockClienteRepo.find.mockResolvedValue([
        { empkey: '977', gclirut: '77004250-K', reglaidl: 'por_comuna' },
      ]);
      mockReglaRepo.find.mockResolvedValue([
        {
          reglaidl: 'por_comuna',
          reglaconfig: { fn: 'extraeTagLista', reglaTags: ['TagInexistente'] },
        },
      ]);

      expect(
        await service.computeAgrupador('977', '77004250-K', xmlRenca),
      ).toBeNull();
    });

    it('retorna RznSocRecep con regla por_razon_social', async () => {
      mockClienteRepo.find.mockResolvedValue([
        { empkey: '977', gclirut: '77004250-K', reglaidl: 'por_razon_social' },
      ]);
      mockReglaRepo.find.mockResolvedValue([
        {
          reglaidl: 'por_razon_social',
          reglaconfig: { fn: 'extraeTagLista', reglaTags: ['RznSocRecep'] },
        },
      ]);

      const result = await service.computeAgrupador(
        '977',
        '77004250-K',
        xmlRenca,
      );

      expect(result).toEqual({
        guiReglaidl: 'por_razon_social',
        guiValorAgrupador: 'Aceros SA',
      });
    });

    it('retorna null si fn no está registrado en REGLA_REGISTRY', async () => {
      mockClienteRepo.find.mockResolvedValue([
        { empkey: '977', gclirut: '77004250-K', reglaidl: 'por_algo' },
      ]);
      mockReglaRepo.find.mockResolvedValue([
        {
          reglaidl: 'por_algo',
          reglaconfig: { fn: 'fnDesconocido', reglaTags: ['CmnaRecep'] },
        },
      ]);

      expect(
        await service.computeAgrupador('977', '77004250-K', xmlRenca),
      ).toBeNull();
    });

    it('soporta regla compuesta (múltiples tags concatenados)', async () => {
      mockClienteRepo.find.mockResolvedValue([
        { empkey: '977', gclirut: '77004250-K', reglaidl: 'por_compuesto' },
      ]);
      mockReglaRepo.find.mockResolvedValue([
        {
          reglaidl: 'por_compuesto',
          reglaconfig: {
            fn: 'extraeTagLista',
            reglaTags: ['RznSocRecep', 'DirRecep'],
          },
        },
      ]);

      const result = await service.computeAgrupador(
        '977',
        '77004250-K',
        xmlRenca,
      );

      expect(result).toEqual({
        guiReglaidl: 'por_compuesto',
        guiValorAgrupador: 'Aceros SA;Av Test 123',
      });
    });
  });

  describe('batchComputeAgrupadores', () => {
    it('retorna mapa vacío sin llamar a BD cuando items es vacío', async () => {
      const result = await service.batchComputeAgrupadores('977', []);

      expect(result.size).toBe(0);
      expect(mockClienteRepo.find).not.toHaveBeenCalled();
    });

    it('procesa múltiples ítems en un único batch de BD', async () => {
      mockClienteRepo.find.mockResolvedValue([
        { empkey: '977', gclirut: '77004250-K', reglaidl: 'por_comuna' },
        { empkey: '977', gclirut: '78170790-2', reglaidl: 'por_comuna' },
      ]);
      mockReglaRepo.find.mockResolvedValue([
        {
          reglaidl: 'por_comuna',
          reglaconfig: { fn: 'extraeTagLista', reglaTags: ['CmnaRecep'] },
        },
      ]);

      const result = await service.batchComputeAgrupadores('977', [
        { gclirut: '77004250-K', xml: xmlRenca },
        { gclirut: '78170790-2', xml: xmlSantiago },
      ]);

      expect(result.get('77004250-K')).toEqual({
        guiReglaidl: 'por_comuna',
        guiValorAgrupador: 'RENCA',
      });
      expect(result.get('78170790-2')).toEqual({
        guiReglaidl: 'por_comuna',
        guiValorAgrupador: 'SANTIAGO',
      });
      expect(mockClienteRepo.find).toHaveBeenCalledTimes(1);
      expect(mockReglaRepo.find).toHaveBeenCalledTimes(1);
    });

    it('retorna null para clientes sin reglaidl', async () => {
      mockClienteRepo.find.mockResolvedValue([
        { empkey: '977', gclirut: '77004250-K', reglaidl: null },
      ]);
      mockReglaRepo.find.mockResolvedValue([]);

      const result = await service.batchComputeAgrupadores('977', [
        { gclirut: '77004250-K', xml: xmlRenca },
      ]);

      expect(result.get('77004250-K')).toBeNull();
    });

    it('retorna null para clientes no encontrados en BD', async () => {
      mockClienteRepo.find.mockResolvedValue([]);
      mockReglaRepo.find.mockResolvedValue([]);

      const result = await service.batchComputeAgrupadores('977', [
        { gclirut: '77004250-K', xml: xmlRenca },
      ]);

      expect(result.get('77004250-K')).toBeNull();
    });

    it('mezcla clientes con y sin regla en el mismo batch', async () => {
      mockClienteRepo.find.mockResolvedValue([
        { empkey: '977', gclirut: '77004250-K', reglaidl: 'por_comuna' },
        { empkey: '977', gclirut: '78170790-2', reglaidl: null },
      ]);
      mockReglaRepo.find.mockResolvedValue([
        {
          reglaidl: 'por_comuna',
          reglaconfig: { fn: 'extraeTagLista', reglaTags: ['CmnaRecep'] },
        },
      ]);

      const result = await service.batchComputeAgrupadores('977', [
        { gclirut: '77004250-K', xml: xmlRenca },
        { gclirut: '78170790-2', xml: xmlSantiago },
      ]);

      expect(result.get('77004250-K')).toEqual({
        guiReglaidl: 'por_comuna',
        guiValorAgrupador: 'RENCA',
      });
      expect(result.get('78170790-2')).toBeNull();
    });

    it('no llama a reglaRepo si ningún cliente tiene reglaidl', async () => {
      mockClienteRepo.find.mockResolvedValue([
        { empkey: '977', gclirut: '77004250-K', reglaidl: null },
      ]);

      await service.batchComputeAgrupadores('977', [
        { gclirut: '77004250-K', xml: xmlRenca },
      ]);

      expect(mockReglaRepo.find).not.toHaveBeenCalled();
    });

    // Regla real: extraeReferenciaPorTipo con tiposReferencia ['801', 'HES'].
    // Cuatro guías del mismo cliente, cada una con una combinación distinta de
    // referencias — verifica que el agrupador resultante junta OC+HES entre sí
    // y separa OC-sola y HES-sola en sus propios grupos.
    it('agrupa por combinación real de OC/HES: OC+HES junto, OC sola y HES sola quedan en grupos distintos', async () => {
      const gcliruts = [
        'guia-oc-hes-a',
        'guia-oc-hes-b',
        'guia-solo-oc',
        'guia-solo-hes',
      ];
      mockClienteRepo.find.mockResolvedValue(
        gcliruts.map((gclirut) => ({
          empkey: '977',
          gclirut,
          reglaidl: 'por_oc_hes',
        })),
      );
      mockReglaRepo.find.mockResolvedValue([
        {
          reglaidl: 'por_oc_hes',
          reglaconfig: {
            fn: 'extraeReferenciaPorTipo',
            tiposReferencia: ['801', 'HES'],
          },
        },
      ]);

      const xmlOcHesA = buildGuiaXml({
        referencias: [
          { tipo: '801', folio: '111', fecha: '2026-05-10' },
          { tipo: 'HES', folio: '222', fecha: '2026-05-11' },
        ],
      });
      const xmlOcHesB = buildGuiaXml({
        referencias: [
          { tipo: 'HES', folio: '222', fecha: '2026-05-11' }, // orden invertido en el XML
          { tipo: '801', folio: '111', fecha: '2026-05-10' },
        ],
      });
      const xmlSoloOc = buildGuiaXml({
        referencias: [{ tipo: '801', folio: '111', fecha: '2026-05-10' }],
      });
      const xmlSoloHes = buildGuiaXml({
        referencias: [{ tipo: 'HES', folio: '222', fecha: '2026-05-11' }],
      });

      const result = await service.batchComputeAgrupadores('977', [
        { gclirut: 'guia-oc-hes-a', xml: xmlOcHesA },
        { gclirut: 'guia-oc-hes-b', xml: xmlOcHesB },
        { gclirut: 'guia-solo-oc', xml: xmlSoloOc },
        { gclirut: 'guia-solo-hes', xml: xmlSoloHes },
      ]);

      const valorOcHesA = result.get('guia-oc-hes-a')?.guiValorAgrupador;
      const valorOcHesB = result.get('guia-oc-hes-b')?.guiValorAgrupador;
      const valorSoloOc = result.get('guia-solo-oc')?.guiValorAgrupador;
      const valorSoloHes = result.get('guia-solo-hes')?.guiValorAgrupador;

      // Caso OC+HES: mismo valor sin importar el orden en el XML → mismo grupo.
      expect(valorOcHesA).toBe('111;222');
      expect(valorOcHesB).toBe('111;222');
      // Caso OC sola y caso HES sola: cada uno su propio valor, distinto del combo.
      expect(valorSoloOc).toBe('111');
      expect(valorSoloHes).toBe('222');

      const valores = [valorOcHesA, valorOcHesB, valorSoloOc, valorSoloHes];
      expect(new Set(valores).size).toBe(3); // 3 grupos: {A,B}, {solo OC}, {solo HES}
    });
  });
});
