// Telegram Bot API 的最小封裝（#27）。未設定 token 時 enabled=false，所有操作都是 no-op。
// 綁定不用 webhook：使用者把 /start <綁定碼> 傳給 bot 後，由 getUpdates 找出對應的 chat id。

export type Telegram = {
  enabled: boolean
  botUsername: string | null
  send(chatId: string, text: string): Promise<void>
  /** 在 bot 最近收到的訊息中找「/start <code>」，回傳該 chat id */
  findStartChat(code: string): Promise<string | null>
}

type Update = { message?: { text?: string; chat?: { id?: number | string } } }

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
  return {
    enabled: true,
    botUsername: botUsername ?? null,
    async send(chatId, text) {
      await call('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true })
    },
    async findStartChat(code) {
      const updates = await call<Update[]>('getUpdates')
      const hit = updates.reverse().find((u) => u.message?.text?.trim() === `/start ${code}`)
      return hit?.message?.chat?.id != null ? String(hit.message.chat.id) : null
    },
  }
}
