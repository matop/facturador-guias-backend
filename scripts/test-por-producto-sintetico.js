#!/usr/bin/env node
/**
 * test-por-producto-sintetico.js — Prueba Caso 2 (Precio Constante) o Caso 3
 * (Precio Variable) de "Detalle Por Producto" con guías 100% sintéticas,
 * cada caso en su PROPIA proforma (no combinados) para poder validar/emitir
 * cada uno de forma aislada contra Enternet QA.
 *
 * No requiere guías reales ni backoffice-adapter corriendo. El XML de cada
 * guía se sirve como un `data:` URL embebido directo en `guifilepath`
 * (Node's fetch soporta el esquema data: — ver fixtures/README).
 *
 * Por defecto solo hace preview-mensaje (no toca Enternet). Con --aprobar
 * además llama a PATCH /aprobar y emite de verdad.
 *
 * Reusable: las guías sintéticas (guitipo=999) y la proforma BORRADOR/EMITIDA
 * quedan en la base para poder re-consultarlas después. Usa --reset para
 * recrear las guías de ese caso si editaste los fixtures XML.
 *
 * Uso: node scripts/test-por-producto-sintetico.js --caso=2 [--reset] [--aprobar]
 *      node scripts/test-por-producto-sintetico.js --caso=3 [--reset] [--aprobar]
 * Requiere: servidor corriendo en localhost:3334 (pnpm run start:dev)
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const EMPKEY = '1163';
const GCLIRUT = '76407930-2';
const REGLAIDL = 'por_razon_social';
const RUT_EMISOR = '968880004'; // par vigente 2026-07-02 junto con FACTURACION_RUT_USUARIO=16714595-7
const GUITIPO_SINTETICO = 999;
const BASE_URL = 'http://localhost:3334/facturador-guias-backend/api';

const FIXTURES_DIR = path.join(__dirname, '..', 'test', 'fixtures', 'por-producto');

// Cada caso vive en su propio período sintético para que crearManual (que
// agrupa TODO lo disponible por cliente+regla+período) no los mezcle entre sí
// ni con el escenario combinado anterior (gfackey=98, período 2026-05).
const CASOS = {
  2: {
    periodo: '2026-04',
    esperado: 'Caso 2 (Arriendo Contenedor 20 Pies): 1 línea, cantidad=6, precio=15000, monto=90000, con "(COD-CONT20)"',
    guias: [
      { folio: 990011, file: 'caso2-precio-constante/guia-1.xml', fecha: '2026-04-20', neto: 15000 },
      { folio: 990012, file: 'caso2-precio-constante/guia-2.xml', fecha: '2026-04-20', neto: 30000 },
      { folio: 990013, file: 'caso2-precio-constante/guia-3.xml', fecha: '2026-04-20', neto: 45000 },
    ],
  },
  3: {
    // Período movido de 2026-03 a 2025-12 — 2026-03 quedó contaminado con
    // guías sueltas (guitipo 994/995, folios 994xxx) de
    // test-oc-hes-chunking-sintetico.js (sesión 2026-07-06), que crearManual
    // agrupa junto con estas por compartir cliente+regla+período. 2026-07 (mes
    // actual) tampoco sirve: el chequeo de "Proforma activa" compara contra
    // gfacfecha (fecha de creación/aprobación = hoy) de CUALQUIER proforma de
    // este cliente+regla, no contra el período pedido — cualquier proforma
    // creada hoy (2026-07-07) cae dentro del rango de período 2026-07 y
    // bloquea nuevas. 2025-12 está limpio de guías y fuera del rango de hoy.
    periodo: '2025-12',
    esperado: 'Caso 3 (Arriendo Contenedor 40 Pies): 3 tramos — (01-12 al 02-12)=15000, (03-12)=18000, (04-12)=15000 — SIN código',
    guias: [
      { folio: 990018, file: 'caso3-precio-variable/guia-1.xml', fecha: '2025-12-01', neto: 15000 },
      { folio: 990019, file: 'caso3-precio-variable/guia-2.xml', fecha: '2025-12-02', neto: 15000 },
      { folio: 990020, file: 'caso3-precio-variable/guia-3.xml', fecha: '2025-12-03', neto: 18000 },
      { folio: 990021, file: 'caso3-precio-variable/guia-4.xml', fecha: '2025-12-04', neto: 15000 },
    ],
  },
};

const RESET = process.argv.includes('--reset');
const APROBAR = process.argv.includes('--aprobar');
const casoArg = process.argv.find(a => a.startsWith('--caso='));
const CASO = casoArg ? casoArg.split('=')[1] : null;

if (!CASO || !CASOS[CASO]) {
  console.error('Uso: node scripts/test-por-producto-sintetico.js --caso=2|3 [--reset] [--aprobar]');
  process.exit(1);
}

const { periodo: PERIODO, guias: GUIAS, esperado: ESPERADO } = CASOS[CASO];

function toDataUrl(xmlPath) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const b64 = Buffer.from(xml, 'utf8').toString('base64');
  return `data:text/xml;base64,${b64}`;
}

async function main() {
  const db = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'facturagdes2',
  });
  await db.connect();

  try {
    // 1. Cliente en modo POR_PRODUCTO (requerido para activar Caso 2/3)
    await db.query(
      `UPDATE gde.clientes SET modo_detalle = 'POR_PRODUCTO' WHERE empkey = $1 AND gclirut = $2`,
      [EMPKEY, GCLIRUT],
    );
    console.log(`[OK] cliente ${GCLIRUT} → modo_detalle=POR_PRODUCTO`);

    const folios = GUIAS.map(g => g.folio);

    // 2. Reset opcional (borra guías sintéticas previas de ESTE caso + vínculos)
    if (RESET) {
      await db.query(
        `DELETE FROM gde.facturaguias WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
        [EMPKEY, GUITIPO_SINTETICO, folios],
      );
      await db.query(
        `DELETE FROM gde.guia WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
        [EMPKEY, GUITIPO_SINTETICO, folios],
      );
      console.log(`[OK] --reset: guías sintéticas previas de Caso ${CASO} eliminadas`);
    }

    // 3. Sembrar guías sintéticas de este caso (idempotente: solo si no existen)
    const { rows: existentes } = await db.query(
      `SELECT guifolio FROM gde.guia WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
      [EMPKEY, GUITIPO_SINTETICO, folios],
    );
    const foliosExistentes = new Set(existentes.map(r => String(r.guifolio)));

    for (const g of GUIAS) {
      if (foliosExistentes.has(String(g.folio))) continue;
      const xmlPath = path.join(FIXTURES_DIR, g.file);
      const dataUrl = toDataUrl(xmlPath);
      const iva = Math.round(g.neto * 0.19);
      const totdoc = g.neto + iva;

      await db.query(
        `INSERT INTO gde.guia
           (empkey, guitipo, guifolio, guiestadoregistro, guiestadoacuse, guiestadoanulacion,
            guisuccod, guifechaemision, gclirut, guitotneto, guitotexento, guitotiva,
            guiotrosimpuestos, guitotdoc, guiiddoc, guifilepath, guiloteidl,
            guivaloragrupador, guireglaidl)
         VALUES ($1,$2,$3,'VIGENTE','','', 'SINTETICO', $4, $5, $6, 0, $7, 0, $8,
                 $9, $10, 'SINT-LOTE-01', 'Enternet Sociedad Anonima', $11)`,
        [
          EMPKEY, GUITIPO_SINTETICO, g.folio, g.fecha, GCLIRUT,
          g.neto, iva, totdoc, `SINTETICO-${g.folio}`, dataUrl, REGLAIDL,
        ],
      );
      console.log(`[OK] guía sintética insertada: folio=${g.folio} (${g.file})`);
    }

    // 4. Buscar proforma existente para ESTE caso (vinculada a alguno de sus folios)
    const { rows: proformaExistente } = await db.query(
      `SELECT DISTINCT f.gfackey, f.estado FROM gde.factura f
       JOIN gde.facturaguias fg ON fg.empkey = f.empkey AND fg.gfackey = f.gfackey
       WHERE f.empkey = $1 AND fg.guitipo = $2 AND fg.guifolio = ANY($3::bigint[])
         AND f.estado IN ('BORRADOR', 'APROBADA', 'EMITIDA')`,
      [EMPKEY, GUITIPO_SINTETICO, folios],
    );

    let gfackey;
    if (proformaExistente.length > 0) {
      gfackey = proformaExistente[0].gfackey;
      console.log(`[OK] reusando proforma existente: gfackey=${gfackey} (estado=${proformaExistente[0].estado})`);
    } else {
      const res = await fetch(
        `${BASE_URL}/empresas/${EMPKEY}/facturas/proforma?rut=${RUT_EMISOR}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ periodo: PERIODO, gclirut: GCLIRUT, reglaidl: REGLAIDL }),
        },
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(`crearManual falló HTTP ${res.status}: ${JSON.stringify(body)}`);
      }
      gfackey = body.id;
      console.log(`[OK] proforma de Caso ${CASO} creada: gfackey=${gfackey}`);
    }

    // 5. Preview del Mensaje (NO emite — no toca Enternet)
    const previewRes = await fetch(
      `${BASE_URL}/empresas/${EMPKEY}/facturas/proforma/${gfackey}/preview-mensaje`,
    );
    const preview = await previewRes.json();
    if (!previewRes.ok) {
      throw new Error(`preview-mensaje falló HTTP ${previewRes.status}: ${JSON.stringify(preview)}`);
    }

    console.log(`\n=== Mensaje V5 completo (Caso ${CASO}) ===`);
    console.log(preview.mensaje);

    console.log('\n=== Líneas de Detalle (3:|) ===');
    preview.mensaje.split('\r\n').filter(l => l.startsWith('3:|')).forEach(l => console.log(l));

    console.log('\n=== Líneas de Referencia (5:|) ===');
    preview.mensaje.split('\r\n').filter(l => l.startsWith('5:|')).forEach(l => console.log(l));

    console.log(`\nEsperado: ${ESPERADO}`);

    // 6. Emisión real opcional
    if (APROBAR) {
      console.log(`\n=== Emitiendo de verdad (PATCH /aprobar) — gfackey=${gfackey} ===`);
      const aprobarRes = await fetch(
        `${BASE_URL}/empresas/${EMPKEY}/facturas/proforma/${gfackey}/aprobar`,
        { method: 'PATCH' },
      );
      const aprobarBody = await aprobarRes.json();
      if (!aprobarRes.ok) {
        throw new Error(`aprobar falló HTTP ${aprobarRes.status}: ${JSON.stringify(aprobarBody)}`);
      }
      console.log(`[OK] Caso ${CASO} → estado=${aprobarBody.estado}, folioSii=${aprobarBody.folioSii}`);
      console.log(JSON.stringify(aprobarBody, null, 2));
    } else {
      console.log('\n(no se pasó --aprobar: solo preview, no se emitió nada real)');
    }
  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
