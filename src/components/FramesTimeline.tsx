import { Play, Plus, Copy, Trash2, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import SpritePreview from './SpritePreview.jsx'
import PinToggle from './PinToggle.jsx'
import type { Sprite } from '../document/model.js'
import type { Action } from '../document/reducer.js'

interface FramesTimelineProps {
  sprite: Sprite
  frameCount: number
  active: number
  onPick: (index: number) => void
  spriteId: string
  dispatch: (action: Action) => void
  pinned: boolean
  onTogglePin: () => void
  onPeekSelect?: () => void
}

// Bottom timeline: animation frames + playback controls (loop), global FPS, and
// an onion-skin toggle. Selecting a frame makes it the paint target; the side
// buttons add/duplicate/move the active frame and follow it with selection;
// delete lives on each thumbnail (hover to reveal). Each frame thumbnail shows
// that frame composited across the sprite's layers. Playback, FPS, and
// onion-skin are still static (see TODO).
export default function FramesTimeline({ sprite, frameCount, active, onPick, spriteId, dispatch, pinned, onTogglePin, onPeekSelect }: FramesTimelineProps) {
  const addFrame = () => {
    const at = active + 1
    dispatch({ type: 'ADD_FRAME', spriteId, atIndex: at })
    onPick(at)
  }
  const duplicateFrame = () => {
    const at = active + 1
    dispatch({ type: 'DUPLICATE_FRAME', spriteId, frameIndex: active })
    onPick(at)
  }
  const removeFrame = (frameIndex: number) => {
    if (frameCount <= 1) return
    dispatch({ type: 'REMOVE_FRAME', spriteId, frameIndex })
    if (frameIndex === active) onPick(Math.min(active, frameCount - 2))
    else if (frameIndex < active) onPick(active - 1)
  }
  const moveFrame = (delta: number) => {
    const to = active + delta
    if (to < 0 || to >= frameCount) return
    dispatch({ type: 'MOVE_FRAME', spriteId, frameIndex: active, delta })
    onPick(to)
  }

  return (
    <div className="flex items-stretch gap-3 px-3 h-28 bg-panel border-t border-divider shrink-0">
      {/* playback controls */}
      <div className="flex flex-col justify-center gap-2 pr-3 border-r border-divider shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-faint font-semibold">Frames</span>
          <PinToggle pinned={pinned} onClick={onTogglePin} />
        </div>
        <button className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-accent-deep/15 hover:bg-accent-deep/25 text-accent-bright border border-accent-deep/40 text-sm">
          <Play size={15} /> Play
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-faint">FPS</span>
          <input type="range" min="1" max="24" defaultValue="12" className="beast-slider w-20" style={{ '--fill': '50%' } as React.CSSProperties} />
          <span className="text-[11px] text-text tabular-nums w-5">12</span>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none">
          <span className="grid place-items-center w-4 h-4 rounded-sm bg-accent-deep/20 border border-accent-deep text-accent-bright">
            <Eye size={11} />
          </span>
          Onion skin
        </label>
      </div>

      {/* frame strip */}
      <div className="flex-1 flex items-center gap-2 overflow-x-auto py-2">
        {Array.from({ length: frameCount }, (_, i) => (
          <div
            key={i}
            className={
              'group relative shrink-0 rounded border p-1 ' +
              (active === i ? 'border-accent-deep bg-accent-deep/10' : 'border-edge hover:border-edge-hover')
            }
          >
            <button onClick={() => { onPick(i); onPeekSelect?.() }}>
              <SpritePreview sprite={sprite} frameIndex={i} size={64} className="rounded-sm" />
              <span
                className={
                  'absolute top-1 left-1 text-[10px] px-1 rounded-sm tabular-nums ' +
                  (active === i ? 'bg-accent-deep text-bg' : 'bg-well/80 text-faint')
                }
              >
                {i + 1}
              </span>
            </button>
            <button
              title="Delete frame"
              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-muted hover:text-danger disabled:opacity-0 bg-well/80 rounded-sm"
              disabled={frameCount <= 1}
              onClick={() => removeFrame(i)}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <div className="shrink-0 grid grid-cols-2 gap-1 ml-1">
          <button title="Add frame" className="grid place-items-center w-8 h-8 rounded border border-dashed border-edge text-muted hover:text-ink hover:border-edge-hover" onClick={addFrame}>
            <Plus size={16} />
          </button>
          <button title="Duplicate frame" className="grid place-items-center w-8 h-8 rounded border border-edge text-muted hover:text-ink" onClick={duplicateFrame}>
            <Copy size={14} />
          </button>
          <button
            title="Move left"
            className="grid place-items-center w-8 h-8 rounded border border-edge text-muted hover:text-ink disabled:opacity-30 disabled:hover:text-muted"
            disabled={active === 0}
            onClick={() => moveFrame(-1)}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            title="Move right"
            className="grid place-items-center w-8 h-8 rounded border border-edge text-muted hover:text-ink disabled:opacity-30 disabled:hover:text-muted"
            disabled={active === frameCount - 1}
            onClick={() => moveFrame(1)}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
