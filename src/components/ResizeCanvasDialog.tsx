import { useEffect, useRef, useState } from 'react'
import type { Sprite } from '../document/model.js'

const MIN_SIZE = 1
const MAX_SIZE = 256
const ANCHORS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [0, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
]

interface ResizeCanvasDialogProps {
  open: boolean
  sprite: Sprite
  onResize: (x: number, y: number, w: number, h: number) => void
  onClose: () => void
}

// Modal for resizing the active sprite's canvas to an explicit W×H, anchored
// at one of 9 points (like Photoshop's Canvas Size) — existing pixels stay
// put relative to the anchor, padding (or cropping) the rest. Dispatches the
// same undoable CROP_SPRITE action as the Crop tool (document/model.js
// cropSprite handles both growing and shrinking generically).
export default function ResizeCanvasDialog({ open, sprite, onResize, onClose }: ResizeCanvasDialogProps) {
  const [w, setW] = useState(32)
  const [h, setH] = useState(32)
  const [anchor, setAnchor] = useState<[number, number]>([0, 0])
  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setW(sprite.w)
    setH(sprite.h)
    setAnchor([0, 0])
    firstInputRef.current?.focus()
  }, [open, sprite])

  if (!open) return null

  const clamp = (n: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n) || MIN_SIZE))

  const resize = () => {
    const newW = clamp(w)
    const newH = clamp(h)
    const deltaW = newW - sprite.w
    const deltaH = newH - sprite.h
    const [ax, ay] = anchor
    const insetX = ax === -1 ? 0 : ax === 0 ? Math.floor(deltaW / 2) : deltaW
    const insetY = ay === -1 ? 0 : ay === 0 ? Math.floor(deltaH / 2) : deltaH
    onResize(-insetX, -insetY, newW, newH)
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 grid place-items-center z-50"
      onMouseDown={onClose}
    >
      <form
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); resize() }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          resize()
        }}
        className="bg-panel border border-divider rounded-lg p-4 w-72 shadow-xl"
      >
        <h2 className="text-sm font-semibold text-ink mb-3">Resize Canvas</h2>

        <div className="flex items-center gap-2 mb-4">
          <label className="flex items-center gap-1.5 text-xs text-faint">
            W
            <input
              ref={firstInputRef}
              type="number"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={w}
              onChange={(e) => setW(e.target.valueAsNumber)}
              onBlur={(e) => setW(clamp(e.target.valueAsNumber))}
              className="w-16 bg-well text-sm text-ink-soft rounded px-1.5 py-1 border border-edge"
            />
          </label>
          <span className="text-faint">×</span>
          <label className="flex items-center gap-1.5 text-xs text-faint">
            H
            <input
              type="number"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={h}
              onChange={(e) => setH(e.target.valueAsNumber)}
              onBlur={(e) => setH(clamp(e.target.valueAsNumber))}
              className="w-16 bg-well text-sm text-ink-soft rounded px-1.5 py-1 border border-edge"
            />
          </label>
        </div>

        <label className="block text-xs text-faint mb-1.5">Anchor</label>
        <div className="grid grid-cols-3 gap-1 w-24 mb-4">
          {ANCHORS.map(([ax, ay]) => {
            const selected = anchor[0] === ax && anchor[1] === ay
            return (
              <button
                key={`${ax},${ay}`}
                type="button"
                onClick={() => setAnchor([ax, ay])}
                className={
                  'h-7 rounded border grid place-items-center ' +
                  (selected ? 'border-accent-deep/50 bg-accent-deep/15' : 'border-edge hover:bg-surface-hover')
                }
              >
                <span className={'w-1.5 h-1.5 rounded-full ' + (selected ? 'bg-accent-bright' : 'bg-faint')} />
              </button>
            )
          })}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1.5 rounded text-sm bg-surface hover:bg-surface-hover text-ink-soft"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-2.5 py-1.5 rounded text-sm bg-accent-deep/15 hover:bg-accent-deep/25 text-accent-bright border border-accent-deep/40"
          >
            Resize
          </button>
        </div>
      </form>
    </div>
  )
}
