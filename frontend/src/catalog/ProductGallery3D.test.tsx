import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProductGallery from './ProductGallery'
import type { ProductModel } from './models'
import type { CatalogImage } from './types'

// The real viewer needs WebGL; this stand-in exposes the props and a canvas marked like the real one.
vi.mock('./ShoeViewer', () => ({
  default: ({ src, onBack }: { src: string; onBack: () => void }) => (
    <div data-testid="viewer" data-src={src}>
      <canvas data-testid="viewer-canvas" data-gallery-gesture="ignore" />
      <button type="button" onClick={onBack}>Back to photos</button>
    </div>
  ),
}))

const images: CatalogImage[] = [1, 2, 3].map((n) => ({ id: `s-0${n}`, src: `/img/s/${n}.jpg`, width: 1800, height: 2700, view: 'side' }))
const model: ProductModel = { src: '/models/s.glb', foot: 'right', note: 'approximation' }
const photo = () => screen.queryByRole('img')?.getAttribute('src') ?? null
function swipe(target: Element, dx: number, dy = 0) {
  fireEvent.pointerDown(target, { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 300 })
  fireEvent.pointerUp(target, { pointerId: 1, pointerType: 'touch', clientX: 200 + dx, clientY: 300 + dy })
}

describe('ProductGallery with a 3D slide', () => {
  it('starts on the main photo and appends 3D after the last photo', async () => {
    render(<ProductGallery productName="Loafer" images={images} model={model} />)
    expect(photo()).toBe('/img/s/1.jpg')
    expect(screen.getByText('1 / 4')).toBeInTheDocument()
    expect(screen.queryByTestId('viewer')).toBeNull() // lazy: nothing 3D until opened
    const next = screen.getByRole('button', { name: 'Next slide of Loafer' })
    fireEvent.click(next); fireEvent.click(next)
    expect(photo()).toBe('/img/s/3.jpg')
    fireEvent.click(next)
    expect(await screen.findByTestId('viewer')).toHaveAttribute('data-src', '/models/s.glb')
    expect(screen.getByText('3D · 4 / 4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '3D View' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reaches 3D by swiping from the last photo, and drags inside the viewer never change slide', async () => {
    const { container } = render(<ProductGallery productName="Loafer" images={images} model={model} />)
    const frame = container.querySelector('.gallery-frame')!
    swipe(frame, -80); swipe(frame, -80); swipe(frame, -80)
    const canvas = await screen.findByTestId('viewer-canvas')
    swipe(canvas, -150); swipe(canvas, 150); swipe(canvas, 0, -200)
    expect(screen.getByTestId('viewer')).toBeInTheDocument()
    expect(screen.getByText('3D · 4 / 4')).toBeInTheDocument()
    swipe(frame, 80) // a swipe on the frame itself (outside the canvas) still navigates
    expect(photo()).toBe('/img/s/3.jpg')
  })

  it('opens from the 3D View shortcut and returns to the last photo viewed', async () => {
    render(<ProductGallery productName="Loafer" images={images} model={model} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next slide of Loafer' }))
    fireEvent.click(screen.getByRole('button', { name: /3D View/ }))
    await screen.findByTestId('viewer')
    fireEvent.click(screen.getByRole('button', { name: 'Photos' }))
    expect(photo()).toBe('/img/s/2.jpg')
    fireEvent.click(screen.getByRole('button', { name: /3D View/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Back to photos' }))
    expect(photo()).toBe('/img/s/2.jpg')
    expect(screen.getByRole('button', { name: 'Photos' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps independent positions when two galleries are on the page', async () => {
    render(<><ProductGallery productName="Loafer" images={images} model={model} /><ProductGallery productName="Derby" images={images} /></>)
    fireEvent.click(screen.getByRole('button', { name: /3D View/ }))
    await screen.findByTestId('viewer')
    expect(screen.getByRole('img', { name: /Derby, photo 1 of 3/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /3D View/ })).toHaveLength(1)
  })
})
