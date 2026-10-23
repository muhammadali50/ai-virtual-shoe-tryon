import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'error'

function cameraError(error: unknown): string {
  // DOMExceptions can originate in another realm and fail instanceof Error.
  const name = typeof error === 'object' && error !== null && 'name' in error
    ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera permission was denied. Allow camera access in your browser’s site settings, then try again.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found. Connect or enable a camera, then try again.'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is unavailable. Close other apps using it, then try again.'
    case 'OverconstrainedError':
      return 'This camera cannot use the requested settings. Try another browser or camera.'
    default:
      return 'The camera preview could not start. Check camera access and try again.'
  }
}

/** Owns camera resources. videoRef exposes the native video for future consumers. */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const generation = useRef(0)
  const mounted = useRef(false)
  const requesting = useRef(false)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState('')

  const release = useCallback(() => {
    generation.current += 1
    requesting.current = false
    streamRef.current?.getTracks().forEach((track) => {
      track.onended = null
      track.stop()
    })
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const stop = useCallback(() => {
    release()
    setError('')
    setStatus('idle')
  }, [release])

  useEffect(() => {
    mounted.current = true
    const onHidden = () => { if (document.hidden) stop() }
    window.addEventListener('pagehide', stop)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      mounted.current = false
      window.removeEventListener('pagehide', stop)
      document.removeEventListener('visibilitychange', onHidden)
      release()
    }
  }, [release, stop])

  const start = useCallback(async () => {
    if (requesting.current || streamRef.current) return
    if (!window.isSecureContext) {
      setError('A secure connection is required. Open this page over HTTPS, or use localhost on this computer.')
      setStatus('error')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support camera access. Open this page in a current Safari or Chrome browser.')
      setStatus('error')
      return
    }

    const attempt = ++generation.current
    const isCurrent = () => mounted.current && generation.current === attempt
    requesting.current = true
    setError('')
    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      // A permission prompt can resolve after Stop, navigation or unmount.
      if (!isCurrent()) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (!video || stream.getVideoTracks().length === 0) {
        throw new Error('No video track available')
      }
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          if (!isCurrent()) return
          release()
          setStatus('error')
          setError('The camera disconnected or access ended. Tap Start Camera to reconnect.')
        }
      })
      video.srcObject = stream
      await video.play()
      if (isCurrent()) {
        requesting.current = false
        setStatus('active')
      }
    } catch (cause) {
      if (!isCurrent()) return
      release()
      setError(cameraError(cause))
      setStatus('error')
    }
  }, [release])

  return { videoRef, status, error, start, stop }
}
