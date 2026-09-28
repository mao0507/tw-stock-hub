-- #43 ETF 基本資料結構化：新建 etf_profiles、移除 JSONB 的 etf_info（由 etf_types／etf_refresh 重抓）（冪等）
SET search_path = stocks, public;
-- ETF 基本資料（#43）：每檔一列只存最新；追蹤指數以 TWSE 為準，其餘取自 MoneyDJ
CREATE TABLE IF NOT EXISTS etf_profiles (
  etf_id             VARCHAR(10) PRIMARY KEY,
  tracking_index     VARCHAR(120),
  inception_date     DATE,
  listing_date       DATE,
  aum_million        NUMERIC(14,2),
  aum_date           DATE,
  currency           VARCHAR(10),
  holdings_count     INTEGER,
  asset_class        VARCHAR(20),
  region             VARCHAR(20),
  dividend_frequency VARCHAR(20),
  management_fee     NUMERIC(6,3),
  total_expense      NUMERIC(6,3),
  custodian          VARCHAR(50),
  website            VARCHAR(300),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TABLE IF EXISTS etf_info;

GRANT SELECT, INSERT, UPDATE, DELETE ON etf_profiles TO crawler;
GRANT SELECT ON etf_profiles TO api;
