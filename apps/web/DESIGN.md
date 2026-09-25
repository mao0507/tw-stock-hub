# 存股帳本（tw-stock-hub）— 前端設計系統

> 單一設計來源，web 與 admin 共用。所有頁面、元件都應參照本文件的 token 與樣式慣例。
> 實作位置：
> - Tailwind token（`paper` / `ink` / `up` / `down` / 暖灰 `gray-*` / 字體）：`configs/tailwind-config/tailwind.config.ts`
> - CSS 變數與共用 class：`apps/web/src/assets/main.css`（admin 為 `apps/admin/src/assets/main.css`，token 相同）
> - 圖表色：`packages/charts/src/theme/echarts-theme.ts`（`STOCK_COLORS`、`PIE_PALETTE`）

---

## 1. 設計方向：A「存股帳本」

暖紙底、襯線標題、沉穩墨綠。像一本整理好的投資帳本，而不是閃爍的交易終端。
資訊仍然完整密集，但用層次（報頭 → 看板 → 列）讓人一眼找到重點。

**記憶點**：墨綠「帳本摘要卡」與襯線大標報頭；數字全部用等寬字。

---

## 2. 色彩 Token

台股慣例：**紅漲、綠跌**，而且一律搭配 ▲▼ 或正負號，不只靠顏色。
**紅色只代表「漲／買超／正值」，不可當品牌色或主要按鈕色**；主色是墨綠。

| Token（CSS / Tailwind） | 值 | 用途 |
|-------|-----|------|
| `--ink` / `ink` | `#1f4d3a` | 主色：導覽選中、主要按鈕、焦點框、摘要卡 |
| `--ink-hover` / `ink-hover` | `#173a2c` | 主色 hover |
| `ink-soft` | `rgba(31,77,58,0.08)` | 主色淡底（標籤、選取） |
| `--up` / `up` | `#c2412d` | 上漲 / 買超 / 正值 |
| `--dn` / `down` | `#1c7c54` | 下跌 / 賣超 / 負值 |
| `--gold` | `#b7791f` | 點綴（TAIEX tag、配息金額、警示） |
| `--bg` / `paper` | `#f6f2ea` | 頁面底色 |
| `--sf` / `paper-surface` | `#fffdf8` | 卡片 / 看板 |
| `--bd` / `paper-line` | `#e3dccd` | 邊框 / 分隔線 |
| `--bd-soft` | `#ece6da` | 表格列分隔 |
| `--txt` / `gray-900` | `#1d2420` | 主要文字 |
| `--muted` | `#6d7068` | 次要文字 |

- Tailwind `gray-*` 已整組換成暖灰（`gray-400` 以上對紙底皆達 4.5:1），不要再引入 `slate`、`blue` 等冷色。
- 墨綠底上的漲跌色要提亮：漲 `#ffb4a3`、跌 `#9fe0bf`（見 Portfolio 摘要卡）。
- 錯誤訊息用 `red-50/red-700`，破壞性按鈕用 `destructive` 變體。

---

## 3. 字體

| 角色 | 字體 | 用途 |
|------|------|------|
| Display | `Noto Serif TC` 600/800（`font-display`） | 頁面大標、看板標題、品牌字 |
| Mono | `IBM Plex Mono`（`font-mono` / `.num`） | 所有金融數字、代號、日期、英文副標 |
| Body | `Noto Sans TC` | 一般文字 |

- **所有數字一律等寬字**。
- 頁面大標 `2rem/800`；看板標題 `1.1rem/800`；內文 14–15px。

---

## 4. 版面

- **桌機（≥1024px）**：左側 232px 側欄（品牌 + 文字導覽，選中項墨綠實心）＋頂部搜尋列；內容區 `max-w-[1400px]`、左右 48px。
- **手機**：頂部品牌 + 搜尋；底部導覽（市場／持股／自選／行事曆／更多），觸控目標 ≥44px，「更多」收法人動向、融資融券、登出。
- **報頭 `.page-head`**：襯線大標 + 等寬英文副標 + 右側 meta，底部 2px 深色粗線。
- **看板 `.panel` + `.panel-hd`**：紙白底、1px 邊框、16px 圓角、無陰影。
- 寬表格在手機改兩行卡片（排行列表）或 `.scroll-x` 水平捲動；**手機不可省略欄位**，改用換行呈現。
- 月曆在手機預設清單模式。

---

## 5. 共用 class（main.css）

| class | 說明 |
|-------|------|
| `.page-head` `.page-head-title` `.page-head-sub` `.page-head-meta` | 報頭 |
| `.panel` `.panel-hd` `.panel-title` `.panel-tag` | 看板 |
| `.card` `.stat-card` | 一般卡片 |
| `.btn-primary`（墨綠）`.btn-ghost` | 按鈕，最小高 40px |
| `.input-field` | 輸入框，墨綠焦點環 |
| `.seg` / `.seg-on` | 底線式分段（墨綠底線） |
| `.pill` / `.pill-on` | 膠囊選擇（選中墨綠） |
| `.bs-toggle` `.bs` `.bs-buy` `.bs-sell` | 買／賣、增／減切換（紅綠有語意） |
| `.stat-cell` `.stat-k` `.stat-v` | 指標格 |
| `.kpi*` `.fund-*` `.bar-chart` `.bc-*` | 個股基本面 |
| `.flow-bar` `.flow-up` `.flow-dn` | 淨額流向長條 |
| `.table-modern` | 表格（表頭不換行） |
| `.num` `.is-up` `.is-dn` `.is-flat` | 等寬數字與方向色 |
| `.scroll-x` | 手機水平捲動容器 |

共用 UI 元件（`packages/ui`）：`AppButton` 預設墨綠、`AppInput`／`AppSelect`／`AppDatePicker` 焦點與選取為墨綠、`AppPagination` 選中墨綠。

---

## 6. 圖表

- 漲跌用 `STOCK_COLORS.up/down`；中性線（指數、累計）用 `STOCK_COLORS.blue`（實為墨綠）。
- 格線 `#ebe4d6`、文字 `#3a3833`、tooltip 深墨 `#1d2420`。
- 配置比例（圓餅）用 `PIE_PALETTE`，不帶漲跌語意；圖例以 HTML 列表呈現，避免窄版標籤被截斷。

---

## 7. 動態

- 進場：`useStaggerIn` 交錯淡入；大數字 `useCountUp`。
- hover：背景 0.15s 過渡；數據條 `width 0.4s ease`。
- 克制：一次載入交錯 > 散落的微互動。

---

## 8. 禁忌

- ❌ 紅色當品牌色／主要按鈕（會被讀成「漲」）。
- ❌ 漲用綠、跌用紅；只靠顏色不加 ▲▼／正負號。
- ❌ 數字用非等寬字。
- ❌ 每頁各自寫色票 — 一律吃 token；不再使用冷灰 `#f1f5f9`、`#94a3b8` 等舊色。
- ❌ 手機為了塞版面而隱藏資料欄位。
- ❌ 空的 Phase 3 區塊（新聞）佔版面：資料上線前不顯示。
