/**
 * Smoke E2E — flujo completo empkey=977
 *
 * Requiere:
 *  - PostgreSQL local corriendo (facturagdes2, schema gde)
 *  - .env con DB_* configurado
 *  - Seeds aplicados: sql/seeds/reglas.sql
 *
 * NO requiere backoffice-adapter corriendo (skip del sync).
 *
 * Flujo:
 *  1. GET /empresas/:empkey/clientes          → shape + reglaIdl
 *  2. GET /reglas/empresa/:empkey             → lista de reglas configuradas
 *  3. PUT /empresas/:empkey/clientes/:rut/regla → asignar regla al primer cliente
 *  4. GET /empresas/:empkey/guias/agrupadas   → grupos con valorAgrupador + reglaIdl
 *  5. GET /empresas/:empkey/facturas/proforma → shape id/folio/cliente/regla/estado
 *  6. POST /empresas/:empkey/facturas/proforma/generar → { created, skipped }
 *     PATCH .../aprobar → estado APROBADA
 *     PATCH .../anular  → estado ANULADA (limpia)
 */

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import request from 'supertest'
import { App } from 'supertest/types'
import { AppModule } from '../src/app.module'

const EMPKEY = '977'
const PERIODO = '2026-05'

describe('Smoke E2E — empkey=977', () => {
  let app: INestApplication<App>
  let primerRut: string | undefined
  let primerReglaidl: string | undefined
  let primerProformaId: string | undefined

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    )
    await app.init()
  }, 30_000)

  afterAll(async () => {
    await app.close()
  })

  // ── 1. Clientes ──────────────────────────────────────────────────────────────

  it('GET /empresas/:empkey/clientes devuelve 200 con array', async () => {
    const res = await request(app.getHttpServer())
      .get(`/empresas/${EMPKEY}/clientes`)
      .query({ periodo: PERIODO })
      .expect(200)

    expect(Array.isArray(res.body)).toBe(true)
  })

  it('cada cliente tiene rut, nombre, cantidadGuias, montoTotal, reglaIdl', async () => {
    const res = await request(app.getHttpServer())
      .get(`/empresas/${EMPKEY}/clientes`)
      .query({ periodo: PERIODO })
      .expect(200)

    if (res.body.length === 0) {
      console.warn('⚠ BD sin clientes para periodo', PERIODO, '— test omitido')
      return
    }

    const c = res.body[0]
    expect(c).toHaveProperty('rut')
    expect(c).toHaveProperty('nombre')
    expect(c).toHaveProperty('cantidadGuias')
    expect(c).toHaveProperty('montoTotal')
    expect(c).toHaveProperty('reglaIdl')
    expect(typeof c.rut).toBe('string')
    expect(c.reglaIdl === null || typeof c.reglaIdl === 'string').toBe(true)
    primerRut = c.rut
  })

  // ── 2. Reglas empresa ────────────────────────────────────────────────────────

  it('GET /reglas/empresa/:empkey devuelve array de reglas', async () => {
    const res = await request(app.getHttpServer())
      .get(`/reglas/empresa/${EMPKEY}`)
      .expect(200)

    expect(Array.isArray(res.body)).toBe(true)
    if (res.body.length > 0) {
      const r = res.body[0]
      expect(r).toHaveProperty('reglaidl')
      expect(r).toHaveProperty('empkey')
      primerReglaidl = r.reglaidl
    }
  })

  // ── 3. Asignar regla ─────────────────────────────────────────────────────────

  it('PUT /empresas/:empkey/clientes/:rut/regla → 200', async () => {
    if (!primerRut || !primerReglaidl) {
      console.warn('⚠ Sin rut o reglaidl — test omitido')
      return
    }

    await request(app.getHttpServer())
      .put(`/empresas/${EMPKEY}/clientes/${encodeURIComponent(primerRut)}/regla`)
      .send({ reglaIdl: primerReglaidl })
      .expect(200)
  })

  it('clientes refrescan reglaIdl tras el PUT', async () => {
    if (!primerRut || !primerReglaidl) return

    const res = await request(app.getHttpServer())
      .get(`/empresas/${EMPKEY}/clientes`)
      .query({ periodo: PERIODO })
      .expect(200)

    const cliente = res.body.find((c: { rut: string }) => c.rut === primerRut)
    if (cliente) {
      expect(cliente.reglaIdl).toBe(primerReglaidl)
    }
  })

  // ── 4. Guías agrupadas ───────────────────────────────────────────────────────

  it('GET /empresas/:empkey/guias/agrupadas devuelve array de grupos', async () => {
    const res = await request(app.getHttpServer())
      .get(`/empresas/${EMPKEY}/guias/agrupadas`)
      .query({ periodo: PERIODO })
      .expect(200)

    expect(Array.isArray(res.body)).toBe(true)
  })

  it('cada item tiene cliente + grupos[], cada grupo tiene valorAgrupador/reglaIdl/cantidadGuias/montoTotal/folios', async () => {
    const res = await request(app.getHttpServer())
      .get(`/empresas/${EMPKEY}/guias/agrupadas`)
      .query({ periodo: PERIODO })
      .expect(200)

    if (res.body.length === 0) {
      console.warn('⚠ Sin guías agrupadas — test omitido')
      return
    }

    const item = res.body[0]
    expect(item).toHaveProperty('cliente')
    expect(item.cliente).toHaveProperty('rut')
    expect(item.cliente).toHaveProperty('nombre')
    expect(item).toHaveProperty('grupos')
    expect(Array.isArray(item.grupos)).toBe(true)

    if (item.grupos.length > 0) {
      const grupo = item.grupos[0]
      expect(grupo).toHaveProperty('valorAgrupador')
      expect(grupo).toHaveProperty('reglaIdl')
      expect(grupo).toHaveProperty('cantidadGuias')
      expect(grupo).toHaveProperty('montoTotal')
      expect(grupo).toHaveProperty('folios')
      expect(Array.isArray(grupo.folios)).toBe(true)
      expect(grupo.reglaIdl === null || typeof grupo.reglaIdl === 'string').toBe(true)
    }
  })

  // ── 5. Proforma — listado y shape ────────────────────────────────────────────

  it('GET /empresas/:empkey/facturas/proforma devuelve 200 con array', async () => {
    const res = await request(app.getHttpServer())
      .get(`/empresas/${EMPKEY}/facturas/proforma`)
      .query({ periodo: PERIODO })
      .expect(200)

    expect(Array.isArray(res.body)).toBe(true)
  })

  it('cada proforma tiene id, folio, cliente, regla, estado, montoTotal, fecha', async () => {
    const res = await request(app.getHttpServer())
      .get(`/empresas/${EMPKEY}/facturas/proforma`)
      .query({ periodo: PERIODO })
      .expect(200)

    if (res.body.length === 0) {
      console.warn('⚠ Sin proformas para periodo', PERIODO, '— shape test omitido')
      return
    }

    const p = res.body[0]
    expect(p).toHaveProperty('id')
    expect(p).toHaveProperty('folio')
    expect(p).toHaveProperty('cliente')
    expect(p.cliente).toHaveProperty('rut')
    expect(p.cliente).toHaveProperty('nombre')
    expect(p).toHaveProperty('regla')
    expect(p.regla).toHaveProperty('id')
    expect(p.regla).toHaveProperty('descripcion')
    expect(p).toHaveProperty('estado')
    expect(p).toHaveProperty('montoTotal')
    expect(p).toHaveProperty('fecha')
    expect(typeof p.id).toBe('string')
    expect(typeof p.folio).toBe('string')
  })

  // ── 6. Proforma — flujo generar/aprobar/anular ───────────────────────────────

  it('POST /empresas/:empkey/facturas/proforma/generar devuelve { created, skipped }', async () => {
    const res = await request(app.getHttpServer())
      .post(`/empresas/${EMPKEY}/facturas/proforma/generar`)
      .query({ periodo: PERIODO })
      .expect(201)

    expect(res.body).toHaveProperty('created')
    expect(res.body).toHaveProperty('skipped')
    expect(typeof res.body.created).toBe('number')
    expect(typeof res.body.skipped).toBe('number')
    console.log(`  generar: created=${res.body.created} skipped=${res.body.skipped}`)
  })

  it('proformas BORRADOR disponibles tras generar', async () => {
    const res = await request(app.getHttpServer())
      .get(`/empresas/${EMPKEY}/facturas/proforma`)
      .query({ periodo: PERIODO, estado: 'BORRADOR' })
      .expect(200)

    expect(Array.isArray(res.body)).toBe(true)
    if (res.body.length > 0) {
      primerProformaId = res.body[0].id as string
      console.log(`  primerProformaId=${primerProformaId}`)
    } else {
      console.warn('⚠ Sin proformas BORRADOR — tests de aprobar/anular omitidos')
    }
  })

  it('PATCH .../aprobar cambia estado a APROBADA', async () => {
    if (!primerProformaId) {
      console.warn('⚠ Sin proforma BORRADOR — test omitido')
      return
    }

    const res = await request(app.getHttpServer())
      .patch(`/empresas/${EMPKEY}/facturas/proforma/${primerProformaId}/aprobar`)
      .expect(200)

    expect(res.body).toHaveProperty('estado', 'APROBADA')
    expect(res.body).toHaveProperty('id', primerProformaId)
  })

  it('PATCH .../anular cambia estado a ANULADA (limpia la proforma aprobada)', async () => {
    if (!primerProformaId) {
      console.warn('⚠ Sin proforma — test omitido')
      return
    }

    const res = await request(app.getHttpServer())
      .patch(`/empresas/${EMPKEY}/facturas/proforma/${primerProformaId}/anular`)
      .expect(200)

    expect(res.body).toHaveProperty('estado', 'ANULADA')
    expect(res.body).toHaveProperty('id', primerProformaId)
  })

  // ── Errores ────────────────────────────────────────────────────────────────

  it('PUT /empresas/:empkey/clientes/:rut/regla sin body → 400', async () => {
    await request(app.getHttpServer())
      .put(`/empresas/${EMPKEY}/clientes/77004250-K/regla`)
      .send({})
      .expect(400)
  })

  it('PUT /empresas/:empkey/clientes/:rut/regla con reglaIdl vacío → 400', async () => {
    await request(app.getHttpServer())
      .put(`/empresas/${EMPKEY}/clientes/77004250-K/regla`)
      .send({ reglaIdl: '' })
      .expect(400)
  })
})
