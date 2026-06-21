import { useEffect, useRef, useState } from 'react'
import { Square, Circle, Minus } from 'lucide-react'
import { shapeOffsets } from '../document/model.js'
import type { BrushShape } from '../document/model.js'

const MIN_SIZE = 1
const MAX_SIZE = 20

// One entry per BrushShape — adding a new shape later is one array entry
// here plus one case in shapeOffsets (document/model.js), nothing structural.
const SHAPES: { id: BrushShape; label: string; rotate?: string }[] = [
  { id: 'square', label: 'Square' },
  { id: 'round', label: 'Round' },
  { id: 'line-h', label: 'Horizontal line' },
  { id: 'line-v', label: 'Vertical line', rotate: 'rotate-90' },
  { id: 'line-diag1', label: 'Diagonal line (\\)', rotate: 'rotate-45' },
  { id: 'line-diag2', label: 'Diagonal line (/)', rotate: '-rotate-45' },
]

function ShapeIcon({ shape, size = 13, rotate }: { shape: BrushShape; size?: number; rotate?: string }) {
  if (shape === 'round') return <Circle size={size} />
  if (shape === 'square') return <Square size={size} />
  return <Minus size={size} className={rotate} />
}

// Renders the actual shapeOffsets output as a small pixel grid, so the
// even-size bias and round/line shapes are visible rather than surprising.
function StampPreview({ size, shape }: { size: number; shape: BrushShape }) {
  const offsets = shapeOffsets(size, shape)
  const xs = offsets.map(([x]) => x)
  const ys = offsets.map(([, y]) => y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  const filled = new Set(offsets.map(([x, y]) => `${x},${y}`))
  const cell = Math.max(4, Math.min(10, Math.floor(120 / Math.max(w, h))))

  return (
    <div
      className="grid gap-px bg-edge border border-edge rounded-sm overflow-hidden"
      style={{ gridTemplateColumns: `repeat(${w}, ${cell}px)` }}
    >
      {Array.from({ length: h }, (_, dy) =>
        Array.from({ length: w }, (_, dx) => {
          const on = filled.has(`${dx + minX},${dy + minY}`)
          return (
            <div
              key={`${dx},${dy}`}
              className={on ? 'bg-accent-bright' : 'bg-well'}
              style={{ width: cell, height: cell }}
            />
          )
        }),
      )}
    </div>
  )
}

interface BrushSizeButtonProps {
  size: number
  shape: BrushShape
  onSize: (value: number) => void
  onShape: (value: BrushShape) => void
}

// Status-bar button + anchored popover for the global brush size/shape
// (shared by pencil/eraser/line/rect/ellipse — see tools/registry.js
// `hasBrushSize`). Replaces the old per-tool rail flyouts for width.
export default function BrushSizeButton({ size, shape, onSize, onShape }: BrushSizeButtonProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const activeShape = SHAPES.find((s) => s.id === shape) ?? SHAPES[0]

  return (
    <div ref={rootRef} className="relative">
      <button
        title="Brush size & shape"
        className="flex items-center gap-1 text-muted hover:text-ink"
        onClick={() => setOpen((o) => !o)}
      >
        <ShapeIcon shape={activeShape.id} rotate={activeShape.rotate} />
        <span className="tabular-nums">{size}px</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-20 w-48 p-2.5 bg-panel border border-divider rounded shadow-lg flex flex-col gap-2.5">
          <div className="flex gap-1">
            {SHAPES.map((s) => (
              <button
                key={s.id}
                title={s.label}
                onClick={() => onShape(s.id)}
                className={
                  'grid place-items-center w-7 h-7 rounded border ' +
                  (s.id === shape
                    ? 'bg-accent-deep/20 border-accent-deep text-accent-bright'
                    : 'border-transparent text-muted hover:text-ink hover:bg-surface-hover')
                }
              >
                <ShapeIcon shape={s.id} rotate={s.rotate} />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="range"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={size}
              onChange={(e) => onSize(Number(e.target.value))}
              className="beast-slider flex-1"
              style={{ '--fill': `${((size - MIN_SIZE) / (MAX_SIZE - MIN_SIZE)) * 100}%` } as React.CSSProperties}
            />
            <span className="text-[11px] text-text tabular-nums w-7">{size}px</span>
          </div>

          <div className="grid place-items-center py-1">
            <StampPreview size={size} shape={shape} />
          </div>
        </div>
      )}
    </div>
  )
}
