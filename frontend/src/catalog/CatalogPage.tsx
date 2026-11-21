import ProductCard from './ProductCard'
import type { Catalog, CatalogImage } from './types'

/** Studio angled photo of the cap-toe oxford; the pair sits at 26–62% of its height, inside the hero's 4:5 crop. */
export const HERO_IMAGE_ID = '25011-black-02'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatDate(isoDate: string | null) {
  const match = isoDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : null
}

function pickHeroImage(catalog: Catalog): { image: CatalogImage; name: string } | null {
  for (const product of catalog.products) {
    const image = product.images.find((candidate) => candidate.id === HERO_IMAGE_ID)
    if (image) return { image, name: product.name }
  }
  const fallback = catalog.products[0]
  return fallback ? { image: fallback.images[0], name: fallback.name } : null
}

function exploreCollection() {
  const section = document.getElementById('collection')
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  section?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  // Move keyboard and screen-reader focus with the scroll.
  document.getElementById('collection-title')?.focus({ preventScroll: true })
}

export default function CatalogPage({ catalog }: { catalog: Catalog }) {
  const hero = pickHeroImage(catalog)
  const count = catalog.products.length
  const recordedOn = formatDate(catalog.collectedOn)
  const scanUrl = `${import.meta.env.BASE_URL}scan/`

  return (
    <div className="catalog-page">
      <a className="skip-link" href="#collection">Skip to collection</a>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="wordmark" href={import.meta.env.BASE_URL} aria-label="Step / Into home">
            <span className="wordmark-mark" aria-hidden="true">↗</span> STEP / INTO
          </a>
          <nav aria-label="Primary">
            <ul className="site-nav">
              <li><a href="#collection">Collection</a></li>
              <li><a href={scanUrl}>Foot scan</a></li>
            </ul>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-inner">
            <div className="hero-copy">
              <p className="eyebrow">The formal edit</p>
              <h1 id="hero-title">Formal <span>Footwear</span></h1>
              <p className="hero-lede">
                {count} formal styles, each shown from every angle we have. Browse the collection now.
                Virtual try-on is on its way.
              </p>
              <button type="button" className="button-primary" onClick={exploreCollection}>
                Explore Collection <span aria-hidden="true">↓</span>
              </button>
            </div>
            {hero && (
              <figure className="hero-figure">
                <span className="hero-diagonal" aria-hidden="true" />
                <div className="hero-arch">
                  <img className="hero-shoe" src={hero.image.src} alt={`${hero.name}, angled studio view`}
                    width={hero.image.width ?? undefined} height={hero.image.height ?? undefined}
                    fetchPriority="high" decoding="async" />
                </div>
              </figure>
            )}
          </div>
        </section>

        <section className="collection" id="collection" aria-labelledby="collection-title">
          <div className="collection-inner">
            <div className="collection-header">
              <h2 id="collection-title" tabIndex={-1}>Formal Collection</h2>
              <p className="collection-meta">
                {count} {count === 1 ? 'style' : 'styles'} · {catalog.stats.photos} photos
                {recordedOn && <><br />Prices and sizes as recorded on {recordedOn}.</>}
              </p>
            </div>
            {count ? (
              <ul className="product-grid">
                {catalog.products.map((product) => (
                  <li key={product.id}><ProductCard product={product} /></li>
                ))}
              </ul>
            ) : (
              <p className="collection-empty">No products with local photos are available yet.</p>
            )}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <p className="footer-name">AI Virtual Shoe Try-On</p>
          <ul className="footer-links">
            <li><a href="#collection">Back to collection ↑</a></li>
            <li><a href={scanUrl}>Foot scan prototype</a></li>
          </ul>
          <p className="footer-note">Product names and photography from the LOGO formal collection, used here for a project prototype.</p>
        </div>
      </footer>
    </div>
  )
}
