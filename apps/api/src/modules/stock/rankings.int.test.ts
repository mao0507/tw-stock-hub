// #8 法人與融資排行
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { responseCache } from '../../lib/cache.js'
import { startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>

const get = async <T>(path: string) => {
  const res = await app.request(`/api${path}`)
  return { status: res.status, body: (await res.json()) as T }
}
const ids = (rows: { stockId: string }[]) => rows.map((r) => r.stockId)

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

describe('無資料時回空陣列', () => {
  it.each(['/institutional/ranking', '/institutional/continuous', '/margin/ranking', '/margin/high-ratio'])('%s', async (p) => {
    expect((await get(p)).body).toEqual([])
  })
})

describe('有資料時', () => {
  beforeAll(async () => {
    const a = t.admin
    await a`
      INSERT INTO stocks.stocks (id, name, market, is_active) VALUES
        ('7401', '甲', 'TWSE', TRUE), ('7402', '乙', 'TWSE', TRUE), ('7403', '丙', 'TPEX', TRUE),
        ('7404', '下市', 'TWSE', FALSE)`
    // 外資/投信/自營 net 依序；buy = net > 0 ? net : 0、sell 反之（簡化）
    const inst = async (d: string, id: string, f: number, tr: number, de: number) => {
      const b = (n: number) => Math.max(n, 0)
      const s = (n: number) => Math.max(-n, 0)
      await a`
        INSERT INTO stocks.institutional_trading
          (date, stock_id, foreign_buy, foreign_sell, foreign_net, trust_buy, trust_sell, trust_net,
           dealer_buy, dealer_sell, dealer_net, total_net)
        VALUES (${d}, ${id}, ${b(f)}, ${s(f)}, ${f}, ${b(tr)}, ${s(tr)}, ${tr}, ${b(de)}, ${s(de)}, ${de}, ${f + tr + de})`
    }
    for (const d of ['2026-09-23', '2026-09-24', '2026-09-25']) {
      await inst(d, '7401', 1000, 100, 10) // 連三天買超
      await inst(d, '7402', -500, -50, 0) // 連三天賣超
      await inst(d, '7403', 300, 0, 0)
      await inst(d, '7404', 99999, 0, 0) // 下市不列
    }
    await inst('2026-09-22', '7403', -1, 0, 0)

    const margin = async (d: string, id: string, bal: number, chg: number, short: number) => a`
      INSERT INTO stocks.margin_trading
        (date, stock_id, margin_balance, margin_change, margin_limit, short_balance, short_change, short_limit)
      VALUES (${d}, ${id}, ${bal}, ${chg}, 0, ${short}, 0, 0)`
    await margin('2026-09-25', '7401', 1100, 100, 440) // 券資比 40%
    await margin('2026-09-25', '7402', 900, -100, 90) // 10%
    await margin('2026-09-25', '7403', 500, 50, 300) // 60%
    await margin('2026-09-24', '7401', 1000, 0, 0)
    await a`
      INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value)
      VALUES ('2026-09-25', '7401', 50, 50, 50, 50, 1, 1), ('2026-09-25', '7403', 30, 30, 30, 30, 1, 1)`
    responseCache.clear()
  })

  describe('法人買賣超排行', () => {
    it('預設：最新一日三大法人合計買超排行；合計買賣張數為三者加總', async () => {
      const { body } = await get<Record<string, unknown>[]>('/institutional/ranking')
      expect(ids(body as { stockId: string }[])).toEqual(['7401', '7403', '7402'])
      expect(body[0]).toEqual({
        stockId: '7401', stockName: '甲', market: 'TWSE', buyAmount: 1110, sellAmount: 0, netAmount: 1110,
      })
    })

    it('賣超排行、單一法人、市場篩選、筆數、指定日期', async () => {
      expect(ids((await get<{ stockId: string }[]>('/institutional/ranking?order=sell&limit=1')).body)).toEqual(['7402'])
      expect((await get<{ netAmount: number }[]>('/institutional/ranking?type=trust&limit=1')).body[0]!.netAmount).toBe(100)
      expect(ids((await get<{ stockId: string }[]>('/institutional/ranking?market=TPEX')).body)).toEqual(['7403'])
      const old = await get<{ stockId: string; netAmount: number }[]>('/institutional/ranking?date=2026-09-22')
      expect(old.body).toEqual([expect.objectContaining({ stockId: '7403', netAmount: -1 })])
    })

    it('參數錯誤回 400', async () => {
      expect((await get('/institutional/ranking?type=retail')).status).toBe(400)
      expect((await get('/institutional/ranking?limit=101')).status).toBe(400)
    })
  })

  describe('連續買賣超', () => {
    it('最近 N 個交易日每天都買超，依累計金額排序並附最新收盤', async () => {
      expect((await get('/institutional/continuous?days=3')).body).toEqual([
        { stockId: '7401', stockName: '甲', continuousDays: 3, totalNet: 3330, latestClose: 50 },
        { stockId: '7403', stockName: '丙', continuousDays: 3, totalNet: 900, latestClose: 30 },
      ])
    })

    it('連續賣超；N 天內有一天沒買超就不列入', async () => {
      expect(ids((await get<{ stockId: string }[]>('/institutional/continuous?days=3&direction=sell')).body)).toEqual(['7402'])
      // 最近 4 個交易日：7403 在 09-22 賣超
      expect(ids((await get<{ stockId: string }[]>('/institutional/continuous?days=4')).body)).toEqual([])
    })

    it('交易日不足 N 天回空陣列；days 範圍 2–20', async () => {
      expect((await get('/institutional/continuous?days=5')).body).toEqual([])
      expect((await get('/institutional/continuous?days=1')).status).toBe(400)
    })
  })

  describe('融資增減排行', () => {
    it('最新一日融資增加排行，附增減率與收盤', async () => {
      expect((await get('/margin/ranking')).body).toEqual([
        { stockId: '7401', stockName: '甲', market: 'TWSE', marginBalance: 1100, marginChange: 100, marginChangeRate: 10, latestClose: 50 },
        { stockId: '7403', stockName: '丙', market: 'TPEX', marginBalance: 500, marginChange: 50, marginChangeRate: 11.11, latestClose: 30 },
        { stockId: '7402', stockName: '乙', market: 'TWSE', marginBalance: 900, marginChange: -100, marginChangeRate: -10, latestClose: 0 },
      ])
    })

    it('減少排行與市場篩選', async () => {
      expect(ids((await get<{ stockId: string }[]>('/margin/ranking?order=decrease&limit=1')).body)).toEqual(['7402'])
      expect(ids((await get<{ stockId: string }[]>('/margin/ranking?market=TWSE')).body)).toEqual(['7401', '7402'])
    })
  })

  describe('高券資比', () => {
    it('券資比達門檻者依比例排序', async () => {
      expect((await get('/margin/high-ratio')).body).toEqual([
        { stockId: '7403', stockName: '丙', market: 'TPEX', marginBalance: 500, shortBalance: 300, ratio: 60, latestClose: 30 },
        { stockId: '7401', stockName: '甲', market: 'TWSE', marginBalance: 1100, shortBalance: 440, ratio: 40, latestClose: 50 },
      ])
      expect(ids((await get<{ stockId: string }[]>('/margin/high-ratio?threshold=50')).body)).toEqual(['7403'])
      expect((await get('/margin/high-ratio?threshold=101')).status).toBe(400)
    })
  })

  describe('邊界', () => {
    it('不存在的日期回 400', async () => {
      expect((await get('/institutional/ranking?date=2026-02-30')).status).toBe(400)
      expect((await get('/margin/ranking?date=2026-13-01')).status).toBe(400)
    })

    it('ALL 時上市先有新一天資料、上櫃還沒到：仍用兩市場都有的日期，不會漏掉上櫃', async () => {
      await t.admin`
        INSERT INTO stocks.margin_trading
          (date, stock_id, margin_balance, margin_change, margin_limit, short_balance, short_change, short_limit)
        VALUES ('2026-09-26', '7401', 1200, 100, 0, 0, 0, 0)`
      await t.admin`
        INSERT INTO stocks.institutional_trading
          (date, stock_id, foreign_buy, foreign_sell, foreign_net, trust_buy, trust_sell, trust_net,
           dealer_buy, dealer_sell, dealer_net, total_net)
        VALUES ('2026-09-26', '7401', 1, 0, 1, 0, 0, 0, 0, 0, 0, 1)`
      responseCache.clear()
      expect(ids((await get<{ stockId: string }[]>('/margin/ranking')).body)).toContain('7403')
      expect(ids((await get<{ stockId: string }[]>('/institutional/continuous?days=3')).body)).toContain('7403')
      // 單一市場仍取該市場最新
      expect((await get<{ marginBalance: number }[]>('/margin/ranking?market=TWSE&limit=1')).body[0]!.marginBalance).toBe(1200)
    })
  })
})
