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
- [ ] Tool registry (one entry per tool — BLAST block-registry translation).
- [~] Brush (incl. 1px pencil) — pencil drawing wired; brush sizes TBD.
- [ ] Eraser, Fill/bucket, Eyedropper.
- [ ] Line, Rectangle, Ellipse (outline + filled).
- [ ] Rect/lasso select, Move, Cut/Copy/Paste of regions.
- [ ] Symmetry/mirror (vertical + horizontal axis).
- [ ] Gradient fill.

## Color
- [ ] Managed swatch palette (loadable/savable).
- [ ] Free RGBA picker; add mixed color to palette.

## Layers
- [~] Layer stack — selection wired; add/remove/reorder, visibility toggle and
      opacity slider still static (eye/opacity render from data but don't mutate).

## Sprites
- [ ] Add/rename/delete/reorder sprites (the Sprites panel + buttons).
- [ ] Remember selected layer (and frame) per sprite when switching. Currently
      switching sprites resets to the top layer / frame 1 (`App.jsx` selectSprite).

## Animation
- [ ] Frames: add/remove/reorder/duplicate.
- [ ] Onion-skinning (toggleable ghosts of adjacent frames).
- [ ] Loop playback (play/stop).
- [ ] Global FPS for the whole animation.

## Persistence
- [ ] ZIP project save/load.
- [ ] Autosave (localStorage + IndexedDB, content-addressed blobs).

## Export
- [ ] PNG with pixel-art upscaling (1×/2×/4×/8×).
- [ ] Animated GIF (all frames).
- [ ] Sprite sheet (all frames in one PNG grid).

## Infra
- [ ] Theme palette tokens via `getColor()` (Canvas/SVG read tokens).
- [ ] Deploy: gh-pages, Vite `base: '/BEAST/'`.

## Performance
- [ ] `compositeFrame` re-composites the whole frame on every paint dispatch
      (`document/model.js` + `PixelCanvas.jsx`). Fine at 32–128px; revisit with
      dirty-rect blitting if large canvases feel sluggish.
