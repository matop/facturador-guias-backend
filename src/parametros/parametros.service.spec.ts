import { ConfigService } from '@nestjs/config';
import { ParametrosService } from './parametros.service.js';

describe('ParametrosService', () => {
  let service: ParametrosService;

  beforeEach(() => {
    service = new ParametrosService(new ConfigService());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('get', () => {
    it('retorna el valor cuando el sidecar responde ok', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ parametroId: 'MaximoGuias', valor: '55' }),
      } as Response);

      const result = await service.get('MaximoGuias', { empkey: '977' });

      expect(result).toBe('55');
    });

    it('retorna undefined cuando el sidecar responde HTTP no-ok, sin lanzar', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      const result = await service.get('MaximoGuias', { empkey: '977' });

      expect(result).toBeUndefined();
    });

    it('retorna undefined cuando fetch lanza un error de red, sin propagarlo', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await service.get('MaximoGuias', { empkey: '977' });

      expect(result).toBeUndefined();
    });

    it('agrega alcance a la query solo cuando se provee', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valor: '55' }),
      } as Response);

      await service.get('MaximoGuias', {
        empkey: '977',
        alcance: 'Disp05062026151646',
      });

      const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string);
      expect(calledUrl.searchParams.get('alcance')).toBe('Disp05062026151646');
    });

    it('cachea el valor: una segunda llamada con los mismos parámetros no vuelve a pegarle al sidecar', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valor: '55' }),
      } as Response);

      const first = await service.get('MaximoGuias', { empkey: '977' });
      const second = await service.get('MaximoGuias', { empkey: '977' });

      expect(first).toBe('55');
      expect(second).toBe('55');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('no comparte cache entre empkeys distintos', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ valor: '55' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ valor: '10' }),
        } as Response);

      const empresaA = await service.get('MaximoGuias', { empkey: '977' });
      const empresaB = await service.get('MaximoGuias', { empkey: '1163' });

      expect(empresaA).toBe('55');
      expect(empresaB).toBe('10');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('getMaximoGuias', () => {
    it('retorna el valor numérico resuelto por el sidecar', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valor: '55' }),
      } as Response);

      const result = await service.getMaximoGuias('977');

      expect(result).toBe(55);
    });

    it('retorna el default 40 cuando el sidecar no responde', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await service.getMaximoGuias('977');

      expect(result).toBe(40);
    });

    it('retorna el default 40 cuando el valor no es numérico', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valor: 'no-es-un-numero' }),
      } as Response);

      const result = await service.getMaximoGuias('977');

      expect(result).toBe(40);
    });
  });
});
