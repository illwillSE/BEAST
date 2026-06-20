import { useRef } from 'react'
import { Undo2, Redo2, FolderOpen, Save, Download, Settings, ChevronDown } from 'lucide-react'

// Top chrome: brand, current sprite name, undo/redo, open/save/export. Save and
// Open are wired (ZIP project); undo/redo/export/settings are still placeholders.
export default function Header({ projectName, onSave, onOpen }) {
  const fileRef = useRef(null)

  const pickFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-opening the same file
    if (file) onOpen(file)
  }

  return (
    <header className="flex items-center gap-3 px-3 h-12 bg-panel border-b border-divider shrink-0">
      <div className="flex items-baseline gap-2 select-none">
        <span className="text-accent font-extrabold tracking-tight text-lg">BEAST</span>
        <span className="text-faint text-[11px] hidden sm:inline">pixel &amp; sprite editor</span>
      </div>

      <div className="h-5 w-px bg-divider mx-1" />

      <button className="flex items-center gap-1.5 px-2 py-1 rounded text-sm text-ink-soft hover:bg-surface-hover">
        <span className="font-medium">{projectName}</span>
        <ChevronDown size={14} className="text-faint" />
      </button>

      <div className="flex items-center gap-1 ml-2">
        <IconBtn title="Undo"><Undo2 size={16} /></IconBtn>
        <IconBtn title="Redo"><Redo2 size={16} /></IconBtn>
      </div>

      <div className="flex-1" />

      <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={pickFile} />
      <button
        onClick={() => fileRef.current.click()}
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
      <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm bg-accent-deep/15 hover:bg-accent-deep/25 text-accent-bright border border-accent-deep/40">
        <Download size={15} /> Export
      </button>
      <IconBtn title="Settings"><Settings size={16} /></IconBtn>
    </header>
  )
}

function IconBtn({ title, children }) {
  return (
    <button
      title={title}
      className="grid place-items-center w-8 h-8 rounded text-muted hover:text-ink hover:bg-surface-hover"
    >
      {children}
    </button>
  )
}
