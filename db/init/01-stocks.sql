-- ============================================================
-- tw-stock-hub — stocks schema 初始化腳本
-- TimescaleDB 版本
-- 冪等：可重複執行不報錯
-- ============================================================

-- Extension 已在 00-setup.sh 建立於 public；以下物件全部建在 stocks schema
SET search_path = stocks, public;

-- ── Enum 型別 ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'market_enum') THEN
    CREATE TYPE market_enum AS ENUM ('TWSE', 'TPEX');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'news_source_enum') THEN
    CREATE TYPE news_source_enum AS ENUM ('mops', 'cnyes', 'yahoo', 'moneydj', 'twse');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'news_category_enum') THEN
    CREATE TYPE news_category_enum AS ENUM (
      'major_announcement', 'market_news', 'analyst', 'official'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crawler_status_enum') THEN
    CREATE TYPE crawler_status_enum AS ENUM ('success', 'failed', 'partial');
  END IF;
END $$;

-- ── stocks 表（股票基本資料）──
CREATE TABLE IF NOT EXISTS stocks (
  id           VARCHAR(10)   PRIMARY KEY,
  name         VARCHAR(50)   NOT NULL,
  market       market_enum   NOT NULL,
  sector       VARCHAR(50),
  listing_date DATE,
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stocks_market    ON stocks (market);
CREATE INDEX IF NOT EXISTS idx_stocks_sector    ON stocks (sector);
CREATE INDEX IF NOT EXISTS idx_stocks_is_active ON stocks (is_active) WHERE is_active = TRUE;

-- ── daily_quotes 表（每日行情）──
CREATE TABLE IF NOT EXISTS daily_quotes (
  date              DATE          NOT NULL,
  stock_id          VARCHAR(10)   NOT NULL,
  open              NUMERIC(12,2) NOT NULL,
  high              NUMERIC(12,2) NOT NULL,
  low               NUMERIC(12,2) NOT NULL,
  close             NUMERIC(12,2) NOT NULL,
  volume            BIGINT        NOT NULL,
  value             BIGINT        NOT NULL,
  change            NUMERIC(8,2),
  change_pct        NUMERIC(8,2),
  transaction_count INTEGER,
  PRIMARY KEY (date, stock_id)
);

-- TimescaleDB hypertable
SELECT create_hypertable(
  'daily_quotes', 'date',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_quotes_stock_date
  ON daily_quotes (stock_id, date DESC);

-- ── market_index 表（大盤指數）──
CREATE TABLE IF NOT EXISTS market_index (
  date             DATE          PRIMARY KEY,
  taiex_close      NUMERIC(12,2) NOT NULL,
  taiex_change     NUMERIC(10,2) NOT NULL,
  taiex_change_pct NUMERIC(8,2)  NOT NULL,
  total_volume     BIGINT        NOT NULL,
  total_value      BIGINT        NOT NULL,
  up_count         INTEGER       NOT NULL,
  down_count       INTEGER       NOT NULL,
  flat_count       INTEGER       NOT NULL,
  limit_up_count   INTEGER       NOT NULL,
  limit_down_count INTEGER       NOT NULL
);

SELECT create_hypertable(
  'market_index', 'date',
  chunk_time_interval => INTERVAL '30 days',
  if_not_exists => TRUE
);

-- ── institutional_trading 表（三大法人）──
CREATE TABLE IF NOT EXISTS institutional_trading (
  date         DATE        NOT NULL,
  stock_id     VARCHAR(10) NOT NULL,
  foreign_buy  BIGINT      NOT NULL,
  foreign_sell BIGINT      NOT NULL,
  foreign_net  BIGINT      NOT NULL,
  trust_buy    BIGINT      NOT NULL,
  trust_sell   BIGINT      NOT NULL,
  trust_net    BIGINT      NOT NULL,
  dealer_buy   BIGINT      NOT NULL,
  dealer_sell  BIGINT      NOT NULL,
  dealer_net   BIGINT      NOT NULL,
  total_net    BIGINT      NOT NULL,
  PRIMARY KEY (date, stock_id)
);

SELECT create_hypertable(
  'institutional_trading', 'date',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_inst_stock_date
  ON institutional_trading (stock_id, date DESC);

-- ── margin_trading 表（融資融券）──
CREATE TABLE IF NOT EXISTS margin_trading (
  date           DATE        NOT NULL,
  stock_id       VARCHAR(10) NOT NULL,
  margin_balance BIGINT      NOT NULL,
  margin_change  BIGINT      NOT NULL,
  margin_limit   BIGINT      NOT NULL,
  short_balance  BIGINT      NOT NULL,
  short_change   BIGINT      NOT NULL,
  short_limit    BIGINT      NOT NULL,
  "offset"       BIGINT,
  PRIMARY KEY (date, stock_id)
);

SELECT create_hypertable(
  'margin_trading', 'date',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_margin_stock_date
  ON margin_trading (stock_id, date DESC);

-- ── sector_performance 表（類股）──
CREATE TABLE IF NOT EXISTS sector_performance (
  date        DATE          NOT NULL,
  sector_name VARCHAR(50)   NOT NULL,
  index_value NUMERIC(12,2) NOT NULL,
  change      NUMERIC(10,2) NOT NULL,
  change_pct  NUMERIC(8,2)  NOT NULL,
  volume      BIGINT,
  value       BIGINT,
  PRIMARY KEY (date, sector_name)
);

SELECT create_hypertable(
  'sector_performance', 'date',
  chunk_time_interval => INTERVAL '30 days',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_sector_date
  ON sector_performance (date DESC);

-- ── news 表（新聞）──
CREATE TABLE IF NOT EXISTS news (
  id                UUID              NOT NULL DEFAULT gen_random_uuid(),
  title             VARCHAR(500)      NOT NULL,
  summary           TEXT,
  source            news_source_enum  NOT NULL,
  url               VARCHAR(1000)     NOT NULL,
  published_at      TIMESTAMPTZ       NOT NULL,
  crawled_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  category          news_category_enum NOT NULL,
  is_mops_permanent BOOLEAN           NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id, published_at),
  CONSTRAINT uq_news_url UNIQUE (url, published_at)
);

SELECT create_hypertable(
  'news', 'published_at',
  chunk_time_interval => INTERVAL '30 days',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_news_source      ON news (source);
CREATE INDEX IF NOT EXISTS idx_news_category    ON news (category);
CREATE INDEX IF NOT EXISTS idx_news_published   ON news (published_at DESC);

-- 保留政策：一般新聞 180 天（MOPS 永久保留由應用層控制）
SELECT add_retention_policy(
  'news',
  INTERVAL '180 days',
  if_not_exists => TRUE
);

-- ── news_stock_relations 表（新聞與股票關聯）──
CREATE TABLE IF NOT EXISTS news_stock_relations (
  news_id  UUID        NOT NULL,
  stock_id VARCHAR(10) NOT NULL,
  PRIMARY KEY (news_id, stock_id)
);

CREATE INDEX IF NOT EXISTS idx_news_stock_stock_id
  ON news_stock_relations (stock_id);

-- ── broker_trading 表（券商分點進出）──
CREATE TABLE IF NOT EXISTS broker_trading (
  date        DATE         NOT NULL,
  stock_id    VARCHAR(10)  NOT NULL,
  broker_name VARCHAR(60)  NOT NULL,
  buy         BIGINT       NOT NULL DEFAULT 0,  -- 買進股數
  sell        BIGINT       NOT NULL DEFAULT 0,  -- 賣出股數
  net         BIGINT       NOT NULL DEFAULT 0,  -- 買賣超股數（buy - sell）
  PRIMARY KEY (date, stock_id, broker_name)
);

SELECT create_hypertable('broker_trading', 'date', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_broker_stock_date
  ON broker_trading (stock_id, date DESC);

-- ── broker_trading_detail 表（券商分點價位別明細）──
CREATE TABLE IF NOT EXISTS broker_trading_detail (
  date        DATE          NOT NULL,
  stock_id    VARCHAR(10)   NOT NULL,
  broker_name VARCHAR(60)   NOT NULL,
  price       NUMERIC(12,2) NOT NULL,
  buy         BIGINT        NOT NULL DEFAULT 0,
  sell        BIGINT        NOT NULL DEFAULT 0,
  PRIMARY KEY (date, stock_id, broker_name, price)
);

SELECT create_hypertable('broker_trading_detail', 'date', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_broker_detail_stock_date
  ON broker_trading_detail (stock_id, date DESC);

-- ── broker_group_tags 表（券商分點群組標記，如作手/隔日沖）──
-- 標記為人工整理，非演算法分類結果。broker_name 需與 broker_trading.broker_name 原始字串完全一致
-- （含代號前綴與全形 padding，見 crawlers/quote/broker.py 的 parse_bsr_csv）。
-- 未內建種子資料：目前資料集中尚未核實實際分點名稱對應的隔日沖/作手標籤，避免造假；
-- 待實際比對追蹤股清單的分點名稱後，由管理者手動 INSERT。
CREATE TABLE IF NOT EXISTS broker_group_tags (
  broker_name VARCHAR(60)  PRIMARY KEY,
  tag         VARCHAR(30)  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── 基本面：月營收 / 財報 / 股利 / 估值 / 大戶 / 除權息 ──
CREATE TABLE IF NOT EXISTS monthly_revenue (
  stock_id VARCHAR(10) NOT NULL, year_month VARCHAR(6) NOT NULL,
  revenue BIGINT, mom_pct NUMERIC(10,2), yoy_pct NUMERIC(10,2),
  cum_revenue BIGINT, cum_yoy_pct NUMERIC(10,2),
  PRIMARY KEY (stock_id, year_month));
CREATE INDEX IF NOT EXISTS idx_revenue_stock ON monthly_revenue(stock_id, year_month DESC);

CREATE TABLE IF NOT EXISTS financial_statements (
  stock_id VARCHAR(10) NOT NULL, year INT NOT NULL, quarter INT NOT NULL,
  revenue BIGINT, gross_profit BIGINT, op_income BIGINT, pretax_income BIGINT,
  net_income BIGINT, eps NUMERIC(8,2),
  cost_of_goods_sold BIGINT, op_expenses BIGINT, non_op_income BIGINT,
  PRIMARY KEY (stock_id, year, quarter));
CREATE INDEX IF NOT EXISTS idx_fin_stock ON financial_statements(stock_id, year DESC, quarter DESC);

-- 資產負債表（FinMind TaiwanStockBalanceSheet，千元）：ROE/ROA/杜邦/週轉/合約負債用
CREATE TABLE IF NOT EXISTS balance_sheets (
  stock_id VARCHAR(10) NOT NULL, year INT NOT NULL, quarter INT NOT NULL,
  total_assets BIGINT, total_equity BIGINT,
  current_assets BIGINT, current_liabilities BIGINT,
  accounts_receivable BIGINT, inventories BIGINT, contract_liabilities BIGINT,
  PRIMARY KEY (stock_id, year, quarter));
CREATE INDEX IF NOT EXISTS idx_bs_stock ON balance_sheets(stock_id, year DESC, quarter DESC);

CREATE TABLE IF NOT EXISTS dividends (
  stock_id VARCHAR(10) NOT NULL, dividend_year VARCHAR(10) NOT NULL, period VARCHAR(10) NOT NULL,
  cash_dividend NUMERIC(10,4), stock_dividend NUMERIC(10,4),
  PRIMARY KEY (stock_id, dividend_year, period));
CREATE INDEX IF NOT EXISTS idx_div_stock ON dividends(stock_id, dividend_year DESC);

CREATE TABLE IF NOT EXISTS valuations (
  date DATE NOT NULL, stock_id VARCHAR(10) NOT NULL,
  pe NUMERIC(10,2), pb NUMERIC(10,2), dividend_yield NUMERIC(8,2),
  PRIMARY KEY (date, stock_id));
SELECT create_hypertable('valuations','date',if_not_exists=>TRUE);
CREATE INDEX IF NOT EXISTS idx_val_stock ON valuations(stock_id, date DESC);

CREATE TABLE IF NOT EXISTS shareholder_dispersion (
  date DATE NOT NULL, stock_id VARCHAR(10) NOT NULL,
  big_holder_pct NUMERIC(8,2), big_holder_count INT, total_holders INT,
  PRIMARY KEY (date, stock_id));
SELECT create_hypertable('shareholder_dispersion','date',if_not_exists=>TRUE);
CREATE INDEX IF NOT EXISTS idx_disp_stock ON shareholder_dispersion(stock_id, date DESC);

CREATE TABLE IF NOT EXISTS ex_dividend_calendar (
  ex_date DATE NOT NULL, stock_id VARCHAR(10) NOT NULL,
  stock_name VARCHAR(50), cash_dividend NUMERIC(10,4), stock_dividend_ratio NUMERIC(12,8),
  PRIMARY KEY (ex_date, stock_id));
CREATE INDEX IF NOT EXISTS idx_exdiv_date ON ex_dividend_calendar(ex_date DESC);

-- ── crawler_logs 表（爬蟲執行紀錄）──
CREATE TABLE IF NOT EXISTS crawler_logs (
  id             SERIAL          PRIMARY KEY,
  crawler_name   VARCHAR(100)    NOT NULL,
  run_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  status         crawler_status_enum NOT NULL,
  records_count  INTEGER,
  error_message  TEXT,
  duration_ms    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_crawler_logs_name   ON crawler_logs (crawler_name);
CREATE INDEX IF NOT EXISTS idx_crawler_logs_run_at ON crawler_logs (run_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawler_logs_status ON crawler_logs (status);

-- ── updated_at 自動更新觸發器（stocks 表）──
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stocks_updated_at ON stocks;
CREATE TRIGGER stocks_updated_at
  BEFORE UPDATE ON stocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── ETF（原由 ORM 建立，補進 init）──
CREATE TABLE IF NOT EXISTS etf_holdings (
  etf_id       VARCHAR(10) NOT NULL,
  stock_id     VARCHAR(10) NOT NULL,
  stock_name   VARCHAR(50),
  weight       NUMERIC(6,2),
  shares       BIGINT,
  updated_date DATE,
  PRIMARY KEY (etf_id, stock_id)
);

CREATE TABLE IF NOT EXISTS etf_info (
  etf_id       VARCHAR(10) PRIMARY KEY,
  items        JSONB,
  updated_date DATE
);

-- ── pending_jobs（admin 手動觸發，crawler 每分鐘輪詢）──
CREATE TABLE IF NOT EXISTS pending_jobs (
  id          SERIAL       PRIMARY KEY,
  job_name    VARCHAR(50)  NOT NULL,
  status      VARCHAR(10)  NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'running', 'success', 'failed')),
  result      TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_jobs_pending
  ON pending_jobs (created_at) WHERE status = 'pending';

-- ── 壓縮：所有 hypertable 超過 30 天的 chunk 自動壓縮 ──
DO $$
DECLARE
  h RECORD;
BEGIN
  FOR h IN
    SELECT hypertable_name FROM timescaledb_information.hypertables
    WHERE hypertable_schema = 'stocks'
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'stocks' AND table_name = h.hypertable_name AND column_name = 'stock_id'
    ) THEN
      EXECUTE format('ALTER TABLE stocks.%I SET (timescaledb.compress, timescaledb.compress_segmentby = %L)',
                     h.hypertable_name, 'stock_id');
    ELSE
      EXECUTE format('ALTER TABLE stocks.%I SET (timescaledb.compress)', h.hypertable_name);
    END IF;
    PERFORM add_compression_policy(format('stocks.%I', h.hypertable_name)::regclass,
                                   INTERVAL '30 days', if_not_exists => TRUE);
  END LOOP;
END $$;

-- ============================================================
-- 完成
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'stocks schema initialized successfully';
END $$;

-- api 需要寫入 pending_jobs（admin 手動觸發）
GRANT INSERT ON pending_jobs TO api;
