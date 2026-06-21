import { useEffect } from 'react'
import type { RGBA } from '../document/model.js'

type Sampler = (clientX: number, clientY: number) => RGBA

const samplers = new WeakMap<Element, Sampler>()

// Lets a widget whose rendered color comes from a CSS gradient rather than a
// flat background (the HSV square, hue slider, alpha slider) tell the global
// eyedropper exactly what color it's showing at a given pointer position,
// computed the same way the widget itself derives that color — instead of
// the generic computed-background-color fallback, which can't see gradients
// at all. Re-registers on every render (cheap) so the sampler always closes
// over the widget's latest state.
export function useEyedropperSampler(ref: { current: HTMLElement | null }, sample: Sampler) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    samplers.set(el, sample)
    return () => { samplers.delete(el) }
  })
}

export function findEyedropperSampler(el: Element): Sampler | null {
  let node: Element | null = el
  while (node) {
    const s = samplers.get(node)
    if (s) return s
    node = node.parentElement
  }
  return null
}
