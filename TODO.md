# TODO

Deferred / planned work — open items only. See [README.md](./README.md) for what's already
implemented; this file tracks what isn't, organized by area.

## Core data model
- [ ] Content-addressed storage for binary pixel data (BLAST sample-cache pattern).
- [ ] (optional) Per-sprite undo — scope history per sprite so undo/redo only
      affects the active sprite, not the whole project. Currently global.

## Canvas
- [ ] Crop tool: resize handles on all edges/corners (currently only
      drag-from-inside to reposition), with an appropriate resize cursor on hover.
- [ ] Sane max canvas size cap for performance.
- [ ] A clear canvas button.
- [ ] Canvas zoom: a "fit to frame" option (zooms in or out as needed to fit
      the sprite in the viewport) and a 1:1 button.

## Real Preview
- [ ] No keyboard shortcut to toggle it — only the header button. The shortcut
      registry's `ctx` doesn't carry arbitrary UI setters yet
      (`shortcuts/registry.ts`); add if it becomes annoying to reach via mouse.
- [ ] Preview always shows `target.frameIndex` (follows the timeline like the
      main canvas). Once onion-skinning / play-loop animation lands, decide
      whether the preview should follow playback too.

## Tools (v1 registry)
- [~] Brush (incl. 1px pencil) — pencil drawing wired; brush sizes TBD.
- [ ] Lasso (freehand polygon) select — deferred; only rectangular select is
      implemented for now.
- [ ] Type tool — render text onto the canvas (font select, maybe a predefined
      set) and an emoji picker/insert.

## Color
- [ ] Managed swatch palette (loadable/savable).
- [ ] Free RGBA picker; add mixed color to palette.
- [ ] Shift+I for temporary color picker (after picking, return to previous tool).
- [ ] Update color picker with a magnifying glass to make it easier to pick a
      color; also show RGB value in the magnification.

## Layers
- [ ] Drag-and-drop reordering — swap layer stack order by dragging a row,
      instead of (or in addition to) the move up/down buttons.
- [ ] Shift+click a layer's eye to solo it — hide all other layers (shift+click
      again, or click a hidden one's eye, to restore prior visibility).
- [ ] Layer mix option.

## Sprites
- [ ] Remember selected layer (and frame) per sprite when switching. Currently
      switching sprites resets to the top layer / frame 1 (`App.tsx` selectSprite).

## Animation
- [ ] Drag-and-drop reordering — reorder frames by dragging a thumbnail in the
      strip, instead of (or in addition to) the move left/right buttons.
- [ ] Onion-skinning (toggleable ghosts of adjacent frames).
- [ ] Loop playback (play/stop).
- [ ] Global FPS for the whole animation.

## Persistence
- [ ] Cell-hash is cyrb53 (non-crypto) — fine for in-project dedup, but revisit
      if collisions ever matter.
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
- [ ] Deploy: gh-pages, Vite `base: '/BEAST/'`. (`base` is already set in
      `vite.config.js`; `npm run deploy` hasn't been run yet — no `gh-pages`
      branch on the remote.)

## Performance
- [ ] `compositeFrame` re-composites the whole frame on every paint dispatch
      (`document/model.ts` + `PixelCanvas.tsx`). Fine at 32–128px; revisit with
      dirty-rect blitting if large canvases feel sluggish.
