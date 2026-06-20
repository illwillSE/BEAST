import { Plus, Copy, Trash2, Eye, EyeOff } from 'lucide-react'

// Layer stack for the selected sprite/frame. Composited top-down. Placeholder
// data; opacity slider is static.
const LAYERS = [
  { id: 'l3', name: 'Highlights', visible: true },
  { id: 'l2', name: 'Character', visible: true, selected: true },
  { id: 'l1', name: 'Background', visible: false },
]

export default function LayersPanel() {
  return (
    <div className="flex flex-col border-b border-divider">
      <div className="flex items-center justify-between px-3 h-9 border-b border-divider">
        <span className="text-[11px] uppercase tracking-wide text-faint font-semibold">Layers</span>
        <div className="flex items-center gap-1 text-muted">
          <button title="New layer" className="hover:text-ink"><Plus size={15} /></button>
          <button title="Duplicate" className="hover:text-ink"><Copy size={14} /></button>
          <button title="Delete" className="hover:text-danger"><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="p-2 flex flex-col gap-1 max-h-44 overflow-y-auto">
        {LAYERS.map((l) => (
          <div
            key={l.id}
            className={
              'flex items-center gap-2 p-1.5 rounded border ' +
              (l.selected ? 'bg-accent-deep/15 border-accent-deep/50' : 'border-transparent hover:bg-surface-hover')
            }
          >
            <button className={l.visible ? 'text-ink-soft' : 'text-dim'}>
              {l.visible ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <span className="beast-checker w-7 h-7 rounded border border-edge shrink-0" />
            <span className={'flex-1 text-sm truncate ' + (l.selected ? 'text-accent-soft' : 'text-ink-soft')}>
              {l.name}
            </span>
          </div>
        ))}
      </div>

      <div className="px-3 pb-2 flex items-center gap-2">
        <span className="text-[11px] text-faint w-12">Opacity</span>
        <input type="range" min="0" max="100" defaultValue="100" className="beast-slider flex-1" style={{ '--fill': '100%' }} />
        <span className="text-[11px] text-text tabular-nums w-8 text-right">100</span>
      </div>
    </div>
  )
}
