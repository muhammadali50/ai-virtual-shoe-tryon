import { createEngine } from './engine'
import type { Point } from './geometry'

let engine: Awaited<ReturnType<typeof createEngine>> | undefined
self.onmessage = async (event: MessageEvent<{ image: ImageData; point: Point; assetRoot: string }>) => {
  let phase = 'loading'
  try {
    engine ??= await createEngine(event.data.assetRoot)
    phase = 'processing'
    self.postMessage({ phase })
    const mask = engine.segment(event.data.image, event.data.point)
    self.postMessage({ mask }, { transfer: [mask.values.buffer] })
  } catch {
    engine?.close()
    engine = undefined
    self.postMessage({ error: phase })
  }
}
