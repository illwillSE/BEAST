import { useEffect, useRef, useState } from 'react'
import { rgbaToHex } from '../document/model.js'
import { MAG_RADIUS } from '../components/EyedropperMagnifier.jsx'
import { getLastPointer } from './lastPointer.js'
import { findEyedropperSampler } from './eyedropperSamplers.js'
import type { RGBA } from '../document/model.js'

const GRID = MAG_RADIUS * 2 + 1

export interface EyedropperReadout {
  clientX: number
  clientY: number
  pixels: (RGBA | null)[]
}

// Regions that opt out of global eyedropper handling, marked with this
// attribute: the pixel canvas (PixelCanvas.tsx) already owns precise
// sampling and click-to-pick for itself via the tool registry, and the tool
// rail (ToolRail.tsx) has to stay clickable so there's always a way to
// switch off the eyedropper.
const OWNER_SELECTOR = '[data-eyedropper-owner]'

function parseCssColor(css: string): RGBA | null {
  const m = css.match(/rgba?\(([^)]+)\)/)
  if (!m) return null
  const [r, g, b, a = 1] = m[1].split(',').map((s) => parseFloat(s))
  if ([r, g, b].some(Number.isNaN)) return null
  return [r, g, b, Math.round(a * 255)]
}

// Real pixel sampling for any other <canvas> on the page — e.g. layer,
// sprite, and frame thumbnails, which render actual sprite pixel data.
function sampleCanvasRegion(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const ctx = canvas.getContext('2d')
  const rect = canvas.getBoundingClientRect()
  if (!ctx || rect.width === 0 || rect.height === 0) return null
  const px = Math.floor(((clientX - rect.left) / rect.width) * canvas.width)
  const py = Math.floor(((clientY - rect.top) / rect.height) * canvas.height)
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return null

  const x0 = Math.max(0, px - MAG_RADIUS)
  const y0 = Math.max(0, py - MAG_RADIUS)
  const x1 = Math.min(canvas.width - 1, px + MAG_RADIUS)
  const y1 = Math.min(canvas.height - 1, py + MAG_RADIUS)
  const region = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1)

  const pixels: (RGBA | null)[] = []
  for (let dy = -MAG_RADIUS; dy <= MAG_RADIUS; dy++) {
    for (let dx = -MAG_RADIUS; dx <= MAG_RADIUS; dx++) {
      const x = px + dx, y = py + dy
      if (x < x0 || x > x1 || y < y0 || y > y1) { pixels.push(null); continue }
      const i = ((y - y0) * region.width + (x - x0)) * 4
      pixels.push([region.data[i], region.data[i + 1], region.data[i + 2], region.data[i + 3]])
    }
  }
  // A transparent center pixel is itself a selectable color (matches the
  // main canvas eyedropper); only an out-of-bounds null leaves hex unset.
  const center = pixels[Math.floor(pixels.length / 2)]
  const hex = center ? rgbaToHex(center) : null
  return { pixels, hex }
}

// Everywhere else (palette swatches, panels, buttons): there's no pixel data
// to read, so fall back to the nearest ancestor's computed background color
// and show it as a flat swatch rather than a real neighborhood grid.
function sampleElementColor(el: Element) {
  let node: Element | null = el
  while (node) {
    const rgba = parseCssColor(getComputedStyle(node).backgroundColor)
    if (rgba && rgba[3] > 0) return { pixels: new Array(GRID * GRID).fill(rgba) as (RGBA | null)[], hex: rgbaToHex(rgba) }
    node = node.parentElement
  }
  return null
}

function colorAtElement(el: Element, clientX: number, clientY: number): { readout: EyedropperReadout; hex: string | null } | null {
  const sampler = findEyedropperSampler(el)
  if (sampler) {
    const rgba = sampler(clientX, clientY)
    return { readout: { clientX, clientY, pixels: new Array(GRID * GRID).fill(rgba) }, hex: rgbaToHex(rgba) }
  }
  const canvas = el.closest('canvas')
  const sampled = canvas ? sampleCanvasRegion(canvas, clientX, clientY) : sampleElementColor(el)
  if (!sampled) return null
  return { readout: { clientX, clientY, pixels: sampled.pixels }, hex: sampled.hex }
}

function sampleAt(clientX: number, clientY: number) {
  const el = document.elementFromPoint(clientX, clientY)
  if (!el || el.closest(OWNER_SELECTOR)) return null
  return colorAtElement(el, clientX, clientY)
}

// Lets the eyedropper pick a color from anywhere in the app, not just the
// pixel canvas — hovering shows the same magnifier readout, clicking calls
// onPick. Returns the current readout (or null) so the caller can render
// <EyedropperMagnifier>; doesn't render anything itself.
export function useGlobalEyedropper(active: boolean, onPick: (hex: string) => void) {
  const [readout, setReadout] = useState<EyedropperReadout | null>(null)

  // Magnifier readout: torn down/rebuilt freely as `active` changes, fine
  // since nothing downstream depends on its exact teardown timing.
  useEffect(() => {
    if (!active) { setReadout(null); return }
    const showAt = (clientX: number, clientY: number) => setReadout(sampleAt(clientX, clientY)?.readout ?? null)
    const pos = getLastPointer()
    if (pos) showAt(pos.clientX, pos.clientY)
    const onMove = (e: PointerEvent) => showAt(e.clientX, e.clientY)
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [active])

  // Pick + suppression: mounted once and gated by a ref instead of by an
  // `active`-keyed effect. Picking via the temporary (Shift+I) eyedropper
  // reverts the tool from inside the pointerdown handler itself, which flips
  // `active` to false *before* the browser fires the matching `click` for
  // that same gesture — an effect torn down on `active` would already be
  // gone by then, and the click would fall through to the element under the
  // cursor (e.g. selecting a sprite/frame thumbnail). Deciding suppression
  // synchronously at pointerdown, in a ref, sidesteps that race entirely.
  //
  // pointerdown itself is intercepted in the capture phase (before the
  // element's own handlers run) and its propagation stopped: some widgets
  // (the HSV/hue/alpha sliders) start a drag from onPointerDown rather than
  // onClick, so letting it through would edit the color at the same time
  // the eyedropper is trying to just read it.
  const activeRef = useRef(active)
  activeRef.current = active
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const suppressNextClick = useRef(false)

  useEffect(() => {
    const onDownCapture = (e: PointerEvent) => {
      if (!activeRef.current) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!el || el.closest(OWNER_SELECTOR)) return
      e.preventDefault()
      e.stopPropagation()
      suppressNextClick.current = true
      const hex = colorAtElement(el, e.clientX, e.clientY)?.hex
      if (hex) onPickRef.current(hex)
    }
    const onClickCapture = (e: MouseEvent) => {
      if (!suppressNextClick.current) return
      suppressNextClick.current = false
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('pointerdown', onDownCapture, true)
    window.addEventListener('click', onClickCapture, true)
    return () => {
      window.removeEventListener('pointerdown', onDownCapture, true)
      window.removeEventListener('click', onClickCapture, true)
    }
  }, [])

  return readout
}
