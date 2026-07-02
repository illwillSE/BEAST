import { useEffect, useMemo, useRef, useState } from 'react'
import { focusAdjacentButton } from '../hooks/dialogFocusNav.js'
import useEscapeKey from '../hooks/useEscapeKey.js'
import useFocusTrap from '../hooks/useFocusTrap.js'
import { getColor } from '../theme/colors.js'
import type { Cell } from '../document/model.js'

const PRESETS = [8, 16, 32, 64]
const MIN_TILE = 1
const MAX_TILE = 256
// Cap on sprites created per import — keeps the undo snapshot and the sprite
// sidebar sane.
const MAX_TILES = 256
// Preview fit box (CSS px).
const PREVIEW_W = 288
const PREVIEW_H = 216

export interface SliceSource {
  name: string
  imageData: ImageData
}

interface SliceTilesetDialogProps {
  source: SliceSource | null // null = closed
  onImport: (sprites: { name: string; w: number; h: number; cell: Cell }[]) => void
  onClose: () => void
}

// True if every pixel of the (tx, ty) tile is fully transparent.
function tileEmpty(img: ImageData, tx: number, ty: number, tw: number, th: number): boolean {
  const { width, data } = img
  for (let y = ty * th; y < (ty + 1) * th; y++) {
    for (let x = tx * tw; x < (tx + 1) * tw; x++) {
      if (data[(y * width + x) * 4 + 3] !== 0) return false
    }
  }
  return true
}

// Modal shown after picking a tileset PNG (Header → Import → Tileset): choose
// a tile size, see the slicing grid on the source image, and import one sprite
// per tile. Fully-transparent tiles are always skipped (reported in the count
// line); remainder pixels right/bottom of the last full tile are ignored.
export default function SliceTilesetDialog({ source, onImport, onClose }: SliceTilesetDialogProps) {
  const [tw, setTw] = useState(16)
  const [th, setTh] = useState(16)
  const firstInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const open = !!source

  useEffect(() => {
    if (open) firstInputRef.current?.focus()
  }, [open])

  useEscapeKey(open, onClose)
  useFocusTrap(open, formRef)

  const clamp = (n: number) => Math.min(MAX_TILE, Math.max(MIN_TILE, Math.round(n) || MIN_TILE))
  const ctw = clamp(tw)
  const cth = clamp(th)

  const img = source?.imageData
  const cols = img ? Math.floor(img.width / ctw) : 0
  const rows = img ? Math.floor(img.height / cth) : 0

  // Which grid tiles are fully transparent (row-major). Rescans on tile-size
  // change; a 2048² alpha scan is fine synchronously.
  const empties = useMemo(() => {
    if (!img) return []
    const out: boolean[] = []
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) out.push(tileEmpty(img, tx, ty, ctw, cth))
    }
    return out
  }, [img, cols, rows, ctw, cth])

  const total = cols * rows
  const emptyCount = empties.filter(Boolean).length
  const kept = total - emptyCount

  // Source image scaled to fit the preview box, grid lines at tile boundaries,
  // empty tiles tinted, ignored remainder dimmed.
  useEffect(() => {
    if (!img || !canvasRef.current) return
    let scale = Math.min(PREVIEW_W / img.width, PREVIEW_H / img.height)
    if (scale > 1) scale = Math.floor(scale)
    const cw = Math.max(1, Math.round(img.width * scale))
    const ch = Math.max(1, Math.round(img.height * scale))
    const canvas = canvasRef.current
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')!

    const src = document.createElement('canvas')
    src.width = img.width
    src.height = img.height
    src.getContext('2d')!.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(src, 0, 0, cw, ch)

    const sx = cw / img.width
    const sy = ch / img.height
    ctx.fillStyle = getColor('danger', '30')
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        if (empties[ty * cols + tx]) ctx.fillRect(tx * ctw * sx, ty * cth * sy, ctw * sx, cth * sy)
      }
    }
    ctx.fillStyle = getColor('well', 'aa')
    if (cols * ctw < img.width) ctx.fillRect(cols * ctw * sx, 0, cw - cols * ctw * sx, ch)
    if (rows * cth < img.height) ctx.fillRect(0, rows * cth * sy, cols * ctw * sx, ch - rows * cth * sy)

    ctx.strokeStyle = getColor('accent-deep', 'bb')
    ctx.lineWidth = 1
    for (let tx = 0; tx <= cols; tx++) {
      ctx.beginPath()
      ctx.moveTo(Math.round(tx * ctw * sx) + 0.5, 0)
      ctx.lineTo(Math.round(tx * ctw * sx) + 0.5, rows * cth * sy)
      ctx.stroke()
    }
    for (let ty = 0; ty <= rows; ty++) {
      ctx.beginPath()
      ctx.moveTo(0, Math.round(ty * cth * sy) + 0.5)
      ctx.lineTo(cols * ctw * sx, Math.round(ty * cth * sy) + 0.5)
      ctx.stroke()
    }
  }, [img, cols, rows, ctw, cth, empties])

  if (!source || !img) return null

  const remW = img.width - cols * ctw
  const remH = img.height - rows * cth

  const disabledReason =
    total === 0
      ? 'Tile size is larger than the image.'
      : kept === 0
        ? 'All tiles are empty.'
        : kept > MAX_TILES
          ? `Too many tiles (max ${MAX_TILES}).`
          : null

  // Copy each kept tile's rows into a fresh cell; names are sequential over
  // kept tiles only.
  const doImport = () => {
    const base = source.name
    const sprites: { name: string; w: number; h: number; cell: Cell }[] = []
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        if (empties[ty * cols + tx]) continue
        const cell: Cell = new Uint8ClampedArray(ctw * cth * 4)
        for (let y = 0; y < cth; y++) {
          const srcStart = ((ty * cth + y) * img.width + tx * ctw) * 4
          cell.set(img.data.subarray(srcStart, srcStart + ctw * 4), y * ctw * 4)
        }
        sprites.push({ name: `${base}_${sprites.length}`, w: ctw, h: cth, cell })
      }
    }
    onImport(sprites)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 grid place-items-center z-50"
      onMouseDown={onClose}
    >
      <form
        ref={formRef}
        role="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (!disabledReason) doImport() }}
        className="bg-panel border border-divider rounded-lg p-4 w-80 shadow-xl"
      >
        <h2 className="text-sm font-semibold text-ink mb-0.5">Slice Tileset</h2>
        <p className="text-[11px] text-faint mb-3">{source.name} · {img.width}×{img.height}</p>

        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { setTw(p); setTh(p) }}
              className={
                'py-1.5 rounded text-xs border ' +
                (ctw === p && cth === p
                  ? 'bg-accent-deep/15 border-accent-deep/50 text-accent-soft'
                  : 'border-edge text-muted hover:bg-surface-hover hover:text-ink-soft')
              }
            >
              {p}×{p}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <label className="flex items-center gap-1.5 text-xs text-faint">
            Tile W
            <input
              ref={firstInputRef}
              type="number"
              min={MIN_TILE}
              max={MAX_TILE}
              value={tw}
              onChange={(e) => setTw(e.target.valueAsNumber)}
              onBlur={(e) => setTw(clamp(e.target.valueAsNumber))}
              className="w-16 bg-well text-sm text-ink-soft rounded px-1.5 py-1 border border-edge"
            />
          </label>
          <span className="text-faint">×</span>
          <label className="flex items-center gap-1.5 text-xs text-faint">
            H
            <input
              type="number"
              min={MIN_TILE}
              max={MAX_TILE}
              value={th}
              onChange={(e) => setTh(e.target.valueAsNumber)}
              onBlur={(e) => setTh(clamp(e.target.valueAsNumber))}
              className="w-16 bg-well text-sm text-ink-soft rounded px-1.5 py-1 border border-edge"
            />
          </label>
        </div>

        <div className="beast-checker inline-block rounded border border-edge mb-2">
          <canvas ref={canvasRef} style={{ display: 'block', imageRendering: 'pixelated' }} />
        </div>

        <p className="text-xs text-ink-soft mb-0.5">
          {total === 0
            ? 'No tiles'
            : `${kept} tile${kept === 1 ? '' : 's'}` + (emptyCount ? ` · ${emptyCount} empty (skipped)` : '')}
        </p>
        <p className={'text-[11px] mb-3 min-h-4 ' + (disabledReason ? 'text-danger' : 'text-faint')}>
          {disabledReason ??
            (remW || remH
              ? `Remainder ignored: ${remW ? `${remW}px right` : ''}${remW && remH ? ', ' : ''}${remH ? `${remH}px bottom` : ''}.`
              : '')}
        </p>

        <div className="flex justify-end gap-2" onKeyDown={focusAdjacentButton}>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1.5 rounded text-sm bg-surface hover:bg-surface-hover text-ink-soft"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!!disabledReason}
            className="px-2.5 py-1.5 rounded text-sm bg-accent-deep/15 hover:bg-accent-deep/25 text-accent-bright border border-accent-deep/40 disabled:opacity-40 disabled:hover:bg-accent-deep/15"
          >
            {kept > 0 && kept <= MAX_TILES ? `Import ${kept} sprite${kept === 1 ? '' : 's'}` : 'Import'}
          </button>
        </div>
      </form>
    </div>
  )
}
