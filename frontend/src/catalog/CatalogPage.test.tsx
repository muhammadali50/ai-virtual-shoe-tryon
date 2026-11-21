import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import catalog from 'virtual:logo-formal-catalog'
import CatalogPage from './CatalogPage'
import ProductCard from './ProductCard'
import { DESCRIPTION_PREVIEW_CHARS, formatPrice, formatSizes } from './format'
import type { CatalogProduct } from './types'

const base: CatalogProduct = {
  id: 'x-1', name: 'TEST OXFORD', brand: 'LOGO', article: 'X-1', color: null, price: 7500, currency: 'PKR',
  sizes: ['39', '40', '41'], description: null, sourceUrl: null,
  images: [{ id: 'x-1-01', src: '/x/1.jpg', width: 1800, height: 2700, view: 'angled' }],
}

describe('dataset-backed catalog (virtual:logo-formal-catalog)', () => {
  it('builds one product per unique slug that has local photos, with every photo', () => {
    // These counts come from data/logo-formal; update them deliberately if the dataset changes.
    expect(catalog.stats).toMatchObject({ records: 246, products: 15, photos: 72, excludedWithoutPhotos: 231, missingFiles: 0, checksumFailures: 0, duplicatePhotosRemoved: 0 })
    expect(new Set(catalog.products.map((p) => p.id)).size).toBe(catalog.products.length)
    expect(catalog.products.reduce((sum, p) => sum + p.images.length, 0)).toBe(72)
    for (const product of catalog.products) {
      expect(product.images[0].id).toBe(`${product.id}-01`)
      for (const image of product.images) expect(image.src).toContain(`/${product.id}/`)
    }
  })

  it('renders every product card once, with its own gallery and try-on placeholder', () => {
    render(<CatalogPage catalog={catalog} />)
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(catalog.products.length)
    expect(cards.map((card) => card.dataset.productId)).toEqual(catalog.products.map((p) => p.id))
    const leohardt = cards.filter((card) => within(card).queryByRole('heading', { name: 'LEOHARDT LOAFER' }))
    expect(leohardt.map((card) => card.id)).toEqual(['product-2649-bka', 'product-2649-bra'])
    expect(within(leohardt[0]).getByText(/Black milled-leather loafer with a metal buckle and lightweight outsole\./)).toBeInTheDocument()
    expect(within(leohardt[1]).getByText(/Description not yet collected/)).toBeInTheDocument()
    for (const card of cards) {
      expect(within(card).getAllByRole('group', { name: / photos$/ })).toHaveLength(1)
      expect(within(card).getByText('Virtual try-on coming soon')).toBeInTheDocument()
      expect(within(card).queryByRole('link')).toBeNull()
    }
  })

  it('gives only the first catalog product (2649-bka) a 3D View, after its photos', () => {
    render(<CatalogPage catalog={catalog} />)
    const cards = screen.getAllByRole('article')
    expect(cards[0].dataset.productId).toBe('2649-bka')
    expect(within(cards[0]).getByRole('button', { name: /3D View/ })).toBeInTheDocument()
    expect(within(cards[0]).getByText('1 / 6')).toBeInTheDocument()
    expect(within(cards[0]).getByRole('img')).toHaveAttribute('src', expect.stringContaining('2649-bka/01-main'))
    for (const card of cards.slice(1)) expect(within(card).queryByRole('button', { name: /3D View/ })).toBeNull()
  })

  it('has a single hero headline, a collection heading and links to sections that exist', () => {
    render(<CatalogPage catalog={catalog} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Formal Footwear')
    expect(screen.getByRole('heading', { level: 2, name: 'Formal Collection' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /ORVEX LACE UPS, angled studio view/ })).toHaveAttribute('src', expect.stringContaining('25011-black/02-angled'))
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Collection' })).toHaveAttribute('href', '#collection')
    expect(within(nav).getByRole('link', { name: 'Foot scan' })).toHaveAttribute('href', '/scan/')
    expect(screen.getByRole('link', { name: /Back to collection/ })).toHaveAttribute('href', '#collection')
  })

  it('Explore Collection scrolls to the grid and moves focus to its heading', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<CatalogPage catalog={catalog} />)
    fireEvent.click(screen.getByRole('button', { name: /Explore Collection/ }))
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Formal Collection' }))
  })

  it('shows an empty state instead of a broken grid when no products have photos', () => {
    render(<CatalogPage catalog={{ ...catalog, products: [] }} />)
    expect(screen.getByText(/No products with local photos/)).toBeInTheDocument()
  })
})

describe('ProductCard', () => {
  it('shows verified details and a clear gap note when the description is missing', () => {
    render(<ProductCard product={base} />)
    expect(screen.getByText('PKR 7,500')).toBeInTheDocument()
    expect(screen.getByText('X-1')).toBeInTheDocument()
    expect(screen.getByText('39–41')).toBeInTheDocument()
    expect(screen.getByText(/Description not yet collected/)).toBeInTheDocument()
    expect(screen.queryByText('Colour')).toBeNull()
  })

  it('collapses long descriptions behind Read more without losing text', () => {
    const long = 'Hand-lasted leather upper with a blind-stitched apron and a leather-lined footbed. '.repeat(4).trim()
    expect(long.length).toBeGreaterThan(DESCRIPTION_PREVIEW_CHARS)
    render(<ProductCard product={{ ...base, description: [long, 'Second paragraph.'] }} />)
    const toggle = screen.getByRole('button', { name: 'Read more' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Second paragraph.')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('does not offer Read more for short descriptions', () => {
    render(<ProductCard product={{ ...base, description: ['Short and complete.'] }} />)
    expect(screen.queryByRole('button', { name: 'Read more' })).toBeNull()
  })
})

describe('formatting', () => {
  it('formats prices and size runs', () => {
    expect(formatPrice(17900, 'PKR')).toBe('PKR 17,900')
    expect(formatPrice(null, 'PKR')).toBeNull()
    expect(formatSizes(['39', '40', '41', '42'])).toBe('39–42')
    expect(formatSizes(['40', '42', '44'])).toBe('40, 42, 44')
    expect(formatSizes(['40', '41'])).toBe('40, 41')
    expect(formatSizes([])).toBeNull()
  })
})
