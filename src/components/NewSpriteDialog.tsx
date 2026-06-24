import { useEffect, useRef, useState } from 'react'
import { focusAdjacentButton } from '../hooks/dialogFocusNav.js'
import useEscapeKey from '../hooks/useEscapeKey.js'
import useFocusTrap from '../hooks/useFocusTrap.js'

const PRESETS = [16, 32, 64, 128]
const MIN_SIZE = 1
const MAX_SIZE = 256

interface NewSpriteDialogProps {
  open: boolean
  onCreate: (w: number, h: number) => void
  onClose: () => void
}

// Modal shown from SpriteList's "+" button to pick a new sprite's canvas size
// before creating it — a preset (16/32/64/128, square) or a custom W×H.
export default function NewSpriteDialog({ open, onCreate, onClose }: NewSpriteDialogProps) {
  const [w, setW] = useState(32)
  const [h, setH] = useState(32)
  const firstInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Opening the dialog doesn't move focus on its own, so without this Enter
  // would activate whatever still has focus from before the dialog opened
  // (e.g. the "+" button), never reaching the form.
  useEffect(() => {
    if (open) firstInputRef.current?.focus()
  }, [open])

  useEscapeKey(open, onClose)
  useFocusTrap(open, formRef)

  if (!open) return null

  const clamp = (n: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n) || MIN_SIZE))
  const activePreset = w === h && PRESETS.includes(w) ? w : null

  const create = () => onCreate(clamp(w), clamp(h))

  return (
    <div
      className="fixed inset-0 bg-black/50 grid place-items-center z-50"
      onMouseDown={onClose}
    >
      <form
        ref={formRef}
        role="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); create() }}
        className="bg-panel border border-divider rounded-lg p-4 w-72 shadow-xl"
      >
        <h2 className="text-sm font-semibold text-ink mb-3">New Sprite</h2>

        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
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
            className="px-2.5 py-1.5 rounded text-sm bg-accent-deep/15 hover:bg-accent-deep/25 text-accent-bright border border-accent-deep/40"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  )
}
