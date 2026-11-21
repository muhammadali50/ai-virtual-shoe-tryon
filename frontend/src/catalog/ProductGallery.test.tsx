import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ProductGallery from './ProductGallery'
import type { CatalogImage } from './types'

const images = (prefix: string, count: number): CatalogImage[] =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i + 1}`, src: `/img/${prefix}/${i + 1}.jpg`, width: 1800, height: 2700, view: i ? 'side' : 'angled' }))

const shown = (name: string) => screen.getByRole('group', { name: `${name} photos` }).querySelector('img')!.getAttribute('src')
const frame = (name: string) => screen.getByRole('group', { name: `${name} photos` }).querySelector('.gallery-frame')!
function swipe(name: string, dx: number, dy: number, pointerType = 'touch') {
  const target = frame(name)
  fireEvent.pointerDown(target, { pointerId: 1, pointerType, clientX: 200, clientY: 300 })
  fireEvent.pointerUp(target, { pointerId: 1, pointerType, clientX: 200 + dx, clientY: 300 + dy })
}

describe('ProductGallery', () => {
  it('starts on the main photo, lazy-loads it and reserves its frame size', () => {
    render(<ProductGallery productName="Oxford" images={images('a', 3)} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', '/img/a/1.jpg')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('width', '1800')
    expect(img).toHaveAttribute('height', '2700')
    expect(img).toHaveAccessibleName('Oxford, photo 1 of 3 (angled view)')
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('moves with labelled previous/next buttons and wraps around', () => {
    render(<ProductGallery productName="Oxford" images={images('a', 3)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next photo of Oxford' }))
    expect(shown('Oxford')).toBe('/img/a/2.jpg')
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous photo of Oxford' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous photo of Oxford' }))
    expect(shown('Oxford')).toBe('/img/a/3.jpg')
  })

  it('supports arrow keys while focus is in the gallery', () => {
    render(<ProductGallery productName="Oxford" images={images('a', 3)} />)
    const next = screen.getByRole('button', { name: 'Next photo of Oxford' })
    next.focus()
    fireEvent.keyDown(next, { key: 'ArrowRight' })
    fireEvent.keyDown(next, { key: 'ArrowRight' })
    expect(shown('Oxford')).toBe('/img/a/3.jpg')
    fireEvent.keyDown(next, { key: 'ArrowLeft' })
    expect(shown('Oxford')).toBe('/img/a/2.jpg')
  })

  it('swipes left for next and right for previous', () => {
    render(<ProductGallery productName="Oxford" images={images('a', 3)} />)
    swipe('Oxford', -80, 5)
    expect(shown('Oxford')).toBe('/img/a/2.jpg')
    swipe('Oxford', 80, -5)
    expect(shown('Oxford')).toBe('/img/a/1.jpg')
  })

  it('ignores vertical gestures, short drags, cancelled gestures and mouse drags', () => {
    render(<ProductGallery productName="Oxford" images={images('a', 3)} />)
    swipe('Oxford', -60, 200)
    swipe('Oxford', -20, 0)
    swipe('Oxford', -100, 0, 'mouse')
    fireEvent.pointerDown(frame('Oxford'), { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 300 })
    fireEvent.pointerCancel(frame('Oxford'), { pointerId: 2, pointerType: 'touch' })
    fireEvent.pointerUp(frame('Oxford'), { pointerId: 2, pointerType: 'touch', clientX: 50, clientY: 300 })
    expect(shown('Oxford')).toBe('/img/a/1.jpg')
  })

  it('keeps each gallery position independent', () => {
    render(<><ProductGallery productName="Oxford" images={images('a', 4)} /><ProductGallery productName="Loafer" images={images('b', 4)} /></>)
    swipe('Oxford', -80, 0)
    fireEvent.click(screen.getByRole('button', { name: 'Next photo of Oxford' }))
    expect(shown('Oxford')).toBe('/img/a/3.jpg')
    expect(shown('Loafer')).toBe('/img/b/1.jpg')
  })

  it('hides controls and the indicator for a single photo', () => {
    render(<ProductGallery productName="Derby" images={images('c', 1)} />)
    const group = screen.getByRole('group', { name: 'Derby photos' })
    expect(within(group).queryByRole('button')).toBeNull()
    expect(within(group).queryByText(/\//)).toBeNull()
    swipe('Derby', -80, 0)
    expect(shown('Derby')).toBe('/img/c/1.jpg')
  })
})
