# BEAST

A browser-only pixel-art / sprite editor — no backend. Built in the spirit of its sibling
project **BLAST** (same look and feel, same tech stack), but raster/layer/frame based
instead of audio/signal-chain based.

A project holds many **sprites**; each sprite owns a stack of **layers** and a number of
**animation frames**. Painting targets the active (sprite, layer, frame) cell, with full
undo/redo behind every edit.

## Features

- **Document model** — layered + framed pixel sprites, many sprites per project, each with
  its own layers and frames.
- **History-backed undo/redo** over the whole document.
- **Canvas** — size presets (16×16, 32×32, 64×64, 128×128) or custom W×H at creation;
  resize/crop afterward via a draggable Crop tool or an explicit Resize Canvas dialog
  (9-point anchor picker), both undoable.
- **Real Preview** — a free-floating window showing the active sprite/frame at literal 1:1
  scale, independent of canvas zoom; click it to scroll/center the main canvas on that pixel.
- **Tools** — Pencil, Eraser, Fill, Gradient fill, Eyedropper, Line, Rectangle, Ellipse
  (outline or filled), rectangular Select with Move/Cut/Copy/Paste, Crop, and
  vertical/horizontal mirror (symmetry) toggles layered on top of any paint tool.
- **Layers** — add/duplicate/remove/reorder, per-layer visibility and opacity.
- **Sprites** — add/rename/delete/reorder, each with its own thumbnail preview.
- **Animation frames** — add/remove/duplicate/reorder.
- **Persistence** — save/load a project as a `.zip` (manifest + content-addressed pixel
  blobs), plus autosave to the browser (localStorage + IndexedDB) with orphan blob GC and
  restore-on-load.
- **Foldable chrome** — side/bottom panels (Sprites, Layers, Color, Frames) can be unpinned
  to an edge tab and peeked open as an overlay instead of taking permanent layout space.

See [TODO.md](./TODO.md) for what's planned but not yet built.

## Tech stack

React 18 + Vite 6 + Tailwind v4, written entirely in TypeScript (strict). Browser-only,
no backend — projects live in the browser (autosave) or as exported `.zip` files.

## Commands

- `npm run dev` — dev server at http://localhost:5173
- `npm run typecheck` — `tsc --noEmit`, the real type check (Vite/esbuild transpiles but
  does **not** type-check)
- `npm run build` (= `tsc --noEmit && vite build`) — type-check then bundle
- `npm run preview` — serve the production build locally
- `npm run deploy` — build + publish `dist/` to GitHub Pages (`gh-pages`)

## Project layout

- `src/document/` — the serializable document model (`model.ts`) and the history-backed
  undo/redo reducer (`reducer.ts`).
- `src/tools/registry.ts` — one entry per painting tool; `PixelCanvas` drives the pointer
  gesture loop and delegates behavior to the active tool's entry.
- `src/shortcuts/registry.ts` — keyboard shortcuts, matched against the same tool keys.
- `src/persist/` — ZIP save/load, autosave, and Real Preview window prefs.
- `src/components/` — UI: canvas, panels (layers/sprites/color/frames), dialogs.
- `src/theme/colors.ts` — bridge from Tailwind's `@theme` tokens to canvas
  `fillStyle`/`strokeStyle` colors.
