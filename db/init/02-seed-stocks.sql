SET search_path = stocks, public;

-- 初始常見股票清單（部分示範）
-- 完整清單建議從 TWSE/TPEX API 取得後批次匯入
INSERT INTO stocks (id, name, market, sector, is_active)
VALUES
  ('2330', '台積電',   'TWSE', '半導體', TRUE),
  ('2317', '鴻海',     'TWSE', '電子零組件', TRUE),
  ('2454', '聯發科',   'TWSE', '半導體', TRUE),
  ('2881', '富邦金',   'TWSE', '金融', TRUE),
  ('2882', '國泰金',   'TWSE', '金融', TRUE),
  ('2412', '中華電',   'TWSE', '通信', TRUE),
  ('2308', '台達電',   'TWSE', '電子零組件', TRUE),
  ('2303', '聯電',     'TWSE', '半導體', TRUE),
  ('1301', '台塑',     'TWSE', '塑膠', TRUE),
  ('2891', '中信金',   'TWSE', '金融', TRUE)
ON CONFLICT (id) DO UPDATE SET
  name      = EXCLUDED.name,
  market    = EXCLUDED.market,
  sector    = EXCLUDED.sector,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
