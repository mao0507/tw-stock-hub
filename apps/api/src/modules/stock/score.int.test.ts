// #22 財務體質評分
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { seedQuotes, seedStock, startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>

type Score = { stockId: string; composite: number; grade: string; breakdown: { label: string; score: number; weight: number }[] }
const get = async (id: string) => {
  const res = await app.request(`/api/stocks/${id}/score`)
  return { status: res.status, body: (await res.json()) as Score }
}

async function quarters(id: string, rows: [number, number, number, number, number][]) {
  for (const [y, q, revenue, net, eps] of rows) {
    await t.admin`
      INSERT INTO stocks.financial_statements (stock_id, year, quarter, revenue, net_income, eps)
      VALUES (${id}, ${y}, ${q}, ${revenue}, ${net}, ${eps})`
  }
}
const eightQuarters = (revenue: number, net: number, eps: (i: number) => number) =>
  [...Array(8).keys()].map((i): [number, number, number, number, number] =>
    [2024 + Math.floor((i + 2) / 4), ((i + 2) % 4) + 1, revenue, net, eps(i)])

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  const a = t.admin
  for (const [id, name] of [['7501', '績優'], ['7502', '資料不足'], ['7503', '虧損']] as const) {
    await seedStock(a, id, name)
    await seedQuotes(a, [{ stockId: id, date: '2026-09-24', close: 100 }])
  }

  // 7501：TTM 淨利 40、權益 200 → ROE 20%；權益比 50%；EPS 八季皆正；營收年增 5%；連續配息 5 年；PE 20
  await quarters('7501', eightQuarters(100, 10, () => 1))
  await a`
    INSERT INTO stocks.balance_sheets (stock_id, year, quarter, total_assets, total_equity)
    VALUES ('7501', 2026, 1, 999, 1), ('7501', 2026, 2, 400, 200)`
  for (const ym of ['11505', '11506', '11507', '11508']) {
    await a`INSERT INTO stocks.monthly_revenue (stock_id, year_month, revenue, yoy_pct) VALUES ('7501', ${ym}, 1, ${ym === '11505' ? -90 : 5})`
  }
  for (const y of ['110', '111', '112', '113', '114']) {
    await a`INSERT INTO stocks.dividends (stock_id, dividend_year, period, cash_dividend, stock_dividend) VALUES ('7501', ${y}, '1', 1, 0)`
  }
  await a`INSERT INTO stocks.valuations (date, stock_id, pe, pb, dividend_yield) VALUES ('2026-09-24', '7501', 20, 2, 3)`

  // 7502：只有估值與股利 → 構面不足
  await a`INSERT INTO stocks.valuations (date, stock_id, pe, pb, dividend_yield) VALUES ('2026-09-24', '7502', 12, 1, 5)`

  // 7503：虧損股，前四季 EPS 為負；無資產負債表、無營收、無配息、無本益比
  await quarters('7503', eightQuarters(100, -5, (i) => (i < 4 ? 0.5 : -0.5)))
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

describe('GET /stocks/{id}/score', () => {
  it('五構面加權：獲利 100、成長 50、安全 87.5、股利 50、估值 50 → 70 分 B', async () => {
    const { status, body } = await get('7501')
    expect(status).toBe(200)
    expect(body).toEqual({
      stockId: '7501',
      composite: 70,
      grade: 'B',
      breakdown: [
        { label: '獲利能力', score: 100, weight: 25 },
        { label: '成長力', score: 50, weight: 20 },
        { label: '安全性', score: 87.5, weight: 20 },
        { label: '股利', score: 50, weight: 20 },
        { label: '估值', score: 50, weight: 15 },
      ],
    })
  })

  it('缺資料的構面不列入、權重重新分配；虧損股估值為 0', async () => {
    const { status, body } = await get('7503')
    expect(status).toBe(200)
    expect(body.breakdown.map((b) => b.label)).toEqual(['獲利能力', '安全性', '股利', '估值'])
    expect(body.breakdown.find((b) => b.label === '估值')!.score).toBe(0)
    expect(body.breakdown.find((b) => b.label === '安全性')!.score).toBe(50)
    // (0×25 + 50×20 + 0×20 + 0×15) / 80 = 12.5 → 13
    expect(body).toMatchObject({ composite: 13, grade: 'F' })
  })

  it('可評構面少於 3 個回 404（資料不足）；查無股票 404', async () => {
    expect((await get('7502')).status).toBe(404)
    expect((await get('9999')).status).toBe(404)
  })
})
