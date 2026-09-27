// #23 均線交叉回測、#35 策略擴充與交易成本
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { seedStock, startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>

type Result = {
  stockId: string
  strategy: string
  params: Record<string, number>
  fees: boolean
  trades: { entryDate: string; entryPrice: number; exitDate: string; exitPrice: number; shares: number; fees: number; returnPct: number }[]
  tradeCount: number
  winRate: number
  totalReturnPct: number
  maxDrawdownPct: number
  finalCapital: number
  totalFees: number
}
const run = async (q: string) => {
  const res = await app.request(`/api/backtest?${q}`)
  return { status: res.status, body: (await res.json()) as Result }
}
const day = (i: number) => `2026-08-${String(i + 1).padStart(2, '0')}`

/** 開盤 = 收盤 - 1，驗證是用「次日開盤」成交 */
async function quotes(id: string, closes: number[]) {
  for (const [i, c] of closes.entries()) {
    await t.admin`
      INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value)
      VALUES (${day(i)}, ${id}, ${c - 1}, ${c}, ${c - 1}, ${c}, 1000, 1)`
  }
}

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  await seedStock(t.admin, '7601', '先漲後跌')
  await seedStock(t.admin, '7602', '持續上漲')
  await seedStock(t.admin, '00601', '測試 ETF')
  // MA2 在第 6 天（index 5）上穿 MA3、第 9 天（index 8）下穿
  await quotes('7601', [10, 10, 10, 9, 8, 12, 14, 15, 11, 9, 8])
  // MA2 在 index 3 上穿，之後一路漲到期末仍持有
  await quotes('7602', [10, 10, 10, 11, 12, 13])
  await quotes('00601', [10, 10, 10, 9, 8, 12, 14, 15, 11, 9, 8])
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

describe('GET /backtest', () => {
  it('黃金交叉次日開盤進場、死亡交叉次日開盤出場；整股計算資金與最大回落', async () => {
    const { status, body } = await run('stockId=7601&fast=2&slow=3&initialCapital=100000&fees=false')
    expect(status).toBe(200)
    expect(body.trades).toEqual([
      { entryDate: day(6), entryPrice: 13, exitDate: day(9), exitPrice: 8, shares: 7692, fees: 0, returnPct: -38.46 },
    ])
    expect(body).toMatchObject({ tradeCount: 1, winRate: 0, finalCapital: 61540, totalReturnPct: -38.46, totalFees: 0 })
    // 權益高點 115384（持股 7692 股 × 15 + 現金 4）→ 期末 61540
    expect(body.maxDrawdownPct).toBeCloseTo(-46.67, 2)
  })

  it('預設計入手續費 0.1425%（四捨五入、整股最低 20 元）與證交稅 0.3%（捨去）；買進股數扣除手續費', async () => {
    const { body } = await run('stockId=7601&fast=2&slow=3&initialCapital=100000')
    // 買 7681 股 × 13 = 99853，手續費 142；賣 × 8 = 61448，手續費 88、證交稅 184
    expect(body.trades).toEqual([
      { entryDate: day(6), entryPrice: 13, exitDate: day(9), exitPrice: 8, shares: 7681, fees: 414, returnPct: -38.82 },
    ])
    expect(body).toMatchObject({ fees: true, totalFees: 414, finalCapital: 61181, totalReturnPct: -38.82 })
  })

  it('ETF 證交稅 0.1%', async () => {
    const { body } = await run('stockId=00601&fast=2&slow=3&initialCapital=100000')
    expect(body).toMatchObject({ totalFees: 291, finalCapital: 61304 })
  })

  it('KD、MACD、突破策略依各自訊號進出場（期望值由 crawler 指標公式手算）', async () => {
    const same = [{ entryDate: day(6), entryPrice: 13, exitDate: day(9), exitPrice: 8, shares: 7692, fees: 0, returnPct: -38.46 }]
    // KD(3)：K 在 index 5 上穿 D（67.9 > 59.67）、index 8 下穿（63.82 < 69.65）
    expect((await run('stockId=7601&strategy=kd_cross&period=3&initialCapital=100000&fees=false')).body.trades).toEqual(same)
    // MACD(2,3,2)：DIF 在 index 5 上穿 DEA（0.44 > 0.21）、index 8 下穿（-0.19 < 0.09）
    expect((await run('stockId=7601&strategy=macd_cross&fast=2&slow=3&signal=2&initialCapital=100000&fees=false')).body.trades).toEqual(same)
    // 突破前 3 日高（index 5 收 12 > 10）、跌破前 2 日低（index 8 收 11 < 13）
    expect((await run('stockId=7601&strategy=breakout&entryDays=3&exitDays=2&initialCapital=100000&fees=false')).body.trades).toEqual(same)
  })

  it('RSI 超賣反彈：RSI 由超賣線下方回升穿越進場，到出場線出場', async () => {
    // RSI(2)：index 4 = 0、index 5 = 84.21 → 次日（index 6）開盤 13 進場；index 6 = 91.43 ≥ 70 → index 7 開盤 14 出場
    const { body } = await run('stockId=7601&strategy=rsi_rebound&period=2&buyBelow=30&sellAbove=70&initialCapital=100000&fees=false')
    expect(body.params).toEqual({ period: 2, buyBelow: 30, sellAbove: 70 })
    expect(body.trades).toEqual([
      { entryDate: day(6), entryPrice: 13, exitDate: day(7), exitPrice: 14, shares: 7692, fees: 0, returnPct: 7.69 },
    ])
    expect(body).toMatchObject({ winRate: 100, finalCapital: 107692 })
  })

  it('期末仍持有的部位以最後收盤價結算', async () => {
    const { body } = await run('stockId=7602&fast=2&slow=3&initialCapital=100000&fees=false')
    expect(body.trades).toEqual([
      { entryDate: day(4), entryPrice: 11, exitDate: day(5), exitPrice: 13, shares: 9090, fees: 0, returnPct: 18.18 },
    ])
    expect(body).toMatchObject({ tradeCount: 1, winRate: 100 })
  })

  it('from / to 限制交易區間（均線仍以區間前的資料暖身）', async () => {
    const { body } = await run(`stockId=7601&fast=2&slow=3&from=${day(7)}`)
    expect(body.trades).toEqual([])
    expect(body).toMatchObject({ tradeCount: 0, winRate: 0, totalReturnPct: 0 })
  })

  it('預設參數 5 / 20，資料不足時沒有交易', async () => {
    const { status, body } = await run('stockId=7602')
    expect(status).toBe(200)
    expect(body).toMatchObject({ strategy: 'ma_cross', params: { fast: 5, slow: 20 }, fees: true, tradeCount: 0 })
  })

  it('列出可用策略與參數範圍', async () => {
    const res = await app.request('/api/backtest/strategies')
    const list = (await res.json()) as { key: string; params: { key: string; default: number }[] }[]
    expect(list.map((s) => s.key)).toEqual(['ma_cross', 'kd_cross', 'macd_cross', 'breakout', 'rsi_rebound'])
    expect(list[0]!.params).toEqual([
      { key: 'fast', label: '快線', default: 5, min: 2, max: 120 },
      { key: 'slow', label: '慢線', default: 20, min: 3, max: 250 },
    ])
  })

  it('參數錯誤 400、查無股票 404', async () => {
    expect((await run('stockId=7601&fast=20&slow=5')).status).toBe(400)
    expect((await run('stockId=7601&strategy=nope')).status).toBe(400)
    expect((await run('stockId=7601&strategy=macd_cross&fast=26&slow=12')).status).toBe(400)
    expect((await run('stockId=7601&strategy=rsi_rebound&buyBelow=60')).status).toBe(400)
    expect((await run(`stockId=7601&from=${day(5)}&to=${day(1)}`)).status).toBe(400)
    expect((await run('stockId=9999')).status).toBe(404)
  })
})
