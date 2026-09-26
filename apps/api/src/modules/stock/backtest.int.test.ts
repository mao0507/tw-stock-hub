// #23 均線交叉回測
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { seedStock, startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>

type Result = {
  stockId: string
  fastPeriod: number
  slowPeriod: number
  trades: { entryDate: string; entryPrice: number; exitDate: string; exitPrice: number; returnPct: number }[]
  tradeCount: number
  winRate: number
  totalReturnPct: number
  maxDrawdownPct: number
  finalCapital: number
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
  // MA2 在第 6 天（index 5）上穿 MA3、第 9 天（index 8）下穿
  await quotes('7601', [10, 10, 10, 9, 8, 12, 14, 15, 11, 9, 8])
  // MA2 在 index 3 上穿，之後一路漲到期末仍持有
  await quotes('7602', [10, 10, 10, 11, 12, 13])
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

describe('GET /backtest', () => {
  it('黃金交叉次日開盤進場、死亡交叉次日開盤出場；整股計算資金與最大回落', async () => {
    const { status, body } = await run('stockId=7601&fastPeriod=2&slowPeriod=3&initialCapital=100000')
    expect(status).toBe(200)
    expect(body.trades).toEqual([
      { entryDate: day(6), entryPrice: 13, exitDate: day(9), exitPrice: 8, returnPct: -38.46 },
    ])
    expect(body).toMatchObject({ tradeCount: 1, winRate: 0, finalCapital: 61540, totalReturnPct: -38.46 })
    // 權益高點 115384（持股 7692 股 × 15 + 現金 4）→ 期末 61540
    expect(body.maxDrawdownPct).toBeCloseTo(-46.67, 2)
  })

  it('期末仍持有的部位以最後收盤價結算', async () => {
    const { body } = await run('stockId=7602&fastPeriod=2&slowPeriod=3&initialCapital=100000')
    expect(body.trades).toEqual([
      { entryDate: day(4), entryPrice: 11, exitDate: day(5), exitPrice: 13, returnPct: 18.18 },
    ])
    expect(body).toMatchObject({ tradeCount: 1, winRate: 100 })
  })

  it('from / to 限制交易區間（均線仍以區間前的資料暖身）', async () => {
    const { body } = await run(`stockId=7601&fastPeriod=2&slowPeriod=3&from=${day(7)}`)
    expect(body.trades).toEqual([])
    expect(body).toMatchObject({ tradeCount: 0, winRate: 0, totalReturnPct: 0 })
  })

  it('預設參數 5 / 20，資料不足時沒有交易', async () => {
    const { status, body } = await run('stockId=7602')
    expect(status).toBe(200)
    expect(body).toMatchObject({ fastPeriod: 5, slowPeriod: 20, tradeCount: 0 })
  })

  it('參數錯誤 400、查無股票 404', async () => {
    expect((await run('stockId=7601&fastPeriod=20&slowPeriod=5')).status).toBe(400)
    expect((await run(`stockId=7601&from=${day(5)}&to=${day(1)}`)).status).toBe(400)
    expect((await run('stockId=9999')).status).toBe(404)
  })
})
