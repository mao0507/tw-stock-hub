// #24 新聞 API
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { seedStock, startTestDb, testConfig, type TestDb } from '../../test/harness.js'

let t: TestDb
let app: ReturnType<typeof createApp>

type Page = {
  items: { id: string; title: string; source: string; category: string; url: string; publishedAt: string; summary: string | null }[]
  page: number
  limit: number
  total: number
  totalPages: number
}
const get = async (path: string) => {
  const res = await app.request(`/api${path}`)
  return { status: res.status, body: (await res.json()) as Page }
}
const titles = async (path: string) => (await get(path)).body.items.map((i) => i.title)

async function news(title: string, source: string, category: string, at: string, stocks: string[] = []) {
  const [row] = await t.admin<{ id: string }[]>`
    INSERT INTO stocks.news (title, summary, source, url, published_at, category)
    VALUES (${title}, ${`${title} 摘要`}, ${source}, ${`https://example.com/${encodeURIComponent(title)}`}, ${at}, ${category})
    RETURNING id`
  for (const s of stocks) {
    await t.admin`INSERT INTO stocks.news_stock_relations (news_id, stock_id) VALUES (${row!.id}, ${s})`
  }
}

beforeAll(async () => {
  t = await startTestDb()
  app = createApp({ config: testConfig, db: t.api.db, ping: async () => {} })
  await seedStock(t.admin, '2330', '台積電')
  await seedStock(t.admin, '2317', '鴻海')
  await news('台積電法說', 'cnyes', 'market_news', '2026-09-25T08:00:00Z', ['2330'])
  await news('鴻海營收', 'yahoo', 'market_news', '2026-09-24T08:00:00Z', ['2317'])
  await news('大盤評論', 'moneydj', 'analyst', '2026-09-23T08:00:00Z')
  await news('台積電重訊', 'mops', 'major_announcement', '2026-09-22T08:00:00Z', ['2330'])
  await news('鴻海重訊', 'mops', 'major_announcement', '2026-09-10T08:00:00Z', ['2317'])
}, 120_000)

afterAll(async () => {
  await t?.stop()
})

describe('GET /news/latest', () => {
  it('依發布時間新到舊、分頁資訊', async () => {
    const { status, body } = await get('/news/latest?limit=2')
    expect(status).toBe(200)
    expect(body.items.map((i) => i.title)).toEqual(['台積電法說', '鴻海營收'])
    expect(body).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3 })
    expect(body.items[0]).toMatchObject({ source: 'cnyes', category: 'market_news', summary: '台積電法說 摘要' })
    expect(await titles('/news/latest?limit=2&page=3')).toEqual(['鴻海重訊'])
  })

  it('依來源、分類篩選', async () => {
    expect(await titles('/news/latest?source=moneydj')).toEqual(['大盤評論'])
    expect(await titles('/news/latest?category=major_announcement')).toEqual(['台積電重訊', '鴻海重訊'])
  })

  it('參數錯誤回 400', async () => {
    expect((await get('/news/latest?limit=100')).status).toBe(400)
    expect((await get('/news/latest?source=nope')).status).toBe(400)
  })
})

describe('GET /stocks/{id}/news', () => {
  it('只回與該股相關的新聞，可再依分類篩選', async () => {
    expect(await titles('/stocks/2330/news')).toEqual(['台積電法說', '台積電重訊'])
    expect(await titles('/stocks/2330/news?category=major_announcement')).toEqual(['台積電重訊'])
    expect((await get('/stocks/9999/news')).status).toBe(404)
  })
})

describe('GET /news/mops', () => {
  it('重大訊息，可依個股與日期區間篩選', async () => {
    expect(await titles('/news/mops')).toEqual(['台積電重訊', '鴻海重訊'])
    expect(await titles('/news/mops?stockId=2317')).toEqual(['鴻海重訊'])
    expect(await titles('/news/mops?from=2026-09-15&to=2026-09-30')).toEqual(['台積電重訊'])
  })
})
