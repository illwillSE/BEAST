import { useState } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import NewSpriteDialog from './NewSpriteDialog.jsx'
import ResizeCanvasDialog from './ResizeCanvasDialog.jsx'
import SpritePreview from './SpritePreview.jsx'
import PinToggle from './PinToggle.jsx'

// A BEAST project holds many sprites (like BLAST holds many sounds). Selecting
// one makes it the paint target; the header buttons add/move the selected
// sprite, while delete lives on each row (hover to reveal). Double-click a
// name to rename it. Each thumbnail shows the
// sprite's frame 0 composited across its layers. A sprite's canvas can also be
// resized via the Crop tool (drag a rect on the canvas, tools/registry.js) or
// by double-clicking a block's W×H label, which opens the Resize dialog
// (explicit W×H + anchor).
export default function SpriteList({ sprites, selectedId, onSelect, dispatch, pinned, onTogglePin, onPeekSelect }) {
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [newSpriteOpen, setNewSpriteOpen] = useState(false)
  const [resizeOpen, setResizeOpen] = useState(false)

  const selectedIndex = sprites.findIndex((s) => s.id === selectedId)
  const selectedSprite = sprites.find((s) => s.id === selectedId)

  const createSprite = (w, h) => {
    dispatch({ type: 'ADD_SPRITE', opts: { name: `Sprite ${sprites.length + 1}`, w, h } })
    setNewSpriteOpen(false)
  }
  const resizeSprite = (x, y, w, h) => {
    dispatch({ type: 'CROP_SPRITE', spriteId: selectedSprite.id, x, y, w, h })
    setResizeOpen(false)
  }
  const removeSprite = (spriteId) => sprites.length > 1 && dispatch({ type: 'REMOVE_SPRITE', spriteId })
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
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-faint font-semibold">Sprites</span>
          <PinToggle pinned={pinned} onClick={onTogglePin} />
        </div>
        <div className="flex items-center gap-1 text-muted">
          <button title="New sprite" className="hover:text-ink" onClick={() => setNewSpriteOpen(true)}>
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
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {sprites.map((s) => {
          if (editingId === s.id) {
            return (
              <div key={s.id} className="flex items-center gap-2 p-1.5 rounded border border-accent-deep/50 bg-accent-deep/15">
                <SpritePreview sprite={s} frameIndex={0} size={36} className="rounded border border-edge" />
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
            <div
              key={s.id}
              className={
                'group flex items-center gap-2 p-1.5 rounded border ' +
                (selected ? 'bg-accent-deep/15 border-accent-deep/50' : 'border-transparent hover:bg-surface-hover')
              }
            >
              <button
                onClick={() => { onSelect(s.id); onPeekSelect?.() }}
                onDoubleClick={() => startRename(s)}
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
              >
                <SpritePreview sprite={s} frameIndex={0} size={36} className="rounded border border-edge" />
                <span className="min-w-0">
                  <span className={'block text-sm truncate ' + (selected ? 'text-accent-soft' : 'text-ink-soft')}>
                    {s.name}
                  </span>
                  <span
                    title="Double-click to resize canvas"
                    className="block text-[11px] text-faint hover:text-muted"
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      onSelect(s.id)
                      setResizeOpen(true)
                    }}
                  >
                    {s.w}×{s.h} · {s.frameCount}f
                  </span>
                </span>
              </button>
              <button
                title="Delete"
                className="shrink-0 opacity-0 group-hover:opacity-100 text-muted hover:text-danger disabled:opacity-0"
                disabled={sprites.length <= 1}
                onClick={() => removeSprite(s.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>

      <NewSpriteDialog
        open={newSpriteOpen}
        onCreate={createSprite}
        onClose={() => setNewSpriteOpen(false)}
      />
      {selectedSprite && (
        <ResizeCanvasDialog
          open={resizeOpen}
          sprite={selectedSprite}
          onResize={resizeSprite}
          onClose={() => setResizeOpen(false)}
        />
      )}
    </div>
  )
}
