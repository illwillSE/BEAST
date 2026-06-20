import {
  Pencil, Eraser, PaintBucket, Pipette, Minus, Square, Circle,
  BoxSelect, Move, FlipHorizontal, Blend,
} from 'lucide-react'

// v1 tool set. In the real app this renders from a tool registry (one entry per
// tool); here it's a static list for the mockup.
const TOOLS = [
  { id: 'pencil', label: 'Pencil', Icon: Pencil },
  { id: 'eraser', label: 'Eraser', Icon: Eraser },
  { id: 'fill', label: 'Fill', Icon: PaintBucket },
  { id: 'gradient', label: 'Gradient', Icon: Blend },
  { id: 'eyedropper', label: 'Eyedropper', Icon: Pipette },
  null, // divider
  { id: 'line', label: 'Line', Icon: Minus },
  { id: 'rect', label: 'Rectangle', Icon: Square },
  { id: 'ellipse', label: 'Ellipse', Icon: Circle },
  null,
  { id: 'select', label: 'Select', Icon: BoxSelect },
  { id: 'move', label: 'Move', Icon: Move },
  { id: 'mirror', label: 'Mirror', Icon: FlipHorizontal },
]

export default function ToolRail({ active, onPick }) {
  return (
    <div className="flex flex-col items-center gap-1 p-2 bg-panel border-r border-divider shrink-0">
      {TOOLS.map((t, i) =>
        t === null ? (
          <div key={`d${i}`} className="h-px w-7 bg-divider my-1" />
        ) : (
          <button
            key={t.id}
            title={t.label}
            onClick={() => onPick(t.id)}
            className={
              'grid place-items-center w-10 h-10 rounded border ' +
              (active === t.id
                ? 'bg-accent-deep/20 border-accent-deep text-accent-bright'
                : 'border-transparent text-muted hover:text-ink hover:bg-surface-hover')
            }
          >
            <t.Icon size={18} />
          </button>
        )
      )}
    </div>
  )
}
