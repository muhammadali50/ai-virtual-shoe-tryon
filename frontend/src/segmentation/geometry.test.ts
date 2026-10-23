import { describe, expect, it } from 'vitest'
import { mapTap, snapshotSize } from './geometry'

describe('tap mapping', () => {
  const rect = { left: 10, top: 20, width: 300, height: 400 }
  it('maps a landscape image in a portrait contain viewport and rejects letterboxing', () => {
    const image = { width: 1280, height: 720 }
    expect(mapTap({ x: 160, y: 220 }, rect, image)).toEqual({ x: 0.5, y: 0.5 })
    expect(mapTap({ x: 10, y: 135.625 }, rect, image)).toEqual({ x: 0, y: 0 })
    expect(mapTap({ x: 160, y: 50 }, rect, image)).toBeNull()
    expect(mapTap({ x: 311, y: 220 }, rect, image)).toBeNull()
  })
  it('accounts for cover cropping', () => {
    const image = { width: 800, height: 400 }
    expect(mapTap({ x: 10, y: 20 }, rect, image, 'cover')).toEqual({ x: 0.3125, y: 0 })
    expect(mapTap({ x: 310, y: 420 }, rect, image, 'cover')).toEqual({ x: 0.6875, y: 1 })
  })
  it('uses browser-oriented dimensions after rotation without mirroring', () => {
    const image = { width: 720, height: 1280 }
    expect(mapTap({ x: 103.75, y: 120 }, rect, image)).toEqual({ x: 0.25, y: 0.25 })
    expect(mapTap({ x: 10, y: 220 }, rect, image)).toBeNull()
    expect(mapTap({ x: 160, y: 220 }, rect, { width: 0, height: 0 })).toBeNull()
  })
  it('bounds snapshot memory while preserving aspect ratio', () => {
    expect(snapshotSize(3840, 2160)).toEqual({ width: 768, height: 432 })
    expect(snapshotSize(2160, 3840)).toEqual({ width: 432, height: 768 })
    expect(snapshotSize(320, 240)).toEqual({ width: 320, height: 240 })
    expect(() => snapshotSize(0, 0)).toThrow(/no frame/)
  })
})
