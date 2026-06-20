import { useEffect, useRef } from 'react'

// Interactive pixel canvas. Holds a flat color buffer (one entry per pixel,
// `null` = transparent) and paints it onto a native-resolution <canvas> scaled
// up with image-rendering:pixelated. Only the pencil tool draws for now; drags
// are interpolated (Bresenham) so fast strokes don't leave gaps.
//
// This is a single standalone buffer — not yet the per-sprite / per-layer /
// per-frame document model. Switching sprites/frames in the mockup does not
// swap what's drawn here.
export default function PixelCanvas({ width, height, scale, color, tool, onHover }) {
  const canvasRef = useRef(null)
  const bufRef = useRef(null)
  const drawingRef = useRef(false)
  const lastRef = useRef(null)

  // (re)allocate the buffer when the document size changes
  if (!bufRef.current || bufRef.current.length !== width * height) {
    bufRef.current = new Array(width * height).fill(null)
  }

  // repaint the whole canvas from the buffer (on mount / size change)
  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    const buf = bufRef.current
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] == null) continue
      ctx.fillStyle = buf[i]
      ctx.fillRect(i % width, Math.floor(i / width), 1, 1)
    }
  }, [width, height])

  const paintCell = (x, y, c) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const buf = bufRef.current
    const i = y * width + x
    if (buf[i] === c) return
    buf[i] = c
    const ctx = canvasRef.current.getContext('2d')
    if (c == null) ctx.clearRect(x, y, 1, 1)
    else {
      ctx.fillStyle = c
      ctx.fillRect(x, y, 1, 1)
    }
  }

  // paint every cell along the line from (x0,y0) to (x1,y1)
  const paintLine = (x0, y0, x1, y1, c) => {
    const dx = Math.abs(x1 - x0)
    const dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx - dy
    for (;;) {
      paintCell(x0, y0, c)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 > -dy) { err -= dy; x0 += sx }
      if (e2 < dx) { err += dx; y0 += sy }
    }
  }

  const cellFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * width)
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * height)
    return { x, y }
  }

  const handleDown = (e) => {
    if (tool !== 'pencil') return
    const { x, y } = cellFromEvent(e)
    drawingRef.current = true
    lastRef.current = { x, y }
    paintCell(x, y, color)
    canvasRef.current.setPointerCapture(e.pointerId)
  }

  const handleMove = (e) => {
    const { x, y } = cellFromEvent(e)
    onHover?.(x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null)
    if (!drawingRef.current) return
    const last = lastRef.current
    paintLine(last.x, last.y, x, y, color)
    lastRef.current = { x, y }
  }

  const handleUp = () => {
    drawingRef.current = false
    lastRef.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerLeave={() => { handleUp(); onHover?.(null) }}
      style={{
        width: width * scale,
        height: height * scale,
        imageRendering: 'pixelated',
        cursor: tool === 'pencil' ? 'crosshair' : 'default',
        touchAction: 'none',
        display: 'block',
      }}
    />
  )
}
