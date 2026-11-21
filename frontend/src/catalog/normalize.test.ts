import { describe, expect, it } from 'vitest'
import { htmlToParagraphs, normalizeCatalog, type FileCheck } from './normalize'

const image = (slug: string, position: number, extra: Record<string, unknown> = {}) => ({
  image_id: `${slug}-0${position}`, gallery_position: position, is_main: position === 1,
  local_path: `data/logo-formal/images/${slug}/0${position}.jpg`, width: 1800, height: 2700,
  view_angle: position === 1 ? 'angled' : 'side', sha256: `${slug}-hash-${position}`, ...extra,
})
const product = (slug: string, extra: Record<string, unknown> = {}) => ({
  slug, name: 'LEOHARDT LOAFER', brand: 'LOGO', color: null, price: 8260, currency: 'PKR',
  size_variants: [{ size: '39' }, { size: '40' }], description: null, main_image: `${slug}-01`,
  canonical_product_url: `https://example.test/products/${slug}`, collection_date: '2026-11-21',
  gallery: [image(slug, 1), image(slug, 2)], ...extra,
})
const allOk = (): FileCheck => 'ok'

describe('htmlToParagraphs', () => {
  it('keeps the wording while turning markup into readable paragraphs', () => {
    expect(htmlToParagraphs('<p>Black <strong>milled-leather</strong> loafer.</p><p>Metal&nbsp;buckle &amp; light sole.</p>'))
      .toEqual(['Black milled-leather loafer.', 'Metal buckle & light sole.'])
  })
  it('renders lists and line breaks, and drops scripts and styles entirely', () => {
    expect(htmlToParagraphs('Upper:<br>Leather<ul><li>Cushioned</li><li>Rubber &#8220;grip&#8221;</li></ul><script>alert(1)</script><style>p{}</style>'))
      .toEqual(['Upper:\nLeather', '• Cushioned', '• Rubber “grip”'])
  })
  it('leaves plain text untouched', () => {
    expect(htmlToParagraphs('Black milled-leather loafer with a metal buckle and lightweight outsole.'))
      .toEqual(['Black milled-leather loafer with a metal buckle and lightweight outsole.'])
  })
  it('keeps escaped markup as visible text rather than markup', () => {
    expect(htmlToParagraphs('Use &lt;b&gt; carefully')).toEqual(['Use <b> carefully'])
  })
})

describe('normalizeCatalog', () => {
  it('keeps distinct slugs with the same name as separate products', () => {
    const result = normalizeCatalog([product('2649-bka'), product('2649-bra')], allOk)
    expect(result.products.map((p) => p.id)).toEqual(['2649-bka', '2649-bra'])
    expect(result.products.map((p) => p.article)).toEqual(['2649-BKA', '2649-BRA'])
    expect(result.stats).toMatchObject({ records: 2, products: 2, photos: 4 })
  })

  it('orders photos main-first, then by gallery position', () => {
    const gallery = [image('a', 3), image('a', 2, { is_main: false }), image('a', 1)]
    const [result] = normalizeCatalog([product('a', { gallery })], allOk).products
    expect(result.images.map((i) => i.id)).toEqual(['a-01', 'a-02', 'a-03'])
  })

  it('honours main_image even when it is not the lowest position', () => {
    const gallery = [image('a', 1, { is_main: false }), image('a', 2)]
    const [result] = normalizeCatalog([product('a', { gallery, main_image: 'a-02' })], allOk).products
    expect(result.images[0].id).toBe('a-02')
  })

  it('removes repeated references to the same photo by path or content hash', () => {
    const gallery = [image('a', 1), image('a', 2), image('a', 3, { sha256: 'a-hash-1' }), { ...image('a', 4), local_path: image('a', 2).local_path }]
    const result = normalizeCatalog([product('a', { gallery })], allOk)
    expect(result.products[0].images).toHaveLength(2)
    expect(result.stats.duplicatePhotosRemoved).toBe(2)
  })

  it('excludes products without usable local photos and reports missing or corrupt files', () => {
    const check = (path: string): FileCheck => (path.includes('/b/') ? 'missing' : path.endsWith('02.jpg') ? 'checksum' : 'ok')
    const result = normalizeCatalog([product('a'), product('b'), product('c', { gallery: [] })], check)
    expect(result.products.map((p) => p.id)).toEqual(['a'])
    expect(result.products[0].images).toHaveLength(1)
    expect(result.stats).toMatchObject({ excludedWithoutPhotos: 2, missingFiles: 2, checksumFailures: 1, photos: 1 })
    expect(result.issues.join('\n')).toMatch(/b\/01\.jpg excluded \(missing\)/)
  })

  it('records missing descriptions and keeps provided ones as paragraphs', () => {
    const result = normalizeCatalog([product('a', { description: '<p>Hand-finished.</p>' }), product('b', { description: '   ' })], allOk)
    expect(result.products[0].description).toEqual(['Hand-finished.'])
    expect(result.products[1].description).toBeNull()
    expect(result.stats.missingDescriptions).toEqual(['b'])
  })

  it('skips malformed and duplicate records instead of guessing', () => {
    const result = normalizeCatalog([product('a'), product('a'), { name: 'No slug' }, product('Bad Slug!'), 'nonsense'], allOk)
    expect(result.products.map((p) => p.id)).toEqual(['a'])
    expect(result.issues).toHaveLength(4)
  })

  it('rejects a dataset that is not an array', () => {
    expect(() => normalizeCatalog({}, allOk)).toThrow(/array/)
  })
})
