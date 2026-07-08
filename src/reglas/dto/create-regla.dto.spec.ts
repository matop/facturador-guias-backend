import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReglaDto } from './create-regla.dto.js';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateReglaDto, plain);
  return validate(dto);
}

describe('CreateReglaDto', () => {
  it('es válido para extraeTagLista con reglaTags', async () => {
    const errors = await validateDto({
      reglaidl: 'por_comuna',
      regladescripcion: 'Agrupar por comuna',
      fn: 'extraeTagLista',
      reglaTags: ['CmnaRecep'],
    });
    expect(errors).toHaveLength(0);
  });

  it('es válido para extraeReferenciaPorTipo con tiposReferencia', async () => {
    const errors = await validateDto({
      reglaidl: 'por_oc',
      regladescripcion: 'Agrupar por OC/HES',
      fn: 'extraeReferenciaPorTipo',
      tiposReferencia: ['801', 'HES'],
    });
    expect(errors).toHaveLength(0);
  });

  it('rechaza extraeTagLista sin reglaTags', async () => {
    const errors = await validateDto({
      reglaidl: 'por_comuna',
      regladescripcion: 'Agrupar por comuna',
      fn: 'extraeTagLista',
    });
    expect(errors.some((e) => e.property === 'reglaTags')).toBe(true);
  });

  it('rechaza extraeReferenciaPorTipo sin tiposReferencia', async () => {
    const errors = await validateDto({
      reglaidl: 'por_oc',
      regladescripcion: 'Agrupar por OC/HES',
      fn: 'extraeReferenciaPorTipo',
    });
    expect(errors.some((e) => e.property === 'tiposReferencia')).toBe(true);
  });

  it('rechaza tiposReferencia con un valor fuera de 801/HES', async () => {
    const errors = await validateDto({
      reglaidl: 'por_oc',
      regladescripcion: 'Agrupar por OC/HES',
      fn: 'extraeReferenciaPorTipo',
      tiposReferencia: ['802'],
    });
    expect(errors.some((e) => e.property === 'tiposReferencia')).toBe(true);
  });

  it('rechaza un fn no soportado', async () => {
    const errors = await validateDto({
      reglaidl: 'por_comuna',
      regladescripcion: 'Agrupar por comuna',
      fn: 'fnDesconocido',
      reglaTags: ['CmnaRecep'],
    });
    expect(errors.some((e) => e.property === 'fn')).toBe(true);
  });

  it('no exige tiposReferencia cuando fn es extraeTagLista aunque venga en el body', async () => {
    const errors = await validateDto({
      reglaidl: 'por_comuna',
      regladescripcion: 'Agrupar por comuna',
      fn: 'extraeTagLista',
      reglaTags: ['CmnaRecep'],
    });
    expect(errors).toHaveLength(0);
  });
});
