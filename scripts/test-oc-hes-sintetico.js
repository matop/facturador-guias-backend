#!/usr/bin/env node
/**
 * test-oc-hes-sintetico.js — Prueba de referencias externas OC (801) y HES
 * con 2 guías 100% sintéticas (una con OC, otra con HES), modo SG, contra
 * Enternet QA.
 *
 * No requiere guías reales ni backoffice-adapter corriendo. El XML de cada
 * guía se sirve como un `data:` URL embebido en `guifilepath`.
 *
 * Por defecto solo hace preview-mensaje (no toca Enternet). Con --aprobar
 * además llama a PATCH /aprobar y emite de verdad.
 *
 * Uso: node scripts/test-oc-hes-sintetico.js [--reset] [--aprobar]
 * Requiere: servidor corriendo en localhost:3334 (pnpm run start:dev)
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const EMPKEY = '1163';
const GCLIRUT = '76407930-2';
const REGLAIDL = 'por_razon_social';
const RUT_EMISOR = '968880004'; // par vigente 2026-07-02 junto con FACTURACION_RUT_USUARIO=16714595-7
const GUITIPO_SINTETICO = 997; // distinto de 998 (caso4) y 999 (por-producto)
const BASE_URL = 'http://localhost:3334';
const PERIODO = '2026-01'; // sin datos reales para este cliente

const FIXTURES_DIR = path.join(__dirname, '..', 'test', 'fixtures', 'oc-hes');

const GUIAS = [
  { folio: 990101, file: 'guia-oc.xml', fecha: '2026-01-15', neto: 10000 },
  { folio: 990102, file: 'guia-hes.xml', fecha: '2026-01-15', neto: 20000 },
];

const RESET = process.argv.includes('--reset');
const APROBAR = process.argv.includes('--aprobar');

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
    // 1. Cliente en modo SG (default para este test — OC/HES no dependen del modo de detalle)
    await db.query(
      `UPDATE gde.clientes SET modo_detalle = 'SG' WHERE empkey = $1 AND gclirut = $2`,
      [EMPKEY, GCLIRUT],
    );
    console.log(`[OK] cliente ${GCLIRUT} → modo_detalle=SG`);

    const folios = GUIAS.map(g => g.folio);

    if (RESET) {
      await db.query(
        `DELETE FROM gde.facturaguias WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
        [EMPKEY, GUITIPO_SINTETICO, folios],
      );
      await db.query(
        `DELETE FROM gde.guia WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
        [EMPKEY, GUITIPO_SINTETICO, folios],
      );
      console.log('[OK] --reset: guías sintéticas previas de OC/HES eliminadas');
    }

    // 2. Sembrar guías sintéticas (idempotente)
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
                 $9, $10, 'SINT-LOTE-OCHES', 'Enternet Sociedad Anonima', $11)`,
        [
          EMPKEY, GUITIPO_SINTETICO, g.folio, g.fecha, GCLIRUT,
          g.neto, iva, totdoc, `SINTETICO-${g.folio}`, dataUrl, REGLAIDL,
        ],
      );
      console.log(`[OK] guía sintética insertada: folio=${g.folio} (${g.file})`);
    }

    // 3. Buscar proforma existente vinculada a estas guías
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
      console.log(`[OK] proforma OC/HES creada: gfackey=${gfackey}`);
    }

    // 4. Preview del Mensaje (NO emite)
    const previewRes = await fetch(
      `${BASE_URL}/empresas/${EMPKEY}/facturas/proforma/${gfackey}/preview-mensaje`,
    );
    const preview = await previewRes.json();
    if (!previewRes.ok) {
      throw new Error(`preview-mensaje falló HTTP ${previewRes.status}: ${JSON.stringify(preview)}`);
    }

    console.log('\n=== Mensaje V5 completo (OC/HES) ===');
    console.log(preview.mensaje);

    console.log('\n=== Líneas de Detalle (3:|) y Referencia (5:|) ===');
    preview.mensaje.split('\r\n')
      .filter(l => l.startsWith('3:|') || l.startsWith('5:|'))
      .forEach(l => console.log(l));

    console.log('\nEsperado: línea 5:|801|555001|2026-01-10|Orden de Compra y línea 5:|HES|777002|2026-01-10|Hoja de Entrada de Servicios (además de las 5:|52|...| por guía)');

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
      console.log(`[OK] OC/HES → estado=${aprobarBody.estado}, folioSii=${aprobarBody.folioSii}`);
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
