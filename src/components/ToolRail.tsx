import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Pencil, Eraser, PaintBucket, Pipette, Minus, Square, Circle,
  BoxSelect, Move, FlipHorizontal, FlipVertical, Blend, Crop,
} from 'lucide-react'
import { tools } from '../tools/registry.js'

type Icon = typeof Pencil

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
  { id: 'gradient', label: 'Gradient', Icon: Blend },
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
        'grid place-items-center w-10 h-10 rounded border ' +
        (active ? activeClass : 'border-transparent text-muted hover:text-ink hover:bg-surface-hover')
      }
    >
      <Icon size={18} fill={filled ? 'currentColor' : 'none'} />
    </button>
  )
}

interface FlyoutItem {
  id: string
  label: string
  Icon?: Icon
  active: boolean
  onClick: () => void
}

interface FlyoutProps {
  items: FlyoutItem[]
  activeClass?: string
}

// Shared popout for every tool with sub-options (rect/ellipse fill style,
// select/crop, mirror axes). Each item supplies its own onClick, so the
// caller decides what selecting it does — including collapsing the flyout.
function Flyout({ items, activeClass = 'bg-accent-deep/20 text-accent-bright' }: FlyoutProps) {
  return (
    <div className="absolute left-full top-0 ml-1 z-10 flex flex-col gap-0.5 p-1 bg-panel border border-divider rounded shadow-lg">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={it.onClick}
          className={
            'flex items-center gap-1.5 px-2 py-1 rounded text-[11px] whitespace-nowrap text-left ' +
            (it.active ? activeClass : 'text-muted hover:text-ink hover:bg-surface-hover')
          }
        >
          {it.Icon && <it.Icon size={13} />}
          {it.label}
        </button>
      ))}
    </div>
  )
}

interface ToolRailProps {
  active: string
  onPick: (id: string) => void
  filled: Record<string, boolean>
  onFilled: (id: string, value: boolean) => void
  mirrorV: boolean
  mirrorH: boolean
  onMirrorV: () => void
  onMirrorH: () => void
}

export default function ToolRail({ active, onPick, filled, onFilled, mirrorV, mirrorH, onMirrorV, onMirrorH }: ToolRailProps): ReactNode {
  // Which tool's flyout (if any) is popped out. Picking an item from a flyout
  // collapses it; clicking the rail icon again pops it back out.
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const toggleGroup = (id: string) => setOpenGroup((g) => (g === id ? null : id))

  // A shortcut key can switch the active tool out from under an open
  // variant/sub flyout (e.g. circle's Outline/Filled popout) without ever
  // touching the rail — close it then. Mirror's flyout isn't tied to `active`
  // (it has no tool of its own), so it's left alone here.
  useEffect(() => {
    setOpenGroup((g) => (g === null || g === 'mirror' || g === groupForTool(active) ? g : null))
  }, [active])

  return (
    <div data-eyedropper-owner className="flex flex-col items-center gap-1 p-2 bg-panel border-r border-divider shrink-0">
      {TOOLS.map((t, i) => {
        if (t === null) return <div key={`d${i}`} className="h-px w-7 bg-divider my-1" />

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
          return (
            <div key={t.id} className="relative">
              <RailButton
                title={key ? `${t.label} (${key.toUpperCase()})` : t.label}
                Icon={t.Icon}
                active={active === t.id}
                filled={filled[t.id] ?? false}
                onClick={() => { onPick(t.id); toggleGroup(t.id) }}
              />
              {openGroup === t.id && (
                <Flyout
                  items={variants.map(([label, val]) => ({
                    id: String(val),
                    label,
                    active: (filled[t.id] ?? false) === val,
                    onClick: () => { onFilled(t.id, val); setOpenGroup(null) },
                  }))}
                />
              )}
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

      <div className="h-px w-7 bg-divider my-1" />
      <div className="relative">
        <RailButton
          title="Mirror"
          Icon={FlipHorizontal}
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
