import { spawnSync } from 'node:child_process'
import { mkdtempSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Re-export a packed master atomically so an interrupted artist export cannot break the gallery. */
export function exportBlenderModel(master, destination) {
  const output = fileURLToPath(destination)
  const temporary = mkdtempSync(join(dirname(output), '.shoe-export-'))
  const intermediate = join(temporary, 'blender.glb')
  const packed = join(temporary, 'gallery.glb')
  const script = fileURLToPath(new URL('./export-blender-model.py', import.meta.url))
  const packer = fileURLToPath(new URL('../node_modules/gltfpack/cli.js', import.meta.url))

  function run(executable, args) {
    const result = spawnSync(executable, args, { stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`${executable} failed with exit code ${result.status}`)
  }

  try {
    const paths = ['--', fileURLToPath(master), intermediate]
    if (process.env.BLENDER_PYTHON) {
      run(process.env.BLENDER_PYTHON, [script, ...paths])
    } else {
      run(process.env.BLENDER_BIN || 'blender', ['--background', '--factory-startup', '--python-exit-code', '1', '--python', script, ...paths])
    }
    run(process.execPath, [packer, '-i', intermediate, '-o', packed, '-kn', '-km', '-ke',
      '-vp', '16', '-vt', '14', '-vn', '16', '-cc', '-ce', 'ext'])
    renameSync(packed, output)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

