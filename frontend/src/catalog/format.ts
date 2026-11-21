/** Descriptions longer than this are collapsed behind "Read more". */
export const DESCRIPTION_PREVIEW_CHARS = 180

export function formatPrice(price: number | null, currency: string | null) {
  if (price === null) return null
  return `${currency ?? ''} ${price.toLocaleString('en-US')}`.trim()
}

/** "39–44" for a contiguous whole-number run of three or more, otherwise the recorded list. */
export function formatSizes(sizes: string[]) {
  if (!sizes.length) return null
  const numbers = sizes.map(Number)
  const contiguous = sizes.length > 2 && numbers.every(Number.isInteger) && numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1)
  return contiguous ? `${sizes[0]}–${sizes[sizes.length - 1]}` : sizes.join(', ')
}
