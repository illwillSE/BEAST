import { useEffect, useRef, useState } from 'react'
import { focusAdjacentButton } from '../hooks/dialogFocusNav.js'
import useEscapeKey from '../hooks/useEscapeKey.js'
import useFocusTrap from '../hooks/useFocusTrap.js'

interface AdjustHslDialogProps {
  open: boolean
  hasSelection: boolean
  frameCount: number
  onChange: (dh: number, ds: number, dv: number, allFrames: boolean) => void
  onApply: () => void
  onCancel: () => void
}

// Live hue / saturation / brightness adjustment. The three sliders re-fire
// onChange (a coalesced preview dispatch) on every move; Apply commits the
// gesture as one undo step, Cancel reverts it. Cancel — not just close — is also
// what Escape and the backdrop do, since closing must undo the preview.
export default function AdjustHslDialog({ open, hasSelection, frameCount, onChange, onApply, onCancel }: AdjustHslDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const applyRef = useRef<HTMLButtonElement>(null)
  const [dh, setDh] = useState(0)
  const [ds, setDs] = useState(0)
  const [dv, setDv] = useState(0)
  const [allFrames, setAllFrames] = useState(false)

  // Window starts centered; the title bar drags it by offsetting from there.
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null)

  // Reset to neutral each time the dialog opens.
  useEffect(() => {
    if (open) {
      setDh(0); setDs(0); setDv(0); setAllFrames(false)
      setOffset({ x: 0, y: 0 })
      applyRef.current?.focus()
    }
  }, [open])

  const handleTitleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPos: offset }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handleTitleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const { startX, startY, startPos } = dragRef.current
    setOffset({ x: startPos.x + (e.clientX - startX), y: startPos.y + (e.clientY - startY) })
  }
  const handleTitleUp = () => {
    dragRef.current = null
  }

  useEscapeKey(open, onCancel)
  useFocusTrap(open, panelRef)

  if (!open) return null

  const push = (h: number, s: number, v: number, all: boolean) => {
    setDh(h); setDs(s); setDv(v); setAllFrames(all)
    onChange(h, s, v, all)
  }

  const slider = (label: string, value: number, min: number, max: number, set: (n: number) => void) => (
    <label className="block mb-3">
      <div className="flex justify-between text-xs text-ink-soft mb-1">
        <span>{label}</span>
        <span className="text-faint tabular-nums">{value > 0 ? '+' : ''}{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="w-full accent-accent-bright"
      />
    </label>
  )

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50" onMouseDown={onCancel}>
      <div
        ref={panelRef}
        role="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        className="bg-panel border border-divider rounded-lg w-80 shadow-xl overflow-hidden"
      >
        <div
          className="h-7 px-3 flex items-center bg-surface border-b border-divider cursor-move select-none"
          onPointerDown={handleTitleDown}
          onPointerMove={handleTitleMove}
          onPointerUp={handleTitleUp}
        >
          <h2 className="text-sm font-semibold text-ink">Adjust Hue / Saturation / Brightness</h2>
        </div>

        <div className="p-4">
        <p className="text-xs text-faint mb-4">
          {hasSelection ? 'Adjusting the selected pixels.' : 'Adjusting the whole layer.'}
        </p>

        {slider('Hue', dh, -180, 180, (n) => push(n, ds, dv, allFrames))}
        {slider('Saturation', ds, -100, 100, (n) => push(dh, n, dv, allFrames))}
        {slider('Brightness', dv, -100, 100, (n) => push(dh, ds, n, allFrames))}

        {frameCount > 1 && (
          <label className="flex items-center gap-2 text-xs text-ink-soft mt-1 mb-1 cursor-pointer">
            <input
              type="checkbox"
              checked={allFrames}
              onChange={(e) => push(dh, ds, dv, e.target.checked)}
              className="accent-accent-bright"
            />
            Apply to all frames
          </label>
        )}

        <div className="flex justify-end gap-2 mt-4" onKeyDown={focusAdjacentButton}>
          <button
            type="button"
            onClick={onCancel}
            className="px-2.5 py-1.5 rounded text-sm bg-surface hover:bg-surface-hover text-ink-soft"
          >
            Cancel
          </button>
          <button
            ref={applyRef}
            type="button"
            onClick={onApply}
            className="px-2.5 py-1.5 rounded text-sm bg-accent-deep/15 hover:bg-accent-deep/25 text-accent-bright border border-accent-deep/40"
          >
            Apply
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}
