-- #39 證券類型與 ETF 發行投信（冪等）
SET search_path = stocks, public;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS security_type VARCHAR(20) NOT NULL DEFAULT 'stock';
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS issuer VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_stocks_security_type ON stocks (security_type);
