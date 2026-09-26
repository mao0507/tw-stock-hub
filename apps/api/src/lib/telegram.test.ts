import { describe, expect, it } from 'vitest'
import { createTelegram } from './telegram.js'

/** 假的 Telegram API：記錄每次請求的 body，getUpdates 依序回傳預設批次 */
function fakeFetch(batches: unknown[][]) {
  const calls: { method: string; body: Record<string, unknown> | undefined }[] = []
  const fn = (async (url: string, init?: RequestInit) => {
    const method = String(url).split('/').pop()!
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
    calls.push({ method, body })
    const result = method === 'getUpdates' ? batches.shift() ?? [] : true
    return new Response(JSON.stringify({ ok: true, result }))
  }) as typeof fetch
  return { fn, calls }
}
const start = (id: number, chat: number, text: string) => ({ update_id: id, message: { text, chat: { id: chat } } })

describe('createTelegram', () => {
  it('未設定 token 時停用', async () => {
    const tg = createTelegram({})
    expect(tg.enabled).toBe(false)
    expect(await tg.findStartChat('ABCD2345')).toBeNull()
  })

  it('getUpdates 以 offset 確認已讀，先前讀到的 /start 碼仍可找到', async () => {
    const { fn, calls } = fakeFetch([[start(10, 111, '/start ABCD2345'), start(11, 222, 'hi')], []])
    const tg = createTelegram({ token: 't', botUsername: 'bot_name' }, fn)
    expect(await tg.findStartChat('ZZZZ9999')).toBeNull()
    expect(await tg.findStartChat('ABCD2345')).toBe('111')
    expect(calls.map((c) => c.body?.offset)).toEqual([undefined, 12])
  })

  it('同一綁定碼被兩個 chat 使用時不綁定', async () => {
    const { fn } = fakeFetch([[start(1, 111, '/start ABCD2345'), start(2, 999, '/start ABCD2345')]])
    const tg = createTelegram({ token: 't', botUsername: 'bot_name' }, fn)
    expect(await tg.findStartChat('ABCD2345')).toBeNull()
  })
})
