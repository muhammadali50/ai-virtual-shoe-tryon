/** One verified local photo. `src` is a Vite-served asset URL. */
export interface CatalogImage {
  id: string
  src: string
  width: number | null
  height: number | null
  view: string | null
}

/** One unique product. `id` is the dataset slug and is stable across builds. */
export interface CatalogProduct {
  id: string
  name: string
  brand: string | null
  article: string
  color: string | null
  price: number | null
  currency: string | null
  sizes: string[]
  /** Readable plain-text paragraphs derived from the stored description, or null if none was collected. */
  description: string[] | null
  sourceUrl: string | null
  images: CatalogImage[]
}

export interface CatalogStats {
  records: number
  products: number
  photos: number
  excludedWithoutPhotos: number
  duplicatePhotosRemoved: number
  missingFiles: number
  checksumFailures: number
  missingDescriptions: string[]
}

export interface Catalog {
  collectedOn: string | null
  products: CatalogProduct[]
  stats: CatalogStats
}
