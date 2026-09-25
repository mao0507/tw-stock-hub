// #5 個股籌碼：三大法人、融資融券、大戶持股
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { seedStock, startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  await seedStock(t.admin, '7101', '籌碼測試')
  await seedStock(t.admin, '7102', '沒有籌碼資料')

  for (const [i, d] of ['2026-09-21', '2026-09-22', '2026-09-23'].entries()) {
    await t.admin`
      INSERT INTO stocks.institutional_trading
        (date, stock_id, foreign_buy, foreign_sell, foreign_net, trust_buy, trust_sell, trust_net,
         dealer_buy, dealer_sell, dealer_net, total_net)
      VALUES (${d}, '7101', 0, 0, ${1000 * (i + 1)}, 0, 0, ${-200}, 0, 0, ${50}, ${1000 * (i + 1) - 150})`
    await t.admin`
      INSERT INTO stocks.margin_trading
        (date, stock_id, margin_balance, margin_change, margin_limit, short_balance, short_change, short_limit)
      VALUES (${d}, '7101', ${4000 + i * 100}, 100, 0, ${i === 2 ? 1000 : 0}, 10, 0)`
  }
  await t.admin`
    INSERT INTO stocks.margin_trading
      (date, stock_id, margin_balance, margin_change, margin_limit, short_balance, short_change, short_limit)
    VALUES ('2026-09-20', '7101', 0, 0, 0, 0, 0, 0)`
  for (const d of ['2026-09-05', '2026-09-12', '2026-09-19']) {
    await t.admin`
      INSERT INTO stocks.shareholder_dispersion (date, stock_id, big_holder_pct, big_holder_count, total_holders)
      VALUES (${d}, '7101', 72.35, 800, 120000)`
  }
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

const get = async <T>(path: string) => {
  const res = await app.request(`/api${path}`)
  return { status: res.status, body: (await res.json()) as T }
}

describe('GET /api/stocks/:id/institutional', () => {
  it('由舊到新，依 days 取最近幾天', async () => {
    const { body } = await get<unknown[]>('/stocks/7101/institutional?days=2')
    expect(body).toEqual([
      { date: '2026-09-22', foreignNet: 2000, trustNet: -200, dealerNet: 50, totalNet: 1850 },
      { date: '2026-09-23', foreignNet: 3000, trustNet: -200, dealerNet: 50, totalNet: 2850 },
    ])
  })

  it('預設 20 天；沒有資料回空陣列；查無股票 404；days 超出範圍 400', async () => {
    expect((await get<unknown[]>('/stocks/7101/institutional')).body).toHaveLength(3)
    expect((await get<unknown[]>('/stocks/7102/institutional')).body).toEqual([])
    expect((await get('/stocks/0000/institutional')).status).toBe(404)
    expect((await get('/stocks/7101/institutional?days=61')).status).toBe(400)
  })
})

describe('GET /api/stocks/:id/margin', () => {
  it('由舊到新，含券資比（融資餘額為 0 時為 null）', async () => {
    const { body } = await get<{ date: string; ratio: number | null }[]>('/stocks/7101/margin')
    expect(body.map((m) => [m.date, m.ratio])).toEqual([
      ['2026-09-20', null],
      ['2026-09-21', 0],
      ['2026-09-22', 0],
      ['2026-09-23', 23.81],
    ])
    expect(body.at(-1)).toEqual({
      date: '2026-09-23',
      marginBalance: 4200,
      marginChange: 100,
      shortBalance: 1000,
      shortChange: 10,
      ratio: 23.81,
    })
  })

  it('沒有資料回空陣列；查無股票 404', async () => {
    expect((await get<unknown[]>('/stocks/7102/margin')).body).toEqual([])
    expect((await get('/stocks/0000/margin')).status).toBe(404)
  })
})

describe('GET /api/stocks/:id/holders', () => {
  it('大戶持股由舊到新，limit 控制週數', async () => {
    const { body } = await get<unknown[]>('/stocks/7101/holders?limit=2')
    expect(body).toEqual([
      { date: '2026-09-12', bigHolderPct: 72.35, bigHolderCount: 800, totalHolders: 120000 },
      { date: '2026-09-19', bigHolderPct: 72.35, bigHolderCount: 800, totalHolders: 120000 },
    ])
  })

  it('沒有資料回空陣列；查無股票 404；limit 上限 52', async () => {
    expect((await get<unknown[]>('/stocks/7102/holders')).body).toEqual([])
    expect((await get('/stocks/0000/holders')).status).toBe(404)
    expect((await get('/stocks/7101/holders?limit=53')).status).toBe(400)
  })
})
