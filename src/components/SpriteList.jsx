import { Plus } from 'lucide-react'

// A BEAST project holds many sprites (like BLAST holds many sounds). Selecting
// one makes it the paint target; thumbnails are still placeholders.
export default function SpriteList({ sprites, selectedId, onSelect }) {
  return (
    <div className="flex flex-col bg-panel border-r border-divider w-44 shrink-0">
      <div className="flex items-center justify-between px-3 h-9 border-b border-divider">
        <span className="text-[11px] uppercase tracking-wide text-faint font-semibold">Sprites</span>
        <button title="New sprite" className="text-muted hover:text-ink">
          <Plus size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {sprites.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={
              'flex items-center gap-2 p-1.5 rounded border text-left ' +
              (selectedId === s.id
                ? 'bg-accent-deep/15 border-accent-deep/50'
                : 'border-transparent hover:bg-surface-hover')
            }
          >
            <span className="beast-checker w-9 h-9 rounded border border-edge shrink-0" />
            <span className="min-w-0">
              <span
                className={
                  'block text-sm truncate ' +
                  (selectedId === s.id ? 'text-accent-soft' : 'text-ink-soft')
                }
              >
                {s.name}
              </span>
              <span className="block text-[11px] text-faint">
                {s.w}×{s.h} · {s.frameCount}f
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
