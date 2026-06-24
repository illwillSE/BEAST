import { useEffect, useRef } from 'react'
import { CLASSIC_PALETTES, type ClassicPalette } from '../document/classicPalettes.js'
import { focusAdjacentButton } from '../hooks/dialogFocusNav.js'
import useEscapeKey from '../hooks/useEscapeKey.js'
import useFocusTrap from '../hooks/useFocusTrap.js'

interface ClassicPalettesDialogProps {
  open: boolean
  onSelect: (palette: ClassicPalette) => void
  onClose: () => void
}

// Picks one of the built-in retro system palettes (see classicPalettes.ts),
// previewed as a color strip. Picking one hands its colors off to
// MergeColorsDialog for the actual Replace/Add Unique decision, same as
// Import Colors from Canvas.
export default function ClassicPalettesDialog({ open, onSelect, onClose }: ClassicPalettesDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const firstButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) firstButtonRef.current?.focus()
  }, [open])

  useEscapeKey(open, onClose)
  useFocusTrap(open, panelRef)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 grid place-items-center z-50"
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-panel border border-divider rounded-lg p-4 w-80 shadow-xl"
      >
        <h2 className="text-sm font-semibold text-ink mb-3">Classic Palettes</h2>

        <div className="flex flex-col gap-1.5" onKeyDown={focusAdjacentButton}>
          {CLASSIC_PALETTES.map((p, i) => (
            <button
              key={p.id}
              ref={i === 0 ? firstButtonRef : undefined}
              type="button"
              onClick={() => onSelect(p)}
              className="w-full text-left p-2 rounded border border-edge hover:bg-surface-hover hover:border-accent-deep/40"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-ink-soft">{p.name}</span>
                <span className="text-[10px] text-faint">{p.colors.length} colors</span>
              </div>
              <div className="flex h-4 rounded overflow-hidden">
                {p.colors.map((c, ci) => (
                  <span key={ci} className="flex-1" style={{ background: c }} />
                ))}
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-end mt-3">
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1.5 rounded text-sm bg-surface hover:bg-surface-hover text-ink-soft"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
