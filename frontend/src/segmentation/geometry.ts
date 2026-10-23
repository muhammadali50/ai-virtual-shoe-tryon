export interface Point { x: number; y: number }
export interface ImageSize { width: number; height: number }

/** Map viewport coordinates through centered CSS object-fit. No CSS rotation/mirroring. */
export function mapTap(
  point: Point, rect: ImageSize & { left: number; top: number }, image: ImageSize,
  fit: 'contain' | 'cover' = 'contain',
): Point | null {
  if (![point.x, point.y, rect.left, rect.top, rect.width, rect.height, image.width, image.height].every(Number.isFinite)
    || Math.min(rect.width, rect.height, image.width, image.height) <= 0) return null
  const scale = (fit === 'contain' ? Math.min : Math.max)(rect.width / image.width, rect.height / image.height)
  const x = point.x - rect.left
  const y = point.y - rect.top
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
  const normalized = {
    x: (x - (rect.width - image.width * scale) / 2) / (image.width * scale),
    y: (y - (rect.height - image.height * scale) / 2) / (image.height * scale),
  }
  if (normalized.x < 0 || normalized.x > 1 || normalized.y < 0 || normalized.y > 1) return null
  return normalized
}

export function snapshotSize(width: number, height: number): ImageSize {
  if (width <= 0 || height <= 0) throw new Error('The camera has no frame yet. Wait a moment and retry.')
  const scale = Math.min(1, 768 / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
