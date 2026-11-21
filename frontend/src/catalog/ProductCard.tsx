import { useId, useState } from 'react'
import ProductGallery from './ProductGallery'
import { DESCRIPTION_PREVIEW_CHARS, formatPrice, formatSizes } from './format'
import { PRODUCT_MODELS } from './models'
import type { CatalogProduct } from './types'

function Description({ paragraphs }: { paragraphs: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  const long = paragraphs.join(' ').length > DESCRIPTION_PREVIEW_CHARS
  return (
    <div className="product-description">
      <div id={id} className={long && !expanded ? 'description-text is-clamped' : 'description-text'}>
        {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
      {long && (
        <button type="button" className="read-more" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  )
}

export default function ProductCard({ product }: { product: CatalogProduct }) {
  const headingId = useId()
  const price = formatPrice(product.price, product.currency)
  const sizes = formatSizes(product.sizes)
  return (
    <article className="product-card" id={`product-${product.id}`} data-product-id={product.id} aria-labelledby={headingId}>
      <ProductGallery productName={product.name} images={product.images} model={PRODUCT_MODELS[product.id]} />
      <div className="product-body">
        <div className="product-heading">
          <h3 id={headingId}>{product.name}</h3>
          {price && <p className="product-price">{price}</p>}
        </div>
        <dl className="product-facts">
          <div><dt>Article</dt><dd>{product.article}</dd></div>
          {product.color && <div><dt>Colour</dt><dd>{product.color}</dd></div>}
          {sizes && <div><dt>Sizes</dt><dd>{sizes}</dd></div>}
        </dl>
        {product.description
          ? <Description paragraphs={product.description} />
          : <p className="product-description is-missing">Description not yet collected for this style.</p>}
        <p className="try-on-soon"><span aria-hidden="true" className="try-on-dot" />Virtual try-on coming soon</p>
      </div>
    </article>
  )
}
