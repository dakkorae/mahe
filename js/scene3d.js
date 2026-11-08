// Mahe for mobile — Three.js 3D 보드·거북이·주사위·카메라
// 모델은 모두 코드로 만든 카툰풍 도형이라 별도 에셋 파일 없이 동작한다.
import * as THREE from 'three';
import { COLOR_BY_ID, BOARD_SIZE, RAFT, positionOf } from './engine.js';

const SLOTS = BOARD_SIZE + 1;     // 뗏목 1자리 + 21칸
const RING_R = 7.6;               // 칸이 놓인 원의 반지름
const TILE_TOP = 0.32;            // 칸 윗면 높이
const TURTLE_H = 0.46;            // 거북이 한 마리 높이(쌓기 간격)
const STEP_SEC = 0.15;            // 칸당 이동 시간
const DIE = 0.95;

const QUALITY = {
  high:   { pixelRatio: 2,   shadows: true,  shadowMap: 1024, waves: true,  antialias: true },
  medium: { pixelRatio: 1.5, shadows: true,  shadowMap: 512,  waves: true,  antialias: true },
  low:    { pixelRatio: 1,   shadows: false, shadowMap: 256,  waves: false, antialias: false },
};

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

// 칸 번호 → 평면 각도 (위에서 볼 때 반시계 방향으로 증가)
function slotAngle(slot) { return -Math.PI / 2 + slot * (Math.PI * 2 / SLOTS); }
function slotPos(slot, r = RING_R) {
  const a = slotAngle(slot);
  return new THREE.Vector3(Math.cos(a) * r, 0, -Math.sin(a) * r);
}
// 반시계 방향 진행 방향(접선)으로 향하는 y축 회전값
function headingAt(slot) {
  const a = slotAngle(slot);
  const dir = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));
  return Math.atan2(dir.x, dir.z);
}
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ---------- 모델 ----------
function makeTurtle(colorHex) {
  const g = new THREE.Group();
  const shellMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.45, metalness: 0.05 });
  const darker = new THREE.Color(colorHex).multiplyScalar(0.7);
  const lighter = new THREE.Color(colorHex).lerp(new THREE.Color('#ffffff'), 0.35);
  const rimMat = new THREE.MeshStandardMaterial({ color: darker, roughness: 0.5 });
  const scuteMat = new THREE.MeshStandardMaterial({ color: lighter, roughness: 0.4 });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#9fdc7c', roughness: 0.6 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: '#f3e3a1', roughness: 0.7 });
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2 });
  const black = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.2 });

  const body = new THREE.Group();
  g.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12), bellyMat);
  belly.scale.set(0.95, 0.22, 1.12); belly.position.y = 0.1;
  body.add(belly);

  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
  shell.scale.set(0.98, 0.62, 1.15); shell.position.y = 0.12;
  body.add(shell);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.055, 8, 32), rimMat);
  rim.rotation.x = Math.PI / 2; rim.scale.set(0.98, 1.15, 1); rim.position.y = 0.13;
  body.add(rim);

  // 등껍질 무늬
  const scuteGeo = new THREE.SphereGeometry(0.13, 12, 8);
  const spots = [[0, 0.42, 0], [0.2, 0.34, 0.25], [-0.2, 0.34, 0.25], [0.2, 0.34, -0.25], [-0.2, 0.34, -0.25], [0, 0.3, 0.42], [0, 0.3, -0.42]];
  for (const [x, y, z] of spots) {
    const s = new THREE.Mesh(scuteGeo, scuteMat);
    s.position.set(x, y, z); s.scale.set(1, 0.35, 1);
    s.lookAt(x * 3, y + 1.5, z * 3);
    body.add(s);
  }

  const head = new THREE.Group();
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skinMat);
  headMesh.scale.set(1, 0.9, 1.15);
  head.add(headMesh);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), white);
    eye.position.set(sx * 0.1, 0.07, 0.15);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), black);
    pupil.position.set(sx * 0.11, 0.08, 0.2);
    head.add(eye, pupil);
  }
  head.position.set(0, 0.2, 0.68);
  body.add(head);

  const flippers = [];
  const flipGeo = new THREE.SphereGeometry(0.16, 12, 8);
  for (const [x, z, front] of [[0.45, 0.32, true], [-0.45, 0.32, true], [0.38, -0.42, false], [-0.38, -0.42, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.1, z);
    const f = new THREE.Mesh(flipGeo, skinMat);
    f.scale.set(front ? 1.9 : 1.2, 0.35, 0.9);
    f.position.x = Math.sign(x) * (front ? 0.2 : 0.12);
    pivot.add(f);
    pivot.rotation.y = Math.sign(x) * (front ? -0.35 : 0.5);
    body.add(pivot);
    flippers.push({ pivot, side: Math.sign(x), front });
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 8), skinMat);
  tail.rotation.x = -Math.PI / 2; tail.position.set(0, 0.1, -0.62);
  body.add(tail);

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.scale.setScalar(0.82);
  g.userData = { body, head, flippers, shell, phase: Math.random() * Math.PI * 2, swimming: 0 };
  return g;
}

function makeLabel(text, colorHex) {
  const tex = canvasTexture(320, 90, (g, w, h) => {
    g.font = 'bold 54px system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    const tw = Math.min(w - 8, g.measureText(text).width + 56);
    const x = (w - tw) / 2;
    roundRect(g, x, 6, tw, 78, 39);
    g.fillStyle = 'rgba(255,255,255,0.96)'; g.fill();
    g.lineWidth = 8; g.strokeStyle = colorHex; g.stroke();
    g.fillStyle = '#111827'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, 47, tw - 30);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(1.85, 0.52, 1);
  sp.renderOrder = 10;
  return sp;
}

const PIPS = {
  1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
};
// BoxGeometry 면 순서: +x, -x, +y, -y, +z, -z
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
// 값 v가 위(+y)를 보도록 하는 회전
const FACE_UP = {
  1: new THREE.Euler(0, 0, 0), 6: new THREE.Euler(Math.PI, 0, 0),
  2: new THREE.Euler(-Math.PI / 2, 0, 0), 5: new THREE.Euler(Math.PI / 2, 0, 0),
  3: new THREE.Euler(0, 0, Math.PI / 2), 4: new THREE.Euler(0, 0, -Math.PI / 2),
};
function dieMaterials() {
  return FACE_VALUES.map(v => new THREE.MeshStandardMaterial({
    roughness: 0.35, emissive: new THREE.Color('#000000'),
    map: canvasTexture(128, 128, (g, w) => {
      g.fillStyle = '#fffdf7'; g.fillRect(0, 0, w, w);
      g.fillStyle = v === 1 ? '#dc2626' : '#1f2937';
      for (const [x, y] of PIPS[v]) { g.beginPath(); g.arc(x * w, y * w, w * (v === 1 ? 0.13 : 0.095), 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = '#e5e1d3'; g.lineWidth = 8; g.strokeRect(0, 0, w, w);
    }),
  }));
}

// ---------- 장면 ----------
export function createScene(container, opts = {}) {
  let qualityName = opts.quality || 'high';
  let Q = QUALITY[qualityName];
  const renderer = new THREE.WebGLRenderer({ antialias: Q.antialias, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '마헤 3D 게임 보드');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fdcf5');
  scene.fog = new THREE.Fog('#8fdcf5', 34, 70);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  let elevation = 48 * Math.PI / 180;

  // 조명
  scene.add(new THREE.HemisphereLight('#e0f6ff', '#f6d7a7', 1.1));
  const sun = new THREE.DirectionalLight('#fff4dc', 2.2);
  sun.position.set(-9, 16, 8);
  sun.shadow.camera.left = -11; sun.shadow.camera.right = 11;
  sun.shadow.camera.top = 11; sun.shadow.camera.bottom = -11;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 50;
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // 바다
  const seaGeo = new THREE.PlaneGeometry(90, 90, 64, 64);
  seaGeo.rotateX(-Math.PI / 2);
  const seaBase = seaGeo.attributes.position.array.slice();
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({ color: '#21a8d8', roughness: 0.18, metalness: 0.15, flatShading: true }));
  sea.position.y = -0.05;
  sea.receiveShadow = true;
  scene.add(sea);
  const shallow = new THREE.Mesh(new THREE.RingGeometry(4.6, 9.6, 64), new THREE.MeshStandardMaterial({ color: '#5fe0e8', transparent: true, opacity: 0.55, roughness: 0.2 }));
  shallow.rotation.x = -Math.PI / 2; shallow.position.y = 0.0;
  scene.add(shallow);

  // 섬
  const island = new THREE.Group();
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.7, 0.7, 48), new THREE.MeshStandardMaterial({ color: '#f5d99a', roughness: 0.95 }));
  sand.position.y = 0.05;
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 4.3, 0.4, 40), new THREE.MeshStandardMaterial({ color: '#6cc24a', roughness: 0.9 }));
  grass.position.y = 0.5;
  island.add(sand, grass);
  // 주사위 테이블(평평한 바위)
  const table = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.2, 0.25, 28), new THREE.MeshStandardMaterial({ color: '#d9cdb8', roughness: 0.8 }));
  table.position.set(0, 0.8, 0.6);
  island.add(table);
  const TABLE_Y = 0.93 + DIE / 2;

  const palmTrunkMat = new THREE.MeshStandardMaterial({ color: '#a0703c', roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#2fa84f', roughness: 0.7, side: THREE.DoubleSide });
  function palm(x, z, h, tilt) {
    const p = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.13 - i * 0.012, 0.16 - i * 0.012, h / 6, 8), palmTrunkMat);
      seg.position.set(Math.sin(tilt) * i * h / 6 * 0.4, (i + 0.5) * h / 6, 0);
      p.add(seg);
    }
    const top = new THREE.Vector3(Math.sin(tilt) * h * 0.4, h, 0);
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.6, 4, 1, true), leafMat);
      leaf.position.copy(top);
      leaf.rotation.set(0, i * Math.PI * 2 / 7, 0);
      leaf.rotateX(Math.PI / 2.2);
      leaf.translateY(0.7);
      leaf.scale.set(1, 1, 0.25);
      p.add(leaf);
    }
    const coco = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: '#6b4423' }));
    coco.position.copy(top).add(new THREE.Vector3(0.1, -0.15, 0.1));
    p.add(coco);
    p.position.set(x, 0.7, z);
    return p;
  }
  island.add(palm(-1.9, -1.4, 2.6, 0.3), palm(1.6, -1.9, 2.2, -0.4), palm(-0.2, -2.6, 3.0, 0.1));
  const rockMat = new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.85, flatShading: true });
  for (const [x, z, s] of [[2.8, 0.6, 0.45], [-2.9, 0.9, 0.38], [3.6, -1.5, 0.3], [-3.9, -1.8, 0.5], [0.9, 3.4, 0.28]]) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s), rockMat);
    r.position.set(x, 0.6 + s * 0.4, z); r.rotation.set(x, z, s);
    island.add(r);
  }
  const flowerColors = ['#ff6fa8', '#ffd23f', '#ffffff', '#ff8a3d'];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4, r = 2.2 + (i % 4) * 0.4;
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: flowerColors[i % 4], roughness: 0.5 }));
    f.position.set(Math.cos(a) * r, 0.74, Math.sin(a) * r);
    island.add(f);
  }
  island.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(island);

  // 칸 1~21
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#e8dcc4', roughness: 0.75 });
  const nestMat = new THREE.MeshStandardMaterial({ color: '#f2c879', roughness: 0.9 });
  const tileGeo = new THREE.CylinderGeometry(0.82, 0.95, 0.4, 24);
  const tiles = [];
  for (let i = 1; i <= BOARD_SIZE; i++) {
    const t = new THREE.Mesh(tileGeo, i === BOARD_SIZE ? nestMat : stoneMat);
    t.position.copy(slotPos(i)); t.position.y = TILE_TOP - 0.2;
    t.castShadow = t.receiveShadow = true;
    const num = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), new THREE.MeshStandardMaterial({
      transparent: true, roughness: 0.8,
      map: canvasTexture(128, 128, (g, w) => {
        g.fillStyle = i === BOARD_SIZE ? '#c2410c' : '#7c6a4f';
        g.font = 'bold 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(i), w / 2, w / 2 + 4);
      }),
    }));
    num.rotation.x = -Math.PI / 2;
    num.rotation.z = 0; // 카메라 쪽에서 똑바로 읽히게
    num.position.y = 0.205;
    t.add(num);
    scene.add(t);
    tiles.push(t);
  }
  // 21번 둥지의 알
  const eggMat = new THREE.MeshStandardMaterial({ color: '#fff8ea', roughness: 0.4 });
  const nest = new THREE.Group();
  const p21 = slotPos(BOARD_SIZE, RING_R + 1.35);
  for (let i = 0; i < 6; i++) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), eggMat);
    e.scale.set(1, 1.25, 1);
    e.position.set(Math.cos(i) * 0.3 * (i % 3), 0.15 + (i > 3 ? 0.18 : 0), Math.sin(i) * 0.3 * (i % 3));
    e.castShadow = true;
    nest.add(e);
  }
  const nestBase = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.15, 8, 20), nestMat);
  nestBase.rotation.x = Math.PI / 2; nestBase.position.y = 0.08;
  nest.add(nestBase);
  nest.position.copy(p21); nest.position.y = 0.05;
  scene.add(nest);
  // 7알 해변 (덱이 바닥나면 드러남)
  const bonusBeach = new THREE.Group();
  const beach = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.12, 28), new THREE.MeshStandardMaterial({ color: '#ffe08a', emissive: '#ffb703', emissiveIntensity: 0.35 }));
  bonusBeach.add(beach);
  const seven = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(128, 128, (g, w) => {
    g.fillStyle = '#f59e0b'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 76px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('7', w / 2, w / 2 + 4);
  }), transparent: true }));
  seven.scale.set(0.9, 0.9, 1); seven.position.y = 1.0;
  bonusBeach.add(seven);
  bonusBeach.position.copy(p21); bonusBeach.position.y = 0.05;
  bonusBeach.visible = false;
  scene.add(bonusBeach);

  // 뗏목
  const raft = new THREE.Group();
  const logMat = new THREE.MeshStandardMaterial({ color: '#b07a43', roughness: 0.9 });
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.5, 10), logMat);
    log.rotation.z = Math.PI / 2;
    log.position.set(0, 0.1, -0.8 + i * 0.4);
    log.castShadow = log.receiveShadow = true;
    raft.add(log);
  }
  const rope = new THREE.MeshStandardMaterial({ color: '#e7d7a8' });
  for (const x of [-0.85, 0.85]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.46, 2.1), rope);
    r.position.set(x, 0.12, 0); raft.add(r);
  }
  const raftPos = slotPos(RAFT, RING_R + 0.55);
  raft.position.copy(raftPos);
  raft.rotation.y = headingAt(RAFT) + Math.PI / 2;
  scene.add(raft);
  const RAFT_TOP = 0.36;

  // 내 차례 빛 고리
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 10, 40), new THREE.MeshStandardMaterial({ color: '#fff59d', emissive: '#ffd60a', emissiveIntensity: 1.2 }));
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  // 주사위
  const dice = [];
  const bustColor = new THREE.Color('#ff1f1f');
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(DIE, DIE, DIE), dieMaterials());
    d.castShadow = true;
    d.visible = false;
    scene.add(d);
    dice.push(d);
  }
  const diceSlot = (i, n) => new THREE.Vector3((i - (n - 1) / 2) * 1.15, TABLE_Y, 0.7);

  // 파티클
  const particles = [];
  const partGeo = new THREE.SphereGeometry(0.09, 8, 6);
  function burst(at, color, count, speed, scale = 1) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, transparent: true });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(partGeo, mat);
      m.position.copy(at);
      m.scale.setScalar(scale * (0.6 + Math.random() * 0.8));
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * speed * Math.random(), speed * (1 + Math.random()), Math.sin(a) * speed * Math.random());
      scene.add(m);
      particles.push({ m, v, life: 1.1 + Math.random() * 0.5 });
    }
  }
  function floatText(text, at, color) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, map: canvasTexture(256, 128, (g, w, h) => {
      g.font = 'bold 72px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = '#fff'; g.strokeText(text, w / 2, h / 2); g.fillStyle = color; g.fillText(text, w / 2, h / 2);
    }) }));
    sp.scale.set(2, 1, 1); sp.position.copy(at); sp.renderOrder = 20;
    scene.add(sp);
    particles.push({ m: sp, v: new THREE.Vector3(0, 1.2, 0), life: 1.6, text: true });
  }

  // ---------- 거북이 관리 ----------
  const turtles = {}; // color → { obj, label, anim }
  function ensureTurtle(color, labelText) {
    if (!turtles[color]) {
      const obj = makeTurtle(COLOR_BY_ID[color].hex);
      scene.add(obj);
      turtles[color] = { obj, label: null, labelText: null, tween: null };
    }
    const t = turtles[color];
    if (labelText && t.labelText !== labelText) {
      if (t.label) { t.obj.remove(t.label); t.label.material.map.dispose(); }
      t.label = makeLabel(labelText, COLOR_BY_ID[color].hex);
      t.label.position.set(0, 1.1, 0);
      t.label.scale.multiplyScalar(1 / 0.82);
      t.obj.add(t.label);
      t.labelText = labelText;
    }
    return t;
  }

  // 정해진 상태에서 각 거북이가 있어야 할 위치·방향
  function homeOf(state, color) {
    const p = positionOf(state, color);
    if (!p) return null;
    if (p.pos === RAFT) {
      const k = p.idx, n = state.board[RAFT].length;
      const cols = n > 4 ? 3 : 2;
      const row = Math.floor(k / cols), col = k % cols;
      const local = new THREE.Vector3((col - (cols - 1) / 2) * 0.78, RAFT_TOP, (row - (Math.ceil(n / cols) - 1) / 2) * 0.72);
      local.applyAxisAngle(new THREE.Vector3(0, 1, 0), raft.rotation.y);
      return { pos: raftPos.clone().add(local), rot: headingAt(RAFT), slot: RAFT, level: 0 };
    }
    const base = slotPos(p.pos);
    base.y = TILE_TOP + p.idx * TURTLE_H;
    return { pos: base, rot: headingAt(p.pos), slot: p.pos, level: p.idx };
  }

  let lastState = null;
  let labelFn = c => c;

  function snap(state, smooth = true) {
    lastState = state;
    for (const color of Object.keys(state.turtles)) {
      const t = ensureTurtle(color, labelFn(color));
      const h = homeOf(state, color);
      if (!h) continue;
      if (smooth && t.obj.visible) tweenTo(t, h.pos, h.rot, 0.25, 0);
      else { t.obj.position.copy(h.pos); t.obj.rotation.y = h.rot; t.tween = null; }
      t.obj.visible = true;
    }
    for (const color of Object.keys(turtles)) if (!state.turtles[color]) turtles[color].obj.visible = false;
    bonusBeach.visible = state.deck.length === 0;
    nest.visible = state.deck.length > 0;
    updateRing();
  }

  function tweenTo(t, pos, rot, dur, hop) {
    return new Promise(resolve => {
      t.tween = { from: t.obj.position.clone(), to: pos.clone(), rotFrom: t.obj.rotation.y, rotTo: rot, dur, hop, el: 0, resolve };
    });
  }

  let ringColor = null;
  function updateRing() {
    if (!ringColor || !turtles[ringColor] || !lastState || lastState.phase === 'ended') { ring.visible = false; return; }
    ring.visible = true;
  }

  // 무리를 path(칸 번호 목록)를 따라 한 칸씩 이동
  async function moveGroup(group, path, finalState) {
    const ts = group.map(c => turtles[c]);
    ts.forEach(t => { t.obj.userData.swimming = 1; });
    let prevSlot = null;
    for (let step = 0; step < path.length; step++) {
      const slot = path[step];
      const last = step === path.length - 1;
      let baseLevel = 0;
      if (last && finalState) {
        const h = homeOf(finalState, group[0]);
        baseLevel = h ? h.level : 0;
      }
      const promises = ts.map((t, i) => {
        const p = slotPos(slot); p.y = TILE_TOP + (baseLevel + i) * TURTLE_H;
        return tweenTo(t, p, headingAt(slot), STEP_SEC, 0.35);
      });
      await Promise.all(promises);
      prevSlot = slot;
    }
    ts.forEach(t => { t.obj.userData.swimming = 0; });
    return prevSlot;
  }

  async function bustGroup(group, finalState) {
    const ts = group.map(c => turtles[c]);
    ts.forEach(t => { t.obj.userData.swimming = 1; });
    await Promise.all(ts.map(t => {
      const h = homeOf(finalState, group[ts.indexOf(t)]);
      return tweenTo(t, h.pos, h.rot, 0.75, 1.2);
    }));
    ts.forEach(t => { t.obj.userData.swimming = 0; });
    burst(raftPos.clone().add(new THREE.Vector3(0, 0.3, 0)), '#e0f7ff', Q.waves ? 30 : 14, 3.2, 1.2);
  }

  // ---------- 주사위 ----------
  let diceShown = 0;
  function setDiceBust(on) {
    for (const d of dice) for (const m of d.material) { m.emissive.copy(on ? bustColor : new THREE.Color(0)); m.emissiveIntensity = on ? 0.55 : 0; }
  }
  function placeDie(d, v, slot) {
    d.position.copy(slot);
    d.quaternion.setFromEuler(FACE_UP[v]);
    d.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (slot.x * 0.4) % 0.6));
  }
  function showDice(values, bust) {
    diceShown = values.length;
    dice.forEach((d, i) => {
      d.visible = i < values.length;
      if (d.visible) { d.userData.rolling = null; placeDie(d, values[i], diceSlot(i, values.length)); }
    });
    setDiceBust(!!bust);
  }
  function clearDice() { diceShown = 0; dice.forEach(d => { d.visible = false; d.userData.rolling = null; }); setDiceBust(false); }

  function rollDice(values, bust) {
    // 이미 놓인 주사위는 새 자리로 옮기고 마지막 주사위만 굴린다
    const n = values.length;
    return new Promise(resolve => {
      dice.forEach((d, i) => {
        d.visible = i < n;
        if (!d.visible) return;
        const slot = diceSlot(i, n);
        if (i < n - 1) { placeDie(d, values[i], slot); return; }
        const endQ = new THREE.Quaternion().setFromEuler(FACE_UP[values[i]]);
        endQ.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (slot.x * 0.4) % 0.6));
        d.userData.rolling = {
          el: 0, dur: 0.85,
          start: slot.clone().add(new THREE.Vector3(-1.2, 2.6, 1.5)), end: slot,
          spin: new THREE.Vector3(Math.random() * 14 + 8, Math.random() * 10, Math.random() * 14 + 8),
          endQ, resolve: () => { setDiceBust(!!bust); resolve(); },
        };
      });
      setDiceBust(false);
      diceShown = n;
    });
  }

  // ---------- 상태 반영 ----------
  // events가 있으면 애니메이션을 재생한 뒤 최종 상태로 맞춘다.
  let chain = Promise.resolve();
  function apply(state, events = null) {
    chain = chain.then(() => play(state, events)).catch(e => { console.error(e); snap(state, false); });
    return chain;
  }
  async function play(state, events) {
    if (!events || !events.length || !lastState) {
      snap(state, !!lastState);
      if (state.current && state.current.dice.length) showDice(state.current.dice, false);
      return;
    }
    // 새 거북이가 생겼으면 우선 만들어 둔다
    for (const color of Object.keys(state.turtles)) ensureTurtle(color, labelFn(color));
    for (const ev of events) {
      if (ev.type === 'roll') {
        await rollDice(ev.dice, ev.dice.reduce((a, b) => a + b, 0) > 7);
        opts.onDiceRolled && opts.onDiceRolled(ev);
        if (ev.dice.reduce((a, b) => a + b, 0) > 7) await sleep(450);
      } else if (ev.type === 'move') {
        const path = [];
        for (let k = 1; k <= ev.dist; k++) { const s = (ev.from + k) % BOARD_SIZE; path.push(s === 0 ? BOARD_SIZE : s); }
        await moveGroup(ev.group, path, state);
      } else if (ev.type === 'bust') {
        await bustGroup(ev.group, state);
      } else if (ev.type === 'egg' || ev.type === 'bonus') {
        const at = slotPos(BOARD_SIZE); at.y = 1.2;
        burst(at, ev.type === 'bonus' ? '#ffd23f' : '#fff8ea', Q.waves ? 26 : 12, 3.5, 1.4);
        floatText(`+${ev.card}`, at.clone().add(new THREE.Vector3(0, 0.8, 0)), ev.type === 'bonus' ? '#f59e0b' : '#16a34a');
        await sleep(500);
      }
    }
    snap(state, true);
    if (state.current && state.current.dice.length) showDice(state.current.dice, false);
  }

  // ---------- 카메라 맞추기 ----------
  let landscape = false;
  function fitCamera() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    const aspect = w / h;
    camera.aspect = aspect;
    landscape = aspect > 1;
    elevation = (landscape ? 42 : 52) * Math.PI / 180;
    const vfov = camera.fov * Math.PI / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const R = RING_R + 1.7; // 보드 가장자리(칸·뗏목·둥지 포함)
    // 기울어진 원판의 화면상 반높이 ≈ R·sin(elev) + 높이 여유
    const halfV = R * Math.sin(elevation) + 1.2 * Math.cos(elevation);
    const distH = R / Math.tan(hfov / 2) + R * Math.cos(elevation) * 0.35;
    const distV = halfV / Math.tan(vfov / 2) + R * Math.cos(elevation) * 0.5;
    const dist = Math.max(distH, distV) * 1.02;
    const target = new THREE.Vector3(0, 0.4, 0.75);
    camera.position.set(target.x, target.y + Math.sin(elevation) * dist, target.z + Math.cos(elevation) * dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pixelRatio));
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
    fitCamera();
  }

  function setQuality(name) {
    qualityName = QUALITY[name] ? name : 'high';
    Q = QUALITY[qualityName];
    renderer.shadowMap.enabled = Q.shadows;
    sun.castShadow = Q.shadows;
    sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    scene.traverse(o => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); } });
    if (!Q.waves) { seaGeo.attributes.position.array.set(seaBase); seaGeo.attributes.position.needsUpdate = true; seaGeo.computeVertexNormals(); }
    resize();
  }
  setQuality(qualityName);

  // ---------- 매 프레임 ----------
  const clock = new THREE.Clock();
  let running = true;
  let fpsSamples = [], fpsCb = opts.onFps;
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;
    if (fpsCb && dt > 0) { fpsSamples.push(dt); if (fpsSamples.length >= 90) { const avg = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length; fpsSamples = []; fpsCb(1 / avg); } }

    if (Q.waves) {
      const arr = seaGeo.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = seaBase[i], z = seaBase[i + 2];
        arr[i + 1] = Math.sin(x * 0.45 + time * 1.3) * 0.12 + Math.cos(z * 0.5 + time * 1.1) * 0.1;
      }
      seaGeo.attributes.position.needsUpdate = true;
      seaGeo.computeVertexNormals();
    }
    raft.position.y = Math.sin(time * 1.6) * 0.04;
    shallow.material.opacity = 0.45 + Math.sin(time * 0.8) * 0.08;

    for (const color of Object.keys(turtles)) {
      const t = turtles[color];
      const u = t.obj.userData;
      if (t.tween) {
        const tw = t.tween;
        tw.el += dt;
        const k = Math.min(1, tw.el / tw.dur);
        const e = tw.hop ? k : easeInOut(k);
        t.obj.position.lerpVectors(tw.from, tw.to, e);
        if (tw.hop) t.obj.position.y += Math.sin(Math.PI * k) * tw.hop;
        let dr = tw.rotTo - tw.rotFrom;
        dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        t.obj.rotation.y = tw.rotFrom + dr * Math.min(1, e * 1.5);
        if (k >= 1) { t.tween = null; tw.resolve(); }
      }
      // 숨쉬기·헤엄
      const sw = u.swimming;
      u.body.scale.y = 1 + Math.sin(time * 2 + u.phase) * 0.03;
      u.head.position.z = 0.68 + Math.sin(time * 1.5 + u.phase) * 0.03;
      u.head.rotation.y = Math.sin(time * 0.7 + u.phase) * 0.25;
      for (const f of u.flippers) {
        const amp = sw ? 0.7 : 0.12, sp = sw ? 14 : 2;
        f.pivot.rotation.z = f.side * Math.sin(time * sp + u.phase + (f.front ? 0 : 1.5)) * amp;
      }
    }

    if (ringColor && turtles[ringColor] && ring.visible) {
      ring.position.copy(turtles[ringColor].obj.position);
      ring.position.y += 0.03;
      const s = 1 + Math.sin(time * 4) * 0.08;
      ring.scale.set(s, s, s);
    }

    for (const d of dice) {
      const r = d.userData.rolling;
      if (!r) continue;
      r.el += dt;
      const k = Math.min(1, r.el / r.dur);
      const pos = new THREE.Vector3().lerpVectors(r.start, r.end, easeInOut(k));
      pos.y = r.end.y + (1 - k) * (r.start.y - r.end.y) * (1 - k) + Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k) * 0.6;
      d.position.copy(pos);
      if (k < 0.8) d.rotation.set(r.spin.x * r.el, r.spin.y * r.el, r.spin.z * r.el);
      else d.quaternion.slerp(r.endQ, Math.min(1, (k - 0.8) / 0.2 + 0.25));
      if (k >= 1) { d.quaternion.copy(r.endQ); d.position.copy(r.end); d.userData.rolling = null; r.resolve(); }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (!p.text) p.v.y -= 9 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.material) p.m.material.opacity = Math.max(0, Math.min(1, p.life));
      if (p.life <= 0) { scene.remove(p.m); if (p.text) { p.m.material.map.dispose(); p.m.material.dispose(); } particles.splice(i, 1); }
    }

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  document.addEventListener('visibilitychange', () => { clock.getDelta(); });

  return {
    apply,
    resize,
    setQuality,
    get quality() { return qualityName; },
    setLabels(fn) { labelFn = fn; for (const c of Object.keys(turtles)) ensureTurtle(c, labelFn(c)); },
    highlight(color) { ringColor = color; updateRing(); },
    clearDice,
    showDice,
    reset() { lastState = null; clearDice(); chain = Promise.resolve(); },
    dispose() { running = false; ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); },
    get idle() { return Object.values(turtles).every(t => !t.tween) && dice.every(d => !d.userData.rolling); },
  };
}
