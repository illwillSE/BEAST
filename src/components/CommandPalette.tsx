import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { commands, filterCommands, commandEnabled, matchParamCommand, paramCommandEnabled } from '../commands/registry.js'
import type { Command, CommandContext } from '../commands/registry.js'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  ctx: CommandContext
}

// Searchable command list opened with Cmd/Ctrl+P (see shortcuts/registry.ts).
// Three modes: browse (empty query) lists top-level commands, with grouped
// tools showing a › arrow that drills into a submenu (→ / click); typing
// switches to a flat, ranked search across every command (groups flattened to
// their options). ↑/↓ highlight, Enter runs / opens, ←/Esc backs out of a
// submenu (Esc at the root closes). Commands live in commands/registry.ts.
// On open, before anything is typed, the list shows the previous session's
// search results (if any) instead of the root browse list, so re-running a
// recent command is a single Enter away.
export default function CommandPalette({ open, onClose, ctx }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [submenu, setSubmenu] = useState<Command | null>(null)
  const [active, setActive] = useState(0)
  const [showingLast, setShowingLast] = useState(false)
  const lastQueryRef = useRef('')
  const inputRef = useRef<HTMLInputElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  const searching = query.trim() !== ''
  const paramMatch = searching ? matchParamCommand(query) : null
  // Search flattens everything; otherwise show the last search's results (if
  // the palette was just opened and nothing has been typed yet), the open
  // submenu's children, or the top-level browse list.
  const items = useMemo<Command[]>(
    () => (searching ? (paramMatch ? [paramMatch.cmd] : filterCommands(query)) : showingLast ? filterCommands(lastQueryRef.current) : submenu ? submenu.submenu ?? [] : commands),
    [searching, paramMatch, query, showingLast, submenu],
  )

  // Reset to a clean root browse each time the palette opens, showing the
  // last search's results until the user types or clears them.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setSubmenu(null)
    setActive(0)
    setShowingLast(lastQueryRef.current.trim() !== '')
    inputRef.current?.focus()
  }, [open])

  // Keep the highlight in range as the shown list changes.
  useEffect(() => { setActive((a) => Math.min(a, Math.max(0, items.length - 1))) }, [items])

  // Keep the highlighted row scrolled into view.
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest' }) }, [active])

  if (!open) return null

  const openSubmenu = (cmd: Command) => { setSubmenu(cmd); setActive(0) }
  const back = () => { setSubmenu(null); setActive(0) }

  // Run a leaf, or drill into a group.
  const activate = (cmd: Command) => {
    if (cmd.submenu) { openSubmenu(cmd); return }
    if (cmd.param) {
      if (!paramMatch || cmd.id !== paramMatch.cmd.id) return
      if (!paramCommandEnabled(cmd, paramMatch.arg, ctx)) return
      cmd.param.run(paramMatch.arg, ctx)
      onClose()
      return
    }
    if (!commandEnabled(cmd, ctx)) return
    cmd.run(ctx)
    onClose()
  }

  // An item is selectable unless its command is disabled in the current context.
  const isEnabled = (cmd: Command) => {
    const isParam = !!cmd.param && cmd.id === paramMatch?.cmd.id
    return isParam ? paramCommandEnabled(cmd, paramMatch!.arg, ctx) : commandEnabled(cmd, ctx)
  }
  // Step from `from` in `dir` (±1), wrapping, landing on the next enabled item.
  const nextEnabled = (from: number, dir: number) => {
    for (let i = 1; i <= items.length; i++) {
      const idx = (from + dir * i + items.length * i) % items.length
      if (isEnabled(items[idx])) return idx
    }
    return from
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) setActive((a) => nextEnabled(a, 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) setActive((a) => nextEnabled(a, -1)) }
    else if (e.key === 'ArrowRight') { const cmd = items[active]; if (cmd?.submenu) { e.preventDefault(); openSubmenu(cmd) } }
    else if (e.key === 'ArrowLeft') { if (submenu && !searching) { e.preventDefault(); back() } }
    else if (e.key === 'Enter') { e.preventDefault(); const cmd = items[active]; if (cmd) activate(cmd) }
    else if (e.key === 'Backspace') { if (submenu && !searching) { e.preventDefault(); back() } }
    else if (e.key === 'Escape') { e.preventDefault(); if (submenu && !searching) back(); else onClose() }
  }

  const showHeaders = !submenu // category headers in root + search, breadcrumb in submenu

  return (
    <div
      className="fixed inset-0 bg-black/50 grid place-items-start justify-center pt-[12vh] z-50"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-[32rem] max-w-[92vw] bg-panel border border-divider rounded-lg shadow-xl overflow-hidden"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            const v = e.target.value
            setQuery(v)
            setActive(0)
            setShowingLast(false)
            if (v.trim() !== '') lastQueryRef.current = v
          }}
          onKeyDown={onKeyDown}
          placeholder="Type a command…"
          className="w-full bg-well text-sm text-ink-soft px-3 py-2.5 border-b border-divider outline-none placeholder:text-faint"
        />

        <div className="max-h-[50vh] overflow-y-auto py-1">
          {submenu && (
            <button
              onClick={back}
              className="w-full flex items-center gap-1 px-2 py-1.5 text-left text-[11px] uppercase tracking-wide text-faint font-semibold hover:text-ink-soft"
            >
              <ChevronLeft size={13} /> {submenu.title}
            </button>
          )}

          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-faint">No matching commands</div>
          )}

          {items.map((cmd, i) => {
            const isParam = !!cmd.param && cmd.id === paramMatch?.cmd.id
            const enabled = isParam ? paramCommandEnabled(cmd, paramMatch!.arg, ctx) : commandEnabled(cmd, ctx)
            const label = isParam ? cmd.param!.preview(paramMatch!.arg, ctx) : cmd.title
            const isActive = i === active
            const prevCat = items[i - 1]?.category
            return (
              <div key={cmd.id}>
                {showHeaders && cmd.category !== prevCat && (
                  <div className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wide text-faint font-semibold">
                    {cmd.category}
                  </div>
                )}
                <button
                  ref={isActive ? activeRef : undefined}
                  disabled={!enabled}
                  onMouseMove={() => setActive(i)}
                  onClick={() => activate(cmd)}
                  className={
                    'w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left text-sm ' +
                    (isActive ? 'bg-surface-hover ' : '') +
                    (enabled ? 'text-ink-soft' : 'text-dim cursor-default')
                  }
                >
                  <span className="truncate">{label}</span>
                  {cmd.submenu
                    ? <ChevronRight size={15} className="shrink-0 text-faint" />
                    : cmd.shortcut && <span className="shrink-0 text-[11px] text-faint tabular-nums">{cmd.shortcut}</span>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
