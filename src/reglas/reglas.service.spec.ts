import { ConflictException, NotFoundException } from '@nestjs/common';
import { ReglasService } from './reglas.service.js';

const mockReglaRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
};
const mockReglaEmpresaRepo = { find: jest.fn() };

function makeService(): ReglasService {
  return new ReglasService(mockReglaRepo as any, mockReglaEmpresaRepo as any);
}

describe('ReglasService', () => {
  let service: ReglasService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
  });

  describe('findAll', () => {
    it('retorna todas las reglas del catálogo', async () => {
      mockReglaRepo.find.mockResolvedValue([
        {
          reglaidl: 'por_comuna',
          regladescripcion: 'Agrupar por comuna',
          reglaconfig: { fn: 'extraeTagLista', reglaTags: ['CmnaRecep'] },
        },
      ]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].reglaidl).toBe('por_comuna');
    });

    it('retorna array vacío cuando no hay reglas', async () => {
      mockReglaRepo.find.mockResolvedValue([]);
      expect(await service.findAll()).toEqual([]);
    });
  });

  describe('findById', () => {
    it('retorna la regla cuando existe', async () => {
      const regla = {
        reglaidl: 'por_comuna',
        regladescripcion: 'desc',
        reglaconfig: { fn: 'extraeTagLista', reglaTags: ['CmnaRecep'] },
      };
      mockReglaRepo.findOne.mockResolvedValue(regla);

      expect(await service.findById('por_comuna')).toEqual(regla);
    });

    it('retorna null cuando no existe', async () => {
      mockReglaRepo.findOne.mockResolvedValue(null);
      expect(await service.findById('inexistente')).toBeNull();
    });
  });

  describe('findByEmpresa', () => {
    it('retorna las asignaciones empresa-regla', async () => {
      mockReglaEmpresaRepo.find.mockResolvedValue([
        { empkey: '977', reglaidl: 'por_comuna' },
        { empkey: '977', reglaidl: 'por_razon_social' },
      ]);

      const result = await service.findByEmpresa('977');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ empkey: '977', reglaidl: 'por_comuna' });
    });

    it('retorna array vacío cuando la empresa no tiene reglas asignadas', async () => {
      mockReglaEmpresaRepo.find.mockResolvedValue([]);
      expect(await service.findByEmpresa('999')).toEqual([]);
    });
  });

  describe('create', () => {
    const dto = {
      reglaidl: 'por_comuna',
      regladescripcion: 'Agrupar por comuna',
      fn: 'extraeTagLista' as const,
      reglaTags: ['CmnaRecep'],
    };

    it('crea y retorna la regla nueva', async () => {
      mockReglaRepo.findOne.mockResolvedValue(null);
      mockReglaRepo.create.mockReturnValue({
        ...dto,
        reglaconfig: { fn: dto.fn, reglaTags: dto.reglaTags },
      });
      mockReglaRepo.save.mockResolvedValue({
        reglaidl: dto.reglaidl,
        regladescripcion: dto.regladescripcion,
        reglaconfig: { fn: dto.fn, reglaTags: dto.reglaTags },
      });

      const result = await service.create(dto);

      expect(mockReglaRepo.create).toHaveBeenCalled();
      expect(result.reglaidl).toBe('por_comuna');
      expect(result.reglaconfig).toEqual({
        fn: 'extraeTagLista',
        reglaTags: ['CmnaRecep'],
      });
    });

    it('lanza ConflictException si el id ya existe', async () => {
      mockReglaRepo.findOne.mockResolvedValue({ reglaidl: dto.reglaidl });
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('crea una regla extraeReferenciaPorTipo con tiposReferencia', async () => {
      const ocHesDto = {
        reglaidl: 'por_oc',
        regladescripcion: 'Agrupar por OC/HES',
        fn: 'extraeReferenciaPorTipo' as const,
        tiposReferencia: ['801', 'HES'] as const,
      };
      const reglaCreada = {
        reglaidl: ocHesDto.reglaidl,
        regladescripcion: ocHesDto.regladescripcion,
        reglaconfig: {
          fn: 'extraeReferenciaPorTipo',
          tiposReferencia: ['801', 'HES'],
        },
      };
      mockReglaRepo.findOne.mockResolvedValue(null);
      mockReglaRepo.create.mockReturnValue(reglaCreada);
      mockReglaRepo.save.mockResolvedValue(reglaCreada);

      const result = await service.create(ocHesDto as any);

      expect(result.reglaconfig).toEqual({
        fn: 'extraeReferenciaPorTipo',
        tiposReferencia: ['801', 'HES'],
      });
    });
  });

  describe('update', () => {
    it('actualiza descripcion y tags', async () => {
      const regla = {
        reglaidl: 'por_comuna',
        regladescripcion: 'vieja',
        reglaconfig: { fn: 'extraeTagLista', reglaTags: ['TagA'] },
      };
      mockReglaRepo.findOne.mockResolvedValue(regla);
      mockReglaRepo.save.mockResolvedValue({
        ...regla,
        regladescripcion: 'nueva',
        reglaconfig: { fn: 'extraeTagLista', reglaTags: ['TagB'] },
      });

      const result = await service.update('por_comuna', {
        regladescripcion: 'nueva',
        fn: 'extraeTagLista',
        reglaTags: ['TagB'],
      });

      expect(result.regladescripcion).toBe('nueva');
    });

    it('lanza NotFoundException si no existe', async () => {
      mockReglaRepo.findOne.mockResolvedValue(null);
      await expect(service.update('inexistente', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('cambia el fn de extraeTagLista a extraeReferenciaPorTipo', async () => {
      const regla = {
        reglaidl: 'por_oc',
        regladescripcion: 'vieja',
        reglaconfig: { fn: 'extraeTagLista', reglaTags: ['TagA'] },
      };
      mockReglaRepo.findOne.mockResolvedValue(regla);
      mockReglaRepo.save.mockResolvedValue({
        ...regla,
        reglaconfig: {
          fn: 'extraeReferenciaPorTipo',
          tiposReferencia: ['801', 'HES'],
        },
      });

      const result = await service.update('por_oc', {
        fn: 'extraeReferenciaPorTipo',
        tiposReferencia: ['801', 'HES'],
      } as any);

      expect(result.reglaconfig).toEqual({
        fn: 'extraeReferenciaPorTipo',
        tiposReferencia: ['801', 'HES'],
      });
    });

    it('actualiza solo tiposReferencia cuando la regla ya es extraeReferenciaPorTipo', async () => {
      const regla = {
        reglaidl: 'por_oc',
        regladescripcion: 'desc',
        reglaconfig: {
          fn: 'extraeReferenciaPorTipo',
          tiposReferencia: ['801'],
        },
      };
      mockReglaRepo.findOne.mockResolvedValue(regla);
      mockReglaRepo.save.mockResolvedValue({
        ...regla,
        reglaconfig: {
          fn: 'extraeReferenciaPorTipo',
          tiposReferencia: ['HES'],
        },
      });

      const result = await service.update('por_oc', {
        tiposReferencia: ['HES'],
      } as any);

      expect(result.reglaconfig).toEqual({
        fn: 'extraeReferenciaPorTipo',
        tiposReferencia: ['HES'],
      });
    });
  });

  describe('remove', () => {
    it('elimina la regla', async () => {
      const regla = { reglaidl: 'por_comuna' };
      mockReglaRepo.findOne.mockResolvedValue(regla);
      mockReglaRepo.remove.mockResolvedValue(undefined);

      await service.remove('por_comuna');

      expect(mockReglaRepo.remove).toHaveBeenCalledWith(regla);
    });

    it('lanza NotFoundException si no existe', async () => {
      mockReglaRepo.findOne.mockResolvedValue(null);
      await expect(service.remove('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findReglasDisponibles', () => {
    it('retorna reglas de la empresa con shape { reglaIdl, reglaDesc }', async () => {
      mockReglaEmpresaRepo.find.mockResolvedValue([
        { empkey: '977', reglaidl: 'por_comuna' },
        { empkey: '977', reglaidl: 'por_razon_social' },
      ]);
      mockReglaRepo.find.mockResolvedValue([
        {
          reglaidl: 'por_comuna',
          regladescripcion: 'Agrupar por comuna',
          reglaconfig: {},
        },
        {
          reglaidl: 'por_razon_social',
          regladescripcion: 'Por razón social',
          reglaconfig: {},
        },
      ]);

      const result = await service.findReglasDisponibles('977');

      expect(result).toEqual([
        { reglaIdl: 'por_comuna', reglaDesc: 'Agrupar por comuna' },
        { reglaIdl: 'por_razon_social', reglaDesc: 'Por razón social' },
      ]);
    });

    it('retorna [] cuando la empresa no tiene reglas asignadas', async () => {
      mockReglaEmpresaRepo.find.mockResolvedValue([]);

      const result = await service.findReglasDisponibles('999');

      expect(result).toEqual([]);
      expect(mockReglaRepo.find).not.toHaveBeenCalled();
    });
  });
});
