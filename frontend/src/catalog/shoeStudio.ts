import * as THREE from 'three'

/** Broad studio reflections bring out black calf grain while the underside remains legible. */
export function lightShoeStudio(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const studio = new THREE.Scene()
  studio.background = new THREE.Color().setScalar(0.105)
  const plane = new THREE.PlaneGeometry()
  const cards: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = []
  function softbox(x: number, y: number, z: number, width: number, height: number, luminance: number) {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(luminance) })
    const card = new THREE.Mesh(plane, material)
    card.position.set(x, y, z)
    card.lookAt(0, 0, 0)
    card.scale.set(width, height, 1)
    studio.add(card)
    cards.push(card)
  }
  softbox(-3.0, 2.1, -0.6, 7.8, 2.4, 2.3)
  softbox(2.9, 2.1, 0.8, 6.0, 3.4, 2.6)
  softbox(0.2, 0.80, -3.5, 5.1, 2.4, 5.5)
  softbox(0.2, -3.8, 0.1, 14.0, 14.0, 0.018)
  const generator = new THREE.PMREMGenerator(renderer)
  const environment = generator.fromScene(studio, 0.095)
  generator.dispose()
  plane.dispose()
  for (const card of cards) card.material.dispose()
  renderer.toneMapping = THREE.NoToneMapping
  scene.environment = environment.texture
  scene.environmentIntensity = 0.83
  const fill = new THREE.DirectionalLight(0xffffff, 0.62)
  fill.position.set(-0.48, 0.92, 0.58)
  camera.add(fill, fill.target)
  scene.add(camera, new THREE.HemisphereLight(0xffffff, 0xe7e5df, 0.28))
  return environment
}

