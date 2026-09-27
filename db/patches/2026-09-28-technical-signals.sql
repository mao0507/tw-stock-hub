-- 既有資料庫補丁：新增 technical_signals（技術訊號事件，#29）
SET search_path = stocks, public;
CREATE TABLE IF NOT EXISTS technical_signals (
  date DATE NOT NULL, stock_id VARCHAR(10) NOT NULL, signal VARCHAR(40) NOT NULL,
  side VARCHAR(4) NOT NULL CHECK (side IN ('bull', 'bear')),
  "values" JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (date, stock_id, signal));
SELECT create_hypertable('technical_signals','date',if_not_exists=>TRUE);
CREATE INDEX IF NOT EXISTS idx_sig_stock ON technical_signals(stock_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_sig_date_signal ON technical_signals(date DESC, signal);

ALTER TABLE technical_signals SET (timescaledb.compress, timescaledb.compress_segmentby = 'stock_id');
SELECT add_compression_policy('stocks.technical_signals', INTERVAL '30 days', if_not_exists => TRUE);
GRANT SELECT, INSERT, UPDATE, DELETE ON technical_signals TO crawler;
GRANT SELECT ON technical_signals TO api;
