import { useEffect, useRef, useState } from 'react'
import { Eraser, MousePointer, Stamp, X, ZoomIn, ZoomOut } from 'lucide-react'
import { compositeFrame, TILEMAP_MAX, TILEMAP_MIN } from '../document/model.js'
import { loadTilemapPrefs, saveTilemapPrefs } from '../persist/tilemapPrefs.js'
import type { Doc } from '../document/model.js'
import type { Action } from '../document/reducer.js'
import type { TilemapPrefs } from '../persist/tilemapPrefs.js'

interface Size {
  w: number
  h: number
}

interface Pos {
  x: number
  y: number
}

const DEFAULT_SIZE: Size = { w: 260, h: 260 }
const MIN_SIZE: Size = { w: 200, h: 160 }
const SCALE_MIN = 1
const SCALE_MAX = 16

type Mode = 'stamp' | 'pick' | 'erase'

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

function defaultPos(): Pos {
  return { x: Math.max(20, window.innerWidth - 600), y: 60 }
}

function clampPos(pos: Pos, size: Size): Pos {
  return {
    x: clamp(pos.x, 0, Math.max(0, window.innerWidth - size.w)),
    y: clamp(pos.y, 0, Math.max(0, window.innerHeight - size.h)),
  }
}

interface TilemapWindowProps {
  doc: Doc
  activeSpriteId: string
  onSelectSprite: (id: string) => void
  dispatch: (action: Action) => void
  open: boolean
  onClose: () => void
}

// Free-floating tilemap sandbox: a small grid where any sprite can be placed
// in any cell, to test how tiles combine (floor next to wall, corners…).
// Stamp paints the active sprite into cells (a drag is one undo step), pick
// makes a clicked cell's sprite the active one, erase clears cells. The
// arrangement lives in the document (doc.tilemap) so it saves/undoes; only
// the window chrome is a local pref. Cells are uniform at the largest
// sprite's size (like the tileset export); frame 0 is composited.
export default function TilemapWindow({ doc, activeSpriteId, onSelectSprite, dispatch, open, onClose }: TilemapWindowProps) {
  const [size, setSize] = useState<Size>(() => {
    const p = loadTilemapPrefs()
    return { w: p?.w ?? DEFAULT_SIZE.w, h: p?.h ?? DEFAULT_SIZE.h }
  })
  const [pos, setPos] = useState<Pos>(() => {
    const p = loadTilemapPrefs()
    const s = { w: p?.w ?? DEFAULT_SIZE.w, h: p?.h ?? DEFAULT_SIZE.h }
    const fallback = defaultPos()
    return clampPos({ x: p?.x ?? fallback.x, y: p?.y ?? fallback.y }, s)
  })
  const [scale, setScale] = useState(() => loadTilemapPrefs()?.scale ?? 2)
  const [mode, setMode] = useState<Mode>('stamp')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; startPos: Pos } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; startSize: Size } | null>(null)
  // Open stamp/erase drag: last painted cell index, to skip repeat dispatches.
  const paintRef = useRef<{ last: number } | null>(null)

  const { tilemap } = doc
  const { cols, rows } = tilemap
  const cellW = Math.max(...doc.sprites.map((sp) => sp.w))
  const cellH = Math.max(...doc.sprites.map((sp) => sp.h))

  // Grid-size inputs commit on blur/Enter (typing "12" mustn't resize to 1).
  const [colsInput, setColsInput] = useState(cols)
  const [rowsInput, setRowsInput] = useState(rows)
  useEffect(() => {
    setColsInput(cols)
    setRowsInput(rows)
  }, [cols, rows])

  useEffect(() => {
    if (!open || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')!
    ctx.clearRect(0, 0, cols * cellW, rows * cellH)
    // One scratch canvas per placed sprite, composited once and stamped into
    // every cell that holds it.
    const scratches = new Map<string, HTMLCanvasElement>()
    tilemap.cells.forEach((id, i) => {
      if (!id) return
      let scratch = scratches.get(id)
      if (!scratch) {
        const sp = doc.sprites.find((s) => s.id === id)
        if (!sp) return // defensive: dangling id renders as empty
        scratch = document.createElement('canvas')
        scratch.width = sp.w
        scratch.height = sp.h
        const sctx = scratch.getContext('2d')!
        const imageData = sctx.createImageData(sp.w, sp.h)
        compositeFrame(sp, 0, imageData)
        sctx.putImageData(imageData, 0, 0)
        scratches.set(id, scratch)
      }
      ctx.drawImage(scratch, (i % cols) * cellW, Math.floor(i / cols) * cellH)
    })
  }, [doc.sprites, tilemap, cols, rows, cellW, cellH, open])

  if (!open) return null

  const persist = (overrides: Partial<TilemapPrefs> = {}) =>
    saveTilemapPrefs({ open, x: pos.x, y: pos.y, w: size.w, h: size.h, scale, ...overrides })

  const handleTitleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input')) return
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
    const next = clamp(scale + delta, SCALE_MIN, SCALE_MAX)
    setScale(next)
    persist({ scale: next })
  }

  const handleClose = () => {
    persist({ open: false })
    onClose()
  }

  const clampDim = (n: number) => clamp(Math.round(n) || TILEMAP_MIN, TILEMAP_MIN, TILEMAP_MAX)
  const commitGridSize = () => {
    const c = clampDim(colsInput)
    const r = clampDim(rowsInput)
    setColsInput(c)
    setRowsInput(r)
    if (c !== cols || r !== rows) dispatch({ type: 'RESIZE_TILEMAP', cols: c, rows: r })
  }

  const cellIndexAt = (e: React.PointerEvent<HTMLCanvasElement>): number => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = clamp(Math.floor(((e.clientX - rect.left) / rect.width) * cols), 0, cols - 1)
    const y = clamp(Math.floor(((e.clientY - rect.top) / rect.height) * rows), 0, rows - 1)
    return y * cols + x
  }

  const handleCanvasDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const index = cellIndexAt(e)
    if (mode === 'pick') {
      const id = tilemap.cells[index]
      if (id) onSelectSprite(id)
      return
    }
    // An uncommitted gesture (click on a cell that already holds the value)
    // leaves no history — the snapshot is lazy, like an empty pencil click.
    paintRef.current = { last: index }
    e.currentTarget.setPointerCapture(e.pointerId)
    dispatch({ type: 'STROKE_BEGIN' })
    dispatch({ type: 'SET_TILEMAP_CELL', index, spriteId: mode === 'stamp' ? activeSpriteId : null })
  }
  const handleCanvasMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!paintRef.current) return
    const index = cellIndexAt(e)
    if (index === paintRef.current.last) return
    paintRef.current.last = index
    dispatch({ type: 'SET_TILEMAP_CELL', index, spriteId: mode === 'stamp' ? activeSpriteId : null })
  }
  const handleCanvasUp = () => {
    if (!paintRef.current) return
    paintRef.current = null
    dispatch({ type: 'STROKE_END' })
  }

  const modeBtn = (m: Mode, title: string, icon: React.ReactNode) => (
    <button
      title={title}
      className={mode === m ? 'text-accent-bright' : 'text-muted hover:text-ink'}
      onClick={() => setMode(m)}
    >
      {icon}
    </button>
  )

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
        <span className="flex-1 text-[11px] text-muted">Tilemap</span>
        <input
          type="number"
          min={TILEMAP_MIN}
          max={TILEMAP_MAX}
          value={colsInput}
          onChange={(e) => setColsInput(e.target.valueAsNumber)}
          onBlur={commitGridSize}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="w-9 bg-well text-[11px] text-ink-soft rounded px-1 border border-edge"
        />
        <span className="text-[11px] text-faint">×</span>
        <input
          type="number"
          min={TILEMAP_MIN}
          max={TILEMAP_MAX}
          value={rowsInput}
          onChange={(e) => setRowsInput(e.target.valueAsNumber)}
          onBlur={commitGridSize}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="w-9 bg-well text-[11px] text-ink-soft rounded px-1 border border-edge"
        />
        <button className="text-faint hover:text-ink" onClick={handleClose}>
          <X size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-2 flex items-start">
        <div className="beast-checker inline-block rounded border border-edge shrink-0">
          <canvas
            ref={canvasRef}
            width={cols * cellW}
            height={rows * cellH}
            onPointerDown={handleCanvasDown}
            onPointerMove={handleCanvasMove}
            onPointerUp={handleCanvasUp}
            style={{
              width: cols * cellW * scale,
              height: rows * cellH * scale,
              imageRendering: 'pixelated',
              cursor: mode === 'pick' ? 'pointer' : 'crosshair',
              display: 'block',
              touchAction: 'none',
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 h-7 px-2 bg-panel border-t border-divider shrink-0 text-[11px]">
        {modeBtn('stamp', 'Stamp active sprite', <Stamp size={12} />)}
        {modeBtn('pick', 'Pick sprite (click a tile to edit it)', <MousePointer size={12} />)}
        {modeBtn('erase', 'Erase cells', <Eraser size={12} />)}
        <div className="w-px h-3.5 bg-divider" />
        <button className="text-muted hover:text-ink" onClick={() => adjustScale(-1)}>
          <ZoomOut size={12} />
        </button>
        <span className="text-text tabular-nums">{scale * 100}%</span>
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
