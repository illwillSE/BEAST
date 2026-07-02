# BEAST Keyboard Shortcuts

## Tools

| Key | Tool |
|-----|------|
| `B` | Pencil (brush) |
| `E` | Eraser |
| `G` | Fill (flood fill) |
| `N` | Gradient fill — press again to cycle Linear / Radial |
| `I` | Eyedropper |
| `L` | Line — press again to cycle Single / Continuous |
| `R` | Rectangle — press again to cycle Outline / Filled |
| `O` | Ellipse — press again to cycle Outline / Filled |
| `M` | Select (rectangular marquee) |
| `W` | Select by Color — press again to cycle Contiguous / Global |
| `C` | Crop |
| `V` | Move |
| `T` | Stretch |
| `Shift+I` | Eyedropper (temporary — hold while sampling, releases on key up) |

> Pressing a tool's key while it's already active cycles its variants (Outline ↔ Filled, etc.).

## Brush Size

| Key | Action |
|-----|--------|
| `,` | Decrease brush size (min 1) |
| `.` | Increase brush size (max 20) |

Applies only when the active tool uses brush size: Pencil, Eraser, Line, Rectangle, Ellipse, Outline, Stretch.

## Edit

| Key | Action |
|-----|--------|
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Cmd/Ctrl+Y` | Redo (alternate) |
| `Cmd/Ctrl+C` | Copy selection |
| `Cmd/Ctrl+X` | Cut selection |
| `Cmd/Ctrl+V` | Paste |
| `X` | Swap foreground / background color |

## Selection

| Key | Action |
|-----|--------|
| `Cmd/Ctrl+A` | Select all |
| `Cmd/Ctrl+D` | Deselect |
| `Cmd/Ctrl+Shift+I` | Invert selection |
| `Backspace` / `Delete` | Clear selection to background color |
| `Enter` | Commit floating selection / commit crop |
| `Escape` | Commit floating, clear selection, cancel crop, cancel continuous line |
| `Shift+click` (select tools) | Add to selection |
| `Cmd/Ctrl+Shift+click` (select tools) | Subtract from selection |

## Canvas / Layer

| Key | Action |
|-----|--------|
| `←` / `→` | Step frame (when Move tool is not active) |
| `←` / `→` (Move tool) | Nudge layer 1px left / right |
| `↑` / `↓` (Move tool) | Nudge layer 1px up / down |
| `Shift+←` / `Shift+→` (Move tool) | Nudge layer 10px left / right |
| `Shift+↑` / `Shift+↓` (Move tool) | Nudge layer 10px up / down |

## Shape Modifiers (held during drag)

| Key | Tool | Effect |
|-----|------|--------|
| `Shift` | Rectangle | Constrain to square |
| `Shift` | Ellipse | Constrain to circle |
| `Shift` | Line | Snap to nearest 45° angle |
| `Shift` | Gradient | Snap to nearest 45° angle |
| `Shift` | Stretch | Lock aspect ratio |
| `Cmd/Ctrl` | Rectangle | Draw from center |
| `Cmd/Ctrl` | Ellipse | Draw from center |
| `Cmd/Ctrl+Shift` | Rectangle | Draw from center + constrain to square |
| `Cmd/Ctrl+Shift` | Ellipse | Draw from center + constrain to circle |
| `Cmd/Ctrl` | Stretch | Resize from center |
| `Cmd/Ctrl+Shift` | Stretch | Resize from center + lock aspect ratio |

## View

| Key | Action |
|-----|--------|
| `Cmd/Ctrl+P` | Open command palette |
| `Shift+Space` | Toggle preview window |
