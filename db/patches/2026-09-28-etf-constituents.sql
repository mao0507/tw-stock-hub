-- #40 ETF 成分改為保存歷史：新建 etf_constituents、移除舊 etf_holdings（冪等）
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

-- 舊表的 updated_date 是爬取日而非資料日，搬進來會擋住較早資料日的新一期 → 不搬，直接移除（由 etf_holdings 任務重爬）
DROP TABLE IF EXISTS etf_holdings;

GRANT SELECT, INSERT, UPDATE, DELETE ON etf_constituents TO crawler;
GRANT SELECT ON etf_constituents TO api;
