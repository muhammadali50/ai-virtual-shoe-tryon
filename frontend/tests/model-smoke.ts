import { SegmentationClient } from '../src/segmentation/client'
import { colorMask } from '../src/segmentation/mask'

const canvas = document.querySelector<HTMLCanvasElement>('#fixture')!
const context = canvas.getContext('2d')!
context.fillStyle = '#18232f'
context.fillRect(0, 0, canvas.width, canvas.height)
context.fillStyle = '#f2a13d'
context.beginPath()
context.ellipse(160, 120, 60, 85, 0, 0, 2 * Math.PI)
context.fill()
document.querySelector<HTMLButtonElement>('#run')!.onclick = async () => {
  const output = document.querySelector('#result')!
  const client = new SegmentationClient()
  output.textContent = 'Loading actual model…'
  try {
    const counts: number[] = []
    for (const point of [{ x: 0.5, y: 0.5 }, { x: 0.05, y: 0.05 }]) {
      const mask = await client.segment(context.getImageData(0, 0, canvas.width, canvas.height), point,
        () => { output.textContent = 'Running actual inference…' })
      if (mask.width !== canvas.width || mask.height !== canvas.height) throw new Error('Unexpected output dimensions')
      counts.push(colorMask(mask).selected)
    }
    if (!counts[0] || counts[0] === canvas.width * canvas.height || counts[0] === counts[1]) throw new Error('Expected nontrivial, prompt-dependent output')
    output.textContent = `PASS: real model, 320×240 finite masks, different prompts select ${counts.join(' and ')} pixels. Model reused for second scan. Synthetic fixture only; phone/foot accuracy unverified.`
  } catch (error) { output.textContent = `FAIL: ${String(error)}` }
  finally { client.dispose() }
}
