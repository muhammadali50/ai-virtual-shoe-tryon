import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import type { Plugin } from 'vite'
import { normalizeCatalog } from '../src/catalog/normalize.ts'

export const CATALOG_MODULE = 'virtual:logo-formal-catalog'
const RESOLVED = `\0${CATALOG_MODULE}`

/**
 * Exposes the LOGO Formal dataset as `virtual:logo-formal-catalog`.
 * Reads data/logo-formal/products.json at build time, verifies each local photo exists and
 * matches its recorded SHA-256, and imports the original files so Vite serves them in dev
 * and fingerprints them into dist/assets on build. The dataset itself is never modified.
 */
export function logoFormalCatalog(repoRoot: string): Plugin {
  const datasetDir = resolve(repoRoot, 'data/logo-formal')
  const imagesDir = resolve(datasetDir, 'images')
  const productsPath = resolve(datasetDir, 'products.json')
  const hashCache = new Map<string, { mtime: number; size: number; hash: string }>()

  const sha256 = (file: string) => {
    const { mtimeMs, size } = statSync(file)
    const cached = hashCache.get(file)
    if (cached && cached.mtime === mtimeMs && cached.size === size) return cached.hash
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex')
    hashCache.set(file, { mtime: mtimeMs, size, hash })
    return hash
  }

  return {
    name: 'logo-formal-catalog',
    resolveId: (id) => (id === CATALOG_MODULE ? RESOLVED : undefined),
    load(id) {
      if (id !== RESOLVED) return
      this.addWatchFile(productsPath)
      const result = normalizeCatalog(JSON.parse(readFileSync(productsPath, 'utf8')), (localPath, expected) => {
        const file = resolve(repoRoot, localPath)
        if (!file.startsWith(imagesDir + sep)) return 'outside'
        if (!existsSync(file)) return 'missing'
        return expected && sha256(file) !== expected ? 'checksum' : 'ok'
      })
      for (const issue of result.issues) this.warn(issue)

      const imports: string[] = []
      const products = result.products.map((product) => ({
        ...product,
        images: product.images.map(({ localPath, ...image }) => {
          const file = resolve(repoRoot, localPath)
          this.addWatchFile(file)
          imports.push(`import __img${imports.length} from ${JSON.stringify(file)}`)
          return { ...image, src: `__IMG_${imports.length - 1}__` }
        }),
      }))
      const data = JSON.stringify({ collectedOn: result.collectedOn, products, stats: result.stats })
        .replace(/"__IMG_(\d+)__"/g, '__img$1')
      return `// Generated from ${relative(repoRoot, productsPath)}\n${imports.join('\n')}\nexport default ${data}\n`
    },
  }
}
