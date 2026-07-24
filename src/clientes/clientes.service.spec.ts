import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClientesService } from './clientes.service.js';
import { Cliente } from './entities/cliente.entity.js';
import type { ReceptorData } from '../xml/xml-parser.service.js';

const RECEPTOR: ReceptorData = {
  rutReceptor: '98765432-1',
  razonSocial: 'Cliente Test Ltda',
  cdgIntRecep: '',
  contacto: '',
  dirRecep: '',
  cmnaRecep: 'SANTIAGO',
  ciudadRecep: '',
  giroRecep: '',
};

const RECEPTOR_2: ReceptorData = {
  rutReceptor: '11111111-1',
  razonSocial: 'Otro Cliente SA',
  cdgIntRecep: '',
  contacto: '',
  dirRecep: '',
  cmnaRecep: 'PROVIDENCIA',
  ciudadRecep: '',
  giroRecep: '',
};

describe('ClientesService', () => {
  let service: ClientesService;
  let mockRepo: {
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mockQbExecute: jest.Mock;

  beforeEach(async () => {
    mockQbExecute = jest.fn().mockResolvedValue(undefined);
    const mockQb = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: mockQbExecute,
    };
    mockRepo = {
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientesService,
        { provide: getRepositoryToken(Cliente), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<ClientesService>(ClientesService);
  });

  describe('findOrCreateBatch', () => {
    it('retorna vacío sin consultar la BD cuando no hay receptores', async () => {
      const result = await service.findOrCreateBatch('1', []);

      expect(result).toEqual({ clientes: [], created: 0 });
      expect(mockRepo.find).not.toHaveBeenCalled();
    });

    it('no inserta nada cuando todos los clientes ya existen', async () => {
      const existing = { empkey: '1', gclirut: '98765432-1' } as Cliente;
      mockRepo.find.mockResolvedValueOnce([existing]);

      const result = await service.findOrCreateBatch('1', [RECEPTOR]);

      expect(result).toEqual({ clientes: [existing], created: 0 });
      expect(mockRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('crea en batch (1 SELECT + 1 INSERT ON CONFLICT) los clientes que faltan', async () => {
      mockRepo.find.mockResolvedValueOnce([]);

      const { clientes, created } = await service.findOrCreateBatch('1', [
        RECEPTOR,
        RECEPTOR_2,
      ]);

      expect(mockRepo.find).toHaveBeenCalledTimes(1);
      expect(mockRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(mockQbExecute).toHaveBeenCalledTimes(1);
      expect(created).toBe(2);
      expect(clientes.map((c) => c.gclirut).sort()).toEqual(
        ['11111111-1', '98765432-1'].sort(),
      );
    });

    it('mezcla existentes y nuevos, e inserta solo los que faltan', async () => {
      const existing = {
        empkey: '1',
        gclirut: '98765432-1',
      } as Cliente;
      mockRepo.find.mockResolvedValueOnce([existing]);

      const { clientes, created } = await service.findOrCreateBatch('1', [
        RECEPTOR,
        RECEPTOR_2,
      ]);

      expect(created).toBe(1);
      expect(clientes).toHaveLength(2);
      expect(mockRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    });

    it('deduplica receptores repetidos por rutReceptor antes de consultar', async () => {
      mockRepo.find.mockResolvedValueOnce([]);

      const { created } = await service.findOrCreateBatch('1', [
        RECEPTOR,
        RECEPTOR,
      ]);

      expect(created).toBe(1);
    });
  });
});
