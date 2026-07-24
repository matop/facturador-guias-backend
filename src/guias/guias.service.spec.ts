import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GuiasService } from './guias.service.js';
import { Guia } from './entities/guia.entity.js';
import { GuiaImpuesto } from './entities/guia-impuesto.entity.js';
import { BackofficeAdapterService } from '../backoffice-adapter/backoffice-adapter.service.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { XmlParserService } from '../xml/xml-parser.service.js';
import { GroupingService } from '../reglas/grouping.service.js';

const mockBackofficeAdapter = { getGuias: jest.fn() };
const mockClientesService = { findOrCreateBatch: jest.fn() };
const mockXmlParser = { fetchDocument: jest.fn() };
const mockGroupingService = {
  batchComputeAgrupadores: jest.fn().mockResolvedValue(new Map()),
};

// Manager capturado por cada test que ejecuta la transacción
let mockManager: {
  save: jest.Mock;
  update: jest.Mock;
  createQueryBuilder: jest.Mock;
};
let mockQbExecute: jest.Mock;

const mockDataSource = {
  transaction: jest
    .fn()
    .mockImplementation(
      async (cb: (m: typeof mockManager) => Promise<void>) => {
        mockQbExecute = jest.fn().mockResolvedValue(undefined);
        const mockQb = {
          insert: jest.fn().mockReturnThis(),
          into: jest.fn().mockReturnThis(),
          values: jest.fn().mockReturnThis(),
          orIgnore: jest.fn().mockReturnThis(),
          execute: mockQbExecute,
        };
        mockManager = {
          save: jest
            .fn()
            .mockImplementation(
              (_EntityClass: unknown, entities: unknown) => entities,
            ),
          update: jest.fn().mockResolvedValue(undefined),
          createQueryBuilder: jest.fn().mockReturnValue(mockQb),
        };
        return cb(mockManager);
      },
    ),
};

const makeRow = (
  folio: string,
  gclirut: string,
  filePath = 'http://xml/dte.xml',
) => ({
  Folio: folio,
  'Codigo Tipo': '52',
  'Estado Registro': 'RECIBIDO',
  'Estado Acuse Mercaderia': '',
  'Estado Anulacion': '',
  'Codigo Sucursal': '',
  'Fecha Emision': '2026-05-01',
  'RUT Cliente': gclirut,
  'Monto Neto': '1000',
  'Monto Exento': '0',
  'Monto IVA': '190',
  'Monto Otros Impuestos': '0',
  'Monto Total': '1190',
  'Identificador Documento': '',
  'Link XML': filePath,
  'Identificador Lote': '',
});

const PARSED_DOC = {
  rawXml: '<DTE></DTE>',
  emisor: {
    rutEmisor: '11111111-1',
    razonSocial: 'Emisor SA',
    giro: 'Giro',
    telefono: '',
    acteco: '',
  },
  receptor: {
    rutReceptor: '22222222-2',
    razonSocial: 'Receptor Ltda',
    cdgIntRecep: '',
    contacto: '',
    dirRecep: '',
    cmnaRecep: 'SANTIAGO',
    ciudadRecep: '',
    giroRecep: '',
  },
};

describe('GuiasService — syncFromReporte orchestration', () => {
  let service: GuiasService;
  let mockRepo: {
    save: jest.Mock;
    update: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let mockImpuestoRepo: { save: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRepo = {
      save: jest.fn().mockImplementation((g: Guia) => g),
      update: jest.fn().mockResolvedValue(undefined),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    mockImpuestoRepo = { save: jest.fn().mockResolvedValue([]) };
    mockXmlParser.fetchDocument.mockResolvedValue(PARSED_DOC);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuiasService,
        { provide: getRepositoryToken(Guia), useValue: mockRepo },
        {
          provide: getRepositoryToken(GuiaImpuesto),
          useValue: mockImpuestoRepo,
        },
        { provide: DataSource, useValue: mockDataSource },
        { provide: BackofficeAdapterService, useValue: mockBackofficeAdapter },
        { provide: ClientesService, useValue: mockClientesService },
        { provide: XmlParserService, useValue: mockXmlParser },
        { provide: GroupingService, useValue: mockGroupingService },
      ],
    }).compile();

    service = module.get<GuiasService>(GuiasService);
  });

  it('retorna synced:0 y no hace fetches cuando no hay rows', async () => {
    mockBackofficeAdapter.getGuias.mockResolvedValueOnce([]);

    const result = await service.syncFromReporte(
      '1',
      '11111111-1',
      '2026-01-01',
      '2026-01-31',
    );

    expect(result.synced).toBe(0);
    expect(mockXmlParser.fetchDocument).not.toHaveBeenCalled();
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('hace un fetch por cada cliente único — en paralelo dentro de cada chunk', async () => {
    const rows = [
      makeRow('100', '22222222-2', 'http://xml/100.xml'),
      makeRow('101', '33333333-3', 'http://xml/101.xml'),
    ];
    mockBackofficeAdapter.getGuias.mockResolvedValueOnce(rows);
    mockClientesService.findOrCreateBatch.mockResolvedValueOnce({
      clientes: [],
      created: 2,
    });

    await service.syncFromReporte(
      '1',
      '11111111-1',
      '2026-01-01',
      '2026-01-31',
    );

    expect(mockXmlParser.fetchDocument).toHaveBeenCalledTimes(2);
    expect(mockXmlParser.fetchDocument).toHaveBeenCalledWith(
      'http://xml/100.xml',
    );
    expect(mockXmlParser.fetchDocument).toHaveBeenCalledWith(
      'http://xml/101.xml',
    );
  });

  it('deduplica clientes — no hace fetch duplicado para el mismo RUT', async () => {
    const rows = [
      makeRow('100', '22222222-2', 'http://xml/100.xml'),
      makeRow('101', '22222222-2', 'http://xml/101.xml'),
    ];
    mockBackofficeAdapter.getGuias.mockResolvedValueOnce(rows);
    mockClientesService.findOrCreateBatch.mockResolvedValueOnce({
      clientes: [],
      created: 1,
    });

    await service.syncFromReporte(
      '1',
      '11111111-1',
      '2026-01-01',
      '2026-01-31',
    );

    expect(mockXmlParser.fetchDocument).toHaveBeenCalledTimes(1);
    expect(mockClientesService.findOrCreateBatch).toHaveBeenCalledTimes(1);
  });

  it('incluye synced y clientesCreated en el resultado', async () => {
    mockBackofficeAdapter.getGuias.mockResolvedValueOnce([
      makeRow('100', '22222222-2'),
    ]);
    mockClientesService.findOrCreateBatch.mockResolvedValueOnce({
      clientes: [],
      created: 1,
    });

    const result = await service.syncFromReporte(
      '1',
      '11111111-1',
      '2026-01-01',
      '2026-01-31',
    );

    expect(result).toMatchObject({ synced: 1, clientesCreated: 1 });
  });

  it('ejecuta Fase 2 dentro de una transacción (todo o nada)', async () => {
    mockBackofficeAdapter.getGuias.mockResolvedValueOnce([
      makeRow('100', '22222222-2'),
    ]);
    mockClientesService.findOrCreateBatch.mockResolvedValueOnce({
      clientes: [],
      created: 0,
    });

    await service.syncFromReporte(
      '1',
      '11111111-1',
      '2026-01-01',
      '2026-01-31',
    );

    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('guarda guías y un GuiaImpuesto (IVA cod=14) vía el manager de transacción', async () => {
    mockBackofficeAdapter.getGuias.mockResolvedValueOnce([
      makeRow('100', '22222222-2'),
    ]);
    mockClientesService.findOrCreateBatch.mockResolvedValueOnce({
      clientes: [],
      created: 0,
    });

    await service.syncFromReporte(
      '1',
      '11111111-1',
      '2026-01-01',
      '2026-01-31',
    );

    // Primer save: Guia[]
    expect(mockManager.save).toHaveBeenCalledWith(
      Guia,
      expect.arrayContaining([
        expect.objectContaining({ guifolio: '100', guitipo: 52, empkey: '1' }),
      ]),
    );

    // GuiaImpuesto vía createQueryBuilder (orIgnore idempotente)
    expect(mockManager.createQueryBuilder).toHaveBeenCalledTimes(1);
    const qb = mockManager.createQueryBuilder.mock.results[0].value as {
      into: jest.Mock;
      values: jest.Mock;
    };
    expect(qb.into).toHaveBeenCalledWith(GuiaImpuesto);
    expect(qb.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          empkey: '1',
          guitipo: 52,
          guifolio: '100',
          guiimpcod: 14,
          guiimpsubid: '0',
          guiimpmonto: '190',
        }),
      ]),
    );
  });

  it('no guarda GuiaImpuesto cuando Monto IVA es 0', async () => {
    const rowSinIva = { ...makeRow('200', '22222222-2'), 'Monto IVA': '0' };
    mockBackofficeAdapter.getGuias.mockResolvedValueOnce([rowSinIva]);
    mockClientesService.findOrCreateBatch.mockResolvedValueOnce({
      clientes: [],
      created: 0,
    });

    await service.syncFromReporte(
      '1',
      '11111111-1',
      '2026-01-01',
      '2026-01-31',
    );

    // Solo se llama una vez (para Guia[]) — no hay segunda llamada para GuiaImpuesto
    expect(mockManager.save).toHaveBeenCalledTimes(1);
    expect(mockManager.save).toHaveBeenCalledWith(Guia, expect.any(Array));
  });
});
