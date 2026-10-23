import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CameraPreview from './CameraPreview'

const getUserMedia = vi.fn()
function fakeStream() {
  const track = { stop: vi.fn(), onended: null as (() => void) | null }
  const stream = {
    getTracks: () => [track], getVideoTracks: () => [track],
  } as unknown as MediaStream
  return { stream, track }
}
function start() { fireEvent.click(screen.getByRole('button', { name: /Start Camera/ })) }
function stop() { fireEvent.click(screen.getByRole('button', { name: /Stop Camera/ })) }

beforeEach(() => {
  getUserMedia.mockReset()
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
})

describe('CameraPreview', () => {
  it('starts only on request, prefers rear video without audio, and stops tracks', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    const { container } = render(<StrictMode><CameraPreview /></StrictMode>)
    expect(getUserMedia).not.toHaveBeenCalled()
    start()
    await screen.findByText('Camera live')
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    })
    const video = container.querySelector('video')!
    expect(video.srcObject).toBe(stream)
    expect(video.muted).toBe(true)
    expect(video).toHaveAttribute('playsinline')
    stop()
    expect(track.stop).toHaveBeenCalledOnce()
    expect(video.srcObject).toBeNull()
    expect(screen.getByText('Camera off')).toBeInTheDocument()
  })

  it.each([
    ['NotAllowedError', /permission was denied/],
    ['NotFoundError', /No camera was found/],
    ['NotReadableError', /camera is unavailable/],
    ['OverconstrainedError', /requested settings/],
  ])('explains %s and permits retry', async (name, message) => {
    getUserMedia.mockRejectedValue(new DOMException('failed', name))
    render(<CameraPreview />)
    start()
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: /Start Camera/ })).toBeEnabled()
  })

  it('rejects an insecure context before requesting permission', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false })
    render(<CameraPreview />)
    start()
    expect(await screen.findByRole('alert')).toHaveTextContent(/HTTPS/)
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('explains unsupported browsers', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined })
    render(<CameraPreview />)
    start()
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not support/)
  })

  it.each(['stop', 'unmount', 'pagehide', 'hidden'])('releases a late stream after %s', async (action) => {
    let resolve!: (value: MediaStream) => void
    getUserMedia.mockReturnValue(new Promise<MediaStream>((done) => { resolve = done }))
    const { stream, track } = fakeStream()
    const { unmount } = render(<CameraPreview />)
    start()
    if (action === 'stop') stop()
    if (action === 'unmount') unmount()
    if (action === 'pagehide') fireEvent(window, new Event('pagehide'))
    if (action === 'hidden') {
      Object.defineProperty(document, 'hidden', { value: true })
      fireEvent(document, new Event('visibilitychange'))
    }
    await act(async () => { resolve(stream) })
    expect(track.stop).toHaveBeenCalledOnce()
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
  })

  it.each(['unmount', 'pagehide', 'hidden'])('releases an active stream on %s', async (action) => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    const { unmount } = render(<CameraPreview />)
    start()
    await screen.findByText('Camera live')
    if (action === 'unmount') unmount()
    if (action === 'pagehide') fireEvent(window, new Event('pagehide'))
    if (action === 'hidden') {
      Object.defineProperty(document, 'hidden', { value: true })
      fireEvent(document, new Event('visibilitychange'))
    }
    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('cleans up when playback fails', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error('play failed'))
    render(<CameraPreview />)
    start()
    await screen.findByRole('alert')
    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('handles a camera disconnected by the device', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    render(<CameraPreview />)
    start()
    await screen.findByText('Camera live')
    act(() => { track.onended?.() })
    expect(screen.getByRole('alert')).toHaveTextContent(/disconnected/)
    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('does not attach an older request over a restarted camera', async () => {
    let resolve!: (value: MediaStream) => void
    const old = fakeStream()
    const current = fakeStream()
    getUserMedia.mockReturnValueOnce(new Promise<MediaStream>((done) => { resolve = done }))
    getUserMedia.mockResolvedValueOnce(current.stream)
    const { container } = render(<CameraPreview />)
    start()
    stop()
    start()
    await screen.findByText('Camera live')
    await act(async () => { resolve(old.stream) })
    await waitFor(() => expect(old.track.stop).toHaveBeenCalledOnce())
    expect(container.querySelector('video')!.srcObject).toBe(current.stream)
    expect(current.track.stop).not.toHaveBeenCalled()
  })
})
