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

describe('ClientesService', () => {
  let service: ClientesService;
  let mockRepo: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    mockRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientesService,
        { provide: getRepositoryToken(Cliente), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<ClientesService>(ClientesService);
  });

  describe('findOrCreate', () => {
    it('retorna cliente existente sin insertar cuando ya existe', async () => {
      const existing = { empkey: '1', gclirut: '98765432-1' } as Cliente;
      mockRepo.findOne.mockResolvedValueOnce(existing);

      const result = await service.findOrCreate('1', RECEPTOR);

      expect(result).toEqual({ cliente: existing, created: false });
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('crea cliente cuando no existe', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);
      mockRepo.save.mockImplementation(async (c: Cliente) => c);

      const { cliente, created } = await service.findOrCreate('1', RECEPTOR);

      expect(created).toBe(true);
      expect(cliente.gclirut).toBe('98765432-1');
      expect(cliente.gclinom).toBe('Cliente Test Ltda');
    });
  });
});
