import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

const stage = document.getElementById('stage');
const btn = document.getElementById('hitBtn');
const hud = document.getElementById('hudTxt');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const MM = 0.01;
const OUTLINE = [[4,137],[108,82],[115,85],[123,87],[131,88],[139,88],[147,86],[154,83],[161,79],[167,73],[172,67],[175,61],[178,53],[179,46],[178,38],[176,31],[173,24],[169,18],[163,12],[157,8],[149,4],[142,2],[134,1],[126,2],[118,3],[110,6],[103,10],[98,15],[93,21],[89,28],[86,35],[85,43],[86,50],[88,58],[7,85],[4,86],[1,86],[-1,86],[-4,86],[-7,85],[-88,58],[-86,50],[-85,43],[-86,35],[-89,28],[-93,21],[-98,15],[-103,10],[-110,6],[-118,3],[-126,2],[-134,1],[-142,2],[-149,4],[-157,8],[-163,12],[-169,18],[-173,24],[-176,31],[-178,38],[-179,46],[-178,53],[-175,61],[-172,67],[-167,73],[-161,79],[-154,83],[-147,86],[-139,88],[-131,88],[-123,87],[-115,85],[-108,82],[-4,137]];
const K1 = 8;
const K0 = 118.6;
const BALL_X = 132.4, BALL_Y = 44.4;
const R_BALL = 43.5;
const balls = [];

btn.disabled = true;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch (e) {
  document.getElementById('nogl').style.display = 'flex';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
camera.position.set(5.6, 3.6, 8.4);

scene.add(new THREE.HemisphereLight(0xf2efe8, 0x1a1c1e, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 20 });
key.shadow.radius = 4;
scene.add(key, key.target);
const KEY_OFF = new THREE.Vector3(3, 6, 4);
const rim = new THREE.DirectionalLight(0xe9e6df, 0.9);
rim.position.set(-4, 3, -3);
scene.add(rim);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.38 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(80, 160, 0x3a3d40, 0x2a2d30);
grid.material.transparent = true;
grid.material.opacity = 0.5;
scene.add(grid);

const paint = new THREE.MeshStandardMaterial({ color: 0xb12a26, roughness: 0.72, metalness: 0.18 });

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;
controls.enablePan = false;
controls.enableDamping = true;
controls.minPolarAngle = 0.8;
controls.maxPolarAngle = 1.42;
renderer.domElement.style.touchAction = 'pan-y';
let dragging = false;
controls.addEventListener('start', () => { dragging = true; });
controls.addEventListener('end', () => { dragging = false; });

function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.translate(128, 128);
  x.fillStyle = '#ffffff';
  x.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = Math.PI * i / 12 - Math.PI / 2;
    const r = i % 2 === 0 ? 120 : 52;
    x.lineTo(r * Math.cos(a), r * Math.sin(a));
  }
  x.closePath();
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(), transparent: true, depthTest: false }));
flash.visible = false;
scene.add(flash);

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

function plateGeometry() {
  const shape = new THREE.Shape(OUTLINE.map(([x, y]) => new THREE.Vector2(x * MM, y * MM)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: K1 * MM, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -K1 * MM / 2);
  g.computeVertexNormals();
  return g;
}

function centroid(geom) {
  const p = geom.attributes.position, idx = geom.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const sum = new THREE.Vector3();
  let vol = 0;
  const n = idx ? idx.count : p.count;
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    const v = a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    vol += v;
    sum.addScaledVector(new THREE.Vector3().add(a).add(b).add(c), v / 4);
  }
  return sum.divideScalar(vol);
}

const body = new THREE.Group();
scene.add(body);
let faces = [];
let restFace = null;
let anim = null;
let hits = 0;

function buildHullFaces(points) {
  const hull = new ConvexHull().setFromPoints(points);
  const planes = [];
  for (const f of hull.faces) {
    const n = f.normal.clone();
    let pl = planes.find(q => q.n.dot(n) > 0.99995);
    if (!pl) { pl = { n, d: 0, pts: [] }; planes.push(pl); }
  }
  for (const pl of planes) {
    let d = -Infinity;
    for (const v of points) d = Math.max(d, v.dot(pl.n));
    pl.d = d;
    pl.pts = points.filter(v => Math.abs(v.dot(pl.n) - d) < 0.002);
  }
  return planes;
}

function hull2D(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-9) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 1e-9) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
function contact(face, q, pos) {
  return hull2D(face.pts.map(v => {
    const w = v.clone().applyQuaternion(q).add(pos);
    const r = [w.x, w.z]; r.l = v; return r;
  }));
}
function stableMargin(poly, cx, cz) {
  if (poly.length < 3) return -1;
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const len = Math.hypot(ex, ez);
    const dist = (ex * (cz - a[1]) - ez * (cx - a[0])) / len;
    m = Math.min(m, dist);
  }
  return m;
}

let REST_D = 0;
function restOn(face, yaw) {
  const q = new THREE.Quaternion().setFromUnitVectors(face.n, DOWN);
  q.premultiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
  body.quaternion.copy(q);
  body.position.set(body.position.x, face.d, body.position.z);
  restFace = face;
}

function settle(face, q, pos) {
  const nw = face.n.clone().applyQuaternion(q);
  q.premultiply(new THREE.Quaternion().setFromUnitVectors(nw, DOWN)).normalize();
  pos.y = face.d;
}

function planTumble(F, P) {
  let away = null;
  const segs = [];
  let q = body.quaternion.clone().normalize();
  let pos = body.position.clone();
  let face = restFace;
  settle(face, q, pos);
  let lastStable = { n: 0, q: q.clone(), pos: pos.clone(), face };
  for (let step = 0; step < 80; step++) {
    const poly = contact(face, q, pos);
    let best = null, bestDot = -Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ex = b[0] - a[0], ez = b[1] - a[1];
      const len = Math.hypot(ex, ez);
      if (len < 1e-4) continue;
      const m = new THREE.Vector3(ez / len, 0, -ex / len);
      let dt;
      if (!away) {
        const kk = new THREE.Vector3().crossVectors(UP, m);
        const r = P.clone().sub(new THREE.Vector3(a[0], 0, a[1]));
        dt = new THREE.Vector3().crossVectors(r, F).dot(kk);
      } else dt = m.dot(away);
      if (dt > bestDot) { bestDot = dt; best = { a, b, m }; }
    }
    if (!best) break;
    if (!away) away = best.m.clone();
    const k = new THREE.Vector3().crossVectors(UP, best.m).normalize();
    const p0 = new THREE.Vector3(best.a[0], 0, best.a[1]);
    let next = null, nextAng = Infinity;
    for (const f of faces) {
      if (f === face || !f.pts.includes(best.a.l) || !f.pts.includes(best.b.l)) continue;
      const nw = f.n.clone().applyQuaternion(q);
      let ang = Math.atan2(k.dot(new THREE.Vector3().crossVectors(nw, DOWN)), nw.dot(DOWN));
      if (ang <= 1e-4) ang += Math.PI * 2;
      if (ang < nextAng) { nextAng = ang; next = f; }
    }
    if (!next) break;
    const R = new THREE.Quaternion().setFromAxisAngle(k, nextAng);
    segs.push({ p0, k, ang: nextAng, q0: q.clone(), pos0: pos.clone() });
    q = R.clone().multiply(q);
    pos = p0.clone().add(pos.clone().sub(p0).applyQuaternion(R));
    face = next;
    settle(face, q, pos);
    const margin = stableMargin(contact(face, q, pos), pos.x, pos.z);
    if (margin > 0.01) {
      lastStable = { n: segs.length, q: q.clone(), pos: pos.clone(), face };
      if (Math.abs(face.d - REST_D) < 0.003) break;
    }
  }
  segs.length = lastStable.n;
  return { segs, q: lastStable.q, pos: lastStable.pos, face: lastStable.face };
}

function applySegment(s, phi) {
  const R = new THREE.Quaternion().setFromAxisAngle(s.k, phi);
  body.quaternion.copy(R).multiply(s.q0);
  body.position.copy(s.p0).add(s.pos0.clone().sub(s.p0).applyQuaternion(R));
}

(() => {
  const gA = plateGeometry();
  const mB = new THREE.Matrix4()
    .makeTranslation(0, 2 * K0 * MM, 0)
    .multiply(new THREE.Matrix4().makeRotationZ(Math.PI))
    .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  const gB = gA.clone().applyMatrix4(mB);

  const com = centroid(gA).add(centroid(gB)).multiplyScalar(0.5);
  for (const sx of [-1, 1]) {
    const c = new THREE.Vector3(sx * BALL_X * MM, BALL_Y * MM, 0);
    balls.push({ c: c.clone().sub(com), n: new THREE.Vector3(0, 0, 1) });
    balls.push({ c: c.clone().applyMatrix4(mB).sub(com), n: new THREE.Vector3(0, 0, 1).transformDirection(mB) });
  }
  for (const g of [gA, gB]) {
    g.translate(-com.x, -com.y, -com.z);
    const mesh = new THREE.Mesh(g, paint);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
  }

  const pts = [];
  for (const g of [gA, gB]) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(p, i));
  }
  const seen = new Map();
  for (const v of pts) seen.set(`${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`, v);
  pts.length = 0;
  pts.push(...seen.values());
  faces = buildHullFaces(pts);

  let best = null;
  for (const f of faces) {
    const q = new THREE.Quaternion().setFromUnitVectors(f.n, DOWN);
    const poly = contact(f, q, new THREE.Vector3(0, f.d, 0));
    const m = stableMargin(poly, 0, 0);
    if (m > 0.01 && (!best || f.d < best.d - 1e-4 || (Math.abs(f.d - best.d) < 1e-4 && m > best.m))) best = { f, d: f.d, m };
  }
  REST_D = best.f.d;
  restOn(best.f, -0.6);
  controls.target.set(0, 1.0, 0);
  controls.update();
  btn.disabled = false;
})();

const ray = new THREE.Raycaster();
let lastBall = -1;
btn.addEventListener('click', () => {
  if (anim || !restFace) return;
  const cands = [];
  balls.forEach((bl, idx) => {
    const c = bl.c.clone().applyQuaternion(body.quaternion).add(body.position);
    const n = bl.n.clone().applyQuaternion(body.quaternion);
    const toCam = camera.position.clone().sub(c).normalize();
    const facing = Math.abs(n.dot(toCam));
    ray.set(camera.position, c.clone().sub(camera.position).normalize());
    const h = ray.intersectObject(body, true)[0];
    if (h && h.point.distanceTo(c) < R_BALL * MM * 1.05) cands.push({ idx, c, toCam, point: h.point, facing });
  });
  let pool = cands.filter(x => x.facing > 0.3);
  if (!pool.length) pool = cands;
  if (pool.length > 1) pool = pool.filter(x => x.idx !== lastBall);
  const target = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  let P, F;
  if (target) {
    lastBall = target.idx;
    P = target.point;
    F = target.toCam.clone().negate();
    flash.position.copy(P).addScaledVector(target.toCam, 0.06);
    flash.visible = true;
  } else {
    P = body.position.clone();
    F = body.position.clone().sub(camera.position).normalize();
  }
  const plan = planTumble(F, P);
  if (!plan.segs.length) return;
  hits++;
  hud.textContent = `Impactos: ${hits}`;
  const total = plan.segs.reduce((s, x) => s + x.ang, 0);
  const now = performance.now();
  anim = { plan, total, t0: now + 90, dur: reduce ? 1 : 520 + total * 260, flashT0: now };
});

const followPrev = new THREE.Vector3();
function follow() {
  const d = new THREE.Vector3(body.position.x - followPrev.x, 0, body.position.z - followPrev.z);
  followPrev.set(body.position.x, 0, body.position.z);
  controls.target.add(d);
  camera.position.add(d);
  key.target.position.set(body.position.x, 0, body.position.z);
  key.position.copy(key.target.position).add(KEY_OFF);
  grid.position.set(Math.round(body.position.x / 0.5) * 0.5, 0, Math.round(body.position.z / 0.5) * 0.5);
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

let visible = true;
new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 }).observe(stage);

const easeFall = t => t * t * (3 - 2 * t) * 0.35 + t * t * 0.65;
let last = performance.now();
const spin = new THREE.Quaternion();

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!visible) return;

  if (anim) {
    const t = Math.max(0, Math.min((now - anim.t0) / anim.dur, 1));
    let rem = easeFall(t) * anim.total;
    for (const s of anim.plan.segs) {
      if (rem <= s.ang || s === anim.plan.segs[anim.plan.segs.length - 1]) { applySegment(s, Math.min(rem, s.ang)); break; }
      rem -= s.ang;
    }
    const ft = (now - anim.flashT0) / 420;
    if (ft < 1) {
      const sc = 0.22 + ft * 0.7;
      flash.scale.set(sc, sc, sc);
      flash.material.opacity = 1 - ft;
      flash.material.color.set(ft < 0.2 ? 0xffffff : 0xf0c8b8);
    } else flash.visible = false;
    if (t >= 1) {
      body.quaternion.copy(anim.plan.q);
      body.position.copy(anim.plan.pos);
      restFace = anim.plan.face;
      flash.visible = false;
      anim = null;
    }
  } else if (!dragging && !reduce && restFace) {
    spin.setFromAxisAngle(UP, dt * 0.3);
    body.quaternion.premultiply(spin).normalize();
  }

  follow();
  controls.update();
  renderer.render(scene, camera);
});
