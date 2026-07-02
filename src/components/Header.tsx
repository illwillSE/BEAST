import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Undo2, Redo2, FolderOpen, Save, ImageUp, Download, Settings, ScanEye, LayoutGrid, FilePlus, BookOpen } from 'lucide-react'

interface HeaderProps {
  projectName: string
  onRenameProject: (name: string) => void
  onNewProject: () => void
  onSave: () => void
  onOpen: (file: File) => void
  onImportPng: (file: File) => void
  onImportTileset: (file: File) => void
  onExportPng: () => void
  onExportFramesZip: () => void
  onExportSpriteSheet: () => void
  onExportTileset: () => void
  previewOpen: boolean
  onTogglePreview: () => void
  tilemapOpen: boolean
  onToggleTilemap: () => void
  onOpenSettings: () => void
}

// Top chrome: brand, project name, undo/redo, open/save/import/export. Save,
// Open, Import PNG, Export (PNG / frames ZIP / sprite sheet), and Settings are
// wired; undo/redo are still placeholders.
export default function Header({ projectName, onRenameProject, onNewProject, onSave, onOpen, onImportPng, onImportTileset, onExportPng, onExportFramesZip, onExportSpriteSheet, onExportTileset, previewOpen, onTogglePreview, tilemapOpen, onToggleTilemap, onOpenSettings }: HeaderProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const pngFileRef = useRef<HTMLInputElement>(null)
  const tilesetFileRef = useRef<HTMLInputElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const [importOpen, setImportOpen] = useState(false)
  const importRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [exportOpen])

  useEffect(() => {
    if (!importOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (importRef.current && !importRef.current.contains(e.target as Node)) setImportOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [importOpen])

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-opening the same file
    if (file) onOpen(file)
  }

  const pickPng = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (file) onImportPng(file)
  }

  const pickTileset = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (file) onImportTileset(file)
  }

  return (
    <header className="flex items-center gap-3 px-3 h-12 bg-panel border-b border-divider shrink-0">
      <div className="flex items-baseline gap-2 select-none">
        <span className="inline-block origin-left text-lg font-black tracking-[0.2em] text-accent transition-transform duration-200 hover:scale-110 hover:text-accent-bright">BEAST</span>
        <span className="hidden text-[10px] uppercase tracking-[0.05em] text-faint md:block">
          {[['B', 'ig'], ['E', 'xtreme'], ['A', 'wesome'], ['S', 'prite'], ['T', 'ool']].map(([first, rest]) => (
            <span key={first}>
              <span className="text-[13px] font-bold text-yellow-400">{first}</span><span className="text-zinc-400">{rest}</span>{' '}
            </span>
          ))}
        </span>
      </div>

      <div className="h-5 w-px bg-divider mx-1" />

      <input
        value={projectName}
        onChange={(e) => onRenameProject(e.target.value)}
        spellCheck={false}
        className="min-w-0 max-w-40 rounded border border-transparent bg-transparent px-2 py-1 text-sm text-ink-soft outline-none transition-colors hover:border-edge focus:border-accent-deep/50 focus:bg-well"
      />
      <IconBtn title="New project" onClick={onNewProject}><FilePlus size={16} /></IconBtn>

      <div className="flex items-center gap-1 ml-2">
        <IconBtn title="Undo"><Undo2 size={16} /></IconBtn>
        <IconBtn title="Redo"><Redo2 size={16} /></IconBtn>
        <IconBtn title="Real Preview" active={previewOpen} onClick={onTogglePreview}>
          <ScanEye size={16} />
        </IconBtn>
        <IconBtn title="Tilemap" active={tilemapOpen} onClick={onToggleTilemap}>
          <LayoutGrid size={16} />
        </IconBtn>
      </div>

      <div className="flex-1" />

      <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={pickFile} />
      <button
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm bg-surface hover:bg-surface-hover text-ink-soft"
      >
        <FolderOpen size={15} /> Open
      </button>
      <button
        onClick={onSave}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm bg-surface hover:bg-surface-hover text-ink-soft"
      >
        <Save size={15} /> Save
      </button>
      <a
        href="./docs.html"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm bg-surface hover:bg-surface-hover text-ink-soft"
      >
        <BookOpen size={15} /> Docs
      </a>
      <input ref={pngFileRef} type="file" accept="image/png" className="hidden" onChange={pickPng} />
      <input ref={tilesetFileRef} type="file" accept="image/png" className="hidden" onChange={pickTileset} />
      <div ref={importRef} className="relative">
        <button
          onClick={() => setImportOpen((o) => !o)}
          title="Import"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm bg-surface hover:bg-surface-hover text-ink-soft"
        >
          <ImageUp size={15} /> Import
        </button>
        {importOpen && (
          <div className="absolute top-full right-0 mt-1 z-20 w-56 p-1 bg-panel border border-divider rounded shadow-lg flex flex-col">
            <button
              onClick={() => { setImportOpen(false); pngFileRef.current?.click() }}
              className="text-left px-2.5 py-1.5 rounded text-sm text-ink-soft hover:bg-surface-hover"
            >
              PNG as Sprite
            </button>
            <button
              onClick={() => { setImportOpen(false); tilesetFileRef.current?.click() }}
              className="text-left px-2.5 py-1.5 rounded text-sm text-ink-soft hover:bg-surface-hover"
            >
              Tileset (slice into sprites)…
            </button>
          </div>
        )}
      </div>
      <div ref={exportRef} className="relative">
        <button
          onClick={() => setExportOpen((o) => !o)}
          title="Export"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm bg-accent-deep/15 hover:bg-accent-deep/25 text-accent-bright border border-accent-deep/40"
        >
          <Download size={15} /> Export
        </button>
        {exportOpen && (
          <div className="absolute top-full right-0 mt-1 z-20 w-56 p-1 bg-panel border border-divider rounded shadow-lg flex flex-col">
            <button
              onClick={() => { setExportOpen(false); onExportPng() }}
              className="text-left px-2.5 py-1.5 rounded text-sm text-ink-soft hover:bg-surface-hover"
            >
              PNG (current frame)
            </button>
            <button
              onClick={() => { setExportOpen(false); onExportFramesZip() }}
              className="text-left px-2.5 py-1.5 rounded text-sm text-ink-soft hover:bg-surface-hover"
            >
              Frames as ZIP
            </button>
            <button
              onClick={() => { setExportOpen(false); onExportSpriteSheet() }}
              className="text-left px-2.5 py-1.5 rounded text-sm text-ink-soft hover:bg-surface-hover"
            >
              Sprite Sheet (all frames)
            </button>
            <button
              onClick={() => { setExportOpen(false); onExportTileset() }}
              className="text-left px-2.5 py-1.5 rounded text-sm text-ink-soft hover:bg-surface-hover"
            >
              Tileset (all sprites)
            </button>
          </div>
        )}
      </div>
      <IconBtn title="Settings" onClick={onOpenSettings}><Settings size={16} /></IconBtn>
    </header>
  )
}

interface IconBtnProps {
  title: string
  active?: boolean
  onClick?: () => void
  children: ReactNode
}

function IconBtn({ title, active, onClick, children }: IconBtnProps) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`grid place-items-center w-8 h-8 rounded hover:bg-surface-hover ${
        active ? 'text-accent-bright' : 'text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
