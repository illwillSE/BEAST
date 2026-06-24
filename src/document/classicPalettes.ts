// Built-in retro system palettes for the "Classic Palettes" picker — each a
// well-documented, fixed hardware palette (not a curated/artistic one), so
// loading "Commodore 64" actually gives you the C64's real 16 colors. Hex
// values sourced from Lospec's palette list, lowercased to match the
// rgbaToHex / DEFAULT_PALETTE convention (model.ts).

export interface ClassicPalette {
  id: string
  name: string
  colors: string[]
}

export const CLASSIC_PALETTES: ClassicPalette[] = [
  {
    id: 'c64',
    name: 'Commodore 64',
    colors: [
      '#000000', '#626262', '#898989', '#adadad', '#ffffff', '#9f4e44', '#cb7e75', '#6d5412',
      '#a1683c', '#c9d487', '#9ae29b', '#5cab5e', '#6abfc6', '#887ecb', '#50459b', '#a057a3',
    ],
  },
  {
    id: 'nes',
    name: 'NES',
    colors: [
      '#000000', '#fcfcfc', '#f8f8f8', '#bcbcbc', '#7c7c7c', '#a4e4fc', '#3cbcfc', '#0078f8',
      '#0000fc', '#b8b8f8', '#6888fc', '#0058f8', '#0000bc', '#d8b8f8', '#9878f8', '#6844fc',
      '#4428bc', '#f8b8f8', '#f878f8', '#d800cc', '#940084', '#f8a4c0', '#f85898', '#e40058',
      '#a80020', '#f0d0b0', '#f87858', '#f83800', '#a81000', '#fce0a8', '#fca044', '#e45c10',
      '#881400', '#f8d878', '#f8b800', '#ac7c00', '#503000', '#d8f878', '#b8f818', '#00b800',
      '#007800', '#b8f8b8', '#58d854', '#00a800', '#006800', '#b8f8d8', '#58f898', '#00a844',
      '#005800', '#00fcfc', '#00e8d8', '#008888', '#004058', '#f8d8f8', '#787878',
    ],
  },
  {
    id: 'pico8',
    name: 'PICO-8',
    colors: [
      '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
      '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
    ],
  },
  {
    id: 'sms',
    name: 'Sega Master System',
    colors: [
      '#000000', '#550000', '#aa0000', '#ff0000', '#005500', '#555500', '#aa5500', '#ff5500',
      '#00aa00', '#55aa00', '#aaaa00', '#ffaa00', '#00ff00', '#55ff00', '#aaff00', '#ffff00',
      '#000055', '#550055', '#aa0055', '#ff0055', '#005555', '#555555', '#aa5555', '#ff5555',
      '#00aa55', '#55aa55', '#aaaa55', '#ffaa55', '#00ff55', '#55ff55', '#aaff55', '#ffff55',
      '#0000aa', '#5500aa', '#aa00aa', '#ff00aa', '#0055aa', '#5555aa', '#aa55aa', '#ff55aa',
      '#00aaaa', '#55aaaa', '#aaaaaa', '#ffaaaa', '#00ffaa', '#55ffaa', '#aaffaa', '#ffffaa',
      '#0000ff', '#5500ff', '#aa00ff', '#ff00ff', '#0055ff', '#5555ff', '#aa55ff', '#ff55ff',
      '#00aaff', '#55aaff', '#aaaaff', '#ffaaff', '#00ffff', '#55ffff', '#aaffff', '#ffffff',
    ],
  },
]
