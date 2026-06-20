// ZIP project save/load. Layout: manifest.json at the root + one cells/<hash>.bin
// per unique pixel buffer. Built on the shared serialize layer.

import JSZip from 'jszip'
import { serializeProject, deserializeProject } from './serialize.js'

export async function projectToZipBlob(doc) {
  const { manifest, blobs } = serializeProject(doc)
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(manifest))
  const cells = zip.folder('cells')
  // JSZip accepts Uint8Array but not Uint8ClampedArray, so view the same bytes.
  for (const [hash, buf] of blobs) {
    cells.file(hash + '.bin', new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
  }
  return zip.generateAsync({ type: 'blob' })
}

export async function projectFromZipFile(file) {
  const zip = await JSZip.loadAsync(file)
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) throw new Error('Not a BEAST project: manifest.json missing')
  const manifest = JSON.parse(await manifestFile.async('string'))

  const blobs = new Map()
  const entries = zip.folder('cells')?.file(/\.bin$/) ?? []
  for (const entry of entries) {
    const hash = entry.name.replace(/^cells\//, '').replace(/\.bin$/, '')
    blobs.set(hash, await entry.async('uint8array'))
  }
  return deserializeProject({ manifest, blobs })
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
