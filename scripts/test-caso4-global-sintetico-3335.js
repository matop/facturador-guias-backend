#!/usr/bin/env node
/**
 * test-caso4-global-sintetico.js — Prueba Caso 4 (Global, >40 referencias)
 * con 41 guías 100% sintéticas, contra Enternet QA.
 *
 * IMPORTANTE: `crearManual`/`generar` (API pública) chunkean a
 * MAX_GUIAS_POR_FACTURA=40 guías por proforma — exactamente el umbral en el
 * que Caso 4 (isGlobal = guias.length > 40) se activaría. Por eso este script
 * NO usa esos endpoints: inserta la proforma + facturaguias directamente en
 * BD (mismo INSERT que `insertProforma` en facturas.service.ts) para poder
 * armar una proforma con 41 guías en una sola factura.
 *
 * No requiere guías reales ni backoffice-adapter corriendo. El XML de cada
 * guía se sirve como un `data:` URL embebido en `guifilepath` (reusa el mismo
 * fixture para las 41 guías — en modo SG solo se lee el XML de la primera).
 *
 * Por defecto solo hace preview-mensaje (no toca Enternet). Con --aprobar
 * además llama a PATCH /aprobar y emite de verdad.
 *
 * Uso: node scripts/test-caso4-global-sintetico.js [--reset] [--aprobar]
 * Requiere: servidor corriendo en localhost:3334 (pnpm run start:dev)
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const EMPKEY = '1163';
const GCLIRUT = '76407930-2';
const REGLAIDL = 'por_razon_social';
const RUT_EMISOR = '968880004'; // par vigente 2026-07-02 junto con FACTURACION_RUT_USUARIO=16714595-7
const GUITIPO_SINTETICO = 998; // distinto de 999 (usado por test-por-producto-sintetico.js)
const BASE_URL = 'http://localhost:3335/facturador-guias-backend/api';
const FIXTURE_PATH = path.join(__dirname, '..', 'test', 'fixtures', 'caso4-global', 'guia-global.xml');

const N_GUIAS = 41; // > MAX_REFERENCIAS_INDIVIDUALES (40) para activar isGlobal
const FOLIO_BASE = 990201;
const FECHA = '2026-02-10'; // período sin datos reales para este cliente
const NETO_POR_GUIA = 1000;

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
    // 1. Cliente en modo SG — Global anula el modo igual, pero SG evita que
    //    _construirDetalleItems fetchee el XML de las 40 guías restantes.
    await db.query(
      `UPDATE gde.clientes SET modo_detalle = 'SG' WHERE empkey = $1 AND gclirut = $2`,
      [EMPKEY, GCLIRUT],
    );
    console.log(`[OK] cliente ${GCLIRUT} → modo_detalle=SG`);

    const folios = Array.from({ length: N_GUIAS }, (_, i) => FOLIO_BASE + i);

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
      console.log('[OK] --reset: guías/proforma sintéticas previas de Caso 4 eliminadas');
    }

    // 2. Sembrar 41 guías sintéticas (idempotente)
    const { rows: existentes } = await db.query(
      `SELECT guifolio FROM gde.guia WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
      [EMPKEY, GUITIPO_SINTETICO, folios],
    );
    const foliosExistentes = new Set(existentes.map(r => String(r.guifolio)));
    const dataUrl = toDataUrl(FIXTURE_PATH);
    const iva = Math.round(NETO_POR_GUIA * 0.19);
    const totdoc = NETO_POR_GUIA + iva;

    for (const folio of folios) {
      if (foliosExistentes.has(String(folio))) continue;
      await db.query(
        `INSERT INTO gde.guia
           (empkey, guitipo, guifolio, guiestadoregistro, guiestadoacuse, guiestadoanulacion,
            guisuccod, guifechaemision, gclirut, guitotneto, guitotexento, guitotiva,
            guiotrosimpuestos, guitotdoc, guiiddoc, guifilepath, guiloteidl,
            guivaloragrupador, guireglaidl)
         VALUES ($1,$2,$3,'VIGENTE','','', 'SINTETICO', $4, $5, $6, 0, $7, 0, $8,
                 $9, $10, 'SINT-LOTE-CASO4', 'Enternet Sociedad Anonima', $11)`,
        [
          EMPKEY, GUITIPO_SINTETICO, folio, FECHA, GCLIRUT,
          NETO_POR_GUIA, iva, totdoc, `SINTETICO-${folio}`, dataUrl, REGLAIDL,
        ],
      );
    }
    console.log(`[OK] ${folios.length - foliosExistentes.size} guías sintéticas nuevas insertadas (total ${folios.length})`);

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
      // Insert directo (bypass de crearManual, que chunkea a 40 guías/proforma)
      gfackey = await db.query('SELECT 1').then(async () => {
        await db.query('BEGIN');
        try {
          const [{ max }] = (await db.query(
            `SELECT COALESCE(MAX(gfacfolio::bigint), 0)::text AS max FROM gde.factura WHERE empkey = $1`,
            [EMPKEY],
          )).rows;
          const gfacfolio = (parseInt(max) + 1).toString();
          const totNeto = NETO_POR_GUIA * folios.length;
          const totIva = iva * folios.length;
          const totDoc = totdoc * folios.length;
          const today = new Date().toISOString().substring(0, 10);

          const { rows: [facturaRow] } = await db.query(
            `INSERT INTO gde.factura
               (empkey, gfactipo, gfacfolio, gfacestadoregistro, gfacestadoanulacion,
                gfacfecha, gfactotneto, gfactotexento, gfactotiva, gfactotimpuestos,
                gfactotdoc, gfacfilepath, gfacloteidl, gclirut, estado, es_proforma, reglaidl, rut_emisor)
             VALUES ($1,'33',$2,'','',$3,$4,'0',$5,'0',$6,'','',$7,'BORRADOR',true,$8,$9)
             RETURNING gfackey`,
            [EMPKEY, gfacfolio, today, String(totNeto), String(totIva), String(totDoc), GCLIRUT, REGLAIDL, RUT_EMISOR],
          );
          const key = facturaRow.gfackey.toString();
          for (const folio of folios) {
            await db.query(
              `INSERT INTO gde.facturaguias (empkey, gfackey, guitipo, guifolio) VALUES ($1,$2,$3,$4)`,
              [EMPKEY, key, GUITIPO_SINTETICO, folio],
            );
          }
          await db.query('COMMIT');
          return key;
        } catch (err) {
          await db.query('ROLLBACK');
          throw err;
        }
      });
      console.log(`[OK] proforma Caso 4 creada directo en BD: gfackey=${gfackey} (41 guías)`);
    }

    // 4. Preview del Mensaje (NO emite)
    const previewRes = await fetch(
      `${BASE_URL}/empresas/${EMPKEY}/facturas/proforma/${gfackey}/preview-mensaje`,
    );
    const preview = await previewRes.json();
    if (!previewRes.ok) {
      throw new Error(`preview-mensaje falló HTTP ${previewRes.status}: ${JSON.stringify(preview)}`);
    }

    console.log('\n=== Mensaje V5 completo (Caso 4 — Global) ===');
    console.log(preview.mensaje);

    console.log('\n=== Líneas relevantes ===');
    preview.mensaje.split('\r\n')
      .filter(l => l.startsWith('3:|') || l.includes('REFERENCIA') || l.startsWith('4:|') || l.startsWith('5:|'))
      .forEach(l => console.log(l));

    console.log('\nEsperado: 1 línea 3:| "Segun Guias:" con 41 folios en DESCRIPCION ADICIONAL, sin líneas 4:|/5:|, con TIPO/FOLIO/ACCION REFERENCIA en el encabezado 1:|');

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
      console.log(`[OK] Caso 4 → estado=${aprobarBody.estado}, folioSii=${aprobarBody.folioSii}`);
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
