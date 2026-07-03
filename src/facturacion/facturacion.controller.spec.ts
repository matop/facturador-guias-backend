import { Test, TestingModule } from '@nestjs/testing';
import { FacturacionController } from './facturacion.controller.js';
import { FacturacionService } from './facturacion.service.js';

describe('FacturacionController', () => {
  let controller: FacturacionController;

  const mockFacturacionService = {
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    getGuiasByFactura: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FacturacionController],
      providers: [{ provide: FacturacionService, useValue: mockFacturacionService }],
    }).compile();

    controller = module.get<FacturacionController>(FacturacionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
