import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { ProductModel } from './models'
import type { CatalogImage } from './types'

/** Horizontal travel (px) that counts as a swipe, and how dominant it must be over vertical travel. */
export const SWIPE_DISTANCE = 40
const SWIPE_DOMINANCE = 1.2

// three.js and the GLB load only when a 3D slide is first opened.
const ShoeViewer = lazy(() => import('./ShoeViewer'))

interface Props {
  productName: string
  images: CatalogImage[]
  /** Optional 3D model, shown as one extra slide after the last photo. */
  model?: ProductModel
  /** Load the first photo immediately instead of lazily (for above-the-fold use). */
  eager?: boolean
}

/**
 * One slide at a time in a fixed 2:3 frame (the dataset's photo ratio). Photos use object-fit:
 * contain so toe, heel and sole are never cropped. Each instance owns its position; nothing advances
 * until the user interacts. Drags that start inside the 3D viewer rotate the model and are never
 * treated as gallery swipes.
 */
export default function ProductGallery({ productName, images, model, eager = false }: Props) {
  const [index, setIndex] = useState(0)
  const [interacted, setInteracted] = useState(false)
  const lastPhoto = useRef(0)
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null)
  const modelIndex = model ? images.length : -1
  const count = images.length + (model ? 1 : 0)
  const showing3D = index === modelIndex
  const image = showing3D ? undefined : images[Math.min(index, images.length - 1)]

  const goTo = (next: number) => {
    setInteracted(true)
    if (next < images.length) lastPhoto.current = next
    setIndex(next)
  }
  const go = (delta: number) => {
    if (count < 2) return
    goTo((index + delta + count) % count)
  }

  // Warm the neighbouring photos only after the shopper starts browsing this gallery.
  useEffect(() => {
    if (!interacted || count < 2) return
    for (const next of [(index + 1) % count, (index - 1 + count) % count]) {
      if (next >= images.length) continue
      const preload = new Image()
      preload.decoding = 'async'
      preload.src = images[next].src
    }
  }, [interacted, index, images, count])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Mouse users get the arrow buttons; swipes are for touch and pen. The 3D canvas owns its drags.
    if (event.pointerType === 'mouse' || count < 2) return
    if ((event.target as Element).closest?.('[data-gallery-gesture="ignore"]')) return
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current
    gesture.current = null
    if (!start || start.id !== event.pointerId) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * SWIPE_DOMINANCE) go(dx < 0 ? 1 : -1)
  }
  // touch-action: pan-y lets the browser own vertical scrolling; it cancels our gesture when it does.
  const onPointerCancel = () => { gesture.current = null }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); go(1) }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1) }
  }

  if (!images.length) return null
  const position = `${index + 1} / ${count}`
  const unit = model ? 'slide' : 'photo'
  const label = image
    ? `${productName}, photo ${index + 1} of ${count}${image.view ? ` (${image.view} view)` : ''}`
    : ''

  return (
    <div className="gallery" role="group" aria-roledescription="carousel" aria-label={`${productName} photos`}
      onKeyDown={count > 1 ? onKeyDown : undefined}>
      <div className={`gallery-frame${showing3D ? ' is-3d' : ''}`} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
        {image && (
          <img key={image.id} className="gallery-image" src={image.src} alt={label}
            width={image.width ?? undefined} height={image.height ?? undefined}
            loading={eager || interacted ? 'eager' : 'lazy'} decoding="async" draggable={false} />
        )}
        {showing3D && model && (
          <Suspense fallback={<div className="viewer"><p className="viewer-loading" role="status">Loading 3D model…</p></div>}>
            <ShoeViewer src={model.src} productName={productName} note={model.note} fallbackImage={images[0]}
              onBack={() => goTo(lastPhoto.current)} />
          </Suspense>
        )}
        {count > 1 && (
          <>
            <button type="button" className="gallery-nav gallery-prev" aria-label={`Previous ${unit} of ${productName}`} onClick={() => go(-1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button type="button" className="gallery-nav gallery-next" aria-label={`Next ${unit} of ${productName}`} onClick={() => go(1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
            </button>
            <p className="gallery-count" aria-live="polite" aria-atomic="true">
              <span aria-hidden="true">{showing3D ? `3D · ${position}` : position}</span>
              <span className="visually-hidden">{showing3D ? `3D view, slide ${index + 1} of ${count}` : `Photo ${index + 1} of ${count}`}</span>
            </p>
          </>
        )}
      </div>
      {model && (
        <div className="gallery-modes" role="group" aria-label={`${productName} view mode`}>
          <button type="button" aria-pressed={!showing3D} onClick={() => goTo(lastPhoto.current)}>Photos</button>
          <button type="button" aria-pressed={showing3D} onClick={() => goTo(modelIndex)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 0v9m0 0l8-4.5M12 12l-8-4.5" /></svg>
            3D View
          </button>
        </div>
      )}
    </div>
  )
}
