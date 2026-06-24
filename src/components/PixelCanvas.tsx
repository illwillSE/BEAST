import { useEffect, useRef, useState } from 'react'
import { compositeFrame, hexToRgba, rgbaToHex, pasteRegion, shapeOffsets, selectionOutline } from '../document/model.js'
import { getTool, tools } from '../tools/registry.js'
import { getColor } from '../theme/colors.js'
import { getLastPointer } from '../hooks/lastPointer.js'
import EyedropperMagnifier, { MAG_RADIUS } from './EyedropperMagnifier.jsx'
import type { Sprite, CellTarget, RGBA, BrushShape, Selection } from '../document/model.js'
import type { Action } from '../document/reducer.js'
import type { Rect, Floating, CropPending, Coord, Preview, ToolContext } from '../tools/registry.js'

// Action types whose coordinate fields get mirrored across the active
// symmetry axes — see mirroredDispatch below.
const MIRRORABLE = new Set(['PAINT_LINE', 'FILL', 'PAINT_RECT', 'PAINT_ELLIPSE', 'GRADIENT_FILL'])

function flipAction(action: Action, w: number, h: number, axes: { v?: boolean; h?: boolean }): Action {
  // TODO(ts): generic coordinate-field flip over a discriminated union needs
  // an any here; tighten with a mapped/conditional type if this gets reused.
  const out: any = { ...action }
  if (axes.v) {
    if ('x' in out) out.x = w - 1 - out.x
    if ('x0' in out) out.x0 = w - 1 - out.x0
    if ('x1' in out) out.x1 = w - 1 - out.x1
  }
  if (axes.h) {
    if ('y' in out) out.y = h - 1 - out.y
    if ('y0' in out) out.y0 = h - 1 - out.y0
    if ('y1' in out) out.y1 = h - 1 - out.y1
  }
  return out
}

// The silhouette of a brush stamp, as unit-cell edge segments relative to its
// anchor (0,0) — every edge of a filled cell that borders an unfilled one.
// Used to draw the hover cursor outline without tracing every internal grid
// line (which would be noisy at larger sizes).
function brushOutline(size: number, shape: BrushShape): [number, number, number, number][] {
  const offsets = shapeOffsets(size, shape)
  const filled = new Set(offsets.map(([x, y]) => `${x},${y}`))
  const has = (x: number, y: number) => filled.has(`${x},${y}`)
  const segs: [number, number, number, number][] = []
  for (const [x, y] of offsets) {
    if (!has(x - 1, y)) segs.push([x, y, x, y + 1])
    if (!has(x + 1, y)) segs.push([x + 1, y, x + 1, y + 1])
    if (!has(x, y - 1)) segs.push([x, y, x + 1, y])
    if (!has(x, y + 1)) segs.push([x, y + 1, x + 1, y + 1])
  }
  return segs
}

interface PixelCanvasProps {
  sprite: Sprite
  frameIndex: number
  target: CellTarget
  dispatch: (action: Action) => void
  scale: number
  fgColor: string
  bgColor: string
  tool: string
  onFgColor: (hex: string) => void
  onHover?: (pos: { x: number; y: number } | null) => void
  selection: Selection | null
  setSelection: (selection: Selection | null) => void
  floating: Floating | null
  setFloating: React.Dispatch<React.SetStateAction<Floating | null>>
  commitFloating: () => void
  cropPending: CropPending | null
  setCropPending: React.Dispatch<React.SetStateAction<CropPending | null>>
  continuousLine: Coord | null
  setContinuousLine: React.Dispatch<React.SetStateAction<Coord | null>>
  filled: boolean
  brushSize: number
  brushShape: BrushShape
  mirrorV: boolean
  mirrorH: boolean
  onTemporaryToolComplete?: () => void
  playing: boolean
  onionSkin: boolean
  eraseToBg: boolean
  showGrid: boolean
  gridSpacing: number
}

// Onion-skin ghosts are recolored to a flat tint (so direction reads at a
// glance) and faded to a fraction of full alpha — previous frame stronger
// than next, so which side is which is unambiguous even without the tint.
const ONION_PREV_ALPHA = 0.4
const ONION_NEXT_ALPHA = 0.25

// Interactive pixel canvas, driven by the document model + tool registry. It
// renders the active sprite frame (composited across visible layers) into a
// native-resolution <canvas> scaled up with image-rendering:pixelated, owns the
// pointer gesture loop, and delegates behavior to the active tool. Stroke tools
// return true from onStart to begin a drag; one-shot tools (fill, eyedropper)
// act on the click alone. A pixelated overlay canvas on top renders live
// shape previews and the floating move/paste buffer; the selection marquee is
// drawn separately, at CSS-pixel (not pixel-art) resolution, so its dashed
// outline stays a crisp thin line instead of scaling up into blocky pixels.
export default function PixelCanvas({
  sprite, frameIndex, target, dispatch, scale, fgColor, bgColor, tool, onFgColor, onHover,
  selection, setSelection, floating, setFloating, commitFloating,
  cropPending, setCropPending, continuousLine, setContinuousLine, filled, brushSize, brushShape,
  mirrorV, mirrorH, onTemporaryToolComplete, playing, onionSkin, eraseToBg, showGrid, gridSpacing,
}: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onionRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const marqueeRef = useRef<HTMLCanvasElement>(null)
  const selectionRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<ImageData | null>(null)
  const draggingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const dragStateRef = useRef<any>(null)
  const shiftRef = useRef(false)
  const erasingRef = useRef(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [magnifier, setMagnifier] = useState<{ clientX: number; clientY: number; pixels: (RGBA | null)[] } | null>(null)
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null)

  const { w, h } = sprite
  const activeTool = getTool(tool)

  // Re-composite and blit whenever the sprite content or frame changes.
  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!
    if (!imageRef.current || imageRef.current.width !== w || imageRef.current.height !== h) {
      imageRef.current = ctx.createImageData(w, h)
    }
    compositeFrame(sprite, frameIndex, imageRef.current)
    ctx.putImageData(imageRef.current, 0, 0)
  }, [sprite, frameIndex, w, h])

  // Onion-skin ghosts: the immediately adjacent frames, recolored to a flat
  // tint (previous = onion-prev, next = onion-next, see theme.css) and faded,
  // drawn into a canvas sitting behind the main one so they show through
  // wherever the active frame is transparent.
  useEffect(() => {
    const ctx = onionRef.current!.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    if (!onionSkin || playing) return
    const ghost = ctx.createImageData(w, h)
    const addGhost = (idx: number, tint: RGBA, alphaFactor: number) => {
      if (idx < 0 || idx >= sprite.frameCount || idx === frameIndex) return
      const img = ctx.createImageData(w, h)
      compositeFrame(sprite, idx, img)
      const [tr, tg, tb] = tint
      const d = img.data
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue
        d[i] = tr; d[i + 1] = tg; d[i + 2] = tb
        d[i + 3] = Math.round(d[i + 3] * alphaFactor)
      }
      pasteRegion(ghost.data, w, h, 0, 0, w, h, img.data)
    }
    addGhost(frameIndex - 1, hexToRgba(getColor('onion-prev')), ONION_PREV_ALPHA)
    addGhost(frameIndex + 1, hexToRgba(getColor('onion-next')), ONION_NEXT_ALPHA)
    ctx.putImageData(ghost, 0, 0)
  }, [sprite, frameIndex, onionSkin, playing, w, h])

  // Re-draw the preview overlay: floating buffer and any in-progress shape
  // preview from the active tool. Pixel-art resolution, scaled with the canvas.
  useEffect(() => {
    const ctx = overlayRef.current!.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    if (floating) {
      const img = ctx.createImageData(floating.w, floating.h)
      img.data.set(floating.data)
      ctx.putImageData(img, floating.x, floating.y)
    }
    if (preview?.kind === 'pixels') {
      const [r, g, b, a] = hexToRgba(preview.color)
      ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`
      for (const [x, y] of preview.points) ctx.fillRect(x, y, 1, 1)
    }
    if (preview?.kind === 'erase') {
      const checkerA = getColor('checker-a')
      const checkerB = getColor('checker-b')
      for (const [x, y] of preview.points) {
        ctx.fillStyle = (x + y) % 2 === 0 ? checkerA : checkerB
        ctx.fillRect(x, y, 1, 1)
      }
    }
    if (preview?.kind === 'gradient') {
      preview.points.forEach(([x, y], i) => {
        const [r, g, b, a] = preview.colors[i]
        ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`
        ctx.fillRect(x, y, 1, 1)
      })
    }
  }, [floating, preview, w, h])

  // Re-draw the optional pixel-alignment grid, mirror axis guides, and brush
  // cursor outline — all thin lines at CSS-pixel resolution (not the
  // pixel-art grid), so they stay 1px at any zoom level. The marquee also
  // doubles as the pending crop window's outline (live while it's moved).
  useEffect(() => {
    const ctx = marqueeRef.current!.getContext('2d')!
    ctx.clearRect(0, 0, w * scale, h * scale)

    if (showGrid) {
      ctx.strokeStyle = getColor('grid')
      ctx.lineWidth = 1
      ctx.setLineDash([])
      ctx.beginPath()
      for (let x = 0; x <= w; x += gridSpacing) { const px = x * scale + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, h * scale) }
      for (let y = 0; y <= h; y += gridSpacing) { const py = y * scale + 0.5; ctx.moveTo(0, py); ctx.lineTo(w * scale, py) }
      ctx.stroke()
    }

    if (mirrorV || mirrorH) {
      ctx.strokeStyle = getColor('on', '99')
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      if (mirrorV) {
        const x = Math.floor((w / 2) * scale) + 0.5
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h * scale)
        ctx.stroke()
      }
      if (mirrorH) {
        const y = Math.floor((h / 2) * scale) + 0.5
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w * scale, y)
        ctx.stroke()
      }
    }

    // Brush cursor outline — the stamp footprint at the hovered cell, so you
    // can see where you're about to paint before clicking. When mirroring is
    // active, also outline the mirrored anchor(s) it'll paint at — same flip
    // as mirroredDispatch (anchor only, brush offsets stay put), so the
    // preview matches what actually lands.
    if (hoverCell && !playing && tools[tool]?.hasBrushSize) {
      const anchors = [hoverCell]
      if (mirrorV) anchors.push({ x: w - 1 - hoverCell.x, y: hoverCell.y })
      if (mirrorH) anchors.push({ x: hoverCell.x, y: h - 1 - hoverCell.y })
      if (mirrorV && mirrorH) anchors.push({ x: w - 1 - hoverCell.x, y: h - 1 - hoverCell.y })
      const outline = brushOutline(brushSize, brushShape)
      ctx.lineWidth = 1
      ctx.setLineDash([])
      anchors.forEach((anchor, i) => {
        ctx.strokeStyle = getColor('accent-bright', i === 0 ? '' : '99')
        ctx.beginPath()
        for (const [x0, y0, x1, y1] of outline) {
          ctx.moveTo((anchor.x + x0) * scale, (anchor.y + y0) * scale)
          ctx.lineTo((anchor.x + x1) * scale, (anchor.y + y1) * scale)
        }
        ctx.stroke()
      })
    }

    if (preview?.kind === 'line' || preview?.kind === 'gradient') {
      ctx.strokeStyle = getColor('accent-bright')
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(preview.x0 * scale + scale / 2, preview.y0 * scale + scale / 2)
      ctx.lineTo(preview.x1 * scale + scale / 2, preview.y1 * scale + scale / 2)
      ctx.stroke()
      return
    }
  }, [mirrorV, mirrorH, hoverCell, playing, tool, brushSize, brushShape, preview, w, h, scale, showGrid, gridSpacing])

  // Selection marquee, on its own canvas with CSS mix-blend-mode: difference
  // so the dashed outline is always the true inverse of whatever's beneath
  // it (sprite pixels, onion ghosts...), instead of a fixed accent color
  // that can vanish against similarly-colored content (e.g. amber accent on
  // yellow pixels). Canvas's own globalCompositeOperation can't do this here
  // since it only blends within one canvas's own pixels, not against the
  // other stacked canvas layers below — mix-blend-mode is a CSS compositing
  // step instead. Animated dash offset gives the classic "marching ants" look.
  useEffect(() => {
    const ctx = selectionRef.current!.getContext('2d')!
    const region: Selection | Rect | null =
      preview?.kind === 'marquee' ? preview.rect : floating || selection || cropPending

    if (!region) {
      ctx.clearRect(0, 0, w * scale, h * scale)
      return
    }

    // Outline is computed once per selection change (cheap for the common
    // plain-rect case, and avoids re-tracing a masked/inverted selection's
    // boundary every animation frame) — only the dash offset animates.
    const outline = selectionOutline(region)

    let rafId: number
    const draw = () => {
      ctx.clearRect(0, 0, w * scale, h * scale)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.lineDashOffset = -(performance.now() / 30) % 7
      ctx.beginPath()
      for (const s of outline.top) { ctx.moveTo(s.x0 * scale + 0.5, s.y * scale + 0.5); ctx.lineTo(s.x1 * scale - 0.5, s.y * scale + 0.5) }
      for (const s of outline.bottom) { ctx.moveTo(s.x0 * scale + 0.5, s.y * scale - 0.5); ctx.lineTo(s.x1 * scale - 0.5, s.y * scale - 0.5) }
      for (const s of outline.left) { ctx.moveTo(s.x * scale + 0.5, s.y0 * scale + 0.5); ctx.lineTo(s.x * scale + 0.5, s.y1 * scale - 0.5) }
      for (const s of outline.right) { ctx.moveTo(s.x * scale - 0.5, s.y0 * scale + 0.5); ctx.lineTo(s.x * scale - 0.5, s.y1 * scale - 0.5) }
      ctx.stroke()
      rafId = requestAnimationFrame(draw)
    }
    draw()

    return () => cancelAnimationFrame(rafId)
  }, [floating, selection, cropPending, preview, w, h, scale])

  const cellFromClient = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = Math.floor(((clientX - rect.left) / rect.width) * w)
    const y = Math.floor(((clientY - rect.top) / rect.height) * h)
    return { x, y }
  }

  const cellFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => cellFromClient(e.clientX, e.clientY)

  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h

  // Read a composited pixel's color (for the eyedropper); null only if out of
  // bounds — a transparent pixel is itself a selectable color (paints as an
  // eraser would, via paintPixel's direct overwrite).
  const sampleColor = (x: number, y: number): string | null => {
    const img = imageRef.current
    if (!img || !inBounds(x, y)) return null
    const i = (y * w + x) * 4
    return rgbaToHex([img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]])
  }

  // Read the square of pixels around (cx, cy) for the eyedropper magnifier,
  // row-major, MAG_RADIUS cells in each direction; out-of-bounds cells are null.
  const sampleRegion = (cx: number, cy: number): (RGBA | null)[] => {
    const img = imageRef.current
    const pixels: (RGBA | null)[] = []
    for (let dy = -MAG_RADIUS; dy <= MAG_RADIUS; dy++) {
      for (let dx = -MAG_RADIUS; dx <= MAG_RADIUS; dx++) {
        const x = cx + dx
        const y = cy + dy
        if (!img || !inBounds(x, y)) { pixels.push(null); continue }
        const i = (y * w + x) * 4
        pixels.push([img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]])
      }
    }
    return pixels
  }

  // Show/hide the magnifier on tool change rather than only reactively from
  // pointer events: clears it immediately if the eyedropper is switched away
  // from (it would otherwise stay frozen on screen until the next pointer
  // move), and shows it right away if switched to while already hovering the
  // canvas (toolbar click / keyboard shortcut), instead of waiting for the
  // user to first move the mouse.
  useEffect(() => {
    if (tool !== 'eyedropper') { setMagnifier(null); return }
    const pos = getLastPointer()
    if (!pos) return
    const rect = canvasRef.current!.getBoundingClientRect()
    if (pos.clientX < rect.left || pos.clientX >= rect.right || pos.clientY < rect.top || pos.clientY >= rect.bottom) return
    const { x, y } = cellFromClient(pos.clientX, pos.clientY)
    if (inBounds(x, y)) setMagnifier({ clientX: pos.clientX, clientY: pos.clientY, pixels: sampleRegion(x, y) })
  }, [tool])

  // Tracks live Shift state (rect/ellipse square-circle constraint) on the
  // window rather than per-pointer-event, so toggling Shift mid-drag updates
  // the preview even without moving the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Shift') return
      shiftRef.current = e.type === 'keydown'
      if (draggingRef.current && lastRef.current) {
        activeTool?.onDrag?.(ctxFor(lastRef.current.x, lastRef.current.y), lastRef.current, dragStateRef.current)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })

  // Dispatch wrapper that also dispatches mirrored copies of coordinate-bearing
  // actions across whichever symmetry axes are on, so tools never need to know
  // about mirroring themselves.
  const mirroredDispatch = (action: Action) => {
    dispatch(action)
    if (!MIRRORABLE.has(action.type)) return
    if (mirrorV) dispatch(flipAction(action, w, h, { v: true }))
    if (mirrorH) dispatch(flipAction(action, w, h, { h: true }))
    if (mirrorV && mirrorH) dispatch(flipAction(action, w, h, { v: true, h: true }))
  }

  const getRawCell = () => sprite.layers.find((l) => l.id === target.layerId)!.cells[target.frameIndex]

  const ctxFor = (x: number, y: number): ToolContext => ({
    x, y, target, fgColor, bgColor, eraseToBg, dispatch: mirroredDispatch, setFgColor: onFgColor, sampleColor,
    w, h, scale, filled, brushSize, brushShape, setPreview, shiftKey: shiftRef.current, erasing: erasingRef.current,
    selection, setSelection, floating, setFloating, commitFloating, getRawCell,
    cropPending, setCropPending, continuousLine, setContinuousLine,
  })

  // The continuous-line anchor is cancelled (Escape, tool switch) from
  // outside the gesture loop, so there's no onEnd to clear its preview — do
  // it here instead.
  useEffect(() => {
    if (!continuousLine) setPreview(null)
  }, [continuousLine])

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeTool || playing) return
    const { x, y } = cellFromEvent(e)
    if (!inBounds(x, y)) return
    // Right-click paints with the erase color for the whole gesture, instead
    // of swapping tools — so rect/ellipse/line/fill keep their own shape
    // logic and just resolve to a different color (see ctx.erasing).
    erasingRef.current = e.button === 2
    const dragState = activeTool.onStart?.(ctxFor(x, y))
    if (tool === 'eyedropper' && onTemporaryToolComplete) {
      setMagnifier(null)
      onTemporaryToolComplete()
    }
    if (dragState) {
      draggingRef.current = true
      dragStateRef.current = dragState
      lastRef.current = { x, y }
      canvasRef.current!.setPointerCapture(e.pointerId)
    }
  }

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = cellFromEvent(e)
    onHover?.(inBounds(x, y) ? { x, y } : null)
    setHoverCell(inBounds(x, y) ? { x, y } : null)
    if (tool === 'eyedropper' && inBounds(x, y)) {
      setMagnifier({ clientX: e.clientX, clientY: e.clientY, pixels: sampleRegion(x, y) })
    } else if (magnifier) {
      setMagnifier(null)
    }
    if (!draggingRef.current) {
      if (inBounds(x, y)) activeTool?.onMove?.(ctxFor(x, y))
      return
    }
    activeTool!.onDrag?.(ctxFor(x, y), lastRef.current!, dragStateRef.current)
    lastRef.current = { x, y }
  }

  const handleUp = () => {
    if (!draggingRef.current) {
      erasingRef.current = false
      return
    }
    const last = lastRef.current!
    const dragState = dragStateRef.current
    draggingRef.current = false
    dragStateRef.current = null
    lastRef.current = null
    activeTool?.onEnd?.(ctxFor(last.x, last.y), dragState)
    erasingRef.current = false
  }

  return (
    <div style={{ position: 'relative', width: w * scale, height: h * scale }}>
      <canvas
        ref={onionRef}
        width={w}
        height={h}
        style={{
          position: 'absolute',
          inset: 0,
          width: w * scale,
          height: h * scale,
          imageRendering: 'pixelated',
          pointerEvents: 'none',
        }}
      />
      <canvas
        ref={canvasRef}
        data-eyedropper-owner
        width={w}
        height={h}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={() => { handleUp(); onHover?.(null); setMagnifier(null); setHoverCell(null) }}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: 'absolute',
          inset: 0,
          width: w * scale,
          height: h * scale,
          imageRendering: 'pixelated',
          cursor: playing
            ? 'default'
            : typeof activeTool?.cursor === 'function'
              ? activeTool.cursor(ctxFor(hoverCell?.x ?? 0, hoverCell?.y ?? 0))
              : activeTool?.cursor ?? 'default',
          touchAction: 'none',
          display: 'block',
        }}
      />
      <canvas
        ref={overlayRef}
        width={w}
        height={h}
        style={{
          position: 'absolute',
          inset: 0,
          width: w * scale,
          height: h * scale,
          imageRendering: 'pixelated',
          pointerEvents: 'none',
        }}
      />
      <canvas
        ref={marqueeRef}
        width={w * scale}
        height={h * scale}
        style={{
          position: 'absolute',
          inset: 0,
          width: w * scale,
          height: h * scale,
          pointerEvents: 'none',
        }}
      />
      <canvas
        ref={selectionRef}
        width={w * scale}
        height={h * scale}
        style={{
          position: 'absolute',
          inset: 0,
          width: w * scale,
          height: h * scale,
          pointerEvents: 'none',
          mixBlendMode: 'difference',
        }}
      />
      {magnifier && <EyedropperMagnifier {...magnifier} />}
    </div>
  )
}
