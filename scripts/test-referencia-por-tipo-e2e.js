#!/usr/bin/env node
/**
 * test-referencia-por-tipo-e2e.js — Ejercita extraeReferenciaPorTipo de
 * punta a punta contra QA real: POST /reglas → PUT regla+recomputar (agrupa
 * vía REGLA_REGISTRY) → POST sync (real, informativo) → POST generar → PATCH
 * aprobar.
 *
 * A diferencia de test-oc-hes-sintetico.js (que inserta las guías con
 * guireglaidl ya resuelto, saltándose la asignación de regla), este script
 * inserta las guías SIN regla asignada y deja que el flujo real
 * (PUT /clientes/:rut/regla?recomputar=true) las agrupe, ejercitando el
 * mismo REGLA_REGISTRY que usaría un cliente real recién sincronizado.
 *
 * No requiere backoffice-adapter para las guías (XML servido como `data:`
 * URL embebido en guifilepath, mismo patrón que el resto de scripts
 * sintéticos) — el paso de sync real igual se ejecuta contra backoffice-
 * adapter para dejar constancia de que el endpoint responde, aunque no
 * aporte guías nuevas para un periodo futuro sintético.
 *
 * Uso: node scripts/test-referencia-por-tipo-e2e.js [--reset] [--aprobar]
 * Requiere: servidor corriendo en localhost:3334 (pnpm run start:dev)
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const EMPKEY = '1163';
const GCLIRUT = '76407930-2';
const RUT_EMISOR = '968880004'; // CSV, par vigente junto con FACTURACION_RUT_USUARIO=16714595-7
const REGLAIDL = 'test_referencia_oc_hes';
const GUITIPO_SINTETICO = 993; // distinto de 994/995 (chunking), 996 (caso1), 997 (oc-hes), 998 (caso4), 999 (por-producto)
const BASE_URL = process.env.BASE_URL || 'http://localhost:3334/facturador-guias-backend/api';
const PERIODO = '2026-08'; // futuro: sin datos reales, sin colisión con proformas "activas" del mes en curso

const FIXTURES_DIR = path.join(__dirname, '..', 'test', 'fixtures', 'oc-hes');

const GUIAS = [
  { folio: 990301, file: 'guia-oc.xml', fecha: '2026-08-05', neto: 12000, folioEsperado: '555001' },
  { folio: 990302, file: 'guia-hes.xml', fecha: '2026-08-05', neto: 24000, folioEsperado: '777002' },
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

  let reglaidlPrevio = null;

  try {
    const folios = GUIAS.map((g) => g.folio);

    if (RESET) {
      await db.query(
        `DELETE FROM gde.facturaguias WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
        [EMPKEY, GUITIPO_SINTETICO, folios],
      );
      await db.query(
        `DELETE FROM gde.guia WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
        [EMPKEY, GUITIPO_SINTETICO, folios],
      );
      console.log('[OK] --reset: guías sintéticas previas eliminadas');
    }

    // 1. Guardar reglaidl vigente del cliente para restaurarlo al final (es
    //    un cliente de QA compartido entre varios scripts sintéticos).
    const { rows: clienteRows } = await db.query(
      `SELECT reglaidl FROM gde.clientes WHERE empkey = $1 AND gclirut = $2`,
      [EMPKEY, GCLIRUT],
    );
    reglaidlPrevio = clienteRows[0]?.reglaidl ?? null;
    console.log(`[OK] reglaidl vigente del cliente antes de empezar: ${JSON.stringify(reglaidlPrevio)}`);

    // 2. Sembrar guías SIN regla asignada (simula estado post-sync real, sin bypass)
    const { rows: existentes } = await db.query(
      `SELECT guifolio FROM gde.guia WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
      [EMPKEY, GUITIPO_SINTETICO, folios],
    );
    const foliosExistentes = new Set(existentes.map((r) => String(r.guifolio)));

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
                 $9, $10, 'SINT-LOTE-REFTIPO', NULL, NULL)`,
        [
          EMPKEY, GUITIPO_SINTETICO, g.folio, g.fecha, GCLIRUT,
          g.neto, iva, totdoc, `SINTETICO-${g.folio}`, dataUrl,
        ],
      );
      console.log(`[OK] guía sintética insertada SIN regla: folio=${g.folio} (${g.file})`);
    }

    // 3. POST /reglas — crear la regla extraeReferenciaPorTipo (real HTTP, ejercita el DTO)
    console.log(`\n=== Paso 1: POST /reglas (fn=extraeReferenciaPorTipo) ===`);
    const reglaRes = await fetch(`${BASE_URL}/reglas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reglaidl: REGLAIDL,
        regladescripcion: 'Agrupar por OC/HES (test E2E)',
        fn: 'extraeReferenciaPorTipo',
        tiposReferencia: ['801', 'HES'],
      }),
    });
    if (reglaRes.status === 201 || reglaRes.status === 200) {
      console.log(`[OK] regla '${REGLAIDL}' creada`);
    } else if (reglaRes.status === 409) {
      console.log(`[OK] regla '${REGLAIDL}' ya existía (reusando)`);
    } else {
      const body = await reglaRes.json();
      throw new Error(`POST /reglas falló HTTP ${reglaRes.status}: ${JSON.stringify(body)}`);
    }

    // 4. Asignar la regla a la empresa (no existe endpoint HTTP para esto — mismo patrón que scripts/test-proforma-flow.sh)
    await db.query(
      `INSERT INTO gde.reglaempresa (empkey, reglaidl) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [EMPKEY, REGLAIDL],
    );
    console.log(`[OK] reglaempresa: empkey=${EMPKEY} -> ${REGLAIDL} (ON CONFLICT DO NOTHING)`);

    // 5. PUT /clientes/:rut/regla con recomputar=true — dispara el REGLA_REGISTRY real
    console.log(`\n=== Paso 2: PUT /empresas/${EMPKEY}/clientes/${GCLIRUT}/regla (recomputar=true) ===`);
    const assignRes = await fetch(
      `${BASE_URL}/empresas/${EMPKEY}/clientes/${GCLIRUT}/regla`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reglaIdl: REGLAIDL, recomputar: true, periodo: PERIODO }),
      },
    );
    if (!assignRes.ok) {
      const body = await assignRes.json().catch(() => ({}));
      throw new Error(`assignRegla falló HTTP ${assignRes.status}: ${JSON.stringify(body)}`);
    }
    console.log(`[OK] regla asignada + recompute disparado para periodo=${PERIODO}`);

    // 6. Verificar en DB que el agrupador se computó vía extraeReferenciaPorTipo
    const { rows: recomputadas } = await db.query(
      `SELECT guifolio, guireglaidl, guivaloragrupador FROM gde.guia
       WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[]) ORDER BY guifolio`,
      [EMPKEY, GUITIPO_SINTETICO, folios],
    );
    console.log('\n=== Verificación de agrupadores post-recompute ===');
    let algunaFalla = false;
    for (const row of recomputadas) {
      const esperado = GUIAS.find((g) => g.folio === Number(row.guifolio))?.folioEsperado;
      const ok = row.guivaloragrupador?.trim() === esperado;
      if (!ok) algunaFalla = true;
      console.log(
        `  folio=${row.guifolio} guireglaidl=${JSON.stringify(row.guireglaidl?.trim())} guivaloragrupador=${JSON.stringify(row.guivaloragrupador?.trim())} (esperado=${esperado}) ${ok ? 'OK' : 'FALLO'}`,
      );
    }
    if (algunaFalla) {
      throw new Error('extraeReferenciaPorTipo no agrupó como se esperaba — ver detalle arriba');
    }

    // 7. Sync real (informativo — periodo futuro sintético, se espera 0 guías nuevas)
    console.log(`\n=== Paso 3: POST /empresas/${EMPKEY}/sync?rut=${RUT_EMISOR}&periodo=${PERIODO} (real, informativo) ===`);
    const syncRes = await fetch(
      `${BASE_URL}/empresas/${EMPKEY}/sync?rut=${RUT_EMISOR}&periodo=${PERIODO}`,
      { method: 'POST' },
    );
    const syncBody = await syncRes.json().catch(() => ({}));
    console.log(`[${syncRes.ok ? 'OK' : 'WARN'}] sync HTTP ${syncRes.status}: ${JSON.stringify(syncBody)}`);

    // 8. Generar proformas
    console.log(`\n=== Paso 4: POST /empresas/${EMPKEY}/facturas/proforma/generar?periodo=${PERIODO} ===`);
    const generarRes = await fetch(
      `${BASE_URL}/empresas/${EMPKEY}/facturas/proforma/generar?periodo=${PERIODO}`,
      { method: 'POST' },
    );
    const generarBody = await generarRes.json();
    if (!generarRes.ok) {
      throw new Error(`generar falló HTTP ${generarRes.status}: ${JSON.stringify(generarBody)}`);
    }
    console.log(`[OK] generar -> ${JSON.stringify(generarBody)}`);

    // 9. Ubicar las proformas creadas para nuestras guías (por grupo, cada folio queda en su propio agrupador)
    const { rows: proformas } = await db.query(
      `SELECT DISTINCT f.gfackey, f.estado FROM gde.factura f
       JOIN gde.facturaguias fg ON fg.empkey = f.empkey AND fg.gfackey = f.gfackey
       WHERE f.empkey = $1 AND fg.guitipo = $2 AND fg.guifolio = ANY($3::bigint[])
       ORDER BY f.gfackey`,
      [EMPKEY, GUITIPO_SINTETICO, folios],
    );
    if (proformas.length === 0) {
      throw new Error('No se encontró ninguna proforma para las guías sintéticas');
    }
    console.log(`[OK] proformas encontradas: ${proformas.map((p) => `gfackey=${p.gfackey}(${p.estado})`).join(', ')}`);

    // OPEN-2: 1 Factura : 1 OC : 1 HES — cada guivaloragrupador distinto debe
    // caer en su propia Proforma, no mezclarse en una sola por cliente+regla.
    if (proformas.length !== GUIAS.length) {
      throw new Error(
        `Particionado por guivaloragrupador falló: se esperaban ${GUIAS.length} proformas (una por OC/HES), se encontraron ${proformas.length}`,
      );
    }
    console.log(`[OK] particionado por guivaloragrupador: ${proformas.length} proformas (1 por OC/HES), OPEN-2 resuelto`);

    for (const { gfackey } of proformas) {
      const previewRes = await fetch(
        `${BASE_URL}/empresas/${EMPKEY}/facturas/proforma/${gfackey}/preview-mensaje`,
      );
      const preview = await previewRes.json();
      if (!previewRes.ok) {
        throw new Error(`preview-mensaje falló HTTP ${previewRes.status}: ${JSON.stringify(preview)}`);
      }
      console.log(`\n--- Preview Mensaje gfackey=${gfackey} ---`);
      preview.mensaje
        .split('\r\n')
        .filter((l) => l.startsWith('3:|') || l.startsWith('5:|'))
        .forEach((l) => console.log(`  ${l}`));

      if (APROBAR) {
        console.log(`\n=== PATCH /aprobar gfackey=${gfackey} ===`);
        const aprobarRes = await fetch(
          `${BASE_URL}/empresas/${EMPKEY}/facturas/proforma/${gfackey}/aprobar`,
          { method: 'PATCH' },
        );
        const aprobarBody = await aprobarRes.json();
        if (!aprobarRes.ok) {
          throw new Error(`aprobar falló HTTP ${aprobarRes.status}: ${JSON.stringify(aprobarBody)}`);
        }
        console.log(`[OK] gfackey=${gfackey} -> estado=${aprobarBody.estado}, folioSii=${aprobarBody.folioSii}`);
      }
    }

    if (!APROBAR) {
      console.log('\n(no se pasó --aprobar: solo preview, no se emitió nada real)');
    }

    console.log('\n=== FIN: extraeReferenciaPorTipo ejercitado de punta a punta contra QA real ===');
  } finally {
    // 10. Restaurar reglaidl previo del cliente compartido de QA — este cliente
    //     lo reusan otros scripts sintéticos (caso1/caso4/por-producto) que
    //     asumen 'por_razon_social', y assignRegla() sobreescribe SIEMPRE.
    try {
      await db.query(
        `UPDATE gde.clientes SET reglaidl = $3 WHERE empkey = $1 AND gclirut = $2`,
        [EMPKEY, GCLIRUT, reglaidlPrevio],
      );
      console.log(`\n[OK] reglaidl del cliente restaurado a: ${JSON.stringify(reglaidlPrevio)}`);
    } catch (err) {
      console.error(`[WARN] no se pudo restaurar reglaidl previo: ${err.message}`);
    }
    await db.end();
  }
}

main().catch((err) => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
