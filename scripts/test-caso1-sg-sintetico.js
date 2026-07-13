#!/usr/bin/env node
/**
 * test-caso1-sg-sintetico.js — Prueba Caso 1 (S.G. — Según Guías) con 3 guías
 * 100% sintéticas, sin OC/HES, contra Enternet QA.
 *
 * No requiere guías reales ni backoffice-adapter corriendo. El XML de cada
 * guía se sirve como un `data:` URL embebido en `guifilepath`.
 *
 * Por defecto solo hace preview-mensaje (no toca Enternet). Con --aprobar
 * además llama a PATCH /aprobar y emite de verdad.
 *
 * Uso: node scripts/test-caso1-sg-sintetico.js [--reset] [--aprobar]
 * Requiere: servidor corriendo en localhost:3334 (pnpm run start:dev)
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const EMPKEY = '1163';
const GCLIRUT = '76407930-2';
const REGLAIDL = 'por_razon_social';
const RUT_EMISOR = '968880004'; // par vigente 2026-07-02 junto con FACTURACION_RUT_USUARIO=16714595-7
const GUITIPO_SINTETICO = 996; // distinto de 997 (oc-hes), 998 (caso4), 999 (por-producto)
const BASE_URL = 'http://localhost:3334/facturador-guias-backend/api';
const PERIODO = '2025-11'; // sin datos reales para este cliente, sin uso previo por otros scripts
const FIXTURE_PATH = path.join(__dirname, '..', 'test', 'fixtures', 'caso1-sg', 'guia.xml');

const GUIAS = [
  { folio: 990401, fecha: '2025-11-05', neto: 15000 },
  { folio: 990402, fecha: '2025-11-12', neto: 22000 },
  { folio: 990403, fecha: '2025-11-20', neto: 8000 },
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
    // 1. Cliente en modo SG (Caso 1 == modo por defecto)
    await db.query(
      `UPDATE gde.clientes SET modo_detalle = 'SG' WHERE empkey = $1 AND gclirut = $2`,
      [EMPKEY, GCLIRUT],
    );
    console.log(`[OK] cliente ${GCLIRUT} → modo_detalle=SG`);

    const folios = GUIAS.map(g => g.folio);
    const dataUrl = toDataUrl(FIXTURE_PATH);

    if (RESET) {
      await db.query(
        `DELETE FROM gde.facturaguias WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
        [EMPKEY, GUITIPO_SINTETICO, folios],
      );
      await db.query(
        `DELETE FROM gde.guia WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
        [EMPKEY, GUITIPO_SINTETICO, folios],
      );
      console.log('[OK] --reset: guías sintéticas previas de Caso 1 eliminadas');
    }

    // 2. Sembrar guías sintéticas (idempotente)
    const { rows: existentes } = await db.query(
      `SELECT guifolio FROM gde.guia WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
      [EMPKEY, GUITIPO_SINTETICO, folios],
    );
    const foliosExistentes = new Set(existentes.map(r => String(r.guifolio)));

    for (const g of GUIAS) {
      if (foliosExistentes.has(String(g.folio))) continue;
      const iva = Math.round(g.neto * 0.19);
      const totdoc = g.neto + iva;

      await db.query(
        `INSERT INTO gde.guia
           (empkey, guitipo, guifolio, guiestadoregistro, guiestadoacuse, guiestadoanulacion,
            guisuccod, guifechaemision, gclirut, guitotneto, guitotexento, guitotiva,
            guiotrosimpuestos, guitotdoc, guiiddoc, guifilepath, guiloteidl,
            guivaloragrupador, guireglaidl)
         VALUES ($1,$2,$3,'VIGENTE','','', 'SINTETICO', $4, $5, $6, 0, $7, 0, $8,
                 $9, $10, 'SINT-LOTE-CASO1', 'Enternet Sociedad Anonima', $11)`,
        [
          EMPKEY, GUITIPO_SINTETICO, g.folio, g.fecha, GCLIRUT,
          g.neto, iva, totdoc, `SINTETICO-${g.folio}`, dataUrl, REGLAIDL,
        ],
      );
      console.log(`[OK] guía sintética insertada: folio=${g.folio} fecha=${g.fecha} neto=${g.neto}`);
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
      console.log(`[OK] proforma Caso 1 creada: gfackey=${gfackey}`);
    }

    // 4. Preview del Mensaje (NO emite)
    const previewRes = await fetch(
      `${BASE_URL}/empresas/${EMPKEY}/facturas/proforma/${gfackey}/preview-mensaje`,
    );
    const preview = await previewRes.json();
    if (!previewRes.ok) {
      throw new Error(`preview-mensaje falló HTTP ${previewRes.status}: ${JSON.stringify(preview)}`);
    }

    console.log('\n=== Mensaje V5 completo (Caso 1 — S.G.) ===');
    console.log(preview.mensaje);

    console.log('\n=== Líneas de Detalle (3:|) y Referencia (5:|) ===');
    preview.mensaje.split('\r\n')
      .filter(l => l.startsWith('3:|') || l.startsWith('5:|'))
      .forEach(l => console.log(l));

    console.log('\nEsperado: 1 línea 3:|1|AFECTO|Facturación según guías período 2025-11|1|{sumNeto=45000}|0|{sumNeto} + 3 líneas 5:|52|{folio}|{fecha} (una por guía, sin RAZON REFERENCIA).');

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
      console.log(`[OK] Caso 1 → estado=${aprobarBody.estado}, folioSii=${aprobarBody.folioSii}`);
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
