// #40 ETF 成分：最新一期清單＋產業分布；#41 與上期比較
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>

type Holdings = {
  isEtf: boolean
  dataDate: string | null
  source: string | null
  info: unknown[]
  industries: { sector: string; weight: number }[]
  holdings: { name: string; stockId: string | null; symbol: string | null; weight: number; shares: number | null; close: number | null; changePct: number | null }[]
}
const get = async (id: string) => {
  const res = await app.request(`/api/stocks/${id}/etf-holdings`)
  return { status: res.status, body: (await res.json()) as Holdings }
}

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  const a = t.admin
  await a`
    INSERT INTO stocks.stocks (id, name, market, sector, security_type) VALUES
      ('2330', '台積電', 'TWSE', '半導體類指數', 'stock'),
      ('2882', '國泰金', 'TWSE', '金融保險類指數', 'stock'),
      ('0099', '測試ETF', 'TWSE', NULL, 'etf_equity'),
      ('0098', '空ETF', 'TWSE', NULL, 'etf_foreign'),
      ('0097', '換股ETF', 'TWSE', NULL, 'etf_equity'),
      ('0096', '換來源ETF', 'TWSE', NULL, 'etf_equity')
    ON CONFLICT (id) DO UPDATE SET sector = EXCLUDED.sector, security_type = EXCLUDED.security_type`
  await a`
    INSERT INTO stocks.daily_quotes (date, stock_id, open, high, low, close, volume, value, change, change_pct) VALUES
      ('2026-09-23', '2330', 1, 1, 1, 1, 1, 1, 0, 0),
      ('2026-09-24', '2330', 1000, 1010, 990, 1005, 1, 1, 5, 0.5),
      ('2026-09-24', '2882', 60, 61, 59, 59, 1, 1, -1, -1.67)`
  await a`
    INSERT INTO stocks.etf_constituents (etf_id, data_date, holding_name, stock_id, symbol, weight, shares, source) VALUES
      ('0099', '2026-09-20', '舊一期', '2882', '2882.TW', 100, 1, 'moneydj'),
      ('0099', '2026-09-24', '台積電', '2330', '2330.TW', 50.5, 1000, 'moneydj'),
      ('0099', '2026-09-24', '國泰金', '2882', '2882.TW', 29.5, 2000, 'moneydj'),
      ('0099', '2026-09-24', 'NVIDIA', NULL, 'NVDA.US', 12, 30, 'moneydj'),
      ('0099', '2026-09-24', '臺股期貨 202610', NULL, 'FITXN*1.TF', 5, 3, 'moneydj'),
      ('0099', '2026-09-24', 'US TREASURY 4.75% 2055', NULL, NULL, 3, NULL, 'moneydj')`
  await a`
    INSERT INTO stocks.etf_constituents (etf_id, data_date, holding_name, stock_id, symbol, weight, shares, source) VALUES
      ('0097', '2026-09-23', '台積電', '2330', '2330.TW', 40, 100, 'moneydj'),
      ('0097', '2026-09-23', '國泰金', '2882', '2882.TW', 30, 100, 'moneydj'),
      ('0097', '2026-09-23', '被剔除', NULL, NULL, 30, NULL, 'moneydj'),
      ('0097', '2026-09-24', '台積電', '2330', '2330.TW', 45.5, 110, 'moneydj'),
      ('0097', '2026-09-24', '國泰金', '2882', '2882.TW', 30, 100, 'moneydj'),
      ('0097', '2026-09-24', '新納入', NULL, NULL, 24.5, NULL, 'moneydj'),
      ('0096', '2026-09-23', '台積電', '2330', '2330.TW', 50, 1, 'moneydj'),
      ('0096', '2026-09-24', '台積電', '2330', '2330.TW', 51, 1, 'yuanta')`
  await a`INSERT INTO stocks.etf_info (etf_id, items, updated_date) VALUES ('0099', ${a.json([['資產規模', '100億']])}, '2026-09-20')`
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

describe('GET /stocks/{id}/etf-holdings', () => {
  it('最新一期成分依權重排序；台股附收盤與漲跌，非台股只有名稱、代號、權重', async () => {
    const { status, body } = await get('0099')
    expect(status).toBe(200)
    expect(body).toMatchObject({ isEtf: true, dataDate: '2026-09-24', source: 'moneydj', info: [['資產規模', '100億']] })
    expect(body.holdings).toEqual([
      { name: '台積電', stockId: '2330', symbol: '2330.TW', weight: 50.5, shares: 1000, close: 1005, changePct: 0.5 },
      { name: '國泰金', stockId: '2882', symbol: '2882.TW', weight: 29.5, shares: 2000, close: 59, changePct: -1.67 },
      { name: 'NVIDIA', stockId: null, symbol: 'NVDA.US', weight: 12, shares: 30, close: null, changePct: null },
      { name: '臺股期貨 202610', stockId: null, symbol: 'FITXN*1.TF', weight: 5, shares: 3, close: null, changePct: null },
      { name: 'US TREASURY 4.75% 2055', stockId: null, symbol: null, weight: 3, shares: null, close: null, changePct: null },
    ])
  })

  it('產業分布：台股依產業（去掉「類指數」），非台股歸「其他」', async () => {
    expect((await get('0099')).body.industries).toEqual([
      { sector: '半導體', weight: 50.5 },
      { sector: '金融保險', weight: 29.5 },
      { sector: '其他', weight: 20 },
    ])
  })

  it('非 ETF 回 isEtf=false；ETF 無資料回空；查無股票 404', async () => {
    expect((await get('2330')).body).toMatchObject({ isEtf: false, holdings: [] })
    expect((await get('0098')).body).toEqual({
      isEtf: true, dataDate: null, source: null, info: [], industries: [], holdings: [],
    })
    expect((await get('0000')).status).toBe(404)
  })
})

type Changes = {
  comparable: boolean
  dataDate: string | null
  previousDate: string | null
  added: { name: string; stockId: string | null; weight: number }[]
  removed: { name: string; stockId: string | null; weight: number }[]
  changed: { name: string; stockId: string | null; weight: number; previousWeight: number; diff: number }[]
}
const changes = async (id: string) => {
  const res = await app.request(`/api/stocks/${id}/etf-changes`)
  return { status: res.status, body: (await res.json()) as Changes }
}

describe('GET /stocks/{id}/etf-changes', () => {
  it('最新兩期比較：新增、剔除、權重變化（依變化幅度排序、不列未變動）', async () => {
    const { status, body } = await changes('0097')
    expect(status).toBe(200)
    expect(body).toEqual({
      comparable: true,
      dataDate: '2026-09-24',
      previousDate: '2026-09-23',
      added: [{ name: '新納入', stockId: null, weight: 24.5 }],
      removed: [{ name: '被剔除', stockId: null, weight: 30 }],
      changed: [{ name: '台積電', stockId: '2330', weight: 45.5, previousWeight: 40, diff: 5.5 }],
    })
  })

  it('相鄰兩期來源不同不比較；只有一期或沒有資料也不比較', async () => {
    expect((await changes('0096')).body).toMatchObject({ comparable: false, dataDate: '2026-09-24', previousDate: '2026-09-23', added: [], removed: [], changed: [] })
    expect((await changes('0098')).body).toMatchObject({ comparable: false, dataDate: null, previousDate: null })
  })

  it('非 ETF 不比較；查無股票 404', async () => {
    expect((await changes('2330')).body).toMatchObject({ comparable: false, dataDate: null })
    expect((await changes('0000')).status).toBe(404)
  })
})
