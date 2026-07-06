import { periodoToRange } from './periodo-to-range.js';

describe('periodoToRange', () => {
  it('mayo 2026 → 31 días', () => {
    expect(periodoToRange('2026-05')).toEqual({
      fechaInicial: '2026-05-01',
      fechaFinal: '2026-05-31',
    });
  });

  it('febrero 2026 — año no bisiesto → 28 días', () => {
    expect(periodoToRange('2026-02')).toEqual({
      fechaInicial: '2026-02-01',
      fechaFinal: '2026-02-28',
    });
  });

  it('febrero 2024 — año bisiesto → 29 días', () => {
    expect(periodoToRange('2024-02')).toEqual({
      fechaInicial: '2024-02-01',
      fechaFinal: '2024-02-29',
    });
  });

  it('diciembre → 31 días', () => {
    expect(periodoToRange('2026-12')).toEqual({
      fechaInicial: '2026-12-01',
      fechaFinal: '2026-12-31',
    });
  });

  it('abril → 30 días', () => {
    expect(periodoToRange('2026-04')).toEqual({
      fechaInicial: '2026-04-01',
      fechaFinal: '2026-04-30',
    });
  });
});
