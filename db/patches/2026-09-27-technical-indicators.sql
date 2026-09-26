-- 既有資料庫補丁：新增 technical_indicators（db/init 只在 volume 首次建立時執行）
-- 以 superuser 執行：docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/patches/2026-09-27-technical-indicators.sql
SET search_path = stocks, public;
CREATE TABLE IF NOT EXISTS technical_indicators (
  date DATE NOT NULL, stock_id VARCHAR(10) NOT NULL,
  ma5 NUMERIC(12,2), ma10 NUMERIC(12,2), ma20 NUMERIC(12,2), ma60 NUMERIC(12,2), ma120 NUMERIC(12,2), ma240 NUMERIC(12,2),
  rsi14 NUMERIC(6,2), k9 NUMERIC(6,2), d9 NUMERIC(6,2),
  dif NUMERIC(12,2), dea NUMERIC(12,2), macd_hist NUMERIC(12,2),
  vol_ma5 BIGINT, vol_ma20 BIGINT,
  PRIMARY KEY (date, stock_id));
SELECT create_hypertable('technical_indicators','date',if_not_exists=>TRUE);
CREATE INDEX IF NOT EXISTS idx_ti_stock ON technical_indicators(stock_id, date DESC);

ALTER TABLE technical_indicators SET (timescaledb.compress, timescaledb.compress_segmentby = 'stock_id');
SELECT add_compression_policy('stocks.technical_indicators', INTERVAL '30 days', if_not_exists => TRUE);
GRANT SELECT, INSERT, UPDATE, DELETE ON technical_indicators TO crawler;
GRANT SELECT ON technical_indicators TO api;
