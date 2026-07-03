#!/usr/bin/env bash
# test-proforma-flow.sh — Feedback loop para flujo Proforma V5
# Uso: bash scripts/test-proforma-flow.sh [empkey] [rut_emisor] [periodo]

EMPKEY="${1:-977}"
RUT="${2:-921760000}"
PERIODO="${3:-2026-05}"
REGLA_OVERRIDE="${4:-}"   # Ej: bash script.sh 977 921760000 2026-05 por_comuna
BASE="http://localhost:3334"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[PASS]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }
info() { echo -e "${YELLOW}[INFO]${NC} $*"; }

echo ""
echo "======================================================="
echo "  Proforma Flow Test -- empkey=$EMPKEY periodo=$PERIODO"
echo "======================================================="
echo ""

# ── PASO 0: Servidor vivo ──────────────────────────────────────────────────
info "Paso 0 -- Verificando servidor en $BASE"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 \
  "$BASE/empresas/$EMPKEY/reglas" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "000" ]; then
  fail "Servidor no responde en $BASE -- levanta pnpm run start:dev"
  exit 1
fi
ok "Servidor OK (HTTP $HTTP_CODE)"

# ── PASO 1: Listar reglas disponibles ─────────────────────────────────────
echo ""
info "Paso 1 -- GET /empresas/$EMPKEY/reglas"
REGLAS=$(curl -s "$BASE/empresas/$EMPKEY/reglas")
echo "  $REGLAS" | head -c 400
echo ""
REGLA_ID=$(echo "$REGLAS" | grep -o '"reglaIdl":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$REGLA_ID" ]; then
  if [ -n "$REGLA_OVERRIDE" ]; then
    REGLA_ID="$REGLA_OVERRIDE"
    ok "Endpoint reglas vacio -- usando override: $REGLA_ID"
    info "  ACCION REQUERIDA: INSERT INTO gde.reglaempresa (empkey,reglaidl) VALUES ('$EMPKEY','$REGLA_ID') ON CONFLICT DO NOTHING;"
  else
    fail "No hay reglas para empkey=$EMPKEY"
    info "  Opciones:"
    info "  A) Insertar en DB: INSERT INTO gde.reglaempresa (empkey,reglaidl) VALUES ('$EMPKEY','por_comuna') ON CONFLICT DO NOTHING;"
    info "  B) Pasar reglaIdl como 4to argumento: bash $0 $EMPKEY $RUT $PERIODO por_comuna"
    exit 1
  fi
else
  ok "Primera regla disponible: $REGLA_ID"
fi

# ── PASO 2: Clientes con guias -- asignar regla a todos los sin regla ──────
echo ""
info "Paso 2 -- GET /empresas/$EMPKEY/clientes?periodo=$PERIODO"
CLIENTES=$(curl -s "$BASE/empresas/$EMPKEY/clientes?periodo=$PERIODO")
TOTAL_CLI=$(echo "$CLIENTES" | grep -o '"rut"' | wc -l | tr -d ' ')
CLI_SIN_REGLA=$(echo "$CLIENTES" | python3 -c "
import sys,json
data=json.load(sys.stdin)
ruts=[c['rut'] for c in data if c.get('reglaIdl') is None]
print('\n'.join(ruts))
" 2>/dev/null)
CLI_SIN_COUNT=$(echo "$CLI_SIN_REGLA" | grep -c . || echo 0)
ok "Clientes en periodo: $TOTAL_CLI | Sin regla: $CLI_SIN_COUNT"

if [ "$CLI_SIN_COUNT" -gt 0 ]; then
  info "Asignando regla '$REGLA_ID' a $CLI_SIN_COUNT clientes con recomputar=true ..."
  ASIGNADOS=0
  FALLIDOS=0
  while IFS= read -r RUT_CLI; do
    [ -z "$RUT_CLI" ] && continue
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
      "$BASE/empresas/$EMPKEY/clientes/$RUT_CLI/regla" \
      -H "Content-Type: application/json" \
      -d "{\"reglaIdl\":\"$REGLA_ID\",\"recomputar\":true,\"periodo\":\"$PERIODO\"}")
    if [ "$STATUS" = "200" ] || [ "$STATUS" = "204" ]; then
      ASIGNADOS=$((ASIGNADOS+1))
    else
      fail "  Cliente $RUT_CLI -> HTTP $STATUS"
      FALLIDOS=$((FALLIDOS+1))
    fi
  done <<< "$CLI_SIN_REGLA"
  ok "Regla asignada: $ASIGNADOS OK, $FALLIDOS fallidos"

  if [ "$FALLIDOS" -gt 0 ]; then
    fail "Algunos clientes fallaron. Revisar logs del servidor."
    exit 1
  fi
else
  ok "Todos los clientes ya tienen regla"
fi

# ── PASO 3: Verificar guias con guireglaidl post-recomputar ───────────────
echo ""
info "Paso 3 -- Verificando agrupamiento (guias agrupadas)"
AGRUPADAS=$(curl -s "$BASE/empresas/$EMPKEY/guias/agrupadas?periodo=$PERIODO")
SIN_REGLA_GRUPOS=$(echo "$AGRUPADAS" | grep -o '"valorAgrupador":"_sin_regla"' | wc -l | tr -d ' ')
CON_REGLA_GRUPOS=$(echo "$AGRUPADAS" | grep -o '"valorAgrupador":"[^_][^"]*"' | wc -l | tr -d ' ')
if [ "$SIN_REGLA_GRUPOS" -gt 0 ]; then
  fail "ATENCION: $SIN_REGLA_GRUPOS grupo(s) '_sin_regla' -- XMLs posiblemente inaccesibles"
  fail "  Si guireglaidl sigue NULL en DB, el recomputar no pudo fetchear los XMLs."
  info "  Opcion A: re-sync (POST /empresas/$EMPKEY/sync?rut=$RUT&periodo=$PERIODO)"
  info "  Opcion B: verificar que guifilepath en DB sean URLs alcanzables desde el servidor"
else
  ok "Sin grupos '_sin_regla' -- $CON_REGLA_GRUPOS grupos con regla asignada"
fi

# ── PASO 4: Sync (para atrapar guias nuevas o re-setear las sin regla) ─────
echo ""
info "Paso 4 -- POST /empresas/$EMPKEY/sync?rut=$RUT&periodo=$PERIODO"
SYNC_RESP=$(curl -s -w "\nHTTP:%{http_code}" -X POST \
  "$BASE/empresas/$EMPKEY/sync?rut=$RUT&periodo=$PERIODO")
SYNC_CODE=$(echo "$SYNC_RESP" | grep 'HTTP:' | cut -d: -f2)
SYNC_BODY=$(echo "$SYNC_RESP" | grep -v 'HTTP:')
if [ "$SYNC_CODE" = "200" ] || [ "$SYNC_CODE" = "201" ]; then
  ok "Sync OK (HTTP $SYNC_CODE): $SYNC_BODY"
else
  fail "Sync fallo HTTP $SYNC_CODE: $SYNC_BODY"
  info "  Causas: backoffice-adapter no corre en :3333, o credenciales incorrectas"
  exit 1
fi

# ── PASO 5: Generar proformas ──────────────────────────────────────────────
echo ""
info "Paso 5 -- POST /empresas/$EMPKEY/facturas/proforma/generar?periodo=$PERIODO"
GENERAR_RESP=$(curl -s -w "\nHTTP:%{http_code}" -X POST \
  "$BASE/empresas/$EMPKEY/facturas/proforma/generar?periodo=$PERIODO")
GENERAR_CODE=$(echo "$GENERAR_RESP" | grep 'HTTP:' | cut -d: -f2)
GENERAR_BODY=$(echo "$GENERAR_RESP" | grep -v 'HTTP:')
echo "  -> $GENERAR_BODY (HTTP $GENERAR_CODE)"

CREATED=$(echo "$GENERAR_BODY" | grep -o '"created":[0-9]*' | cut -d: -f2 || echo 0)
SKIPPED=$(echo "$GENERAR_BODY" | grep -o '"skipped":[0-9]*' | cut -d: -f2 || echo 0)

if [ "${CREATED:-0}" -gt 0 ]; then
  ok "Proformas creadas: $CREATED (skipped: $SKIPPED)"
elif [ "${SKIPPED:-0}" -gt 0 ]; then
  ok "Proformas ya existian como BORRADOR (skipped: $SKIPPED)"
  info "  Para recrear: POST /empresas/$EMPKEY/facturas/proforma/limpiar?periodo=$PERIODO"
else
  fail "{ created:0, skipped:0 } -- guias sin guireglaidl en DB"
  info "  DIAGNOSTICO: las guias siguen con guireglaidl=NULL"
  info "  Esto pasa cuando los XMLs de guifilepath no son accesibles desde el servidor"
  info "  Verifica en psql:"
  info "    SELECT guifilepath FROM gde.guia WHERE empkey='$EMPKEY' LIMIT 3;"
  exit 1
fi

# ── PASO 6: Listar y aprobar primera proforma BORRADOR ────────────────────
echo ""
info "Paso 6 -- GET /empresas/$EMPKEY/facturas/proforma?periodo=$PERIODO"
PROFORMAS=$(curl -s "$BASE/empresas/$EMPKEY/facturas/proforma?periodo=$PERIODO")
GFACKEY=$(echo "$PROFORMAS" | python3 -c "
import sys,json
data=json.load(sys.stdin)
if data: print(data[0]['id'])
" 2>/dev/null || echo "$PROFORMAS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$GFACKEY" ]; then
  fail "No hay proformas BORRADOR para el periodo"
  exit 1
fi
ok "Primera proforma: gfackey=$GFACKEY"
echo "  $PROFORMAS" | head -c 400
echo ""

echo ""
info "Paso 7 -- PATCH /empresas/$EMPKEY/facturas/proforma/$GFACKEY/aprobar"
APROBAR_RESP=$(curl -s -w "\nHTTP:%{http_code}" -X PATCH \
  "$BASE/empresas/$EMPKEY/facturas/proforma/$GFACKEY/aprobar")
APROBAR_CODE=$(echo "$APROBAR_RESP" | grep 'HTTP:' | cut -d: -f2)
APROBAR_BODY=$(echo "$APROBAR_RESP" | grep -v 'HTTP:')
ESTADO=$(echo "$APROBAR_BODY" | grep -o '"estado":"[^"]*"' | cut -d'"' -f4)
[ "$ESTADO" = "APROBADA" ] && ok "Proforma aprobada" \
  || fail "Estado inesperado: $ESTADO (HTTP $APROBAR_CODE) -- $APROBAR_BODY"

# ── PASO 8: Preview mensaje V5 ────────────────────────────────────────────
echo ""
info "Paso 8 -- GET /empresas/$EMPKEY/facturas/proforma/$GFACKEY/preview-mensaje"
PREVIEW_RESP=$(curl -s -w "\nHTTP:%{http_code}" \
  "$BASE/empresas/$EMPKEY/facturas/proforma/$GFACKEY/preview-mensaje")
PREVIEW_CODE=$(echo "$PREVIEW_RESP" | grep 'HTTP:' | cut -d: -f2)
PREVIEW_BODY=$(echo "$PREVIEW_RESP" | grep -v 'HTTP:')

if [ "$PREVIEW_CODE" = "200" ]; then
  MODO=$(echo "$PREVIEW_BODY" | grep -o '"modo":[0-9]*' | cut -d: -f2)
  ok "Preview mensaje OK -- modo=$MODO"
  echo "  Mensaje (primeros 300 chars):"
  echo "$PREVIEW_BODY" | grep -o '"mensaje":"[^"]*"' | cut -c1-300
  echo ""
else
  fail "preview-mensaje HTTP $PREVIEW_CODE: $PREVIEW_BODY"
  info "  422 = XML de la guia no accesible (guifilepath invalido)"
  info "  404 = proforma no encontrada"
  exit 1
fi

echo ""
echo "======================================================="
echo -e "  ${GREEN}FLUJO COMPLETO OK${NC} -- empkey=$EMPKEY gfackey=$GFACKEY"
echo "======================================================="
echo ""
