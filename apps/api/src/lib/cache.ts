import { LRUCache } from 'lru-cache'

// 程序內快取（取代 Redis）。crawler NOTIFY crawler_done 時整批清空。
// ponytail: 全清最簡單；資料量大到清空會造成冷啟動壓力時，再改成依 crawler 名稱清前綴
export const responseCache = new LRUCache<string, object>({
  max: 500,
  ttl: 1000 * 60 * 60,
})
