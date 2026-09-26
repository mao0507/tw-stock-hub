# tw-stock-hub

合併 taiwan-stock-platform（全市場資料）與 Dividend-Information-Hub（存股追蹤）的重寫版。
完整架構與決策理由見 `tw-stock-hub 專案架構文件.md`，改架構前先讀、改完同步更新該文件的決策紀錄。

## 結構

```
apps/api        Hono 單體（Node 22）：modules/{stock,auth,portfolio,admin}
apps/web        Vue 3 主站（含 /portfolio），Nginx 服務並反代 /api
apps/admin      Vue 3 後台，只綁 127.0.0.1:8081
crawler/        Python 爬蟲，supercronic + 一次性任務（run_job.py）
db/init/        Postgres 初始化：角色、schema、stocks 資料表、壓縮政策
packages/       前端共用（api-client、ui、charts、types、zod-schemas）
configs/        eslint / tailwind / tsconfig 共用設定
```

## 硬性決策（不要自行推翻）

- **後端是單一 Hono process**，不拆微服務、不用 NestJS。模組之間只透過對方 `index.ts` 匯出的東西互相呼叫，不 import 對方內部檔案。
- **ORM 是 Drizzle**。`members` schema 由 Drizzle migration 管理；`stocks` schema 由 `db/init/*.sql` 管理，`apps/api/src/db/schema/stocks.ts` 只是唯讀映射，不進 migration。
- **沒有 Redis**。爬蟲完成用 `NOTIFY crawler_done`，api `LISTEN`；快取用程序內 `lru-cache`。
- **一個 database（`hub`）兩個 schema**。DB 角色：`crawler` 只能寫 `stocks`；`api` 讀 `stocks`、擁有 `members`、可 INSERT `stocks.pending_jobs`。
- **爬蟲是一次性任務**：新增任務 = 在 `crawler/scheduler/jobs.py` 的 `JOBS` 註冊 + `crawler/crontab` 加一行。不要加常駐 process 或 HTTP server。手動觸發走 `stocks.pending_jobs`。
- **財報來源**：TWSE + TPEx OpenAPI 為主、FinMind 補。不抓 MOPS 財報、不用 FinLab / Goodinfo。上市 OpenAPI 不含上櫃，新增基本面資料時兩邊都要接。
- **Auth**：Google OAuth → 比對 `ALLOWED_EMAILS` → JWT 放 `httpOnly`/`Secure`/`SameSite=Lax` cookie（`token`）。不用 localStorage、不用 Authorization header。
- **持股**：`holding_lots`（買）+ `sell_transactions`（賣，加權平均成本、記錄已實現損益）是資料源；`holdings` 是在同一 transaction 內重算的彙總表。股利按**除息日當天持有股數**計算，不依附特定 lot。
- **時序資料**存完整歷史，hypertable 30 天後自動壓縮。技術指標（Phase 2）增量計算：每檔讀最近約 250 交易日、只寫當天。
- **Alert（Phase 3）只做盤後**，由 `crawler_done` 事件觸發；通道 inApp + Telegram，不做 email。

## 分階段

- Phase 1：已完成（#2–#16）
- Phase 2：技術指標、RS、screener（#19–#21 完成；crawler `analytics/`，API `/stocks/{id}/indicators`、`POST /screener`）
- Phase 3：Alert/通知、Telegram、backtest、score、news、分點（含 on-demand 分點爬取）（#22–#27 完成）
  - 分點按需爬取：api 寫入 `pending_jobs` 的 `broker:<代號>`，`run_job` 以 `PARAM_JOBS` 解析帶參數任務
  - Telegram：設 `TELEGRAM_BOT_TOKEN`／`TELEGRAM_BOT_USERNAME` 才啟用；綁定用 `getUpdates` 比對 `/start <碼>`，不需 webhook

### Phase 1 待辦

- [x] portfolio 模組：自選分組（#10）、買入/賣出/重算/P&L/除息日股利（#11–#13）
- [x] stock 模組：搜尋/個股/K 線、籌碼、基本面、大盤、排行、除權息行事曆（#4–#9）
- [x] admin 模組：爬蟲紀錄/彙總、資料健康、唯讀使用者清單、手動觸發佇列（#15）
- [x] `packages/api-client`：單一 `apiClient`、純 cookie，401 導向 `/api/auth/google`（#3）
- [x] web `/portfolio` 頁面：持股總覽、買賣紀錄、已出清、股利明細（#11–#13）
- [x] 爬蟲連續失敗告警改由 `crawler_logs` 計算（#16）

## 上線前必做（目前只在本機跑）

- 所有 `/api/*` 掛 `requireAuth`（`apps/api/src/app.ts` 的 stock 路由目前沒掛）
- Cloudflare Tunnel 只接 web；admin 維持只綁區網或加 Cloudflare Access
- JWT 沒有撤銷機制（無 refresh token）；對外前評估是否需要

## 指令

```bash
pnpm install
pnpm --filter @tw-stock-hub/api dev          # api（讀根目錄 .env）
pnpm --filter @tw-stock-hub/api test         # 含整合測試，需 Docker（*.int.test.ts 會起 TimescaleDB 容器）
pnpm --filter @tw-stock-hub/api db:generate  # 改 members schema 後產生 migration（api 啟動時自動套用）
pnpm --filter @tw-stock-hub/web dev          # :3000，/api 代理到 :3001

cd crawler && uv run pytest                  # crawler 測試
cd crawler && uv run python run_job.py twse_daily

# 首次啟動灌資料（容器內執行；同一站台勿同時跑多支，上市/上櫃不同主機可並行）
# 逐日：行情/法人/融資/大盤/類股/估值（PE、PB、殖利率）
docker compose exec -d crawler sh -c 'python scripts/backfill_history.py --years 3 --only twse_daily,institutional_twse,margin_twse,market_index,sector,valuation > logs/backfill_twse.log 2>&1'
docker compose exec -d crawler sh -c 'python scripts/backfill_history.py --years 3 --only tpex_daily,institutional_tpex,margin_tpex,valuation_tpex > logs/backfill_tpex.log 2>&1'
# 逐檔（FinMind，歷史只能從這補）：股利含除息日 → 財報 → 月營收 → 資產負債表；可中斷續跑
docker compose exec -d crawler sh -c 'python scripts/backfill_finmind.py > logs/backfill_finmind.log 2>&1'
# 行情回補後：技術指標、RS 全量回算（之後每日排程只算當天）
docker compose exec crawler python run_job.py technical_full && docker compose exec crawler python run_job.py strength_full
docker compose exec crawler python run_job.py exdividend && docker compose exec crawler python run_job.py dividend

docker compose up -d --build                 # 全部（需先 cp .env.example .env 並填值）
bash scripts/backup-members.sh               # members 加密備份
```

## 測試

- api 唯一 seam：`createApp` + `app.request()` + 真 Postgres。整合測試檔命名 `*.int.test.ts`，用 `src/test/harness.ts`：
  - `startTestDb()`：起 TimescaleDB 容器、執行 `db/init`、以 `api` 角色套 members migration；回傳 `api`（api 角色連線）與 `admin`（superuser，用來 seed `stocks.*`）
  - `seedStock` / `seedQuotes`：seed 市場資料
  - `authCookie()`：產生登入 cookie，不走 Google
  - `waitFor()`：等 LISTEN/NOTIFY 這類非同步副作用
  - `createTestUser()`：建立 members.users 並回傳登入 cookie
- 只驗證外部行為（HTTP 狀態、回應、後續查詢結果），不斷言內部函式。
- crawler 用 pytest（`crawler/tests/`）。
- `run_job` 在任務成功後以**任務名稱**發 `NOTIFY crawler_done`；api 依名稱分派（例如 `exdividend` → 重算股利）。

## 注意

- `db/init/` 只在 DB volume **首次**建立時執行；改了 init SQL 要同時在 `db/patches/` 加補丁（冪等），以 superuser 套用：
  `docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/patches/<檔名>.sql`
- 查 hypertable 要帶**常數日期條件**（先查出日期再帶入），否則會鎖住所有 chunk；三年資料約 155 個 chunk／表，DB 已設 `max_locks_per_transaction=512`。
- drizzle 產生的 migration 若含 `CREATE SCHEMA "members"`，改成 `IF NOT EXISTS`（schema 由 init 預建）。
- `financial_statements` 一律存**單季**。TWSE OpenAPI 綜合損益表是年初至今累計，crawler 以 `crawlers/fundamental/ytd.py` 扣除前幾季換算；新增財報來源時要確認是單季還是累計。
- crawler model 與 `db/init/01-stocks.sql` 欄位必須一致（曾漏 `dividends.ex_dividend_date`、`market_index` 開高低），改 model 時同步改 init。
- Windows 開發：`.sh` 與 `crawler/crontab` 由 `.gitattributes` 強制 LF，別讓編輯器改成 CRLF。
