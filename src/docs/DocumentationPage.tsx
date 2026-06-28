import { useEffect, useMemo, useRef, useState } from 'react'
import type { ForwardRefExoticComponent, RefAttributes } from 'react'
import { forwardRef } from 'react'
import {
  BookOpen, ChevronLeft, ChevronRight, Command, CornerDownRight, Eraser, ExternalLink, Layers2, Minus, PaintBucket, Pencil, Pipette, Search,
} from 'lucide-react'
import { type LucideProps } from 'lucide-react'
import { linePoints, shapeOffsets, stampPoints } from '../document/model.js'
import type { BrushShape, Point } from '../document/model.js'

const HEADER_OFFSET_PX = 104
type Icon = ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>

type SearchState =
  | { kind: 'idle' }
  | { kind: 'results'; count: number }
  | { kind: 'empty' }

interface ChapterLink {
  id: string
  title: string
  summary: string
  icon: Icon
}

const GradientLinear: Icon = forwardRef<SVGSVGElement, LucideProps>(
  ({ size = 24, color = 'currentColor', strokeWidth = 2, ...rest }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <defs>
        <linearGradient id="beast-docs-gradient-linear" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={color} stopOpacity="0" />
          <stop offset="1" stopColor={color} stopOpacity="1" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="2" fill="url(#beast-docs-gradient-linear)" />
    </svg>
  ),
)
GradientLinear.displayName = 'GradientLinear'

const chapters: ChapterLink[] = [
  { id: 'brush', title: 'Brush', summary: 'Freehand painting, size, shape, and erase behavior.', icon: Pencil },
  { id: 'eraser', title: 'Eraser', summary: 'Continuous stroke erasing with the same size and shape controls as the brush.', icon: Eraser },
  { id: 'line', title: 'Line', summary: 'Single and continuous line workflows with angle locking.', icon: Minus },
  { id: 'fill', title: 'Fill', summary: 'One-click flood filling of the connected region under the cursor.', icon: PaintBucket },
  { id: 'gradient', title: 'Gradient Fill', summary: 'Linear and radial fills that blend foreground to background color.', icon: GradientLinear },
  { id: 'colorpicker', title: 'Color Picker', summary: 'Sample a pixel and load it directly into the foreground color.', icon: Pipette },
  { id: 'layers', title: 'Layers', summary: 'Control stack order, visibility, opacity, blending, and focused paint targets.', icon: Layers2 },
  { id: 'command-palette', title: 'Command Palette', summary: 'Search, browse, and run editor actions from one keyboard-first overlay.', icon: Command },
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
    if (searchState.kind === 'idle') return ''
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
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 lg:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span className="inline-block origin-left text-lg font-black tracking-[0.2em] text-accent">BEAST</span>
                <span className="rounded border border-accent-deep/40 bg-accent-deep/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-accent-soft">
                  Docs
                </span>
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.05em] text-faint">
                {[['B', 'ig'], ['E', 'xtreme'], ['A', 'wesome'], ['S', 'prite'], ['T', 'ool']].map(([first, rest]) => (
                  <span key={first}>
                    <span className="text-[13px] font-bold text-yellow-400">{first}</span><span className="text-zinc-400">{rest}</span>{' '}
                  </span>
                ))}
              </div>
              <h1 className="mt-2 text-xl font-semibold text-ink md:text-2xl">Tool and layer documentation</h1>
            </div>

            <a
              href="./"
              className="inline-flex items-center justify-center gap-2 self-start rounded border border-edge bg-surface px-3 py-1.5 text-sm text-ink-soft transition-colors hover:border-edge-hover hover:bg-surface-hover md:self-center"
            >
              Open editor
              <ExternalLink size={15} />
            </a>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <label className="group flex min-w-0 flex-1 items-center gap-2.5 rounded border border-edge bg-well px-3 py-2 transition-colors focus-within:border-accent-deep/60 focus-within:bg-surface/40">
              <Search size={16} className="shrink-0 text-muted transition-colors group-focus-within:text-accent-bright" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search terms like eraser, fill, gradient, eyedropper, layers..."
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
                spellCheck={false}
                aria-label="Search documentation"
              />
            </label>
            <div className="text-sm text-muted md:min-w-12 md:text-right">{searchLabel}</div>
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6">
        <section className="rounded-xl border border-divider bg-panel p-4 shadow-[0_18px_50px_rgba(2,6,23,0.3)] md:p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-soft">
            <BookOpen size={14} />
            Sections
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
            <ChapterHeader title="Brush" description="The brush is the editor’s direct paint tool. It follows the active sprite, layer, and frame, so every stroke lands exactly where the current UI selection is pointed." />
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
            <ChapterHeader title="Line" description="The line tool shares the same brush size and shape system, but commits straight segments instead of freehand motion." />
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

          <section id="eraser" style={{ scrollMarginTop: `${HEADER_OFFSET_PX}px` }} className="rounded-xl border border-divider bg-panel p-5 md:p-6">
            <ChapterHeader title="Eraser" description="The eraser uses the same continuous stroke behavior and brush controls as the brush, but resolves every stamp through the editor’s erase color." />
            <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4 text-sm leading-7 text-text">
                <p>
                  Erasing is drag-based and continuous. Pointer-down starts a stroke, pointer movement extends it, and pointer-up ends it as one undo step.
                </p>
                <p>
                  The eraser shares the global <span className="text-ink">size</span> and <span className="text-ink">shape</span> controls with the brush and line tools, so the same square, round, and directional stamp footprints apply while removing pixels.
                </p>
                <p>
                  By default, erasing clears to <span className="text-ink">transparency</span>. If <span className="text-ink">Erase to background</span> is enabled, the same stroke paints with the current background color instead.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <InfoCard title="Best use case" body="Cleaning edges, carving silhouettes, and removing unwanted pixels with the same precision as painting them." />
                  <InfoCard title="What changes the result" body="Brush size, brush shape, and whether erase mode targets transparency or the background swatch." />
                </div>
              </div>
              <div className="space-y-4">
                <IllustrationPanel title="Transparency vs background erase" subtitle="The same stroke can clear or repaint depending on the erase setting.">
                  <EraserFigure />
                </IllustrationPanel>
                <IllustrationPanel title="Shared stamp logic" subtitle="Eraser follows the exact same pixel footprint as the brush.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <BrushStampFigure title="Square 4px" size={4} shape="square" />
                    <BrushStampFigure title="Round 5px" size={5} shape="round" />
                  </div>
                </IllustrationPanel>
              </div>
            </div>
          </section>

          <section id="fill" style={{ scrollMarginTop: `${HEADER_OFFSET_PX}px` }} className="rounded-xl border border-divider bg-panel p-5 md:p-6">
            <ChapterHeader title="Fill" description="Fill replaces the flood-connected region under the cursor in one click, using the same active sprite, layer, and frame targeting as every other paint tool." />
            <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-4 text-sm leading-7 text-text">
                <p>
                  Fill is a one-shot tool. Click a pixel and BEAST floods outward through the contiguous region of matching color, then commits that whole change as a single undo step.
                </p>
                <p>
                  Left-click fills with the <span className="text-ink">foreground color</span>. Right-click follows the same erase rule as other paint tools, letting you either clear to transparency or paint with the background color if erase-to-background is enabled.
                </p>
                <p>
                  Because the fill region is based on connectivity from the clicked pixel, enclosed shapes stay isolated while open gaps let the fill travel through them.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <InfoCard title="Best use case" body="Blocking in closed silhouettes, replacing flats quickly, and clearing isolated islands of color." />
                  <InfoCard title="What changes the result" body="The clicked pixel, the connected boundaries around it, and whether erase mode resolves to transparency or background color." />
                </div>
              </div>
              <div className="space-y-4">
                <IllustrationPanel title="Connected region fill" subtitle="Only the enclosed interior is affected by the click.">
                  <FillRegionFigure />
                </IllustrationPanel>
                <IllustrationPanel title="How to think about fill" subtitle="Fill follows containment, not a drawn marquee or brush radius.">
                  <div className="space-y-2 text-sm text-text">
                    <div className="rounded border border-accent-deep/35 bg-accent-deep/10 px-3 py-2 text-accent-soft">
                      Click inside a closed boundary to replace that whole interior at once.
                    </div>
                    <div className="rounded border border-edge bg-panel px-3 py-2">
                      If the region is open, the fill continues through any reachable matching pixels.
                    </div>
                    <div className="rounded border border-edge bg-panel px-3 py-2">
                      Undo treats the entire flood as one edit, even when the affected region is large.
                    </div>
                  </div>
                </IllustrationPanel>
              </div>
            </div>
          </section>

          <section id="gradient" style={{ scrollMarginTop: `${HEADER_OFFSET_PX}px` }} className="rounded-xl border border-divider bg-panel p-5 md:p-6">
            <ChapterHeader title="Gradient Fill" description="Gradient Fill uses the same flood-connected region rule as Fill, but colors it by blending from foreground at the drag start to background at the drag end." />
            <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-4 text-sm leading-7 text-text">
                <p>
                  Drag from the start point to define the gradient direction or radius. The tool previews the result live, then commits the whole region when you release.
                </p>
                <p>
                  <span className="text-ink">Linear</span> mode fades along the drag vector. <span className="text-ink">Radial</span> mode treats the drag length as a radius and blends outward from the start point.
                </p>
                <p>
                  Holding <span className="text-ink">Shift</span> snaps the drag to the nearest 45-degree angle, which is especially useful for linear ramps that need to align to sprite geometry.
                </p>
                <p>
                  Gradient Fill uses <span className="text-ink">foreground color</span> at the drag start and <span className="text-ink">background color</span> at the drag end. Changing either swatch changes the full preview immediately.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <InfoCard title="Linear variant" body="Best for directional shading, fades across walls or surfaces, and controlled ramps along one axis." />
                  <InfoCard title="Radial variant" body="Best for glows, rounded lighting, and centered falloff inside a closed region." />
                </div>
              </div>
              <div className="space-y-4">
                <IllustrationPanel title="Linear gradient preview" subtitle="Foreground starts at the anchor and fades toward background.">
                  <GradientFigure radial={false} />
                </IllustrationPanel>
                <IllustrationPanel title="Radial gradient preview" subtitle="Drag length defines the radial spread from the start point.">
                  <GradientFigure radial />
                </IllustrationPanel>
              </div>
            </div>
          </section>

          <section id="colorpicker" style={{ scrollMarginTop: `${HEADER_OFFSET_PX}px` }} className="rounded-xl border border-divider bg-panel p-5 md:p-6">
            <ChapterHeader title="Color Picker" description="The color picker samples the color of the clicked pixel and loads that value into the foreground swatch immediately." />
            <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-4 text-sm leading-7 text-text">
                <p>
                  Color Picker is a one-click sampling tool. Click a visible pixel and BEAST reads the sampled color from the canvas, then sets it as the new <span className="text-ink">foreground color</span>.
                </p>
                <p>
                  This is useful when you want to continue painting with a color that already exists in the sprite, rather than hunting for it in the palette or rebuilding it in the picker controls.
                </p>
                <p>
                  The tool is intentionally direct: it does not paint, create a stroke, or alter pixels on its own. It only updates the working color used by the next paint action.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <InfoCard title="Best use case" body="Reusing colors already present in the artwork without breaking drawing flow." />
                  <InfoCard title="What changes" body="Only the foreground swatch. Sampling does not alter the canvas or create history entries for paint edits." />
                </div>
              </div>
              <div className="space-y-4">
                <IllustrationPanel title="Sample then paint" subtitle="Color Picker updates the foreground swatch for whatever tool comes next.">
                  <ColorPickerFigure />
                </IllustrationPanel>
                <IllustrationPanel title="How to think about it" subtitle="Pick first, then continue with your active painting workflow.">
                  <div className="space-y-2 text-sm text-text">
                    <div className="rounded border border-accent-deep/35 bg-accent-deep/10 px-3 py-2 text-accent-soft">
                      Click an existing pixel to load that exact visible color.
                    </div>
                    <div className="rounded border border-edge bg-panel px-3 py-2">
                      The foreground swatch updates immediately for the next brush, line, fill, or gradient action.
                    </div>
                    <div className="rounded border border-edge bg-panel px-3 py-2">
                      No pixels change until you switch back to a paint-producing tool and draw.
                    </div>
                  </div>
                </IllustrationPanel>
              </div>
            </div>
          </section>

          <section id="layers" style={{ scrollMarginTop: `${HEADER_OFFSET_PX}px` }} className="rounded-xl border border-divider bg-panel p-5 md:p-6">
            <ChapterHeader title="Layers" description="Layers define the paint target and stacking order for each sprite. They let you separate artwork into editable planes without flattening everything into one buffer." />
            <div className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-4 text-sm leading-7 text-text">
                <p>
                  Selecting a layer makes it the active destination for all painting tools. The list is shown <span className="text-ink">top-of-stack first</span>, while the document model composites lower layers underneath higher ones.
                </p>
                <p>
                  Each row can be renamed, duplicated, reordered, deleted, or hidden. The eye control toggles visibility, and <span className="text-ink">Shift-clicking</span> an eye solos that layer by hiding the rest until restored.
                </p>
                <p>
                  The selected layer also exposes <span className="text-ink">blend mode</span> and <span className="text-ink">opacity</span>. Opacity changes are bracketed as one undoable action while you drag the slider.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <InfoCard title="Best use case" body="Separating line art, flats, shading, effects, and cleanup so they can be edited independently." />
                  <InfoCard title="What matters most" body="Which layer is selected, where it sits in the stack, whether it is visible, and how its opacity/blend affect the composite." />
                </div>
              </div>
              <div className="space-y-4">
                <IllustrationPanel title="Layer stack behavior" subtitle="Selection changes the paint target; order changes the final composite.">
                  <LayersFigure />
                </IllustrationPanel>
                <IllustrationPanel title="Visibility control" subtitle="Plain click toggles one layer; Shift-click solos it.">
                  <div className="space-y-2 text-sm text-text">
                    <div className="rounded border border-edge bg-panel px-3 py-2">
                      Click the eye to hide or show one layer.
                    </div>
                    <div className="rounded border border-accent-deep/35 bg-accent-deep/10 px-3 py-2 text-accent-soft">
                      Shift-click the eye to solo that layer and temporarily hide the others.
                    </div>
                    <div className="rounded border border-edge bg-panel px-3 py-2">
                      Reorder rows to move painted content above or below other layers in the sprite.
                    </div>
                  </div>
                </IllustrationPanel>
              </div>
            </div>
          </section>

          <section id="command-palette" style={{ scrollMarginTop: `${HEADER_OFFSET_PX}px` }} className="rounded-xl border border-divider bg-panel p-5 md:p-6">
            <ChapterHeader title="Command Palette" description="The command palette is the editor’s searchable action menu. It gives fast keyboard access to tools, document actions, view toggles, palette operations, and more." />
            <div className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-4 text-sm leading-7 text-text">
                <p>
                  Open the palette with <span className="text-ink">Cmd/Ctrl+P</span>. With an empty query it shows the top-level command list grouped by category, and grouped items can open submenus for related actions.
                </p>
                <p>
                  Typing switches the palette into a flat ranked search across commands, including submenu items. This means you can search directly for specific tool variants or actions without drilling into categories first.
                </p>
                <p>
                  Keyboard navigation is central to the workflow: <span className="text-ink">Up</span> and <span className="text-ink">Down</span> move the highlight, <span className="text-ink">Enter</span> runs the selected command, and <span className="text-ink">Right</span> opens a submenu when the highlighted row is a group.
                </p>
                <p>
                  Inside browse mode, <span className="text-ink">Left</span>, <span className="text-ink">Backspace</span>, or <span className="text-ink">Escape</span> backs out of a submenu. Escape at the root closes the palette entirely.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <InfoCard title="Best use case" body="Quickly jumping to tools or actions when you know the intent but do not want to hunt through UI panels." />
                  <InfoCard title="What makes it fast" body="Search flattens submenu commands, disabled items are skipped by keyboard navigation, and the last search is shown again when the palette reopens." />
                </div>
              </div>
              <div className="space-y-4">
                <IllustrationPanel title="Palette browse and search" subtitle="Grouped browsing on open, flat search as soon as you type.">
                  <CommandPaletteFigure />
                </IllustrationPanel>
                <IllustrationPanel title="Navigation model" subtitle="Designed to stay in the keyboard loop.">
                  <div className="space-y-2 text-sm text-text">
                    <div className="rounded border border-edge bg-panel px-3 py-2">
                      <span className="text-ink">Cmd/Ctrl+P</span> opens the palette.
                    </div>
                    <div className="rounded border border-edge bg-panel px-3 py-2">
                      <span className="text-ink">Up/Down</span> move the active row and skip disabled commands.
                    </div>
                    <div className="rounded border border-accent-deep/35 bg-accent-deep/10 px-3 py-2 text-accent-soft">
                      <span className="text-ink-soft">Right</span> drills into groups, and <span className="text-ink-soft">Left</span> or <span className="text-ink-soft">Escape</span> backs out.
                    </div>
                  </div>
                </IllustrationPanel>
              </div>
            </div>
          </section>

          <section id="more" style={{ scrollMarginTop: `${HEADER_OFFSET_PX}px` }} className="rounded-xl border border-dashed border-edge bg-panel p-5 md:p-6">
            <ChapterHeader title="More" description="This section is intentionally reserved for additional tool documentation as more parts of the editor are formalized." />
            <p className="mt-4 max-w-3xl text-sm leading-7 text-text">
              The page is structured around anchor chapters so new sections can be appended without changing the browsing pattern. Future additions should follow the same format: short practical explanation, one or two themed illustrations, and searchable text that slots into the existing index.
            </p>
          </section>
        </article>
      </main>
    </div>
  )
}

function ChapterHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold text-ink">{title}</h2>
        <a
          href="#top"
          className="text-xs font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:text-accent-soft"
        >
          ↑ Index
        </a>
      </div>
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

function FillRegionFigure() {
  const width = 14
  const height = 10
  const border = new Set<string>()
  const filled = new Set<string>()
  const accent = new Set<string>()

  for (let x = 1; x <= 12; x += 1) {
    border.add(`${x},1`)
    border.add(`${x},8`)
  }
  for (let y = 1; y <= 8; y += 1) {
    border.add(`1,${y}`)
    border.add(`12,${y}`)
  }
  border.delete('6,1')

  for (let x = 3; x <= 10; x += 1) {
    for (let y = 3; y <= 6; y += 1) {
      filled.add(`${x},${y}`)
    }
  }

  accent.add('5,4')

  return (
    <ColorGrid
      width={width}
      height={height}
      cells={(x, y) => {
        const key = `${x},${y}`
        if (border.has(key)) return 'var(--color-ink-soft)'
        if (filled.has(key)) return 'var(--color-accent-deep)'
        if (accent.has(key)) return 'var(--color-accent-bright)'
        return 'var(--color-well)'
      }}
    />
  )
}

function GradientFigure({ radial = false }: { radial?: boolean }) {
  const width = 14
  const height = 10
  const startX = 3
  const startY = 5
  const endX = 10
  const endY = radial ? 5 : 2

  return (
    <div className="space-y-3">
      <ColorGrid
        width={width}
        height={height}
        cells={(x, y) => {
          const t = radial
            ? clamp01(Math.hypot(x - startX, y - startY) / Math.max(1, Math.hypot(endX - startX, endY - startY)))
            : clamp01(projectLinearT(x, y, startX, startY, endX, endY))
          return mixHex('#fbbf24', '#0ea5e9', t)
        }}
        accentPoints={[[startX, startY], [endX, endY]]}
      />
      <div className="flex flex-wrap gap-2">
        <span className="rounded border border-edge bg-panel px-2.5 py-1 text-xs uppercase tracking-[0.12em] text-muted">
          FG at start
        </span>
        <span className="rounded border border-edge bg-panel px-2.5 py-1 text-xs uppercase tracking-[0.12em] text-muted">
          BG at end
        </span>
        {radial ? (
          <span className="rounded border border-accent-deep/35 bg-accent-deep/10 px-2.5 py-1 text-xs uppercase tracking-[0.12em] text-accent-soft">
            Radial spread
          </span>
        ) : (
          <span className="rounded border border-accent-deep/35 bg-accent-deep/10 px-2.5 py-1 text-xs uppercase tracking-[0.12em] text-accent-soft">
            Linear direction
          </span>
        )}
      </div>
    </div>
  )
}

function EraserFigure() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-edge bg-panel p-3">
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Erase to transparency</div>
        <div className="mt-3 flex justify-center">
          <ColorGrid
            width={10}
            height={8}
            cells={(x, y) => ((x + y) % 2 === 0 ? 'var(--color-checker-a)' : 'var(--color-checker-b)')}
            accentPoints={[[4, 3], [5, 3], [4, 4], [5, 4]]}
          />
        </div>
      </div>
      <div className="rounded-lg border border-edge bg-panel p-3">
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Erase to background</div>
        <div className="mt-3 flex justify-center">
          <ColorGrid
            width={10}
            height={8}
            cells={(x, y) => {
              const erased = x >= 4 && x <= 5 && y >= 3 && y <= 4
              return erased ? '#7dd3fc' : '#f59e0b'
            }}
          />
        </div>
      </div>
    </div>
  )
}

function ColorPickerFigure() {
  return (
    <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
      <div className="flex justify-center">
        <ColorGrid
          width={8}
          height={8}
          cells={(x, _y) => {
            if (x < 3) return '#f59e0b'
            if (x < 5) return '#7dd3fc'
            return '#34d399'
          }}
          accentPoints={[[4, 3]]}
        />
      </div>
      <div className="space-y-2 text-sm text-text">
        <div className="rounded border border-edge bg-panel px-3 py-2">
          Click the highlighted pixel with Color Picker.
        </div>
        <div className="rounded border border-accent-deep/35 bg-accent-deep/10 px-3 py-2 text-accent-soft">
          Foreground swatch updates to the sampled color.
        </div>
        <div className="rounded border border-edge bg-panel px-3 py-2">
          Switch back to a paint tool and continue drawing with that color.
        </div>
      </div>
    </div>
  )
}

function LayersFigure() {
  const rows = [
    { name: 'Highlights', color: '#fbbf24', active: true, visible: true, opacity: '100%' },
    { name: 'Line art', color: '#e2e8f0', active: false, visible: true, opacity: '100%' },
    { name: 'Base color', color: '#0ea5e9', active: false, visible: true, opacity: '80%' },
    { name: 'Shadow', color: '#1e293b', active: false, visible: false, opacity: '45%' },
  ]

  return (
    <div className="rounded-lg border border-edge bg-panel p-3">
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.name}
            className={
              'flex items-center gap-3 rounded border px-3 py-2 ' +
              (row.active ? 'border-accent-deep/50 bg-accent-deep/15' : 'border-edge bg-well/60')
            }
          >
            <span className={'text-sm ' + (row.visible ? 'text-ink-soft' : 'text-dim')}>{row.visible ? '◉' : '○'}</span>
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: row.color }} />
            <span className={'flex-1 text-sm ' + (row.active ? 'text-accent-soft' : 'text-ink-soft')}>{row.name}</span>
            <span className="text-[11px] text-faint">{row.opacity}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CommandPaletteFigure() {
  const rows: { kind: 'header' | 'active' | 'row'; label: string; right?: React.ReactNode; disabled?: boolean }[] = [
    { kind: 'header', label: 'Tools' },
    { kind: 'active', label: 'Tool: Line', right: <ChevronRight size={14} className="text-faint" /> },
    { kind: 'row', label: 'Tool: Fill', right: <span className="text-[11px] text-faint">G</span> },
    { kind: 'header', label: 'Layers' },
    { kind: 'row', label: 'Merge Visible' },
    { kind: 'row', label: 'Flatten Image', disabled: true },
  ]

  return (
    <div className="rounded-lg border border-divider bg-panel shadow-lg overflow-hidden">
      <div className="border-b border-divider bg-well px-3 py-2.5 text-sm text-ink-soft">
        line
      </div>
      <div className="py-1">
        <button className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-[11px] uppercase tracking-wide text-faint font-semibold hover:text-ink-soft">
          <ChevronLeft size={13} /> Tools
        </button>
        {rows.map((row, index) => {
          if (row.kind === 'header') {
            return (
              <div key={index} className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wide text-faint font-semibold">
                {row.label}
              </div>
            )
          }
          return (
            <div
              key={index}
              className={
                'flex items-center justify-between gap-3 px-3 py-1.5 text-sm ' +
                (row.kind === 'active' ? 'bg-surface-hover text-ink-soft' : row.disabled ? 'text-dim' : 'text-ink-soft')
              }
            >
              <span className="truncate">{row.label}</span>
              {row.right}
            </div>
          )
        })}
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

function ColorGrid({
  width,
  height,
  cells,
  accentPoints = [],
}: {
  width: number
  height: number
  cells: (x: number, y: number) => string
  accentPoints?: Point[]
}) {
  const accents = new Set(accentPoints.map(([x, y]) => `${x},${y}`))
  return (
    <div
      className="grid gap-px rounded border border-edge bg-edge p-2"
      style={{ gridTemplateColumns: `repeat(${width}, 12px)` }}
    >
      {Array.from({ length: width * height }, (_, index) => {
        const x = index % width
        const y = Math.floor(index / width)
        const key = `${x},${y}`
        const style = {
          width: 12,
          height: 12,
          background: cells(x, y),
          outline: accents.has(key) ? '1px solid var(--color-ink)' : undefined,
        } satisfies React.CSSProperties
        return <div key={key} style={style} />
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

function projectLinearT(x: number, y: number, x0: number, y0: number, x1: number, y1: number) {
  const dx = x1 - x0
  const dy = y1 - y0
  const denom = dx * dx + dy * dy
  if (denom === 0) return 0
  return ((x - x0) * dx + (y - y0) * dy) / denom
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

function mixHex(a: string, b: string, t: number) {
  const p = clamp01(t)
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return `rgb(${Math.round(ar + (br - ar) * p)} ${Math.round(ag + (bg - ag) * p)} ${Math.round(ab + (bb - ab) * p)})`
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '')
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ]
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
