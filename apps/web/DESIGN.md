# 台股盤後資料站 — 前端設計系統（Design System）

> 單一設計來源。所有頁面、元件都應參照本文件的 token 與樣式慣例。
> 實作位置：全域 token 與共用 class 定義於 `src/assets/main.css`；圖表色彩於 `packages/charts/src/theme/echarts-theme.ts`。

---

## 1. 設計方向（Aesthetic Direction）

**金融終端機 · 明亮版（Financial Terminal, Light）**

冷靜、資訊密集、數字優先。白底卡片 + 細邊框，搭配等寬字呈現金融數字，紅綠雙色強烈表達多空。Editorial 風格標題（粗黑體 + 等寬英文副標 + 底線分隔），版面以「看板（board）」為單位。克制的留白，高對比的數據強調。

**記憶點**：淨額「流向長條」(flow-bar) — 數據用視覺長度即時表達強弱，而非只有數字。

---

## 2. 色彩 Token（Color）

台股慣例：**紅漲、綠跌**（與歐美相反）。

| Token | 值 | 用途 |
|-------|-----|------|
| `--up` | `#e63950` | 上漲 / 買超 / 正值 |
| `--dn` | `#10b77a` | 下跌 / 賣超 / 負值 |
| `--gold` | `#d97706` | 標籤、強調點綴（如 TAIEX tag）|
| `--bg` | `#f4f6f9` | 頁面背景 |
| `--sf` | `#ffffff` | 卡片 / 看板表面 |
| `--bd` | `#e2e8f0` | 邊框 / 分隔線 |
| `--txt` | `#0f172a` | 主要文字 |
| `--muted` | `#94a3b8` | 次要 / 標籤文字 |
| `--up-soft` | `rgba(230,57,80,0.1)` | 紅色淡底（標籤、bar 漸層尾）|
| `--dn-soft` | `rgba(16,183,122,0.1)` | 綠色淡底 |

- 不使用紫色漸層、不使用品牌藍當主色。藍 (`#2563eb`) 僅用於連結 hover。
- 圖表（ECharts / lightweight-charts）色彩須與 `--up`/`--dn` 對齊（見 echarts-theme）。

---

## 3. 字體（Typography）

| 角色 | 字體 | 用途 |
|------|------|------|
| 顯示 Display | `'Noto Sans TC', sans-serif` 粗體 | 標題、股名 |
| 數字 Mono | `'JetBrains Mono', monospace` | 所有金融數字、代號、日期、英文副標 |
| 內文 Body | `'Noto Sans TC', sans-serif` | 一般文字 |

- **所有數字一律等寬字**（價格、漲跌、量、淨額、代號、日期）。
- 最小字級 **14px**（`0.875rem`）為內文基準；輔助標籤可至 `0.7rem`。
- 字重：標題 700–800、強調數字 500–600、一般 400–500。

---

## 4. 間距 / 圓角 / 陰影

- 卡片內距：`1rem`（緊湊看板）～`1.25rem`（一般卡片）。
- 區塊間距：`1.25rem`（`gap`）。
- 圓角：看板 `12px`、卡片 `10px`、pill `999px`、小元件 `5–8px`。
- 陰影：預設無（`box-shadow: none`）；hover 浮起用 `0 4px 12px rgba(15,23,42,0.06)`。
- 頁面常用滿版出血：`-m-4 p-5 md:-m-6 md:p-7` 讓背景延伸到邊。

---

## 5. 共用元件 class（定義於 main.css）

| class | 說明 |
|-------|------|
| `.panel` | 看板容器：白底、`--bd` 邊框、`12px` 圓角、無陰影 |
| `.panel-hd` | 看板標題列：左標題右標籤、底部分隔線 |
| `.seg` / `.seg-on` | 底線式分段控制（tab 風） |
| `.pill` / `.pill-on` | 膠囊式選擇（市場、天數）|
| `.bs-toggle` `.bs` `.bs-buy` `.bs-sell` | 買/賣超紅綠切換 |
| `.stat-cell` `.stat-k` `.stat-v` | 指標格（label + 等寬值）|
| `.flow-bar` `.flow-up` `.flow-dn` | 淨額流向長條（漸層、寬度 ∝ 量）|
| `.num` | 等寬數字（`font-mono`）|
| `.is-up` `.is-dn` `.is-flat` | 數值方向上色 |

> 既有的 `.card`、`.badge`、`.btn-primary`、`.input-field`、`.table-modern` 保留，色彩改吃 token。

---

## 6. 動態（Motion）

- 進場：`useStaggerIn` 對 `.fade-card` / `.card` 做交錯淡入。
- hover：背景色 `0.12–0.15s` 過渡；卡片浮起 `translateY(-1px)` + 陰影。
- 數據條：`width` `0.4s ease` 過渡。
- 數字跳動：`useCountUp`（大盤指數、成交值）。
- 克制原則：一次漂亮的載入交錯 > 散落的微互動。

---

## 7. 版面慣例（Layout Patterns）

- **頁首 Header**：粗體中文標題 + 等寬英文副標（letter-spacing 寬）+ 底線；右側放 meta/說明。
- **看板 Board**：`.panel` + `.panel-hd`，內容為列表 / 表格 / grid。
- **排行列表**：排名 chip（前 3 名 `--up`）+ 股名/代號 + flow-bar + 等寬淨額，整列可點跳個股。
- **卡片網格**：`repeat(auto-fill, minmax(180px, 1fr))`。
- **控制列**：seg（類別）置左、pill（範圍）+ bs-toggle（多空）置右。

---

## 8. 各頁規劃（Per-page Plan）

| 頁面 | 重點 |
|------|------|
| Home 大盤總覽 | hero 指數 + 指標面板、走勢圖、熱力圖（可下鑽成份股）、新聞、外資/投信/融資看板 |
| Stock 個股 | 報價 header（8 格指標 + 同類股）、K 線(含量+MA+hover legend)、法人/融資/分點/新聞分頁 |
| Institutional 法人 | 流向看板（flow-bar 排行）+ 連續買賣 streak 卡片 |
| Margin 融資融券 | 同 Institutional 模式：餘額/增減看板 + 高券資比 |
| Broker 分點總覽 | 主力買賣榜 + 各股 top3，點分點進檔案頁 |
| Screener 選股 | 條件控制列（seg/pill）+ 結果看板 |
| Watchlist 自選股 | 卡片網格 + 報價 |

統一原則：**白底看板、等寬數字、紅漲綠跌、editorial header、flow-bar 表達強弱**。

---

## 9. 禁忌（Don'ts）

- ❌ 紫色漸層、Inter/Roboto/系統字當主字。
- ❌ 漲用綠、跌用紅（台股相反）。
- ❌ 數字用非等寬字。
- ❌ 每頁各自重定義色票 — 一律吃全域 token。
- ❌ 重陰影、過度圓角、花俏動畫。
