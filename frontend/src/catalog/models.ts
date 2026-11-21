/** 3D models keyed by the catalog's stable product ID (dataset slug). */
export interface ProductModel {
  /** GLB URL. Units metres, +Y up, toe toward +Z, origin on the ground at mid-footprint. */
  src: string
  foot: 'left' | 'right'
  /** Short honest label shown in the viewer. */
  note: string
}

export const PRODUCT_MODELS: Record<string, ProductModel> = {
  '2649-bka': {
    src: `${import.meta.env.BASE_URL}models/2649-bka.glb`,
    foot: 'right',
    note: '3D approximation built from product photos, not a scan.',
  },
}
