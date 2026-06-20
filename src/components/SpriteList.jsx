import { useState } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'

// A BEAST project holds many sprites (like BLAST holds many sounds). Selecting
// one makes it the paint target; the header buttons add/move/delete the
// selected sprite. Double-click a name to rename it. Thumbnails are still
// placeholders.
export default function SpriteList({ sprites, selectedId, onSelect, dispatch }) {
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')

  const selectedIndex = sprites.findIndex((s) => s.id === selectedId)

  const addSprite = () => dispatch({ type: 'ADD_SPRITE', opts: { name: `Sprite ${sprites.length + 1}` } })
  const removeSprite = () => selectedId && sprites.length > 1 && dispatch({ type: 'REMOVE_SPRITE', spriteId: selectedId })
  const moveSprite = (delta) => selectedId && dispatch({ type: 'MOVE_SPRITE', spriteId: selectedId, delta })

  const startRename = (s) => { setEditingId(s.id); setEditValue(s.name) }
  const commitRename = () => {
    const name = editValue.trim()
    if (name) dispatch({ type: 'RENAME_SPRITE', spriteId: editingId, name })
    setEditingId(null)
  }

  return (
    <div className="flex flex-col bg-panel border-r border-divider w-44 shrink-0">
      <div className="flex items-center justify-between px-3 h-9 border-b border-divider">
        <span className="text-[11px] uppercase tracking-wide text-faint font-semibold">Sprites</span>
        <div className="flex items-center gap-1 text-muted">
          <button title="New sprite" className="hover:text-ink" onClick={addSprite}>
            <Plus size={15} />
          </button>
          <button
            title="Move up"
            className="hover:text-ink disabled:opacity-30 disabled:hover:text-muted"
            disabled={selectedIndex <= 0}
            onClick={() => moveSprite(-1)}
          >
            <ChevronUp size={14} />
          </button>
          <button
            title="Move down"
            className="hover:text-ink disabled:opacity-30 disabled:hover:text-muted"
            disabled={selectedIndex === -1 || selectedIndex === sprites.length - 1}
            onClick={() => moveSprite(1)}
          >
            <ChevronDown size={14} />
          </button>
          <button
            title="Delete"
            className="hover:text-danger disabled:opacity-30 disabled:hover:text-muted"
            disabled={sprites.length <= 1}
            onClick={removeSprite}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {sprites.map((s) => {
          if (editingId === s.id) {
            return (
              <div key={s.id} className="flex items-center gap-2 p-1.5 rounded border border-accent-deep/50 bg-accent-deep/15">
                <span className="beast-checker w-9 h-9 rounded border border-edge shrink-0" />
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="min-w-0 flex-1 bg-well text-sm text-ink-soft rounded px-1 border border-edge"
                />
              </div>
            )
          }
          const selected = selectedId === s.id
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              onDoubleClick={() => startRename(s)}
              className={
                'flex items-center gap-2 p-1.5 rounded border text-left ' +
                (selected ? 'bg-accent-deep/15 border-accent-deep/50' : 'border-transparent hover:bg-surface-hover')
              }
            >
              <span className="beast-checker w-9 h-9 rounded border border-edge shrink-0" />
              <span className="min-w-0">
                <span className={'block text-sm truncate ' + (selected ? 'text-accent-soft' : 'text-ink-soft')}>
                  {s.name}
                </span>
                <span className="block text-[11px] text-faint">
                  {s.w}×{s.h} · {s.frameCount}f
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
