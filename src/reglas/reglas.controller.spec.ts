import { ReglasController } from './reglas.controller.js';

const mockService = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByEmpresa: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

function makeController(): ReglasController {
  return new ReglasController(mockService as any);
}

describe('ReglasController', () => {
  let controller: ReglasController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = makeController();
  });

  describe('GET /reglas', () => {
    it('delega en service.findAll', async () => {
      mockService.findAll.mockResolvedValue([]);
      await controller.findAll();
      expect(mockService.findAll).toHaveBeenCalled();
    });
  });

  describe('GET /reglas/empresa/:empkey', () => {
    it('delega en service.findByEmpresa con el empkey', async () => {
      mockService.findByEmpresa.mockResolvedValue([
        { empkey: '977', reglaidl: 'por_comuna' },
      ]);
      const result = await controller.findByEmpresa('977');
      expect(mockService.findByEmpresa).toHaveBeenCalledWith('977');
      expect(result).toHaveLength(1);
    });
  });

  describe('GET /reglas/:id', () => {
    it('delega en service.findById con el id', async () => {
      mockService.findById.mockResolvedValue({ reglaidl: 'por_comuna' });
      await controller.findById('por_comuna');
      expect(mockService.findById).toHaveBeenCalledWith('por_comuna');
    });
  });

  describe('POST /reglas', () => {
    it('crea y retorna la regla', async () => {
      const dto = {
        reglaidl: 'por_comuna',
        regladescripcion: 'Agrupar por comuna',
        fn: 'extraeTagLista' as const,
        reglaTags: ['CmnaRecep'],
      };
      const regla = {
        reglaidl: 'por_comuna',
        regladescripcion: 'Agrupar por comuna',
        reglaconfig: { fn: 'extraeTagLista', reglaTags: ['CmnaRecep'] },
      };
      mockService.create.mockResolvedValue(regla);

      const result = await controller.create(dto);

      expect(mockService.create).toHaveBeenCalledWith(dto);
      expect(result.reglaidl).toBe('por_comuna');
    });

    it('crea y retorna una regla extraeReferenciaPorTipo', async () => {
      const dto = {
        reglaidl: 'por_oc_hes',
        regladescripcion: 'Agrupar por OC/HES',
        fn: 'extraeReferenciaPorTipo' as const,
        tiposReferencia: ['801' as const, 'HES' as const],
      };
      const regla = {
        reglaidl: 'por_oc_hes',
        regladescripcion: 'Agrupar por OC/HES',
        reglaconfig: {
          fn: 'extraeReferenciaPorTipo',
          tiposReferencia: ['801', 'HES'],
        },
      };
      mockService.create.mockResolvedValue(regla);

      const result = await controller.create(dto);

      expect(mockService.create).toHaveBeenCalledWith(dto);
      expect(result.reglaidl).toBe('por_oc_hes');
    });
  });

  describe('PUT /reglas/:id', () => {
    it('actualiza y retorna la regla', async () => {
      const regla = {
        reglaidl: 'por_comuna',
        regladescripcion: 'nueva desc',
        reglaconfig: { fn: 'extraeTagLista', reglaTags: ['TagB'] },
      };
      mockService.update.mockResolvedValue(regla);

      const result = await controller.update('por_comuna', {
        regladescripcion: 'nueva desc',
      });

      expect(mockService.update).toHaveBeenCalledWith('por_comuna', {
        regladescripcion: 'nueva desc',
      });
      expect(result.regladescripcion).toBe('nueva desc');
    });
  });

  describe('DELETE /reglas/:id', () => {
    it('llama a service.remove', async () => {
      mockService.remove.mockResolvedValue(undefined);
      await controller.remove('por_comuna');
      expect(mockService.remove).toHaveBeenCalledWith('por_comuna');
    });
  });
});
