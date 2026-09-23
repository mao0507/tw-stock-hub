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

- Phase 1：骨架（已建）→ 待辦見下方
- Phase 2：技術指標、RS、screener
- Phase 3：Alert/通知、Telegram、backtest、score、news、分點（含 on-demand 分點爬取）

### Phase 1 待辦

- [ ] portfolio 模組：自選分組 CRUD、HoldingLot CRUD、賣出、holdings 重算、P&L（排除無股價項目）、除息日持股股利
- [ ] stock 模組：搬 web 目前用到的行情/法人/融資 API（參考 `../taiwan-stock-platform/apps/stock-api-service`）
- [ ] admin 模組：搬爬蟲監控、資料健康檢查 API（admin 前端目前打的是舊路由）
- [ ] `packages/api-client`：拿掉 token store / refresh 攔截器，改純 cookie（`withCredentials`），401 導向 `/api/auth/google`
- [ ] web `/portfolio` 頁面（shadcn-vue）
- [ ] `crawler/monitor/alert.py` 的連續失敗計數存在記憶體，一次性任務下永遠歸零；改成查 `crawler_logs` 最近 N 筆

## 上線前必做（目前只在本機跑）

- 所有 `/api/*` 掛 `requireAuth`（`apps/api/src/app.ts` 的 stock 路由目前沒掛）
- Cloudflare Tunnel 只接 web；admin 維持只綁區網或加 Cloudflare Access
- JWT 沒有撤銷機制（無 refresh token）；對外前評估是否需要

## 指令

```bash
pnpm install
pnpm --filter @tw-stock-hub/api dev          # api（讀根目錄 .env）
pnpm --filter @tw-stock-hub/api test
pnpm --filter @tw-stock-hub/api db:generate  # 改 members schema 後產生 migration（api 啟動時自動套用）
pnpm --filter @tw-stock-hub/web dev          # :3000，/api 代理到 :3001

cd crawler && uv run pytest                  # crawler 測試
cd crawler && uv run python run_job.py twse_daily

docker compose up -d --build                 # 全部（需先 cp .env.example .env 並填值）
bash scripts/backup-members.sh               # members 加密備份
```

## 注意

- `db/init/` 只在 DB volume **首次**建立時執行；改了 init SQL 要自己寫補丁 SQL 或重建 volume（stocks 可重爬，members 先備份）。
- drizzle 產生的 migration 若含 `CREATE SCHEMA "members"`，改成 `IF NOT EXISTS`（schema 由 init 預建）。
- Windows 開發：`.sh` 與 `crawler/crontab` 由 `.gitattributes` 強制 LF，別讓編輯器改成 CRLF。
