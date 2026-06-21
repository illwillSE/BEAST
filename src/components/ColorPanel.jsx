import { Plus } from 'lucide-react'
import PinToggle from './PinToggle.jsx'

// Color: a managed swatch palette (loadable/savable) + a free RGBA picker.
// Mockup — swatches are static, picker is a visual placeholder.
const PALETTE = [
  '#0b0d11', '#1e293b', '#475569', '#94a3b8', '#e2e8f0', '#ffffff',
  '#7c2d12', '#b45309', '#f59e0b', '#fbbf24', '#fde68a', '#fef3c7',
  '#14532d', '#15803d', '#34d399', '#6ee7b7', '#0ea5e9', '#7dd3fc',
  '#7f1d1d', '#ef4444', '#f87171', '#fca5a5', '#a21caf', '#e879f9',
]

export default function ColorPanel({ color, onColor, pinned, onTogglePin, onPeekSelect }) {
  return (
    <div className="flex flex-col w-64 bg-panel">
      <div className="flex items-center justify-between px-3 h-9 border-b border-divider">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-faint font-semibold">Color</span>
          <PinToggle pinned={pinned} onClick={onTogglePin} />
        </div>
        <button title="New palette" className="text-muted hover:text-ink"><Plus size={15} /></button>
      </div>

      <div className="p-3 flex flex-col gap-3">
        {/* current color + faux picker */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded border border-edge-2 shrink-0" style={{ background: color }} />
          <div className="flex-1 flex flex-col gap-1.5">
            <div
              className="h-12 rounded border border-edge"
              style={{ background: 'linear-gradient(to right, #000, ' + color + '), linear-gradient(to top, #000, transparent)' }}
            />
          </div>
        </div>

        {/* RGBA readout (placeholder) */}
        <div className="grid grid-cols-4 gap-1.5">
          {['R', 'G', 'B', 'A'].map((ch, i) => (
            <div key={ch} className="bg-well rounded border border-edge px-2 py-1 text-center">
              <div className="text-[10px] text-faint">{ch}</div>
              <div className="text-xs text-ink-soft tabular-nums">{['251', '191', '36', '255'][i]}</div>
            </div>
          ))}
        </div>

        {/* swatch palette */}
        <div className="grid grid-cols-6 gap-1.5">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => { onColor(c); onPeekSelect?.() }}
              title={c}
              className={
                'aspect-square rounded border ' +
                (color === c ? 'border-accent-bright ring-2 ring-accent-deep/60' : 'border-edge hover:border-edge-hover')
              }
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
