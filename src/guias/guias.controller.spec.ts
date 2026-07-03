import { Test, TestingModule } from '@nestjs/testing';
import { GuiasController } from './guias.controller.js';
import { GuiasService } from './guias.service.js';

describe('GuiasController', () => {
  let controller: GuiasController;

  const mockGuiasService = {
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    findByRut: jest.fn().mockResolvedValue([]),
    syncFromReporte: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GuiasController],
      providers: [{ provide: GuiasService, useValue: mockGuiasService }],
    }).compile();

    controller = module.get<GuiasController>(GuiasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
