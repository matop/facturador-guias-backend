#!/usr/bin/env node
/**
 * test-oc-hes-chunking-sintetico.js — Prueba OC o HES (NO combinadas) con N
 * guías 100% sintéticas contra Enternet QA, para confirmar el hallazgo
 * abierto de code review de PR #9: el umbral isGlobal
 * (guias.length + oc.length + hes.length > 40) se activa con exactamente 40
 * guías + 1 referencia externa (total 41), cayendo en el bloque EXPERIMENTAL
 * de mensaje-builder.ts confirmado roto en el parser de Enternet (ver
 * enternet-v5-referencia-global-en-progreso). Con 39 guías + 1 referencia
 * (total 40, no > 40) debería quedar en modo individual, ya confirmado en QA.
 *
 * Igual que test-caso4-global-sintetico.js: inserta la proforma +
 * facturaguias directo en BD (bypass de crearManual, que chunkea a
 * MAX_GUIAS_POR_FACTURA=40) para controlar el N exacto.
 *
 * Solo UNA de las N guías lleva la Referencia externa (OC o HES, nunca
 * ambas en esta prueba — la combinación ya se confirmó en folioSii=411212).
 * Las demás son guías "planas" sin <Referencia> (mismo fixture de Caso 4).
 *
 * Por defecto solo hace preview-mensaje (no toca Enternet). Con --aprobar
 * además llama a PATCH /aprobar y emite de verdad.
 *
 * Uso: node scripts/test-oc-hes-chunking-sintetico.js --tipo=oc|hes [--n=40] [--reset] [--aprobar]
 * Requiere: servidor corriendo en localhost:3334 (pnpm run start:dev)
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const EMPKEY = '1163';
const GCLIRUT = '76407930-2';
const REGLAIDL = 'por_razon_social';
const RUT_EMISOR = '968880004'; // par vigente 2026-07-02 junto con FACTURACION_RUT_USUARIO=16714595-7
const BASE_URL = 'http://localhost:3334/facturador-guias-backend/api';
const FIXTURES_DIR = path.join(__dirname, '..', 'test', 'fixtures');
const FIXTURE_PLANA = path.join(FIXTURES_DIR, 'caso4-global', 'guia-global.xml');

const NETO_POR_GUIA = 1000;
const FECHA = '2026-03-10'; // período sin datos reales para este cliente

function parseArgs() {
  const tipoArg = process.argv.find((a) => a.startsWith('--tipo='));
  const nArg = process.argv.find((a) => a.startsWith('--n='));
  const tipo = tipoArg ? tipoArg.split('=')[1] : null;
  if (tipo !== 'oc' && tipo !== 'hes') {
    throw new Error('Uso: --tipo=oc|hes es obligatorio');
  }
  const n = nArg ? parseInt(nArg.split('=')[1], 10) : 40;
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('--n debe ser un entero positivo');
  }
  return { tipo, n };
}

const { tipo, n: N_GUIAS } = parseArgs();
const RESET = process.argv.includes('--reset');
const APROBAR = process.argv.includes('--aprobar');

// GUITIPO/FOLIO_BASE distintos por (tipo, N) para que corridas con distinto N
// nunca compartan folios entre sí (evita que la búsqueda de "proforma
// existente" reutilice por error el set equivocado de guías).
const GUITIPO_SINTETICO = tipo === 'oc' ? 995 : 994;
const FOLIO_BASE = (tipo === 'oc' ? 990300 : 990400) + N_GUIAS * 100;
const FIXTURE_REFERENCIA = path.join(
  FIXTURES_DIR,
  'oc-hes',
  tipo === 'oc' ? 'guia-oc.xml' : 'guia-hes.xml',
);

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
    await db.query(
      `UPDATE gde.clientes SET modo_detalle = 'SG' WHERE empkey = $1 AND gclirut = $2`,
      [EMPKEY, GCLIRUT],
    );
    console.log(`[OK] cliente ${GCLIRUT} → modo_detalle=SG`);

    const folios = Array.from({ length: N_GUIAS }, (_, i) => FOLIO_BASE + i);
    console.log(
      `[INFO] tipo=${tipo.toUpperCase()} N=${N_GUIAS} → total referencias = ${N_GUIAS} guías + 1 ${tipo.toUpperCase()} = ${N_GUIAS + 1} (isGlobal ${N_GUIAS + 1 > 40 ? 'SI activa' : 'NO activa'}, umbral=40)`,
    );

    if (RESET) {
      await db.query(
        `DELETE FROM gde.facturaguias WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
        [EMPKEY, GUITIPO_SINTETICO, folios],
      );
      await db.query(
        `DELETE FROM gde.factura WHERE empkey = $1 AND gfackey IN (
           SELECT DISTINCT gfackey FROM gde.facturaguias WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])
         )`,
        [EMPKEY, GUITIPO_SINTETICO, folios],
      );
      await db.query(
        `DELETE FROM gde.guia WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
        [EMPKEY, GUITIPO_SINTETICO, folios],
      );
      console.log(`[OK] --reset: guías/proforma sintéticas previas de ${tipo}/N=${N_GUIAS} eliminadas`);
    }

    // Sembrar N guías sintéticas (idempotente) — solo la primera lleva la
    // Referencia externa (OC o HES), el resto son guías planas.
    const { rows: existentes } = await db.query(
      `SELECT guifolio FROM gde.guia WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
      [EMPKEY, GUITIPO_SINTETICO, folios],
    );
    const foliosExistentes = new Set(existentes.map((r) => String(r.guifolio)));
    const dataUrlReferencia = toDataUrl(FIXTURE_REFERENCIA);
    const dataUrlPlana = toDataUrl(FIXTURE_PLANA);
    const iva = Math.round(NETO_POR_GUIA * 0.19);
    const totdoc = NETO_POR_GUIA + iva;

    let nuevas = 0;
    for (let i = 0; i < folios.length; i++) {
      const folio = folios[i];
      if (foliosExistentes.has(String(folio))) continue;
      const dataUrl = i === 0 ? dataUrlReferencia : dataUrlPlana;
      await db.query(
        `INSERT INTO gde.guia
           (empkey, guitipo, guifolio, guiestadoregistro, guiestadoacuse, guiestadoanulacion,
            guisuccod, guifechaemision, gclirut, guitotneto, guitotexento, guitotiva,
            guiotrosimpuestos, guitotdoc, guiiddoc, guifilepath, guiloteidl,
            guivaloragrupador, guireglaidl)
         VALUES ($1,$2,$3,'VIGENTE','','', 'SINTETICO', $4, $5, $6, 0, $7, 0, $8,
                 $9, $10, $11, 'Enternet Sociedad Anonima', $12)`,
        [
          EMPKEY, GUITIPO_SINTETICO, folio, FECHA, GCLIRUT,
          NETO_POR_GUIA, iva, totdoc, `SINTETICO-${folio}`, dataUrl,
          `SINT-LOTE-${tipo.toUpperCase()}-${N_GUIAS}`, REGLAIDL,
        ],
      );
      nuevas++;
    }
    console.log(`[OK] ${nuevas} guías sintéticas nuevas insertadas (total ${folios.length}, folio con ${tipo.toUpperCase()}=${folios[0]})`);

    // Buscar proforma existente vinculada a este set exacto de guías
    const { rows: proformaExistente } = await db.query(
      `SELECT DISTINCT f.gfackey, f.estado FROM gde.factura f
       JOIN gde.facturaguias fg ON fg.empkey = f.empkey AND fg.gfackey = f.gfackey
       WHERE f.empkey = $1 AND fg.guitipo = $2 AND fg.guifolio = ANY($3::bigint[])
         AND f.estado IN ('BORRADOR', 'APROBADA', 'EMITIDA', 'FALLIDA')`,
      [EMPKEY, GUITIPO_SINTETICO, folios],
    );

    let gfackey;
    if (proformaExistente.length > 0) {
      gfackey = proformaExistente[0].gfackey;
      console.log(`[OK] reusando proforma existente: gfackey=${gfackey} (estado=${proformaExistente[0].estado})`);
    } else {
      await db.query('BEGIN');
      try {
        const [{ max }] = (
          await db.query(
            `SELECT COALESCE(MAX(gfacfolio::bigint), 0)::text AS max FROM gde.factura WHERE empkey = $1`,
            [EMPKEY],
          )
        ).rows;
        const gfacfolio = (parseInt(max, 10) + 1).toString();
        const totNeto = NETO_POR_GUIA * folios.length;
        const totIva = iva * folios.length;
        const totDoc = totdoc * folios.length;

        const {
          rows: [facturaRow],
        } = await db.query(
          `INSERT INTO gde.factura
             (empkey, gfactipo, gfacfolio, gfacestadoregistro, gfacestadoanulacion,
              gfacfecha, gfactotneto, gfactotexento, gfactotiva, gfactotimpuestos,
              gfactotdoc, gfacfilepath, gfacloteidl, gclirut, estado, es_proforma, reglaidl, rut_emisor)
           VALUES ($1,'33',$2,'','',$3,$4,'0',$5,'0',$6,'','',$7,'BORRADOR',true,$8,$9)
           RETURNING gfackey`,
          [EMPKEY, gfacfolio, FECHA, String(totNeto), String(totIva), String(totDoc), GCLIRUT, REGLAIDL, RUT_EMISOR],
        );
        gfackey = facturaRow.gfackey.toString();
        for (const folio of folios) {
          await db.query(
            `INSERT INTO gde.facturaguias (empkey, gfackey, guitipo, guifolio) VALUES ($1,$2,$3,$4)`,
            [EMPKEY, gfackey, GUITIPO_SINTETICO, folio],
          );
        }
        await db.query('COMMIT');
      } catch (err) {
        await db.query('ROLLBACK');
        throw err;
      }
      console.log(`[OK] proforma ${tipo.toUpperCase()}/N=${N_GUIAS} creada directo en BD: gfackey=${gfackey} (${folios.length} guías)`);
    }

    // Preview del Mensaje (NO emite)
    const previewRes = await fetch(
      `${BASE_URL}/empresas/${EMPKEY}/facturas/proforma/${gfackey}/preview-mensaje`,
    );
    const preview = await previewRes.json();
    if (!previewRes.ok) {
      throw new Error(`preview-mensaje falló HTTP ${previewRes.status}: ${JSON.stringify(preview)}`);
    }

    console.log(`\n=== Mensaje V5 completo (${tipo.toUpperCase()} solo, N=${N_GUIAS}) ===`);
    console.log(preview.mensaje);

    console.log('\n=== Líneas relevantes ===');
    preview.mensaje
      .split('\r\n')
      .filter((l) => l.startsWith('3:|') || l.includes('REFERENCIA') || l.startsWith('4:|') || l.startsWith('5:|'))
      .forEach((l) => console.log(l));

    if (APROBAR) {
      console.log(`\n=== Emitiendo de verdad (PATCH /aprobar) — gfackey=${gfackey} ===`);
      const aprobarRes = await fetch(
        `${BASE_URL}/empresas/${EMPKEY}/facturas/proforma/${gfackey}/aprobar`,
        { method: 'PATCH' },
      );
      const aprobarBody = await aprobarRes.json();
      if (!aprobarRes.ok) {
        console.error(`[FALLO HTTP ${aprobarRes.status}]`, JSON.stringify(aprobarBody, null, 2));
        process.exitCode = 1;
        return;
      }
      console.log(`[${aprobarBody.estado === 'EMITIDA' ? 'OK' : 'FALLO'}] ${tipo.toUpperCase()}/N=${N_GUIAS} → estado=${aprobarBody.estado}, folioSii=${aprobarBody.folioSii}`);
      console.log(JSON.stringify(aprobarBody, null, 2));
      if (aprobarBody.estado !== 'EMITIDA') process.exitCode = 1;
    } else {
      console.log('\n(no se pasó --aprobar: solo preview, no se emitió nada real)');
    }
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
