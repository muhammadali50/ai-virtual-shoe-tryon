import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CameraPreview from './CameraPreview'
import type { CandidateMask } from '../segmentation/mask'

const { segment, dispose } = vi.hoisted(() => ({ segment: vi.fn(), dispose: vi.fn() }))
vi.mock('../segmentation/client', () => ({ SegmentationClient: class { segment = segment; dispose = dispose } }))
const drawImage = vi.fn()
const putImageData = vi.fn()

beforeEach(() => {
  segment.mockReset()
  dispose.mockReset()
  drawImage.mockReset()
  putImageData.mockReset()
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  const track = { stop: vi.fn(), onended: null }
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track], getVideoTracks: () => [track] }),
  } })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage, putImageData,
    getImageData: () => ({ width: 768, height: 432, data: new Uint8ClampedArray(768 * 432 * 4) }),
  } as unknown as CanvasRenderingContext2D)
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  vi.stubGlobal('PointerEvent', MouseEvent)
})
afterEach(() => vi.unstubAllGlobals())

async function prepare() {
  const view = render(<CameraPreview />)
  expect(screen.getByRole('button', { name: 'Scan Foot' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: /Start Camera/ }))
  await screen.findByText('Camera live')
  const video = view.container.querySelector('video')!
  Object.defineProperties(video, { videoWidth: { value: 1280 }, videoHeight: { value: 720 } })
  vi.spyOn(video, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 300, height: 400 } as DOMRect)
  fireEvent.click(screen.getByRole('button', { name: 'Scan Foot' }))
  return view
}
const tap = (x = 160, y = 220) => fireEvent.pointerUp(screen.getByLabelText('Tap the foot in the camera image'), { clientX: x, clientY: y })
const mask: CandidateMask = { width: 3, height: 3, values: new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 0]) }

describe('foot scan workflow', () => {
  it('captures the tapped frame, maps the point, renders returned pixels and retries', async () => {
    segment.mockImplementation(async (_image, _point, processing) => { processing(); return mask })
    const { container } = await prepare()
    tap(160, 50)
    expect(segment).not.toHaveBeenCalled()
    tap()
    await screen.findByText(/candidate region highlighted/)
    expect(segment).toHaveBeenCalledWith(expect.objectContaining({ width: 768, height: 432 }), { x: 0.5, y: 0.5 }, expect.any(Function))
    expect(drawImage.mock.calls[0][0]).toBe(container.querySelector('video'))
    expect(putImageData).toHaveBeenCalledOnce()
    expect(screen.getByText(/not verified foot detection/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByText(/Tap Foot to Select/)).toBeInTheDocument()
    expect(container.querySelector('canvas')).toHaveAttribute('hidden')
  })
  it.each(['Stop Camera', 'Retry', 'unmount', 'pagehide', 'hidden'])('discards late inference after %s', async (action) => {
    let resolve!: (mask: CandidateMask) => void
    segment.mockReturnValue(new Promise<CandidateMask>((done) => { resolve = done }))
    const { unmount } = await prepare()
    tap()
    if (action === 'unmount') unmount()
    else if (action === 'pagehide') fireEvent(window, new Event('pagehide'))
    else if (action === 'hidden') {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      fireEvent(document, new Event('visibilitychange'))
    }
    else fireEvent.click(screen.getByRole('button', { name: new RegExp(action) }))
    await act(async () => resolve(mask))
    expect(dispose).toHaveBeenCalled()
    expect(putImageData).not.toHaveBeenCalled()
  })
  it('reports initialization failure and permits retry without a fabricated mask', async () => {
    segment.mockRejectedValue(new Error('Model could not load.'))
    await prepare()
    tap()
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/)
    expect(putImageData).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByText(/Tap Foot to Select/)).toBeInTheDocument()
  })
  it('handles snapshot allocation failure without invoking inference', async () => {
    await prepare()
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    tap()
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not capture/)
    expect(segment).not.toHaveBeenCalled()
  })
  it('accepts a keyboard-selected prompt', async () => {
    segment.mockResolvedValue(mask)
    await prepare()
    const target = screen.getByRole('button', { name: 'Tap the foot in the camera image' })
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 300, height: 400 } as DOMRect)
    fireEvent.focus(target)
    fireEvent.keyDown(target, { key: 'ArrowRight' })
    fireEvent.keyDown(target, { key: 'Enter' })
    await screen.findByText(/candidate region highlighted/)
    expect(segment.mock.calls[0][1].x).toBeCloseTo(0.525)
  })
  it('handles empty and broad edge masks as candidates', async () => {
    segment.mockResolvedValue({ width: 3, height: 3, values: new Float32Array(9) })
    await prepare()
    tap()
    await screen.findByText(/no region selected/)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    segment.mockResolvedValue({ width: 3, height: 3, values: new Float32Array(9).fill(1) })
    tap()
    await screen.findByText(/may be background/)
    expect(screen.getByText(/may be incomplete/)).toBeInTheDocument()
  })
})
