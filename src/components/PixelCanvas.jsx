import { useEffect, useRef } from 'react'
import { compositeFrame, hexToRgba } from '../document/model.js'

// Interactive pixel canvas, driven by the document model. It renders the active
// sprite frame (composited across visible layers) into a native-resolution
// <canvas> scaled up with image-rendering:pixelated, and translates pointer
// input into paint actions on the history reducer. The pencil brackets each
// drag with STROKE_BEGIN / STROKE_END so a stroke is a single undo step; drags
// dispatch PAINT_LINE (Bresenham in the reducer) so fast strokes leave no gaps.
// Only the pencil draws for now.
export default function PixelCanvas({ sprite, frameIndex, target, dispatch, scale, color, tool, onHover }) {
  const canvasRef = useRef(null)
  const imageRef = useRef(null)
  const drawingRef = useRef(false)
  const lastRef = useRef(null)

  const { w, h } = sprite

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

  const paintLine = (x0, y0, x1, y1) => {
    dispatch({ type: 'PAINT_LINE', ...target, x0, y0, x1, y1, rgba: hexToRgba(color) })
  }

  const handleDown = (e) => {
    if (tool !== 'pencil') return
    const { x, y } = cellFromEvent(e)
    drawingRef.current = true
    lastRef.current = { x, y }
    dispatch({ type: 'STROKE_BEGIN' })
    paintLine(x, y, x, y)
    canvasRef.current.setPointerCapture(e.pointerId)
  }

  const handleMove = (e) => {
    const { x, y } = cellFromEvent(e)
    onHover?.(x >= 0 && y >= 0 && x < w && y < h ? { x, y } : null)
    if (!drawingRef.current) return
    const last = lastRef.current
    paintLine(last.x, last.y, x, y)
    lastRef.current = { x, y }
  }

  const handleUp = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    lastRef.current = null
    dispatch({ type: 'STROKE_END' })
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
        cursor: tool === 'pencil' ? 'crosshair' : 'default',
        touchAction: 'none',
        display: 'block',
      }}
    />
  )
}
