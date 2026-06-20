import { useState } from 'react'

const PRESETS = [16, 32, 64, 128]
const MIN_SIZE = 1
const MAX_SIZE = 256

// Modal shown from SpriteList's "+" button to pick a new sprite's canvas size
// before creating it — a preset (16/32/64/128, square) or a custom W×H.
export default function NewSpriteDialog({ open, onCreate, onClose }) {
  const [w, setW] = useState(32)
  const [h, setH] = useState(32)

  if (!open) return null

  const clamp = (n) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n) || MIN_SIZE))
  const activePreset = w === h && PRESETS.includes(w) ? w : null

  const create = () => onCreate(clamp(w), clamp(h))

  return (
    <div
      className="fixed inset-0 bg-black/50 grid place-items-center z-50"
      onMouseDown={onClose}
    >
      <div
        className="bg-panel border border-divider rounded-lg p-4 w-72 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-ink mb-3">New Sprite</h2>

        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => { setW(p); setH(p) }}
              className={
                'py-1.5 rounded text-xs border ' +
                (activePreset === p
                  ? 'bg-accent-deep/15 border-accent-deep/50 text-accent-soft'
                  : 'border-edge text-muted hover:bg-surface-hover hover:text-ink-soft')
              }
            >
              {p}×{p}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-4">
          <label className="flex items-center gap-1.5 text-xs text-faint">
            W
            <input
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

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-2.5 py-1.5 rounded text-sm bg-surface hover:bg-surface-hover text-ink-soft"
          >
            Cancel
          </button>
          <button
            onClick={create}
            className="px-2.5 py-1.5 rounded text-sm bg-accent-deep/15 hover:bg-accent-deep/25 text-accent-bright border border-accent-deep/40"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
