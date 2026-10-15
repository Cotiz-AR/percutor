// Flipping Jack FPJ-R1 — modelo 3D interactivo
// Geometría del documento del proyecto: dos chapas idénticas de 5/16" cruzadas a 90°,
// cada una con 3 brazos a 120° (2 con bocha Ø90 + 1 con la ranura de encastre),
// brazo cubo→centro de bocha 147,2 mm. Unidades de escena: 1 = 100 mm.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const stage = document.getElementById('stage');
const btn = document.getElementById('hitBtn');
const hud = document.getElementById('hudTxt');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const MM = 0.01;
const T = 7.94 * MM;         // espesor de chapa
const ARM = 147.2 * MM;      // cubo → centro de bocha
const R_BALL = 45 * MM;      // bocha Ø90
const R_HUB = 34 * MM;
const ARM_W = 42 * MM;
const POST_TOP = 22.4 * MM;  // alto por pieza ~141 mm
const HUB_H = (ARM * 0.5 + R_BALL); // altura del cubo apoyado en las 4 bochas (118,6 mm)
const REST_TOP = HUB_H + POST_TOP + 12 * MM; // parte más alta en reposo

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch (e) {
  document.getElementById('nogl').style.display = 'flex';
  btn.disabled = true;
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(3.7, 2.55, 6.0);

// Luces
scene.add(new THREE.HemisphereLight(0xf2efe8, 0x1a1c1e, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(3, 6, 4);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 15 });
key.shadow.radius = 4;
scene.add(key);
const rim = new THREE.DirectionalLight(0xe9e6df, 0.9);
rim.position.set(-4, 3, -3);
scene.add(rim);

// Piso: solo sombra
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.38 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(8, 16, 0x3a3d40, 0x2a2d30);
grid.material.transparent = true;
grid.material.opacity = 0.5;
scene.add(grid);

// Material: pintura para metal, rojo mate
const paint = new THREE.MeshStandardMaterial({ color: 0xb12a26, roughness: 0.72, metalness: 0.18 });

const bevel = { depth: T - 1.6 * MM, bevelEnabled: true, bevelThickness: 0.8 * MM, bevelSize: 0.8 * MM, bevelSegments: 2, curveSegments: 48 };
function extrude(shape) {
  const g = new THREE.ExtrudeGeometry(shape, bevel);
  g.translate(0, 0, -(T - 1.6 * MM) / 2);
  const m = new THREE.Mesh(g, paint);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function circle(x, y, r) {
  const s = new THREE.Shape();
  s.absarc(x, y, r, 0, Math.PI * 2, false);
  return s;
}
function rect(cx, cy, w, h, ang) {
  const s = new THREE.Shape();
  const c = Math.cos(ang), sn = Math.sin(ang);
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([x, y]) => new THREE.Vector2(cx + x * c - y * sn, cy + x * sn + y * c));
  s.setFromPoints(pts);
  return s;
}

// Una chapa en el plano XY, cubo en el origen, brazo de encastre hacia +Y
function plate() {
  const g = new THREE.Group();
  g.add(extrude(circle(0, 0, R_HUB)));
  g.add(extrude(rect(0, POST_TOP / 2 + 6 * MM, 46 * MM, POST_TOP + 12 * MM, 0)));
  const faces = [];
  for (const a of [120, 240]) {
    const t = THREE.MathUtils.degToRad(a);
    const dx = Math.sin(t), dy = Math.cos(t);
    g.add(extrude(rect(dx * ARM / 2, dy * ARM / 2, ARM_W, ARM, -t)));
    const ball = extrude(circle(dx * ARM, dy * ARM, R_BALL));
    g.add(ball);
    const marker = new THREE.Object3D();
    marker.position.set(dx * ARM, dy * ARM, 0);
    g.add(marker);
    faces.push(marker);
  }
  return { g, faces };
}

const pivot = new THREE.Group();     // centro del cubo
scene.add(pivot);
const jack = new THREE.Group();
pivot.add(jack);
const A = plate(), B = plate();
B.g.rotation.y = Math.PI / 2;
jack.add(A.g, B.g);
const faces = [...A.faces, ...B.faces];
pivot.position.y = HUB_H;

// Destello de impacto con la estrella del emblema
function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.translate(128, 128);
  x.fillStyle = '#e9e6df';
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

// Controles: arrastrar en horizontal gira; en celular el scroll vertical sigue funcionando
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.62, 0);
controls.enableZoom = false;
controls.enablePan = false;
controls.enableDamping = true;
controls.minPolarAngle = 0.85;
controls.maxPolarAngle = 1.42;
controls.update();
renderer.domElement.style.touchAction = 'pan-y';

let dragging = false;
controls.addEventListener('start', () => { dragging = true; });
controls.addEventListener('end', () => { dragging = false; });

// Seguimiento de cámara durante el vuelco
const baseTargetY = controls.target.y;
let camLift = 0, camZoom = 1;
const tmp = new THREE.Vector3();
function follow(lift, zoom) {
  const dLift = lift - camLift;
  controls.target.y += dLift;
  camera.position.y += dLift;
  tmp.subVectors(camera.position, controls.target).multiplyScalar(zoom / camZoom);
  camera.position.copy(controls.target).add(tmp);
  camLift = lift; camZoom = zoom;
}

// Estado
let yaw = 0;
let anim = null;
let hits = 0;
const qBase = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

btn.addEventListener('click', () => {
  if (anim) return;
  // Bocha más de frente a la cámara
  const camDir = new THREE.Vector3().subVectors(camera.position, pivot.position).setY(0).normalize();
  let best = null, bestDot = -Infinity;
  const wp = new THREE.Vector3();
  for (const f of faces) {
    f.getWorldPosition(wp);
    const d = wp.clone().sub(pivot.position).setY(0).normalize().dot(camDir);
    if (d > bestDot) { bestDot = d; best = wp.clone(); }
  }
  flash.position.copy(best).addScaledVector(camDir, 0.12);
  flash.visible = true;

  const away = camDir.clone().negate();
  const axis = new THREE.Vector3().crossVectors(UP, away).normalize();
  hits++;
  hud.textContent = `Impactos: ${hits}`;
  qBase.copy(pivot.quaternion);
  anim = { t0: performance.now() + 140, dur: reduce ? 1 : 1300, axis, away, flashT0: performance.now() };
});

// Tamaño
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

// Render solo si se ve
let visible = true;
new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 }).observe(stage);

const qYaw = new THREE.Quaternion();
const qTum = new THREE.Quaternion();
const box = new THREE.Box3();
let last = performance.now();

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!visible) return;

  if (anim) {
    const t = Math.max(0, Math.min((now - anim.t0) / anim.dur, 1));
    const e = ease(t);
    // vuelca 360° alejándose del tirador y gira 90° (por simetría queda otra cara al frente)
    qTum.setFromAxisAngle(anim.axis, reduce ? 0 : e * Math.PI * 2);
    qYaw.setFromAxisAngle(UP, e * Math.PI / 2);
    pivot.quaternion.copy(qYaw).multiply(qTum).multiply(qBase);
    // rueda sobre el piso: el punto más bajo nunca lo atraviesa, más un pequeño salto
    const slide = reduce ? 0 : Math.sin(Math.PI * t) * 0.5;
    pivot.position.set(anim.away.x * slide, HUB_H, anim.away.z * slide);
    pivot.updateMatrixWorld(true);
    box.setFromObject(jack, true);
    const hop = reduce ? 0 : Math.sin(Math.PI * Math.min(t * 1.6, 1)) * 0.22;
    pivot.position.y += Math.max(0, -box.min.y) + hop;
    // cámara que acompaña: sube y se aleja mientras el jack está alto
    const top = box.max.y + (pivot.position.y - HUB_H); // box se midió con el cubo a HUB_H
    const rise = Math.max(0, top - REST_TOP);
    follow(rise * 0.5, 1 + rise * 0.55);

    const ft = (now - anim.flashT0) / 420;
    if (ft < 1) {
      const s = 0.25 + ft * 0.75;
      flash.scale.set(s, s, s);
      flash.material.opacity = 1 - ft;
      flash.material.color.set(ft < 0.2 ? 0xffffff : 0xf0c8b8);
    } else flash.visible = false;

    if (t >= 1) {
      pivot.position.set(0, HUB_H, 0);
      follow(0, 1);
      flash.visible = false;
      anim = null;
    }
  } else if (!dragging && !reduce) {
    yaw += dt * 0.35;
    qYaw.setFromAxisAngle(UP, dt * 0.35);
    pivot.quaternion.premultiply(qYaw);
  }

  controls.update();
  renderer.render(scene, camera);
});
