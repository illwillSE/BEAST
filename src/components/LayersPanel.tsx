import { useEffect, useState } from 'react'
import { Plus, Copy, Trash2, Eye, EyeOff, ChevronUp, ChevronDown } from 'lucide-react'
import PinToggle from './PinToggle.jsx'
import SpritePreview from './SpritePreview.jsx'
import type { BlendMode, Layer } from '../document/model.js'
import type { Action } from '../document/reducer.js'

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'add', label: 'Add' },
]

interface LayersPanelProps {
  layers: Layer[]
  selectedId: string
  onSelect: (id: string) => void
  spriteId: string
  w: number
  h: number
  frameIndex: number
  dispatch: (action: Action) => void
  pinned: boolean
  onTogglePin: () => void
  onPeekSelect?: () => void
}

// Layer stack for the selected sprite. Listed top-of-stack first (the model
// stores bottom-to-top). Selecting a layer makes it the paint target; the
// header buttons add/duplicate/move the selected layer; delete lives on each
// row (hover to reveal); dragging a row reorders the stack. Each row's eye
// toggles that layer's visibility independent of selection. The opacity
// slider edits the selected layer, coalescing one drag into one undo step.
export default function LayersPanel({ layers, selectedId, onSelect, spriteId, w, h, frameIndex, dispatch, pinned, onTogglePin, onPeekSelect }: LayersPanelProps) {
  const ordered = [...layers].reverse()
  const selected = layers.find((l) => l.id === selectedId)
  const selectedIndex = layers.findIndex((l) => l.id === selectedId)
  const opacityPct = selected ? Math.round(selected.opacity * 100) : 100

  const addLayer = () => dispatch({ type: 'ADD_LAYER', spriteId, name: `Layer ${layers.length + 1}` })
  const duplicateLayer = () => selected && dispatch({ type: 'DUPLICATE_LAYER', spriteId, layerId: selected.id })
  const removeLayer = (layerId: string) => layers.length > 1 && dispatch({ type: 'REMOVE_LAYER', spriteId, layerId })
  const moveLayer = (delta: number) => selected && dispatch({ type: 'MOVE_LAYER', spriteId, layerId: selected.id, delta })
  const toggleVisible = (l: Layer) => dispatch({ type: 'SET_LAYER_VISIBLE', spriteId, layerId: l.id, visible: !l.visible })

  // `ordered` is top-of-stack first (reverse of the model's bottom-to-top
  // `layers`), so drag indices need flipping before they reach REORDER_LAYER,
  // which operates on model (bottom-to-top) indices.
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const reorderLayer = (fromUi: number, toUi: number) => {
    if (fromUi === toUi) return
    const last = layers.length - 1
    dispatch({ type: 'REORDER_LAYER', spriteId, from: last - fromUi, to: last - toUi })
  }

  // Shift+click an eye to solo that layer (hide all others), remembering prior
  // visibility so it can be restored by shift+clicking the soloed layer again
  // or by plain-clicking any hidden layer's eye while soloed.
  const [solo, setSolo] = useState<{ spriteId: string; layerId: string; prev: Record<string, boolean> } | null>(null)
  useEffect(() => setSolo(null), [spriteId])

  const restoreSolo = (s: { prev: Record<string, boolean> }) => {
    layers.forEach((x) => {
      const v = s.prev[x.id]
      if (v !== undefined && v !== x.visible) dispatch({ type: 'SET_LAYER_VISIBLE', spriteId, layerId: x.id, visible: v })
    })
    setSolo(null)
  }

  const handleEyeClick = (l: Layer, e: React.MouseEvent) => {
    if (e.shiftKey) {
      if (solo && solo.spriteId === spriteId && solo.layerId === l.id) {
        restoreSolo(solo)
      } else {
        const prev: Record<string, boolean> = {}
        layers.forEach((x) => (prev[x.id] = x.visible))
        layers.forEach((x) => {
          const shouldBeVisible = x.id === l.id
          if (x.visible !== shouldBeVisible) dispatch({ type: 'SET_LAYER_VISIBLE', spriteId, layerId: x.id, visible: shouldBeVisible })
        })
        setSolo({ spriteId, layerId: l.id, prev })
      }
      return
    }
    if (solo && solo.spriteId === spriteId && !l.visible) {
      restoreSolo(solo)
      return
    }
    toggleVisible(l)
    if (solo) setSolo(null)
  }

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
        </div>
      </div>

      <div className="p-2 flex flex-col gap-1 max-h-44 overflow-y-auto">
        {ordered.map((l, i) => {
          const isSelected = l.id === selectedId
          return (
            <div
              key={l.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (dragIndex === null) return
                reorderLayer(dragIndex, i)
                setDragIndex(null)
              }}
              onDragEnd={() => setDragIndex(null)}
              className={
                'group flex items-center gap-2 p-1.5 rounded border ' +
                (isSelected ? 'bg-accent-deep/15 border-accent-deep/50' : 'border-transparent hover:bg-surface-hover') +
                (dragIndex === i ? ' opacity-40' : '')
              }
            >
              <button
                title={l.visible ? 'Hide layer (shift-click to solo)' : 'Show layer (shift-click to solo)'}
                onClick={(e) => handleEyeClick(l, e)}
                className={l.visible ? 'text-ink-soft hover:text-ink' : 'text-dim hover:text-ink'}
              >
                {l.visible ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <button onClick={() => { onSelect(l.id); onPeekSelect?.() }} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                <SpritePreview
                  sprite={{ id: l.id, name: l.name, w, h, frameCount: l.cells.length, layers: [{ ...l, visible: true, opacity: 1 }] }}
                  frameIndex={frameIndex}
                  size={28}
                  className="rounded border border-edge"
                />
                <span className={'flex-1 text-sm truncate ' + (isSelected ? 'text-accent-soft' : 'text-ink-soft')}>
                  {l.name}
                </span>
              </button>
              <button
                title="Delete"
                className="shrink-0 opacity-0 group-hover:opacity-100 text-muted hover:text-danger disabled:opacity-0"
                disabled={layers.length <= 1}
                onClick={() => removeLayer(l.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>

      <div className="px-3 pb-1.5 flex items-center gap-2">
        <span className="text-[11px] text-faint w-12">Blend</span>
        <select
          value={selected?.blendMode ?? 'normal'}
          disabled={!selected}
          onChange={(e) =>
            selected &&
            dispatch({ type: 'SET_LAYER_BLEND_MODE', spriteId, layerId: selected.id, blendMode: e.target.value as BlendMode })
          }
          className="flex-1 bg-well text-[11px] text-ink-soft rounded px-1.5 py-0.5 border border-edge disabled:opacity-50"
        >
          {BLEND_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
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
          style={{ '--fill': opacityPct + '%' } as React.CSSProperties}
        />
        <span className="text-[11px] text-text tabular-nums w-8 text-right">{opacityPct}</span>
      </div>
    </div>
  )
}
