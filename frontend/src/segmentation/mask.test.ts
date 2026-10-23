import { describe, expect, it } from 'vitest'
import { colorMask } from './mask'

describe('genuine mask rendering', () => {
  it('colors only selected model pixels without manufacturing a region', () => {
    const values = new Float32Array(9)
    values[4] = 0.9
    const result = colorMask({ width: 3, height: 3, values })
    expect(result.selected).toBe(1)
    expect([...result.rgba.slice(16, 20)]).toEqual([61, 226, 170, 110])
    expect(result.rgba[3]).toBe(0)
    expect(result.warnings).toEqual([])
  })
  it('keeps an empty mask transparent and suggests retry, without claiming no foot', () => {
    const result = colorMask({ width: 2, height: 2, values: new Float32Array(4) })
    expect(result.rgba.every((value) => value === 0)).toBe(true)
    expect(result.warnings.join()).toMatch(/No region/)
  })
  it('warns for possible background and incomplete selection', () => {
    const result = colorMask({ width: 3, height: 3, values: new Float32Array(9).fill(1) })
    expect(result.warnings.join()).toMatch(/may be background/)
    expect(result.warnings.join()).toMatch(/may be incomplete/)
  })
  it('rejects invalid model data', () => {
    expect(() => colorMask({ width: 2, height: 2, values: new Float32Array(1) })).toThrow()
    expect(() => colorMask({ width: 1, height: 1, values: new Float32Array([NaN]) })).toThrow()
  })
})
