import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Brush, CornerDownRight, ExternalLink, Minus, Search } from 'lucide-react'
import { linePoints, shapeOffsets, stampPoints } from '../document/model.js'
import type { BrushShape, Point } from '../document/model.js'

const HEADER_OFFSET_PX = 104

type SearchState =
  | { kind: 'idle' }
  | { kind: 'results'; count: number }
  | { kind: 'empty' }

interface ChapterLink {
  id: string
  title: string
  summary: string
  icon: typeof Brush
}

const chapters: ChapterLink[] = [
  { id: 'brush', title: 'Brush', summary: 'Freehand painting, size, shape, and erase behavior.', icon: Brush },
  { id: 'line', title: 'Line', summary: 'Single and continuous line workflows with angle locking.', icon: Minus },
  { id: 'more', title: 'More', summary: 'Reserved for future tool chapters as the editor grows.', icon: BookOpen },
]

export default function DocumentationPage() {
  const articleRef = useRef<HTMLElement>(null)
  const marksRef = useRef<HTMLElement[]>([])
  const [query, setQuery] = useState('')
  const [searchState, setSearchState] = useState<SearchState>({ kind: 'idle' })
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)

  useEffect(() => {
    const article = articleRef.current
    if (!article) return

    clearHighlights(article)
    marksRef.current = []

    const term = query.trim()
    if (!term) {
      setSearchState({ kind: 'idle' })
      setActiveMatchIndex(0)
      return
    }

    const marks = highlightMatches(article, term)
    if (marks.length === 0) {
      setSearchState({ kind: 'empty' })
      setActiveMatchIndex(0)
      return
    }

    marksRef.current = marks
    setSearchState({ kind: 'results', count: marks.length })
    setActiveMatchIndex(0)
  }, [query])

  useEffect(() => {
    if (searchState.kind !== 'results') return
    const marks = marksRef.current
    if (marks.length === 0) return
    const safeIndex = ((activeMatchIndex % marks.length) + marks.length) % marks.length
    marks.forEach((mark, index) => {
      mark.className = index === safeIndex
        ? 'rounded bg-accent-bright px-0.5 text-bg ring-1 ring-accent-soft'
        : 'rounded bg-accent px-0.5 text-bg'
      mark.removeAttribute('aria-current')
      if (index === safeIndex) mark.setAttribute('aria-current', 'true')
    })
    requestAnimationFrame(() => {
      marks[safeIndex]?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    })
  }, [activeMatchIndex, searchState])

  const searchLabel = useMemo(() => {
    if (searchState.kind === 'idle') return 'Search brush and line documentation'
    if (searchState.kind === 'empty') return 'No matches'
    return `${activeMatchIndex + 1} / ${searchState.count}`
  }, [searchState])

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || searchState.kind !== 'results') return
    e.preventDefault()
    setActiveMatchIndex((index) => (index + 1) % searchState.count)
  }

  return (
    <div className="min-h-screen bg-bg text-ink-soft">
      <header className="sticky top-0 z-30 border-b border-divider bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 lg:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span className="inline-block origin-left text-lg font-black tracking-[0.2em] text-accent">BEAST</span>
                <span className="rounded border border-accent-deep/40 bg-accent-deep/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-accent-soft">
                  Docs
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-ink md:text-3xl">Brush and line documentation</h1>
              <p className="mt-1 max-w-3xl text-sm text-text md:text-base">
                Focused guidance for the current painting workflow, written in the same visual language as the editor.
              </p>
            </div>

            <a
              href="./"
              className="inline-flex items-center justify-center gap-2 rounded border border-edge bg-surface px-3 py-2 text-sm text-ink-soft transition-colors hover:border-edge-hover hover:bg-surface-hover"
            >
              Open editor
              <ExternalLink size={15} />
            </a>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="group flex min-w-0 flex-1 items-center gap-3 rounded border border-edge bg-well px-3 py-2.5 transition-colors focus-within:border-accent-deep/60 focus-within:bg-surface/40">
              <Search size={16} className="shrink-0 text-muted transition-colors group-focus-within:text-accent-bright" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search terms like brush, continuous, erase, shift..."
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
                spellCheck={false}
                aria-label="Search documentation"
              />
            </label>
            <div className="text-sm text-muted">{searchLabel}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6">
        <section className="rounded-xl border border-divider bg-panel p-4 shadow-[0_18px_50px_rgba(2,6,23,0.3)] md:p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-soft">
            <BookOpen size={14} />
            Index
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {chapters.map(({ id, title, summary, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                className="rounded-lg border border-edge bg-surface/70 p-4 transition-colors hover:border-accent-deep/50 hover:bg-surface-hover"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Icon size={15} className="text-accent-bright" />
                  {title}
                </div>
                <p className="mt-2 text-sm leading-6 text-text">{summary}</p>
              </a>
            ))}
          </div>
        </section>

        <article ref={articleRef} className="space-y-6">
          <section id="brush" style={{ scrollMarginTop: `${HEADER_OFFSET_PX}px` }} className="rounded-xl border border-divider bg-panel p-5 md:p-6">
            <ChapterHeader eyebrow="Chapter 01" title="Brush" description="The brush is the editor’s direct paint tool. It follows the active sprite, layer, and frame, so every stroke lands exactly where the current UI selection is pointed." />
            <div className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4 text-sm leading-7 text-text">
                <p>
                  Brush strokes are continuous from pointer-down to pointer-up and collapse into a single undo step. That keeps sketching and cleanup fast without filling history with one event per pixel.
                </p>
                <p>
                  The same global brush controls define both <span className="text-ink">size</span> and <span className="text-ink">shape</span>. Square, round, and directional line stamps are available, and the stamp preview in the app reflects the exact pixel footprint that will be used.
                </p>
                <p>
                  Right-click swaps the brush into erase behavior. If <span className="text-ink">Erase to background</span> is enabled, it paints with the background color; otherwise it erases to transparency.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <InfoCard title="What the brush is best for" body="Freehand pixel placement, blocking in silhouettes, and cleaning edges with repeated short strokes." />
                  <InfoCard title="What controls matter most" body="Brush size, brush shape, foreground/background color, and the active layer/frame selection." />
                </div>
              </div>
              <div className="space-y-4">
                <IllustrationPanel title="Brush stamp shapes" subtitle="These examples reuse BEAST’s real brush-shape math.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <BrushStampFigure title="Square 4px" size={4} shape="square" />
                    <BrushStampFigure title="Round 5px" size={5} shape="round" />
                    <BrushStampFigure title="Diag \\ 6px" size={6} shape="line-diag1" />
                    <BrushStampFigure title="Diag / 6px" size={6} shape="line-diag2" />
                  </div>
                </IllustrationPanel>
                <IllustrationPanel title="Stroke flow" subtitle="A brush drag paints continuously and is undone as one action.">
                  <BrushStrokeFigure />
                </IllustrationPanel>
              </div>
            </div>
          </section>

          <section id="line" style={{ scrollMarginTop: `${HEADER_OFFSET_PX}px` }} className="rounded-xl border border-divider bg-panel p-5 md:p-6">
            <ChapterHeader eyebrow="Chapter 02" title="Line" description="The line tool shares the same brush size and shape system, but commits straight segments instead of freehand motion." />
            <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-4 text-sm leading-7 text-text">
                <p>
                  <span className="text-ink">Single</span> line mode is drag-based: press to place the start point, drag to preview, and release to commit one segment.
                </p>
                <p>
                  <span className="text-ink">Continuous</span> line mode is click-based: each click commits a segment from the previous anchor and then sets the next anchor, so chained corners can be built without leaving the tool.
                </p>
                <p>
                  To exit continuous line mode, press <span className="text-ink">Escape</span> to clear the pending anchor, or switch to another tool or line variant.
                </p>
                <p>
                  Holding <span className="text-ink">Shift</span> constrains the endpoint to the nearest 45-degree direction. This applies both while dragging a single line and while placing the next segment in continuous mode.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <InfoCard title="Single variant" body="Best when you want one deliberate segment, previewed live before release." />
                  <InfoCard title="Continuous variant" body="Best for connected outlines, angular silhouettes, and repeated segment placement from one anchor to the next." />
                </div>
              </div>
              <div className="space-y-4">
                <IllustrationPanel title="Single line preview" subtitle="Preview while dragging, then commit on release.">
                  <LineFigure
                    points={stampPoints(linePoints(2, 2, 13, 8), 2, 'square')}
                    badges={['Drag to preview', 'Release to commit']}
                  />
                </IllustrationPanel>
                <IllustrationPanel title="Continuous line workflow" subtitle="Each click advances the anchor for the next segment.">
                  <ContinuousLineFigure />
                </IllustrationPanel>
              </div>
            </div>
          </section>

          <section id="more" style={{ scrollMarginTop: `${HEADER_OFFSET_PX}px` }} className="rounded-xl border border-dashed border-edge bg-panel p-5 md:p-6">
            <ChapterHeader eyebrow="Future" title="More" description="This chapter is intentionally reserved for additional tool documentation as more parts of the editor are formalized." />
            <p className="mt-4 max-w-3xl text-sm leading-7 text-text">
              The page is structured around anchor chapters so new sections can be appended without changing the browsing pattern. Future additions should follow the same format: short practical explanation, one or two themed illustrations, and searchable text that slots into the existing index.
            </p>
          </section>
        </article>
      </main>
    </div>
  )
}

function ChapterHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-soft">{eyebrow}</div>
      <h2 className="mt-2 text-2xl font-semibold text-ink">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-text">{description}</p>
    </div>
  )
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-edge bg-well/70 p-4">
      <div className="text-sm font-medium text-ink">{title}</div>
      <p className="mt-2 text-sm leading-6 text-text">{body}</p>
    </div>
  )
}

function IllustrationPanel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-edge bg-well/70 p-4">
      <div className="text-sm font-medium text-ink">{title}</div>
      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-faint">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function BrushStampFigure({ title, size, shape }: { title: string; size: number; shape: BrushShape }) {
  return (
    <div className="rounded-lg border border-edge bg-panel p-3">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{title}</div>
      <div className="mt-3 flex justify-center">
        <PixelGrid points={shapeOffsets(size, shape)} />
      </div>
    </div>
  )
}

function BrushStrokeFigure() {
  const stroke = stampPoints(
    [
      ...linePoints(1, 5, 5, 4),
      ...linePoints(5, 4, 9, 7),
      ...linePoints(9, 7, 13, 6),
    ],
    2,
    'round',
  )

  return (
    <div className="grid gap-3 md:grid-cols-[auto_1fr] md:items-center">
      <div className="flex justify-center">
        <PixelGrid points={stroke} />
      </div>
      <div className="space-y-2 text-sm text-text">
        <div className="rounded border border-accent-deep/35 bg-accent-deep/10 px-3 py-2 text-accent-soft">
          Pointer down starts one stroke.
        </div>
        <div className="rounded border border-edge bg-panel px-3 py-2">
          Pointer moves extend the same stroke continuously.
        </div>
        <div className="rounded border border-edge bg-panel px-3 py-2">
          Pointer up ends the stroke and keeps it as one undo step.
        </div>
      </div>
    </div>
  )
}

function LineFigure({ points, badges }: { points: Point[]; badges: string[] }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <PixelGrid points={points} />
      </div>
      <div className="flex flex-wrap gap-2">
        {badges.map((badge) => (
          <span key={badge} className="rounded border border-edge bg-panel px-2.5 py-1 text-xs uppercase tracking-[0.12em] text-muted">
            {badge}
          </span>
        ))}
      </div>
    </div>
  )
}

function ContinuousLineFigure() {
  const first = stampPoints(linePoints(2, 8, 7, 3), 2, 'square')
  const second = stampPoints(linePoints(7, 3, 13, 6), 2, 'square')
  const points = [...first, ...second]

  return (
    <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
      <div className="flex justify-center">
        <PixelGrid points={points} anchors={[[2, 8], [7, 3], [13, 6]]} />
      </div>
      <div className="space-y-2 text-sm text-text">
        <div className="flex items-center gap-2 rounded border border-edge bg-panel px-3 py-2">
          <CornerDownRight size={14} className="text-accent-bright" />
          First click sets the anchor.
        </div>
        <div className="flex items-center gap-2 rounded border border-edge bg-panel px-3 py-2">
          <CornerDownRight size={14} className="text-accent-bright" />
          Next click commits a segment from the previous anchor.
        </div>
        <div className="flex items-center gap-2 rounded border border-accent-deep/35 bg-accent-deep/10 px-3 py-2 text-accent-soft">
          <CornerDownRight size={14} />
          Shift snaps that endpoint to the nearest 45-degree angle.
        </div>
      </div>
    </div>
  )
}

function PixelGrid({ points, anchors }: { points: Point[]; anchors?: Point[] }) {
  const normalized = useMemo(() => normalizePoints(points, anchors), [points, anchors])
  return (
    <div
      className="grid gap-px rounded border border-edge bg-edge p-2"
      style={{ gridTemplateColumns: `repeat(${normalized.width}, 10px)` }}
    >
      {Array.from({ length: normalized.width * normalized.height }, (_, index) => {
        const x = index % normalized.width
        const y = Math.floor(index / normalized.width)
        const key = `${x},${y}`
        const painted = normalized.filled.has(key)
        const anchor = normalized.anchors.has(key)
        return (
          <div
            key={key}
            className={anchor ? 'bg-accent-bright' : painted ? 'bg-accent-deep' : 'bg-well'}
            style={{ width: 10, height: 10 }}
          />
        )
      })}
    </div>
  )
}

function normalizePoints(points: Point[], anchors: Point[] = []) {
  const all = [...points, ...anchors]
  const xs = all.map(([x]) => x)
  const ys = all.map(([, y]) => y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return {
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    filled: new Set(points.map(([x, y]) => `${x - minX},${y - minY}`)),
    anchors: new Set(anchors.map(([x, y]) => `${x - minX},${y - minY}`)),
  }
}

function clearHighlights(root: HTMLElement) {
  root.querySelectorAll('mark[data-doc-highlight="true"]').forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ''))
  })
  root.normalize()
}

function highlightMatches(root: HTMLElement, term: string) {
  const lowerTerm = term.toLowerCase()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT
      if (parent.closest('mark')) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const matches: HTMLElement[] = []
  const textNodes: Text[] = []
  let current = walker.nextNode()
  while (current) {
    textNodes.push(current as Text)
    current = walker.nextNode()
  }

  textNodes.forEach((textNode) => {
    const text = textNode.textContent ?? ''
    const lower = text.toLowerCase()
    if (!lower.includes(lowerTerm)) return

    const fragment = document.createDocumentFragment()
    let cursor = 0
    let index = lower.indexOf(lowerTerm, cursor)
    while (index !== -1) {
      if (index > cursor) fragment.append(text.slice(cursor, index))
      const mark = document.createElement('mark')
      mark.dataset.docHighlight = 'true'
      mark.className = 'rounded bg-accent px-0.5 text-bg'
      mark.textContent = text.slice(index, index + term.length)
      fragment.append(mark)
      matches.push(mark)
      cursor = index + term.length
      index = lower.indexOf(lowerTerm, cursor)
    }
    if (cursor < text.length) fragment.append(text.slice(cursor))
    textNode.replaceWith(fragment)
  })

  return matches
}
