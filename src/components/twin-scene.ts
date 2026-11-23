import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/**
 * Procedural 3D "digital twin" of a heritage site. It is an illustrative model built from simple geometry (one builder
 * per site type, varied by a seed taken from the site's slug), NOT a survey of the real structure. Visitors are drawn
 * as instanced avatars so hundreds of them cost two draw calls.
 *
 * This file is loaded on demand (dynamic import) so three.js never lands in the main bundle.
 */
export type TwinType = "monument" | "fort" | "museum" | "temple" | "archaeological" | "palace";
export type ZoneId = "gate" | "court" | "main" | "exit";
export type CrowdInput = { avatars: number; pct: number; speed: number; emergency: boolean };
export type TwinHandle = {
  setPhoto(on: boolean): void;
  setCrowd(c: CrowdInput): void;
  setAutoRotate(on: boolean): void;
  resetView(): void;
  dispose(): void;
  readonly supported: boolean;
};

export const ZONE_LABEL: Record<ZoneId, string> = { gate: "Entry gate", court: "Courtyard", main: "Main structure", exit: "Exit" };
export const zoneStatus = (pct: number) => (pct > 80 ? "Critical" : pct >= 50 ? "Moderate" : "Safe");
const ZONE_COLOR = { Safe: 0x22c55e, Moderate: 0xf59e0b, Critical: 0xef4444 } as const;

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/* ---------- layout shared by every model, so the crowd logic works for all of them ---------- */
const R = 8.2;                                  // walkway ring around the main structure ("pradakshina" path)
const GATE = new THREE.Vector3(0, 0, 15);       // entry gate zone
const COURT = new THREE.Vector3(0, 0, 10.9);    // forecourt just inside the gate
const EXIT_IN = new THREE.Vector3(12, 0, 6);    // side exit opening
const EXIT_OUT = new THREE.Vector3(15.6, 0, 6); // outside the side exit
const THETA_IN = Math.PI / 2, THETA_OUT = Math.atan2(4, 7.1);
const GROUND_R = 19;
const TAU = Math.PI * 2;
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;

type Pal = { stone: number; stone2: number; dark: number; roof: number; ground: number; accent: number };
const PAL: Record<TwinType, Pal> = {
  monument: { stone: 0xefe7d3, stone2: 0xd9ceb2, dark: 0x4a463c, roof: 0xf4eedd, ground: 0xcdbf9b, accent: 0xd9a441 },
  fort: { stone: 0xc2693f, stone2: 0xa65634, dark: 0x3d2418, roof: 0xd9a47a, ground: 0xc9b48a, accent: 0xe8c07a },
  museum: { stone: 0xe6d8b8, stone2: 0xcdbb94, dark: 0x4a4030, roof: 0x9fb4a8, ground: 0xcfc39f, accent: 0xb8532e },
  temple: { stone: 0xbfa27a, stone2: 0xa3835a, dark: 0x3a2b1a, roof: 0xc98a4a, ground: 0xc8b58e, accent: 0xd9a441 },
  archaeological: { stone: 0xc9b283, stone2: 0xa9926a, dark: 0x4a3d28, roof: 0xd8c593, ground: 0xc4b28a, accent: 0x8fae9b },
  palace: { stone: 0xe9b79e, stone2: 0xcf977c, dark: 0x4a2c22, roof: 0xf2d7a6, ground: 0xd1c09b, accent: 0xd9a441 },
};

/* ---------- small geometry helpers ---------- */
type Mats = { stone: THREE.Material; stone2: THREE.Material; dark: THREE.Material; roof: THREE.Material; accent: THREE.Material };
function mk(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
}
const box = (p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => mk(p, new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z);
const cyl = (p: THREE.Object3D, rt: number, rb: number, h: number, x: number, y: number, z: number, mat: THREE.Material, seg = 20) => mk(p, new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y + h / 2, z);

/** Onion / bulbous dome from a lathe profile. */
function dome(p: THREE.Object3D, r: number, x: number, y: number, z: number, mat: THREE.Material, acc: THREE.Material, onion = true) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, a = t * Math.PI / 2;
    const bulge = onion ? 1 + 0.18 * Math.sin(t * Math.PI) : 1;
    pts.push(new THREE.Vector2(Math.cos(a) * r * bulge * (onion && t > 0.7 ? 1 - (t - 0.7) * 1.2 : 1), Math.sin(a) * r * (onion ? 1.25 : 0.95)));
  }
  pts[pts.length - 1].x = 0.001;
  const m = mk(p, new THREE.LatheGeometry(pts, 28), mat, x, y, z);
  const top = y + r * (onion ? 1.25 : 0.95);
  cyl(p, 0.04 * r + 0.02, 0.06 * r + 0.02, r * 0.5, x, top - 0.02, z, acc, 8);
  mk(p, new THREE.SphereGeometry(0.1 * r + 0.04, 10, 8), acc, x, top + r * 0.5, z);
  return m;
}

/** A row of crenellations (merlons) along a straight wall, as one instanced mesh. */
function merlons(p: THREE.Object3D, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, y: number, step = 0.9, size = 0.45) {
  const len = a.distanceTo(b), n = Math.max(1, Math.floor(len / step));
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(size, size * 1.1, size), mat, n);
  const dir = b.clone().sub(a).normalize(), d = new THREE.Object3D(); d.rotation.y = Math.atan2(-dir.z, dir.x);
  for (let i = 0; i < n; i++) { const q = a.clone().addScaledVector(dir, (i + 0.5) * (len / n)); d.position.set(q.x, y + size * 0.55, q.z); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }
  im.castShadow = true; im.receiveShadow = true; p.add(im);
}

/** A flat arched opening (dark) to suggest an iwan/doorway on a face. */
function archShape(w: number, h: number) {
  const s = new THREE.Shape(), r = w / 2;
  s.moveTo(-r, 0); s.lineTo(-r, h - r); s.absarc(0, h - r, r, Math.PI, 0, true); s.lineTo(r, 0); s.lineTo(-r, 0);
  return s;
}
function arch(p: THREE.Object3D, w: number, h: number, x: number, y: number, z: number, rotY: number, mat: THREE.Material, depth = 0.12) {
  const m = mk(p, new THREE.ExtrudeGeometry(archShape(w, h), { depth, bevelEnabled: false }), mat, x, y, z, false); m.rotation.y = rotY; return m;
}

function chhatri(p: THREE.Object3D, x: number, y: number, z: number, m: Mats, s = 1) {
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(p, 0.07 * s, 0.07 * s, 0.9 * s, x + dx * 0.32 * s, y, z + dz * 0.32 * s, m.stone, 8);
  box(p, 0.85 * s, 0.1 * s, 0.85 * s, x, y + 0.9 * s, z, m.stone2);
  dome(p, 0.34 * s, x, y + 1.0 * s, z, m.roof, m.accent);
}

/* ---------- one builder per site type; each keeps the main structure inside ~6.4 units of the centre ---------- */
function monument(g: THREE.Group, m: Mats, r: () => number) {
  box(g, 10.4, 0.7, 10.4, 0, 0, 0, m.stone2); box(g, 9.2, 0.4, 9.2, 0, 0.7, 0, m.stone);
  const body = cyl(g, 2.9, 2.9, 3.3, 0, 1.1, 0, m.stone, 8); body.rotation.y = Math.PI / 8;
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, ax = Math.sin(a) * 2.7, az = Math.cos(a) * 2.7; arch(g, 1.5, 2.5, ax, 1.2, az, a, m.dark, 0.3); arch(g, 0.8, 1.2, ax, 2.7, az, a, m.dark, 0.32); }
  const rd = 1.75 + r() * 0.3;
  cyl(g, rd * 0.95, rd, 1.0, 0, 4.4, 0, m.stone, 24); dome(g, rd, 0, 5.4, 0, m.roof, m.accent);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { chhatri(g, dx * 2.35, 4.4, dz * 2.35, m, 1.0); }
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = dx * 4.7, z = dz * 4.7;
    cyl(g, 0.34, 0.46, 5.6, x, 1.1, z, m.stone, 14);
    for (const y of [2.5, 4.0]) cyl(g, 0.58, 0.58, 0.14, x, y, z, m.stone2, 14);
    cyl(g, 0.46, 0.46, 0.35, x, 6.7, z, m.stone, 14); chhatri(g, x, 7.0, z, m, 0.9);
  }
}

function fort(g: THREE.Group, m: Mats, r: () => number) {
  const H = 12, T = 0.9, h = 2.8, pts = [new THREE.Vector3(-H, 0, -H), new THREE.Vector3(H, 0, -H), new THREE.Vector3(H, 0, H), new THREE.Vector3(-H, 0, H)];
  const gapFront = 2.0, gapSide = 1.3;
  // back wall and left wall solid; front wall and right wall have openings (gate at z=+H, side exit at z=+6)
  box(g, 2 * H, h, T, 0, 0, -H, m.stone); box(g, T, h, 2 * H, -H, 0, 0, m.stone);
  const fw = H - gapFront; box(g, fw, h, T, -(gapFront + fw / 2), 0, H, m.stone); box(g, fw, h, T, gapFront + fw / 2, 0, H, m.stone);
  const sz1 = EXIT_IN.z - gapSide, sz2 = EXIT_IN.z + gapSide;
  box(g, T, h, sz1 + H, H, 0, (sz1 - H) / 2, m.stone); box(g, T, h, H - sz2, H, 0, (H + sz2) / 2, m.stone);
  merlons(g, m.stone2, new THREE.Vector3(-H, 0, -H), new THREE.Vector3(H, 0, -H), h); merlons(g, m.stone2, new THREE.Vector3(-H, 0, -H), new THREE.Vector3(-H, 0, H), h);
  merlons(g, m.stone2, new THREE.Vector3(-H, 0, H), new THREE.Vector3(-gapFront, 0, H), h); merlons(g, m.stone2, new THREE.Vector3(gapFront, 0, H), new THREE.Vector3(H, 0, H), h);
  merlons(g, m.stone2, new THREE.Vector3(H, 0, -H), new THREE.Vector3(H, 0, sz1), h); merlons(g, m.stone2, new THREE.Vector3(H, 0, sz2), new THREE.Vector3(H, 0, H), h);
  for (const p of pts) { cyl(g, 1.5, 1.7, 3.8, p.x, 0, p.z, m.stone2, 16); cyl(g, 1.7, 1.5, 0.35, p.x, 3.8, p.z, m.stone, 16); dome(g, 0.9, p.x, 4.15, p.z, m.roof, m.accent, false); }
  const mids = 1 + Math.floor(r() * 2); // extra round bastions along the back wall and left wall
  for (let i = 1; i <= mids; i++) { const t = -H + (2 * H * i) / (mids + 1); cyl(g, 0.9, 1.0, 3.3, t, 0, -H, m.stone2, 12); cyl(g, 0.9, 0.9, 3.3, -H, 0, t, m.stone2, 12).position.y = 1.65; }
  // gatehouse towers and lintel
  for (const sx of [-1, 1]) { box(g, 1.6, 4.6, 1.8, sx * (gapFront + 0.8), 0, H, m.stone2); merlons(g, m.stone, new THREE.Vector3(sx * (gapFront + 1.6), 0, H), new THREE.Vector3(sx * (gapFront), 0, H), 4.6, 0.55, 0.3); }
  box(g, 2 * gapFront + 3.2, 1.1, 1.8, 0, 3.5, H, m.stone2); arch(g, 2 * gapFront - 0.4, 3.5, 0, 0, H + 0.95, 0, m.dark, 0.05);
  chhatri(g, 0, 4.6, H, m, 1.1);
  // inner keep / palace
  box(g, 8.4, 0.5, 6.4, 0, 0, 0, m.stone2); box(g, 7.4, 3.2, 5.4, 0, 0.5, 0, m.stone);
  for (let i = -3; i <= 3; i++) arch(g, 0.7, 1.6, i * 1.0, 0.7, 2.72, 0, m.dark, 0.05);
  merlons(g, m.stone2, new THREE.Vector3(-3.7, 0, 2.7), new THREE.Vector3(3.7, 0, 2.7), 3.7, 0.8, 0.4);
  dome(g, 1.7, 0, 3.7, 0, m.roof, m.accent);
  for (const sx of [-1, 1]) chhatri(g, sx * 3.0, 3.7, 1.7, m, 1.1);
}

function museum(g: THREE.Group, m: Mats, r: () => number) {
  for (let i = 0; i < 3; i++) box(g, 11 - i * 0.6, 0.22, 7.6 - i * 0.5, 0, i * 0.22, 0.4, i % 2 ? m.stone : m.stone2);
  box(g, 7.2, 3.6, 5.2, 0, 0.66, -0.4, m.stone);
  for (const sx of [-1, 1]) { box(g, 2.0, 2.6, 4.4, sx * 4.6, 0.66, -0.2, m.stone2); box(g, 2.2, 0.25, 4.6, sx * 4.6, 3.26, -0.2, m.roof); for (let k = 0; k < 2; k++) arch(g, 0.6, 1.4, sx * 4.6 + (k - 0.5) * 0.9, 1.2, 2.04, 0, m.dark, 0.05); }
  const cols = 6 + 2 * Math.floor(r() * 3), span = 6.4;
  for (let i = 0; i < cols; i++) { const x = -span / 2 + (span * i) / (cols - 1); cyl(g, 0.2, 0.24, 3.2, x, 0.66, 2.6, m.stone, 14); cyl(g, 0.3, 0.3, 0.14, x, 3.86, 2.6, m.stone2, 10); }
  box(g, 7.0, 0.35, 1.6, 0, 3.86, 2.2, m.stone2);
  const ped = new THREE.Shape(); ped.moveTo(-3.6, 0); ped.lineTo(3.6, 0); ped.lineTo(0, 1.2); ped.lineTo(-3.6, 0);
  mk(g, new THREE.ExtrudeGeometry(ped, { depth: 0.5, bevelEnabled: false }), m.stone, 0, 4.2, 1.8);
  arch(g, 1.8, 2.4, 0, 0.66, 2.0, 0, m.dark, 0.05);
  cyl(g, 2.0, 2.2, 1.4, 0, 4.26, -0.4, m.stone, 24); dome(g, 1.9, 0, 5.66, -0.4, m.roof, m.accent, false);
}

function temple(g: THREE.Group, m: Mats, r: () => number) {
  const H = 12, h = 1.5;
  box(g, 2 * H, h, 0.7, 0, 0, -H, m.stone2); box(g, 0.7, h, 2 * H, -H, 0, 0, m.stone2);
  box(g, H - 2, h, 0.7, -(H + 2) / 2, 0, H, m.stone2); box(g, H - 2, h, 0.7, (H + 2) / 2, 0, H, m.stone2);
  const sz1 = EXIT_IN.z - 1.3, sz2 = EXIT_IN.z + 1.3; box(g, 0.7, h, sz1 + H, H, 0, (sz1 - H) / 2, m.stone2); box(g, 0.7, h, H - sz2, H, 0, (H + sz2) / 2, m.stone2);
  const tiers = (cx: number, cz: number, baseW: number, n: number, th: number, color: THREE.Material, top: THREE.Material) => {
    for (let i = 0; i < n; i++) { const w = baseW * (1 - i / (n + 1.5)); box(g, w, th, w * 0.78, cx, i * th, cz, i % 2 ? color : m.stone); box(g, w * 1.04, th * 0.18, w * 0.8, cx, i * th + th * 0.82, cz, m.stone2); }
    const topY = n * th; cyl(g, baseW * 0.12, baseW * 0.14, th * 0.7, cx, topY, cz, top, 12); dome(g, baseW * 0.12, cx, topY + th * 0.7, cz, m.accent, m.accent, false);
  };
  const gp = 6 + Math.floor(r() * 3); // gateway gopuram on the front wall
  box(g, 6.2, 2.0, 2.6, 0, 0, H, m.stone2); arch(g, 2.6, 2.0, 0, 0, H + 1.35, 0, m.dark, 0.05); tiers(0, H, 5.4, gp, 0.75, m.stone2, m.roof);
  const vim = 6 + Math.floor(r() * 3); // main sanctum tower
  box(g, 6.2, 1.0, 6.2, 0, 0, 0, m.stone2); tiers(0, 0, 5.2, vim, 0.85, m.stone2, m.roof);
  arch(g, 1.3, 1.9, 0, 1.0, 3.1, 0, m.dark, 0.05);
  box(g, 5.4, 0.35, 3.6, 0, 1.9, 5.6, m.stone2); // mandapa roof on pillars
  for (let i = 0; i < 4; i++) for (const z of [4.2, 7.0]) cyl(g, 0.14, 0.16, 1.9, -2.2 + i * 1.47, 0, z, m.stone, 8);
  for (const [sx, sz] of [[-1, -1], [1, -1]]) { box(g, 1.6, 1.2, 1.6, sx * 8.6, 0, sz * 8.6, m.stone2); tiers(sx * 8.6, sz * 8.6, 1.4, 3, 0.5, m.stone2, m.roof); }
}

function archaeological(g: THREE.Group, m: Mats, r: () => number) {
  box(g, 11, 0.4, 11, 0, 0, 0, m.stone2);
  cyl(g, 3.1, 3.3, 0.9, 0, 0.4, 0, m.stone, 32); dome(g, 2.9, 0, 1.3, 0, m.stone, m.accent, false);
  box(g, 1.1, 0.7, 1.1, 0, 4.1, 0, m.stone2); for (let i = 0; i < 3; i++) cyl(g, 0.9 - i * 0.22, 0.9 - i * 0.22, 0.1, 0, 4.8 + i * 0.35, 0, m.stone2, 16);
  const n = 14; // broken pillars at varied heights around a rectangular terrace
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU, rr = 5.4 + r() * 0.5, hh = 0.8 + r() * 2.6; cyl(g, 0.22, 0.26, hh, Math.cos(a) * rr, 0.4, Math.sin(a) * rr, m.stone, 10); if (r() > 0.55) box(g, 0.7, 0.35, 0.7, Math.cos(a) * rr, 0.4 + hh, Math.sin(a) * rr, m.stone2); }
  for (let i = 0; i < 4; i++) { const w = 1.6 + r() * 2.2; box(g, w, 0.3 + r() * 0.5, 0.45, -5 + r() * 10, 0.4, -6 + (r() - 0.5) * 1.2, m.stone2); }
  for (const sx of [-1, 1]) cyl(g, 0.28, 0.32, 3.2, sx * 1.6, 0.4, 6.1, m.stone, 10); box(g, 4.2, 0.4, 0.6, 0, 3.6, 6.1, m.stone2); // toran gateway
}

function palace(g: THREE.Group, m: Mats, r: () => number) {
  box(g, 10.6, 0.5, 8.6, 0, 0, 0, m.stone2); box(g, 9.4, 4.0, 6.2, 0, 0.5, -0.4, m.stone);
  const n = 5 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) { const x = -3.8 + (7.6 * i) / (n - 1); arch(g, 0.7, 1.3, x, 0.9, 2.72, 0, m.dark, 0.05); arch(g, 0.7, 1.3, x, 2.7, 2.72, 0, m.dark, 0.05); }
  box(g, 10.0, 0.3, 6.6, 0, 4.5, -0.4, m.stone2); merlons(g, m.stone2, new THREE.Vector3(-5, 0, 2.9), new THREE.Vector3(5, 0, 2.9), 4.8, 0.7, 0.35);
  box(g, 3.0, 3.0, 1.2, 0, 4.8, 1.2, m.stone); arch(g, 1.4, 2.2, 0, 4.8, 1.85, 0, m.dark, 0.05); dome(g, 1.5, 0, 7.8, 1.2, m.roof, m.accent);
  for (const sx of [-1, 1]) { cyl(g, 1.0, 1.1, 5.4, sx * 5.0, 0.5, 2.0, m.stone2, 12); cyl(g, 1.2, 1.0, 0.3, sx * 5.0, 5.9, 2.0, m.stone, 12); dome(g, 0.8, sx * 5.0, 6.2, 2.0, m.roof, m.accent); chhatri(g, sx * 3.0, 4.8, -2.4, m, 1.0); chhatri(g, sx * 1.4, 4.8, 0.4, m, 0.8); }
  const water = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 4.6), new THREE.MeshStandardMaterial({ color: 0x5fa3c4, roughness: 0.2, metalness: 0.1 })); water.position.set(0, 0.04, 6.1); g.add(water);
}

const BUILDERS: Record<TwinType, (g: THREE.Group, m: Mats, r: () => number) => void> = { monument, fort, museum, temple, archaeological, palace };

/* ---------- crowd ---------- */
type Av = { x: number; z: number; stage: number; ang: number; dir: number; remain: number; final: boolean; tx: number; tz: number; wp: number; v: number; ph: number; delay: number; jx: number; jz: number };
const ZONES: ZoneId[] = ["gate", "court", "main", "exit"];
// Rough share of visitors in each zone when things flow normally; the live percentage is scaled by (actual share / expected share).
const EXPECTED: Record<ZoneId, number> = { gate: 0.12, court: 0.2, main: 0.5, exit: 0.18 };

export async function createTwin(host: HTMLElement, opts: { seed: string; type: TwinType; reducedMotion: boolean; small: boolean; model?: { url: string; rotateY?: number } | null; onModel?: (s: "loading" | "loaded" | "failed") => void; photoUrl?: string | null; onPhoto?: (ok: boolean) => void; onSupport?: (ok: boolean) => void }): Promise<TwinHandle> {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !opts.small, alpha: false, powerPreference: "high-performance" });
  } catch {
    opts.onSupport?.(false);
    return { setPhoto() {}, setCrowd() {}, setAutoRotate() {}, resetView() {}, dispose() {}, supported: false };
  }
  let disposed = false;
  const MAX = opts.small ? 160 : 320;
  const rand = rng(hash(opts.seed));
  const pal = PAL[opts.type] || PAL.monument;
  const tint = (c: number) => { const col = new THREE.Color(c); const hsl = { h: 0, s: 0, l: 0 }; col.getHSL(hsl); col.setHSL((hsl.h + (rand() - 0.5) * 0.03 + 1) % 1, hsl.s, Math.min(0.92, Math.max(0.2, hsl.l + (rand() - 0.5) * 0.06))); return col; };
  const std = (c: THREE.Color | number, rough = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.02 });
  const mats: Mats = { stone: std(tint(pal.stone)), stone2: std(tint(pal.stone2)), dark: std(pal.dark, 1), roof: std(tint(pal.roof), 0.6), accent: std(pal.accent, 0.35) };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x12372a); scene.fog = new THREE.Fog(0x12372a, 48, 95);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 200);
  const home = new THREE.Vector3(10, 15, 34), target = new THREE.Vector3(0, 4, 4);
  camera.position.copy(home);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.small ? 1.5 : 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:pan-y;outline:none";
  renderer.domElement.setAttribute("tabindex", "0");
  host.prepend(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xfff3dc, 0x2a4a3a, 0.95));
  const sun = new THREE.DirectionalLight(0xffeccc, 2.1); sun.position.set(14, 24, 16); sun.castShadow = true;
  sun.shadow.mapSize.set(opts.small ? 1024 : 2048, opts.small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 }); sun.shadow.bias = -0.0004; scene.add(sun);

  const ground = new THREE.Mesh(new THREE.CylinderGeometry(GROUND_R, GROUND_R + 0.6, 0.5, 64), std(tint(pal.ground), 1)); ground.position.y = -0.25; ground.receiveShadow = true; scene.add(ground);
  const lawn = new THREE.Mesh(new THREE.RingGeometry(GROUND_R - 3.2, GROUND_R - 0.2, 64), new THREE.MeshStandardMaterial({ color: 0x5c8a64, roughness: 1, side: THREE.DoubleSide })); lawn.rotation.x = -Math.PI / 2; lawn.position.y = 0.01; scene.add(lawn);
  // approach path from the gate
  const path = new THREE.Mesh(new THREE.PlaneGeometry(3, 8), new THREE.MeshStandardMaterial({ color: 0xe7dcc0, roughness: 1 })); path.rotation.x = -Math.PI / 2; path.position.set(0, 0.015, 12.2); path.receiveShadow = true; scene.add(path);

  const site = new THREE.Group(); scene.add(site);
  const buildProcedural = () => (BUILDERS[opts.type] || monument)(site, mats, rand);
  if (opts.model) {
    // Real photogrammetry model: centred, scaled to the same footprint as the procedural ones and set on the ground.
    opts.onModel?.("loading");
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    loader.loadAsync(opts.model.url).then((gltf) => {
      if (disposed) return;
      const obj = gltf.scene, box = new THREE.Box3().setFromObject(obj), sz = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
      const k = 11 / Math.max(sz.x, sz.z, 0.0001), holder = new THREE.Group();
      obj.position.set(-ctr.x, -box.min.y, -ctr.z); holder.add(obj); holder.scale.setScalar(k); holder.rotation.y = THREE.MathUtils.degToRad(opts.model!.rotateY || 0);
      obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; const mt = m.material as THREE.MeshStandardMaterial; if (mt && "metalness" in mt) { mt.metalness = Math.min(mt.metalness, 0.1); } } });
      site.add(holder); opts.onModel?.("loaded"); kick();
    }).catch(() => { if (disposed) return; buildProcedural(); opts.onModel?.("failed"); kick(); });
  } else buildProcedural();

  /* real photo wall: the site's own licensed photograph on a curved panel behind the model */
  let wall: THREE.Mesh | null = null;
  if (opts.photoUrl) {
    const tl = new THREE.TextureLoader(); tl.setCrossOrigin("anonymous");
    tl.load(opts.photoUrl, (tex) => {
      if (disposed) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const img = tex.image as { width: number; height: number }, aspect = img.width / img.height, rad = 24, span = 1.5, arc = rad * span;
      const h = Math.min(18, Math.max(8, arc / aspect));
      const geo = new THREE.CylinderGeometry(rad, rad, h, 48, 1, true, Math.PI - span / 2, span);
      tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1; // inside-facing surface would otherwise mirror the photo
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, toneMapped: false });
      wall = new THREE.Mesh(geo, mat); wall.position.y = h / 2 + 1.5; scene.add(wall); opts.onPhoto?.(true); kick();
    }, undefined, () => opts.onPhoto?.(false));
  }

  /* zone markers: flat translucent discs/ring tinted by load */
  const zoneMats: Record<ZoneId, THREE.MeshBasicMaterial> = {} as any;
  const mkZone = (id: ZoneId, geo: THREE.BufferGeometry, x: number, z: number) => {
    const mat = new THREE.MeshBasicMaterial({ color: ZONE_COLOR.Safe, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.05, z); mesh.renderOrder = 2; scene.add(mesh); zoneMats[id] = mat;
  };
  mkZone("gate", new THREE.CircleGeometry(2.3, 40), GATE.x, GATE.z); mkZone("court", new THREE.CircleGeometry(1.9, 40), COURT.x, COURT.z);
  mkZone("main", new THREE.RingGeometry(R - 0.8, R + 0.8, 80), 0, 0); mkZone("exit", new THREE.CircleGeometry(2.1, 40), EXIT_OUT.x, EXIT_OUT.z);

  /* HTML labels that follow their 3D anchor points */
  const anchors: Record<ZoneId, THREE.Vector3> = { gate: new THREE.Vector3(0, 1.3, 15), court: new THREE.Vector3(0, 1.3, 10.9), main: new THREE.Vector3(-R - 0.6, 1.6, -1), exit: new THREE.Vector3(EXIT_OUT.x, 1.3, EXIT_OUT.z) };
  const labels: Record<ZoneId, HTMLDivElement> = {} as any;
  const layer = document.createElement("div"); layer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden"; layer.setAttribute("aria-hidden", "true"); host.appendChild(layer);
  for (const id of ZONES) {
    const d = document.createElement("div");
    d.style.cssText = "position:absolute;left:0;top:0;transform:translate(-50%,-100%);white-space:nowrap;border-radius:6px;padding:2px 7px;font:600 11px/1.3 system-ui,sans-serif;color:#fff;background:rgba(15,39,29,.82);border:1px solid rgba(255,255,255,.18)";
    layer.appendChild(d); labels[id] = d;
  }

  /* avatars: two instanced meshes (body + head) */
  const bodyGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.62, 8), headGeo = new THREE.SphereGeometry(0.15, 10, 8);
  const body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAX);
  const head = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), MAX);
  const cloth = [0xf59e0b, 0xf8fafc, 0x0d9488, 0x9f1239, 0x2563eb, 0xdb2777, 0x16a34a, 0x64748b, 0xea580c], skin = [0xf1c9a5, 0xc68642, 0x8d5524, 0xe0ac69];
  const tmpC = new THREE.Color();
  for (let i = 0; i < MAX; i++) { body.setColorAt(i, tmpC.set(cloth[i % cloth.length])); head.setColorAt(i, tmpC.set(skin[(i * 7) % skin.length])); }
  body.castShadow = true; scene.add(body, head);

  const av: Av[] = Array.from({ length: MAX }, () => ({ x: 0, z: 0, stage: 6, ang: 0, dir: 1, remain: 0, final: false, tx: 0, tz: 0, wp: 0, v: 1, ph: Math.random() * 6.28, delay: 0, jx: 0, jz: 0 }));
  const at = (a: Av, x: number, z: number) => { a.x = x; a.z = z; };
  const spawnGate = (a: Av, delay = 0) => { at(a, GATE.x + (Math.random() - 0.5) * 2.4, GATE.z + 2 + Math.random() * 1.5); a.stage = 0; a.delay = delay; a.v = 1.0 + Math.random() * 0.5; a.jx = (Math.random() - 0.5) * 1.8; a.jz = (Math.random() - 0.5) * 1.2; a.final = false; };
  const spawnRandom = (a: Av) => {
    a.v = 1.0 + Math.random() * 0.5; a.jx = (Math.random() - 0.5) * 1.8; a.jz = (Math.random() - 0.5) * 1.2; a.delay = 0; a.final = false;
    const u = Math.random();
    if (u < 0.1) { a.stage = 0; at(a, GATE.x + (Math.random() - 0.5) * 2, GATE.z + Math.random() * 2); }
    else if (u < 0.28) { a.stage = 1; at(a, COURT.x + (Math.random() - 0.5) * 3, COURT.z + (Math.random() - 0.5) * 1.6); }
    else if (u < 0.84) { a.stage = 2; a.ang = Math.random() * TAU; a.dir = Math.random() < 0.5 ? 1 : -1; a.remain = 0.4 + Math.random() * 5; a.final = false; const rr = R + (Math.random() - 0.5) * 1.1; at(a, Math.cos(a.ang) * rr, Math.sin(a.ang) * rr); }
    else { a.stage = 3; a.wp = 0; at(a, EXIT_IN.x + Math.random() * 3.4, EXIT_IN.z + (Math.random() - 0.5) * 1.6); }
  };

  const crowd: CrowdInput = { avatars: 0, pct: 0, speed: opts.reducedMotion ? 0 : 1, emergency: false };
  let active = 0, wasEmergency = false;
  const dummy = new THREE.Object3D();
  const zoneCount: Record<ZoneId, number> = { gate: 0, court: 0, main: 0, exit: 0 };
  const shown: Record<ZoneId, string> = { gate: "", court: "", main: "", exit: "" };
  const dist = (x: number, z: number, p: THREE.Vector3) => Math.hypot(x - p.x, z - p.z);
  const zoneOf = (a: Av): ZoneId | null => {
    if (a.stage === 6) return null;
    if (a.stage === 0) return dist(a.x, a.z, GATE) < 4 ? "gate" : "court";
    if (a.stage === 1) return "court";
    if (a.stage === 2) return "main";
    return dist(a.x, a.z, EXIT_OUT) < 5 ? "exit" : "main";
  };

  function step(a: Av, dt: number) {
    if (a.delay > 0) { a.delay -= dt; return; }
    const em = crowd.emergency, v = a.v * (em ? 2.3 : 1) * dt;
    const goto = (tx: number, tz: number) => { const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz); if (d < 0.35) return true; a.x += (dx / d) * Math.min(v, d); a.z += (dz / d) * Math.min(v, d); return false; };
    switch (a.stage) {
      case 0: if (em) { if (goto(GATE.x + a.jx, GATE.z + 3)) a.stage = 6; break; } if (goto(COURT.x + a.jx, COURT.z + a.jz)) a.stage = 1; break;
      case 1: if (em) { if (goto(GATE.x + a.jx, GATE.z + 3)) a.stage = 6; break; } if (goto(Math.cos(THETA_IN) * R + a.jx * 0.3, Math.sin(THETA_IN) * R + 0.4)) { a.stage = 2; a.ang = THETA_IN; a.dir = Math.random() < 0.55 ? 1 : -1; a.remain = 0.5 + Math.random() * 5.6; a.final = false; } break;
      case 2: {
        const rr = R + a.jz * 0.4, w = (v / R) * (a.final ? 1 : 0.85); // angular step
        if (em && !a.final) { let d = wrap(THETA_OUT - a.ang); a.dir = d < Math.PI ? 1 : -1; a.remain = d < Math.PI ? d : TAU - d; a.final = true; }
        a.ang += a.dir * w; a.remain -= w; a.x = Math.cos(a.ang) * rr; a.z = Math.sin(a.ang) * rr;
        if (a.remain <= 0) { if (a.final) { a.stage = 3; a.wp = 0; } else { const d = a.dir > 0 ? wrap(THETA_OUT - a.ang) : wrap(a.ang - THETA_OUT); a.remain = d; a.final = true; } }
        break;
      }
      case 3: if (a.wp === 0) { if (goto(EXIT_IN.x, EXIT_IN.z + a.jz * 0.4)) a.wp = 1; } else if (goto(EXIT_OUT.x + Math.abs(a.jx) * 0.5, EXIT_OUT.z + a.jz)) { a.stage = 6; } break;
      default: break;
    }
  }

  function applyCount(n: number) {
    n = Math.max(0, Math.min(MAX, Math.round(n)));
    for (let i = active; i < n; i++) { if (Math.random() < 0.5 || active === 0) spawnRandom(av[i]); else spawnGate(av[i], Math.random() * 3); }
    for (let i = n; i < active; i++) av[i].stage = 6;
    active = n; body.count = n; head.count = n;
  }

  let last = performance.now(), raf = 0, visible = true, labelT = 0;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target); controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
  controls.minDistance = 14; controls.maxDistance = 55; controls.maxPolarAngle = Math.PI * 0.47; controls.minPolarAngle = 0.25;
  controls.autoRotate = false; controls.autoRotateSpeed = 0.7; controls.update();

  const v3 = new THREE.Vector3();
  function size() { const w = host.clientWidth || 600, h = host.clientHeight || 400; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1.1 ? 52 : 38; camera.updateProjectionMatrix(); }
  const ro = new ResizeObserver(size); ro.observe(host); size();

  function frame(now: number) {
    raf = 0; if (disposed) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const sp = crowd.speed;
    if (crowd.emergency !== wasEmergency) { // leaving emergency: bring everyone back in through the gate, staggered
      if (!crowd.emergency) for (let i = 0; i < active; i++) if (av[i].stage === 6) spawnGate(av[i], Math.random() * 10);
      wasEmergency = crowd.emergency;
    }
    if (sp > 0) {
      const t = dt * sp, sub = Math.max(1, Math.ceil(t / 0.05));
      for (let s = 0; s < sub; s++) for (let i = 0; i < active; i++) step(av[i], t / sub);
      if (!crowd.emergency) for (let i = 0; i < active; i++) if (av[i].stage === 6) spawnGate(av[i], Math.random() * 4); // a visitor who left is replaced by a new arrival, so the headcount stays steady
    }
    const time = now / 1000;
    zoneCount.gate = zoneCount.court = zoneCount.main = zoneCount.exit = 0;
    let shownN = 0;
    for (let i = 0; i < active; i++) {
      const a = av[i];
      if (a.stage === 6 || a.delay > 0) { dummy.position.set(0, -50, 0); dummy.scale.setScalar(0.0001); dummy.updateMatrix(); body.setMatrixAt(i, dummy.matrix); head.setMatrixAt(i, dummy.matrix); continue; }
      const z = zoneOf(a); if (z) { zoneCount[z]++; shownN++; }
      const bob = sp > 0 ? Math.abs(Math.sin(time * 7 * sp + a.ph)) * 0.04 : 0;
      dummy.scale.setScalar(1); dummy.position.set(a.x, 0.31 + bob, a.z); dummy.updateMatrix(); body.setMatrixAt(i, dummy.matrix);
      dummy.position.set(a.x, 0.79 + bob, a.z); dummy.updateMatrix(); head.setMatrixAt(i, dummy.matrix);
    }
    body.instanceMatrix.needsUpdate = true; head.instanceMatrix.needsUpdate = true;

    labelT += dt;
    if (labelT > 0.4) { // zone load = overall % scaled by how crowded each zone is relative to its normal share
      labelT = 0;
      for (const id of ZONES) {
        const share = shownN ? zoneCount[id] / shownN : 0;
        // Keep the simulated split believable: normally within 0.5x to 1.5x of the overall level; an evacuation may pile up at the exits.
        const ratio = Math.max(crowd.emergency ? 0.05 : 0.5, Math.min(crowd.emergency ? 2.4 : 1.5, share / EXPECTED[id]));
        const pct = shownN === 0 ? 0 : Math.max(0, Math.min(150, Math.round(crowd.pct * ratio)));
        const st = zoneStatus(pct); zoneMats[id].color.setHex(ZONE_COLOR[st]);
        const txt = shownN === 0 ? ZONE_LABEL[id] : `${ZONE_LABEL[id]} · ${pct}% ${st}`;
        if (shown[id] !== txt) { labels[id].textContent = txt; shown[id] = txt; }
      }
      host.dispatchEvent(new CustomEvent("twin-zones", { detail: ZONES.map((id) => ({ id, text: shown[id] })) }));
    }
    controls.update();
    for (const id of ZONES) { v3.copy(anchors[id]).project(camera); const el = labels[id], w = host.clientWidth, h = host.clientHeight; const on = v3.z < 1 && v3.z > -1; el.style.display = on ? "block" : "none"; el.style.transform = `translate(${(v3.x * 0.5 + 0.5) * w}px,${(-v3.y * 0.5 + 0.5) * h}px) translate(-50%,-100%)`; }
    renderer.render(scene, camera);
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && !disposed) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const io = new IntersectionObserver((e) => { visible = e[0]?.isIntersecting ?? true; if (visible) kick(); }, { threshold: 0.05 }); io.observe(host);
  const vis = () => { if (!document.hidden) kick(); }; document.addEventListener("visibilitychange", vis);
  const onCtxLost = (e: Event) => { e.preventDefault(); opts.onSupport?.(false); }; renderer.domElement.addEventListener("webglcontextlost", onCtxLost);
  // Keyboard: arrow keys orbit, +/- zoom (the canvas is focusable).
  const onKey = (e: KeyboardEvent) => {
    const k = e.key; if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_"].includes(k)) return; e.preventDefault();
    const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
    if (k === "ArrowLeft") sph.theta -= 0.12; if (k === "ArrowRight") sph.theta += 0.12; if (k === "ArrowUp") sph.phi = Math.max(0.3, sph.phi - 0.08); if (k === "ArrowDown") sph.phi = Math.min(Math.PI * 0.47, sph.phi + 0.08);
    if (k === "+" || k === "=") sph.radius = Math.max(controls.minDistance, sph.radius * 0.9); if (k === "-" || k === "_") sph.radius = Math.min(controls.maxDistance, sph.radius * 1.1);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph)); kick();
  };
  renderer.domElement.addEventListener("keydown", onKey);
  controls.addEventListener("change", kick);
  kick();
  opts.onSupport?.(true);

  return {
    supported: true,
    setPhoto(on) { if (wall) wall.visible = on; kick(); },
    setCrowd(c) { crowd.pct = c.pct; crowd.speed = c.speed; if (c.emergency !== crowd.emergency) crowd.emergency = c.emergency; if (c.avatars !== active) applyCount(c.avatars); kick(); },
    setAutoRotate(on) { controls.autoRotate = on && !opts.reducedMotion; kick(); },
    resetView() { camera.position.copy(home); controls.target.copy(target); controls.update(); kick(); },
    dispose() {
      disposed = true; if (raf) cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", vis);
      renderer.domElement.removeEventListener("keydown", onKey); renderer.domElement.removeEventListener("webglcontextlost", onCtxLost); controls.dispose();
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (mt) (Array.isArray(mt) ? mt : [mt]).forEach((x) => x.dispose()); });
      body.dispose(); head.dispose(); renderer.dispose(); renderer.forceContextLoss();
      renderer.domElement.remove(); layer.remove();
    },
  };
}
