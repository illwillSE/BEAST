import { useEffect, useRef, useState } from 'react'
import { X, ZoomIn, ZoomOut } from 'lucide-react'
import { compositeFrame } from '../document/model.js'
import { loadPreviewPrefs, savePreviewPrefs } from '../persist/previewPrefs.js'
import type { Sprite } from '../document/model.js'
import type { PreviewPrefs } from '../persist/previewPrefs.js'

interface Size {
  w: number
  h: number
}

interface Pos {
  x: number
  y: number
}

const DEFAULT_SIZE: Size = { w: 220, h: 220 }
const MIN_SIZE: Size = { w: 160, h: 140 }
const SCALE_MIN = 1
const SCALE_MAX = 16

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

function defaultPos(): Pos {
  return { x: Math.max(20, window.innerWidth - 320), y: 60 }
}

function clampPos(pos: Pos, size: Size): Pos {
  return {
    x: clamp(pos.x, 0, Math.max(0, window.innerWidth - size.w)),
    y: clamp(pos.y, 0, Math.max(0, window.innerHeight - size.h)),
  }
}

interface PreviewWindowProps {
  sprite: Sprite
  frameIndex: number
  onNavigate: (x: number, y: number) => void
  open: boolean
  onClose: () => void
}

// Free-floating "real size" preview of the active sprite/frame — independent
// of the main canvas's zoom — that doubles as a navigator: clicking it
// scrolls the main canvas (via onNavigate) to center on that pixel.
export default function PreviewWindow({ sprite, frameIndex, onNavigate, open, onClose }: PreviewWindowProps) {
  const [size, setSize] = useState<Size>(() => {
    const p = loadPreviewPrefs()
    return { w: p?.w ?? DEFAULT_SIZE.w, h: p?.h ?? DEFAULT_SIZE.h }
  })
  const [pos, setPos] = useState<Pos>(() => {
    const p = loadPreviewPrefs()
    const s = { w: p?.w ?? DEFAULT_SIZE.w, h: p?.h ?? DEFAULT_SIZE.h }
    const fallback = defaultPos()
    return clampPos({ x: p?.x ?? fallback.x, y: p?.y ?? fallback.y }, s)
  })
  const [previewScale, setPreviewScale] = useState(() => loadPreviewPrefs()?.scale ?? 1)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<ImageData | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; startPos: Pos } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; startSize: Size } | null>(null)

  const { w, h } = sprite

  useEffect(() => {
    if (!open || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')!
    if (!imageRef.current || imageRef.current.width !== w || imageRef.current.height !== h) {
      imageRef.current = ctx.createImageData(w, h)
    }
    compositeFrame(sprite, frameIndex, imageRef.current)
    ctx.putImageData(imageRef.current, 0, 0)
  }, [sprite, frameIndex, w, h, open])

  if (!open) return null

  const persist = (overrides: Partial<PreviewPrefs> = {}) =>
    savePreviewPrefs({ open, x: pos.x, y: pos.y, w: size.w, h: size.h, scale: previewScale, ...overrides })

  const handleTitleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPos: pos }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handleTitleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const { startX, startY, startPos } = dragRef.current
    setPos(clampPos({ x: startPos.x + (e.clientX - startX), y: startPos.y + (e.clientY - startY) }, size))
  }
  const handleTitleUp = () => {
    if (!dragRef.current) return
    dragRef.current = null
    persist()
  }

  const handleResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startSize: size }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return
    const { startX, startY, startSize } = resizeRef.current
    setSize({
      w: clamp(startSize.w + (e.clientX - startX), MIN_SIZE.w, window.innerWidth - 40),
      h: clamp(startSize.h + (e.clientY - startY), MIN_SIZE.h, window.innerHeight - 40),
    })
  }
  const handleResizeUp = () => {
    if (!resizeRef.current) return
    resizeRef.current = null
    persist()
  }

  const adjustScale = (delta: number) => {
    const next = clamp(previewScale + delta, SCALE_MIN, SCALE_MAX)
    setPreviewScale(next)
    persist({ scale: next })
  }

  const handleClose = () => {
    persist({ open: false })
    onClose()
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = clamp(Math.floor(((e.clientX - rect.left) / rect.width) * w), 0, w - 1)
    const y = clamp(Math.floor(((e.clientY - rect.top) / rect.height) * h), 0, h - 1)
    onNavigate(x, y)
  }

  return (
    <div
      className="fixed z-50 flex flex-col bg-panel border border-edge rounded shadow-2xl overflow-hidden"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      <div
        className="flex items-center gap-1.5 h-7 px-2 bg-surface border-b border-divider shrink-0 cursor-move select-none"
        onPointerDown={handleTitleDown}
        onPointerMove={handleTitleMove}
        onPointerUp={handleTitleUp}
      >
        <span className="flex-1 text-[11px] text-muted">Real Preview</span>
        <button className="text-faint hover:text-ink" onClick={handleClose}>
          <X size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-2 flex items-start">
        <div className="beast-checker inline-block rounded border border-edge shrink-0">
          <canvas
            ref={canvasRef}
            width={w}
            height={h}
            onClick={handleCanvasClick}
            style={{ width: w * previewScale, height: h * previewScale, imageRendering: 'pixelated', cursor: 'crosshair', display: 'block' }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 h-7 px-2 bg-panel border-t border-divider shrink-0 text-[11px]">
        <button className="text-muted hover:text-ink" onClick={() => adjustScale(-1)}>
          <ZoomOut size={12} />
        </button>
        <span className="text-text tabular-nums">{previewScale * 100}%</span>
        <button className="text-muted hover:text-ink" onClick={() => adjustScale(1)}>
          <ZoomIn size={12} />
        </button>
        <div className="flex-1" />
        <div
          className="w-3 h-3 text-muted cursor-se-resize opacity-60 hover:opacity-100"
          style={{ background: 'linear-gradient(135deg, transparent 50%, currentColor 50%)' }}
          onPointerDown={handleResizeDown}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeUp}
        />
      </div>
    </div>
  )
}
