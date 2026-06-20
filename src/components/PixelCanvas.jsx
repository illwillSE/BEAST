import { useEffect, useRef } from 'react'
import { compositeFrame, rgbaToHex } from '../document/model.js'
import { getTool } from '../tools/registry.js'

// Interactive pixel canvas, driven by the document model + tool registry. It
// renders the active sprite frame (composited across visible layers) into a
// native-resolution <canvas> scaled up with image-rendering:pixelated, owns the
// pointer gesture loop, and delegates behavior to the active tool. Stroke tools
// return true from onStart to begin a drag; one-shot tools (fill, eyedropper)
// act on the click alone.
export default function PixelCanvas({ sprite, frameIndex, target, dispatch, scale, color, tool, onColor, onHover }) {
  const canvasRef = useRef(null)
  const imageRef = useRef(null)
  const draggingRef = useRef(false)
  const lastRef = useRef(null)

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

  const ctxFor = (x, y) => ({ x, y, target, color, dispatch, setColor: onColor, sampleColor })

  const handleDown = (e) => {
    if (!activeTool) return
    const { x, y } = cellFromEvent(e)
    if (!inBounds(x, y)) return
    const dragging = activeTool.onStart?.(ctxFor(x, y))
    if (dragging) {
      draggingRef.current = true
      lastRef.current = { x, y }
      canvasRef.current.setPointerCapture(e.pointerId)
    }
  }

  const handleMove = (e) => {
    const { x, y } = cellFromEvent(e)
    onHover?.(inBounds(x, y) ? { x, y } : null)
    if (!draggingRef.current) return
    activeTool.onDrag?.(ctxFor(x, y), lastRef.current)
    lastRef.current = { x, y }
  }

  const handleUp = () => {
    if (!draggingRef.current) return
    const last = lastRef.current
    draggingRef.current = false
    lastRef.current = null
    activeTool?.onEnd?.(ctxFor(last.x, last.y))
  }

  return (
    <canvas
      ref={canvasRef}
      width={w}
      height={h}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerLeave={() => { handleUp(); onHover?.(null) }}
      style={{
        width: w * scale,
        height: h * scale,
        imageRendering: 'pixelated',
        cursor: activeTool?.cursor ?? 'default',
        touchAction: 'none',
        display: 'block',
      }}
    />
  )
}
