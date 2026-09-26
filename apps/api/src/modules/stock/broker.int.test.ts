// #25 分點
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { seedStock, startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const get = async (path: string): Promise<{ status: number; body: any }> => {
  const res = await app.request(`/api${path}`)
  return { status: res.status, body: await res.json() }
}

const D1 = '2026-09-23'
const D2 = '2026-09-24'

async function trade(date: string, stockId: string, broker: string, buy: number, sell: number) {
  await t.admin`
    INSERT INTO stocks.broker_trading (date, stock_id, broker_name, buy, sell, net)
    VALUES (${date}, ${stockId}, ${broker}, ${buy}, ${sell}, ${buy - sell})`
}

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  const a = t.admin
  await seedStock(a, '2330', '台積電')
  await seedStock(a, '2317', '鴻海')
  await seedStock(a, '2454', '聯發科')
  await seedStock(a, '6488', '環球晶', 'TPEX')
  await a`
    INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value) VALUES
      (${D2}, '2330', 1, 1, 1, 1, 100000, 1), (${D2}, '2317', 1, 1, 1, 1, 50000, 1)`
  // 2330：兩天都有資料；凱基台北連兩天買超
  await trade(D1, '2330', '9200凱基台北', 5000, 1000)
  await trade(D1, '2330', '1160日盛', 0, 2000)
  await trade(D2, '2330', '9200凱基台北', 8000, 0)
  await trade(D2, '2330', '1160日盛', 1000, 9000)
  await trade(D2, '2330', '8440摩根大通', 3000, 1000)
  await trade(D2, '2330', '9600富邦', 500, 2500)
  // 2317：只有最新日
  await trade(D2, '2317', '9200凱基台北', 0, 4000)
  await trade(D2, '2317', '8440摩根大通', 6000, 0)
  await a`
    INSERT INTO stocks.broker_trading_detail (date, stock_id, broker_name, price, buy, sell) VALUES
      (${D2}, '2330', '9200凱基台北', 101.5, 5000, 0), (${D2}, '2330', '9200凱基台北', 100, 3000, 0)`
  await a`INSERT INTO stocks.broker_group_tags (broker_name, tag) VALUES ('8440摩根大通', '外資')`
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

describe('分點 API', () => {
  it('ranking：預設最新日期，買超由大到小、賣超由小到大，帶分點標籤', async () => {
    const { status, body } = await get('/broker/ranking?stockId=2330')
    expect(status).toBe(200)
    expect(body.date).toBe(D2)
    expect(body.queued).toBe(false)
    expect(body.topBuy.map((b: { brokerName: string }) => b.brokerName)).toEqual(['9200凱基台北', '8440摩根大通'])
    expect(body.topBuy[1]).toMatchObject({ buy: 3000, sell: 1000, net: 2000, tag: '外資' })
    expect(body.topSell.map((b: { brokerName: string }) => b.brokerName)).toEqual(['1160日盛', '9600富邦'])
    expect((await get(`/broker/ranking?stockId=2330&date=${D1}&limit=1`)).body.topBuy).toHaveLength(1)
  })

  it('ranking：上市股沒有資料時排入按需爬取（不重複排入）；上櫃不排入', async () => {
    const first = await get('/broker/ranking?stockId=2454')
    expect(first.body).toMatchObject({ date: null, topBuy: [], topSell: [], queued: true })
    await get('/broker/ranking?stockId=2454')
    const jobs = await t.admin`SELECT job_name FROM stocks.pending_jobs WHERE job_name = 'broker:2454'`
    expect(jobs).toHaveLength(1)
    expect((await get('/broker/ranking?stockId=6488')).body.queued).toBe(false)
    expect((await get('/broker/ranking?stockId=9999')).status).toBe(404)
  })

  it('overview：最新日各追蹤股的分點數與前三大買賣超', async () => {
    const { body } = await get('/broker/overview')
    expect(body.date).toBe(D2)
    const r = body.rows.find((x: { stockId: string }) => x.stockId === '2330')
    expect(r).toMatchObject({ stockName: '台積電', brokerCount: 4 })
    expect(r.topBuy[0]).toMatchObject({ brokerName: '9200凱基台北', net: 8000 })
    expect(r.topSell[0]).toMatchObject({ brokerName: '1160日盛', net: -8000 })
  })

  it('leaderboard：跨股加總分點買賣超', async () => {
    const { body } = await get('/broker/leaderboard?limit=5')
    expect(body.topBuy[0]).toMatchObject({ brokerName: '8440摩根大通', net: 8000, stockCount: 2, tag: '外資' })
    expect(body.topSell[0]).toMatchObject({ brokerName: '1160日盛', net: -8000, stockCount: 1 })
  })

  it('detail：價位別明細（價格由低到高）', async () => {
    const { body } = await get('/broker/detail?stockId=2330&brokerName=9200凱基台北')
    expect(body).toMatchObject({ date: D2, levels: [{ price: 100, buy: 3000, sell: 0 }, { price: 101.5, buy: 5000, sell: 0 }] })
  })

  it('profile：分點最新日各股進出與每日買賣超歷史', async () => {
    const { body } = await get(`/broker/profile?brokerName=${encodeURIComponent('9200凱基台北')}`)
    expect(body.date).toBe(D2)
    expect(body.buys).toEqual([{ stockId: '2330', stockName: '台積電', buy: 8000, sell: 0, net: 8000 }])
    expect(body.sells).toEqual([{ stockId: '2317', stockName: '鴻海', buy: 0, sell: 4000, net: -4000 }])
    expect(body.history).toEqual([{ date: D1, net: 4000 }, { date: D2, net: 4000 }])
  })

  it('streak：連續買超天數與起始日', async () => {
    const { body } = await get('/broker/streak?stockId=2330&brokerName=9200凱基台北')
    expect(body).toMatchObject({ currentStreak: 2, direction: 'buy', streakStartDate: D1 })
    expect((await get('/broker/streak?stockId=2330&brokerName=9600富邦')).body)
      .toMatchObject({ currentStreak: 1, direction: 'sell', streakStartDate: D2 })
  })

  it('concentration：(前 N 大買超 − 前 N 大賣超) / 成交量', async () => {
    const { body } = await get('/broker/concentration?stockId=2330&topN=2')
    // 買超前二 8000 + 2000，賣超前二 8000 + 2000 → (10000 − 10000) / 100000
    expect(body).toMatchObject({ date: D2, topN: 2, concentrationPct: 0, totalVolume: 100000 })
    expect((await get('/broker/concentration?stockId=2317')).body.concentrationPct).toBe(4)
  })
})
