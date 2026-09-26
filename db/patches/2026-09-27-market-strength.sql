-- 既有資料庫補丁：新增 market_strength（RS 相對強弱）
SET search_path = stocks, public;
CREATE TABLE IF NOT EXISTS market_strength (
  date DATE NOT NULL, stock_id VARCHAR(10) NOT NULL,
  rs_score SMALLINT NOT NULL, weighted_return NUMERIC(10,4) NOT NULL,
  PRIMARY KEY (date, stock_id));
SELECT create_hypertable('market_strength','date',if_not_exists=>TRUE);
CREATE INDEX IF NOT EXISTS idx_ms_stock ON market_strength(stock_id, date DESC);

ALTER TABLE market_strength SET (timescaledb.compress, timescaledb.compress_segmentby = 'stock_id');
SELECT add_compression_policy('stocks.market_strength', INTERVAL '30 days', if_not_exists => TRUE);
GRANT SELECT, INSERT, UPDATE, DELETE ON market_strength TO crawler;
GRANT SELECT ON market_strength TO api;
