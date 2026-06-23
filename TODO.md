# TODO

Deferred / planned work — open items only. See [README.md](./README.md) for what's already
implemented; this file tracks what isn't, organized by area.

## Core data models
- [ ] Content-addressed storage for binary pixel data (BLAST sample-cache pattern).
- [ ] (optional) Per-sprite undo — scope history per sprite so undo/redo only
      affects the active sprite, not the whole project. Currently global.

## Canvas
- [x] Crop tool: resize handles on all edges/corners, with an appropriate
      resize cursor on hover.
- [ ] Bug: making a rect selection with the select tool, then switching to
      the crop tool while that selection is still active, behaves weird
      (crop tool likely isn't expecting a pre-existing `selection` to seed
      `cropPending` from — needs repro + fix in `tools/registry.ts` /
      `PixelCanvas.tsx`).
- [ ] Sane max canvas size cap for performance.
- [ ] A clear canvas button: clears all pixels and removes all layers (full
      reset, not just the active layer). Decide where it should live in the UI
      — candidates discussed were the LayersPanel header row (if scoped to the
      active layer) or near FramesTimeline's per-frame actions (if scoped to
      the whole frame); since this clears everything project-wide it may
      instead deserve its own spot (e.g. near the New Project button in
      Header) — needs a decision before implementing.

## Real Preview
- [ ] No keyboard shortcut to toggle it — only the header button. The shortcut
      registry's `ctx` doesn't carry arbitrary UI setters yet
      (`shortcuts/registry.ts`); add if it becomes annoying to reach via mouse.
- [x] Preview follows playback — it was already wired to `target.frameIndex`,
      which is the same global `frameIndex` the playback loop advances, so this
      came for free with loop playback below.

## Tools (v1 registry)
- [ ] Lasso (freehand polygon) select — deferred; only rectangular select is
      implemented for now.
- [ ] Color select — select all pixels of a specific color (e.g. click a
      color, or eyedropper-style sample) across the layer/canvas, for use as
      a mask or to drive color replace.
- [ ] Type tool — render text onto the canvas (font select, maybe a predefined
      set) and an emoji picker/insert.
- [ ] Eraser: decide whether it stays a separate tool (current) or is also
      reachable via right-click while another paint tool is active.
- [ ] "Pixel perfect" diagonal-stroke thinning at width>1 (Aseprite-style —
      avoids chunky corners where a thick diagonal stroke overlaps itself).
- [ ] Transform tools: flip horizontal / flip vertical (whole layer or
      selection content, not the live mirror-painting guides), and a
      move/nudge tool to shift layer content in place (distinct from the
      existing select-then-move-floating-region workflow).
- [x] Gradient drag preview (`tools/registry.ts` gradient entry, rendered in
      `PixelCanvas.tsx`) only draws the Bresenham line between drag endpoints,
      not anything representing the gradient spread itself (now fg→bg).
- [x] Gradient fill shape option: linear vs. circular/radial, toggled via the
      same Outline/Filled-style variant flyout rect/ellipse already use.
- [ ] Gradient angle/direction lock: Shift-constrain the drag to 0/45/90°
      increments, same idea as the rect/ellipse square-circle Shift constraint.
- [ ] Gradient dithering option — smooth fg→bg steps can band visibly at small
      pixel-art sizes; an ordered-dither mode would break up the bands.
- [ ] Multi-stop gradient (3+ colors, not just fg→bg) — bigger lift, needs a
      color-stop editing UI in `ColorPanel.tsx`, not just a toggle.

## Color
- [x] Docked sidebar overflow: `<aside>` in `App.tsx` now scrolls
      (`overflow-y-auto`) instead of clipping/overflowing on short viewports,
      and the palette swatch grid in `ColorPanel.tsx` is capped at `max-h-44
      overflow-y-auto` (same pattern as `LayersPanel`'s layer list) instead of
      growing unbounded.
- [ ] Right-click paints with bg color instead of fg — deliberately deferred
      when fg/bg landed. Needs `event.button` handling in `PixelCanvas.tsx`
      (`handleDown`/`ctxFor` currently treat all clicks the same) and
      suppressing the canvas's `contextmenu` event; decide which tools it
      applies to (eraser already paints transparent, so it wouldn't apply there).
- [ ] Multiple named palettes per project — deliberately deferred; a project
      currently holds exactly one palette. The header's "New palette" `+`
      button is still an unwired placeholder for this.
- [ ] Standalone palette export/import (a plain file, separate from the
      project ZIP — e.g. JSON or the Lospec `.hex` community format) —
      deliberately deferred; palette only travels inside the project file
      for now.

## Layers

## Sprites

## Animation

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
