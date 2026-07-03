import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { FacturasService } from './facturas.service.js';
import { Factura } from '../facturacion/entities/factura.entity.js';
import { Cliente } from '../clientes/entities/cliente.entity.js';
import { Regla } from '../reglas/entities/regla.entity.js';
import { BackofficeAdapterService } from '../backoffice-adapter/backoffice-adapter.service.js';
import { FacturacionService } from '../facturacion/facturacion.service.js';
import { XmlParserService } from '../xml/xml-parser.service.js';

const mockBackofficeAdapterService = { getGuias: jest.fn(), emitirDte: jest.fn() };
const mockFacturacionService = { getGuiasByFactura: jest.fn() };
const mockXmlParserService = { fetchDocument: jest.fn() };

const makeRow = (
  folio: string,
  gclirut: string,
  fecha = '2026-05-10',
  totNeto = '1000',
  totIva = '190',
  totDoc = '1190',
): Record<string, string> => ({
  'Folio': folio,
  'Codigo Tipo': '33',
  'Estado Registro': 'RECIBIDO',
  'Estado Anulacion': '',
  'Fecha Emision': fecha,
  'RUT Cliente': gclirut,
  'Monto Neto': totNeto,
  'Monto Exento': '0',
  'Monto IVA': totIva,
  'Monto Otros Impuestos': '0',
  'Monto Total': totDoc,
  'Link XML': 'http://example.com/doc.xml',
  'Identificador Lote': 'LOTE-1',
});

const makeFactura = (
  gfackey: string,
  fecha: string,
  totDoc: string,
  totNeto = '1000',
  totIva = '190',
  overrides: Partial<Factura> = {},
): Partial<Factura> => ({
  empkey: '1',
  gfackey,
  gfactipo: '33',
  gfacfolio: gfackey,
  gfacestadoregistro: 'RECIBIDO',
  gfacestadoanulacion: '',
  gfacfecha: fecha,
  gclirut: '22222222-2',
  gfactotneto: totNeto,
  gfactotexento: '0',
  gfactotiva: totIva,
  gfactotimpuestos: '0',
  gfactotdoc: totDoc,
  gfacfilepath: '',
  gfacloteidl: '',
  esProforma: false,
  estado: 'BORRADOR',
  reglaidl: null,
  ...overrides,
});

const makeProforma = (
  gfackey: string,
  overrides: Partial<Factura> = {},
): Partial<Factura> =>
  makeFactura(gfackey, '2026-05-20', '5000', '4202', '798', {
    esProforma: true,
    reglaidl: '1_CMNA_SANTIAGO',
    gclirut: '76123456-0',
    estado: 'BORRADOR',
    gfacfolioSii: null,
    gfaclinkPdf: null,
    gfaclinkXml: null,
    rutEmisor: '92176000-0',
    ...overrides,
  });

describe('FacturasService', () => {
  let service: FacturasService;
  let mockFacturaRepo: { find: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let mockClienteRepo: { findOne: jest.Mock };
  let mockReglaRepo: { findOne: jest.Mock };
  let mockDataSource: { query: jest.Mock; transaction: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFacturaRepo = { find: jest.fn(), save: jest.fn(), findOne: jest.fn() };
    mockClienteRepo = { findOne: jest.fn() };
    mockReglaRepo = { findOne: jest.fn() };
    mockDataSource = { query: jest.fn(), transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacturasService,
        { provide: getRepositoryToken(Factura), useValue: mockFacturaRepo },
        { provide: getRepositoryToken(Cliente), useValue: mockClienteRepo },
        { provide: getRepositoryToken(Regla), useValue: mockReglaRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: BackofficeAdapterService, useValue: mockBackofficeAdapterService },
        { provide: FacturacionService, useValue: mockFacturacionService },
        { provide: XmlParserService, useValue: mockXmlParserService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      ],
    }).compile();

    service = module.get<FacturasService>(FacturasService);
  });

  // ─── sync ──────────────────────────────────────────────────────────────────

  describe('sync', () => {
    it('llama a BackofficeAdapterService con tipoDocumento=33 y el RUT recibido', async () => {
      mockBackofficeAdapterService.getGuias.mockResolvedValueOnce([]);

      await service.sync('1', '2026-05', '11111111-1');

      expect(mockBackofficeAdapterService.getGuias).toHaveBeenCalledWith(
        '11111111-1', '2026-05-01', '2026-05-31', 33,
      );
    });

    it('retorna { synced: 0 } y no llama save cuando no hay rows', async () => {
      mockBackofficeAdapterService.getGuias.mockResolvedValueOnce([]);

      const result = await service.sync('1', '2026-05', '11111111-1');

      expect(result).toEqual({ synced: 0 });
      expect(mockFacturaRepo.save).not.toHaveBeenCalled();
    });

    it('mapea correctamente los campos del CSV a la entidad Factura', async () => {
      mockBackofficeAdapterService.getGuias.mockResolvedValueOnce([
        makeRow('500', '22222222-2'),
      ]);
      mockFacturaRepo.save.mockResolvedValueOnce([]);

      await service.sync('1', '2026-05', '11111111-1');

      const saved = mockFacturaRepo.save.mock.calls[0][0] as Factura[];
      expect(saved).toHaveLength(1);
      expect(saved[0].gfackey).toBe('500');
      expect(saved[0].gfactipo).toBe('33');
      expect(saved[0].gfacfecha).toBe('2026-05-10');
      expect(saved[0].gclirut).toBe('22222222-2');
      expect(saved[0].gfactotneto).toBe('1000');
      expect(saved[0].gfactotimpuestos).toBe('0');
      expect(saved[0].gfactotdoc).toBe('1190');
      expect(saved[0].empkey).toBe('1');
      expect(saved[0].esProforma).toBe(false);
    });

    it('retorna { synced: N } con el conteo correcto', async () => {
      mockBackofficeAdapterService.getGuias.mockResolvedValueOnce([
        makeRow('500', '22222222-2'),
        makeRow('501', '33333333-3'),
      ]);
      mockFacturaRepo.save.mockResolvedValueOnce([]);

      const result = await service.sync('1', '2026-05', '11111111-1');
      expect(result).toEqual({ synced: 2 });
    });

    it('filtra rows sin Folio o sin Codigo Tipo', async () => {
      mockBackofficeAdapterService.getGuias.mockResolvedValueOnce([
        { 'Codigo Tipo': '33', 'Fecha Emision': '2026-05-10' }, // sin Folio
        makeRow('501', '33333333-3'),
      ]);
      mockFacturaRepo.save.mockResolvedValueOnce([]);

      const result = await service.sync('1', '2026-05', '11111111-1');
      expect(result.synced).toBe(1);
    });

    it('deriva fechaInicial y fechaFinal correctamente para febrero', async () => {
      mockBackofficeAdapterService.getGuias.mockResolvedValueOnce([]);

      await service.sync('1', '2026-02', '11111111-1');

      expect(mockBackofficeAdapterService.getGuias).toHaveBeenCalledWith(
        '11111111-1', '2026-02-01', '2026-02-28', 33,
      );
    });
  });

  // ─── getFacturasPorPeriodo ──────────────────────────────────────────────────

  describe('getFacturasPorPeriodo', () => {
    it('retorna facturas:[] y totales en cero cuando no hay facturas', async () => {
      mockFacturaRepo.find.mockResolvedValueOnce([]);

      const result = await service.getFacturasPorPeriodo('1', '2026-05');

      expect(result.facturas).toEqual([]);
      expect(result.totales).toEqual({ cantidad: 0, montoNeto: '0', montoIva: '0', montoTotal: '0' });
    });

    it('mapea correctamente los campos de Factura entity a FacturaResumenDto', async () => {
      mockFacturaRepo.find.mockResolvedValueOnce([makeFactura('200', '2026-05-10', '1190')]);

      const result = await service.getFacturasPorPeriodo('1', '2026-05');

      expect(result.facturas[0]).toMatchObject({
        id: '200',
        folio: '200',
        fecha: '2026-05-10',
        rutCliente: '22222222-2',
        totDoc: '1190',
      });
    });

    it('calcula totales con BigInt correctamente sin overflow', async () => {
      mockFacturaRepo.find.mockResolvedValueOnce([
        makeFactura('200', '2026-05-10', '9999999999999', '8403361344538', '1596638655461'),
        makeFactura('201', '2026-05-11', '1', '0', '1'),
      ]);

      const result = await service.getFacturasPorPeriodo('1', '2026-05');

      expect(result.totales.montoTotal).toBe('10000000000000');
    });

    it('cantidad de facturas es correcta en totales', async () => {
      mockFacturaRepo.find.mockResolvedValueOnce([
        makeFactura('200', '2026-05-10', '1190'),
        makeFactura('201', '2026-05-11', '2380'),
        makeFactura('202', '2026-05-12', '595'),
      ]);

      const result = await service.getFacturasPorPeriodo('1', '2026-05');

      expect(result.totales.cantidad).toBe(3);
    });

    it('consulta con Between en gfacfecha usando el rango derivado del periodo', async () => {
      mockFacturaRepo.find.mockResolvedValueOnce([]);

      await service.getFacturasPorPeriodo('1', '2026-05');

      expect(mockFacturaRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ empkey: '1' }),
        }),
      );
    });
  });

  // ─── getGuiasPorFactura ─────────────────────────────────────────────────────

  describe('getGuiasPorFactura', () => {
    it('lanza NotFoundException si la factura no existe', async () => {
      mockFacturaRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.getGuiasPorFactura('1', '999')).rejects.toThrow(NotFoundException);
    });

    it('delega directamente en FacturacionService.getGuiasByFactura', async () => {
      const guias = [{ empkey: '1', gfackey: '200', guitipo: 52, guifolio: '100' }];
      mockFacturaRepo.findOne.mockResolvedValueOnce({ empkey: '1', gfackey: '200' });
      mockFacturacionService.getGuiasByFactura.mockResolvedValueOnce(guias);

      const result = await service.getGuiasPorFactura('1', '200');

      expect(mockFacturacionService.getGuiasByFactura).toHaveBeenCalledWith('1', '200');
      expect(result).toEqual(guias);
    });

    it('retorna [] cuando la factura no tiene guías asociadas', async () => {
      mockFacturaRepo.findOne.mockResolvedValueOnce({ empkey: '1', gfackey: '200' });
      mockFacturacionService.getGuiasByFactura.mockResolvedValueOnce([]);

      const result = await service.getGuiasPorFactura('1', '200');
      expect(result).toEqual([]);
    });
  });

  // ─── generar ───────────────────────────────────────────────────────────────

  describe('generar', () => {
    it('retorna { created:0, skipped:0 } cuando no hay guías disponibles', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // guias vacías

      const result = await service.generar('1', '2026-05', '921760000');

      expect(result).toEqual({ created: 0, skipped: 0 });
    });

    it('crea una proforma por grupo y retorna { created:1, skipped:0 }', async () => {
      // 1ra query: guias con regla
      mockDataSource.query.mockResolvedValueOnce([
        { empkey: '1', guitipo: 52, guifolio: '100', gclirut: '76123456-0',
          guireglaidl: '1_CMNA_STGO', guitotneto: '4202', guitotiva: '798', guitotdoc: '5000' },
      ]);
      // 2da query: verificar BORRADOR existente → 0
      mockDataSource.query.mockResolvedValueOnce([{ count: '0' }]);
      // transaction: folio, INSERT proforma, INSERT facturaguia
      mockDataSource.transaction.mockImplementationOnce(async (cb: any) => {
        const mgr = {
          query: jest.fn()
            .mockResolvedValueOnce([{ max: '0' }])           // folio query
            .mockResolvedValueOnce([{ gfackey: '42' }])      // INSERT proforma RETURNING
            .mockResolvedValueOnce([]),                       // INSERT facturaguia
        };
        return cb(mgr);
      });

      const result = await service.generar('1', '2026-05', '921760000');

      expect(result).toEqual({ created: 1, skipped: 0 });
    });

    it('omite grupos que ya tienen BORRADOR y retorna skipped correcto', async () => {
      // guias con una regla
      mockDataSource.query.mockResolvedValueOnce([
        { empkey: '1', guitipo: 52, guifolio: '100', gclirut: '76123456-0',
          guireglaidl: '1_CMNA_STGO', guitotneto: '4202', guitotiva: '798', guitotdoc: '5000' },
      ]);
      // BORRADOR ya existe → count = 1
      mockDataSource.query.mockResolvedValueOnce([{ count: '1' }]);

      const result = await service.generar('1', '2026-05', '921760000');

      expect(result).toEqual({ created: 0, skipped: 1 });
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('crea N proformas para N grupos distintos', async () => {
      // Dos grupos: mismo cliente, distintas reglas
      mockDataSource.query.mockResolvedValueOnce([
        { empkey: '1', guitipo: 52, guifolio: '100', gclirut: '76123456-0',
          guireglaidl: '1_CMNA_STGO', guitotneto: '1000', guitotiva: '190', guitotdoc: '1190' },
        { empkey: '1', guitipo: 52, guifolio: '101', gclirut: '76123456-0',
          guireglaidl: '1_CMNA_RENCA', guitotneto: '2000', guitotiva: '380', guitotdoc: '2380' },
      ]);
      // Ambos grupos sin BORRADOR
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([{ count: '0' }]);

      mockDataSource.transaction
        .mockImplementationOnce(async (cb: any) =>
          cb({ query: jest.fn()
            .mockResolvedValueOnce([{ max: '0' }])
            .mockResolvedValueOnce([{ gfackey: '42' }])
            .mockResolvedValueOnce([]) }))
        .mockImplementationOnce(async (cb: any) =>
          cb({ query: jest.fn()
            .mockResolvedValueOnce([{ max: '1' }])
            .mockResolvedValueOnce([{ gfackey: '43' }])
            .mockResolvedValueOnce([]) }));

      const result = await service.generar('1', '2026-05', '921760000');

      expect(result).toEqual({ created: 2, skipped: 0 });
    });

    it('crea N proformas cuando el grupo supera MAX_GUIAS_POR_FACTURA', async () => {
      // 50 guías en un solo grupo → 2 proformas (chunk de 40 + chunk de 10)
      const guias50 = Array.from({ length: 50 }, (_, i) => ({
        empkey: '1', guitipo: 52, guifolio: String(100 + i),
        gclirut: '76123456-0', guireglaidl: '1_CMNA_STGO',
        guitotneto: '1000', guitotiva: '190', guitotdoc: '1190',
      }));

      mockDataSource.query
        .mockResolvedValueOnce(guias50)           // guías disponibles
        .mockResolvedValueOnce([{ count: '0' }]); // sin BORRADOR existente

      mockDataSource.transaction
        .mockImplementationOnce(async (cb: any) =>
          cb({ query: jest.fn()
            .mockResolvedValueOnce([{ max: '0' }])
            .mockResolvedValueOnce([{ gfackey: '42' }])
            .mockResolvedValue([]) }),
        )
        .mockImplementationOnce(async (cb: any) =>
          cb({ query: jest.fn()
            .mockResolvedValueOnce([{ max: '1' }])
            .mockResolvedValueOnce([{ gfackey: '43' }])
            .mockResolvedValue([]) }),
        );

      const result = await service.generar('1', '2026-05', '921760000');

      expect(result).toEqual({ created: 2, skipped: 0 });
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(2);
    });

    it('insertProforma incluye rut_emisor en el INSERT con el valor del parámetro', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { empkey: '1', guitipo: 52, guifolio: '100', gclirut: '76123456-0',
          guireglaidl: '1_CMNA_STGO', guitotneto: '4202', guitotiva: '798', guitotdoc: '5000' },
      ]);
      mockDataSource.query.mockResolvedValueOnce([{ count: '0' }]);

      let capturedSql = '';
      let capturedParams: unknown[] = [];
      mockDataSource.transaction.mockImplementationOnce(async (cb: any) => {
        const mgr = {
          query: jest.fn()
            .mockResolvedValueOnce([{ max: '0' }])
            .mockImplementationOnce(async (sql: string, params: unknown[]) => {
              capturedSql = sql;
              capturedParams = params;
              return [{ gfackey: '42' }];
            })
            .mockResolvedValueOnce([]),
        };
        return cb(mgr);
      });

      await service.generar('1', '2026-05', '921760000');

      expect(capturedSql).toContain('rut_emisor');
      expect(capturedParams).toContain('921760000');
    });
  });

  // ─── crearManual ───────────────────────────────────────────────────────────

  describe('crearManual', () => {
    it('lanza ConflictException si ya existe BORRADOR o APROBADA para la combinación', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ count: '1' }]); // existing check

      await expect(
        service.crearManual('1', { periodo: '2026-05', gclirut: '76123456-0', reglaidl: '1_CMNA_STGO' }, '921760000'),
      ).rejects.toThrow(ConflictException);
    });

    it('lanza UnprocessableEntityException si no hay guías disponibles', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])  // no BORRADOR existente
        .mockResolvedValueOnce([]);               // no guías disponibles

      await expect(
        service.crearManual('1', { periodo: '2026-05', gclirut: '76123456-0', reglaidl: '1_CMNA_STGO' }, '921760000'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('crea múltiples proformas si las guías superan el límite y retorna la primera', async () => {
      const guias50 = Array.from({ length: 50 }, (_, i) => ({
        empkey: '1', guitipo: 52, guifolio: String(100 + i),
        gclirut: '76123456-0', guireglaidl: '1_CMNA_STGO',
        guitotneto: '1000', guitotiva: '190', guitotdoc: '1190',
      }));
      const firstProforma = makeProforma('42') as Factura;

      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])  // no conflicto
        .mockResolvedValueOnce(guias50)             // guías disponibles
        .mockResolvedValueOnce([{ cantidad_guias: '40', monto_total: '47600' }]); // buildProformaDto

      mockDataSource.transaction
        .mockImplementationOnce(async (cb: any) =>
          cb({ query: jest.fn()
            .mockResolvedValueOnce([{ max: '0' }])
            .mockResolvedValueOnce([{ gfackey: '42' }])
            .mockResolvedValue([]) }),
        )
        .mockImplementationOnce(async (cb: any) =>
          cb({ query: jest.fn()
            .mockResolvedValueOnce([{ max: '1' }])
            .mockResolvedValueOnce([{ gfackey: '43' }])
            .mockResolvedValue([]) }),
        );

      mockFacturaRepo.findOne.mockResolvedValueOnce(firstProforma);
      mockClienteRepo.findOne.mockResolvedValueOnce({ gclinom: 'CLIENTE TEST' });
      mockReglaRepo.findOne.mockResolvedValueOnce({ regladescripcion: 'SANTIAGO' });

      const result = await service.crearManual('1', {
        periodo: '2026-05',
        gclirut: '76123456-0',
        reglaidl: '1_CMNA_STGO',
      }, '921760000');

      expect(result.id).toBe('42'); // retorna la primera proforma
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(2);
    });

    it('crea la proforma y retorna el ProformaDto en el caso feliz', async () => {
      const proforma = makeProforma('42') as Factura;

      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])  // no conflicto
        .mockResolvedValueOnce([                  // guías disponibles
          { empkey: '1', guitipo: 52, guifolio: '100', gclirut: '76123456-0',
            guireglaidl: '1_CMNA_STGO', guitotneto: '4202', guitotiva: '798', guitotdoc: '5000' },
        ])
        .mockResolvedValueOnce([{ cantidad_guias: '1', monto_total: '5000' }]); // buildProformaDto

      mockDataSource.transaction.mockImplementationOnce(async (cb: any) =>
        cb({ query: jest.fn()
          .mockResolvedValueOnce([{ max: '0' }])
          .mockResolvedValueOnce([{ gfackey: '42' }])
          .mockResolvedValueOnce([]) }),
      );

      mockFacturaRepo.findOne.mockResolvedValueOnce(proforma);
      mockClienteRepo.findOne.mockResolvedValueOnce({ gclinom: 'CLIENTE TEST' });
      mockReglaRepo.findOne.mockResolvedValueOnce({ regladescripcion: 'SANTIAGO' });

      const result = await service.crearManual('1', {
        periodo: '2026-05',
        gclirut: '76123456-0',
        reglaidl: '1_CMNA_STGO',
      }, '921760000');

      expect(result.id).toBe('42');
      expect(result.cliente.nombre).toBe('CLIENTE TEST');
      expect(result.regla.descripcion).toBe('SANTIAGO');
      expect(result.cantidadGuias).toBe(1);
      expect(result.montoTotal).toBe('5000');
      expect(result.estado).toBe('BORRADOR');
    });
  });

  // ─── listarProformas ───────────────────────────────────────────────────────

  describe('listarProformas', () => {
    it('retorna [] cuando no hay proformas', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.listarProformas('1', '2026-05');

      expect(result).toEqual([]);
    });

    it('usa estado BORRADOR por defecto cuando no se pasa estado', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.listarProformas('1', '2026-05');

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['1', 'BORRADOR']),
      );
    });

    it('usa el estado recibido cuando se pasa explícitamente', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.listarProformas('1', '2026-05', 'APROBADA');

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['1', 'APROBADA']),
      );
    });

    it('mapea correctamente las filas a ProformaDto', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          gfackey: '42', gfacfolio: '7', gclirut: '76123456-0',
          reglaidl: '1_CMNA_STGO', estado: 'BORRADOR', gfacfecha: '2026-05-20',
          gclinom: 'FERRETERÍA TEST', regladescripcion: 'SANTIAGO',
          cantidad_guias: '5', monto_total: '15000',
        },
      ]);

      const result = await service.listarProformas('1', '2026-05');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: '42',
        folio: '7',
        cliente: { rut: '76123456-0', nombre: 'FERRETERÍA TEST' },
        regla: { id: '1_CMNA_STGO', descripcion: 'SANTIAGO' },
        cantidadGuias: 5,
        montoTotal: '15000',
        estado: 'BORRADOR',
        fecha: '2026-05-20',
      });
    });
  });

  // ─── aprobar ───────────────────────────────────────────────────────────────

  describe('aprobar', () => {
    it('lanza NotFoundException si la proforma no existe', async () => {
      mockFacturaRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.aprobar('1', '42')).rejects.toThrow(NotFoundException);
    });

    it('lanza UnprocessableEntityException si el estado no es BORRADOR', async () => {
      mockFacturaRepo.findOne.mockResolvedValueOnce(
        makeProforma('42', { estado: 'APROBADA' }) as Factura,
      );

      await expect(service.aprobar('1', '42')).rejects.toThrow(UnprocessableEntityException);
    });

    it('emite el DTE y retorna ProformaDto con estado EMITIDA en el caso feliz', async () => {
      const proforma = makeProforma('42') as Factura;
      mockFacturaRepo.findOne.mockResolvedValueOnce(proforma);
      // 1er save: APROBADA
      mockFacturaRepo.save.mockResolvedValueOnce({ ...proforma, estado: 'APROBADA' });
      // _cargarGuiasParaEmision
      mockDataSource.query.mockResolvedValueOnce([{
        guitipo: 52, guifolio: '100', guitotneto: '4202', guitotiva: '798',
        guitotdoc: '5000', guitotexento: '0', guifechaemision: '2026-05-10', guifilepath: '/path/guia.xml',
      }]);
      // xmlParserService.fetchDocument
      mockXmlParserService.fetchDocument.mockResolvedValueOnce({
        emisor: { rutEmisor: '76407930-2' },
        receptor: { rutReceptor: '78.041.840-0', razonSocial: 'CLIENTE SA', dirRecep: 'DIR', cmnaRecep: 'STGO', ciudadRecep: 'SANTIAGO', giroRecep: 'SERVICIOS' },
      });
      // _resolveModoDetalle
      mockClienteRepo.findOne.mockResolvedValueOnce({ modoDetalle: null });
      // backofficeAdapterService.emitirDte
      mockBackofficeAdapterService.emitirDte.mockResolvedValueOnce({
        FolioDocumento: 999, EstadoEmision: 'EMITIDO',
        LinkVisualizacion: 'http://pdf.link', LinkXML: 'http://xml.link',
      });
      // 2do save: EMITIDA
      mockFacturaRepo.save.mockResolvedValueOnce({ ...proforma, estado: 'EMITIDA', gfacfolioSii: 999 });
      // buildProformaDto
      mockDataSource.query.mockResolvedValueOnce([{ cantidad_guias: '1', monto_total: '5000' }]);
      mockClienteRepo.findOne.mockResolvedValueOnce({ gclinom: 'CLIENTE SA' });
      mockReglaRepo.findOne.mockResolvedValueOnce({ regladescripcion: 'SANTIAGO' });

      const result = await service.aprobar('1', '42');

      expect(mockFacturaRepo.save).toHaveBeenCalledTimes(2);
      // El objeto es mutado in-place: ambas llamadas ven el estado final EMITIDA
      expect(mockFacturaRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ estado: 'EMITIDA', gfacfolioSii: 999, gfaclinkPdf: 'http://pdf.link' }),
      );
      expect(mockBackofficeAdapterService.emitirDte).toHaveBeenCalledWith(
        expect.objectContaining({ RutEmisor: '92176000-0', TransaccionIdL: '1-42' }),
      );
      expect(result.estado).toBe('EMITIDA');
    });

    it('usa la fecha de hoy (no gfacfecha de creación) como FECHA DE DOCUMENTO al emitir, y actualiza gfacfecha', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-01T12:00:00Z'));
      try {
        // proforma creada en mayo, aprobada/emitida en julio (cruzó de mes)
        const proforma = makeProforma('42') as Factura;
        expect(proforma.gfacfecha).toBe('2026-05-20');
        mockFacturaRepo.findOne.mockResolvedValueOnce(proforma);
        mockFacturaRepo.save.mockResolvedValueOnce({ ...proforma, estado: 'APROBADA' });
        mockDataSource.query.mockResolvedValueOnce([{
          guitipo: 52, guifolio: '100', guitotneto: '4202', guitotiva: '798',
          guitotdoc: '5000', guitotexento: '0', guifechaemision: '2026-05-10', guifilepath: '/path/guia.xml',
        }]);
        mockXmlParserService.fetchDocument.mockResolvedValueOnce({
          emisor: { rutEmisor: '76407930-2' },
          receptor: { rutReceptor: '78.041.840-0', razonSocial: 'CLIENTE SA', dirRecep: 'DIR', cmnaRecep: 'STGO', ciudadRecep: 'SANTIAGO', giroRecep: 'SERVICIOS' },
        });
        mockClienteRepo.findOne.mockResolvedValueOnce({ modoDetalle: null });
        mockBackofficeAdapterService.emitirDte.mockResolvedValueOnce({
          FolioDocumento: 999, EstadoEmision: 'EMITIDO',
          LinkVisualizacion: 'http://pdf.link', LinkXML: 'http://xml.link',
        });
        mockFacturaRepo.save.mockResolvedValueOnce({ ...proforma, estado: 'EMITIDA', gfacfolioSii: 999 });
        mockDataSource.query.mockResolvedValueOnce([{ cantidad_guias: '1', monto_total: '5000' }]);
        mockClienteRepo.findOne.mockResolvedValueOnce({ gclinom: 'CLIENTE SA' });
        mockReglaRepo.findOne.mockResolvedValueOnce({ regladescripcion: 'SANTIAGO' });

        await service.aprobar('1', '42');

        const mensajeEnviado = mockBackofficeAdapterService.emitirDte.mock.calls[0][0].Mensaje as string;
        expect(mensajeEnviado).toContain('1:|FECHA DE DOCUMENTO|01/07/2026');
        expect(mensajeEnviado).not.toContain('1:|FECHA DE DOCUMENTO|20/05/2026');
        expect(mockFacturaRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ gfacfecha: '2026-07-01' }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('guarda estado FALLIDA y relanza el error cuando la emisión falla', async () => {
      const proforma = makeProforma('42') as Factura;
      mockFacturaRepo.findOne.mockResolvedValueOnce(proforma);
      mockFacturaRepo.save.mockResolvedValueOnce({ ...proforma, estado: 'APROBADA' });
      mockDataSource.query.mockResolvedValueOnce([{
        guitipo: 52, guifolio: '100', guitotneto: '4202', guitotiva: '798',
        guitotdoc: '5000', guitotexento: '0', guifechaemision: '2026-05-10', guifilepath: '/path/guia.xml',
      }]);
      mockXmlParserService.fetchDocument.mockResolvedValueOnce({
        emisor: { rutEmisor: '76407930-2' },
        receptor: { rutReceptor: '78.041.840-0', razonSocial: 'CLIENTE SA', dirRecep: 'DIR', cmnaRecep: 'STGO', ciudadRecep: 'SANTIAGO', giroRecep: 'SERVICIOS' },
      });
      mockClienteRepo.findOne.mockResolvedValueOnce({ modoDetalle: null });
      mockBackofficeAdapterService.emitirDte.mockRejectedValueOnce(new Error('Error de red'));
      mockFacturaRepo.save.mockResolvedValueOnce({ ...proforma, estado: 'FALLIDA' });

      await expect(service.aprobar('1', '42')).rejects.toThrow('Error de red');

      expect(mockFacturaRepo.save).toHaveBeenNthCalledWith(2, expect.objectContaining({ estado: 'FALLIDA' }));
    });
  });

  // ─── anular ────────────────────────────────────────────────────────────────

  describe('anular', () => {
    it('lanza NotFoundException si la proforma no existe', async () => {
      mockFacturaRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.anular('1', '42')).rejects.toThrow(NotFoundException);
    });

    it('lanza UnprocessableEntityException si el estado es EMITIDA', async () => {
      mockFacturaRepo.findOne.mockResolvedValueOnce(
        makeProforma('42', { estado: 'EMITIDA' }) as Factura,
      );

      await expect(service.anular('1', '42')).rejects.toThrow(UnprocessableEntityException);
    });

    it('lanza UnprocessableEntityException si el estado es ANULADA', async () => {
      mockFacturaRepo.findOne.mockResolvedValueOnce(
        makeProforma('42', { estado: 'ANULADA' }) as Factura,
      );

      await expect(service.anular('1', '42')).rejects.toThrow(UnprocessableEntityException);
    });

    it('elimina facturaguias, cambia estado a ANULADA y retorna ProformaDto', async () => {
      const proforma = makeProforma('42') as Factura;
      mockFacturaRepo.findOne.mockResolvedValueOnce(proforma);
      mockDataSource.query
        .mockResolvedValueOnce([])                                              // DELETE facturaguias
        .mockResolvedValueOnce([{ cantidad_guias: '0', monto_total: '0' }]);   // buildProformaDto
      mockFacturaRepo.save.mockResolvedValueOnce({ ...proforma, estado: 'ANULADA' });
      mockClienteRepo.findOne.mockResolvedValueOnce({ gclinom: 'CLIENTE' });
      mockReglaRepo.findOne.mockResolvedValueOnce({ regladescripcion: 'SANTIAGO' });

      const result = await service.anular('1', '42');

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM gde.facturaguias'),
        ['1', '42'],
      );
      expect(mockFacturaRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ estado: 'ANULADA' }),
      );
      expect(result.estado).toBe('ANULADA');
    });

    it('permite anular desde estado APROBADA', async () => {
      const proforma = makeProforma('42', { estado: 'APROBADA' }) as Factura;
      mockFacturaRepo.findOne.mockResolvedValueOnce(proforma);
      mockDataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ cantidad_guias: '0', monto_total: '0' }]);
      mockFacturaRepo.save.mockResolvedValueOnce({ ...proforma, estado: 'ANULADA' });
      mockClienteRepo.findOne.mockResolvedValueOnce(null);
      mockReglaRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.anular('1', '42')).resolves.not.toThrow();
    });
  });

  // ─── limpiar ───────────────────────────────────────────────────────────────

  describe('limpiar', () => {
    it('retorna { anuladas: 0 } cuando no hay BORRADORs en el período', async () => {
      mockFacturaRepo.find.mockResolvedValueOnce([]);

      const result = await service.limpiar('1', '2026-05');

      expect(result).toEqual({ anuladas: 0 });
      expect(mockFacturaRepo.save).not.toHaveBeenCalled();
    });

    it('anula todos los BORRADORs y libera sus guías', async () => {
      const proformas = [
        makeProforma('42') as Factura,
        makeProforma('43', { gfackey: '43' }) as Factura,
      ];
      mockFacturaRepo.find.mockResolvedValueOnce(proformas);
      mockDataSource.query.mockResolvedValue([]); // DELETE facturaguias (x2)
      mockFacturaRepo.save.mockResolvedValueOnce([]);

      const result = await service.limpiar('1', '2026-05');

      expect(result).toEqual({ anuladas: 2 });
      expect(mockDataSource.query).toHaveBeenCalledTimes(2);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM gde.facturaguias'),
        expect.any(Array),
      );
      expect(mockFacturaRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ estado: 'ANULADA' }),
        ]),
      );
    });

    it('retorna { anuladas: N } con el conteo correcto', async () => {
      const proformas = Array.from({ length: 5 }, (_, i) =>
        makeProforma(String(100 + i), { gfackey: String(100 + i) }) as Factura,
      );
      mockFacturaRepo.find.mockResolvedValueOnce(proformas);
      mockDataSource.query.mockResolvedValue([]);
      mockFacturaRepo.save.mockResolvedValueOnce([]);

      const result = await service.limpiar('1', '2026-05');

      expect(result.anuladas).toBe(5);
    });
  });

  // ─── emitirPendientes ───────────────────────────────────────────────────────

  describe('emitirPendientes', () => {
    const mockGuias = [{
      guitipo: 52, guifolio: '100', guitotneto: '4202', guitotiva: '798',
      guitotdoc: '5000', guitotexento: '0', guifechaemision: '2026-05-10', guifilepath: '/path/guia.xml',
    }];
    const mockEmisorReceptor = {
      emisor: { rutEmisor: '76407930-2' },
      receptor: { rutReceptor: '78.041.840-0', razonSocial: 'CLIENTE SA', dirRecep: 'DIR', cmnaRecep: 'STGO', ciudadRecep: 'SANTIAGO', giroRecep: 'SERVICIOS' },
    };
    const mockResultadoDTE = {
      FolioDocumento: 999, EstadoEmision: 'EMITIDO',
      LinkVisualizacion: 'http://pdf.link', LinkXML: 'http://xml.link',
    };

    it('retorna { emitidas:0, fallidas:0, detalle:[] } cuando no hay pendientes', async () => {
      mockFacturaRepo.find.mockResolvedValueOnce([]);

      const result = await service.emitirPendientes('1');

      expect(result).toEqual({ emitidas: 0, fallidas: 0, detalle: [] });
    });

    it('emite todas las FALLIDAS y retorna el conteo correcto', async () => {
      const f1 = makeProforma('10', { estado: 'FALLIDA' }) as Factura;
      const f2 = makeProforma('11', { estado: 'FALLIDA' }) as Factura;
      mockFacturaRepo.find.mockResolvedValueOnce([f1, f2]);
      // f1
      mockDataSource.query.mockResolvedValueOnce(mockGuias);
      mockXmlParserService.fetchDocument.mockResolvedValueOnce(mockEmisorReceptor);
      mockClienteRepo.findOne.mockResolvedValueOnce({ modoDetalle: null });
      mockBackofficeAdapterService.emitirDte.mockResolvedValueOnce(mockResultadoDTE);
      mockFacturaRepo.save.mockResolvedValueOnce({ ...f1, estado: 'EMITIDA' });
      // f2
      mockDataSource.query.mockResolvedValueOnce(mockGuias);
      mockXmlParserService.fetchDocument.mockResolvedValueOnce(mockEmisorReceptor);
      mockClienteRepo.findOne.mockResolvedValueOnce({ modoDetalle: null });
      mockBackofficeAdapterService.emitirDte.mockResolvedValueOnce({ ...mockResultadoDTE, FolioDocumento: 1000 });
      mockFacturaRepo.save.mockResolvedValueOnce({ ...f2, estado: 'EMITIDA' });

      const result = await service.emitirPendientes('1');

      expect(result).toEqual({ emitidas: 2, fallidas: 0, detalle: [] });
      expect(mockFacturaRepo.save).toHaveBeenCalledTimes(2);
    });

    it('acumula en detalle las que fallan y sigue con el resto', async () => {
      const f1 = makeProforma('10', { estado: 'FALLIDA' }) as Factura;
      const f2 = makeProforma('11', { estado: 'FALLIDA' }) as Factura;
      mockFacturaRepo.find.mockResolvedValueOnce([f1, f2]);
      // f1 falla
      mockDataSource.query.mockResolvedValueOnce(mockGuias);
      mockXmlParserService.fetchDocument.mockResolvedValueOnce(mockEmisorReceptor);
      mockClienteRepo.findOne.mockResolvedValueOnce({ modoDetalle: null });
      mockBackofficeAdapterService.emitirDte.mockRejectedValueOnce(new Error('Timeout'));
      // f2 OK
      mockDataSource.query.mockResolvedValueOnce(mockGuias);
      mockXmlParserService.fetchDocument.mockResolvedValueOnce(mockEmisorReceptor);
      mockClienteRepo.findOne.mockResolvedValueOnce({ modoDetalle: null });
      mockBackofficeAdapterService.emitirDte.mockResolvedValueOnce(mockResultadoDTE);
      mockFacturaRepo.save.mockResolvedValueOnce({ ...f2, estado: 'EMITIDA' });

      const result = await service.emitirPendientes('1');

      expect(result.emitidas).toBe(1);
      expect(result.fallidas).toBe(1);
      expect(result.detalle).toEqual([{ gfackey: '10', error: 'Timeout' }]);
    });

    it('busca facturas con estado FALLIDA y esProforma=true del empkey correcto', async () => {
      mockFacturaRepo.find.mockResolvedValueOnce([]);

      await service.emitirPendientes('5');

      expect(mockFacturaRepo.find).toHaveBeenCalledWith({
        where: { empkey: '5', esProforma: true, estado: 'FALLIDA' },
      });
    });
  });

  // ─── aprobar — Modo Por Producto ────────────────────────────────────────────

  describe('aprobar — Modo Por Producto', () => {
    const mockGuiasDosFilas = [
      { guitipo: 52, guifolio: '100', guitotneto: '2000', guitotiva: '380', guitotdoc: '2380', guitotexento: '0', guifechaemision: '2026-05-10', guifilepath: '/path/guia100.xml' },
      { guitipo: 52, guifolio: '101', guitotneto: '3000', guitotiva: '570', guitotdoc: '3570', guitotexento: '0', guifechaemision: '2026-05-11', guifilepath: '/path/guia101.xml' },
    ];
    const mockReceptor = { rutReceptor: '78.041.840-0', razonSocial: 'CLIENTE SA', dirRecep: 'DIR', cmnaRecep: 'STGO', ciudadRecep: 'SANTIAGO', giroRecep: 'SERVICIOS' };

    it('cuando cliente.modoDetalle=POR_PRODUCTO, hace fetchDocument de todas las guías y genera líneas agrupadas por producto', async () => {
      const proforma = makeProforma('42') as Factura;
      mockFacturaRepo.findOne.mockResolvedValueOnce(proforma);
      mockFacturaRepo.save.mockResolvedValueOnce({ ...proforma, estado: 'APROBADA' });
      mockDataSource.query.mockResolvedValueOnce(mockGuiasDosFilas);
      mockXmlParserService.fetchDocument.mockResolvedValueOnce({
        emisor: { rutEmisor: '76407930-2' },
        receptor: mockReceptor,
        detalle: [{ nmbItem: 'PRODUCTO A', qtyItem: '2', prcItem: '1000', codigo: 'COD-1', indExe: '0', montoItem: '2000' }],
      });
      mockClienteRepo.findOne.mockResolvedValueOnce({ modoDetalle: 'POR_PRODUCTO' });
      mockXmlParserService.fetchDocument.mockResolvedValueOnce({
        detalle: [{ nmbItem: 'PRODUCTO A', qtyItem: '3', prcItem: '1000', codigo: 'COD-1', indExe: '0', montoItem: '3000' }],
      });
      mockBackofficeAdapterService.emitirDte.mockResolvedValueOnce({
        FolioDocumento: 999, EstadoEmision: 'EMITIDO', LinkVisualizacion: 'http://pdf.link', LinkXML: 'http://xml.link',
      });
      mockFacturaRepo.save.mockResolvedValueOnce({ ...proforma, estado: 'EMITIDA', gfacfolioSii: 999 });
      mockDataSource.query.mockResolvedValueOnce([{ cantidad_guias: '2', monto_total: '5950' }]);
      mockClienteRepo.findOne.mockResolvedValueOnce({ gclinom: 'CLIENTE SA' });
      mockReglaRepo.findOne.mockResolvedValueOnce({ regladescripcion: 'SANTIAGO' });

      await service.aprobar('1', '42');

      expect(mockXmlParserService.fetchDocument).toHaveBeenCalledTimes(2);
      const mensaje = mockBackofficeAdapterService.emitirDte.mock.calls[0][0].Mensaje as string;
      expect(mensaje).toContain('3:|1|AFECTO|PRODUCTO A (COD-1)|5|1000|0|5000');
    });

    it('cuando cliente.modoDetalle=SG o cliente=null, NO hace fetch adicional (solo 1 fetchDocument aunque haya 2+ guías)', async () => {
      const proforma = makeProforma('42') as Factura;
      mockFacturaRepo.findOne.mockResolvedValueOnce(proforma);
      mockFacturaRepo.save.mockResolvedValueOnce({ ...proforma, estado: 'APROBADA' });
      mockDataSource.query.mockResolvedValueOnce(mockGuiasDosFilas);
      mockXmlParserService.fetchDocument.mockResolvedValueOnce({
        emisor: { rutEmisor: '76407930-2' },
        receptor: mockReceptor,
        detalle: [],
      });
      mockClienteRepo.findOne.mockResolvedValueOnce(null);
      mockBackofficeAdapterService.emitirDte.mockResolvedValueOnce({
        FolioDocumento: 999, EstadoEmision: 'EMITIDO', LinkVisualizacion: 'http://pdf.link', LinkXML: 'http://xml.link',
      });
      mockFacturaRepo.save.mockResolvedValueOnce({ ...proforma, estado: 'EMITIDA', gfacfolioSii: 999 });
      mockDataSource.query.mockResolvedValueOnce([{ cantidad_guias: '2', monto_total: '5950' }]);
      mockClienteRepo.findOne.mockResolvedValueOnce({ gclinom: 'CLIENTE SA' });
      mockReglaRepo.findOne.mockResolvedValueOnce({ regladescripcion: 'SANTIAGO' });

      await service.aprobar('1', '42');

      expect(mockXmlParserService.fetchDocument).toHaveBeenCalledTimes(1);
    });

  });

  // ─── aprobar — Precio Variable ──────────────────────────────────────────────

  describe('aprobar — Precio Variable', () => {
    const mockGuiasDosFilas = [
      { guitipo: 52, guifolio: '100', guitotneto: '2000', guitotiva: '380', guitotdoc: '2380', guitotexento: '0', guifechaemision: '2026-05-10', guifilepath: '/path/guia100.xml' },
      { guitipo: 52, guifolio: '101', guitotneto: '3000', guitotiva: '570', guitotdoc: '3570', guitotexento: '0', guifechaemision: '2026-05-11', guifilepath: '/path/guia101.xml' },
    ];
    const mockReceptor = { rutReceptor: '78.041.840-0', razonSocial: 'CLIENTE SA', dirRecep: 'DIR', cmnaRecep: 'STGO', ciudadRecep: 'SANTIAGO', giroRecep: 'SERVICIOS' };

    it('genera una línea por tramo cuando el mismo producto cambia de precio entre guías, y no falla', async () => {
      const proforma = makeProforma('42') as Factura;
      mockFacturaRepo.findOne.mockResolvedValueOnce(proforma);
      mockFacturaRepo.save.mockResolvedValueOnce({ ...proforma, estado: 'APROBADA' });
      mockDataSource.query.mockResolvedValueOnce(mockGuiasDosFilas);
      mockXmlParserService.fetchDocument.mockResolvedValueOnce({
        emisor: { rutEmisor: '76407930-2' },
        receptor: mockReceptor,
        detalle: [{ nmbItem: 'DIESEL', qtyItem: '10', prcItem: '800', codigo: 'COD-1', indExe: '0', montoItem: '8000' }],
      });
      mockClienteRepo.findOne.mockResolvedValueOnce({ modoDetalle: 'POR_PRODUCTO' });
      mockXmlParserService.fetchDocument.mockResolvedValueOnce({
        detalle: [{ nmbItem: 'DIESEL', qtyItem: '5', prcItem: '900', codigo: 'COD-1', indExe: '0', montoItem: '4500' }],
      });
      mockBackofficeAdapterService.emitirDte.mockResolvedValueOnce({
        FolioDocumento: 999, EstadoEmision: 'EMITIDO', LinkVisualizacion: 'http://pdf.link', LinkXML: 'http://xml.link',
      });
      mockFacturaRepo.save.mockResolvedValueOnce({ ...proforma, estado: 'EMITIDA', gfacfolioSii: 999 });
      mockDataSource.query.mockResolvedValueOnce([{ cantidad_guias: '2', monto_total: '5950' }]);
      mockClienteRepo.findOne.mockResolvedValueOnce({ gclinom: 'CLIENTE SA' });
      mockReglaRepo.findOne.mockResolvedValueOnce({ regladescripcion: 'SANTIAGO' });

      const result = await service.aprobar('1', '42');

      const mensaje = mockBackofficeAdapterService.emitirDte.mock.calls[0][0].Mensaje as string;
      const lineasDetalle = mensaje.split('\r\n').filter(l => l.startsWith('3:|'));
      expect(lineasDetalle).toHaveLength(2);
      expect(lineasDetalle[0]).toBe('3:|1|AFECTO|DIESEL (10-05-2026 al 10-05-2026)|10|800|0|8000');
      expect(lineasDetalle[1]).toBe('3:|2|AFECTO|DIESEL (11-05-2026 al 11-05-2026)|5|900|0|4500');
      expect(result.estado).toBe('EMITIDA');
    });
  });

  // ─── previewMensaje ──────────────────────────────────────────────────────────

  describe('previewMensaje', () => {
    it('lanza NotFoundException si la proforma no existe', async () => {
      mockFacturaRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.previewMensaje('1', '42')).rejects.toThrow(NotFoundException);
    });

    it('devuelve MensajeResult usando fetchDocument de la primera guía', async () => {
      const proforma = makeProforma('42') as Factura;
      mockFacturaRepo.findOne.mockResolvedValueOnce(proforma);
      mockDataSource.query.mockResolvedValueOnce([{
        guitipo: 52, guifolio: '100', guitotneto: '4202', guitotiva: '798',
        guitotdoc: '5000', guitotexento: '0', guifechaemision: '2026-05-10', guifilepath: '/path/guia.xml',
      }]);
      mockXmlParserService.fetchDocument.mockResolvedValueOnce({
        receptor: { rutReceptor: '78.041.840-0', razonSocial: 'CLIENTE SA', dirRecep: 'DIR', cmnaRecep: 'STGO', ciudadRecep: 'SANTIAGO', giroRecep: 'SERVICIOS' },
        detalle: [],
      });
      mockClienteRepo.findOne.mockResolvedValueOnce({ modoDetalle: null });

      const result = await service.previewMensaje('1', '42');

      expect(result.mensaje).toContain('Facturación según guías período');
    });
  });

  describe('previewMensaje — Modo Por Producto', () => {
    it('modoDetalle=POR_PRODUCTO genera líneas agrupadas por producto sin persistir cambios', async () => {
      const proforma = makeProforma('42') as Factura;
      mockFacturaRepo.findOne.mockResolvedValueOnce(proforma);
      mockDataSource.query.mockResolvedValueOnce([
        { guitipo: 52, guifolio: '100', guitotneto: '2000', guitotiva: '380', guitotdoc: '2380', guitotexento: '0', guifechaemision: '2026-05-10', guifilepath: '/path/guia100.xml' },
        { guitipo: 52, guifolio: '101', guitotneto: '3000', guitotiva: '570', guitotdoc: '3570', guitotexento: '0', guifechaemision: '2026-05-11', guifilepath: '/path/guia101.xml' },
      ]);
      mockXmlParserService.fetchDocument.mockResolvedValueOnce({
        receptor: { rutReceptor: '78.041.840-0', razonSocial: 'CLIENTE SA', dirRecep: 'DIR', cmnaRecep: 'STGO', ciudadRecep: 'SANTIAGO', giroRecep: 'SERVICIOS' },
        detalle: [{ nmbItem: 'PRODUCTO A', qtyItem: '2', prcItem: '1000', codigo: 'COD-1', indExe: '0', montoItem: '2000' }],
      });
      mockClienteRepo.findOne.mockResolvedValueOnce({ modoDetalle: 'POR_PRODUCTO' });
      mockXmlParserService.fetchDocument.mockResolvedValueOnce({
        detalle: [{ nmbItem: 'PRODUCTO A', qtyItem: '3', prcItem: '1000', codigo: 'COD-1', indExe: '0', montoItem: '3000' }],
      });

      const result = await service.previewMensaje('1', '42');

      expect(mockXmlParserService.fetchDocument).toHaveBeenCalledTimes(2);
      expect(result.mensaje).toContain('3:|1|AFECTO|PRODUCTO A (COD-1)|5|1000|0|5000');
      expect(mockFacturaRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('previewMensaje — Precio Variable', () => {
    it('modoDetalle=POR_PRODUCTO con precio variable genera líneas por tramo sin persistir cambios', async () => {
      const proforma = makeProforma('42') as Factura;
      mockFacturaRepo.findOne.mockResolvedValueOnce(proforma);
      mockDataSource.query.mockResolvedValueOnce([
        { guitipo: 52, guifolio: '100', guitotneto: '2000', guitotiva: '380', guitotdoc: '2380', guitotexento: '0', guifechaemision: '2026-05-10', guifilepath: '/path/guia100.xml' },
        { guitipo: 52, guifolio: '101', guitotneto: '3000', guitotiva: '570', guitotdoc: '3570', guitotexento: '0', guifechaemision: '2026-05-11', guifilepath: '/path/guia101.xml' },
      ]);
      mockXmlParserService.fetchDocument.mockResolvedValueOnce({
        receptor: { rutReceptor: '78.041.840-0', razonSocial: 'CLIENTE SA', dirRecep: 'DIR', cmnaRecep: 'STGO', ciudadRecep: 'SANTIAGO', giroRecep: 'SERVICIOS' },
        detalle: [{ nmbItem: 'DIESEL', qtyItem: '10', prcItem: '800', codigo: 'COD-1', indExe: '0', montoItem: '8000' }],
      });
      mockClienteRepo.findOne.mockResolvedValueOnce({ modoDetalle: 'POR_PRODUCTO' });
      mockXmlParserService.fetchDocument.mockResolvedValueOnce({
        detalle: [{ nmbItem: 'DIESEL', qtyItem: '5', prcItem: '900', codigo: 'COD-1', indExe: '0', montoItem: '4500' }],
      });

      const result = await service.previewMensaje('1', '42');

      const lineasDetalle = result.mensaje.split('\r\n').filter(l => l.startsWith('3:|'));
      expect(lineasDetalle).toHaveLength(2);
      expect(lineasDetalle[0]).toBe('3:|1|AFECTO|DIESEL (10-05-2026 al 10-05-2026)|10|800|0|8000');
      expect(lineasDetalle[1]).toBe('3:|2|AFECTO|DIESEL (11-05-2026 al 11-05-2026)|5|900|0|4500');
      expect(mockFacturaRepo.save).not.toHaveBeenCalled();
    });
  });
});
