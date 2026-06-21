// Collapsed edge tab for an unpinned panel. Vertical label on the left/right
// edges, horizontal label on the bottom edge. Click toggles the peek overlay.
// `fill` stretches the tab across the whole edge (true for a lone occupant
// like SpriteList/Frames); set false for tabs stacked with siblings in the
// same edge (Layers/Color), which instead get a fixed content-sized box.
const BORDER_CLASSES = { left: 'border-r', right: 'border-l', bottom: 'border-t' }

interface FoldTabProps {
  edge: keyof typeof BORDER_CLASSES
  label: string
  active: boolean
  onClick: () => void
  fill?: boolean
}

export default function FoldTab({ edge, label, active, onClick, fill = true }: FoldTabProps) {
  const vertical = edge !== 'bottom'
  const sizeClass = vertical
    ? (fill ? 'w-7 h-full' : 'w-7 h-28')
    : (fill ? 'w-full h-7' : 'h-7 w-28')
  return (
    <button
      onClick={onClick}
      title={label}
      className={
        'shrink-0 grid place-items-center bg-panel border-divider ' +
        sizeClass + ' ' + BORDER_CLASSES[edge] +
        ' ' +
        (active ? 'text-accent-bright bg-accent-deep/15' : 'text-faint hover:text-ink hover:bg-surface-hover')
      }
    >
      <span
        className={
          'text-[11px] uppercase tracking-wide font-semibold whitespace-nowrap ' +
          (vertical ? '[writing-mode:vertical-rl] rotate-180' : '')
        }
      >
        {label}
      </span>
    </button>
  )
}
