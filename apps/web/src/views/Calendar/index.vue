<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { stockApi } from '@tw-stock-hub/api-client'
import type { ExDividendItem } from '@tw-stock-hub/types'
import { LoadingSkeleton } from '@tw-stock-hub/ui'

type Mode = 'calendar' | 'list'
// 手機月曆格太窄，預設清單
const mode = ref<Mode>(window.matchMedia?.('(max-width: 767px)').matches ? 'list' : 'calendar')

const items = ref<ExDividendItem[]>([])
const loading = ref(true)

const now = new Date()
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth()) // 0-11
const todayStr = toStr(now)
const selectedDay = ref<string | null>(null)

function toStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function load(): Promise<void> {
  loading.value = true
  try {
    let from: string, to: string
    if (mode.value === 'calendar') {
      // 含跨月補白：抓前後各一週
      const f = new Date(viewYear.value, viewMonth.value, 1); f.setDate(f.getDate() - 7)
      const t = new Date(viewYear.value, viewMonth.value + 1, 0); t.setDate(t.getDate() + 7)
      from = toStr(f); to = toStr(t)
    } else {
      const f = new Date(now); f.setDate(f.getDate() - 14)
      const t = new Date(now); t.setDate(t.getDate() + 60)
      from = toStr(f); to = toStr(t)
    }
    items.value = await stockApi.getExDividendCalendar(from, to)
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([mode, viewYear, viewMonth], load)

const byDay = computed(() => {
  const map = new Map<string, ExDividendItem[]>()
  for (const it of items.value) {
    const d = it.exDate.slice(0, 10)
    if (!map.has(d)) map.set(d, [])
    map.get(d)!.push(it)
  }
  return map
})
const sortedDays = computed(() =>
  [...byDay.value.entries()].sort((a, b) => a[0].localeCompare(b[0])),
)

// 6 週網格（含前後月補白）
const weekdays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
const calendarCells = computed(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1)
  const start = new Date(first)
  start.setDate(start.getDate() - first.getDay())
  const cells: { date: string; day: number; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    cells.push({ date: toStr(d), day: d.getDate(), inMonth: d.getMonth() === viewMonth.value })
  }
  return cells
})

const rangeLabel = computed(() => {
  const last = new Date(viewYear.value, viewMonth.value + 1, 0)
  return `${viewYear.value}年${viewMonth.value + 1}月1日 – ${viewYear.value}年${viewMonth.value + 1}月${last.getDate()}日`
})
const weekOfMonth = computed(() => {
  if (viewYear.value !== now.getFullYear() || viewMonth.value !== now.getMonth()) return null
  return Math.ceil((now.getDate() + new Date(viewYear.value, viewMonth.value, 1).getDay()) / 7)
})

function prevMonth(): void {
  if (viewMonth.value === 0) { viewMonth.value = 11; viewYear.value-- } else viewMonth.value--
  selectedDay.value = null
}
function nextMonth(): void {
  if (viewMonth.value === 11) { viewMonth.value = 0; viewYear.value++ } else viewMonth.value++
  selectedDay.value = null
}
function goToday(): void {
  viewYear.value = now.getFullYear(); viewMonth.value = now.getMonth(); selectedDay.value = null
}

const selectedList = computed(() => (selectedDay.value ? byDay.value.get(selectedDay.value) ?? [] : []))

// 事件配色（依股號 hash 取色，視覺多樣如行事曆）
const PALETTE = ['ev-red', 'ev-amber', 'ev-green', 'ev-blue', 'ev-violet']
function evColor(stockId: string): string {
  let h = 0
  for (const ch of stockId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]!
}
function evLabel(it: ExDividendItem): string {
  if (it.cashDividend) return `配息 ${it.cashDividend}`
  if (it.stockDividendRatio) return `配股 ${it.stockDividendRatio}`
  return '除權息'
}
</script>

<template>
  <div class="cal-page flex flex-col gap-5">
    <header class="page-head">
      <div>
        <h1 class="page-head-title">
          除權息行事曆
        </h1>
        <div class="page-head-sub">
          EX-DIVIDEND CALENDAR
        </div>
      </div>
      <div class="page-head-meta">
        除權息、發放與股東會日程
      </div>
    </header>
    <div class="cal-card">
      <!-- 工具列 -->
      <div class="toolbar">
        <div class="tb-left">
          <div class="date-badge">
            <span class="db-m num">{{ now.getMonth() + 1 }}月</span>
            <span class="db-d num">{{ now.getDate() }}</span>
          </div>
          <div>
            <div class="tb-title">
              <span class="num">{{ viewYear }}年{{ viewMonth + 1 }}月</span>
              <span v-if="weekOfMonth" class="week-tag">第 {{ weekOfMonth }} 週</span>
            </div>
            <div class="tb-range num">{{ rangeLabel }}</div>
          </div>
        </div>
        <div class="tb-right">
          <div class="seg-toggle">
            <button :class="['st', mode === 'calendar' && 'st-on']" @click="mode = 'calendar'">月曆</button>
            <button :class="['st', mode === 'list' && 'st-on']" @click="mode = 'list'">清單</button>
          </div>
          <div v-if="mode === 'calendar'" class="nav-cluster">
            <button class="nav-btn" @click="prevMonth" aria-label="上個月">‹</button>
            <button class="today-btn" @click="goToday">今天</button>
            <button class="nav-btn" @click="nextMonth" aria-label="下個月">›</button>
          </div>
        </div>
      </div>

      <LoadingSkeleton v-if="loading" type="table" :rows="8" />

      <!-- 月曆 -->
      <template v-else-if="mode === 'calendar'">
        <div class="grid-head">
          <span v-for="(w, wi) in weekdays" :key="w" :class="['gh', (wi === 0 || wi === 6) && 'gh-we']">{{ w }}</span>
        </div>
        <div class="grid">
          <div
            v-for="c in calendarCells"
            :key="c.date"
            :class="[
              'cell',
              !c.inMonth && 'cell-out',
              c.date === todayStr && 'cell-today',
              byDay.get(c.date) && 'cell-has',
              selectedDay === c.date && 'cell-sel',
            ]"
            @click="byDay.get(c.date) ? (selectedDay = selectedDay === c.date ? null : c.date) : null"
          >
            <span class="cell-day" :class="c.date === todayStr && 'cell-day-today'">{{ c.day }}</span>
            <div v-if="byDay.get(c.date)" class="events">
              <span
                v-for="it in byDay.get(c.date)!.slice(0, 3)"
                :key="it.stockId"
                :class="['event', evColor(it.stockId)]"
              >
                <b class="ev-name">{{ it.stockName }}</b>
                <span class="ev-time">{{ evLabel(it) }}</span>
              </span>
              <span v-if="byDay.get(c.date)!.length > 3" class="ev-more">+{{ byDay.get(c.date)!.length - 3 }} 檔</span>
            </div>
          </div>
        </div>

        <div v-if="selectedDay && selectedList.length" class="day-detail">
          <div class="dd-hd">
            <span class="dd-date num">{{ selectedDay }}</span>
            <span class="dd-cnt">{{ selectedList.length }} 檔除權息</span>
          </div>
          <div class="dd-items">
            <router-link v-for="it in selectedList" :key="it.stockId" :to="`/stocks/${it.stockId}`" class="dd-item">
              <span class="ci-name">{{ it.stockName }}</span>
              <span class="ci-id num">{{ it.stockId }}</span>
              <span class="ci-div num">{{ evLabel(it) }}</span>
            </router-link>
          </div>
        </div>
      </template>

      <!-- 清單 -->
      <template v-else>
        <div v-if="!sortedDays.length" class="empty">此期間無除權息標的</div>
        <div v-else class="day-list">
          <div v-for="[date, list] in sortedDays" :key="date" class="day-row">
            <div class="day-date" :class="date === todayStr && 'is-today'">
              <span class="num">{{ date.slice(5) }}</span>
              <span v-if="date === todayStr" class="today-tag">今日</span>
              <span v-else-if="date > todayStr" class="future-tag">即將</span>
            </div>
            <div class="day-items">
              <router-link v-for="it in list" :key="it.stockId" :to="`/stocks/${it.stockId}`" :class="['day-pill', evColor(it.stockId)]">
                <b>{{ it.stockName }}</b>
                <span class="num">{{ it.stockId }}</span>
                <span>{{ evLabel(it) }}</span>
              </router-link>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>

.cal-card { background: var(--sf); border: 1px solid var(--bd); border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(29,36,32,0.04); }

/* 工具列 */
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 1.25rem; flex-wrap: wrap; }
.tb-left { display: flex; align-items: center; gap: 0.85rem; }
.date-badge {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 3.2rem; height: 3.2rem; border: 1px solid var(--bd); border-radius: 12px;
}
.db-m { font-size: 0.62rem; color: var(--ink); font-weight: 600; }
.db-d { font-size: 1.4rem; font-weight: 700; line-height: 1; color: var(--txt); }
.tb-title { display: flex; align-items: center; gap: 0.5rem; font-size: 1.3rem; font-weight: 700; color: var(--txt); }
.week-tag { font-size: 0.66rem; font-weight: 500; color: var(--muted); border: 1px solid var(--bd); border-radius: 5px; padding: 0.1rem 0.4rem; }
.tb-range { font-size: 0.75rem; color: var(--muted); margin-top: 0.15rem; }

.tb-right { display: flex; align-items: center; gap: 0.6rem; }
.seg-toggle { display: flex; border: 1px solid var(--bd); border-radius: 8px; overflow: hidden; }
.st { font-size: 0.78rem; font-weight: 500; padding: 0.4rem 0.85rem; color: var(--muted); transition: all 0.15s; }
.st-on { background: var(--ink); color: #fff; }
.nav-cluster { display: flex; align-items: center; gap: 0.3rem; border: 1px solid var(--bd); border-radius: 8px; padding: 0.15rem; }
.nav-btn { width: 1.8rem; height: 1.8rem; border-radius: 6px; font-size: 1rem; color: var(--muted); display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
.nav-btn:hover { background: var(--bg); color: var(--txt); }
.today-btn { font-size: 0.78rem; font-weight: 500; color: var(--txt); padding: 0.3rem 0.7rem; border-radius: 6px; }
.today-btn:hover { background: var(--bg); }

/* 格線 */
.grid-head { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border-top: 1px solid var(--bd); border-bottom: 1px solid var(--bd); }
.gh { text-align: center; padding: 0.6rem 0; font-size: 0.72rem; font-weight: 500; color: var(--muted); }
.gh-we { color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.cell {
  min-height: 118px; border-right: 1px solid var(--bd-soft); border-bottom: 1px solid var(--bd-soft);
  padding: 0.45rem; display: flex; flex-direction: column; gap: 0.3rem; transition: background 0.12s;
}
.cell:nth-child(7n) { border-right: none; }
.cell-out { background: #faf7f1; }
.cell-out .cell-day { color: #cdc4b1; }
.cell-day { font-family: var(--font-mono); font-size: 0.8rem; font-weight: 500; color: var(--muted); padding: 0.1rem 0.15rem; }
.cell-day-today {
  background: var(--ink); color: #fff; width: 1.6rem; height: 1.6rem; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-weight: 700;
}
.cell-has { cursor: pointer; }
.cell-has:hover { background: #faf7f1; }
.cell-sel { box-shadow: inset 0 0 0 2px var(--ink); }

.events { display: flex; flex-direction: column; gap: 3px; overflow: hidden; }
.event {
  display: flex; align-items: baseline; gap: 0.3rem; padding: 0.15rem 0.4rem; border-radius: 5px;
  font-size: 0.68rem; white-space: nowrap; overflow: hidden;
}
.ev-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.ev-time { font-family: var(--font-mono); font-size: 0.6rem; opacity: 0.8; margin-left: auto; flex-shrink: 0; }
.ev-more { font-size: 0.62rem; color: var(--muted); padding-left: 0.4rem; }

/* 事件配色（柔和底） */
.ev-red    { background: rgba(194,65,45,0.1); color: #a33322; }
.ev-amber  { background: rgba(183,121,31,0.12); color: #8a5a12; }
.ev-green  { background: rgba(28,124,84,0.1); color: #165c3f; }
.ev-blue   { background: rgba(47,93,138,0.1); color: #2f5d8a; }
.ev-violet { background: rgba(107,79,138,0.1); color: #6b4f8a; }

/* 選中日 */
.day-detail { border-top: 1px solid var(--bd); padding: 1rem 1.25rem; }
.dd-hd { display: flex; align-items: baseline; gap: 0.6rem; margin-bottom: 0.7rem; }
.dd-date { font-size: 1rem; font-weight: 700; color: var(--txt); }
.dd-cnt { font-size: 0.78rem; color: var(--ink); font-weight: 600; }
.dd-items { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.dd-item { display: flex; align-items: baseline; gap: 0.4rem; padding: 0.35rem 0.6rem; border: 1px solid var(--bd); border-radius: 7px; text-decoration: none; transition: background 0.12s; }
.dd-item:hover { background: var(--bg); }
.ci-name { font-size: 0.82rem; font-weight: 600; color: var(--txt); }
.ci-id { font-size: 0.66rem; color: var(--muted); }
.ci-div { font-size: 0.7rem; color: var(--gold); }

/* 清單 */
.empty { padding: 3rem; text-align: center; color: var(--muted); }
.day-list { display: flex; flex-direction: column; }
.day-row { display: grid; grid-template-columns: 90px 1fr; gap: 1rem; padding: 0.75rem 1.25rem; border-top: 1px solid var(--bd-soft); }
.day-date { display: flex; flex-direction: column; gap: 0.25rem; font-weight: 700; font-size: 1rem; }
.day-date.is-today { color: var(--ink); }
.today-tag { font-size: 0.62rem; color: #fff; background: var(--ink); padding: 0.1rem 0.35rem; border-radius: 4px; width: fit-content; }
.future-tag { font-size: 0.62rem; color: var(--muted); }
.day-items { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.day-pill { display: flex; align-items: baseline; gap: 0.4rem; padding: 0.35rem 0.6rem; border-radius: 7px; text-decoration: none; font-size: 0.78rem; }
.day-pill b { font-weight: 600; }
.day-pill .num { font-size: 0.66rem; opacity: 0.7; }
</style>
