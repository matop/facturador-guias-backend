import { Test, TestingModule } from '@nestjs/testing';
import { ClientesController } from './clientes.controller.js';
import { ClientesService } from './clientes.service.js';

describe('ClientesController', () => {
  let controller: ClientesController;

  const mockClientesService = {
    findAll: jest.fn().mockResolvedValue([]),
    findByRut: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientesController],
      providers: [{ provide: ClientesService, useValue: mockClientesService }],
    }).compile();

    controller = module.get<ClientesController>(ClientesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
