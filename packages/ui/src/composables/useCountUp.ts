import { ref, watch, type Ref } from 'vue'
import gsap from 'gsap'

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Tweens a displayed number from its previous value to `source` whenever it changes.
 * `decimals` controls rounding of the displayed value.
 */
export function useCountUp(source: Ref<number>, decimals = 0): Ref<number> {
  const display = ref(0)
  const proxy = { value: 0 }

  watch(
    source,
    (target) => {
      if (prefersReducedMotion() || !Number.isFinite(target)) {
        display.value = target
        proxy.value = target
        return
      }
      gsap.to(proxy, {
        value: target,
        duration: 0.6,
        ease: 'power2.out',
        onUpdate: () => {
          display.value = Number(proxy.value.toFixed(decimals))
        },
      })
    },
    { immediate: true }
  )

  return display
}
