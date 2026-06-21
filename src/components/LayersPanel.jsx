import { Plus, Copy, Trash2, Eye, EyeOff, ChevronUp, ChevronDown } from 'lucide-react'
import PinToggle from './PinToggle.jsx'

// Layer stack for the selected sprite. Listed top-of-stack first (the model
// stores bottom-to-top). Selecting a layer makes it the paint target; the
// header buttons add/duplicate/move/delete the selected layer. Each row's eye
// toggles that layer's visibility independent of selection. The opacity
// slider edits the selected layer, coalescing one drag into one undo step.
export default function LayersPanel({ layers, selectedId, onSelect, spriteId, dispatch, pinned, onTogglePin, onPeekSelect }) {
  const ordered = [...layers].reverse()
  const selected = layers.find((l) => l.id === selectedId)
  const selectedIndex = layers.findIndex((l) => l.id === selectedId)
  const opacityPct = selected ? Math.round(selected.opacity * 100) : 100

  const addLayer = () => dispatch({ type: 'ADD_LAYER', spriteId, name: `Layer ${layers.length + 1}` })
  const duplicateLayer = () => selected && dispatch({ type: 'DUPLICATE_LAYER', spriteId, layerId: selected.id })
  const removeLayer = () => selected && layers.length > 1 && dispatch({ type: 'REMOVE_LAYER', spriteId, layerId: selected.id })
  const moveLayer = (delta) => selected && dispatch({ type: 'MOVE_LAYER', spriteId, layerId: selected.id, delta })
  const toggleVisible = (l) => dispatch({ type: 'SET_LAYER_VISIBLE', spriteId, layerId: l.id, visible: !l.visible })

  return (
    <div className="flex flex-col w-64 bg-panel border-b border-divider">
      <div className="flex items-center justify-between px-3 h-9 border-b border-divider">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-faint font-semibold">Layers</span>
          <PinToggle pinned={pinned} onClick={onTogglePin} />
        </div>
        <div className="flex items-center gap-1 text-muted">
          <button title="New layer" className="hover:text-ink" onClick={addLayer}><Plus size={15} /></button>
          <button title="Duplicate" className="hover:text-ink" onClick={duplicateLayer}><Copy size={14} /></button>
          <button
            title="Move up"
            className="hover:text-ink disabled:opacity-30 disabled:hover:text-muted"
            disabled={selectedIndex === -1 || selectedIndex === layers.length - 1}
            onClick={() => moveLayer(1)}
          >
            <ChevronUp size={14} />
          </button>
          <button
            title="Move down"
            className="hover:text-ink disabled:opacity-30 disabled:hover:text-muted"
            disabled={selectedIndex === -1 || selectedIndex === 0}
            onClick={() => moveLayer(-1)}
          >
            <ChevronDown size={14} />
          </button>
          <button
            title="Delete"
            className="hover:text-danger disabled:opacity-30 disabled:hover:text-muted"
            disabled={layers.length <= 1}
            onClick={removeLayer}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="p-2 flex flex-col gap-1 max-h-44 overflow-y-auto">
        {ordered.map((l) => {
          const isSelected = l.id === selectedId
          return (
            <div
              key={l.id}
              className={
                'flex items-center gap-2 p-1.5 rounded border ' +
                (isSelected ? 'bg-accent-deep/15 border-accent-deep/50' : 'border-transparent hover:bg-surface-hover')
              }
            >
              <button
                title={l.visible ? 'Hide layer' : 'Show layer'}
                onClick={() => toggleVisible(l)}
                className={l.visible ? 'text-ink-soft hover:text-ink' : 'text-dim hover:text-ink'}
              >
                {l.visible ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <button onClick={() => { onSelect(l.id); onPeekSelect?.() }} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                <span className="beast-checker w-7 h-7 rounded border border-edge shrink-0" />
                <span className={'flex-1 text-sm truncate ' + (isSelected ? 'text-accent-soft' : 'text-ink-soft')}>
                  {l.name}
                </span>
              </button>
            </div>
          )
        })}
      </div>

      <div className="px-3 pb-2 flex items-center gap-2">
        <span className="text-[11px] text-faint w-12">Opacity</span>
        <input
          type="range"
          min="0"
          max="100"
          value={opacityPct}
          disabled={!selected}
          onPointerDown={() => dispatch({ type: 'STROKE_BEGIN' })}
          onPointerUp={() => dispatch({ type: 'STROKE_END' })}
          onChange={(e) =>
            selected &&
            dispatch({ type: 'SET_LAYER_OPACITY', spriteId, layerId: selected.id, opacity: Number(e.target.value) / 100 })
          }
          className="beast-slider flex-1"
          style={{ '--fill': opacityPct + '%' }}
        />
        <span className="text-[11px] text-text tabular-nums w-8 text-right">{opacityPct}</span>
      </div>
    </div>
  )
}
