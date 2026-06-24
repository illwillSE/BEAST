interface ImportColorsFromCanvasDialogProps {
  colors: string[] | null
  onReplace: () => void
  onAddUnique: () => void
  onClose: () => void
}

// Confirms how to merge colors extracted from the current canvas into the
// palette: "Replace" swaps the whole palette for just these colors, "Add
// Unique" merges in only the ones not already present (like Import Colors
// from Image). `colors` is null when there's nothing pending — that's also
// the dialog's open/closed flag.
export default function ImportColorsFromCanvasDialog({ colors, onReplace, onAddUnique, onClose }: ImportColorsFromCanvasDialogProps) {
  if (!colors) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 grid place-items-center z-50"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-panel border border-divider rounded-lg p-4 w-80 shadow-xl"
      >
        <h2 className="text-sm font-semibold text-ink mb-2">Import Colors from Canvas</h2>
        <p className="text-xs text-faint mb-4">
          Found {colors.length} color{colors.length === 1 ? '' : 's'} on the current canvas. Replace the palette with
          these, or add only the ones not already in it?
        </p>
        <div className="flex justify-end gap-2">
          <button
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
