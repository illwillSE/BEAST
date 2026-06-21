# TODO

Deferred / planned work. Seeded from CLAUDE.md kickoff decisions (2026-06-20).
Current state: first draw→undo→redo slice landed — pencil paints into the model
behind the history reducer (`src/document/`). Layer/frame/sprite selection UI is
still cosmetic; painting targets the first of each.

## Core data model
- [x] Layered + framed pixel document model — flat RGBA cells (`document/model.ts`).
- [ ] Content-addressed storage for binary pixel data (BLAST sample-cache pattern).
- [x] History-backed undo/redo reducer over the document (`document/reducer.js`).
- [ ] (optional) Per-sprite undo — scope history per sprite so undo/redo only
      affects the active sprite, not the whole project. Currently global.
- [x] Many sprites per project; each sprite owns its own layers + frames.
      Sprite/layer/frame selection wired — painting follows the UI. Project is
      seeded with two starter sprites; add/delete/reorder still TODO (below).

## Canvas
- [x] Actual pixel drawing on the canvas — pencil only; other tools pending.
- [x] Canvas presets (16×16, 32×32, 64×64, 128×128) + custom W×H — picked in
      a `NewSpriteDialog` opened from SpriteList's "+" button; custom W/H is
      clamped to 1–256 (`components/NewSpriteDialog.jsx`).
- [x] Resize/crop after creation (undoable) — a Crop tool (`tools/registry.js`,
      key `C`) that drags a marquee like Select. The rect doesn't apply on
      release: it becomes a pending crop window (App's `cropPending`) that can
      still be dragged from inside to reposition before committing. Commits
      (`CROP_SPRITE` → `document/model.ts` `cropSprite`) on Enter or on
      switching away from the Crop tool; Escape cancels it. Dragging past an
      edge extends the canvas there (transparent fill); dragging inside crops
      away everything outside the rect. No size cap on the extend direction
      yet — see the cap item below.
      Note: the crop-tool's marquee preview canvas is sized to the sprite's
      *current* W×H, so dragging past an edge to grow shows no visual
      feedback for the grown area while dragging (it still works on commit).
      Not fixed — see the dedicated dialog below instead.
- [x] Resize Canvas dialog (`components/ResizeCanvasDialog.jsx`) — explicit
      W×H fields + a 9-point anchor picker (Photoshop-style), opened from
      SpriteList's new resize icon next to "+". Dispatches the same
      `CROP_SPRITE` action as the Crop tool, so it's undoable and reuses
      `cropSprite`'s generic grow/shrink logic.
- [ ] Crop tool: resize handles on all edges/corners (currently only
      drag-from-inside to reposition), with an appropriate resize cursor on hover.
- [ ] Sane max canvas size cap for performance.
- [ ] A clear canvas button.
- [ ] Canvas zoom: a "fit to frame" option (zooms in or out as needed to fit
      the sprite in the viewport) and a 1:1 button.

## Real Preview
- [x] Free-floating "real size" preview window — shows the active sprite/frame
      at literal 1:1 scale (own zoom control, range 1–16×), draggable/resizable,
      position/size/scale/open-state persisted to localStorage
      (`components/PreviewWindow.jsx`, `persist/previewPrefs.js`). Click inside
      it scrolls the main canvas to center on that pixel (`CanvasStage.jsx`
      `scrollToCenter`). Toggled from the header (`ScanEye` icon).
- [ ] No keyboard shortcut to toggle it — only the header button. The shortcut
      registry's `ctx` doesn't carry arbitrary UI setters yet
      (`shortcuts/registry.js`); add if it becomes annoying to reach via mouse.
- [ ] Preview always shows `target.frameIndex` (follows the timeline like the
      main canvas). Once onion-skinning / play-loop animation lands, decide
      whether the preview should follow playback too.

## Tools (v1 registry)
- [x] Tool registry (`src/tools/registry.js`) — one entry per tool; PixelCanvas
      drives the gesture loop and delegates behavior. ToolRail still has its own
      static icon list (render the rail from the registry later).
- [~] Brush (incl. 1px pencil) — pencil drawing wired; brush sizes TBD.
- [x] Eraser, Fill/bucket, Eyedropper.
      (Eyedropper samples the composited/visible pixel; ignores transparent.)
- [x] Line, Rectangle, Ellipse (outline + filled) — filled/outline picked via a
      flyout that opens next to the Rectangle/Ellipse button when active.
- [x] Rect select, Move, Cut/Copy/Paste of regions (Cmd/Ctrl+C/X/V, Escape to
      deselect). Move/paste float on top of the layer until committed (tool
      switch, target switch, or Escape) so they can be repositioned first.
- [ ] Lasso (freehand polygon) select — deferred; only rectangular select is
      implemented for now.
- [x] Symmetry/mirror (vertical + horizontal axis) — two persistent toggle
      buttons in ToolRail that mirror whichever paint tool is active
      (pencil/eraser/line/rect/ellipse/fill/gradient), not a separate tool.
- [x] Gradient fill — flood-fills the clicked region (Fill's connectivity
      rule) fading the current color to transparent along the drag axis.
      Fixed two-stop (color → transparent); no second-color picker.

## Color
- [ ] Managed swatch palette (loadable/savable).
- [ ] Free RGBA picker; add mixed color to palette.
- [ ] Shift+I for temporary color picker (after picking, return to previous tool).
- [ ] Update color picker with a magnifying glass to make it easier to pick a
      color; also show RGB value in the magnification.

## Layers
- [x] Layer stack CRUD — add/duplicate/remove/move (up/down buttons), visibility
      toggle, and opacity slider all wired (`document/model.ts`, `LayersPanel.jsx`).
- [ ] Drag-and-drop reordering — swap layer stack order by dragging a row,
      instead of (or in addition to) the move up/down buttons.
- [ ] Shift+click a layer's eye to solo it — hide all other layers (shift+click
      again, or click a hidden one's eye, to restore prior visibility).
- [ ] Layer mix option.

## Sprites
- [x] Add/rename/delete/reorder sprites (`document/model.ts`, `SpriteList.jsx`).
      Rename is via double-click on the name; move up/down acts on the
      selected sprite.
- [ ] Remember selected layer (and frame) per sprite when switching. Currently
      switching sprites resets to the top layer / frame 1 (`App.jsx` selectSprite).

## Animation
- [x] Frames: add/remove/reorder/duplicate (move-left/right buttons; `FramesTimeline.jsx`).
- [ ] Drag-and-drop reordering — reorder frames by dragging a thumbnail in the
      strip, instead of (or in addition to) the move left/right buttons.
- [ ] Onion-skinning (toggleable ghosts of adjacent frames).
- [ ] Loop playback (play/stop).
- [ ] Global FPS for the whole animation.

## Persistence
- [x] Serialization layer — manifest + content-addressed cell blobs (`persist/serialize.js`).
- [x] ZIP project save/load (`persist/zip.js`; Header Open/Save buttons).
- [x] Autosave (localStorage manifest + IndexedDB blobs) with restore on load
      (`persist/autosave.js`).
- [ ] Cell-hash is cyrb53 (non-crypto) — fine for in-project dedup, but revisit
      if collisions ever matter.
- [x] Autosave never GCs orphan blobs in IndexedDB — old cell versions accumulate.
      Every `saveAutosave` now deletes any stored hash not referenced by the
      current manifest (`persist/autosave.js`).
- [x] `uid` seq reseeded past the loaded max on project load (`reseedUid`,
      `document/model.ts`), so new sprites/layers/frames can't collide with ids
      from a prior session.
- [ ] No "save before discard" guard: Open replaces the current project without
      confirmation; autosave overwrites the previous autosave.

## Import
- [ ] Open a PNG as a new sprite — draw it to a canvas, read pixels into a cell.
      Decide sizing: use the PNG's native dimensions (no resampling), and which
      layer/frame it lands on.
- [ ] (maybe) Open an animated GIF — one frame per GIF frame. Needs a GIF
      decoder; coalesce disposal/transparency. Bigger lift than PNG.

## Export
- [ ] PNG with pixel-art upscaling (1×/2×/4×/8×).
- [ ] Animated GIF (all frames).
- [ ] Sprite sheet (all frames in one PNG grid).

## Infra
- [x] Theme palette tokens via `getColor()` (Canvas/SVG read tokens) —
      `src/theme/colors.js`, used by the selection-marquee overlay so far.
- [ ] Deploy: gh-pages, Vite `base: '/BEAST/'`.

## Performance
- [ ] `compositeFrame` re-composites the whole frame on every paint dispatch
      (`document/model.ts` + `PixelCanvas.jsx`). Fine at 32–128px; revisit with
      dirty-rect blitting if large canvases feel sluggish.

## TypeScript migration (started 2026-06-21)
Incremental JS→TS, **strict from day one**. `tsconfig.json` has `allowJs: true` +
`checkJs: false`, so `.js`/`.jsx` and `.ts`/`.tsx` coexist; only renamed files are
type-checked. Order is bottom-up so types flow from the data model outward.

Each item is tagged with a **recommended model**: `[Opus]` for one-time type
*design* decisions, `[Sonnet]` for mechanical conversions with a tight typecheck
loop. (Whole thing can run on Sonnet if preferred — the `tsc` gate makes a weaker
type design surface as friction, not silent breakage; revisit those on Opus after.)

**Rules for every conversion (tell the model these):**
- Rename `.js`→`.ts` / `.jsx`→`.tsx`; add types only. Preserve comments verbatim;
  don't refactor logic (surgical — see CLAUDE.md §3).
- Vite resolves `.js` import specifiers to their `.ts` file, so **don't edit
  importers** just because a dependency was renamed.
- Reuse the core types from `document/model.ts` (`Cell`, `RGBA`, `Point`, `Layer`,
  `Sprite`, `Doc`, `CellTarget`) — don't redefine them.
- Verify with `npm run typecheck` (must pass clean) and `npx vite build`.
- Prefer real types over `any`; a few `any`s are OK to keep momentum — leave a
  `// TODO(ts):` so the next pass can tighten.

- [x] `document/model.ts` — core type vocabulary defined here (the keystone).

**Design decisions (do these first — everything downstream conforms):**
- [ ] **[Opus]** `document/reducer.js` → `.ts` — design the **action discriminated
      union** (`STROKE_BEGIN`, `PAINT_LINE`, `FILL`, `CROP_SPRITE`, …) and the
      history wrapper types. The one genuinely meaty file; getting the union shape
      right first avoids churn downstream.
- [ ] **[Opus]** `tools/registry.js` → `.ts` — define the `ToolContext` and `Tool`
      interfaces from the documented ctx shape (registry.js lines ~23–29:
      `onStart/onDrag/onEnd/cursor/key/variants`). Every tool conforms to these.

**Leaf modules (mechanical; tight typecheck loop):**
- [ ] **[Sonnet]** `theme/colors.js` → `.ts`
- [ ] **[Sonnet]** `shortcuts/registry.js` → `.ts`
- [ ] **[Sonnet]** `hooks/useFoldable.js`, `hooks/usePeek.js` → `.ts`
- [ ] **[Sonnet]** `persist/serialize.js`, `persist/zip.js`, `persist/autosave.js`,
      `persist/previewPrefs.js` → `.ts`

**Components (`.jsx`→`.tsx`, bulk/repetitive; do after the above):**
- [ ] **[Sonnet]** `main.jsx`, `App.jsx`
- [ ] **[Sonnet]** `components/`: Header, ColorPanel, SpriteList, PreviewWindow,
      FoldTab, NewSpriteDialog, SpritePreview, ResizeCanvasDialog, FramesTimeline,
      PixelCanvas, ToolRail, LayersPanel, CanvasStage, PinToggle
- [ ] **[Sonnet]** Cleanup pass: remove any remaining `allowJs`/`any` crutches;
      consider flipping on stricter flags (`noImplicitAny` is already on via `strict`).
