import {
  Pencil, Eraser, PaintBucket, Pipette, Minus, Square, Circle,
  BoxSelect, Move, FlipHorizontal, FlipVertical, Blend,
} from 'lucide-react'

// v1 tool set, rendered from a static list (see src/tools/registry.js for the
// behavior side of each entry). Mirror is a toggle layered on other tools
// rather than its own tool, so it lives outside this list.
const TOOLS = [
  { id: 'pencil', label: 'Pencil', Icon: Pencil },
  { id: 'eraser', label: 'Eraser', Icon: Eraser },
  { id: 'fill', label: 'Fill', Icon: PaintBucket },
  { id: 'gradient', label: 'Gradient', Icon: Blend },
  { id: 'eyedropper', label: 'Eyedropper', Icon: Pipette },
  null, // divider
  { id: 'line', label: 'Line', Icon: Minus },
  { id: 'rect', label: 'Rectangle', Icon: Square, hasFillOption: true },
  { id: 'ellipse', label: 'Ellipse', Icon: Circle, hasFillOption: true },
  null,
  { id: 'select', label: 'Select', Icon: BoxSelect },
  { id: 'move', label: 'Move', Icon: Move },
]

export default function ToolRail({ active, onPick, filled, onFilled, mirrorV, mirrorH, onMirrorV, onMirrorH }) {
  return (
    <div className="flex flex-col items-center gap-1 p-2 bg-panel border-r border-divider shrink-0">
      {TOOLS.map((t, i) =>
        t === null ? (
          <div key={`d${i}`} className="h-px w-7 bg-divider my-1" />
        ) : (
          <div key={t.id} className="relative">
            <button
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

            {t.hasFillOption && active === t.id && (
              <div className="absolute left-full top-0 ml-1 z-10 flex flex-col gap-0.5 p-1 bg-panel border border-divider rounded shadow-lg">
                {[['Outline', false], ['Filled', true]].map(([label, val]) => (
                  <button
                    key={label}
                    onClick={() => onFilled(t.id, val)}
                    className={
                      'px-2 py-1 rounded text-[11px] whitespace-nowrap text-left ' +
                      ((filled[t.id] ?? false) === val
                        ? 'bg-accent-deep/20 text-accent-bright'
                        : 'text-muted hover:text-ink hover:bg-surface-hover')
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      )}

      <div className="h-px w-7 bg-divider my-1" />
      <button
        title="Mirror vertical axis (left/right)"
        onClick={onMirrorV}
        className={
          'grid place-items-center w-10 h-10 rounded border ' +
          (mirrorV ? 'bg-on/20 border-on text-on-bright' : 'border-transparent text-muted hover:text-ink hover:bg-surface-hover')
        }
      >
        <FlipHorizontal size={18} />
      </button>
      <button
        title="Mirror horizontal axis (top/bottom)"
        onClick={onMirrorH}
        className={
          'grid place-items-center w-10 h-10 rounded border ' +
          (mirrorH ? 'bg-on/20 border-on text-on-bright' : 'border-transparent text-muted hover:text-ink hover:bg-surface-hover')
        }
      >
        <FlipVertical size={18} />
      </button>
    </div>
  )
}
