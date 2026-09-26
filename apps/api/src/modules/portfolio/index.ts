import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { and, inArray, isNotNull } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { users } from '../../db/schema/members.js'
import type { Telegram } from '../../lib/telegram.js'
import { type AuthEnv, requireAuth } from '../../middleware/auth.js'
import { createAlertsRepository, type Triggered } from './alerts.repository.js'
import { createAlertRoutes } from './alerts.routes.js'
import { createTelegramRoutes } from './telegram.routes.js'
import { createPortfolioRepository, MAX_PRICE, MAX_TOTAL_SHARES } from './repository.js'
import { summarize } from './summary.js'
import { createWatchlistRoutes } from './watchlist.routes.js'

import { todayInTaipei } from './dates.js'

const tradeDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式須為 YYYY-MM-DD')
  // Date.parse 會接受 2026-02-30 這類不存在的日期，須比對回轉結果
  .refine((d) => {
    const parsed = new Date(`${d}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d
  }, '日期不存在')
  .refine((d) => d <= todayInTaipei(), '日期不可晚於今天')

const StockId = z.string().regex(/^[0-9A-Z]{4,6}$/, '股票代號格式錯誤')

const LotFields = {
  boughtAt: tradeDate,
  // 允許 0：配股、減資等股數變動以零成本批次記錄
  price: z.number().min(0).max(MAX_PRICE),
  shares: z.number().int().positive().max(MAX_TOTAL_SHARES),
  fee: z.number().min(0).max(1_000_000),
}

const LotCreate = z.object({ stockId: StockId, ...LotFields, fee: LotFields.fee.default(0) })
const LotPatch = z.object(LotFields).partial().refine((v) => Object.keys(v).length > 0, '至少修改一個欄位')

const SellFields = {
  soldAt: tradeDate,
  price: z.number().positive().max(MAX_PRICE),
  shares: LotFields.shares,
  fee: LotFields.fee,
  tax: z.number().min(0).max(1_000_000),
}
const SellCreate = z.object({
  stockId: StockId,
  ...SellFields,
  fee: SellFields.fee.default(0),
  tax: SellFields.tax.default(0),
})
const SellPatch = z.object(SellFields).partial().refine((v) => Object.keys(v).length > 0, '至少修改一個欄位')

const Sell = z.object({
  id: z.string().uuid(),
  stockId: z.string(),
  soldAt: z.string(),
  price: z.number(),
  shares: z.number(),
  fee: z.number(),
  tax: z.number(),
  avgCostAtSale: z.number(),
  realizedPnl: z.number(),
})

const Lot = z.object({
  id: z.string().uuid(),
  stockId: z.string(),
  boughtAt: z.string(),
  price: z.number(),
  shares: z.number(),
  fee: z.number(),
})

const Holding = z.object({
  stockId: z.string(),
  name: z.string(),
  shares: z.number(),
  avgCost: z.number(),
  costBasis: z.number(),
  realizedPnl: z.number(),
  earnedDividend: z.number(),
  price: z.number().nullable(),
  priceDate: z.string().nullable(),
  stale: z.boolean(),
  marketValue: z.number().nullable(),
  unrealizedPnl: z.number().nullable(),
  returnPct: z.number().nullable(),
  weight: z.number().nullable(),
})

const Holdings = z.object({
  items: z.array(Holding),
  closed: z.array(
    z.object({ stockId: z.string(), name: z.string(), realizedPnl: z.number(), earnedDividend: z.number() }),
  ),
  totals: z.object({
    realizedPnl: z.number(),
    earnedDividend: z.number(),
    costBasis: z.number(),
    marketValue: z.number(),
    unrealizedPnl: z.number(),
    returnPct: z.number().nullable(),
    staleCount: z.number(),
  }),
})

const Entitlement = z.object({
  stockId: z.string(),
  exDate: z.string(),
  cashPerShare: z.number(),
  shares: z.number(),
  amount: z.number(),
})

const ErrorBody = z.object({ error: z.string() })
const ConflictBody = z.object({ error: z.string(), sellId: z.string().uuid() })
const IdParam = z.object({ id: z.string().uuid() })
const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})
const body = <T extends z.ZodType>(schema: T) => ({ body: { content: { 'application/json': { schema } }, required: true } })

const routes = {
  holdings: createRoute({
    method: 'get',
    path: '/holdings',
    responses: { 200: json(Holdings, '持股總覽（含最新價、損益、配置）') },
  }),
  listLots: createRoute({
    method: 'get',
    path: '/lots',
    request: { query: z.object({ stockId: StockId.optional() }) },
    responses: { 200: json(z.array(Lot), '買入批次（依日期）') },
  }),
  createLot: createRoute({
    method: 'post',
    path: '/lots',
    request: body(LotCreate),
    responses: { 201: json(Lot, '已建立'), 400: json(ErrorBody, '驗證失敗') },
  }),
  updateLot: createRoute({
    method: 'patch',
    path: '/lots/{id}',
    request: { params: IdParam, ...body(LotPatch) },
    responses: { 200: json(Lot, '已更新'), 404: json(ErrorBody, '找不到批次'), 409: json(ConflictBody, '造成超賣') },
  }),
  deleteLot: createRoute({
    method: 'delete',
    path: '/lots/{id}',
    request: { params: IdParam },
    responses: { 204: { description: '已刪除' }, 404: json(ErrorBody, '找不到批次'), 409: json(ConflictBody, '造成超賣') },
  }),
  listDividends: createRoute({
    method: 'get',
    path: '/dividends',
    request: { query: z.object({ stockId: StockId.optional() }) },
    responses: { 200: json(z.array(Entitlement), '股利權利明細（依除息日）') },
  }),
  listSells: createRoute({
    method: 'get',
    path: '/sells',
    request: { query: z.object({ stockId: StockId.optional() }) },
    responses: { 200: json(z.array(Sell), '賣出紀錄（依日期）') },
  }),
  createSell: createRoute({
    method: 'post',
    path: '/sells',
    request: body(SellCreate),
    responses: { 201: json(Sell, '已建立'), 400: json(ErrorBody, '驗證失敗'), 409: json(ConflictBody, '超賣') },
  }),
  updateSell: createRoute({
    method: 'patch',
    path: '/sells/{id}',
    request: { params: IdParam, ...body(SellPatch) },
    responses: { 200: json(Sell, '已更新'), 404: json(ErrorBody, '找不到賣出紀錄'), 409: json(ConflictBody, '超賣') },
  }),
  deleteSell: createRoute({
    method: 'delete',
    path: '/sells/{id}',
    request: { params: IdParam },
    responses: { 204: { description: '已刪除' }, 404: json(ErrorBody, '找不到賣出紀錄') },
  }),
}

/** 除權息資料更新時與 api 啟動時呼叫：重算所有持有或曾持有者的股利權利 */
export function recomputeDividendsForStock(db: Db): Promise<{ updated: number; failed: number }> {
  return createPortfolioRepository(db).recomputeAllPositions()
}

/**
 * 行情任務完成時呼叫：盤後評估提醒規則，回傳本次觸發的通知。
 * 有 Telegram 時推送給已綁定的使用者；推送失敗只記 log，不影響站內通知。
 */
export async function evaluateAlerts(db: Db, telegram?: Telegram): Promise<Triggered[]> {
  const triggered = await createAlertsRepository(db).evaluate()
  if (telegram?.enabled && triggered.length) {
    const ids = [...new Set(triggered.map((t) => t.userId))]
    const chats = new Map(
      (await db.select({ id: users.id, chatId: users.telegramChatId }).from(users)
        .where(and(inArray(users.id, ids), isNotNull(users.telegramChatId))))
        .map((u) => [u.id, u.chatId!]),
    )
    for (const t of triggered) {
      const chatId = chats.get(t.userId)
      if (!chatId) continue
      await telegram.send(chatId, `🔔 ${t.title}
${t.body}`).catch((err: unknown) => {
        console.error('[api] Telegram 推送失敗', t.notificationId, err instanceof Error ? err.message : err)
      })
    }
  }
  return triggered
}

export function createPortfolioRoutes(db: Db, jwtSecret: string, telegram: Telegram) {
  const app = new OpenAPIHono<AuthEnv>()
  const repo = createPortfolioRepository(db)

  app.use('*', requireAuth(jwtSecret))
  app.route('/', createWatchlistRoutes(db))
  app.route('/', createAlertRoutes(db))
  app.route('/', createTelegramRoutes(db, telegram))

  app.openapi(routes.holdings, async (c) => {
    const rows = await repo.holdingsWithPrice(c.get('jwtPayload').sub)
    return c.json(summarize(rows), 200)
  })

  app.openapi(routes.listLots, async (c) => {
    const { stockId } = c.req.valid('query')
    return c.json(await repo.listLots(c.get('jwtPayload').sub, stockId), 200)
  })

  app.openapi(routes.createLot, async (c) => {
    const input = c.req.valid('json')
    if (!(await repo.stockExists(input.stockId))) return c.json({ error: `查無股票 ${input.stockId}` }, 400)
    return c.json(await repo.createLot(c.get('jwtPayload').sub, input), 201)
  })

  app.openapi(routes.updateLot, async (c) => {
    const lot = await repo.updateLot(c.get('jwtPayload').sub, c.req.valid('param').id, c.req.valid('json'))
    return lot ? c.json(lot, 200) : c.json({ error: '找不到批次' }, 404)
  })

  app.openapi(routes.deleteLot, async (c) => {
    const ok = await repo.deleteLot(c.get('jwtPayload').sub, c.req.valid('param').id)
    return ok ? c.body(null, 204) : c.json({ error: '找不到批次' }, 404)
  })

  app.openapi(routes.listDividends, async (c) => {
    const { stockId } = c.req.valid('query')
    return c.json(await repo.listDividends(c.get('jwtPayload').sub, stockId), 200)
  })

  app.openapi(routes.listSells, async (c) => {
    const { stockId } = c.req.valid('query')
    return c.json(await repo.listSells(c.get('jwtPayload').sub, stockId), 200)
  })

  app.openapi(routes.createSell, async (c) => {
    const input = c.req.valid('json')
    if (!(await repo.stockExists(input.stockId))) return c.json({ error: `查無股票 ${input.stockId}` }, 400)
    return c.json(await repo.createSell(c.get('jwtPayload').sub, input), 201)
  })

  app.openapi(routes.updateSell, async (c) => {
    const sell = await repo.updateSell(c.get('jwtPayload').sub, c.req.valid('param').id, c.req.valid('json'))
    return sell ? c.json(sell, 200) : c.json({ error: '找不到賣出紀錄' }, 404)
  })

  app.openapi(routes.deleteSell, async (c) => {
    const ok = await repo.deleteSell(c.get('jwtPayload').sub, c.req.valid('param').id)
    return ok ? c.body(null, 204) : c.json({ error: '找不到賣出紀錄' }, 404)
  })

  return app
}
