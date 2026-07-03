import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmpresasService } from './empresas.service.js';
import { Guia } from '../guias/entities/guia.entity.js';
import { Cliente } from '../clientes/entities/cliente.entity.js';
import { GuiasService } from '../guias/guias.service.js';
import { GroupingService } from '../reglas/grouping.service.js';
import { XmlParserService } from '../xml/xml-parser.service.js';
import { ReglasService } from '../reglas/reglas.service.js';

const mockGuiasService = { syncFromReporte: jest.fn() };
const mockGroupingService = { computeAgrupador: jest.fn() };
const mockXmlParserService = { fetchDocument: jest.fn() };
const mockReglasService = { findReglasDisponibles: jest.fn() };

const makeGuia = (
  folio: string,
  gclirut: string,
  fecha: string,
  total: string,
  guireglaidl: string | null = null,
  guivaloragrupador: string | null = null,
): Partial<Guia> => ({
  empkey: '1',
  guitipo: 52,
  guifolio: folio,
  guifechaemision: fecha,
  gclirut,
  guitotneto: '1000',
  guitotexento: '0',
  guitotiva: '190',
  guiotrosimpuestos: '0',
  guitotdoc: total,
  guiestadoregistro: 'RECIBIDO',
  guiestadoacuse: '',
  guiestadoanulacion: '',
  guisuccod: '',
  guiiddoc: '',
  guifilepath: '',
  guiloteidl: '',
  guireglaidl,
  guivaloragrupador,
});

describe('EmpresasService', () => {
  let service: EmpresasService;
  let mockGuiaRepo: { find: jest.Mock; update: jest.Mock };
  let mockClienteRepo: { find: jest.Mock; update: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGuiaRepo = { find: jest.fn(), update: jest.fn() };
    mockClienteRepo = { find: jest.fn(), update: jest.fn(), findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmpresasService,
        { provide: getRepositoryToken(Guia), useValue: mockGuiaRepo },
        { provide: getRepositoryToken(Cliente), useValue: mockClienteRepo },
        { provide: GuiasService, useValue: mockGuiasService },
        { provide: GroupingService, useValue: mockGroupingService },
        { provide: XmlParserService, useValue: mockXmlParserService },
        { provide: ReglasService, useValue: mockReglasService },
      ],
    }).compile();

    service = module.get<EmpresasService>(EmpresasService);
  });

  // ─── sync ───────────────────────────────────────────────────────────────────

  describe('sync', () => {
    it('delega en GuiasService con RUT y rango derivado del período', async () => {
      mockGuiasService.syncFromReporte.mockResolvedValueOnce({ synced: 5, clientesCreated: 0 });

      const result = await service.sync('1', '11111111-1', '2026-05');

      expect(mockGuiasService.syncFromReporte).toHaveBeenCalledWith(
        '1', '11111111-1', '2026-05-01', '2026-05-31',
      );
      expect(result).toEqual({ synced: 5, clientesCreated: 0 });
    });
  });

  // ─── getClientesConGuias ─────────────────────────────────────────────────────

  describe('getClientesConGuias', () => {
    it('retorna [] cuando no hay guías en el período', async () => {
      mockGuiaRepo.find.mockResolvedValueOnce([]);
      expect(await service.getClientesConGuias('1', '2026-05')).toEqual([]);
    });

    it('retorna reglaIdl del campo Cliente directamente', async () => {
      mockGuiaRepo.find.mockResolvedValueOnce([
        makeGuia('100', '22222222-2', '2026-05-10', '1190'),
        makeGuia('101', '22222222-2', '2026-05-15', '2380'),
        makeGuia('102', '33333333-3', '2026-05-20', '595'),
      ]);
      mockClienteRepo.find.mockResolvedValueOnce([
        { gclirut: '22222222-2', gclinom: 'Cliente A', reglaidl: 'por_comuna' },
        { gclirut: '33333333-3', gclinom: 'Cliente B', reglaidl: null },
      ]);

      const result = await service.getClientesConGuias('1', '2026-05');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        rut: '22222222-2', nombre: 'Cliente A',
        cantidadGuias: 2, montoTotal: '3570',
        reglaIdl: 'por_comuna',
      });
      expect(result[1]).toEqual({
        rut: '33333333-3', nombre: 'Cliente B',
        cantidadGuias: 1, montoTotal: '595',
        reglaIdl: null,
      });
    });

    it('usa nombre vacío y reglaIdl null cuando el cliente no existe en BD', async () => {
      mockGuiaRepo.find.mockResolvedValueOnce([makeGuia('100', '22222222-2', '2026-05-10', '1190')]);
      mockClienteRepo.find.mockResolvedValueOnce([]);

      const result = await service.getClientesConGuias('1', '2026-05');
      expect(result[0].nombre).toBe('');
      expect(result[0].reglaIdl).toBeNull();
    });

    it('montoTotal acumula correctamente con BigInt', async () => {
      mockGuiaRepo.find.mockResolvedValueOnce([
        makeGuia('100', '22222222-2', '2026-05-10', '9999999999999'),
        makeGuia('101', '22222222-2', '2026-05-11', '1'),
      ]);
      mockClienteRepo.find.mockResolvedValueOnce([{ gclirut: '22222222-2', gclinom: 'X', reglaidl: null }]);

      const result = await service.getClientesConGuias('1', '2026-05');
      expect(result[0].montoTotal).toBe('10000000000000');
    });
  });

  // ─── getGuiasAgrupadas ───────────────────────────────────────────────────────

  describe('getGuiasAgrupadas', () => {
    it('retorna [] cuando no hay guías', async () => {
      mockGuiaRepo.find.mockResolvedValueOnce([]);
      expect(await service.getGuiasAgrupadas('1', '2026-05')).toEqual([]);
    });

    it('agrupa por valorAgrupador con folios y montos', async () => {
      mockGuiaRepo.find.mockResolvedValueOnce([
        makeGuia('100', '22222222-2', '2026-05-10', '1190', 'por_comuna', 'SANTIAGO'),
        makeGuia('101', '22222222-2', '2026-05-15', '2380', 'por_comuna', 'SANTIAGO'),
      ]);
      mockClienteRepo.find.mockResolvedValueOnce([{ gclirut: '22222222-2', gclinom: 'Cliente A', reglaidl: 'por_comuna' }]);

      const result = await service.getGuiasAgrupadas('1', '2026-05');

      expect(result).toHaveLength(1);
      expect(result[0].cliente).toEqual({ rut: '22222222-2', nombre: 'Cliente A' });
      expect(result[0].grupos).toHaveLength(1);
      expect(result[0].grupos[0]).toEqual({
        valorAgrupador: 'SANTIAGO',
        reglaIdl: 'por_comuna',
        cantidadGuias: 2,
        montoTotal: '3570',
        folios: [
          { folio: '100', fecha: '2026-05-10' },
          { folio: '101', fecha: '2026-05-15' },
        ],
      });
    });

    it('guías sin valorAgrupador van al grupo _sin_regla con reglaIdl null', async () => {
      mockGuiaRepo.find.mockResolvedValueOnce([
        makeGuia('100', '22222222-2', '2026-05-10', '1190', null, null),
        makeGuia('101', '22222222-2', '2026-05-15', '2380', 'por_comuna', 'SANTIAGO'),
      ]);
      mockClienteRepo.find.mockResolvedValueOnce([{ gclirut: '22222222-2', gclinom: 'Cliente A', reglaidl: null }]);

      const result = await service.getGuiasAgrupadas('1', '2026-05');
      const grupos = result[0].grupos;

      expect(grupos).toHaveLength(2);
      const sinRegla = grupos.find(g => g.valorAgrupador === '_sin_regla');
      expect(sinRegla).toBeDefined();
      expect(sinRegla!.reglaIdl).toBeNull();
      expect(sinRegla!.folios).toEqual([{ folio: '100', fecha: '2026-05-10' }]);
    });

    it('todas las guías sin valorAgrupador van a _sin_regla', async () => {
      mockGuiaRepo.find.mockResolvedValueOnce([
        makeGuia('200', '22222222-2', '2026-05-01', '500'),
        makeGuia('201', '22222222-2', '2026-05-02', '600'),
      ]);
      mockClienteRepo.find.mockResolvedValueOnce([{ gclirut: '22222222-2', gclinom: 'X', reglaidl: null }]);

      const result = await service.getGuiasAgrupadas('1', '2026-05');

      expect(result[0].grupos).toHaveLength(1);
      expect(result[0].grupos[0].valorAgrupador).toBe('_sin_regla');
      expect(result[0].grupos[0].cantidadGuias).toBe(2);
    });

    it('filtra por rut cuando se proporciona', async () => {
      mockGuiaRepo.find.mockResolvedValueOnce([makeGuia('100', '22222222-2', '2026-05-10', '1190')]);
      mockClienteRepo.find.mockResolvedValueOnce([{ gclirut: '22222222-2', gclinom: 'Cliente A', reglaidl: null }]);

      await service.getGuiasAgrupadas('1', '2026-05', '22222222-2');

      expect(mockGuiaRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ gclirut: '22222222-2' }) }),
      );
    });

    it('sin rut devuelve todos los clientes con sus grupos', async () => {
      mockGuiaRepo.find.mockResolvedValueOnce([
        makeGuia('100', '22222222-2', '2026-05-10', '1190', 'por_comuna', 'SANTIAGO'),
        makeGuia('200', '33333333-3', '2026-05-10', '595'),
      ]);
      mockClienteRepo.find.mockResolvedValueOnce([
        { gclirut: '22222222-2', gclinom: 'A', reglaidl: 'por_comuna' },
        { gclirut: '33333333-3', gclinom: 'B', reglaidl: null },
      ]);

      const result = await service.getGuiasAgrupadas('1', '2026-05');

      expect(result).toHaveLength(2);
      expect(result.map(r => r.cliente.rut)).toEqual(['22222222-2', '33333333-3']);
    });
  });

  // ─── assignRegla ─────────────────────────────────────────────────────────────

  describe('assignRegla', () => {
    it('actualiza Clientes.reglaidl con formato XML', async () => {
      mockClienteRepo.findOne.mockResolvedValueOnce({ reglaidl: null });
      mockClienteRepo.update.mockResolvedValue(undefined);

      await service.assignRegla('977', '77004250K', 'por_comuna');

      expect(mockClienteRepo.update).toHaveBeenCalledWith(
        { empkey: '977', gclirut: '77004250-K' },
        { reglaidl: 'por_comuna' },
      );
    });

    it('acepta RUT ya en formato XML (idempotente)', async () => {
      mockClienteRepo.findOne.mockResolvedValueOnce({ reglaidl: null });
      mockClienteRepo.update.mockResolvedValue(undefined);

      await service.assignRegla('977', '77004250-K', 'por_comuna');

      expect(mockClienteRepo.update).toHaveBeenCalledWith(
        { empkey: '977', gclirut: '77004250-K' },
        { reglaidl: 'por_comuna' },
      );
    });

    // ── Primera activación ────────────────────────────────────────────────────

    it('primera activación: no recomputa guías existentes', async () => {
      mockClienteRepo.findOne.mockResolvedValueOnce({ reglaidl: null });
      mockClienteRepo.update.mockResolvedValue(undefined);

      await service.assignRegla('977', '77004250K', 'por_comuna');

      expect(mockGuiaRepo.find).not.toHaveBeenCalled();
      expect(mockXmlParserService.fetchDocument).not.toHaveBeenCalled();
    });

    it('primera activación con recomputar=true: sí recomputa guías del período', async () => {
      mockClienteRepo.findOne.mockResolvedValueOnce({ reglaidl: null });
      mockClienteRepo.update.mockResolvedValue(undefined);
      const guia = makeGuia('100', '77004250-K', '2026-05-10', '1190');
      guia.guifilepath = '/ruta/guia100.xml';
      mockGuiaRepo.find.mockResolvedValueOnce([guia]);
      const rawXml = '<DTE><CmnaRecep>SANTIAGO</CmnaRecep></DTE>';
      mockXmlParserService.fetchDocument.mockResolvedValueOnce({
        receptor: { rutReceptor: '77004250-K', cmnaRecep: 'SANTIAGO', razonSocial: 'Empresa', dirRecep: '', cdgIntRecep: '', ciudadRecep: '', giroRecep: '', contacto: '' },
        detalle: [],
        rawXml,
      });
      mockGroupingService.computeAgrupador.mockResolvedValueOnce({
        guiReglaidl: 'por_comuna',
        guiValorAgrupador: 'SANTIAGO',
      });
      mockGuiaRepo.update.mockResolvedValue(undefined);

      await service.assignRegla('977', '77004250K', 'por_comuna', { recomputar: true, periodo: '2026-05' });

      expect(mockGuiaRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ empkey: '977', gclirut: '77004250-K' }) }),
      );
    });

    // ── Cambio de regla + recomputar=true ─────────────────────────────────────

    it('cambio de regla + recomputar=true: recomputa guías del período indicado', async () => {
      mockClienteRepo.findOne.mockResolvedValueOnce({ reglaidl: 'por_ciudad' });
      mockClienteRepo.update.mockResolvedValue(undefined);
      const guia = makeGuia('100', '77004250K', '2026-05-10', '1190');
      guia.guifilepath = '/ruta/guia100.xml';
      mockGuiaRepo.find.mockResolvedValueOnce([guia]);
      const rawXml = '<DTE><CmnaRecep>SANTIAGO</CmnaRecep></DTE>';
      mockXmlParserService.fetchDocument.mockResolvedValueOnce({
        receptor: { rutReceptor: '77004250-K', cmnaRecep: 'SANTIAGO', razonSocial: 'Empresa', dirRecep: '', cdgIntRecep: '', ciudadRecep: '', giroRecep: '', contacto: '' },
        detalle: [],
        rawXml,
      });
      mockGroupingService.computeAgrupador.mockResolvedValueOnce({
        guiReglaidl: 'por_comuna',
        guiValorAgrupador: 'SANTIAGO',
      });
      mockGuiaRepo.update.mockResolvedValue(undefined);

      await service.assignRegla('977', '77004250K', 'por_comuna', { recomputar: true, periodo: '2026-05' });

      expect(mockGuiaRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ empkey: '977', gclirut: '77004250-K' }) }),
      );
      expect(mockXmlParserService.fetchDocument).toHaveBeenCalledWith('/ruta/guia100.xml');
      expect(mockGroupingService.computeAgrupador).toHaveBeenCalledWith('977', '77004250-K', rawXml);
      expect(mockGuiaRepo.update).toHaveBeenCalledWith(
        { empkey: '1', guitipo: 52, guifolio: '100' },
        { guireglaidl: 'por_comuna', guivaloragrupador: 'SANTIAGO' },
      );
    });

    it('cambio de regla + recomputar=true sin periodo: lanza BadRequestException', async () => {
      mockClienteRepo.findOne.mockResolvedValueOnce({ reglaidl: 'por_ciudad' });
      mockClienteRepo.update.mockResolvedValue(undefined);

      await expect(
        service.assignRegla('977', '77004250K', 'por_comuna', { recomputar: true }),
      ).rejects.toThrow('periodo es obligatorio');
    });

    // ── Cambio de regla + recomputar=false ────────────────────────────────────

    it('cambio de regla + recomputar=false: no recomputa guías', async () => {
      mockClienteRepo.findOne.mockResolvedValueOnce({ reglaidl: 'por_ciudad' });
      mockClienteRepo.update.mockResolvedValue(undefined);

      await service.assignRegla('977', '77004250K', 'por_comuna', { recomputar: false });

      expect(mockGuiaRepo.find).not.toHaveBeenCalled();
      expect(mockXmlParserService.fetchDocument).not.toHaveBeenCalled();
    });

    it('cambio de regla sin opciones: no recomputa guías', async () => {
      mockClienteRepo.findOne.mockResolvedValueOnce({ reglaidl: 'por_ciudad' });
      mockClienteRepo.update.mockResolvedValue(undefined);

      await service.assignRegla('977', '77004250K', 'por_comuna');

      expect(mockGuiaRepo.find).not.toHaveBeenCalled();
    });

    it('XML no accesible durante recompute: deja guireglaidl y guivaloragrupador null', async () => {
      mockClienteRepo.findOne.mockResolvedValueOnce({ reglaidl: 'por_ciudad' });
      mockClienteRepo.update.mockResolvedValue(undefined);
      const guia = makeGuia('200', '77004250K', '2026-05-10', '1190');
      guia.guifilepath = '/ruta/inexistente.xml';
      mockGuiaRepo.find.mockResolvedValueOnce([guia]);
      mockXmlParserService.fetchDocument.mockRejectedValueOnce(new Error('ENOENT'));
      mockGuiaRepo.update.mockResolvedValue(undefined);

      await service.assignRegla('977', '77004250K', 'por_comuna', { recomputar: true, periodo: '2026-05' });

      expect(mockGuiaRepo.update).toHaveBeenCalledWith(
        { empkey: '1', guitipo: 52, guifolio: '200' },
        { guireglaidl: null, guivaloragrupador: null },
      );
    });
  });

  // ─── assignModoDetalle ────────────────────────────────────────────────────────

  describe('assignModoDetalle', () => {
    it('normaliza el RUT y actualiza Clientes.modoDetalle', async () => {
      mockClienteRepo.update.mockResolvedValue(undefined);

      await service.assignModoDetalle('977', '77004250K', 'POR_PRODUCTO');

      expect(mockClienteRepo.update).toHaveBeenCalledWith(
        { empkey: '977', gclirut: '77004250-K' },
        { modoDetalle: 'POR_PRODUCTO' },
      );
    });

    it('acepta RUT ya en formato XML (idempotente)', async () => {
      mockClienteRepo.update.mockResolvedValue(undefined);

      await service.assignModoDetalle('977', '77004250-K', 'SG');

      expect(mockClienteRepo.update).toHaveBeenCalledWith(
        { empkey: '977', gclirut: '77004250-K' },
        { modoDetalle: 'SG' },
      );
    });
  });
});
