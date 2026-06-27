import { useEffect, useState } from 'react'

interface Props {
  tick: { verb: 'undo' | 'redo'; label: string; seq: number } | null
}

export function UndoToast({ tick }: Props) {
  const [content, setContent] = useState<{ verb: 'undo' | 'redo'; label: string } | null>(null)

  useEffect(() => {
    if (!tick) return
    setContent({ verb: tick.verb, label: tick.label })
    const t = setTimeout(() => setContent(null), 1400)
    return () => clearTimeout(t)
  }, [tick?.seq])

  if (!content) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 pointer-events-none z-50">
      <div className="bg-slate-800/90 text-slate-300 text-xs px-3 py-1.5 rounded-full border border-slate-700/50 select-none whitespace-nowrap">
        <span className="text-amber-400">{content.verb === 'undo' ? '↩' : '↪'}</span>
        {' '}
        <span className="capitalize">{content.verb}</span>
        {' · '}
        {content.label}
      </div>
    </div>
  )
}
