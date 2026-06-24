import { useEffect, useRef } from 'react'
import { focusAdjacentButton } from '../hooks/dialogFocusNav.js'
import useEscapeKey from '../hooks/useEscapeKey.js'
import useFocusTrap from '../hooks/useFocusTrap.js'

interface MergeColorsDialogProps {
  colors: string[] | null
  title: string
  description: string
  onReplace: () => void
  onAddUnique: () => void
  onClose: () => void
}

// Confirms how to merge an incoming color list into the palette: "Replace"
// swaps the whole palette for just these colors, "Add Unique" merges in only
// the ones not already present. Shared by every "load colors from X" flow
// (Import Colors from Canvas, Classic Palettes, ...) — `colors` is null when
// there's nothing pending, which doubles as the dialog's open/closed flag.
export default function MergeColorsDialog({ colors, title, description, onReplace, onAddUnique, onClose }: MergeColorsDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const open = colors !== null

  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  useEscapeKey(open, onClose)
  useFocusTrap(open, panelRef)

  if (!colors) return null

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
        <h2 className="text-sm font-semibold text-ink mb-2">{title}</h2>
        <p className="text-xs text-faint mb-4">{description}</p>
        <div className="flex justify-end gap-2" onKeyDown={focusAdjacentButton}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className="px-2.5 py-1.5 rounded text-sm bg-surface hover:bg-surface-hover text-ink-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onReplace}
            className="px-2.5 py-1.5 rounded text-sm bg-surface hover:bg-surface-hover text-ink-soft"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={onAddUnique}
            className="px-2.5 py-1.5 rounded text-sm bg-accent-deep/15 hover:bg-accent-deep/25 text-accent-bright border border-accent-deep/40"
          >
            Add Unique
          </button>
        </div>
      </div>
    </div>
  )
}
