import { FilesetResolver, InteractiveSegmenter, type BrushMode } from '@mediapipe/tasks-vision'
import type { Point } from './geometry'
import type { CandidateMask } from './mask'

// 1.1.1 declares BrushMode but omits its runtime export. POSITIVE = 1 in its .d.ts.
const POSITIVE: BrushMode = 1

/** Adapter boundary for replacing the general segmenter with a future foot model. */
export async function createEngine(assetRoot: string) {
  const vision = await FilesetResolver.forVisionTasks(`${assetRoot}wasm`, true)
  const task = await InteractiveSegmenter.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `${assetRoot}interactive_segmentation.task`, delegate: 'CPU' },
  })
  return {
    segment(image: ImageData, point: Point): CandidateMask {
      task.setImage(image)
      const mask = task.segment([{ brushMode: POSITIVE, point: [point], isCompleted: true }])
      try {
        return { width: mask.width, height: mask.height, values: new Float32Array(mask.getAsFloat32Array()) }
      } finally { mask.close() }
    },
    close: () => task.close(),
  }
}
