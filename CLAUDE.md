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
- **Tech stack:** React 18 + Vite 6 + Tailwind v4. Browser-only, no backend.
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

### TypeScript migration (in progress, started 2026-06-21)

Migrating JS→TS **incrementally**, **strict from day one**. `tsconfig.json` has `allowJs: true` +
`checkJs: false`, so `.js`/`.jsx` and `.ts`/`.tsx` coexist — only renamed files are type-checked.
Vite resolves `.js` import specifiers to their `.ts` files, so renaming a module needs **no edits to
its importers**. Migration order is bottom-up (data model → reducer → tools → persist/hooks →
components last). `src/document/model.ts` is done; the rest is still `.js`/`.jsx`.

## Architecture
