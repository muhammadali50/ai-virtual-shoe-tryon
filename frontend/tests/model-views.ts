// Dev-only inspection page for GLB models.
// Default: six reference angles.  ?distance=1.9 scales the camera distance.
// Single comparison view: ?cam=x,y,z (direction from the model centre) [&fov=deg] [&w=px&h=px] [&distance=k]
//   [&target=x,y,z] (metres) [&mirror=1] renders one view filling the page, for side-by-side photo comparisons.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { lightShoeStudio } from '../src/catalog/shoeStudio'

const params = new URLSearchParams(location.search)
const status = document.querySelector('#status')!
const url = params.get('model') ?? `${import.meta.env.BASE_URL}models/2649-bka.glb`
const custom = params.get('cam')
const W = Number(params.get('w') ?? 840), H = Number(params.get('h') ?? 640)
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setSize(W, H)
const scene = new THREE.Scene()
scene.background = new THREE.Color(params.get('bg') ?? '#e9e9e9')
const camera = new THREE.PerspectiveCamera(Number(params.get('fov') ?? 30), W / H, 0.005, 20)
lightShoeStudio(renderer, scene, camera)
const vec = (s: string | null) => (s ? new THREE.Vector3(...s.split(',').map(Number)) : null)

new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(url, (gltf) => {
  if (params.get('mirror') === '1') gltf.scene.scale.x = -1 // view as the opposite foot
  scene.add(gltf.scene)
  const box = new THREE.Box3().setFromObject(gltf.scene)
  const size = box.getSize(new THREE.Vector3()), centre = vec(params.get('target')) ?? box.getCenter(new THREE.Vector3())
  const r = size.length() * Number(params.get('distance') ?? 1.9)
  const views: [string, THREE.Vector3][] = custom ? [['custom', vec(custom)!]] : [
    ['front 3/4 (lateral)', new THREE.Vector3(-0.75, 0.55, 0.9)], ['lateral side (-X)', new THREE.Vector3(-1, 0.12, 0)],
    ['medial side (+X)', new THREE.Vector3(1, 0.12, 0)], ['top', new THREE.Vector3(0.001, 1, 0.0001)],
    ['heel (back)', new THREE.Vector3(0, 0.25, -1)], ['underside', new THREE.Vector3(0.001, -1, 0.0001)],
  ]
  const container = document.querySelector('#views')!
  if (custom) { document.body.classList.add('single'); container.innerHTML = '' }
  for (const [label, dir] of views) {
    camera.position.copy(centre).add(dir.normalize().multiplyScalar(r))
    camera.up.set(0, 1, 0)
    if (Math.abs(dir.y) > 0.99) camera.up.set(0, 0, 1)
    camera.lookAt(centre)
    renderer.render(scene, camera)
    const fig = document.createElement('figure')
    fig.innerHTML = `<img alt="${label}" width="${W}" height="${H}" src="${renderer.domElement.toDataURL()}">${custom ? '' : `<figcaption>${label}</figcaption>`}`
    container.append(fig)
  }
  const extras = gltf.parser.json.asset?.extras
  status.textContent = `PASS loaded ${url}\nsize (m): ${size.toArray().map((v) => v.toFixed(4)).join(' x ')}\nmin: ${box.min.toArray().map((v) => v.toFixed(4)).join(', ')}\nextras: ${JSON.stringify(extras)}`
  document.body.dataset.ready = 'true'
}, undefined, (error) => { status.textContent = `FAIL ${String(error)}`; document.body.dataset.ready = 'true' })
