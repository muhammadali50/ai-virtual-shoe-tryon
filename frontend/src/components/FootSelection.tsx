import { useState, type KeyboardEvent } from 'react'
import type { Point } from '../segmentation/geometry'

/** The optional crosshair is a user-controlled prompt, never a detection result. */
export default function FootSelection({ onSelect }: { onSelect: (point: Point) => void }) {
  const [cursor, setCursor] = useState<Point | null>(null)
  const handleKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const point = cursor ?? { x: 0.5, y: 0.5 }
    const directions: Record<string, Point> = {
      ArrowLeft: { x: -0.025, y: 0 }, ArrowRight: { x: 0.025, y: 0 },
      ArrowUp: { x: 0, y: -0.025 }, ArrowDown: { x: 0, y: 0.025 },
    }
    if (directions[event.key]) {
      event.preventDefault()
      const change = directions[event.key]
      setCursor({ x: Math.max(0, Math.min(1, point.x + change.x)), y: Math.max(0, Math.min(1, point.y + change.y)) })
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      onSelect({ x: rect.left + point.x * rect.width, y: rect.top + point.y * rect.height })
    }
  }
  return (
    <button className="scan-target" type="button" aria-label="Tap the foot in the camera image"
      aria-description="Or use arrow keys to move the selection cursor and Enter to select."
      onFocus={() => setCursor({ x: 0.5, y: 0.5 })}
      onBlur={() => setCursor(null)} onKeyDown={handleKey}
      onPointerUp={(event) => onSelect({ x: event.clientX, y: event.clientY })}>
      {cursor && <span className="selection-cursor" style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }} aria-hidden="true">+</span>}
    </button>
  )
}
