import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SegmentationClient } from './client'
import type { CandidateMask } from './mask'

class MockWorker {
  static instances: MockWorker[] = []
  onmessage?: (event: { data: unknown }) => void
  onerror?: () => void
  onmessageerror?: () => void
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() { MockWorker.instances.push(this) }
  reply(data: unknown) { this.onmessage?.({ data }) }
}
const { createEngine, close, infer } = vi.hoisted(() => ({ createEngine: vi.fn(), close: vi.fn(), infer: vi.fn() }))
vi.mock('./engine', () => ({ createEngine }))
const image = () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }) as ImageData
const mask: CandidateMask = { width: 1, height: 1, values: new Float32Array([1]) }

beforeEach(() => {
  MockWorker.instances = []
  vi.stubGlobal('Worker', MockWorker)
  vi.stubGlobal('OffscreenCanvas', class {})
  createEngine.mockReset().mockResolvedValue({ segment: infer, close })
  infer.mockReset().mockReturnValue(mask)
  close.mockReset()
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('segmentation transport', () => {
  it('transfers pixels, receives a real-shaped mask and reuses a single worker', async () => {
    const client = new SegmentationClient()
    const processing = vi.fn()
    const pixels = image()
    const first = client.segment(pixels, { x: 0.2, y: 0.3 }, processing)
    const worker = MockWorker.instances[0]
    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ image: pixels, point: { x: 0.2, y: 0.3 } }), [pixels.data.buffer])
    worker.reply({ phase: 'processing' })
    worker.reply({ mask })
    expect(await first).toEqual(mask)
    expect(processing).toHaveBeenCalledOnce()
    const second = client.segment(image(), { x: 0.8, y: 0.8 }, processing)
    worker.reply({ mask })
    await second
    expect(MockWorker.instances).toHaveLength(1)
    client.dispose()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
  it('rejects pending inference on disposal', async () => {
    const client = new SegmentationClient()
    const pending = client.segment(image(), { x: 0.5, y: 0.5 }, vi.fn())
    const rejected = expect(pending).rejects.toThrow(/cancelled/)
    client.dispose()
    await rejected
  })
  it('terminates a hung worker and reports a timeout', async () => {
    vi.useFakeTimers()
    const client = new SegmentationClient()
    const pending = client.segment(image(), { x: 0.5, y: 0.5 }, vi.fn())
    const rejected = expect(pending).rejects.toThrow(/timed out/)
    await vi.advanceTimersByTimeAsync(90_000)
    await rejected
    expect(MockWorker.instances[0].terminate).toHaveBeenCalledOnce()
  })
  it.each(['loading', 'processing'])('explains %s failures', async (error) => {
    const client = new SegmentationClient()
    const pending = client.segment(image(), { x: 0.5, y: 0.5 }, vi.fn())
    const rejected = expect(pending).rejects.toThrow(error === 'loading' ? /could not load/ : /could not finish/)
    MockWorker.instances[0].reply({ error })
    await rejected
    client.dispose()
  })
  it('rejects concurrent calls instead of building a frame backlog', async () => {
    const client = new SegmentationClient()
    const pending = client.segment(image(), { x: 0.5, y: 0.5 }, vi.fn())
    await expect(client.segment(image(), { x: 0, y: 0 }, vi.fn())).rejects.toThrow()
    MockWorker.instances[0].reply({ mask })
    await pending
    client.dispose()
  })
  it('uses a single controlled snapshot engine if workers are unavailable', async () => {
    vi.stubGlobal('Worker', undefined)
    const client = new SegmentationClient()
    await expect(client.segment(image(), { x: 0.5, y: 0.5 }, vi.fn())).resolves.toEqual(mask)
    await client.segment(image(), { x: 0.1, y: 0.1 }, vi.fn())
    expect(createEngine).toHaveBeenCalledOnce()
    expect(infer).toHaveBeenCalledTimes(2)
    client.dispose()
    expect(close).toHaveBeenCalledOnce()
  })
})
