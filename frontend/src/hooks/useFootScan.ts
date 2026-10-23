import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { SegmentationClient } from '../segmentation/client'
import { mapTap, snapshotSize, type Point } from '../segmentation/geometry'
import { colorMask } from '../segmentation/mask'

type Phase = 'idle' | 'selecting' | 'loading' | 'processing' | 'result' | 'error'
interface ScanState { phase: Phase; message: string; warnings: string[] }
const initial: ScanState = { phase: 'idle', message: '', warnings: [] }

export function useFootScan(videoRef: RefObject<HTMLVideoElement | null>, active: boolean) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const client = useRef<SegmentationClient | null>(null)
  const generation = useRef(0)
  const pending = useRef(false)
  const [state, setState] = useState<ScanState>(initial)

  const cancel = useCallback(() => {
    generation.current++
    pending.current = false
    client.current?.dispose()
    client.current = null
    if (canvasRef.current) { canvasRef.current.width = 1; canvasRef.current.height = 1 }
  }, [])

  useEffect(() => {
    const hide = () => { if (document.hidden) cancel() }
    window.addEventListener('pagehide', cancel)
    document.addEventListener('visibilitychange', hide)
    // Synchronize scan lifetime with the external camera stream (including disconnects).
    if (!active) {
      cancel()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(initial)
    }
    return () => {
      window.removeEventListener('pagehide', cancel)
      document.removeEventListener('visibilitychange', hide)
      cancel()
    }
  }, [active, cancel])

  const retry = () => {
    if (pending.current) cancel()
    generation.current++
    if (canvasRef.current) { canvasRef.current.width = 1; canvasRef.current.height = 1 }
    setState({ phase: 'selecting', message: 'Tap Foot to Select — tap inside one visible foot.', warnings: [] })
  }

  const select = async (position: Point) => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!active || state.phase !== 'selecting' || pending.current || !video || !canvas) return
    const point = mapTap(position, video.getBoundingClientRect(), { width: video.videoWidth, height: video.videoHeight })
    if (!point) {
      setState({ phase: 'selecting', message: 'Tap inside the camera image, away from the empty borders. Wait if the frame is not ready.', warnings: [] })
      return
    }
    const attempt = ++generation.current
    pending.current = true
    try {
      const size = snapshotSize(video.videoWidth, video.videoHeight)
      canvas.width = size.width
      canvas.height = size.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('This browser could not capture an image. Close other tabs and retry.')
      // Freeze this exact frame before any asynchronous model loading.
      context.drawImage(video, 0, 0, size.width, size.height)
      const pixels = context.getImageData(0, 0, size.width, size.height)
      setState({ phase: 'loading', message: 'Preparing segmentation… The first scan downloads a 30.5 MB model.', warnings: [] })
      client.current ??= new SegmentationClient()
      const mask = await client.current.segment(pixels, point, () => {
        if (generation.current === attempt) setState({ phase: 'processing', message: 'Segmenting the selected region…', warnings: [] })
      })
      if (generation.current !== attempt) return
      const { rgba, selected, warnings } = colorMask(mask)
      const overlay = document.createElement('canvas')
      overlay.width = mask.width
      overlay.height = mask.height
      const overlayContext = overlay.getContext('2d')
      if (!overlayContext) throw new Error('Not enough resources to draw the mask. Close other tabs and retry.')
      overlayContext.putImageData(new ImageData(rgba, mask.width, mask.height), 0, 0)
      context.drawImage(overlay, 0, 0, canvas.width, canvas.height)
      overlay.width = 1
      overlay.height = 1
      setState({ phase: 'result', message: selected ? 'Segmentation Preview — candidate region highlighted in green.' : 'Segmentation Preview — no region selected.', warnings })
    } catch (error) {
      if (generation.current !== attempt) return
      client.current?.dispose()
      client.current = null
      setState({ phase: 'error', message: error instanceof Error ? error.message : 'Scanning failed. Close other tabs and retry.', warnings: [] })
    } finally {
      if (generation.current === attempt) pending.current = false
    }
  }

  return { ...state, canvasRef, retry, select, frozen: ['loading', 'processing', 'result', 'error'].includes(state.phase) }
}
