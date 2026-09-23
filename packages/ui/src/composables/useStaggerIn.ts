import { onMounted, type Ref } from 'vue'
import gsap from 'gsap'

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Fades+slides the direct children matched by `selector` inside `containerRef`
 * in on mount, staggered. No-op under prefers-reduced-motion.
 */
export function useStaggerIn(
  containerRef: Ref<HTMLElement | null | undefined>,
  selector = ':scope > *',
  opts: { y?: number; stagger?: number; duration?: number; delay?: number } = {}
): void {
  onMounted(() => {
    if (prefersReducedMotion()) return
    const root = containerRef.value
    if (!root) return
    const targets = root.querySelectorAll(selector)
    if (!targets.length) return
    gsap.from(targets, {
      opacity: 0,
      y: opts.y ?? 12,
      duration: opts.duration ?? 0.45,
      delay: opts.delay ?? 0,
      stagger: opts.stagger ?? 0.06,
      ease: 'power2.out',
    })
  })
}
