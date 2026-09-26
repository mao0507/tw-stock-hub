import { onBeforeUnmount, ref, type Ref } from 'vue'

/** 回傳隨視窗變化的 media query 結果；不支援 matchMedia 的環境（測試）回 fallback */
export function useMediaQuery(query: string, fallback = true): Ref<boolean> {
  const mq = window.matchMedia?.(query)
  const matches = ref(mq?.matches ?? fallback)
  const onChange = (e: MediaQueryListEvent) => { matches.value = e.matches }
  mq?.addEventListener('change', onChange)
  onBeforeUnmount(() => mq?.removeEventListener('change', onChange))
  return matches
}
