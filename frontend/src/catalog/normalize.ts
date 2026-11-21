// Pure dataset normalization. Runs at build time inside the Vite plugin and in unit tests,
// so it must not use DOM or Node APIs. File checks are injected by the caller.
import type { CatalogImage, CatalogProduct, CatalogStats } from './types.ts'

export type FileCheck = 'ok' | 'missing' | 'checksum' | 'outside'

/** A product whose images still carry their dataset-relative path instead of a served URL. */
export interface SourceProduct extends Omit<CatalogProduct, 'images'> {
  images: (Omit<CatalogImage, 'src'> & { localPath: string })[]
}

export interface NormalizedCatalog {
  collectedOn: string | null
  products: SourceProduct[]
  stats: CatalogStats
  issues: string[]
}

type RawRecord = Record<string, unknown>
const isRecord = (value: unknown): value is RawRecord => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)
const positive = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null)

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' }

function decodeEntity(match: string, body: string) {
  if (body[0] === '#') {
    const code = body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? match
}

/**
 * Convert stored description HTML into plain-text paragraphs, keeping the original wording.
 * The output is rendered as React text, so no markup from the dataset ever reaches the DOM.
 */
export function htmlToParagraphs(html: string): string[] {
  const plain = html
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(p|div|ul|ol|h[1-6]|section|article|blockquote|table)\b[^>]*>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|section|article|blockquote|table|tr)\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, decodeEntity)
  return plain
    .split(/\n[ \t\u00a0]*\n/)
    .map((paragraph) => paragraph.split('\n').map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim()).filter(Boolean).join('\n'))
    .filter(Boolean)
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Build one entry per unique product that has at least one usable local photo.
 * Photos are ordered main-first, then by recorded gallery position, and deduplicated by
 * path and content hash. Distinct slugs are never merged, even when names match.
 */
export function normalizeCatalog(records: unknown, check: (localPath: string, sha256: string | null) => FileCheck): NormalizedCatalog {
  if (!Array.isArray(records)) throw new Error('products.json must contain an array of product records.')
  const issues: string[] = []
  const products: SourceProduct[] = []
  const seen = new Set<string>()
  const dates = new Set<string>()
  const stats: CatalogStats = {
    records: records.length, products: 0, photos: 0, excludedWithoutPhotos: 0,
    duplicatePhotosRemoved: 0, missingFiles: 0, checksumFailures: 0, missingDescriptions: [],
  }

  records.forEach((record, index) => {
    const slug = isRecord(record) ? text(record.slug) : null
    const name = isRecord(record) ? text(record.name) : null
    if (!isRecord(record) || !slug || !SLUG.test(slug) || !name) {
      issues.push(`Record ${index} skipped: missing or invalid slug/name.`)
      return
    }
    if (seen.has(slug)) {
      issues.push(`Record ${index} skipped: duplicate slug "${slug}".`)
      return
    }
    seen.add(slug)

    const mainId = text(record.main_image)
    const gallery = (Array.isArray(record.gallery) ? record.gallery : []).filter(isRecord)
      .map((entry, order) => ({ entry, order, position: positive(entry.gallery_position) ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => {
        const aMain = a.entry.is_main === true || (mainId !== null && a.entry.image_id === mainId)
        const bMain = b.entry.is_main === true || (mainId !== null && b.entry.image_id === mainId)
        return Number(bMain) - Number(aMain) || a.position - b.position || a.order - b.order
      })

    const paths = new Set<string>()
    const hashes = new Set<string>()
    const images: SourceProduct['images'] = []
    for (const { entry, order } of gallery) {
      const localPath = text(entry.local_path)
      if (!localPath) continue
      const sha = text(entry.sha256)?.toLowerCase() ?? null
      if (paths.has(localPath) || (sha && hashes.has(sha))) {
        stats.duplicatePhotosRemoved++
        continue
      }
      const status = check(localPath, sha)
      if (status !== 'ok') {
        if (status === 'checksum') stats.checksumFailures++
        else stats.missingFiles++
        issues.push(`${slug}: ${localPath} excluded (${status}).`)
        continue
      }
      paths.add(localPath)
      if (sha) hashes.add(sha)
      images.push({
        id: text(entry.image_id) ?? `${slug}-${order + 1}`,
        localPath,
        width: positive(entry.width),
        height: positive(entry.height),
        view: text(entry.view_angle),
      })
    }

    if (!images.length) {
      stats.excludedWithoutPhotos++
      return
    }
    const date = text(record.collection_date)
    if (date) dates.add(date)
    const description = text(record.description)
    const paragraphs = description ? htmlToParagraphs(description) : []
    if (!paragraphs.length) stats.missingDescriptions.push(slug)
    const sizes = (Array.isArray(record.size_variants) ? record.size_variants : [])
      .map((variant) => (isRecord(variant) ? text(String(variant.size ?? '')) : null))
      .filter((size): size is string => size !== null)

    products.push({
      id: slug,
      name,
      brand: text(record.brand),
      article: slug.toUpperCase(),
      color: text(record.color),
      price: positive(record.price),
      currency: text(record.currency),
      sizes: [...new Set(sizes)],
      description: paragraphs.length ? paragraphs : null,
      sourceUrl: text(record.canonical_product_url),
      images,
    })
    stats.photos += images.length
  })

  stats.products = products.length
  return { collectedOn: dates.size === 1 ? [...dates][0] : null, products, stats, issues }
}
