export interface CandidateMask { width: number; height: number; values: Float32Array }

/** Threshold actual model output. These checks describe geometry, never object identity. */
export function colorMask(mask: CandidateMask) {
  const { width, height, values } = mask
  if (width < 1 || height < 1 || width * height !== values.length || values.length > 768 * 768) {
    throw new Error('The model returned an invalid mask. Please retry.')
  }
  const rgba = new Uint8ClampedArray(values.length * 4)
  let selected = 0
  let touchesEdge = false
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i]) || values[i] < 0 || values[i] > 1) throw new Error('The model returned invalid mask values.')
    if (values[i] < 0.5) continue
    rgba.set([61, 226, 170, 110], i * 4)
    selected++
    if (i < width || i >= width * (height - 1) || i % width === 0 || i % width === width - 1) touchesEdge = true
  }
  const warnings: string[] = []
  if (!selected) warnings.push('No region was selected. Keep one foot visible, improve lighting and retry.')
  if (selected / values.length > 0.8) warnings.push('Most of the image was selected; this may be background. Retry and tap inside your foot.')
  if (touchesEdge) warnings.push('The candidate reaches the image edge and may be incomplete. Fit the whole foot in view and retry.')
  return { rgba, selected, warnings }
}
