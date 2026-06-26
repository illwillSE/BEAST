class _ImageData {
  data: Uint8ClampedArray
  width: number
  height: number
  constructor(w: number, h: number) {
    this.width = w
    this.height = h
    this.data = new Uint8ClampedArray(w * h * 4)
  }
}
;(globalThis as any).ImageData = _ImageData
