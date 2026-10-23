import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'

// Official MagicTouch v2 bundle, verified with tasks-vision 1.1.1.
const source = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/latest/interactive_segmentation.task'
const checksum = '38431bc66b883404e8397f74c3579404315b9b52b04a46c6346fe906a7309b03'
const directory = new URL('../public/segmentation/', import.meta.url)
const destination = new URL('interactive_segmentation.task', directory)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
await mkdir(directory, { recursive: true })
let bytes
try { bytes = await readFile(destination) } catch (error) {
  if (error.code !== 'ENOENT') throw error
}
if (!bytes || hash(bytes) !== checksum) {
  const response = await fetch(source, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`)
  bytes = Buffer.from(await response.arrayBuffer())
  // Never silently pick up a changed model behind Google's latest URL.
  if (hash(bytes) !== checksum) throw new Error('Model checksum changed. Review compatibility before updating the pinned checksum.')
  await writeFile(destination, bytes)
}
await cp(new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url), new URL('wasm/', directory), { recursive: true })
console.log('Verified MagicTouch model and copied matching MediaPipe WASM assets.')
