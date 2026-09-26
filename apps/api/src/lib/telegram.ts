// Telegram Bot API 的最小封裝（#27）。未設定 token 時 enabled=false，所有操作都是 no-op。
// 綁定不用 webhook：使用者把 /start <綁定碼> 傳給 bot 後，由 getUpdates 找出對應的 chat id。

export type Telegram = {
  enabled: boolean
  botUsername: string | null
  send(chatId: string, text: string): Promise<void>
  /** 在 bot 收到的訊息中找「/start <code>」，回傳該 chat id；找不到或有多個 chat 使用同一碼回 null */
  findStartChat(code: string): Promise<string | null>
}

const MAX_STARTS = 500

type Update = { update_id: number; message?: { text?: string; chat?: { id?: number | string } } }

export function createTelegram(
  opts: { token?: string; botUsername?: string },
  fetchFn: typeof fetch = fetch,
): Telegram {
  const { token, botUsername } = opts
  if (!token) {
    return { enabled: false, botUsername: null, send: async () => {}, findStartChat: async () => null }
  }
  const call = async <T>(method: string, body?: unknown): Promise<T> => {
    const res = await fetchFn(`https://api.telegram.org/bot${token}/${method}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    })
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string }
    // 錯誤訊息不含 token（URL 不外洩）
    if (!json.ok) throw new Error(`Telegram ${method} 失敗：${json.description ?? res.status}`)
    return json.result as T
  }
  // getUpdates 讀過就以 offset 確認（否則 Telegram 只保留最舊 100 則，新的 /start 會看不到）；
  // 讀到的 /start 碼暫存在記憶體，綁定碼 10 分鐘有效、api 重啟後重新產生即可
  const starts = new Map<string, Set<string>>() // code → chat ids
  let offset: number | undefined
  const poll = async () => {
    const updates = await call<Update[]>('getUpdates', {
      offset, timeout: 0, allowed_updates: ['message'],
    })
    for (const u of updates) {
      offset = Math.max(offset ?? 0, u.update_id + 1)
      const m = u.message?.text?.trim().match(/^\/start\s+([A-Z0-9]{4,16})$/)
      const chat = u.message?.chat?.id
      if (m && chat != null) starts.set(m[1]!, (starts.get(m[1]!) ?? new Set()).add(String(chat)))
    }
    // 只留最近 MAX_STARTS 個綁定碼（Map 依插入順序，先刪最舊）
    for (const k of starts.keys()) { if (starts.size <= MAX_STARTS) break; starts.delete(k) }
  }
  return {
    enabled: true,
    botUsername: botUsername ?? null,
    async send(chatId, text) {
      await call('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true })
    },
    async findStartChat(code) {
      await poll()
      const chats = starts.get(code)
      // 同一綁定碼被兩個以上的 chat 使用（碼外流）→ 不綁定，請使用者重新產生
      return chats?.size === 1 ? [...chats][0]! : null
    },
  }
}
