# TODO

Deferred / planned work — open items only. See [README.md](./README.md) for what's already
implemented; this file tracks what isn't, organized by area.

## Core data models
- [ ] (optional) Per-sprite undo — scope history per sprite so undo/redo only
      affects the active sprite, not the whole project. Currently global.

## Canvas
- [ ] Bug: making a rect selection with the select tool, then switching to
      the crop tool while that selection is still active, behaves weird
      (crop tool likely isn't expecting a pre-existing `selection` to seed
      `cropPending` from — needs repro + fix in `tools/registry.ts` /
      `PixelCanvas.tsx`).
- [ ] Bug: Shift-dragging to add to an existing selection hides the original
      selection's marquee while dragging — only the new in-progress rect's
      marquee preview shows, so it's unclear what's already selected until
      release. The select tool's `onDrag` only sets a `{ kind: 'marquee' }`
      preview for the rect being drawn (`tools/registry.ts`); the existing
      `selection`'s outline should stay visible (or be unioned into the live
      preview) for the duration of the drag.
- [ ] Deselecting (Cmd/Ctrl+D, Escape, or starting a new selection) isn't
      undoable — `selection` is plain React state in `App.tsx`, not routed
      through the history reducer, so Ctrl+Z can't bring back a cleared
      selection. Would need either folding selection into the undo-tracked
      doc state or a small parallel undo stack just for selection changes.
- [ ] A clear canvas button: clears all pixels and removes all layers (full
      reset, not just the active layer). Decide where it should live in the UI
      — candidates discussed were the LayersPanel header row (if scoped to the
      active layer) or near FramesTimeline's per-frame actions (if scoped to
      the whole frame); since this clears everything project-wide it may
      instead deserve its own spot (e.g. near the New Project button in
      Header) — needs a decision before implementing.
      Note: a `clear-canvas` command exists in the palette but only clears the
      active cell (current layer + frame), not all layers.

## Tools (v1 registry)
- [ ] Outline tool doesn't support right-click erase (unlike pencil/fill/line/rect/ellipse) —
      deliberately scoped to fg-color only per the initial request.
- [ ] Lasso (freehand polygon) select — deferred; only rectangular select is
      implemented for now.
- [ ] Type tool — render text onto the canvas (font select, maybe a predefined
      set) and an emoji picker/insert.
- [ ] "Pixel perfect" diagonal-stroke thinning at width>1 (Aseprite-style —
      avoids chunky corners where a thick diagonal stroke overlaps itself).
- [ ] Gradient angle/direction lock: Shift-constrain the drag to 0/45/90°
      increments, same idea as the rect/ellipse square-circle Shift constraint.
- [ ] Gradient dithering option — smooth fg→bg steps can band visibly at small
      pixel-art sizes; an ordered-dither mode would break up the bands.
- [ ] Multi-stop gradient (3+ colors, not just fg→bg) — bigger lift, needs a
      color-stop editing UI in `ColorPanel.tsx`, not just a toggle.

## Color
- [ ] Multiple named palettes per project — deliberately deferred; a project
      currently holds exactly one palette. The header's "New palette" `+`
      button is still an unwired placeholder for this.
- [ ] Standalone palette export/import (a plain file, separate from the
      project ZIP — e.g. JSON or the Lospec `.hex` community format) —
      deliberately deferred; importing a palette from another project's ZIP
      is supported (`projectPaletteFromZipFile`), but no standalone format yet.

## Layers
- [ ] Merge Down bakes a layer into the one below as a normal/opacity-1 layer.
      If either merged layer used a non-'normal' blend mode it was blending
      against the layers further down too (which aren't part of the merge), so
      the result can shift appearance. Standard editor limitation; left as-is.
      (Merge Visible / Flatten are faithful since the whole stack is baked.)

## Sprites

## Animation

## Command palette
- [ ] Parameterized commands are intentionally excluded from v1 — the palette
      only runs one-shot actions. Commands that need a value or a dialog (Set
      FPS, Set Layer Opacity, Set Layer Blend Mode, Set Color, Rename
      project/sprite/layer, Crop/Resize canvas) are left to their existing
      panels; revisit if an inline value-editor step in the palette is wanted.
- [ ] "Add Sprite" from the palette uses the default canvas size (bypasses the
      New Sprite size dialog that SpriteList's `+` opens).


## Persistence
- [ ] Cell-hash is cyrb53 (non-crypto) — fine for in-project dedup, but revisit
      if collisions ever matter.
- [ ] No "save before discard" guard on Open: replacing the current project has
      no confirmation dialog. (New Project does prompt; Open does not.)

## Import
- [ ] (maybe) Open an animated GIF — one frame per GIF frame. Needs a GIF
      decoder; coalesce disposal/transparency. Bigger lift than PNG.

## Export


## Performance
- [ ] `compositeFrame` re-composites the whole frame on every paint dispatch
      (`document/model.ts` + `PixelCanvas.tsx`). Fine at 32–128px; revisit with
      dirty-rect blitting if large canvases feel sluggish.
