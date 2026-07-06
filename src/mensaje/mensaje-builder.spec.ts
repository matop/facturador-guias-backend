import {
  buildMensaje,
  buildDetallePorProducto,
  formatRutEmisor,
  formatRutCliente,
  formatDateSlash,
  formatDateDash,
  addDias,
  type GuiaParaMensaje,
  type MensajeInput,
  type DetalleItemParaMensaje,
} from './mensaje-builder.js';

// ─── Factories ─────────────────────────────────────────────────────────────────

const makeGuia = (folio: string, overrides: Partial<GuiaParaMensaje> = {}): GuiaParaMensaje => ({
  folio,
  fechaEmision: '2026-05-10',
  totneto: '1000',
  totiva: '190',
  totdoc: '1190',
  totexento: '0',
  ...overrides,
});

const makeGuias = (n: number): GuiaParaMensaje[] =>
  Array.from({ length: n }, (_, i) => makeGuia(String(64000 + i)));

const baseInput = (guias: GuiaParaMensaje[], overrides: Partial<MensajeInput> = {}): MensajeInput => ({
  transaccionIdL: '977-42',
  fechaDocumento: '2026-05-20',
  diasCredito: 30,
  rutEmisor: '76407930-2',
  rutCliente: '78041840-0',
  nombreCliente: 'ACME S.A.',
  direccion: 'Av. Providencia 123',
  comuna: 'PROVIDENCIA',
  ciudad: 'SANTIAGO',
  giro: 'Comercio al Por Mayor',
  guias,
  ...overrides,
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

describe('formatRutEmisor', () => {
  it('quita guión y puntos', () => {
    expect(formatRutEmisor('76407930-2')).toBe('764079302');
    expect(formatRutEmisor('76.407.930-2')).toBe('764079302');
  });
  it('ya sin formato queda igual', () => {
    expect(formatRutEmisor('764079302')).toBe('764079302');
  });
});

describe('formatRutCliente', () => {
  it('agrega puntos y guión desde formato limpio', () => {
    expect(formatRutCliente('780418400')).toBe('78.041.840-0');
  });
  it('normaliza desde formato con guión', () => {
    expect(formatRutCliente('78041840-0')).toBe('78.041.840-0');
  });
  it('normaliza desde formato completo', () => {
    expect(formatRutCliente('78.041.840-0')).toBe('78.041.840-0');
  });
  it('RUT con verificador K', () => {
    expect(formatRutCliente('15378308-K')).toBe('15.378.308-K');
  });
  it('RUT de 7 dígitos', () => {
    expect(formatRutCliente('9240123-5')).toBe('9.240.123-5');
  });
});

describe('formatDateSlash / formatDateDash', () => {
  it('formatDateSlash convierte a dd/MM/yyyy', () => {
    expect(formatDateSlash('2026-05-07')).toBe('07/05/2026');
  });
  it('formatDateDash convierte a dd-MM-yyyy', () => {
    expect(formatDateDash('2026-05-07')).toBe('07-05-2026');
  });
});

describe('addDias', () => {
  it('suma días correctamente', () => {
    expect(addDias('2026-05-20', 30)).toBe('2026-06-19');
    expect(addDias('2026-05-20', 15)).toBe('2026-06-04');
    expect(addDias('2026-12-20', 30)).toBe('2027-01-19');
  });
});

// ─── Encabezado común ─────────────────────────────────────────────────────────

describe('buildMensaje — encabezado', () => {
  let lines: string[];

  beforeEach(() => {
    const { mensaje } = buildMensaje(baseInput(makeGuias(1)));
    lines = mensaje.split('\r\n');
  });

  it('TransaccionIdL', () => {
    expect(lines).toContain('1:|IDENTIFICADOR UNICO TRANSACCION|977-42');
  });
  it('TIPO DOCUMENTO', () => {
    expect(lines).toContain('1:|TIPO DOCUMENTO|Factura Electronica');
  });
  it('RUT EMISOR sin puntos ni guión', () => {
    expect(lines).toContain('1:|RUT EMISOR|764079302');
  });
  it('FOLIO TRIBUTARIO = 0', () => {
    expect(lines).toContain('1:|FOLIO TRIBUTARIO DOCUMENTO|0');
  });
  it('FECHA DE DOCUMENTO en dd/MM/yyyy', () => {
    expect(lines).toContain('1:|FECHA DE DOCUMENTO|20/05/2026');
  });
  it('FECHA DE VENCIMIENTO = +30 días', () => {
    expect(lines).toContain('1:|FECHA DE VENCIMIENTO|19/06/2026');
  });
  it('FORMA DE PAGO', () => {
    expect(lines).toContain('1:|FORMA DE PAGO DESCRIPCION|Credito');
  });
  it('RUT CLIENTE con puntos y guión', () => {
    expect(lines).toContain('1:|RUT CLIENTE|78.041.840-0');
  });
  it('NOMBRE CLIENTE', () => {
    expect(lines).toContain('1:|NOMBRE CLIENTE|ACME S.A.');
  });
  it('GIRO', () => {
    expect(lines).toContain('1:|GIRO|Comercio al Por Mayor');
  });

  it('diasCredito=15 → vencimiento correcto', () => {
    const { mensaje } = buildMensaje(baseInput(makeGuias(1), { diasCredito: 15 }));
    expect(mensaje.split('\r\n')).toContain('1:|FECHA DE VENCIMIENTO|04/06/2026');
  });
});

// ─── Totales ───────────────────────────────────────────────────────────────────

describe('buildMensaje — totales', () => {
  it('suma correctamente múltiples guías', () => {
    const guias: GuiaParaMensaje[] = [
      makeGuia('1', { totneto: '1000', totiva: '190', totdoc: '1190', totexento: '0' }),
      makeGuia('2', { totneto: '2000', totiva: '380', totdoc: '2430', totexento: '50' }),
    ];
    const { mensaje } = buildMensaje(baseInput(guias));
    const lines = mensaje.split('\r\n');
    expect(lines).toContain('1:|MONTO NETO|3000');
    expect(lines).toContain('1:|IMPUESTO IVA|570');
    // MONTO TOTAL = Exento + Neto + IVA (derivado, no suma de totdoc por guía)
    expect(lines).toContain('1:|MONTO TOTAL|3620');
    expect(lines).toContain('1:|MONTO EXENTO|50');
  });

  it('IVA se calcula sobre el neto total, no sumando el IVA pre-redondeado de cada guía', () => {
    // 40 guías con neto=777/iva=148 (777*0.19=147.63→148 redondeado individualmente).
    // Sumar los totiva ya redondeados da 40*148=5920, pero Enternet valida
    // IVA == round(Neto_total * 19%): round(31080*0.19)=round(5905.2)=5905.
    const guias: GuiaParaMensaje[] = Array.from({ length: 40 }, (_, i) =>
      makeGuia(String(64000 + i), { totneto: '777', totiva: '148', totdoc: '925', totexento: '0' }),
    );
    const { mensaje } = buildMensaje(baseInput(guias));
    const lines = mensaje.split('\r\n');
    expect(lines).toContain('1:|MONTO NETO|31080');
    expect(lines).toContain('1:|IMPUESTO IVA|5905');
    // MONTO TOTAL debe ser Neto+IVA+Exento derivado, no la suma de los totdoc
    // por guía (que arrastran el mismo drift de redondeo que el IVA).
    expect(lines).toContain('1:|MONTO TOTAL|36985');
  });
});

// ─── Detalle — Caso S.G. (Según Guías) ─────────────────────────────────────────

describe('buildMensaje — Detalle S.G.', () => {
  it('tiene línea 2:| de cabecera de detalle', () => {
    const { mensaje } = buildMensaje(baseInput(makeGuias(1)));
    expect(mensaje).toContain('2:|ITEM|TIPO ITEM|DESCRIPCION|CANTIDAD|PRECIO|DESCUENTO MONTO|TOTAL LINEA');
  });

  it('siempre una sola línea 3:|, sin importar la cantidad de guías', () => {
    for (const n of [1, 3, 19, 20, 25]) {
      const { mensaje } = buildMensaje(baseInput(makeGuias(n)));
      const detalles = mensaje.split('\r\n').filter(l => l.startsWith('3:|'));
      expect(detalles).toHaveLength(1);
    }
  });

  it('texto exacto "Facturación según guías período YYYY-MM"', () => {
    const guias = makeGuias(3); // fechaEmision '2026-05-10'
    const { mensaje } = buildMensaje(baseInput(guias));
    const detalle = mensaje.split('\r\n').find(l => l.startsWith('3:|'))!;
    expect(detalle).toBe('3:|1|AFECTO|Facturación según guías período 2026-05|1|3000|0|3000');
  });

  it('monto de la línea es la suma de totneto de todas las guías', () => {
    const guias: GuiaParaMensaje[] = [
      makeGuia('1', { totneto: '1000' }),
      makeGuia('2', { totneto: '2500' }),
    ];
    const { mensaje } = buildMensaje(baseInput(guias));
    const detalle = mensaje.split('\r\n').find(l => l.startsWith('3:|'))!;
    expect(detalle).toBe('3:|1|AFECTO|Facturación según guías período 2026-05|1|3500|0|3500');
  });

  it('nunca incluye GLOSA', () => {
    for (const n of [1, 25]) {
      const { mensaje } = buildMensaje(baseInput(makeGuias(n)));
      expect(mensaje).not.toContain('1:|GLOSA|');
    }
  });
});

// ─── Referencias ────────────────────────────────────────────────────────────────

describe('buildMensaje — Referencias', () => {
  it('tiene sección de referencias 4:| y una línea 5:| por guía', () => {
    const guia = makeGuia('64261', { fechaEmision: '2026-04-06' });
    const { mensaje } = buildMensaje(baseInput([guia]));
    const lines = mensaje.split('\r\n');
    expect(lines).toContain('4:|TIPO DE REFERENCIA|FOLIO|FECHA');
    expect(lines).toContain('5:|52|64261|06/04/2026');
  });

  it('usa el código oficial SII 52, no texto descriptivo', () => {
    const { mensaje } = buildMensaje(baseInput(makeGuias(1)));
    expect(mensaje).not.toContain('Guia de Despacho Electronica');
  });

  it('una línea 5:| por cada guía, sin importar la cantidad', () => {
    const { mensaje } = buildMensaje(baseInput(makeGuias(25)));
    const lines = mensaje.split('\r\n');
    expect(lines.filter(l => l.startsWith('4:|'))).toHaveLength(1);
    expect(lines.filter(l => l.startsWith('5:|'))).toHaveLength(25);
  });
});

// ─── Guard de guías vacías ─────────────────────────────────────────────────────

describe('buildMensaje — guard', () => {
  it('lanza error si guias está vacío', () => {
    expect(() => buildMensaje(baseInput([]))).toThrow('no tiene guías');
  });
});

// ─── Caso 2 — Por Producto (Precio Constante) ──────────────────────────────────

const makeItem = (
  overrides: Partial<DetalleItemParaMensaje> = {},
): DetalleItemParaMensaje => ({
  nmbItem: 'PRODUCTO A',
  qtyItem: '1',
  prcItem: '1000',
  codigo: 'COD-1',
  indExe: '0',
  montoItem: '1000',
  fecha: '2026-05-10',
  ...overrides,
});

describe('buildDetallePorProducto', () => {
  it('agrupa mismo NmbItem+IndExe y suma qtyItem', () => {
    const items = [
      makeItem({ nmbItem: 'PRODUCTO A', qtyItem: '2', montoItem: '2000' }),
      makeItem({ nmbItem: 'PRODUCTO A', qtyItem: '3', montoItem: '3000' }),
    ];
    const lines = buildDetallePorProducto(items);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('3:|1|AFECTO|PRODUCTO A (COD-1)|5|1000|0|5000');
  });

  it('mismo NmbItem con IndExe distinto → 2 líneas separadas', () => {
    const items = [
      makeItem({ nmbItem: 'PRODUCTO A', indExe: '0' }),
      makeItem({ nmbItem: 'PRODUCTO A', indExe: '1' }),
    ];
    const lines = buildDetallePorProducto(items);
    expect(lines).toHaveLength(2);
  });

  it('línea incluye CODIGO en la descripción', () => {
    const lines = buildDetallePorProducto([makeItem({ codigo: 'RSL00001448' })]);
    expect(lines[0]).toContain('PRODUCTO A (RSL00001448)');
  });

  it('usa el codigo de la primera ocurrencia cuando difiere entre items', () => {
    const items = [
      makeItem({ codigo: 'PRIMERO' }),
      makeItem({ codigo: 'SEGUNDO' }),
    ];
    const lines = buildDetallePorProducto(items);
    expect(lines[0]).toContain('(PRIMERO)');
  });

  it('excluye línea no-producto (sin CdgItem y MontoItem=0)', () => {
    const items = [
      makeItem({ nmbItem: 'OBSERVACIONES', codigo: '', montoItem: '0', indExe: '2' }),
      makeItem({ nmbItem: 'PRODUCTO A' }),
    ];
    const lines = buildDetallePorProducto(items);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('PRODUCTO A');
  });

  it('NO excluye producto real sin código pero con MontoItem != 0', () => {
    const items = [makeItem({ codigo: '', montoItem: '1000' })];
    const lines = buildDetallePorProducto(items);
    expect(lines).toHaveLength(1);
  });

  it('TIPO ITEM = EXENTO cuando indExe es truthy y != "0"', () => {
    const lines = buildDetallePorProducto([makeItem({ indExe: '1' })]);
    expect(lines[0]).toContain('|EXENTO|');
  });
});

// ─── Caso 3 — Por Producto (Precio Variable) ───────────────────────────────────

describe('buildDetallePorProducto — Precio Variable', () => {
  it('precio varía entre guías → genera una línea por tramo de fecha', () => {
    const items = [
      makeItem({ nmbItem: 'DIESEL', prcItem: '800', qtyItem: '10', montoItem: '8000', fecha: '2026-05-01' }),
      makeItem({ nmbItem: 'DIESEL', prcItem: '900', qtyItem: '5', montoItem: '4500', fecha: '2026-05-05' }),
    ];
    const lines = buildDetallePorProducto(items);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('3:|1|AFECTO|DIESEL (01-05-2026 al 01-05-2026)|10|800|0|8000');
    expect(lines[1]).toBe('3:|2|AFECTO|DIESEL (05-05-2026 al 05-05-2026)|5|900|0|4500');
  });

  it('varios items con mismo precio dentro de un tramo se suman en una sola línea', () => {
    const items = [
      makeItem({ nmbItem: 'DIESEL', prcItem: '800', qtyItem: '10', montoItem: '8000', fecha: '2026-05-01' }),
      makeItem({ nmbItem: 'DIESEL', prcItem: '800', qtyItem: '3', montoItem: '2400', fecha: '2026-05-03' }),
      makeItem({ nmbItem: 'DIESEL', prcItem: '900', qtyItem: '5', montoItem: '4500', fecha: '2026-05-05' }),
    ];
    const lines = buildDetallePorProducto(items);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('3:|1|AFECTO|DIESEL (01-05-2026 al 03-05-2026)|13|800|0|10400');
    expect(lines[1]).toBe('3:|2|AFECTO|DIESEL (05-05-2026 al 05-05-2026)|5|900|0|4500');
  });

  it('texto de línea de tramo no incluye CODIGO', () => {
    const items = [
      makeItem({ prcItem: '800', codigo: 'COD-X', fecha: '2026-05-01' }),
      makeItem({ prcItem: '900', codigo: 'COD-X', fecha: '2026-05-05' }),
    ];
    const lines = buildDetallePorProducto(items);
    expect(lines[0]).not.toContain('COD-X');
    expect(lines[0]).not.toContain('(COD');
  });

  it('orden desordenado en el input se ordena por fecha antes de detectar tramos', () => {
    const items = [
      makeItem({ prcItem: '900', qtyItem: '5', montoItem: '4500', fecha: '2026-05-05' }),
      makeItem({ prcItem: '800', qtyItem: '10', montoItem: '8000', fecha: '2026-05-01' }),
    ];
    const lines = buildDetallePorProducto(items);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('01-05-2026');
    expect(lines[0]).toContain('|10|800|0|8000');
    expect(lines[1]).toContain('05-05-2026');
  });

  it('precio A → B → A (no contiguo) genera 3 tramos separados, no se fusionan', () => {
    const items = [
      makeItem({ prcItem: '800', qtyItem: '1', montoItem: '800', fecha: '2026-05-01' }),
      makeItem({ prcItem: '900', qtyItem: '1', montoItem: '900', fecha: '2026-05-02' }),
      makeItem({ prcItem: '800', qtyItem: '1', montoItem: '800', fecha: '2026-05-03' }),
    ];
    const lines = buildDetallePorProducto(items);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('01-05-2026 al 01-05-2026');
    expect(lines[1]).toContain('02-05-2026 al 02-05-2026');
    expect(lines[2]).toContain('03-05-2026 al 03-05-2026');
  });

  it('mismo día con 2 precios distintos genera 2 tramos con igual fechaInicio/fechaFin', () => {
    const items = [
      makeItem({ prcItem: '800', qtyItem: '1', montoItem: '800', fecha: '2026-05-01' }),
      makeItem({ prcItem: '900', qtyItem: '1', montoItem: '900', fecha: '2026-05-01' }),
    ];
    const lines = buildDetallePorProducto(items);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('01-05-2026 al 01-05-2026');
    expect(lines[1]).toContain('01-05-2026 al 01-05-2026');
  });

  it('TIPO ITEM se respeta también en modo tramos', () => {
    const items = [
      makeItem({ prcItem: '800', indExe: '1', fecha: '2026-05-01' }),
      makeItem({ prcItem: '900', indExe: '1', fecha: '2026-05-02' }),
    ];
    const lines = buildDetallePorProducto(items);
    expect(lines[0]).toContain('|EXENTO|');
    expect(lines[1]).toContain('|EXENTO|');
  });

  it('grupo con precio constante sigue generando 1 sola línea con CODIGO (regression Caso 2)', () => {
    const items = [
      makeItem({ prcItem: '1000', codigo: 'COD-1', fecha: '2026-05-01' }),
      makeItem({ prcItem: '1000', codigo: 'COD-1', fecha: '2026-05-02' }),
    ];
    const lines = buildDetallePorProducto(items);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('(COD-1)');
  });
});

// ─── Caso 4 — Global (overflow > 40 guías) ─────────────────────────────────────

describe('buildMensaje — Caso 4 (Global)', () => {
  it('40 guías exactas → NO activa Global, sigue en modo individual', () => {
    const { mensaje } = buildMensaje(baseInput(makeGuias(40)));
    const lines = mensaje.split('\r\n');
    expect(lines.filter(l => l.startsWith('5:|'))).toHaveLength(40);
  });

  it('41 guías → Detalle colapsa a 1 sola línea "Segun Guias:" con folios en campo adicional', () => {
    const guias = makeGuias(41);
    const { mensaje } = buildMensaje(baseInput(guias));
    const detalles = mensaje.split('\r\n').filter(l => l.startsWith('3:|'));
    expect(detalles).toHaveLength(1);
    const folios = guias.map(g => g.folio).join(' ');
    expect(detalles[0]).toBe(`3:|1|AFECTO|Segun Guias:|1|${'41000'}|0|${'41000'}|${folios}`);
  });

  it('Global anula modoDetalle=POR_PRODUCTO cuando hay más de 40 guías', () => {
    const detalleItems: DetalleItemParaMensaje[] = [makeItem({ nmbItem: 'PRODUCTO A' })];
    const { mensaje } = buildMensaje(
      baseInput(makeGuias(41), { modoDetalle: 'POR_PRODUCTO', detalleItems }),
    );
    const detalles = mensaje.split('\r\n').filter(l => l.startsWith('3:|'));
    expect(detalles).toHaveLength(1);
    expect(detalles[0]).toContain('Segun Guias:');
  });

  it('monto de la línea Global es la suma de totneto de todas las guías', () => {
    const guias: GuiaParaMensaje[] = Array.from({ length: 41 }, (_, i) =>
      makeGuia(String(64000 + i), { totneto: '500' }),
    );
    const { mensaje } = buildMensaje(baseInput(guias));
    const detalle = mensaje.split('\r\n').find(l => l.startsWith('3:|'))!;
    expect(detalle).toContain(`|${41 * 500}|0|${41 * 500}|`);
  });

  // Skipped: bloque EXPERIMENTAL isGlobal en mensaje-builder.ts SÍ genera estas líneas
  // a propósito, pausado hasta que Enternet corrija su parser (ver memoria
  // enternet-v5-referencia-global-en-progreso.md). NO revertir el bloque para
  // hacer pasar este test.
  it.skip('más de 40 guías → no genera líneas 4:|/5:| individuales de referencia', () => {
    const { mensaje } = buildMensaje(baseInput(makeGuias(41)));
    const lines = mensaje.split('\r\n');
    expect(lines.filter(l => l.startsWith('4:|'))).toHaveLength(0);
    expect(lines.filter(l => l.startsWith('5:|'))).toHaveLength(0);
  });

  it.skip('más de 40 guías → NO agrega campos de referencia en el encabezado (hipótesis descartada, ver comentario en mensaje-builder.ts)', () => {
    const { mensaje } = buildMensaje(baseInput(makeGuias(41)));
    const lines = mensaje.split('\r\n');
    expect(lines.filter(l => l.includes('REFERENCIA'))).toHaveLength(0);
  });
});

describe('buildMensaje — Detalle Por Producto', () => {
  it("modoDetalle='POR_PRODUCTO' genera líneas 3:| desde detalleItems", () => {
    const detalleItems: DetalleItemParaMensaje[] = [
      makeItem({ nmbItem: 'PRODUCTO A', qtyItem: '2', montoItem: '2000' }),
    ];
    const { mensaje } = buildMensaje(
      baseInput(makeGuias(1), { modoDetalle: 'POR_PRODUCTO', detalleItems }),
    );
    const detalles = mensaje.split('\r\n').filter(l => l.startsWith('3:|'));
    expect(detalles).toHaveLength(1);
    expect(detalles[0]).toBe('3:|1|AFECTO|PRODUCTO A (COD-1)|2|1000|0|2000');
  });

  it("modoDetalle ausente/'SG' ignora detalleItems (regression guard)", () => {
    const detalleItems: DetalleItemParaMensaje[] = [makeItem()];
    const { mensaje } = buildMensaje(baseInput(makeGuias(1), { detalleItems }));
    const detalle = mensaje.split('\r\n').find(l => l.startsWith('3:|'))!;
    expect(detalle).toContain('Facturación según guías período');
  });
});
