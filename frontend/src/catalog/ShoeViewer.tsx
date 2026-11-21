import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { lightShoeStudio } from './shoeStudio'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { CatalogImage } from './types'

type Phase = 'loading' | 'ready' | 'error'

interface Props {
  src: string
  productName: string
  note: string
  fallbackImage: CatalogImage
  onBack: () => void
}

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** Default camera: front three-quarter from the lateral side, slightly above (like the angled photo). */
const DEFAULT_DIRECTION = new THREE.Vector3(-0.752, 0.474, 0.459).normalize()

/**
 * Lazy-loaded 3D slide. Renders only on demand (no animation loop), so the shoe stays still until
 * the user drags. Rotation only, around the model's fixed centre; no pan, no wheel zoom (wheel keeps
 * scrolling the page). Falls back to the product photo if WebGL or the GLB is unavailable.
 */
export default function ShoeViewer({ src, productName, note, fallbackImage, onBack }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const resetRef = useRef<() => void>(() => {})
  const [supported] = useState(webglAvailable)
  const [phase, setPhase] = useState<Phase>(supported ? 'loading' : 'error')

  useEffect(() => {
    const container = host.current
    if (!container || !supported) return
    let disposed = false
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      queueMicrotask(() => setPhase('error')) // context creation failed: show the photo fallback
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.domElement.className = 'viewer-canvas'
    renderer.domElement.dataset.galleryGesture = 'ignore' // the gallery must not treat drags here as swipes
    renderer.domElement.setAttribute('aria-hidden', 'true')
    container.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 10)
    const environment = lightShoeStudio(renderer, scene, camera)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableZoom = false
    controls.enableDamping = false
    controls.rotateSpeed = 0.9

    const render = () => renderer.render(scene, camera)
    let radius = 0
    // Fit the model's bounding sphere to the narrower field of view so the whole shoe stays in
    // frame from every angle (the slide is portrait). Keeps the current viewing direction.
    const fit = () => {
      if (!radius) return
      const vHalf = THREE.MathUtils.degToRad(camera.fov / 2)
      const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect)
      const distance = (radius / Math.sin(Math.min(vHalf, hHalf))) * 1.02
      const direction = camera.position.clone().sub(controls.target).normalize()
      camera.position.copy(controls.target).addScaledVector(direction, distance)
      camera.near = distance / 50
      camera.far = distance * 10
      camera.updateProjectionMatrix()
    }
    const resize = () => {
      const { width, height } = container.getBoundingClientRect()
      if (!width || !height) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      fit()
      camera.updateProjectionMatrix()
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    controls.addEventListener('change', render)

    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(src, (gltf) => {
      if (disposed) return
      scene.add(gltf.scene)
      const box = new THREE.Box3().setFromObject(gltf.scene)
      const centre = box.getCenter(new THREE.Vector3())
      radius = box.getSize(new THREE.Vector3()).length() / 2
      controls.target.copy(centre)
      camera.position.copy(centre).add(DEFAULT_DIRECTION)
      const { width, height } = container.getBoundingClientRect()
      if (width && height) camera.aspect = width / height
      fit()
      controls.update()
      controls.saveState()
      resetRef.current = () => { controls.reset(); fit(); render() }
      resize()
      setPhase('ready')
    }, undefined, () => {
      if (disposed) return
      teardown() // release the GPU context right away; the photo fallback takes over
      setPhase('error')
    })

    function teardown() {
      if (disposed) return
      disposed = true
      observer.disconnect()
      controls.dispose()
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        mesh.geometry?.dispose()
        for (const material of ([] as THREE.Material[]).concat(mesh.material ?? [])) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose()
          material.dispose()
        }
      })
      environment.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
    return teardown
  }, [src, supported])

  if (phase === 'error') {
    return (
      <div key="fallback" className="viewer viewer-fallback" role="group" aria-label={`${productName} 3D view unavailable`}>
        <img className="gallery-image" src={fallbackImage.src} alt={`${productName}, photo`} width={fallbackImage.width ?? undefined} height={fallbackImage.height ?? undefined} />
        <div className="viewer-message" role="alert">
          <p>The 3D view could not load on this device. Showing the photo instead.</p>
          <button type="button" className="viewer-button" onClick={onBack}>Back to photos</button>
        </div>
      </div>
    )
  }

  return (
    <div key="viewer" className="viewer" ref={host} role="group" aria-roledescription="3D viewer"
      aria-label={`${productName} 3D model. Drag to rotate.`} aria-busy={phase === 'loading'}>
      {phase === 'loading' && <p className="viewer-loading" role="status">Loading 3D model…</p>}
      {phase === 'ready' && (
        <div className="viewer-toolbar">
          <button type="button" className="viewer-button" onClick={() => resetRef.current()}>Reset view</button>
          <span className="viewer-hint">Drag to rotate</span>
        </div>
      )}
      <p className="viewer-note">{note}</p>
    </div>
  )
}
