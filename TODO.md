# TODO

Deferred / planned work. Seeded from CLAUDE.md kickoff decisions (2026-06-20).
Current state: first draw→undo→redo slice landed — pencil paints into the model
behind the history reducer (`src/document/`). Layer/frame/sprite selection UI is
still cosmetic; painting targets the first of each.

## Core data model
- [x] Layered + framed pixel document model — flat RGBA cells (`document/model.js`).
- [ ] Content-addressed storage for binary pixel data (BLAST sample-cache pattern).
- [x] History-backed undo/redo reducer over the document (`document/reducer.js`).
- [ ] (optional) Per-sprite undo — scope history per sprite so undo/redo only
      affects the active sprite, not the whole project. Currently global.
- [x] Many sprites per project; each sprite owns its own layers + frames.
      Sprite/layer/frame selection wired — painting follows the UI. Project is
      seeded with two starter sprites; add/delete/reorder still TODO (below).

## Canvas
- [x] Actual pixel drawing on the canvas — pencil only; other tools pending.
- [ ] Canvas presets (16×16, 32×32, 64×64, 128×128) + custom W×H.
- [ ] Resize/crop after creation (undoable).
- [ ] Sane max canvas size cap for performance.

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

## Layers
- [x] Layer stack CRUD — add/duplicate/remove/move (up/down buttons), visibility
      toggle, and opacity slider all wired (`document/model.js`, `LayersPanel.jsx`).
- [ ] Drag-and-drop reordering — swap layer stack order by dragging a row,
      instead of (or in addition to) the move up/down buttons.
- [ ] Shift+click a layer's eye to solo it — hide all other layers (shift+click
      again, or click a hidden one's eye, to restore prior visibility).

## Sprites
- [x] Add/rename/delete/reorder sprites (`document/model.js`, `SpriteList.jsx`).
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
- [ ] Autosave never GCs orphan blobs in IndexedDB — old cell versions accumulate.
      Add cleanup (e.g. prune hashes not in the current manifest).
- [x] `uid` seq reseeded past the loaded max on project load (`reseedUid`,
      `document/model.js`), so new sprites/layers/frames can't collide with ids
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
      (`document/model.js` + `PixelCanvas.jsx`). Fine at 32–128px; revisit with
      dirty-rect blitting if large canvases feel sluggish.
