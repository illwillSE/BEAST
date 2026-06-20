import { Plus } from 'lucide-react'

// A BEAST project holds many sprites (like BLAST holds many sounds). Placeholder
// list with fake thumbnails.
const SPRITES = [
  { id: 's1', name: 'hero_walk', size: '32×32', frames: 6 },
  { id: 's2', name: 'hero_idle', size: '32×32', frames: 4 },
  { id: 's3', name: 'coin_spin', size: '16×16', frames: 8 },
  { id: 's4', name: 'tileset', size: '128×128', frames: 1 },
]

export default function SpriteList({ selected, onSelect }) {
  return (
    <div className="flex flex-col bg-panel border-r border-divider w-44 shrink-0">
      <div className="flex items-center justify-between px-3 h-9 border-b border-divider">
        <span className="text-[11px] uppercase tracking-wide text-faint font-semibold">Sprites</span>
        <button title="New sprite" className="text-muted hover:text-ink">
          <Plus size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {SPRITES.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={
              'flex items-center gap-2 p-1.5 rounded border text-left ' +
              (selected === s.id
                ? 'bg-accent-deep/15 border-accent-deep/50'
                : 'border-transparent hover:bg-surface-hover')
            }
          >
            <span className="beast-checker w-9 h-9 rounded border border-edge shrink-0" />
            <span className="min-w-0">
              <span
                className={
                  'block text-sm truncate ' +
                  (selected === s.id ? 'text-accent-soft' : 'text-ink-soft')
                }
              >
                {s.name}
              </span>
              <span className="block text-[11px] text-faint">
                {s.size} · {s.frames}f
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
