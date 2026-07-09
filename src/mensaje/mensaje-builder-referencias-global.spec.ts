// Casos borde de interacción entre Referencias Externas (OC/HES) y el umbral
// de 40 referencias individuales / modo Global — ver docs/PRD-referencias-oc-hes.md
// "Interacción con Modo Global simultáneo" y docs/PLAN-referencias-oc-hes-en-global.md.
// Desde PR #23 (D1-A) las OC/HES en modo Global se emiten como <Referencia>
// reales (5:|801|/5:|HES|) en la zona de referencia, NO embebidas en
// DESCRIPCION ADICIONAL del Detalle. Archivo separado a propósito (no mezclado
// con mensaje-builder.spec.ts) porque cubre una interacción, no una feature
// aislada.

import {
  buildMensaje,
  type GuiaParaMensaje,
  type MensajeInput,
  type ReferenciaExternaParaMensaje,
} from './mensaje-builder.js';

const makeGuia = (
  folio: string,
  overrides: Partial<GuiaParaMensaje> = {},
): GuiaParaMensaje => ({
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

const baseInput = (
  guias: GuiaParaMensaje[],
  overrides: Partial<MensajeInput> = {},
): MensajeInput => ({
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

const makeReferenciaExterna = (
  tipo: ReferenciaExternaParaMensaje['tipo'],
  folio: string,
): ReferenciaExternaParaMensaje => ({ tipo, folio, fecha: '2026-05-10' });

const makeReferencias = (
  tipo: ReferenciaExternaParaMensaje['tipo'],
  n: number,
  folioBase: number,
): ReferenciaExternaParaMensaje[] =>
  Array.from({ length: n }, (_, i) =>
    makeReferenciaExterna(tipo, String(folioBase + i)),
  );

describe('buildMensaje — umbral 40 con OC/HES sumando al total', () => {
  it('38 guías + 1 OC + 1 HES = 40 refs exactas → modo individual (no Global)', () => {
    const { mensaje } = buildMensaje(
      baseInput(makeGuias(38), {
        referenciasExternas: [
          ...makeReferencias('801', 1, 900),
          ...makeReferencias('HES', 1, 950),
        ],
      }),
    );
    const lines = mensaje.split('\r\n');
    expect(lines.filter((l) => l.startsWith('5:|'))).toHaveLength(40);
    expect(lines.some((l) => l.includes('DESCRIPCION ADICIONAL'))).toBe(false);
  });

  it('38 guías + 2 OC + 1 HES = 41 refs → dispara modo Global y OC/HES viajan como 5:| reales', () => {
    const { mensaje } = buildMensaje(
      baseInput(makeGuias(38), {
        referenciasExternas: [
          ...makeReferencias('801', 2, 900),
          ...makeReferencias('HES', 1, 950),
        ],
      }),
    );
    const lines = mensaje.split('\r\n');
    // En Global las OC/HES ahora se emiten como <Referencia> reales en la zona
    // de referencia (D1-A), no colapsadas en DESCRIPCION ADICIONAL. El Detalle
    // sigue en modo Global (con su campo DESCRIPCION ADICIONAL = folios guía).
    expect(lines.filter((l) => l.startsWith('5:|801|'))).toHaveLength(2);
    expect(lines.filter((l) => l.startsWith('5:|HES|'))).toHaveLength(1);
    expect(lines.some((l) => l.includes('DESCRIPCION ADICIONAL'))).toBe(true);
  });

  it('Global con OC y HES presentes: DESCRIPCION ADICIONAL lleva solo folios de guía; OC/HES van como 5:| reales (D1-A)', () => {
    const guias = makeGuias(41);
    const { mensaje } = buildMensaje(
      baseInput(guias, {
        referenciasExternas: [
          makeReferenciaExterna('801', '900'),
          makeReferenciaExterna('801', '901'),
          makeReferenciaExterna('HES', '950'),
        ],
      }),
    );
    const lines = mensaje.split('\r\n');
    const detalle = lines.find((l) => l.startsWith('3:|'))!;
    const foliosGuias = guias.map((g) => g.folio).join(' ');
    expect(detalle).toBe(
      `3:|1|AFECTO|Segun Guias:|1|${41000}|0|${41000}|${foliosGuias}`,
    );
    expect(lines).toContain('5:|801|900|10/05/2026|Orden de Compra');
    expect(lines).toContain('5:|801|901|10/05/2026|Orden de Compra');
    expect(lines).toContain(
      '5:|HES|950|10/05/2026|Hoja de Entrada de Servicios',
    );
  });

  it('Global con guías > 40 pero sin OC/HES: sin segmentos OC:/HES: (sin regresión Caso 4)', () => {
    const guias = makeGuias(41);
    const { mensaje } = buildMensaje(baseInput(guias));
    const detalle = mensaje.split('\r\n').find((l) => l.startsWith('3:|'))!;
    expect(detalle).not.toContain('OC:');
    expect(detalle).not.toContain('HES:');
    expect(detalle.endsWith(guias.map((g) => g.folio).join(' '))).toBe(true);
  });

  it('Global con OC pero sin HES: la OC va como 5:|801| real, no en el Detalle', () => {
    const guias = makeGuias(41);
    const { mensaje } = buildMensaje(
      baseInput(guias, {
        referenciasExternas: [makeReferenciaExterna('801', '900')],
      }),
    );
    const lines = mensaje.split('\r\n');
    const detalle = lines.find((l) => l.startsWith('3:|'))!;
    expect(lines).toContain('5:|801|900|10/05/2026|Orden de Compra');
    expect(lines.filter((l) => l.startsWith('5:|HES|'))).toHaveLength(0);
    expect(detalle).not.toContain('OC:');
  });

  it('Global con HES pero sin OC: la HES va como 5:|HES| real, no en el Detalle', () => {
    const guias = makeGuias(41);
    const { mensaje } = buildMensaje(
      baseInput(guias, {
        referenciasExternas: [makeReferenciaExterna('HES', '950')],
      }),
    );
    const lines = mensaje.split('\r\n');
    const detalle = lines.find((l) => l.startsWith('3:|'))!;
    expect(lines).toContain(
      '5:|HES|950|10/05/2026|Hoja de Entrada de Servicios',
    );
    expect(lines.filter((l) => l.startsWith('5:|801|'))).toHaveLength(0);
    expect(detalle).not.toContain('HES:');
  });
});
