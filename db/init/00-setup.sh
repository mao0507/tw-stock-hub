#!/bin/bash
# 建立 extension、schema 與兩個應用角色。只在 volume 首次初始化時執行。
#   crawler：只能讀寫 stocks
#   api：讀 stocks（可寫 pending_jobs）、擁有 members（Drizzle migration 以 api 身分執行）
# 可能被 docker-entrypoint 以 source 方式執行，不用 set -u 以免影響其後續流程
set -eo pipefail

: "${API_DB_PASSWORD:?API_DB_PASSWORD 未設定}"
: "${CRAWLER_DB_PASSWORD:?CRAWLER_DB_PASSWORD 未設定}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v api_pw="$API_DB_PASSWORD" -v crawler_pw="$CRAWLER_DB_PASSWORD" <<'SQL'
CREATE EXTENSION IF NOT EXISTS timescaledb SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;

CREATE ROLE api LOGIN PASSWORD :'api_pw';
CREATE ROLE crawler LOGIN PASSWORD :'crawler_pw';

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO api, crawler;

CREATE SCHEMA stocks;
CREATE SCHEMA members AUTHORIZATION api;

GRANT USAGE ON SCHEMA stocks TO api, crawler;
ALTER DEFAULT PRIVILEGES IN SCHEMA stocks
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crawler;
ALTER DEFAULT PRIVILEGES IN SCHEMA stocks
  GRANT USAGE, SELECT ON SEQUENCES TO crawler, api;
ALTER DEFAULT PRIVILEGES IN SCHEMA stocks
  GRANT SELECT ON TABLES TO api;

ALTER ROLE crawler SET search_path = stocks, public;
ALTER ROLE api SET search_path = members, stocks, public;
SQL
