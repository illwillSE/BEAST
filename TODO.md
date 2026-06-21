# TODO

Deferred / planned work — open items only. See [README.md](./README.md) for what's already
implemented; this file tracks what isn't, organized by area.

## Core data models
- [ ] Content-addressed storage for binary pixel data (BLAST sample-cache pattern).
- [ ] (optional) Per-sprite undo — scope history per sprite so undo/redo only
      affects the active sprite, not the whole project. Currently global.

## Canvas
- [ ] Crop tool: resize handles on all edges/corners (currently only
      drag-from-inside to reposition), with an appropriate resize cursor on hover.
- [ ] Sane max canvas size cap for performance.
- [ ] A clear canvas button.

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
- [ ] Color select — select all pixels of a specific color (e.g. click a
      color, or eyedropper-style sample) across the layer/canvas, for use as
      a mask or to drive color replace.
- [ ] Type tool — render text onto the canvas (font select, maybe a predefined
      set) and an emoji picker/insert.
- [ ] Eraser: decide whether it stays a separate tool (current) or is also
      reachable via right-click while another paint tool is active.
- [ ] Adjustable pixel width (brush/stroke size), not just fixed 1px.
- [ ] Transform tools: flip horizontal / flip vertical (whole layer or
      selection content, not the live mirror-painting guides), and a
      move/nudge tool to shift layer content in place (distinct from the
      existing select-then-move-floating-region workflow).
- [ ] Gradient drag preview (`tools/registry.ts` gradient entry, rendered in
      `PixelCanvas.tsx`) only draws the Bresenham line between drag endpoints,
      not anything representing the gradient spread itself (now fg→bg).

## Color
- [ ] Docked sidebar (`LayersPanel` + `ColorPanel` both pinned) can still clip
      at the bottom on short viewports — the `<aside>` in `App.tsx` has no
      `overflow-y-auto`/scroll fallback. Folding the Color panel's gradient
      section (added) reduces this but doesn't eliminate it, since
      `LayersPanel`'s height is unbounded and independent of it. Consider
      `overflow-y-auto` on the `<aside>` or a per-panel max-height/scroll if
      it recurs. Also, in some conditions the color palette grid itself
      expands below the app's layout/viewport rather than staying contained.
      Minor cosmetic bug, not urgent — needs a proper tweak later rather than
      another band-aid.
- [ ] Right-click paints with bg color instead of fg — deliberately deferred
      when fg/bg landed. Needs `event.button` handling in `PixelCanvas.tsx`
      (`handleDown`/`ctxFor` currently treat all clicks the same) and
      suppressing the canvas's `contextmenu` event; decide which tools it
      applies to (eraser already paints transparent, so it wouldn't apply there).
- [ ] Managed swatch palette (loadable/savable) — palette is currently a single
      in-memory list (`App.tsx` `palette` state, seeded from
      `ColorPanel.DEFAULT_PALETTE`); no save/load or multiple named palettes
      yet. The header's "New palette" button is still a placeholder for this.
- [ ] Eyedropper magnifier doesn't appear until the pointer moves — it's only
      set inside the move handler (`PixelCanvas.tsx`, `handleMove`), not on
      activation/click, so Shift+I (or selecting Eyedropper) shows nothing
      until you first move the mouse over the canvas. Also decide: should the
      magnifier work everywhere in the app (e.g. hovering UI/palette swatches),
      or stay canvas-only as it is now?
- [ ] Eyedropper magnifier can go stale: the Shift+I temporary-tool revert
      clears it on pick, but switching away from the eyedropper via its
      keyboard shortcut or the toolbar — while hovering, without moving the
      mouse afterward — leaves the magnifier popup frozen on screen. It's
      only cleared reactively in `handleMove`/`onPointerLeave`
      (`PixelCanvas.tsx`), not when the `tool` prop itself changes. Fix:
      clear `magnifier` in a `useEffect` keyed on `tool` instead of
      point-patching just the temporary-tool completion path.
- [ ] Shift+I currently reverts to the previous tool after *any* click while
      the temporary eyedropper is active, even if the sampled pixel is
      transparent (no color actually picked). Decide if that's the desired
      behavior, or if it should only revert after a successful pick.

## Layers
- [ ] Delete button doesn't match sprite delete's UX: in `SpriteList.tsx` the
      delete icon is hidden until row hover (`opacity-0 group-hover:opacity-100`)
      and fully disappears when disabled (last sprite). In `LayersPanel.tsx`
      (and `FramesTimeline.tsx`, same pattern for frames) the delete icon is
      always visible and just dims (`disabled:opacity-30`) when it's the last
      layer/frame. Make layer and frame delete match the sprite-delete
      hover-reveal behavior for consistency.
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
