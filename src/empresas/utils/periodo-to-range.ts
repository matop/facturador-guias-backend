export function periodoToRange(periodo: string): { fechaInicial: string; fechaFinal: string } {
  const [year, month] = periodo.split('-').map(Number);
  const fechaInicial = `${periodo}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const fechaFinal = `${periodo}-${String(lastDay).padStart(2, '0')}`;
  return { fechaInicial, fechaFinal };
}
