# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**
- If you write 200 lines and it could be 50, rewrite it.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting, mention it.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked, mention it.

The test: Every changed line should trace directly to the user's request.

## 4. Working with the owner

**The owner (Pontus) drives commits and the look; you build function.**

- **Never auto-commit.** When work is done, suggest a commit message and wait — committing is always his call. Before committing, run `git log --oneline -3` + `git status --short` and write the message to describe only what is actually staged (he sometimes commits himself between turns).
- **Visual/styling decisions are his** (layout, spacing, sizing, columns, colors, typography). Don't restyle on your own initiative — implement behavior/structure and let him drive the look. When he *points out* a visual problem, that names the problem, not authorization to pick the fix: diagnose the cause, name the lever, let him choose. **Don't screenshot to judge how the UI looks** — verify changes functionally; he does visual review himself. (Screenshots are fine when he asks you to check behavior, not aesthetics.)
- **Log deferred work to TODO.md.** Any edge case, limitation, or known-but-unfixed behavior that gets flagged but deliberately left must be written into `TODO.md`, not just mentioned in chat.
- **Keep `shortcuts.md` in sync.** Whenever you add, remove, or change a shortcut in `src/shortcuts/registry.ts` or `src/tools/registry.ts` (tool `key` fields), update `shortcuts.md` in the same edit session.
- **He tests in the browser himself — don't go hunting for browser automation tooling (Playwright, chromium-cli, etc.) to verify UI work.** After implementing, give him a short list of concrete manual steps to try (what to click, what should happen) instead. Confirm the code compiles/builds; leave functional/visual verification to him.

## What this is

**BEAST** is a browser-only pixel-art / sprite editor (no backend), built in the spirit of its
sibling project **BLAST** (`../BLAST/`) — same look and feel, same tech stack, but **not**
pipeline/signal-chain based and with no audio. Where BLAST is a left-to-right signal chain of sound
blocks, BEAST is a **layered + framed pixel document** edited with painting tools.

### Decisions so far (project kickoff, 2026-06-20)

- **Core editor type:** Raster / pixel-art painting (pixels are the document).
- **Document model:** Layers **+** animation frames — a full sprite/animation editor (draw a
  character on a layer stack, animate it across frames).
- **Audience:** General audience (not kid-specific). **English only** to start. **Single mode** — no
  Beginner/Advanced split.
- **Tech stack:** React 18 + Vite 6 + Tailwind v4 + TypeScript (strict). Browser-only, no backend.
- **Carry over BLAST's proven (non-audio) patterns**, adapted not copied blindly:
  - the **theme palette** (dark slate + amber accent; Canvas/SVG read tokens via `getColor()`),
  - the **history-backed undo/redo reducer**,
  - **ZIP project save/load**,
  - **autosave** (localStorage + IndexedDB, content-addressed blobs),
  - **registry-driven extensibility** — BLAST's *block registry* becomes BEAST's **tool registry**
    (brush, eraser, fill, line, shapes, color picker, select…). One registry entry = one tool.
- **Export targets:** PNG (with pixel-art upscaling 1×/2×/4×/8×), animated GIF (all frames), and
  sprite sheet (all frames in one PNG grid).
- **Deploy:** gh-pages, Vite `base: '/BEAST/'` (same release path as BLAST).
- **Canvas size:** common presets (16×16, 32×32, 64×64, 128×128) **+** custom W×H, **and**
  resizable/croppable after creation (resize logic must be undoable). Cap at a sane max for
  performance.
- **Color handling:** **both** — a managed swatch **palette** (loadable/savable, the classic
  pixel-art workflow) **and** a free **RGBA picker** to mix any color and add it to the palette.
- **Animation:** **onion-skinning** (toggleable ghosts of adjacent frames), in-editor **loop
  playback** (play/stop), and a **global FPS** for the whole animation (no per-frame durations).
- **Project unit:** **many sprites per project** — like BLAST holds many sounds; a sidebar list of
  sprites/documents to switch between. Each sprite owns its own layers + frames.
- **v1 tool set:** Core paint (Brush incl. 1px pencil, Eraser, Fill/bucket, Eyedropper);
  Shapes & lines (Line, Rectangle, Ellipse — outline + filled); Select & move (rect/lasso select,
  move, cut/copy/paste of regions); Symmetry/mirror (vertical/horizontal axis); **Gradient fill**.

### Key architectural translations from BLAST

- *Block registry* → **tool registry** (one entry per painting tool).
- *Signal-chain data model* → **layered + framed pixel document** behind the same history-backed
  undo reducer.
- Reuse the single-serializable-data-model approach: a project is the serializable spine; large
  binary pixel data is content-addressed and stored/repopulated like BLAST's sample cache.

## Commands

- `npm run dev` — dev server on http://localhost:5173
- `npm run typecheck` — `tsc --noEmit`, the real type check (Vite/esbuild transpiles but does **not** type-check)
- `npm run build` (= `tsc --noEmit && vite build`) — type-check then bundle; no tests or linter
- `npm run preview` — serve the production build locally
- `npm run deploy` — build + publish `dist/` to GitHub Pages (`gh-pages`); the release path

### TypeScript

The codebase is **fully TypeScript** (`strict` mode) — the incremental JS→TS migration
(started 2026-06-21, bottom-up: data model → reducer → tools → persist/hooks → components)
finished the same day. No `.js`/`.jsx` remain; `tsconfig.json` has no `allowJs`/`checkJs`
crutches left either.

## Architecture

The data flows in one direction: a **serializable document** lives behind a **history reducer**;
**`App.tsx`** is the shell that wires state to components; the **pixel canvas** runs a gesture loop
that delegates to the **tool registry**; persistence splits the document into a JSON spine plus
content-addressed pixel blobs.

> **Import quirk:** source files are `.ts`/`.tsx`, but imports spell the extension `.js`/`.jsx`
> (e.g. `import … from './model.js'` resolves to `model.ts`). This is intentional — match it; don't
> "fix" the extensions.

### Document model (`src/document/model.ts`)

The serializable spine. A **`Doc`** holds many **`Sprite`s** + a shared `palette` (hex strings).
Each sprite owns a bottom-to-top stack of **`Layer`s** (later layers composite over earlier) and a
`frameCount`. Every `(layer, frame)` pair is one **`Cell`** — a flat `Uint8ClampedArray` of length
`w*h*4`, RGBA, all-zero = transparent. **Cells are the only large binary data and the unit of undo.**

`model.ts` is otherwise a kit of **pure functions** in two flavors:
- **Immutable doc transforms** (sprite/layer/frame/palette CRUD, `cropSprite`/`stretchSprite`,
  `replaceCell`) — return a new `Doc` sharing everything untouched by reference.
- **In-place cell mutators** (`paintLine`, `floodFill`, `gradientFill`, `outlineObject`,
  region ops `clearRegion`/`fillRegion`/`copyRegion`/`pasteRegion`) that the reducer calls on a
  *cloned* cell, plus geometry helpers (`linePoints`, `rectPoints`, `ellipsePoints`,
  `shapeOffsets`/`stampPoints` for brush width/shape) and `compositeFrame` (layer compositing with
  per-layer opacity + blend mode, used by the canvas, previews, and every exporter).

**Symmetry** (`mirroredFill` + `Mirror`) is the subtle part: flood/gradient/outline fills can't just
re-run from a mirrored coordinate — each mirror-orbit is painted from a single canonical source (the
half nearest the gesture anchor) so straddling-axis regions come out symmetric and
order-independent. Read the long comment there before touching fills.

**Selections** are a bounding box + optional per-pixel `mask` (no mask = full rectangle; a mask only
appears after invert). `selectionOutline` produces the marching-ants runs.

### History reducer (`src/document/reducer.ts`)

Classic `past / present / future` stack; `present` is the live doc (capped at `MAX_HISTORY = 200`).
Two helpers do all the work:
- **`editCell`** — for pixel writes: on the first edit of a step it snapshots the doc and **clones
  the target cell** (so the snapshot's buffer stays frozen while we mutate the copy), then rebuilds
  the spine via `replaceCell` so the sprite gets a new identity and React re-composites.
- **`editDoc`** — for CRUD/palette actions: snapshots, then applies an immutable transform.

**Stroke coalescing:** `STROKE_BEGIN`/`STROKE_END` bracket a gesture so everything between them
collapses into **one undo step** (a pencil drag, or a single fill whose symmetry mirroring fans one
dispatch into several). An empty click adds no history (the snapshot is lazy, on first paint).
`REPLACE` (project load / autosave restore) swaps the whole doc and resets history.

### The three registries — extensibility seams

Adding a tool/shortcut/command is **adding an entry, not editing a handler** (BLAST's block-registry
pattern). They cross-reference each other so one tool definition feeds all three.

- **`src/tools/registry.ts`** — one entry per painting tool. Each implements an optional
  `onStart`/`onDrag`/`onEnd`/`onMove` gesture lifecycle plus `cursor`, `key`, `variants`
  (Outline/Filled, Linear/Radial, …), and `hasBrushSize`. `PixelCanvas` builds a **`ToolContext`**
  per pointer event (cell coords, target, colors, `dispatch`, selection/floating/crop state, …) and
  delegates — tools never touch the canvas directly. `dispatch` already mirrors across active
  symmetry axes, so tools dispatch normally.
- **`src/shortcuts/registry.ts`** — keyboard shortcuts matched by `key`+`mod`+`shift`. Tool-select
  shortcuts are derived from each tool's `key` (re-pressing an active tool's key cycles its
  variants). `[`/`]` step the global brush size. Guards: `isTypingTarget` / `isInsideDialog` suppress
  shortcuts in inputs/modals.
- **`src/commands/registry.ts`** — the Cmd/Ctrl+P command palette. `CommandContext` extends
  `ShortcutContext` with the document-CRUD / file / toggle methods `App` provides. Tool-switch
  commands (and per-variant submenus) are generated off the tool registry. Includes the search
  ranking (`filterCommands`).

### Shell & components (`src/App.tsx` + `src/components/`)

`App.tsx` (~870 lines) is the orchestrator: it holds the history reducer, the *UI selection* state
(active sprite / layer / frame, current tool + variants, fg/bg color, brush size/shape, mirror
toggles, selection/floating/clipboard/crop), and assembles the `ShortcutContext`/`CommandContext`.
**Painting follows the UI** — the active sprite/layer/frame is the paint target.

Component roles:
- **`PixelCanvas`** — the editing surface. Composites the frame to a `<canvas>`, runs the pointer
  gesture loop into the active tool, draws live previews/marquee/onion-skin/grid, and does precise
  pixel-data-backed eyedropper sampling.
- **`CanvasStage`** — wraps `PixelCanvas` with zoom/pan controls, the brush-size button, the
  resize-canvas dialog, and the docked `PreviewWindow`.
- **`ToolRail`** (tools + mirror toggles, with variant flyouts), **`SpriteList`** (sprites sidebar),
  **`LayersPanel`** (layer stack: visibility/opacity/blend/reorder), **`ColorPanel`** (swatch
  palette + RGBA/HSV picker), **`FramesTimeline`** (frame strip + play/onion), **`Header`** (project
  name + file actions), **`CommandPalette`**, **`SettingsModal`**, plus dialogs
  (`NewSpriteDialog`, `ResizeCanvasDialog`, `MergeColorsDialog`, `ClassicPalettesDialog`).
- Chrome panels are **foldable/pinnable** (`useFoldable`/`usePeek`/`PinToggle`/`FoldTab`): unpinning
  collapses a panel to an edge tab that peeks open as an overlay without resizing the canvas.

### Persistence (`src/persist/`)

`serialize.ts` is the shared foundation: a `Doc` splits into a small JSON **manifest** (the spine,
referencing cells by hash) plus **content-addressed cell blobs** (each buffer hashed with cyrb53;
identical buffers — e.g. all the empty cells — dedupe to one blob). Reconstruction repopulates cells
from the blob set, BLAST's sample-cache pattern. Built on top:
- **`zip.ts`** — `.zip` save/load (`manifest.json` + `cells/<hash>.bin`); also pulls just the
  palette out of another project.
- **`autosave.ts`** — manifest in localStorage, blobs in IndexedDB (`beast`/`cells` store), orphan
  blobs swept on each save. All failures are swallowed so persistence never breaks editing;
  `clearAllStorage` wipes both.
- **`previewPrefs.ts`** — preview window open/size/position prefs.

### Export (`src/export/`) & theme

All exporters reuse `compositeFrame`: single-frame PNG (with 1×/2×/4×/8× nearest-neighbor upscale)
lives in `App.tsx`; `framesZip.ts` exports all frames as a numbered-PNG ZIP; `spritesheet.ts` lays
all frames left-to-right into one PNG. `theme/colors.ts` (`getColor`) bridges the `@theme` tokens in
`theme.css` to canvas `fillStyle`/`strokeStyle`, keeping the palette a single source of truth — the
dark-slate + amber-accent look carried over from BLAST.

### Vite

`vite.config.js`: `base: '/BEAST/'` (gh-pages release path), React + Tailwind v4 plugins, dev server
on port **5174** (note: not 5173 — the `npm run dev` line above reflects Vite's default; the config
pins 5174).
