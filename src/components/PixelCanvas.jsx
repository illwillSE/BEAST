import { useEffect, useRef, useState } from 'react'
import { compositeFrame, hexToRgba, rgbaToHex } from '../document/model.js'
import { getTool } from '../tools/registry.js'
import { getColor } from '../theme/colors.js'

// Action types whose coordinate fields get mirrored across the active
// symmetry axes — see mirroredDispatch below.
const MIRRORABLE = new Set(['PAINT_LINE', 'FILL', 'PAINT_RECT', 'PAINT_ELLIPSE', 'GRADIENT_FILL'])

function flipAction(action, w, h, axes) {
  const out = { ...action }
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
  sprite, frameIndex, target, dispatch, scale, color, tool, onColor, onHover,
  selection, setSelection, floating, setFloating, commitFloating,
  cropPending, setCropPending, filled,
  mirrorV, mirrorH,
}) {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const marqueeRef = useRef(null)
  const imageRef = useRef(null)
  const draggingRef = useRef(false)
  const lastRef = useRef(null)
  const dragStateRef = useRef(null)
  const [preview, setPreview] = useState(null)

  const { w, h } = sprite
  const activeTool = getTool(tool)

  // Re-composite and blit whenever the sprite content or frame changes.
  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d')
    if (!imageRef.current || imageRef.current.width !== w || imageRef.current.height !== h) {
      imageRef.current = ctx.createImageData(w, h)
    }
    compositeFrame(sprite, frameIndex, imageRef.current)
    ctx.putImageData(imageRef.current, 0, 0)
  }, [sprite, frameIndex, w, h])

  // Re-draw the preview overlay: floating buffer and any in-progress shape
  // preview from the active tool. Pixel-art resolution, scaled with the canvas.
  useEffect(() => {
    const ctx = overlayRef.current.getContext('2d')
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
  }, [floating, preview, w, h])

  // Re-draw the selection marquee and mirror axis guides — both thin dashed
  // lines at CSS-pixel resolution (not the pixel-art grid), so they stay 1px
  // at any zoom level. The marquee also doubles as the pending crop window's
  // outline (live while it's moved).
  useEffect(() => {
    const ctx = marqueeRef.current.getContext('2d')
    ctx.clearRect(0, 0, w * scale, h * scale)

    if (mirrorV || mirrorH) {
      ctx.strokeStyle = getColor('on', '99')
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      if (mirrorV) {
        const x = Math.round((w / 2) * scale) + 0.5
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h * scale)
        ctx.stroke()
      }
      if (mirrorH) {
        const y = Math.round((h / 2) * scale) + 0.5
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w * scale, y)
        ctx.stroke()
      }
    }

    const rect = preview?.kind === 'marquee' ? preview.rect : !floating && (selection || cropPending) ? (selection || cropPending) : null
    if (!rect) return
    ctx.strokeStyle = getColor('accent-bright')
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.strokeRect(rect.x * scale + 0.5, rect.y * scale + 0.5, rect.w * scale - 1, rect.h * scale - 1)
  }, [floating, selection, cropPending, preview, w, h, scale, mirrorV, mirrorH])

  const cellFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * w)
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * h)
    return { x, y }
  }

  const inBounds = (x, y) => x >= 0 && y >= 0 && x < w && y < h

  // Read a composited pixel's color (for the eyedropper); null if transparent.
  const sampleColor = (x, y) => {
    const img = imageRef.current
    if (!img || !inBounds(x, y)) return null
    const i = (y * w + x) * 4
    if (img.data[i + 3] === 0) return null
    return rgbaToHex([img.data[i], img.data[i + 1], img.data[i + 2]])
  }

  // Dispatch wrapper that also dispatches mirrored copies of coordinate-bearing
  // actions across whichever symmetry axes are on, so tools never need to know
  // about mirroring themselves.
  const mirroredDispatch = (action) => {
    dispatch(action)
    if (!MIRRORABLE.has(action.type)) return
    if (mirrorV) dispatch(flipAction(action, w, h, { v: true }))
    if (mirrorH) dispatch(flipAction(action, w, h, { h: true }))
    if (mirrorV && mirrorH) dispatch(flipAction(action, w, h, { v: true, h: true }))
  }

  const getRawCell = () => sprite.layers.find((l) => l.id === target.layerId).cells[target.frameIndex]

  const ctxFor = (x, y) => ({
    x, y, target, color, dispatch: mirroredDispatch, setColor: onColor, sampleColor,
    w, h, filled, setPreview,
    selection, setSelection, floating, setFloating, commitFloating, getRawCell,
    cropPending, setCropPending,
  })

  const handleDown = (e) => {
    if (!activeTool) return
    const { x, y } = cellFromEvent(e)
    if (!inBounds(x, y)) return
    const dragState = activeTool.onStart?.(ctxFor(x, y))
    if (dragState) {
      draggingRef.current = true
      dragStateRef.current = dragState
      lastRef.current = { x, y }
      canvasRef.current.setPointerCapture(e.pointerId)
    }
  }

  const handleMove = (e) => {
    const { x, y } = cellFromEvent(e)
    onHover?.(inBounds(x, y) ? { x, y } : null)
    if (!draggingRef.current) return
    activeTool.onDrag?.(ctxFor(x, y), lastRef.current, dragStateRef.current)
    lastRef.current = { x, y }
  }

  const handleUp = () => {
    if (!draggingRef.current) return
    const last = lastRef.current
    const dragState = dragStateRef.current
    draggingRef.current = false
    dragStateRef.current = null
    lastRef.current = null
    activeTool?.onEnd?.(ctxFor(last.x, last.y), dragState)
  }

  return (
    <div style={{ position: 'relative', width: w * scale, height: h * scale }}>
      <canvas
        ref={canvasRef}
        width={w}
        height={h}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={() => { handleUp(); onHover?.(null) }}
        style={{
          position: 'absolute',
          inset: 0,
          width: w * scale,
          height: h * scale,
          imageRendering: 'pixelated',
          cursor: activeTool?.cursor ?? 'default',
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
    </div>
  )
}
