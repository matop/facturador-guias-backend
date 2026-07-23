#!/usr/bin/env node
/**
 * test-multi-cliente-multi-regla-e2e.js — Sesión 3 del plan de verificación
 * E2E (docs/PLAN-verificacion-e2e-completa.md): confirma que un solo ciclo
 * POST /sync + POST /generar, sin filtrar por cliente, no mezcla guías ni
 * proformas entre 2 clientes con reglas de agrupación DISTINTAS bajo el
 * mismo empkey.
 *
 * - Cliente existente (76407930-2): regla test_referencia_oc_hes
 *   (extraeReferenciaPorTipo), mismo patrón que test-referencia-por-tipo-e2e.js.
 * - Cliente nuevo sintético (81234567-2): regla por_comuna (extraeTagLista),
 *   con 2 guías de comunas distintas para que también parta en 2 proformas.
 *
 * Igual que test-referencia-por-tipo-e2e.js, las guías se insertan SIN regla
 * asignada (guireglaidl/guivaloragrupador NULL) y el agrupador real se
 * calcula vía PUT /clientes/:rut/regla?recomputar=true (fetch de XML por
 * guía individual) — NO vía POST /sync, que en syncFromReporte computa el
 * agrupador una sola vez por cliente y lo replicaría erróneamente a todas
 * sus guías del batch. POST /sync en este script es puramente informativo
 * (periodo futuro sintético, se esperan 0 guías nuevas).
 *
 * Uso: node scripts/test-multi-cliente-multi-regla-e2e.js [--reset] [--aprobar]
 * Requiere: servidor corriendo en localhost:3334 (pnpm run start:dev)
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const EMPKEY = '1163';
const RUT_EMISOR = '968880004'; // CSV, par vigente junto con FACTURACION_RUT_USUARIO=16714595-7
const BASE_URL = process.env.BASE_URL || 'http://localhost:3334/facturador-guias-backend/api';
const PERIODO = '2026-09'; // futuro: próximo período libre (usados: 2025-11, 2025-12, 2026-01, 2026-02-10, 2026-03-10, 2026-04, 2026-08)

const FIXTURES_DIR = path.join(__dirname, '..', 'test', 'fixtures', 'oc-hes');

// Cliente existente — regla extraeReferenciaPorTipo (OC/HES), guitipo=993 reservado
// por la Sesión 2 (folios 990301/990302 en periodo 2026-08); acá van folios nuevos.
const GCLIRUT_EXISTENTE = '76407930-2';
const REGLAIDL_EXISTENTE = 'test_referencia_oc_hes';
const GUITIPO_EXISTENTE = 993;
const GUIAS_EXISTENTE = [
  { folio: 990303, file: 'guia-oc.xml', fecha: '2026-09-05', neto: 12000, folioEsperado: '555001' },
  { folio: 990304, file: 'guia-hes.xml', fecha: '2026-09-05', neto: 24000, folioEsperado: '777002' },
];

// Cliente nuevo sintético — regla por_comuna (extraeTagLista sobre CmnaRecep),
// guitipo=992 (libre; reservados hoy: 993-999). RUT con dígito verificador
// válido (módulo 11, mismo algoritmo que valida 76407930-2), no reservado
// por ningún otro script sintético.
const GCLIRUT_NUEVO = '81234567-2';
const GCLINOM_NUEVO = 'Cliente Sintético Multi-Regla';
const REGLAIDL_NUEVO = 'por_comuna';
const GUITIPO_NUEVO = 992;
const GUIAS_NUEVO = [
  { folio: 990101, comuna: 'SANTIAGO', fecha: '2026-09-05', neto: 15000 },
  { folio: 990102, comuna: 'PROVIDENCIA', fecha: '2026-09-05', neto: 18000 },
];

const RESET = process.argv.includes('--reset');
const APROBAR = process.argv.includes('--aprobar');

function toDataUrlFromFile(xmlPath) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  return `data:text/xml;base64,${Buffer.from(xml, 'utf8').toString('base64')}`;
}

function toDataUrlFromXml(xml) {
  return `data:text/xml;base64,${Buffer.from(xml, 'utf8').toString('base64')}`;
}

function buildXmlComuna(comuna) {
  return (
    `<DTE><Documento><Encabezado><Emisor><RUTEmisor>96888000-4</RUTEmisor>` +
    `<RznSoc>Enternet SA</RznSoc><GiroEmis>Transporte</GiroEmis></Emisor>` +
    `<Receptor><RUTRecep>${GCLIRUT_NUEVO}</RUTRecep><RznSocRecep>${GCLINOM_NUEVO}</RznSocRecep>` +
    `<DirRecep>Av Multi 1</DirRecep><CmnaRecep>${comuna}</CmnaRecep><CiudadRecep>${comuna}</CiudadRecep>` +
    `<GiroRecep>Comercio</GiroRecep></Receptor></Encabezado></Documento></DTE>`
  );
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

  // undefined = aún NO capturado. El finally sólo restaura si esto quedó
  // definido con el valor real; así una falla temprana (p.ej. el reset) nunca
  // sobreescribe con un centinela y corrompe al cliente compartido.
  let reglaidlPrevioExistente;

  try {
    const foliosNuevo = GUIAS_NUEVO.map((g) => g.folio);
    const foliosExistente = GUIAS_EXISTENTE.map((g) => g.folio);

    // 1. Capturar el reglaidl vigente del cliente EXISTENTE (compartido con
    //    otros scripts sintéticos) ANTES de cualquier operación destructiva —
    //    el reset puede fallar, y necesitamos el valor real para restaurarlo.
    const { rows: clienteRows } = await db.query(
      `SELECT reglaidl FROM gde.clientes WHERE empkey = $1 AND gclirut = $2`,
      [EMPKEY, GCLIRUT_EXISTENTE],
    );
    reglaidlPrevioExistente = clienteRows[0]?.reglaidl ?? null;
    console.log(`[OK] reglaidl vigente de ${GCLIRUT_EXISTENTE} antes de empezar: ${JSON.stringify(reglaidlPrevioExistente)}`);

    if (RESET) {
      await db.query(
        `DELETE FROM gde.facturaguias WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
        [EMPKEY, GUITIPO_NUEVO, foliosNuevo],
      );
      await db.query(
        `DELETE FROM gde.guia WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
        [EMPKEY, GUITIPO_NUEVO, foliosNuevo],
      );
      await db.query(
        `DELETE FROM gde.facturaguias WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
        [EMPKEY, GUITIPO_EXISTENTE, foliosExistente],
      );
      await db.query(
        `DELETE FROM gde.guia WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
        [EMPKEY, GUITIPO_EXISTENTE, foliosExistente],
      );
      // El cliente nuevo es dedicado a esta prueba: además de sus guías, hay
      // que borrar también sus proformas (facturaguias/factura) de corridas
      // previas — la FK ifactura1 (factura.gclirut -> clientes) impide borrar
      // el cliente mientras le queden facturas asociadas, aunque ya hayan
      // quedado huérfanas de facturaguias.
      await db.query(
        `DELETE FROM gde.facturaguias WHERE empkey = $1 AND gfackey IN (
           SELECT gfackey FROM gde.factura WHERE empkey = $1 AND gclirut = $2
         )`,
        [EMPKEY, GCLIRUT_NUEVO],
      );
      await db.query(`DELETE FROM gde.factura WHERE empkey = $1 AND gclirut = $2`, [EMPKEY, GCLIRUT_NUEVO]);
      await db.query(`DELETE FROM gde.clientes WHERE empkey = $1 AND gclirut = $2`, [EMPKEY, GCLIRUT_NUEVO]);
      console.log('[OK] --reset: guías/proformas/cliente sintéticos previos eliminados');
    }

    // 2. Crear el cliente nuevo con reglaidl=NULL (FK iclientes1 exige que
    //    (empkey, reglaidl) ya exista en reglaempresa antes de setear reglaidl
    //    en el cliente — se asigna después vía PUT /clientes/:rut/regla).
    const { rows: clienteNuevoRows } = await db.query(
      `SELECT gclirut FROM gde.clientes WHERE empkey = $1 AND gclirut = $2`,
      [EMPKEY, GCLIRUT_NUEVO],
    );
    if (clienteNuevoRows.length === 0) {
      await db.query(
        `INSERT INTO gde.clientes (empkey, gclirut, gclinom, reglaidl) VALUES ($1, $2, $3, NULL)`,
        [EMPKEY, GCLIRUT_NUEVO, GCLINOM_NUEVO],
      );
      console.log(`[OK] cliente nuevo insertado: ${GCLIRUT_NUEVO} (reglaidl=NULL)`);
    } else {
      console.log(`[OK] cliente nuevo ya existía: ${GCLIRUT_NUEVO}`);
    }

    // 3. Sembrar guías SIN regla asignada para ambos clientes (simula estado
    //    post-sync real, sin bypass).
    const { rows: existentesNuevo } = await db.query(
      `SELECT guifolio FROM gde.guia WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
      [EMPKEY, GUITIPO_NUEVO, foliosNuevo],
    );
    const foliosExistentesNuevo = new Set(existentesNuevo.map((r) => String(r.guifolio)));

    for (const g of GUIAS_NUEVO) {
      if (foliosExistentesNuevo.has(String(g.folio))) continue;
      const dataUrl = toDataUrlFromXml(buildXmlComuna(g.comuna));
      const iva = Math.round(g.neto * 0.19);
      const totdoc = g.neto + iva;
      await db.query(
        `INSERT INTO gde.guia
           (empkey, guitipo, guifolio, guiestadoregistro, guiestadoacuse, guiestadoanulacion,
            guisuccod, guifechaemision, gclirut, guitotneto, guitotexento, guitotiva,
            guiotrosimpuestos, guitotdoc, guiiddoc, guifilepath, guiloteidl,
            guivaloragrupador, guireglaidl)
         VALUES ($1,$2,$3,'VIGENTE','','', 'SINTETICO', $4, $5, $6, 0, $7, 0, $8,
                 $9, $10, 'SINT-LOTE-MULTICLIENTE', NULL, NULL)`,
        [
          EMPKEY, GUITIPO_NUEVO, g.folio, g.fecha, GCLIRUT_NUEVO,
          g.neto, iva, totdoc, `SINTETICO-${g.folio}`, dataUrl,
        ],
      );
      console.log(`[OK] guía sintética insertada SIN regla: folio=${g.folio} (comuna=${g.comuna})`);
    }

    const { rows: existentesExistente } = await db.query(
      `SELECT guifolio FROM gde.guia WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[])`,
      [EMPKEY, GUITIPO_EXISTENTE, foliosExistente],
    );
    const foliosExistentesExistente = new Set(existentesExistente.map((r) => String(r.guifolio)));

    for (const g of GUIAS_EXISTENTE) {
      if (foliosExistentesExistente.has(String(g.folio))) continue;
      const dataUrl = toDataUrlFromFile(path.join(FIXTURES_DIR, g.file));
      const iva = Math.round(g.neto * 0.19);
      const totdoc = g.neto + iva;
      await db.query(
        `INSERT INTO gde.guia
           (empkey, guitipo, guifolio, guiestadoregistro, guiestadoacuse, guiestadoanulacion,
            guisuccod, guifechaemision, gclirut, guitotneto, guitotexento, guitotiva,
            guiotrosimpuestos, guitotdoc, guiiddoc, guifilepath, guiloteidl,
            guivaloragrupador, guireglaidl)
         VALUES ($1,$2,$3,'VIGENTE','','', 'SINTETICO', $4, $5, $6, 0, $7, 0, $8,
                 $9, $10, 'SINT-LOTE-MULTICLIENTE', NULL, NULL)`,
        [
          EMPKEY, GUITIPO_EXISTENTE, g.folio, g.fecha, GCLIRUT_EXISTENTE,
          g.neto, iva, totdoc, `SINTETICO-${g.folio}`, dataUrl,
        ],
      );
      console.log(`[OK] guía sintética insertada SIN regla: folio=${g.folio} (${g.file})`);
    }

    // 4. Verificar que las 2 reglas ya existen en el catálogo (gde.regla) —
    //    por_comuna es seed global; test_referencia_oc_hes se crea ad-hoc si
    //    hiciera falta (idempotente, mismo patrón que la Sesión 2).
    console.log(`\n=== Paso 1: verificar catálogo de reglas ===`);
    const { rows: reglasCatalogo } = await db.query(
      `SELECT reglaidl FROM gde.regla WHERE reglaidl IN ($1, $2)`,
      [REGLAIDL_NUEVO, REGLAIDL_EXISTENTE],
    );
    const reglaidlsCatalogo = new Set(reglasCatalogo.map((r) => r.reglaidl.trim()));
    if (!reglaidlsCatalogo.has(REGLAIDL_NUEVO)) {
      throw new Error(`regla '${REGLAIDL_NUEVO}' no existe en gde.regla — se esperaba que ya estuviera seedeada`);
    }
    console.log(`[OK] regla '${REGLAIDL_NUEVO}' existe en el catálogo`);

    if (!reglaidlsCatalogo.has(REGLAIDL_EXISTENTE)) {
      const reglaRes = await fetch(`${BASE_URL}/reglas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reglaidl: REGLAIDL_EXISTENTE,
          regladescripcion: 'Agrupar por OC/HES (test E2E)',
          fn: 'extraeReferenciaPorTipo',
          tiposReferencia: ['801', 'HES'],
        }),
      });
      if (reglaRes.status !== 201 && reglaRes.status !== 200 && reglaRes.status !== 409) {
        const body = await reglaRes.json();
        throw new Error(`POST /reglas falló HTTP ${reglaRes.status}: ${JSON.stringify(body)}`);
      }
      console.log(`[OK] regla '${REGLAIDL_EXISTENTE}' creada`);
    } else {
      console.log(`[OK] regla '${REGLAIDL_EXISTENTE}' ya existía en el catálogo`);
    }

    // 5. Asegurar que ambas reglas están habilitadas para la empresa (no
    //    existe endpoint HTTP para esto — mismo patrón que scripts/test-proforma-flow.sh).
    await db.query(
      `INSERT INTO gde.reglaempresa (empkey, reglaidl) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [EMPKEY, REGLAIDL_NUEVO],
    );
    await db.query(
      `INSERT INTO gde.reglaempresa (empkey, reglaidl) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [EMPKEY, REGLAIDL_EXISTENTE],
    );
    console.log(`[OK] reglaempresa: empkey=${EMPKEY} -> ${REGLAIDL_NUEVO}, ${REGLAIDL_EXISTENTE} (ON CONFLICT DO NOTHING)`);

    // 6. PUT /clientes/:rut/regla con recomputar=true para AMBOS clientes —
    //    dispara el REGLA_REGISTRY real, una guía a la vez.
    console.log(`\n=== Paso 2: asignar regla + recompute a ambos clientes ===`);
    const assignNuevoRes = await fetch(
      `${BASE_URL}/empresas/${EMPKEY}/clientes/${GCLIRUT_NUEVO}/regla`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reglaIdl: REGLAIDL_NUEVO, recomputar: true, periodo: PERIODO }),
      },
    );
    if (!assignNuevoRes.ok) {
      const body = await assignNuevoRes.json().catch(() => ({}));
      throw new Error(`assignRegla (${GCLIRUT_NUEVO}) falló HTTP ${assignNuevoRes.status}: ${JSON.stringify(body)}`);
    }
    console.log(`[OK] regla '${REGLAIDL_NUEVO}' asignada + recompute disparado para ${GCLIRUT_NUEVO}`);

    const assignExistenteRes = await fetch(
      `${BASE_URL}/empresas/${EMPKEY}/clientes/${GCLIRUT_EXISTENTE}/regla`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reglaIdl: REGLAIDL_EXISTENTE, recomputar: true, periodo: PERIODO }),
      },
    );
    if (!assignExistenteRes.ok) {
      const body = await assignExistenteRes.json().catch(() => ({}));
      throw new Error(`assignRegla (${GCLIRUT_EXISTENTE}) falló HTTP ${assignExistenteRes.status}: ${JSON.stringify(body)}`);
    }
    console.log(`[OK] regla '${REGLAIDL_EXISTENTE}' asignada + recompute disparado para ${GCLIRUT_EXISTENTE}`);

    // 7. Verificar en DB que ambos agrupadores se computaron correctamente,
    //    sin mezcla entre clientes.
    console.log('\n=== Verificación de agrupadores post-recompute ===');
    let algunaFalla = false;

    const { rows: recomputadasNuevo } = await db.query(
      `SELECT guifolio, guireglaidl, guivaloragrupador FROM gde.guia
       WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[]) ORDER BY guifolio`,
      [EMPKEY, GUITIPO_NUEVO, foliosNuevo],
    );
    for (const row of recomputadasNuevo) {
      const esperado = GUIAS_NUEVO.find((g) => g.folio === Number(row.guifolio))?.comuna;
      const ok = row.guivaloragrupador?.trim() === esperado;
      if (!ok) algunaFalla = true;
      console.log(
        `  [${GCLIRUT_NUEVO}] folio=${row.guifolio} guireglaidl=${JSON.stringify(row.guireglaidl?.trim())} guivaloragrupador=${JSON.stringify(row.guivaloragrupador?.trim())} (esperado=${esperado}) ${ok ? 'OK' : 'FALLO'}`,
      );
    }

    const { rows: recomputadasExistente } = await db.query(
      `SELECT guifolio, guireglaidl, guivaloragrupador FROM gde.guia
       WHERE empkey = $1 AND guitipo = $2 AND guifolio = ANY($3::bigint[]) ORDER BY guifolio`,
      [EMPKEY, GUITIPO_EXISTENTE, foliosExistente],
    );
    for (const row of recomputadasExistente) {
      const esperado = GUIAS_EXISTENTE.find((g) => g.folio === Number(row.guifolio))?.folioEsperado;
      const ok = row.guivaloragrupador?.trim() === esperado;
      if (!ok) algunaFalla = true;
      console.log(
        `  [${GCLIRUT_EXISTENTE}] folio=${row.guifolio} guireglaidl=${JSON.stringify(row.guireglaidl?.trim())} guivaloragrupador=${JSON.stringify(row.guivaloragrupador?.trim())} (esperado=${esperado}) ${ok ? 'OK' : 'FALLO'}`,
      );
    }

    if (algunaFalla) {
      throw new Error('recompute no agrupó como se esperaba en al menos un cliente — ver detalle arriba');
    }

    // 8. Sync real (informativo — periodo futuro sintético, se espera 0 guías
    //    nuevas; un solo llamado cubre ambos clientes de la empresa).
    console.log(`\n=== Paso 3: POST /empresas/${EMPKEY}/sync?rut=${RUT_EMISOR}&periodo=${PERIODO} (real, informativo) ===`);
    const syncRes = await fetch(
      `${BASE_URL}/empresas/${EMPKEY}/sync?rut=${RUT_EMISOR}&periodo=${PERIODO}`,
      { method: 'POST' },
    );
    const syncBody = await syncRes.json().catch(() => ({}));
    console.log(`[${syncRes.ok ? 'OK' : 'WARN'}] sync HTTP ${syncRes.status}: ${JSON.stringify(syncBody)}`);

    // 9. Generar proformas — una sola llamada, sin filtrar por cliente, debe
    //    cubrir a los 2 clientes de la empresa.
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

    // 10. Verificar en DB: deben aparecer exactamente 4 proformas (2 comunas +
    //     2 OC/HES), cada una con guías de un único gclirut (sin mezcla).
    const { rows: proformas } = await db.query(
      `SELECT f.gfackey, f.estado, COUNT(DISTINCT g.gclirut) AS distinct_clientes,
              array_agg(DISTINCT trim(g.gclirut)) AS clientes
       FROM gde.factura f
       JOIN gde.facturaguias fg ON fg.empkey = f.empkey AND fg.gfackey = f.gfackey
       JOIN gde.guia g ON g.empkey = fg.empkey AND g.guitipo = fg.guitipo AND g.guifolio = fg.guifolio
       WHERE f.empkey = $1
         AND ((fg.guitipo = $2 AND fg.guifolio = ANY($3::bigint[]))
              OR (fg.guitipo = $4 AND fg.guifolio = ANY($5::bigint[])))
       GROUP BY f.gfackey, f.estado
       ORDER BY f.gfackey`,
      [EMPKEY, GUITIPO_NUEVO, foliosNuevo, GUITIPO_EXISTENTE, foliosExistente],
    );

    console.log(`\n=== Verificación de particionado (esperado: 4 proformas, 1 gclirut cada una) ===`);
    for (const p of proformas) {
      console.log(`  gfackey=${p.gfackey} estado=${p.estado} clientes=${JSON.stringify(p.clientes)}`);
    }

    if (proformas.length !== 4) {
      throw new Error(
        `Particionado multi-cliente/multi-regla falló: se esperaban 4 proformas, se encontraron ${proformas.length}`,
      );
    }
    const mezcladas = proformas.filter((p) => Number(p.distinct_clientes) !== 1);
    if (mezcladas.length > 0) {
      throw new Error(
        `Se encontraron proformas con guías de más de un cliente (mezcla de gclirut): ${JSON.stringify(mezcladas)}`,
      );
    }
    const todosLosClientes = new Set(proformas.flatMap((p) => p.clientes));
    if (todosLosClientes.size !== 2 || !todosLosClientes.has(GCLIRUT_NUEVO) || !todosLosClientes.has(GCLIRUT_EXISTENTE)) {
      throw new Error(`Los clientes de las proformas no son los 2 esperados: ${JSON.stringify([...todosLosClientes])}`);
    }
    console.log('[OK] 4 proformas correctamente particionadas, sin mezcla de gclirut entre ellas');

    // 11. Preview + aprobar (si corresponde).
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

    console.log('\n=== FIN: multi-cliente/multi-regla ejercitado de punta a punta contra QA real ===');
  } finally {
    // 12. Restaurar reglaidl previo del cliente EXISTENTE — compartido con
    //     otros scripts sintéticos. Sólo restaurar si SÍ capturamos el valor
    //     real (reglaidlPrevioExistente !== undefined); si una falla temprana
    //     ocurrió antes de la captura, no tocamos el cliente compartido para
    //     no corromperlo con un centinela.
    if (reglaidlPrevioExistente === undefined) {
      console.error(
        `[WARN] reglaidl de ${GCLIRUT_EXISTENTE} NO fue capturado (falla previa a la captura) — no se restaura para no corromper el cliente compartido`,
      );
    } else {
      try {
        await db.query(
          `UPDATE gde.clientes SET reglaidl = $3 WHERE empkey = $1 AND gclirut = $2`,
          [EMPKEY, GCLIRUT_EXISTENTE, reglaidlPrevioExistente],
        );
        console.log(`\n[OK] reglaidl de ${GCLIRUT_EXISTENTE} restaurado a: ${JSON.stringify(reglaidlPrevioExistente)}`);
      } catch (err) {
        console.error(`[WARN] no se pudo restaurar reglaidl previo: ${err.message}`);
      }
    }
    await db.end();
  }
}

main().catch((err) => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
