#!/usr/bin/env bash
# Pile Supabase locale minimale pour les tests de bout en bout (sans Docker).
# Prérequis : PostgreSQL 16 accessible (PG_ADMIN_URL), binaires GoTrue et PostgREST dans $BIN_DIR.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
BIN_DIR="${BIN_DIR:-/var/tmp/sbstack}"
PG_ADMIN_URL="${PG_ADMIN_URL:-postgres://postgres@localhost:54329/postgres}"
DB_NAME="${DB_NAME:-yen_e2e}"
export JWT_SECRET="${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}"
DB_URL="${PG_ADMIN_URL%/*}/$DB_NAME"
PSQL="psql -v ON_ERROR_STOP=1 -q"

$PSQL "$PG_ADMIN_URL" -c "drop database if exists $DB_NAME with (force)" -c "create database $DB_NAME"
$PSQL "$DB_URL" -f "$HERE/init-roles.sql"
GOTRUE_DB_DRIVER=postgres DATABASE_URL="${DB_URL/postgres:\/\/postgres@/postgres://supabase_auth_admin@}?search_path=auth" \
  GOTRUE_DB_MIGRATIONS_PATH="$BIN_DIR/migrations" API_EXTERNAL_URL=http://localhost:54321/auth/v1 GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_SITE_URL=http://localhost:3000 \
  "$BIN_DIR/auth" migrate
$PSQL "$DB_URL" -f "$HERE/storage-schema.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL "$DB_URL" -f "$f"; done
$PSQL "$DB_URL" -f "$ROOT/supabase/seed.sql"
$PSQL "$DB_URL" -c "grant usage on schema public to anon, authenticated, service_role; grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role, authenticated;"

mkdir -p "$BIN_DIR/logs"
GOTRUE_API_HOST=127.0.0.1 PORT=9999 GOTRUE_DB_DRIVER=postgres DATABASE_URL="${DB_URL/postgres:\/\/postgres@/postgres://supabase_auth_admin@}?search_path=auth" \
  API_EXTERNAL_URL=http://localhost:54321/auth/v1 GOTRUE_SITE_URL=http://localhost:3000 GOTRUE_URI_ALLOW_LIST="http://localhost:3000/**" \
  GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
  GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_LOG_LEVEL=warn \
  nohup "$BIN_DIR/auth" serve > "$BIN_DIR/logs/gotrue.log" 2>&1 &
PGRST_DB_URI="${DB_URL/postgres:\/\/postgres@/postgres://authenticator@}" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" \
  PGRST_SERVER_PORT=3001 PGRST_SERVER_HOST=127.0.0.1 PGRST_DB_POOL=10 \
  nohup "$BIN_DIR/postgrest" > "$BIN_DIR/logs/postgrest.log" 2>&1 &
DATABASE_URL="$DB_URL" nohup node "$HERE/gateway.mjs" > "$BIN_DIR/logs/gateway.log" 2>&1 &
sleep 3
node "$HERE/keys.mjs"
echo "Pile démarrée : http://localhost:54321 (base $DB_NAME)"
