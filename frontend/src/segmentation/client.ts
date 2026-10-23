import type { createEngine } from './engine'
import type { Point } from './geometry'
import type { CandidateMask } from './mask'

const loadError = 'The segmentation model could not load. Check your connection, reload and retry. Close other tabs if memory is limited.'
const inferenceError = 'Segmentation could not finish. Close other tabs to free memory, keep one foot in view and retry.'

/** One request at a time; retries reuse the worker/model. Dispose cancels pending work. */
export class SegmentationClient {
  private worker?: Worker
  private engine?: Awaited<ReturnType<typeof createEngine>>
  private rejectPending?: (error: Error) => void
  private disposed = false
  private busy = false
  private assetRoot = new URL(`${import.meta.env.BASE_URL}segmentation/`, window.location.href).href

  async segment(image: ImageData, point: Point, processing: () => void): Promise<CandidateMask> {
    if (this.busy || this.disposed) throw new Error('This scan was cancelled. Please retry.')
    this.busy = true
    try {
      if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
        this.worker ??= new Worker(new URL('./segment.worker.ts', import.meta.url), { type: 'module' })
        return await new Promise<CandidateMask>((resolve, reject) => {
          const timer = window.setTimeout(() => {
            finish(new Error('Scanning timed out. Check your connection, close other tabs and retry.'))
            this.dispose()
          }, 90_000)
          const finish = (error?: Error, mask?: CandidateMask) => {
            clearTimeout(timer)
            this.rejectPending = undefined
            if (error) reject(error)
            else if (mask) resolve(mask)
          }
          this.rejectPending = (error) => finish(error)
          this.worker!.onmessage = ({ data }: MessageEvent<{ phase?: string; error?: string; mask?: CandidateMask }>) => {
            if (data.phase) processing()
            if (data.error) finish(new Error(data.error === 'loading' ? loadError : inferenceError))
            if (data.mask) finish(undefined, data.mask)
          }
          this.worker!.onerror = () => { finish(new Error(inferenceError)); this.dispose() }
          this.worker!.onmessageerror = () => { finish(new Error(inferenceError)); this.dispose() }
          try { this.worker!.postMessage({ image, point, assetRoot: this.assetRoot }, [image.data.buffer]) }
          catch { finish(new Error(inferenceError)); this.dispose() }
        })
      }
      // Older browsers: one bounded snapshot only, with a paint before synchronous inference.
      if (!this.engine) {
        const { createEngine } = await import('./engine')
        const engine = await createEngine(this.assetRoot).catch(() => { throw new Error(loadError) })
        if (this.disposed) { engine.close(); throw new Error('Scan cancelled.') }
        this.engine = engine
      }
      processing()
      await new Promise<void>((resolve) => window.setTimeout(resolve, 50))
      if (this.disposed) throw new Error('Scan cancelled.')
      try { return this.engine.segment(image, point) }
      catch { throw new Error(inferenceError) }
    } finally { this.busy = false }
  }

  dispose() {
    this.disposed = true
    this.worker?.terminate()
    this.worker = undefined
    this.engine?.close()
    this.engine = undefined
    this.rejectPending?.(new Error('Scan cancelled.'))
    this.rejectPending = undefined
  }
}
