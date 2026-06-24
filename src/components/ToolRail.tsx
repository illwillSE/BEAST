import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Pencil, Eraser, PaintBucket, Pipette, Minus, Square, Circle,
  BoxSelect, Move, FlipHorizontal, FlipVertical, Crop,
  createLucideIcon,
} from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import { forwardRef } from 'react'
import { tools } from '../tools/registry.js'

type Icon = typeof Pencil

// Gradient variant icons: a swatch fading via opacity (not color, so it still
// reads correctly in any theme) — linear fades corner-to-corner, radial fades
// from a center point outward. Two overlapping circles (lucide's Blend) read
// as "blend modes", not "gradient", hence the custom icons.
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
        <linearGradient id="beast-gradient-linear" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={color} stopOpacity="0" />
          <stop offset="1" stopColor={color} stopOpacity="1" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="2" fill="url(#beast-gradient-linear)" />
    </svg>
  ),
)

const GradientRadial: Icon = forwardRef<SVGSVGElement, LucideProps>(
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
        <radialGradient id="beast-gradient-radial" cx="0.35" cy="0.35" r="0.75">
          <stop offset="0" stopColor={color} stopOpacity="1" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="2" fill="url(#beast-gradient-radial)" />
    </svg>
  ),
)

const GRADIENT_VARIANT_ICONS: Record<string, Icon> = { false: GradientLinear, true: GradientRadial }

// Continuous-line variant icon: a 3-segment polyline standing in for "click
// to chain segments" — left leg tilts slightly (top right of its bottom end),
// the base tilts slightly downward left-to-right, the right leg stays vertical.
const ContinuousLine: Icon = createLucideIcon('ContinuousLine', [
  ['path', { d: 'M7 4 L5 17 L17 20 L17 6', key: 'continuous-line' }],
])

const LINE_VARIANT_ICONS: Record<string, Icon> = { false: Minus, true: ContinuousLine }

// Tools whose variants get their own icon (vs. plain text in the flyout).
const VARIANT_ICONS: Record<string, Record<string, Icon>> = {
  line: LINE_VARIANT_ICONS,
  gradient: GRADIENT_VARIANT_ICONS,
}

// Both mirror axes on: FlipHorizontal's and FlipVertical's paths superimposed
// (brackets on all four sides, dashed cross through the center) rather than
// an unrelated glyph like a plain plus sign.
const FlipBoth: Icon = createLucideIcon('FlipBoth', [
  ['path', { d: 'M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3', key: 'fb1' }],
  ['path', { d: 'M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3', key: 'fb2' }],
  ['path', { d: 'M12 20v2', key: 'fb3' }],
  ['path', { d: 'M12 14v2', key: 'fb4' }],
  ['path', { d: 'M12 8v2', key: 'fb5' }],
  ['path', { d: 'M12 2v2', key: 'fb6' }],
  ['path', { d: 'M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3', key: 'fb7' }],
  ['path', { d: 'M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3', key: 'fb8' }],
  ['path', { d: 'M4 12H2', key: 'fb9' }],
  ['path', { d: 'M10 12H8', key: 'fb10' }],
  ['path', { d: 'M16 12h-2', key: 'fb11' }],
  ['path', { d: 'M22 12h-2', key: 'fb12' }],
])

interface ToolEntry {
  id: string
  label: string
  Icon: Icon
  sub?: ToolEntry[]
}

// v1 tool set, rendered from a static list (see src/tools/registry.js for the
// behavior side of each entry, including each tool's shortcut `key`). Mirror
// is a toggle layered on other tools rather than its own tool, so it lives
// outside this list.
const TOOLS: (ToolEntry | null)[] = [
  { id: 'pencil', label: 'Pencil', Icon: Pencil },
  { id: 'eraser', label: 'Eraser', Icon: Eraser },
  { id: 'fill', label: 'Fill', Icon: PaintBucket },
  { id: 'gradient', label: 'Gradient', Icon: GradientLinear },
  { id: 'eyedropper', label: 'Eyedropper', Icon: Pipette },
  null, // divider
  { id: 'line', label: 'Line', Icon: Minus },
  { id: 'rect', label: 'Rectangle', Icon: Square },
  { id: 'ellipse', label: 'Ellipse', Icon: Circle },
  null,
  {
    id: 'select', label: 'Select', Icon: BoxSelect,
    sub: [
      { id: 'select', label: 'Select', Icon: BoxSelect },
      { id: 'crop', label: 'Crop', Icon: Crop },
    ],
  },
  { id: 'move', label: 'Move', Icon: Move },
]

// Which flyout group (if any) a tool id belongs to — a sub-group's id for
// select/crop, or its own id for a variant tool like rect/ellipse.
function groupForTool(id: string): string | null {
  for (const t of TOOLS) {
    if (!t) continue
    if (t.sub) {
      if (t.sub.some((s) => s.id === id)) return t.id
    } else if (t.id === id && tools[t.id].variants) {
      return t.id
    }
  }
  return null
}

interface RailButtonProps {
  title: string
  Icon: Icon
  active: boolean
  onClick: () => void
  activeClass?: string
  filled?: boolean
}

// A single rail icon — used standalone and as the trigger for a Flyout.
function RailButton({ title, Icon, active, onClick, activeClass = 'bg-accent-deep/20 border-accent-deep text-accent-bright', filled }: RailButtonProps) {
  return (
    <button
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={
        'grid place-items-center w-8 h-8 rounded border ' +
        (active ? activeClass : 'border-transparent text-muted hover:text-ink hover:bg-surface-hover')
      }
    >
      <Icon size={16} fill={filled ? 'currentColor' : 'none'} />
    </button>
  )
}

interface FlyoutItem {
  id: string
  label: string
  Icon?: Icon
  active: boolean
  onClick: () => void
  divider?: boolean
}

interface FlyoutProps {
  items: FlyoutItem[]
  activeClass?: string
}

// Shared popout for every tool with sub-options (rect/ellipse fill style,
// brush width, select/crop, mirror axes). Each item supplies its own
// onClick, so the caller decides what selecting it does — including
// collapsing the flyout. A `divider` item renders a separator instead of a
// button, for grouping unrelated option sets (e.g. fill style vs. width).
function Flyout({ items, activeClass = 'bg-accent-deep/20 text-accent-bright' }: FlyoutProps) {
  return (
    <div className="absolute left-full top-0 ml-0.5 z-10 flex flex-col gap-px p-0.5 bg-panel border border-divider rounded shadow-lg">
      {items.map((it) =>
        it.divider ? (
          <div key={it.id} className="h-px mx-1 my-0.5 bg-divider" />
        ) : (
          <button
            key={it.id}
            onClick={it.onClick}
            className={
              'flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] whitespace-nowrap text-left ' +
              (it.active ? activeClass : 'text-muted hover:text-ink hover:bg-surface-hover')
            }
          >
            {it.Icon && <it.Icon size={13} />}
            {it.label}
          </button>
        )
      )}
    </div>
  )
}

interface ToolRailProps {
  active: string
  onPick: (id: string) => void
  filled: Record<string, boolean>
  onFilled: (id: string, value: boolean) => void
  peek: { id: string; token: number } | null
  mirrorV: boolean
  mirrorH: boolean
  onMirrorV: () => void
  onMirrorH: () => void
}

const PEEK_DURATION_MS = 1500

export default function ToolRail({ active, onPick, filled, onFilled, peek, mirrorV, mirrorH, onMirrorV, onMirrorH }: ToolRailProps): ReactNode {
  // Which tool's flyout (if any) is popped out. Picking an item from a flyout
  // collapses it; clicking the rail icon again pops it back out.
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  // Cycling a tool's variants via its keyboard shortcut (no click involved)
  // pops its flyout open too, so the newly-selected option is visible — then
  // auto-closes after a pause. Keyed off `peek.token` rather than just
  // `peek.id` so repeat presses of the same tool's key keep restarting the
  // timer instead of being a no-op render.
  useEffect(() => {
    if (!peek) return
    setOpenGroup(peek.id)
    const t = window.setTimeout(() => setOpenGroup((g) => (g === peek.id ? null : g)), PEEK_DURATION_MS)
    return () => window.clearTimeout(t)
  }, [peek])
  const toggleGroup = (id: string) => setOpenGroup((g) => (g === id ? null : id))

  // A shortcut key can switch the active tool out from under an open
  // variant/sub flyout (e.g. circle's Outline/Filled popout) without ever
  // touching the rail — close it then. Mirror's flyout isn't tied to `active`
  // (it has no tool of its own), so it's left alone here.
  useEffect(() => {
    setOpenGroup((g) => (g === null || g === 'mirror' || g === groupForTool(active) ? g : null))
  }, [active])

  return (
    <div data-eyedropper-owner className="flex flex-col items-center gap-0.5 p-1.5 bg-panel border-r border-divider shrink-0">
      {TOOLS.map((t, i) => {
        if (t === null) return <div key={`d${i}`} className="h-px w-6 bg-divider my-0.5" />

        if (t.sub) {
          const activeSub = t.sub.find((s) => s.id === active)
          const shown = activeSub ?? t.sub[0]
          const shownKey = tools[shown.id].key
          return (
            <div key={t.id} className="relative">
              <RailButton
                title={shownKey ? `${shown.label} (${shownKey.toUpperCase()})` : shown.label}
                Icon={shown.Icon}
                active={!!activeSub}
                onClick={() => { onPick(shown.id); toggleGroup(t.id) }}
              />
              {openGroup === t.id && (
                <Flyout
                  items={t.sub.map((s) => ({
                    id: s.id,
                    label: s.label,
                    Icon: s.Icon,
                    active: active === s.id,
                    onClick: () => { onPick(s.id); setOpenGroup(null) },
                  }))}
                />
              )}
            </div>
          )
        }

        const variants = tools[t.id].variants
        if (variants) {
          const key = tools[t.id].key
          const variantIcons = VARIANT_ICONS[t.id]
          const items: FlyoutItem[] = variants.map(([label, val]) => ({
            id: `v:${val}`,
            label,
            Icon: variantIcons?.[String(val)],
            active: (filled[t.id] ?? false) === val,
            onClick: () => { onFilled(t.id, val); setOpenGroup(null) },
          }))
          return (
            <div key={t.id} className="relative">
              <RailButton
                title={key ? `${t.label} (${key.toUpperCase()})` : t.label}
                Icon={variantIcons?.[String(filled[t.id] ?? false)] ?? t.Icon}
                active={active === t.id}
                filled={variantIcons ? false : filled[t.id] ?? false}
                onClick={() => { onPick(t.id); toggleGroup(t.id) }}
              />
              {openGroup === t.id && <Flyout items={items} />}
            </div>
          )
        }

        const plainKey = tools[t.id].key
        return (
          <div key={t.id} className="relative">
            <RailButton
              title={plainKey ? `${t.label} (${plainKey.toUpperCase()})` : t.label}
              Icon={t.Icon}
              active={active === t.id}
              onClick={() => { onPick(t.id); setOpenGroup(null) }}
            />
          </div>
        )
      })}

      <div className="h-px w-6 bg-divider my-0.5" />
      <div className="relative">
        <RailButton
          title="Mirror"
          Icon={mirrorV && mirrorH ? FlipBoth : mirrorH ? FlipVertical : FlipHorizontal}
          active={mirrorV || mirrorH}
          activeClass="bg-on/20 border-on text-on-bright"
          onClick={() => toggleGroup('mirror')}
        />
        {openGroup === 'mirror' && (
          <Flyout
            activeClass="bg-on/20 text-on-bright"
            items={[
              { id: 'v', label: 'Vertical axis', Icon: FlipHorizontal, active: mirrorV, onClick: () => { onMirrorV(); setOpenGroup(null) } },
              { id: 'h', label: 'Horizontal axis', Icon: FlipVertical, active: mirrorH, onClick: () => { onMirrorH(); setOpenGroup(null) } },
            ]}
          />
        )}
      </div>
    </div>
  )
}
