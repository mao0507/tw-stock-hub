-- #40 ETF 成分改為保存歷史：新建 etf_constituents，搬入既有 etf_holdings 最新一期後移除舊表（冪等）
SET search_path = stocks, public;
CREATE TABLE IF NOT EXISTS etf_constituents (
  etf_id       VARCHAR(10)  NOT NULL,
  data_date    DATE         NOT NULL,
  holding_name VARCHAR(120) NOT NULL,
  stock_id     VARCHAR(10),
  symbol       VARCHAR(20),
  weight       NUMERIC(7,3),
  shares       BIGINT,
  source       VARCHAR(20)  NOT NULL,
  PRIMARY KEY (etf_id, data_date, holding_name)
);
CREATE INDEX IF NOT EXISTS idx_etf_constituents_stock ON etf_constituents (stock_id, data_date DESC);

DO $$
BEGIN
  IF to_regclass('stocks.etf_holdings') IS NOT NULL THEN
    INSERT INTO etf_constituents (etf_id, data_date, holding_name, stock_id, symbol, weight, shares, source)
    SELECT etf_id, updated_date, COALESCE(stock_name, stock_id), stock_id, stock_id || '.TW', weight, shares, 'moneydj'
    FROM etf_holdings WHERE updated_date IS NOT NULL
    ON CONFLICT DO NOTHING;
    DROP TABLE etf_holdings;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON etf_constituents TO crawler;
GRANT SELECT ON etf_constituents TO api;
