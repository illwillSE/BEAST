import { Play, Plus, Copy, Trash2, Eye } from 'lucide-react'

// Bottom timeline: animation frames + playback controls (loop), global FPS, and
// an onion-skin toggle. Selecting a frame makes it the paint target. Playback,
// FPS, onion-skin and the add/dup/delete buttons are still static (see TODO).
export default function FramesTimeline({ frameCount, active, onPick }) {
  return (
    <div className="flex items-stretch gap-3 px-3 h-28 bg-panel border-t border-divider shrink-0">
      {/* playback controls */}
      <div className="flex flex-col justify-center gap-2 pr-3 border-r border-divider shrink-0">
        <button className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-accent-deep/15 hover:bg-accent-deep/25 text-accent-bright border border-accent-deep/40 text-sm">
          <Play size={15} /> Play
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-faint">FPS</span>
          <input type="range" min="1" max="24" defaultValue="12" className="beast-slider w-20" style={{ '--fill': '50%' }} />
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
          <button
            key={i}
            onClick={() => onPick(i)}
            className={
              'relative shrink-0 rounded border p-1 ' +
              (active === i ? 'border-accent-deep bg-accent-deep/10' : 'border-edge hover:border-edge-hover')
            }
          >
            <span className="beast-checker block w-16 h-16 rounded-sm" />
            <span
              className={
                'absolute top-1 left-1 text-[10px] px-1 rounded-sm tabular-nums ' +
                (active === i ? 'bg-accent-deep text-bg' : 'bg-well/80 text-faint')
              }
            >
              {i + 1}
            </span>
          </button>
        ))}
        <div className="shrink-0 flex flex-col gap-1 ml-1">
          <button title="Add frame" className="grid place-items-center w-8 h-8 rounded border border-dashed border-edge text-muted hover:text-ink hover:border-edge-hover">
            <Plus size={16} />
          </button>
          <button title="Duplicate frame" className="grid place-items-center w-8 h-8 rounded border border-edge text-muted hover:text-ink">
            <Copy size={14} />
          </button>
          <button title="Delete frame" className="grid place-items-center w-8 h-8 rounded border border-edge text-muted hover:text-danger">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
