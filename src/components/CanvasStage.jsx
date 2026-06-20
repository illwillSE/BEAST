import { ZoomIn, ZoomOut } from 'lucide-react'

// Center stage. Placeholder: a checkerboarded square standing in for the live
// canvas, with a faux pixel-art smiley drawn via a CSS grid of cells. No drawing
// logic — purely visual.
export default function CanvasStage({ tool }) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg">
      {/* canvas viewport */}
      <div className="flex-1 grid place-items-center overflow-hidden p-6">
        <div className="beast-checker rounded shadow-2xl border border-edge p-0">
          <FauxSprite />
        </div>
      </div>

      {/* status bar */}
      <div className="flex items-center gap-4 px-3 h-8 bg-panel border-t border-divider text-[11px] text-faint shrink-0">
        <span>32 × 32</span>
        <span className="text-muted capitalize">{tool}</span>
        <span>pos 14, 9</span>
        <div className="flex-1" />
        <button className="text-muted hover:text-ink"><ZoomOut size={14} /></button>
        <span className="text-text tabular-nums">800%</span>
        <button className="text-muted hover:text-ink"><ZoomIn size={14} /></button>
      </div>
    </div>
  )
}

// 16×16 placeholder smiley so the canvas isn't empty.
const P = '#fbbf24' // body
const E = '#0b0d11' // eyes/mouth
const MAP = [
  '................',
  '................',
  '.....PPPPPP.....',
  '...PPPPPPPPPP...',
  '..PPPPPPPPPPPP..',
  '..PPPPPPPPPPPP..',
  '.PPEPPPPPPEPPPP.',
  '.PPEPPPPPPEPPPP.',
  '.PPPPPPPPPPPPPP.',
  '.PPPPPPPPPPPPPP.',
  '.PPEPPPPPPPPEPP.',
  '..PPEPPPPPPEPP..',
  '..PPPEEEEEPPPP..',
  '...PPPPPPPPPP...',
  '.....PPPPPP.....',
  '................',
]

function FauxSprite() {
  const cell = 16
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: `repeat(16, ${cell}px)`, gridTemplateRows: `repeat(16, ${cell}px)` }}
    >
      {MAP.flatMap((row, y) =>
        row.split('').map((c, x) => (
          <div
            key={`${x}-${y}`}
            style={{ background: c === 'P' ? P : c === 'E' ? E : 'transparent' }}
          />
        ))
      )}
    </div>
  )
}
