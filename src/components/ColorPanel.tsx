import { useEffect, useRef, useState } from 'react'
import { Plus, ChevronDown, ChevronRight, ArrowLeftRight, Trash2, ImagePlus, FolderInput } from 'lucide-react'
import PinToggle from './PinToggle.jsx'
import { hexToRgba, rgbaToHex } from '../document/model.js'
import { useEyedropperSampler } from '../hooks/eyedropperSamplers.js'

// Color: a managed swatch palette + a free RGBA picker (HSV square, hue/alpha
// sliders, numeric RGBA fields, hex field) for mixing any color and adding it
// to the palette.

interface Hsva {
  h: number // 0–360
  s: number // 0–1
  v: number // 0–1
  a: number // 0–255
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max === 0 ? 0 : d / max, max]
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

function hexToHsva(hex: string): Hsva {
  const [r, g, b, a] = hexToRgba(hex)
  const [h, s, v] = rgbToHsv(r, g, b)
  return { h, s, v, a }
}

function hsvaToHex({ h, s, v, a }: Hsva): string {
  const [r, g, b] = hsvToRgb(h, s, v)
  return rgbaToHex([r, g, b, a])
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)))

// Fraction of `clientX/Y` along `el`'s bounding box, clamped to [0, 1].
function fractionAt(el: HTMLElement, clientX: number, clientY: number) {
  const rect = el.getBoundingClientRect()
  return { x: clamp01((clientX - rect.left) / rect.width), y: clamp01((clientY - rect.top) / rect.height) }
}

interface ColorPanelProps {
  fgColor: string
  bgColor: string
  onFgColor: (color: string) => void
  onBgColor: (color: string) => void
  onSwap: () => void
  palette: string[]
  onAddSwatch: (hex: string) => void
  onRemoveSwatch: (index: number) => void
  onEditSwatch: (index: number, hex: string) => void
  onReorderSwatch: (from: number, to: number) => void
  onImportImage: (file: File) => void
  onImportProjectPalette: (file: File) => void
  pinned: boolean
  onTogglePin: () => void
  onPeekSelect?: () => void
  gradientOpen: boolean
  onToggleGradient: () => void
}

// The picker/palette below always edits one "active" slot — fg or bg,
// switched by clicking either swatch — so the rest of this component's
// logic (HSV derivation, hex field, palette highlight) stays keyed off a
// single `color`/`onColor` pair, same as before the fg/bg split.
export default function ColorPanel({
  fgColor, bgColor, onFgColor, onBgColor, onSwap, palette, onAddSwatch, onRemoveSwatch, onEditSwatch,
  onReorderSwatch, onImportImage, onImportProjectPalette, pinned, onTogglePin, onPeekSelect,
  gradientOpen, onToggleGradient,
}: ColorPanelProps) {
  const [activeSlot, setActiveSlot] = useState<'fg' | 'bg'>('fg')
  const color = activeSlot === 'fg' ? fgColor : bgColor
  const onColor = activeSlot === 'fg' ? onFgColor : onBgColor
  const [hsva, setHsva] = useState(() => hexToHsva(color))
  const lastEmitted = useRef(color)

  // Re-derive from `color` only when it changed from outside this picker
  // (palette click, eyedropper) — not from our own emit, which would
  // otherwise snap hue/saturation back whenever v=0 or s=0 (e.g. black/white).
  useEffect(() => {
    if (color !== lastEmitted.current) setHsva(hexToHsva(color))
  }, [color])

  const emit = (next: Hsva) => {
    setHsva(next)
    const hex = hsvaToHex(next)
    lastEmitted.current = hex
    onColor(hex)
  }

  const [r, g, b] = hsvToRgb(hsva.h, hsva.s, hsva.v)
  const hueRgb = hsvToRgb(hsva.h, 1, 1)
  const opaqueHex = rgbaToHex([r, g, b, 255])

  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const alphaRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<'sv' | 'hue' | 'alpha' | null>(null)

  // Same math as applyDrag below, so the eyedropper picks exactly the color
  // that clicking/dragging at that spot would set.
  useEyedropperSampler(svRef, (clientX, clientY) => {
    const { x, y } = fractionAt(svRef.current!, clientX, clientY)
    const [sr, sg, sb] = hsvToRgb(hsva.h, x, 1 - y)
    return [sr, sg, sb, 255]
  })
  useEyedropperSampler(hueRef, (clientX, clientY) => {
    const { x } = fractionAt(hueRef.current!, clientX, clientY)
    const [hr, hg, hb] = hsvToRgb(x * 360, 1, 1)
    return [hr, hg, hb, 255]
  })
  useEyedropperSampler(alphaRef, (clientX, clientY) => {
    const { x } = fractionAt(alphaRef.current!, clientX, clientY)
    return [r, g, b, clamp255(x * 255)]
  })

  const applyDrag = (kind: 'sv' | 'hue' | 'alpha', clientX: number, clientY: number) => {
    if (kind === 'sv' && svRef.current) {
      const { x, y } = fractionAt(svRef.current, clientX, clientY)
      emit({ ...hsva, s: x, v: 1 - y })
    } else if (kind === 'hue' && hueRef.current) {
      const { x } = fractionAt(hueRef.current, clientX, clientY)
      emit({ ...hsva, h: x * 360 })
    } else if (kind === 'alpha' && alphaRef.current) {
      const { x } = fractionAt(alphaRef.current, clientX, clientY)
      emit({ ...hsva, a: clamp255(x * 255) })
    }
  }

  const startDrag = (kind: 'sv' | 'hue' | 'alpha') => (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = kind
    e.currentTarget.setPointerCapture(e.pointerId)
    applyDrag(kind, e.clientX, e.clientY)
  }
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    applyDrag(dragRef.current, e.clientX, e.clientY)
  }
  const onDragEnd = () => { dragRef.current = null }

  // RGBA numeric fields edit the underlying rgb/alpha directly.
  const setChannel = (ch: 'r' | 'g' | 'b' | 'a', value: number) => {
    if (Number.isNaN(value)) return
    const n = clamp255(value)
    if (ch === 'a') { emit({ ...hsva, a: n }); return }
    const next = { r, g, b, [ch]: n }
    const [h, s, v] = rgbToHsv(next.r, next.g, next.b)
    emit({ h, s, v, a: hsva.a })
  }

  // Hex field: free typing, committed on blur/Enter; invalid text reverts.
  const currentHex = hsvaToHex(hsva)
  const [hexInput, setHexInput] = useState(currentHex)
  useEffect(() => setHexInput(currentHex), [currentHex])
  const commitHex = () => {
    if (/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hexInput)) emit(hexToHsva(hexInput))
    else setHexInput(currentHex)
  }

  // Swatch reorder via native drag-and-drop.
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const handleDrop = (index: number) => {
    if (dragIndex !== null && dragIndex !== index) onReorderSwatch(dragIndex, index)
    setDragIndex(null)
  }

  const imageFileRef = useRef<HTMLInputElement>(null)
  const projectFileRef = useRef<HTMLInputElement>(null)
  const pickFile = (onPick: (file: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (file) onPick(file)
  }

  return (
    <div className="flex flex-col w-64 bg-panel">
      <div className="flex items-center justify-between px-3 h-9 border-b border-divider">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-faint font-semibold">Color</span>
          <PinToggle pinned={pinned} onClick={onTogglePin} />
        </div>
        <div className="flex items-center gap-1.5 text-muted">
          <input ref={imageFileRef} type="file" accept="image/*" className="hidden" onChange={pickFile(onImportImage)} />
          <input ref={projectFileRef} type="file" accept=".zip" className="hidden" onChange={pickFile(onImportProjectPalette)} />
          <button title="Import palette from image" className="hover:text-ink" onClick={() => imageFileRef.current?.click()}>
            <ImagePlus size={15} />
          </button>
          <button title="Replace palette with one from another project" className="hover:text-ink" onClick={() => projectFileRef.current?.click()}>
            <FolderInput size={15} />
          </button>
          <button title="New palette" className="hover:text-ink"><Plus size={15} /></button>
        </div>
      </div>

      <div className="p-3 flex flex-col gap-3">
        <button
          onClick={onToggleGradient}
          className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-faint hover:text-ink-soft"
        >
          {gradientOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Gradient
        </button>

        {gradientOpen && (
          <>
            {/* saturation/value square */}
            <div
              ref={svRef}
              onPointerDown={startDrag('sv')}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              className="relative h-32 rounded border border-edge cursor-crosshair touch-none"
              style={{
                background:
                  `linear-gradient(to top, #000, transparent), ` +
                  `linear-gradient(to right, #fff, rgb(${hueRgb[0]},${hueRgb[1]},${hueRgb[2]}))`,
              }}
            >
              <div
                className="absolute w-3 h-3 -mt-1.5 -ml-1.5 rounded-full border-2 border-white shadow"
                style={{ left: `${hsva.s * 100}%`, top: `${(1 - hsva.v) * 100}%`, background: opaqueHex }}
              />
            </div>

            {/* hue slider */}
            <div
              ref={hueRef}
              onPointerDown={startDrag('hue')}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              className="relative h-3 rounded cursor-pointer touch-none"
              style={{
                background:
                  'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
              }}
            >
              <div
                className="absolute top-0 w-1.5 h-3 -ml-0.75 rounded-sm border border-white shadow"
                style={{ left: `${(hsva.h / 360) * 100}%` }}
              />
            </div>

            {/* alpha slider */}
            <div
              ref={alphaRef}
              onPointerDown={startDrag('alpha')}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              className="relative h-3 rounded cursor-pointer touch-none beast-checker"
            >
              <div
                className="absolute inset-0 rounded"
                style={{ background: `linear-gradient(to right, transparent, ${opaqueHex})` }}
              />
              <div
                className="absolute top-0 w-1.5 h-3 -ml-0.75 rounded-sm border border-white shadow"
                style={{ left: `${(hsva.a / 255) * 100}%` }}
              />
            </div>
          </>
        )}

        {/* swap, fg/bg slots, hex */}
        <div className="flex items-center gap-2">
          <button onClick={onSwap} title="Swap foreground/background (X)" className="text-muted hover:text-ink shrink-0">
            <ArrowLeftRight size={15} />
          </button>
          <div className="relative w-9 h-9 shrink-0">
            <button
              onClick={() => setActiveSlot('bg')}
              title="Background color"
              className={
                'absolute right-0 bottom-0 w-6 h-6 rounded border beast-checker shadow ' +
                (activeSlot === 'bg' ? 'border-accent-bright ring-2 ring-accent-deep/60' : 'border-edge-2')
              }
            >
              <div className="w-full h-full rounded" style={{ background: bgColor }} />
            </button>
            <button
              onClick={() => setActiveSlot('fg')}
              title="Foreground color"
              className={
                'absolute left-0 top-0 z-10 w-6 h-6 rounded border beast-checker shadow ' +
                (activeSlot === 'fg' ? 'border-accent-bright ring-2 ring-accent-deep/60' : 'border-edge-2')
              }
            >
              <div className="w-full h-full rounded" style={{ background: fgColor }} />
            </button>
          </div>
          <input
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            onBlur={commitHex}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="flex-1 bg-well text-sm text-ink-soft rounded px-2 py-1 border border-edge"
          />
        </div>

        {/* RGBA readout */}
        <div className="flex items-stretch gap-1.5">
          {(['r', 'g', 'b', 'a'] as const).map((ch) => (
            <label key={ch} className="flex-1 flex items-center gap-1 bg-well rounded border border-edge pl-1.5 pr-1">
              <span className="text-[10px] text-faint uppercase">{ch}</span>
              <input
                type="number"
                min={0}
                max={255}
                value={{ r, g, b, a: hsva.a }[ch]}
                onChange={(e) => setChannel(ch, e.target.valueAsNumber)}
                className="beast-no-spinner w-full min-w-0 bg-transparent text-xs text-ink-soft text-right tabular-nums py-1"
              />
            </label>
          ))}
        </div>

        {/* swatch palette — drag to reorder, right-click to overwrite with
            the current color, hover for the delete button */}
        <div className="grid grid-cols-6 gap-1.5 max-h-44 overflow-y-auto">
          {palette.map((c, i) => (
            <div key={i} className="relative group aspect-square">
              <button
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(i)}
                onDragEnd={() => setDragIndex(null)}
                onClick={() => { onColor(c); onPeekSelect?.() }}
                onContextMenu={(e) => { e.preventDefault(); onEditSwatch(i, currentHex) }}
                title={`${c} — right-click to overwrite with current color, drag to reorder`}
                className={
                  'w-full h-full rounded border ' +
                  (color === c ? 'border-accent-bright ring-2 ring-accent-deep/60' : 'border-edge hover:border-edge-hover') +
                  (dragIndex === i ? ' opacity-40' : '')
                }
                style={{ background: c }}
              />
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveSwatch(i) }}
                title="Remove swatch"
                className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-well border border-edge text-faint hover:text-danger"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
          <button
            onClick={() => onAddSwatch(currentHex)}
            title="Add current color to palette"
            className="aspect-square rounded border border-dashed border-edge hover:border-edge-hover text-faint hover:text-ink flex items-center justify-center"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
