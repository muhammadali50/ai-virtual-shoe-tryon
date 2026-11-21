// Export a native Blender master when present. Otherwise use the procedural shape profile.
// Usage: node scripts/build-shoe-model.mjs <productId>      (npm run model:2649-bka)
// Editable source: models-src/<productId>/shape.json (measurements fitted to the product photos).
// Output: public/models/<productId>.glb
//
// Coordinates (glTF): metres, +Y up, toe toward +Z, origin on the ground plane at the footprint's
// mid-length on the heel-toe axis. Right shoe: medial (big-toe) side is +X.
// This is an approximation built from photos, NOT a scan of the product.
import { deflateSync, crc32 } from 'node:zlib'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const PRODUCT_ID = process.argv[2] ?? '2649-bka'
const OUT = new URL(`../public/models/${PRODUCT_ID}.glb`, import.meta.url)
const master = new URL(`../models-src/${PRODUCT_ID}/${PRODUCT_ID}.blend`, import.meta.url)
if (existsSync(master)) {
  const { exportBlenderModel } = await import('./export-blender-model.mjs')
  exportBlenderModel(master, OUT)
  process.exit(0)
}
const SHAPE = JSON.parse(readFileSync(new URL(`../models-src/${PRODUCT_ID}/shape.json`, import.meta.url), 'utf8'))
const L = SHAPE.lengthMm / 1000
const mm = (v) => v / 1000
const HALF_PI = Math.PI / 2

// ---------- monotone cubic interpolation (no overshoot) ----------
function pchip(xs, ys) {
  const n = xs.length, d = [], m = new Array(n)
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  m[0] = d[0]; m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0
    else {
      const w1 = 2 * (xs[i + 1] - xs[i]) + (xs[i] - xs[i - 1]), w2 = (xs[i + 1] - xs[i]) + 2 * (xs[i] - xs[i - 1])
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    let i = 0
    while (x > xs[i + 1]) i++
    const h = xs[i + 1] - xs[i], s = (x - xs[i]) / h
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2
    return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1]
  }
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const clamp01 = (t) => Math.min(1, Math.max(0, t))

// ---------- profiles from shape.json ----------
const F = SHAPE.footprint
const latW = pchip(F.t, F.lateral), medW = pchip(F.t, F.medial) // outsole half-widths (mm) from x = 0
const bulgeLat = pchip(SHAPE.upperBulge.t, SHAPE.upperBulge.lateral), bulgeMed = pchip(SHAPE.upperBulge.t, SHAPE.upperBulge.medial)
const ground = pchip(SHAPE.ground.t, SHAPE.ground.mm)
const SOLE = SHAPE.soleThicknessMm
const soleTop = (t) => ground(t) + SOLE
const THROAT = SHAPE.throatT
const vampRidge = pchip(SHAPE.ridge.t, SHAPE.ridge.mm)
const collarBase = pchip(SHAPE.collar.t, SHAPE.collar.mm)
const CS = SHAPE.collarSideOffset
const collarLat = CS ? pchip(CS.t, CS.lateral) : () => 0, collarMed = CS ? pchip(CS.t, CS.medial) : () => 0
const collar = (t, side = 0) => collarBase(t) + (side < 0 ? collarLat(t) : side > 0 ? collarMed(t) : 0)
// Behind the throat the ridge is virtual: it sets how far the quarter walls curl inward at the collar
// (the heel counter wraps in, so the opening starts well forward of the heel in the top photo).
const curlK = SHAPE.quarterCurl ? pchip(SHAPE.quarterCurl.t, SHAPE.quarterCurl.k) : () => 0.6
const ridge = (t) => {
  if (t >= THROAT) return vampRidge(t)
  const c = collarBase(t), virt = c + curlK(t) * (c - soleTop(t))
  const w = smooth(THROAT - 0.06, THROAT, t)
  return (1 - w) * virt + w * SHAPE.ridge.mm[0]
}
const sectionExp = pchip(SHAPE.sectionExponent.t, SHAPE.sectionExponent.value)
const heelForward = pchip(SHAPE.heelCurve.heightMm, SHAPE.heelCurve.forwardMm)
const UPPER_INSET = SHAPE.upperInsetMm
// The upper fills closer to the sole edge toward the toe (top photo: almost no sole visible around the toe).
const upperInsetAt = (t) => UPPER_INSET + ((SHAPE.upperInsetToeMm ?? UPPER_INSET) - UPPER_INSET) * smooth(0.55, 0.9, t)
const edgeX = (t, side) => mm(side < 0 ? -latW(t) : medW(t)) // outsole edge x (m)
// The outsole's back end sits slightly forward of the heel counter's rounded bulge (side photo).
const soleZ = (t) => -L / 2 + t * L + mm(SHAPE.soleHeelTuckMm ?? 0) * (1 - smooth(0, 0.1, t))

// ---------- parametric upper ----------
// side = -1 lateral (-X), +1 medial (+X). phi: 0 at the sole edge, PI/2 at the ridge.
function upperPoint(t, phi, side, inset = 0, lengthInset = UPPER_INSET) {
  t = clamp01(t)
  const ins = upperInsetAt(t)
  const xl = -Math.max(0, latW(t) - ins - inset), xm = Math.max(0, medW(t) - ins - inset)
  const cx = (xl + xm) / 2
  const edge = side < 0 ? xl : xm
  const yb = soleTop(t) + (inset ? 3 : 0)
  const top = Math.max(yb + 1, ridge(t) - inset)
  const c = Math.max(0, Math.cos(phi)), s = Math.sin(phi)
  const bulge = (side < 0 ? bulgeLat(t) : bulgeMed(t)) * Math.sin(Math.min(Math.PI, phi * 2.2)) * (inset ? 0.9 : 1)
  const r = Math.pow(c, sectionExp(t)) // 1 at the sole edge, shrinking toward the ridge
  const y = yb + (top - yb) * s
  const zOf = (tt) => -SHAPE.lengthMm / 2 + lengthInset + tt * (SHAPE.lengthMm - 2 * lengthInset)
  const zb = zOf(t)
  let x = cx + (edge - cx) * r, z = zb
  const HC = SHAPE.heelCup
  if (HC && t < HC.endT) { // heel cup: curl in radially around the cup centre so the back wraps forward
    const wH = 1 - smooth(HC.startT, HC.endT, t)
    const zc = Math.max(zOf(HC.centreT), zb) // cup centre is forward of the heel; points past it are unchanged
    const xr = cx + (edge - cx) * r, zr = zc + (zb - zc) * r
    x = (1 - wH) * x + wH * xr; z = (1 - wH) * z + wH * zr
  }
  x += side * bulge
  const fade = 1 - smooth(0, SHAPE.heelCurve.fadeT, t)
  z += fade * heelForward(y - yb)
  return new THREE.Vector3(mm(x), mm(y), mm(z))
}
function phiMax(t, inset = 0, side = 0) {
  if (t >= THROAT) return HALF_PI
  const yb = soleTop(t) + (inset ? 3 : 0), top = ridge(t) - inset
  return Math.asin(Math.min(1, Math.max(0, (collar(t, side) - inset * 0.2 - yb) / (top - yb))))
}
function upperNormal(t, phi, side, inset = 0, lengthInset = UPPER_INSET) {
  const e = 1e-4, et = 2e-3 // a coarser step along t resolves the collapsed heel/toe tips
  const p = (a, b) => upperPoint(clamp01(a), b, side, inset, lengthInset)
  const dPhi = p(t, phi + e).sub(p(t, phi - e))
  const dT = p(t + et, phi).sub(p(t - et, phi))
  const n = new THREE.Vector3().crossVectors(dPhi, dT).multiplyScalar(side)
  if (n.lengthSq() < 1e-20) return new THREE.Vector3(0, 1, 0)
  return n.normalize()
}
/** phi on the outer surface where the height above ground is `hMm` (clamped to the ridge). */
function phiAtHeight(t, hMm) {
  const yb = soleTop(t), top = ridge(t)
  return Math.asin(Math.min(1, Math.max(0, (hMm - yb) / (top - yb))))
}
const stations = (n, a = 0, b = 1) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * (1 - Math.cos(Math.PI * i / n)) / 2)

// ---------- geometry helpers ----------
function makeGeometry(positions, normals, uvs, indices) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(indices)
  return g
}
/** Grid of rows x cols vertices; fn(i, j) -> { p, n, uv }. Triangles are oriented to agree with n. */
function grid(rows, cols, fn) {
  const P = [], N = [], U = [], I = [], verts = []
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const v = fn(i, j); verts.push(v)
    P.push(v.p.x, v.p.y, v.p.z); N.push(v.n.x, v.n.y, v.n.z); U.push(v.uv[0], v.uv[1])
  }
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1
    for (const tri of [[a, c, b], [b, c, d]]) {
      const [p0, p1, p2] = tri.map((k) => verts[k].p)
      const fnrm = new THREE.Vector3().crossVectors(p1.clone().sub(p0), p2.clone().sub(p0))
      if (fnrm.lengthSq() < 1e-16) continue // drop degenerate triangles at collapsed ends
      const avg = verts[tri[0]].n.clone().add(verts[tri[1]].n).add(verts[tri[2]].n)
      I.push(...(fnrm.dot(avg) >= 0 ? tri : [tri[0], tri[2], tri[1]]))
    }
  }
  return makeGeometry(P, N, U, I)
}
function tube(points, radius, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 3), radius, radial, false)
}

const TILE = 0.022 // leather grain tile size (m): ~0.9 mm pebbles with 24 cells per tile
const LEATHER = [], LINING = [], INSOLE = [], SOLE_PARTS = [], METAL = [], STITCH = []

function addStitches(pts, pitch = 3.0, len = 1.8) {
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => q.p), false, 'centripetal')
  const count = Math.floor(curve.getLength() / mm(pitch))
  for (let k = 0; k < count; k++) {
    const u = (k + 0.5) / count
    const p = curve.getPointAt(u), tan = curve.getTangentAt(u)
    const nrm = pts[Math.round(u * (pts.length - 1))].n.clone().normalize()
    const s = new THREE.BoxGeometry(mm(len), mm(0.5), mm(0.65))
    s.applyMatrix4(new THREE.Matrix4().makeBasis(tan, nrm, new THREE.Vector3().crossVectors(tan, nrm).normalize()))
    s.translate(p.x, p.y, p.z)
    STITCH.push(s)
  }
}
function onSurface(t, phi, side, lift) {
  const n = upperNormal(t, phi, side)
  return { p: upperPoint(t, phi, side).add(n.clone().multiplyScalar(mm(lift))), n }
}

// ---------- outer upper, lining, insole, collar binding ----------
// Dense stations through the throat, where the collar climbs ~30 mm in ~20 mm, keep the tongue's U smooth.
const ST = [...new Set([...stations(104), ...Array.from({ length: 36 }, (_, k) => THROAT - 0.07 + 0.07 * k / 35)].map((t) => Math.round(t * 1e6) / 1e6))].sort((a, b) => a - b)
const COLS = 28
function arcFromRidge(t, phi, side) {
  let len = 0, prev = upperPoint(t, HALF_PI, side)
  for (let k = 1; k <= 12; k++) {
    const q = upperPoint(t, HALF_PI + (phi - HALF_PI) * k / 12, side)
    len += q.distanceTo(prev); prev = q
  }
  return len
}
// Seam-free grain mapping. Front: signed arc from the ridge x length (continuous over the vamp top).
// Heel: height along the wall x signed distance around the outline from the heel back (continuous where
// the two halves meet at the back). The two blend smoothly across the quarters, where the walls are open.
const perimTable = {}
for (const side of [-1, 1]) {
  const ts = Array.from({ length: 801 }, (_, k) => k / 800), acc = [0]
  for (let k = 1; k < ts.length; k++) acc.push(acc[k - 1] + upperPoint(ts[k], 0, side).distanceTo(upperPoint(ts[k - 1], 0, side)))
  perimTable[side] = pchip(ts, acc)
}
function upperU(t, phi, side) { // across the wall: arc up from the sole behind the throat, signed arc from the ridge on the closed vamp
  const w = smooth(THROAT, THROAT + 0.08, t)
  return ((1 - w) * (arcFromRidge(t, 0, side) - arcFromRidge(t, phi, side)) + w * side * arcFromRidge(t, phi, side)) / TILE
}
void perimTable
for (const side of [-1, 1]) {
  // v = true surface distance along each grid column from the heel back: no stretching where the wall
  // rises steeply (tongue, heel cup), and identical on both halves where they meet (ridge, heel back line).
  const rowsP = ST.map((t) => Array.from({ length: COLS + 1 }, (_, j) => upperPoint(t, phiMax(t, 0, side) * j / COLS, side)))
  const vAcc = rowsP.map(() => new Array(COLS + 1).fill(0))
  for (let i = 1; i < ST.length; i++) for (let j = 0; j <= COLS; j++) vAcc[i][j] = vAcc[i - 1][j] + rowsP[i][j].distanceTo(rowsP[i - 1][j])
  LEATHER.push(grid(ST.length, COLS + 1, (i, j) => {
    const t = ST[i], phi = phiMax(t, 0, side) * j / COLS
    return { p: rowsP[i][j], n: upperNormal(t, phi, side), uv: [upperU(t, phi, side), vAcc[i][j] / TILE] }
  }))
  LINING.push(grid(ST.length, 17, (i, j) => {
    const t = ST[i], phi = phiMax(t, 2.5, side) * j / 16
    const p = upperPoint(t, phi, side, 2.5, UPPER_INSET + 2.5)
    return { p, n: upperNormal(t, phi, side, 2.5, UPPER_INSET + 2.5).negate(), uv: [side * phi * 2, p.z / TILE] }
  }))
}
INSOLE.push(grid(ST.length, 13, (i, j) => {
  const t = ST[i]
  const a = upperPoint(t, 0, -1, 2.5, UPPER_INSET + 2.5), b = upperPoint(t, 0, 1, 2.5, UPPER_INSET + 2.5)
  const p = a.clone().lerp(b, j / 12)
  return { p, n: new THREE.Vector3(0, 1, 0), uv: [p.x / 0.08, p.z / 0.08] }
}))
const openST = ST.filter((t) => t <= THROAT + 1e-9)
for (const side of [-1, 1]) { // rolled, dark collar binding (about 3.5 mm) joining outer and inner top edges
  LEATHER.push(grid(openST.length, 9, (i, j) => {
    const t = openST[i]
    const o = upperPoint(t, phiMax(t, 0, side), side), inn = upperPoint(t, phiMax(t, 2.5, side), side, 2.5, UPPER_INSET + 2.5)
    const no = upperNormal(t, phiMax(t, 0, side), side)
    const a = Math.PI * j / 8
    const mid = o.clone().lerp(inn, (1 - Math.cos(a)) / 2).add(no.clone().multiplyScalar(mm(0.9) * Math.sin(a)))
    mid.y += mm(1.9) * Math.sin(a)
    const n = no.clone().multiplyScalar(Math.cos(a)).add(new THREE.Vector3(0, Math.sin(a), 0)).normalize()
    return { p: mid, n, uv: [j / 8, mid.z / TILE] }
  }))
}

// ---------- saddle strap: a band leaning back across the instep ----------
const SP = SHAPE.strap
function strapCentre(s) { // s in [-1, 1]: -1 lateral end, 0 instep top, +1 medial end
  const a = Math.abs(s), side = s < 0 ? -1 : 1
  const t = SP.topT - (SP.topT - SP.bottomT) * a
  const phi = HALF_PI - (HALF_PI - phiAtHeight(t, SP.bottomHeightMm)) * a
  return { t, phi, side }
}
const STRAP_DT = SP.widthMm / 2 / SHAPE.lengthMm
const STRAP_HALF_LEN = (() => { // arc length (m) of the strap centre line from the instep top to one end
  let len = 0, prev = null
  for (let k = 0; k <= 60; k++) { const q = strapCentre(k / 60), p = upperPoint(q.t, q.phi, q.side); if (prev) len += p.distanceTo(prev); prev = p }
  return len
})()
function strapPoint(s, u) { const c = strapCentre(s); return { ...c, t: c.t + u * STRAP_DT } }
{
  const rowsS = 41, colsU = 11
  LEATHER.push(grid(rowsS, colsU, (i, j) => {
    const { t, phi, side } = strapPoint(-1 + 2 * i / (rowsS - 1), -1 + 2 * j / (colsU - 1))
    const n = upperNormal(t, phi, side)
    const p = upperPoint(t, phi, side).add(n.clone().multiplyScalar(mm(SP.liftMm)))
    // the strap's own length x width coordinates: uniform grain from the instep top down both steep sides
    return { p, n, uv: [((-1 + 2 * i / (rowsS - 1)) * STRAP_HALF_LEN) / TILE, ((-1 + 2 * j / (colsU - 1)) * mm(SP.widthMm / 2)) / TILE] }
  }))
  const edgeWall = (pts, outwardFn) => LEATHER.push(grid(pts.length, 2, (i, j) => {
    const { t, phi, side } = pts[i]
    const n = upperNormal(t, phi, side)
    const p = upperPoint(t, phi, side).add(n.clone().multiplyScalar(mm(j ? SP.liftMm : 0)))
    return { p, n: outwardFn(pts[i], n), uv: [(p.x + p.z) / TILE, p.y / TILE] }
  }))
  const along = (u) => Array.from({ length: rowsS }, (_, i) => strapPoint(-1 + 2 * i / (rowsS - 1), u))
  edgeWall(along(-1), (_, n) => new THREE.Vector3(0, 0, -1).projectOnPlane(n).normalize())
  edgeWall(along(1), (_, n) => new THREE.Vector3(0, 0, 1).projectOnPlane(n).normalize())
  for (const s of [-1, 1]) edgeWall(Array.from({ length: colsU }, (_, j) => strapPoint(s, -1 + 2 * j / (colsU - 1))), (q, n) => new THREE.Vector3(q.side, -0.6, 0).projectOnPlane(n).normalize())
  for (const u of [-0.78, 0.78]) { // stitch rows along both long edges
    const pts = Array.from({ length: 60 }, (_, k) => { const q = strapPoint(-0.97 + 1.94 * k / 59, u); return onSurface(q.t, q.phi, q.side, SP.liftMm + 0.12) })
    addStitches(pts)
  }
}

// ---------- horsebit: capsule bar with centre plate and collars, two horseshoe rings down the strap ----------
{
  const B = SHAPE.bit
  const top = strapCentre(0)
  const n0 = upperNormal(top.t, HALF_PI, 1)
  const base = upperPoint(top.t, HALF_PI, 1).add(n0.clone().multiplyScalar(mm(SP.liftMm + B.barRadiusMm + (B.barLiftMm ?? 0.3))))
  const along = upperPoint(top.t + 0.01, HALF_PI, 1).sub(upperPoint(top.t - 0.01, HALF_PI, 1)).normalize()
  const across = new THREE.Vector3().crossVectors(n0, along).normalize()
  if (across.x < 0) across.negate()
  const toWorld = new THREE.Matrix4().makeBasis(n0.clone().cross(across).normalize(), across, n0) // local Y -> across
  const parts = []
  const bar = new THREE.CylinderGeometry(mm(B.barRadiusMm * 0.8), mm(B.barRadiusMm * 0.8), mm(2 * B.barHalfLengthMm - 4), 18)
  parts.push(bar)
  const plate = new THREE.SphereGeometry(mm(1), 24, 12); plate.scale(4.6, 7.2, 2.8) // large flattened oval centre plate
  plate.translate(0, 0, mm(B.barRadiusMm * 0.35)); parts.push(plate)
  for (const sy of [-1, 1]) {
    const c = new THREE.CylinderGeometry(mm(B.barRadiusMm + 0.6), mm(B.barRadiusMm + 0.6), mm(2.6), 20); c.translate(0, sy * mm(B.barHalfLengthMm - 4.5), 0); parts.push(c)
    const cap = new THREE.SphereGeometry(mm(B.barRadiusMm * 0.85), 16, 10); cap.translate(0, sy * mm(B.barHalfLengthMm - 1.6), 0); parts.push(cap)
  }
  const barGroup = mergeGeometries(parts); barGroup.applyMatrix4(toWorld); barGroup.translate(base.x, base.y, base.z)
  METAL.push(barGroup)
  for (const side of [-1, 1]) {
    // ring hangs from the bar end down the strap centre line
    const sEnd = side * (B.barHalfLengthMm + 0.5) / 60, sMid = side * (B.barHalfLengthMm + B.ringLengthMm / 2) / 60
    const findS = (target) => { // arc length along the strap centre line (mm) -> s
      let s = 0, acc = 0, prev = upperPoint(strapCentre(0).t, HALF_PI, side)
      while (acc < target && Math.abs(s) < 1) { s += side * 0.002; const q = strapCentre(s); const p = upperPoint(q.t, q.phi, q.side); acc += p.distanceTo(prev) * 1000; prev = p }
      return s
    }
    const start = B.ringStartMm ?? B.barHalfLengthMm - 1 // arc distance from the instep top to the ring's open end
    const s0 = findS(start), s1 = findS(start + B.ringLengthMm / 2)
    void sEnd; void sMid
    const q = strapCentre(s1)
    const n = upperNormal(q.t, q.phi, q.side)
    const centre = upperPoint(q.t, q.phi, q.side).add(n.clone().multiplyScalar(mm(SP.liftMm + (B.ringLiftMm ?? 1.7))))
    const q0 = strapCentre(s0)
    const down = upperPoint(q.t, q.phi, q.side).sub(upperPoint(q0.t, q0.phi, q0.side)).normalize() // away from the bar
    const lateralDir = new THREE.Vector3().crossVectors(n, down).normalize()
    const ring = new THREE.TorusGeometry(mm(B.ringWidthMm / 2 - B.ringTubeMm / 2), mm(B.ringTubeMm), 10, 48, (285 * Math.PI) / 180)
    ring.rotateZ(Math.PI / 2 + (37.5 * Math.PI) / 180) // gap (open end of the horseshoe) faces local -Y (toward the bar)
    ring.scale(1, (B.ringLengthMm / B.ringWidthMm), 0.75) // elongated, slightly flat section
    ring.applyMatrix4(new THREE.Matrix4().makeBasis(lateralDir, down, n))
    ring.translate(centre.x, centre.y, centre.z)
    METAL.push(ring)
    // prongs joining the open end to the bar collar
    const ringTop = centre.clone().add(down.clone().multiplyScalar(-mm(B.ringLengthMm / 2 - 1)))
    const collarPos = base.clone().add(across.clone().multiplyScalar(side * mm(B.barHalfLengthMm - 4.5)))
    for (const off of [-1, 1]) {
      const a = ringTop.clone().add(lateralDir.clone().multiplyScalar(off * mm(B.ringWidthMm / 2 - 2.2)))
      const dir = collarPos.clone().sub(a)
      const prong = new THREE.CylinderGeometry(mm(1.05), mm(1.05), dir.length(), 8)
      prong.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()))
      const m = a.clone().add(dir.multiplyScalar(0.5)); prong.translate(m.x, m.y, m.z)
      METAL.push(prong)
    }
    // leather keeper loop over the bottom of the ring
    const qb = strapCentre(findS(start + B.ringLengthMm - 2))
    const nb = upperNormal(qb.t, qb.phi, qb.side)
    const pb = upperPoint(qb.t, qb.phi, qb.side).add(nb.clone().multiplyScalar(mm(SP.liftMm + 1.8)))
    const keeper = new THREE.BoxGeometry(mm(4.5), mm(3.2), mm(9))
    const kz = new THREE.Vector3().crossVectors(down, nb).normalize()
    keeper.applyMatrix4(new THREE.Matrix4().makeBasis(down, nb, kz)); keeper.translate(pb.x, pb.y, pb.z)
    keeper.deleteAttribute('uv'); keeper.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(keeper.getAttribute('position').count * 2), 2))
    LEATHER.push(keeper)
  }
}

// ---------- apron (toe panel) seam: side lines at ~38 mm height, then a broad plan-view U over the toe ----------
function phiAtX(t, side, xm) { // phi on the outer surface whose x equals xm (m), searched from the ridge down
  let lo = 0, hi = HALF_PI
  const ridgeX = upperPoint(t, HALF_PI, side).x
  if (side * (xm - ridgeX) <= 0) return HALF_PI
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (side * (upperPoint(t, mid, side).x - xm) > 0) lo = mid; else hi = mid }
  return (lo + hi) / 2
}
{
  const A = SHAPE.apron
  const seamH = (t) => A.sideHeightMm + (A.frontHeightMm - A.sideHeightMm) * clamp01((t - A.startT) / 0.33)
  const sideLine = (side) => stations(30, A.startT, A.turnT).map((t) => ({ t, phi: phiAtHeight(t, seamH(t)), side }))
  const latLine = sideLine(-1), medLine = sideLine(1)
  const xL = upperPoint(A.turnT, latLine.at(-1).phi, -1).x, xM = upperPoint(A.turnT, medLine.at(-1).phi, 1).x
  const cx = (xL + xM) / 2, rx = (xM - xL) / 2, zTurn = upperPoint(A.turnT, HALF_PI, 1).z
  const zFront = -L / 2 + mm(upperInsetAt(A.frontT)) + A.frontT * (L - 2 * mm(upperInsetAt(A.frontT)))
  const front = []
  for (let k = 1; k < 40; k++) { // plan-view half-ellipse from the lateral line round to the medial line
    const a = Math.PI * k / 40, x = cx - rx * Math.cos(a), z = zTurn + (zFront - zTurn) * Math.sin(a)
    const t = A.turnT + (A.frontT - A.turnT) * ((z - zTurn) / (zFront - zTurn))
    const side = x < cx ? -1 : 1
    front.push({ t, phi: Math.min(phiAtX(t, side, x), HALF_PI - 1e-4), side })
  }
  const path = [...latLine, ...front, ...medLine.slice().reverse()]
  const pts = path.map((q) => onSurface(q.t, q.phi, q.side, 0.45))
  LEATHER.push(tube(pts.map((q) => q.p), mm(0.85), 6))
  addStitches(pts.map((q, k) => { // stitches 2 mm on the apron side of the cord
    const next = pts[Math.min(pts.length - 1, k + 1)].p, prev = pts[Math.max(0, k - 1)].p
    const dir = new THREE.Vector3().crossVectors(q.n, next.clone().sub(prev).normalize()).normalize()
    return { p: q.p.clone().add(dir.multiplyScalar(mm(2))).add(q.n.clone().multiplyScalar(mm(-0.2))), n: q.n }
  }))
}

// ---------- heel-counter seams (double stitched) ----------
for (const side of [-1, 1]) {
  const ctrl = SHAPE.heelSeam.points.map(([t, h]) => {
    const height = h < 0 ? collar(t, side) + h : soleTop(t) + h
    return onSurface(t, Math.min(phiMax(t, 0, side) * 0.97, phiAtHeight(t, height)), side, 0.3)
  })
  const curve = new THREE.CatmullRomCurve3(ctrl.map((q) => q.p), false, 'centripetal')
  const pts = curve.getPoints(30).map((p, k) => ({ p, n: ctrl[Math.min(ctrl.length - 1, Math.round(k / 30 * (ctrl.length - 1)))].n }))
  LEATHER.push(tube(pts.map((q) => q.p), mm(0.5), 5))
  for (const off of [-1.4, 1.4]) addStitches(pts.map((q, k) => {
    const next = pts[Math.min(pts.length - 1, k + 1)].p, prev = pts[Math.max(0, k - 1)].p
    const dir = new THREE.Vector3().crossVectors(q.n, next.clone().sub(prev).normalize()).normalize()
    return { p: q.p.clone().add(dir.multiplyScalar(mm(off))), n: q.n }
  }), 2.6, 1.5)
}

// ---------- outsole ----------
const SST = stations(96)
const SOLE_COLS = 16
const soleUV = (t, j) => [t, j / SOLE_COLS] // tread texture spans the whole sole
const soleX = (t, j) => edgeX(t, -1) + (edgeX(t, 1) - edgeX(t, -1)) * j / SOLE_COLS
SOLE_PARTS.push(grid(SST.length, SOLE_COLS + 1, (i, j) => ({ p: new THREE.Vector3(soleX(SST[i], j), mm(soleTop(SST[i])), soleZ(SST[i])), n: new THREE.Vector3(0, 1, 0), uv: soleUV(SST[i], j) })))
SOLE_PARTS.push(grid(SST.length, SOLE_COLS + 1, (i, j) => {
  const t = SST[i], e = 1e-3, slope = mm(ground(Math.min(1, t + e)) - ground(Math.max(0, t - e))) / (2 * e * L)
  return { p: new THREE.Vector3(soleX(t, j), mm(ground(t)), soleZ(t)), n: new THREE.Vector3(0, -1, slope).normalize(), uv: soleUV(t, j) }
}))
function outlineNormal(t, side) {
  const e = 1e-3
  const a = new THREE.Vector3(edgeX(Math.max(0, t - e), side), 0, soleZ(Math.max(0, t - e)))
  const b = new THREE.Vector3(edgeX(Math.min(1, t + e), side), 0, soleZ(Math.min(1, t + e)))
  const tan = b.sub(a).normalize()
  return new THREE.Vector3(tan.z * side, 0, -tan.x * side).normalize()
}
for (const side of [-1, 1]) { // sole edge with a softly rounded top
  const rows = [[0, 0.4], [0.15, 0], [0.75, 0], [1, 0.7]] // (height fraction, inset mm)
  SOLE_PARTS.push(grid(SST.length, rows.length, (i, j) => {
    const t = SST[i], n = outlineNormal(t, side), [f, inset] = rows[j]
    const p = new THREE.Vector3(edgeX(t, side), mm(ground(t) + SOLE * f), soleZ(t)).add(n.clone().multiplyScalar(-mm(inset)))
    const nn = j === 3 ? n.clone().add(new THREE.Vector3(0, 0.8, 0)).normalize() : j === 0 ? n.clone().add(new THREE.Vector3(0, -0.6, 0)).normalize() : n
    return { p, n: nn, uv: [t * 8, f] }
  }))
}

// ---------- low stacked heel, rounded at the back, inset from the sole edge ----------
{
  const HB = SHAPE.heelBlock, H = ground(0)
  const backT = HB.backInsetMm / SHAPE.lengthMm
  const HST = stations(44, backT, HB.breastT)
  const hx = (t, side) => { // heel outline: sole edge pulled in by sideInset, and rounded toward the back
    const k = smooth(backT, backT + 0.05, t)
    return edgeX(t, side) - side * mm(HB.sideInsetMm + (1 - k) * 1.5)
  }
  const levels = [[0, 0.9], [0.6, 0.15], [1.2, 0]]
  for (let k = 1; k < HB.layers; k++) { const y = (H * k) / HB.layers; levels.push([y - 0.4, 0], [y, HB.grooveDepthMm ?? 0.45], [y + 0.4, 0]) }
  levels.push([H, 0])
  const ring = []
  for (let i = HST.length - 1; i >= 0; i--) ring.push({ t: HST[i], side: -1 })
  for (let i = 1; i < HST.length; i++) ring.push({ t: HST[i], side: 1 })
  const ringNormal = ({ t, side }) => {
    const e = 1e-3
    const a = new THREE.Vector3(hx(Math.max(backT, t - e), side), 0, soleZ(Math.max(backT, t - e)))
    const b = new THREE.Vector3(hx(Math.min(1, t + e), side), 0, soleZ(Math.min(1, t + e)))
    const tan = b.sub(a).normalize()
    return t <= backT + 1e-6 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(tan.z * side, 0, -tan.x * side).normalize()
  }
  SOLE_PARTS.push(grid(ring.length, levels.length, (i, j) => {
    const q = ring[i], n = ringNormal(q), [ymm, inset] = levels[j]
    const p = new THREE.Vector3(hx(q.t, q.side), mm(ymm), soleZ(q.t)).add(n.clone().multiplyScalar(-mm(inset)))
    return { p, n: j === 0 ? n.clone().add(new THREE.Vector3(0, -0.7, 0)).normalize() : n, uv: [i / ring.length * 6, ymm / H] }
  }))
  SOLE_PARTS.push(grid(levels.length, 9, (i, j) => { // heel breast (front face), slightly concave
    const t = HB.breastT, x = hx(t, -1) + (hx(t, 1) - hx(t, -1)) * j / 8
    return { p: new THREE.Vector3(x, mm(levels[i][0]), -L / 2 + t * L - mm(2.2) * Math.sin(Math.PI * j / 8)), n: new THREE.Vector3(0, 0, 1), uv: [j / 8, i / levels.length] }
  }))
  SOLE_PARTS.push(grid(HST.length, SOLE_COLS + 1, (i, j) => { // top-lift (ground contact), shares the tread texture
    const t = HST[i], x = hx(t, -1) + (hx(t, 1) - hx(t, -1)) * j / SOLE_COLS
    return { p: new THREE.Vector3(x - (x - (hx(t, -1) + hx(t, 1)) / 2) * 0.03, 0, soleZ(t) + mm(0.8)), n: new THREE.Vector3(0, -1, 0), uv: soleUV(t, j) }
  }))
}

// ---------- procedural textures ----------
function png(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 1 // Sub filter
    for (let x = 0; x < width * 3; x++) {
      const v = rgb[y * width * 3 + x], left = x >= 3 ? rgb[y * width * 3 + x - 3] : 0
      raw[y * (width * 3 + 1) + 1 + x] = (v - left) & 0xff
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
function normalMapFromHeight(w, h, height, strength) {
  const out = new Uint8Array(w * h * 3)
  const Hh = (x, y) => height[((y + h) % h) * w + ((x + w) % w)]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (Hh(x + 1, y) - Hh(x - 1, y)) * strength, dy = (Hh(x, y + 1) - Hh(x, y - 1)) * strength
    const len = Math.hypot(dx, dy, 1), i = (y * w + x) * 3
    out[i] = Math.round((-dx / len * 0.5 + 0.5) * 255); out[i + 1] = Math.round((dy / len * 0.5 + 0.5) * 255); out[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255)
  }
  return out
}
let seed = 2649
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
function pebbleGrain(size = 256, cells = 24) { // periodic Worley F2-F1: fine pebbles separated by soft creases
  const pts = Array.from({ length: cells * cells }, (_, k) => [(k % cells + rand()) / cells, (Math.floor(k / cells) + rand()) / cells])
  const height = new Float32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size
    let f1 = 9, f2 = 9
    const cx = Math.floor(u * cells), cy = Math.floor(v * cells)
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
      const p = pts[((cy + oy + cells) % cells) * cells + ((cx + ox + cells) % cells)]
      const d = Math.hypot(u - (p[0] + Math.floor((cx + ox) / cells)), v - (p[1] + Math.floor((cy + oy) / cells)))
      if (d < f1) { f2 = f1; f1 = d } else if (d < f2) f2 = d
    }
    height[y * size + x] = Math.sqrt(Math.min(1, (f2 - f1) * cells * 1.4)) // rounded pebble tops
  }
  return normalMapFromHeight(size, size, height, 1.6)
}
function treadPattern(w = 1024, h = 256) { // dimpled forefoot + heel, smooth waist with a blank plate
  const height = new Float32Array(w * h).fill(1)
  const pitchU = 11.5, pitchV = 9.5, breast = SHAPE.heelBlock.breastT
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = x / w, v = y / h
    const rim = v < 0.07 || v > 0.93 || t < 0.012 || t > 0.985
    const waist = t > breast - 0.005 && t < 0.52
    let val = 1
    if (!rim && !waist) {
      const row = Math.round(y / pitchV), off = row % 2 ? pitchU / 2 : 0
      const cx = Math.round((x - off) / pitchU) * pitchU + off, cy = row * pitchV
      val = Math.hypot(x - cx, (y - cy) * 1.1) < 3.2 ? 0.25 + 0.75 * smooth(1.6, 3.2, Math.hypot(x - cx, (y - cy) * 1.1)) : 1
    }
    if (waist) { const e = Math.max(Math.abs((t - 0.4) / 0.07), Math.abs((v - 0.5) / 0.22)); if (e < 1.05 && e > 0.92) val = 0.55 }
    height[y * w + x] = val
  }
  return normalMapFromHeight(w, h, height, 1.4)
}

// ---------- minimal GLB writer ----------
function writeGLB(parts, materials, images, extras, markers) {
  const json = {
    asset: { version: '2.0', generator: 'ai-virtual-shoe-tryon scripts/build-shoe-model.mjs', extras },
    scene: 0, scenes: [{ name: PRODUCT_ID, nodes: [0] }],
    nodes: [{ name: `${PRODUCT_ID}_${SHAPE.foot}_shoe`, children: [], extras }],
    ...(materials.some((m) => m.extensions?.KHR_materials_clearcoat) ? { extensionsUsed: ['KHR_materials_clearcoat'] } : {}),
    meshes: [], materials, accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }], textures: [], images: [],
  }
  const chunks = []
  let offset = 0
  const pushView = (buf, target) => {
    const pad = (4 - (offset % 4)) % 4
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad }
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, ...(target ? { target } : {}) })
    chunks.push(buf); offset += buf.length
    return json.bufferViews.length - 1
  }
  for (const img of images) {
    json.images.push({ name: img.name, mimeType: 'image/png', bufferView: pushView(img.data) })
    json.textures.push({ sampler: 0, source: json.images.length - 1, name: img.name })
  }
  parts.forEach(({ name, geometry: g, material }) => {
    const pos = g.getAttribute('position').array, nrm = g.getAttribute('normal').array, uv = g.getAttribute('uv').array
    const idx = g.index.array, count = pos.length / 3
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i * 3 + k]); max[k] = Math.max(max[k], pos[i * 3 + k]) }
    const acc = (view, componentType, cnt, type, extra = {}) => { json.accessors.push({ bufferView: view, componentType, count: cnt, type, ...extra }); return json.accessors.length - 1 }
    const P = acc(pushView(Buffer.from(new Float32Array(pos).buffer), 34962), 5126, count, 'VEC3', { min, max })
    const N = acc(pushView(Buffer.from(new Float32Array(nrm).buffer), 34962), 5126, count, 'VEC3')
    const T = acc(pushView(Buffer.from(new Float32Array(uv).buffer), 34962), 5126, count, 'VEC2')
    const tan = g.getAttribute('tangent')
    const TG = tan ? acc(pushView(Buffer.from(new Float32Array(tan.array).buffer), 34962), 5126, count, 'VEC4') : null
    const small = count < 65536
    const I = acc(pushView(Buffer.from((small ? new Uint16Array(idx) : new Uint32Array(idx)).buffer), 34963), small ? 5123 : 5125, idx.length, 'SCALAR')
    json.meshes.push({ name, primitives: [{ attributes: { POSITION: P, NORMAL: N, TEXCOORD_0: T, ...(TG !== null ? { TANGENT: TG } : {}) }, indices: I, material }] })
    json.nodes.push({ name, mesh: json.meshes.length - 1 })
    json.nodes[0].children.push(json.nodes.length - 1)
  })
  for (const [name, p] of Object.entries(markers)) { // empty nodes for future try-on alignment
    json.nodes.push({ name, translation: p.map((v) => Math.round(v * 1e5) / 1e5) })
    json.nodes[0].children.push(json.nodes.length - 1)
  }
  const bin = Buffer.concat(chunks)
  const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)])
  json.buffers[0].byteLength = binPadded.length
  let jsonBuf = Buffer.from(JSON.stringify(json))
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)])
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binPadded.length, 8)
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4)
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binPadded.length, 0); bh.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, jh, jsonBuf, bh, binPadded])
}

// ---------- assemble ----------
const prep = (list) => mergeGeometries(list.map((g) => (g.index ? g : g.toNonIndexed()).clone()).map((g) => {
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
  if (!g.index) { const n = g.getAttribute('position').count; g.setIndex(Array.from({ length: n }, (_, i) => i)) }
  return g
}))
const leather = prep(LEATHER), lining = prep(LINING), insole = prep(INSOLE), sole = prep(SOLE_PARTS), metal = prep(METAL), stitch = prep(STITCH)
for (const g of [leather, sole]) { // tangents for normal mapping; repair degenerate ones (collapsed heel/toe tips)
  g.computeTangents()
  const t = g.getAttribute('tangent'), n = g.getAttribute('normal')
  for (let i = 0; i < t.count; i++) {
    const tv = new THREE.Vector3(t.getX(i), t.getY(i), t.getZ(i)), nv = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i))
    tv.sub(nv.clone().multiplyScalar(tv.dot(nv)))
    if (!(tv.lengthSq() > 1e-12)) {
      tv.set(1, 0, 0).sub(nv.clone().multiplyScalar(nv.x))
      if (tv.lengthSq() < 1e-6) tv.set(0, 0, 1).sub(nv.clone().multiplyScalar(nv.z))
    }
    tv.normalize()
    t.setXYZW(i, tv.x, tv.y, tv.z, t.getW(i) < 0 ? -1 : 1)
  }
}
const M = SHAPE.materials
const pbr = (name, m, extra = {}, metallic = 0) => ({ name, pbrMetallicRoughness: { baseColorFactor: [...m.baseColorLinear, 1], metallicFactor: metallic, roughnessFactor: m.roughness }, ...extra })
const materials = [
  pbr('black_pebble_grain_leather', M.leather, {
    normalTexture: { index: 0, scale: M.leather.normalScale },
    // finished-leather sheen: a soft clear coat over the rough black base, like the product photos
    ...(M.leather.clearcoat ? { extensions: { KHR_materials_clearcoat: { clearcoatFactor: M.leather.clearcoat, clearcoatRoughnessFactor: M.leather.clearcoatRoughness ?? 0.3 } } } : {}),
  }),
  pbr('warm_brown_lining', M.lining),
  pbr('beige_brown_insole', M.insole),
  pbr('black_rubber_outsole', M.sole, { normalTexture: { index: 1, scale: M.sole.treadNormalScale ?? 1 } }),
  pbr('champagne_metal', M.metal, {}, 1),
  pbr('black_stitching', M.stitching),
]
const images = [
  { name: 'leather_pebble_grain_normal', data: png(256, 256, pebbleGrain()) },
  { name: 'outsole_tread_normal', data: png(1024, 256, treadPattern()) },
]
const ballT = 0.65
const toeTip = [edgeX(1, 1), mm(soleTop(1) + 2), L / 2]
const extras = {
  productId: PRODUCT_ID, productName: SHAPE.productName, colour: SHAPE.colour, foot: SHAPE.foot, sizeEU: SHAPE.sizeEU,
  units: 'metres', up: '+Y', forward: '+Z (toe)', medialSide: '+X', origin: 'ground plane, footprint mid-length on the heel-toe axis',
  lengthMetres: L, heelBack: [0, 0, -L / 2], toeTip,
  ballMedial: [edgeX(ballT, 1), 0, -L / 2 + ballT * L], ballLateral: [edgeX(ballT, -1), 0, -L / 2 + ballT * L],
  source: `models-src/${PRODUCT_ID}/shape.json`,
  approximation: 'Procedural model fitted to the catalog photos (side, top, three-quarter, sole). Not a scan.',
}
const glb = writeGLB([
  { name: 'upper_leather', geometry: leather, material: 0 },
  { name: 'lining', geometry: lining, material: 1 },
  { name: 'insole', geometry: insole, material: 2 },
  { name: 'outsole_and_heel', geometry: sole, material: 3 },
  { name: 'horsebit', geometry: metal, material: 4 },
  { name: 'stitching', geometry: stitch, material: 5 },
], materials, images, extras, { heel_back: extras.heelBack, toe_tip: toeTip, ball_medial: extras.ballMedial, ball_lateral: extras.ballLateral })
mkdirSync(new URL('.', OUT), { recursive: true })
writeFileSync(OUT, glb)
const tris = [leather, lining, insole, sole, metal, stitch].reduce((s, g) => s + g.index.count / 3, 0)
console.log(`Wrote ${OUT.pathname} (${(glb.length / 1024).toFixed(1)} KiB, ${Math.round(tris)} triangles)`)
