// The four places of the 100 m sprint, built in code: School Track → City Stadium → National Stadium → The Final.
// World: the runners run along +x. The start line is x = 0, the finish line x = FINISH (100 m × VIS). Eight lanes across z
// (LANE wide, centred on z = 0); the runners use lanes 2–5. The stands are on the far side (−z), the camera on the near side (+z).
import * as THREE from '../olympics/common/lib/three.module.min.js';
import { toon, add } from '../olympics/common/mat.js';
import { makeCrowd, standGeometry } from '../olympics/common/crowd.js';

export const VIS = 2.2;                // world units per race metre
export const FINISH = 100 * VIS;
export const LANE = 1.5;
export const laneZ = (i) => (i - 3.5) * LANE;   // lane 0..7
const TRACK_W = 8 * LANE + 1.2;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const tex = (cv, rep) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; };
const fontLoaded = (fn) => { if (document.fonts && document.fonts.load) document.fonts.load('60px "Lilita One"').then(fn).catch(() => {}); };

export const STAGES = [
  { id: 'school', name: 'School Track', sub: 'Sports day at Foxino School', icon: '🏫', pace: 2.35,
    sky: { zen: 0x2d6fd8, mid: 0x7fb6f2, hor: 0xdff1ff, sun: [-0.4, 0.5, -0.75], sunK: 0.35, clouds: 0.6 }, fog: 0xcfe6fa,
    light: { hemi: [0xe6f2ff, 0x5a8a45, 1.3], key: [0xfff3e0, 2.4], exp: 1.05 },
    track: 0xc65a3e, grass: 0x5fbf4a, crowd: 0.25, lights: false },
  { id: 'city', name: 'City Stadium', sub: 'The city championship', icon: '🏙️', pace: 2.5,
    sky: { zen: 0x3a4fb8, mid: 0xb08bd8, hor: 0xffb070, sun: [-0.2, 0.1, -0.97], sunK: 0.9, clouds: 0.5 }, fog: 0xf0b68c,
    light: { hemi: [0xffe2cc, 0x6a6a55, 1.1], key: [0xffc890, 2.3], exp: 1.05 },
    track: 0xb84a35, grass: 0x4fae46, crowd: 0.7, lights: true },
  { id: 'national', name: 'National Stadium', sub: 'The semi-final, under the lights', icon: '🏟️', pace: 2.65,
    sky: { zen: 0x070c2e, mid: 0x14205a, hor: 0x2f3f8c, sun: [0.3, 0.45, -0.8], sunK: 0.0, clouds: 0.15, stars: 1 }, fog: 0x1c2760,
    light: { hemi: [0xbcd0ff, 0x2a3a40, 1.05], key: [0xf4f6ff, 2.6], exp: 1.1 },
    track: 0x2f6fd6, grass: 0x3f9b46, crowd: 0.92, lights: true },
  { id: 'final', name: 'The Final', sub: 'The Foxino Olympics 100 m final', icon: '🏆', pace: 2.8,
    sky: { zen: 0x1a0b45, mid: 0x5b2bb0, hor: 0xff8a4a, sun: [0.0, 0.06, -1.0], sunK: 1.0, clouds: 0.35, stars: 0.5 }, fog: 0x8a4a8a,
    light: { hemi: [0xffd9f0, 0x40305a, 1.1], key: [0xffe0c0, 2.6], exp: 1.08 },
    track: 0x7a3fd0, grass: 0x46a84a, crowd: 0.97, lights: true, flame: true, fireworks: true },
];

// ---------- sky ----------
function makeSky(S) {
  const c = (n) => new THREE.Color(n);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uZen: { value: c(S.zen) }, uMid: { value: c(S.mid) }, uHor: { value: c(S.hor) }, uSun: { value: new THREE.Vector3(...S.sun).normalize() },
      uSunK: { value: S.sunK }, uCl: { value: S.clouds }, uStars: { value: S.stars || 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `varying vec3 vD; uniform vec3 uZen, uMid, uHor, uSun; uniform float uSunK, uCl, uStars, uTime;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        float h = vD.y;
        vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.25, h));
        col = mix(col, uZen, smoothstep(0.22, 0.8, h));
        col = mix(uHor * 0.85, col, smoothstep(-0.1, 0.0, h));
        float s = max(dot(vD, uSun), 0.0);
        col += vec3(1.0, 0.78, 0.5) * uSunK * (pow(s, 5.0) * 0.4 + pow(s, 200.0) * 1.2);
        float cl = sin(vD.x * 8.0 + vD.z * 3.0) * sin(vD.z * 6.0 - vD.x * 2.0 + 1.3) * 0.5 + 0.5;
        cl *= smoothstep(0.04, 0.2, h) * (1.0 - smoothstep(0.35, 0.65, h));
        col = mix(col, mix(vec3(1.0, 0.95, 0.9), uHor, 0.35), smoothstep(0.62, 0.95, cl) * 0.45 * uCl);
        if (uStars > 0.0) {
          vec2 g = vec2(atan(vD.z, vD.x) * 60.0, vD.y * 90.0);
          vec2 id = floor(g); float r = h21(id);
          float st = step(0.985, r) * smoothstep(0.5, 0.0, length(fract(g) - 0.5)) * smoothstep(0.08, 0.3, h);
          col += vec3(1.0) * st * uStars * (0.6 + 0.4 * sin(uTime * 2.0 + r * 40.0));
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

// ---------- the track: a 10 m tile (lanes, lane lines) repeated; start and finish lines on top ----------
function trackTexture(color) {
  const W = 512, H = 512, cv = canvas(W, H), g = cv.getContext('2d');
  g.fillStyle = hex(color); g.fillRect(0, 0, W, H);
  // rubber grain
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const k = (Math.random() - 0.5) * 22; d[i] += k; d[i + 1] += k; d[i + 2] += k; }
  g.putImageData(img, 0, 0);
  // lane lines (z across the canvas height: 8 lanes + margins)
  g.fillStyle = 'rgba(255,255,255,.92)';
  const zToY = (z) => ((z + TRACK_W / 2) / TRACK_W) * H;
  for (let i = 0; i <= 8; i++) { const y = zToY((i - 4) * LANE); g.fillRect(0, y - 2, W, 4); }
  return tex(cv, [1, 1]);
}
function lineTexture(kind) {
  const W = 64, H = 512, cv = canvas(W, H), g = cv.getContext('2d');
  if (kind === 'finish') {
    const n = 32, s = H / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 32, y * s, 32, s); }
  } else { g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); }
  return tex(cv);
}
function laneNumbers(color) {
  const W = 128, H = 1024, cv = canvas(W, H), g = cv.getContext('2d');
  const draw = () => {
    g.clearRect(0, 0, W, H);
    g.font = '64px "Lilita One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 8; i++) { const y = ((((i - 3.5) * LANE) + TRACK_W / 2) / TRACK_W) * H; g.save(); g.translate(W / 2, y); g.rotate(Math.PI / 2); g.fillText(String(8 - i), 0, 0); g.restore(); }
  };
  draw();
  const t = tex(cv); fontLoaded(() => { draw(); t.needsUpdate = true; });
  return t;
}

function makeTrack(st, root) {
  const len = FINISH + 120, x0 = -60;
  const tt = trackTexture(st.track); tt.repeat.set(len / (10 * VIS), 1);
  const track = add(root, new THREE.PlaneGeometry(len, TRACK_W), toon(0xffffff, { map: tt, rough: 0.9, rim: 0 }), [x0 + len / 2, 0, 0], null, [-Math.PI / 2, 0, 0]);
  track.material.polygonOffset = true;
  // the grass: a big field all around, mown stripes
  const gcv = canvas(256, 256), gg = gcv.getContext('2d');
  for (let i = 0; i < 8; i++) { gg.fillStyle = i % 2 ? hex(st.grass) : hex(new THREE.Color(st.grass).multiplyScalar(0.88).getHex()); gg.fillRect(i * 32, 0, 32, 256); }
  const gt = tex(gcv, [40, 20]);
  add(root, new THREE.PlaneGeometry(1400, 700), toon(0xffffff, { map: gt, rough: 1, rim: 0 }), [FINISH / 2, -0.02, 0], null, [-Math.PI / 2, 0, 0]);
  // a white kerb on both edges
  const kerb = toon(0xf4f4f4, { rough: 0.6, rim: 0 });
  for (const s of [1, -1]) add(root, new THREE.BoxGeometry(len, 0.08, 0.16), kerb, [x0 + len / 2, 0.04, s * (TRACK_W / 2 + 0.08)]);
  // start and finish lines, lane numbers behind the start
  add(root, new THREE.PlaneGeometry(0.12, 8 * LANE), new THREE.MeshBasicMaterial({ map: lineTexture('start'), transparent: true }), [0, 0.012, 0], null, [-Math.PI / 2, 0, 0]);
  add(root, new THREE.PlaneGeometry(0.9, 8 * LANE), toon(0xffffff, { map: lineTexture('finish'), rough: 0.8, rim: 0 }), [FINISH, 0.012, 0], null, [-Math.PI / 2, 0, 0]);
  add(root, new THREE.PlaneGeometry(1.3, TRACK_W), new THREE.MeshBasicMaterial({ map: laneNumbers(), transparent: true, depthWrite: false }), [-1.4, 0.014, 0], null, [-Math.PI / 2, 0, 0]);
  // start blocks in lanes 2–5
  const block = toon(0xd9dbe6, { rough: 0.5 }), pad = toon(0x2a2c40, { rough: 0.8, rim: 0 });
  for (let i = 2; i <= 5; i++) {
    const g = new THREE.Group(); g.position.set(-0.75, 0, laneZ(i)); root.add(g);
    add(g, new THREE.BoxGeometry(0.7, 0.04, 0.08), block, [0, 0.02, 0]);
    for (const [dx, dz] of [[-0.18, 0.09], [0.08, -0.09]]) add(g, new THREE.BoxGeometry(0.12, 0.14, 0.12), pad, [dx, 0.08, dz], null, [0, 0, 0.7]);
  }
  // distance boards every 10 m on the far edge
  const boardMat = (n) => {
    const cv = canvas(128, 96), g = cv.getContext('2d');
    const draw = () => { g.fillStyle = '#5b2bb0'; g.fillRect(0, 0, 128, 96); g.fillStyle = '#ffcd1c'; g.fillRect(0, 84, 128, 12);
      g.font = '58px "Lilita One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(n + '', 64, 44); };
    draw(); const t = tex(cv); fontLoaded(() => { draw(); t.needsUpdate = true; });
    return new THREE.MeshBasicMaterial({ map: t });
  };
  for (let m = 10; m < 100; m += 10) {
    const g = new THREE.Group(); g.position.set(m * VIS, 0, -(TRACK_W / 2 + 0.9)); root.add(g);
    add(g, new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), kerb, [0, 0.55, 0]);
    add(g, new THREE.PlaneGeometry(0.9, 0.68), boardMat(m), [0, 1.3, 0.01]);
    const nearB = new THREE.Group(); nearB.position.set(m * VIS, 0, TRACK_W / 2 + 0.9); root.add(nearB);
    add(nearB, new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), kerb, [0, 0.25, 0]);
    const p = add(nearB, new THREE.PlaneGeometry(0.6, 0.45), boardMat(m), [0, 0.7, 0]); p.rotation.y = Math.PI * 0.12;
  }
  return track;
}

// ---------- the finish gantry with a clock and the tape ----------
function makeFinish(root, st) {
  const pole = toon(0xeceef5, { rough: 0.4 }), dark = toon(0x23243a, { rough: 0.6, rim: 0 });
  const z0 = TRACK_W / 2 + 0.6;
  for (const s of [1, -1]) add(root, new THREE.BoxGeometry(0.35, 5.2, 0.35), pole, [FINISH + 0.4, 2.6, s * z0]);
  add(root, new THREE.BoxGeometry(0.5, 1.3, 2 * z0 + 0.35), dark, [FINISH + 0.4, 5.6, 0]);
  const cv = canvas(1024, 128), g = cv.getContext('2d');
  const draw = () => {
    g.fillStyle = '#5b2bb0'; g.fillRect(0, 0, 1024, 128); g.fillStyle = '#ffcd1c'; g.fillRect(0, 0, 1024, 8); g.fillRect(0, 120, 1024, 8);
    g.font = '86px "Lilita One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#ff7d22'; g.strokeText('FINISH', 512, 68); g.fillStyle = '#fff'; g.fillText('FINISH', 512, 68);
  };
  draw(); const t = tex(cv); fontLoaded(() => { draw(); t.needsUpdate = true; });
  for (const s of [1, -1]) { const p = add(root, new THREE.PlaneGeometry(2 * z0, 1.1), new THREE.MeshBasicMaterial({ map: t }), [FINISH + 0.4 - s * 0.26, 5.6, 0], null, [0, -s * Math.PI / 2, 0]); }
  // the tape, chest high, across lanes 2–5
  const tape = add(root, new THREE.PlaneGeometry(0.06, 4 * LANE + 0.6, 1, 24), new THREE.MeshBasicMaterial({ color: 0xff3b5c, side: THREE.DoubleSide }), [FINISH, 0.82, (laneZ(2) + laneZ(5)) / 2], null, [Math.PI / 2, 0, 0]);
  for (const s of [1, -1]) add(root, new THREE.CylinderGeometry(0.03, 0.03, 1, 6), pole, [FINISH, 0.5, (laneZ(2) + laneZ(5)) / 2 + s * (2 * LANE + 0.32)]);
  return { tape };
}

// ---------- stands with a crowd ----------
const glowTex = (() => { let t; return () => {
  if (t) return t;
  const S = 128, cv = canvas(S, S), g = cv.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.2, 'rgba(255,250,220,.75)'); gr.addColorStop(0.55, 'rgba(255,230,180,.18)'); gr.addColorStop(1, 'rgba(255,230,180,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S); t = tex(cv); return t;
}; })();

function banner(text, bg, fg, w = 512, h = 128) {
  const cv = canvas(w, h), g = cv.getContext('2d');
  const draw = () => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = '#ffcd1c'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    g.font = `${Math.round(h * 0.56)}px "Lilita One", "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = '#ff7d22'; g.strokeText(text, w / 2, h * 0.54); g.fillStyle = fg; g.fillText(text, w / 2, h * 0.54);
  };
  draw(); const t = tex(cv); fontLoaded(() => { draw(); t.needsUpdate = true; });
  return t;
}

function makeStands(root, st, seats, o) {
  const concrete = toon(o.concrete ?? 0x8f93a8, { rough: 0.9, rim: 0 }), seat = toon(o.seat ?? 0x4b3b8f, { rough: 0.8, rim: 0 }), dark = toon(0x2a2c40, { rough: 0.8, rim: 0 });
  function stand(cx, cz, rot, width, rows, base, density, roof = true) {
    const grp = new THREE.Group(); grp.position.set(cx, 0, cz); grp.rotation.y = rot; root.add(grp);
    grp.add(new THREE.Mesh(standGeometry(width, rows, base), [concrete, seat]));
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < rows; i++) {
      const y = base + i * 0.42, back = -(i + 0.55) * 0.85;
      for (let x = -width / 2 + 0.5; x < width / 2 - 0.4; x += 0.64) {
        if (Math.random() > density) continue;
        const lx = x + (Math.random() - 0.5) * 0.12, lz = back;
        seats.push({ x: cx + c * lx + s * lz, y: y + 0.02, z: cz - s * lx + c * lz, rot });
      }
    }
    const depth = rows * 0.85 + 1.2, top = base + rows * 0.42 + 1.6;
    if (roof) {
      add(grp, new THREE.BoxGeometry(width + 2, 0.4, depth * 0.62), dark, [0, top + 4.4, -depth * 0.69]);
      add(grp, new THREE.BoxGeometry(width + 2, 0.5, 0.3), toon(0xe9ecf5, { rough: 0.5, rim: 0 }), [0, top + 4.2, -depth * 0.38]);
      for (let px = -width / 2 + 1; px <= width / 2 - 1; px += width / 6) add(grp, new THREE.CylinderGeometry(0.2, 0.2, 4.4, 8), dark, [px, top + 2.2, -depth + 0.4]);
    }
    return { grp, top, depth };
  }
  return stand;
}

function floodlights(root, spots, target) {
  const mast = toon(0xb9bccb, { rough: 0.6, rim: 0 });
  const lampCv = canvas(128, 64), g = lampCv.getContext('2d');
  g.fillStyle = '#3a3d52'; g.fillRect(0, 0, 128, 64);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) { const gr = g.createRadialGradient(11 + x * 21, 11 + y * 21, 1, 11 + x * 21, 11 + y * 21, 10); gr.addColorStop(0, '#fff'); gr.addColorStop(0.6, '#fff6d8'); gr.addColorStop(1, '#9a9cb0'); g.fillStyle = gr; g.beginPath(); g.arc(11 + x * 21, 11 + y * 21, 9, 0, 7); g.fill(); }
  const lampMat = new THREE.MeshBasicMaterial({ map: tex(lampCv) });
  const glowMat = new THREE.SpriteMaterial({ map: glowTex(), color: 0xfff4dc, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  for (const [x, z, h] of spots) {
    add(root, new THREE.CylinderGeometry(0.4, 0.7, h, 10), mast, [x, h / 2, z]);
    const head = new THREE.Group(); head.position.set(x, h + 1.5, z); root.add(head); head.lookAt(target);
    add(head, new THREE.BoxGeometry(7, 3.4, 0.5), mast, [0, 0, -0.3]);
    add(head, new THREE.PlaneGeometry(6.6, 3.0), lampMat, [0, 0, 0]);
    const gl = new THREE.Sprite(glowMat); gl.scale.set(22, 22, 1); gl.position.set(0, 0, 1.2); head.add(gl);
  }
}

// a waving flag / banner material (a little vertex wave)
function waveMat(map, color = 0xffffff) {
  const m = toon(color, { rough: 0.8, rim: 0.1, map, side: THREE.DoubleSide });
  const uT = { value: 0 };
  m.onBeforeCompile = ((prev) => (sh) => { prev && prev(sh); sh.uniforms.uT = uT; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z += sin(position.x * 2.2 + uT * 4.0) * 0.08 * (position.x + 1.5);'); })(m.onBeforeCompile);
  m.userData.t = uT;
  m.customProgramCacheKey = () => 'toonwave' + (map ? 'm' : '');
  return m;
}

// ---------- the scenery of each place ----------
function schoolBuilding(root) {
  const cv = canvas(1024, 512), g = cv.getContext('2d');
  const draw = () => {
    g.fillStyle = '#e48a52'; g.fillRect(0, 0, 1024, 512);
    // bricks
    g.strokeStyle = 'rgba(150,70,40,.35)'; g.lineWidth = 2;
    for (let y = 0; y < 512; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); for (let x = (y / 16) % 2 ? 0 : 16; x < 1024; x += 32) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke(); } }
    // windows: two floors
    for (const y of [120, 300]) for (let x = 60; x < 1000; x += 120) {
      if (y === 300 && x > 440 && x < 580) continue;
      g.fillStyle = '#fff6e0'; g.fillRect(x - 6, y - 6, 92, 112);
      const gr = g.createLinearGradient(0, y, 0, y + 100); gr.addColorStop(0, '#9fd3ff'); gr.addColorStop(1, '#4f8fd8'); g.fillStyle = gr; g.fillRect(x, y, 80, 100);
      g.fillStyle = '#fff6e0'; g.fillRect(x + 37, y, 6, 100); g.fillRect(x, y + 46, 80, 6);
    }
    // the door and the sign
    g.fillStyle = '#5b2bb0'; g.fillRect(452, 330, 120, 182); g.fillStyle = '#ffcd1c'; g.fillRect(508, 330, 8, 182);
    g.fillStyle = '#5b2bb0'; g.fillRect(262, 14, 500, 74); g.fillStyle = '#ffcd1c'; g.fillRect(262, 14, 500, 6); g.fillRect(262, 82, 500, 6);
    g.font = '52px "Lilita One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText('FOXINO SCHOOL', 512, 52);
  };
  draw(); const t = tex(cv); fontLoaded(() => { draw(); t.needsUpdate = true; });
  const b = new THREE.Group(); b.position.set(FINISH + 46, 0, -10); b.rotation.y = -Math.PI / 2 + 0.25; root.add(b);
  const wall = toon(0xffffff, { map: t, rough: 0.9, rim: 0 }), side = toon(0xd97c48, { rough: 0.9, rim: 0 });
  add(b, new THREE.BoxGeometry(44, 22, 14), [side, side, side, side, wall, side], [0, 11, 0]);
  add(b, new THREE.BoxGeometry(46, 1.2, 16), toon(0x5b2bb0, { rough: 0.7, rim: 0 }), [0, 22.4, 0]);
  // a clock tower
  add(b, new THREE.BoxGeometry(7, 9, 7), side, [0, 27, 0]);
  add(b, new THREE.ConeGeometry(5.6, 5, 4), toon(0x5b2bb0, { rough: 0.7 }), [0, 34, 0], null, [0, Math.PI / 4, 0]);
  add(b, new THREE.CircleGeometry(2.2, 32), toon(0xfff6e0, { rough: 0.5, rim: 0 }), [0, 27.5, 3.55]);
  add(b, new THREE.BoxGeometry(0.2, 1.7, 0.1), toon(0x1d1640), [0, 28.1, 3.65]);
  add(b, new THREE.BoxGeometry(1.2, 0.2, 0.1), toon(0x1d1640), [0.5, 27.5, 3.65]);
  // a second wing along the track, far side
  const w2 = new THREE.Group(); w2.position.set(FINISH * 0.55, 0, -46); root.add(w2);
  add(w2, new THREE.BoxGeometry(70, 14, 12), [side, side, side, side, wall, side], [0, 7, 0]);
  add(w2, new THREE.BoxGeometry(72, 1, 14), toon(0x5b2bb0, { rough: 0.7, rim: 0 }), [0, 14.4, 0]);
}

function trees(root, spots, colors = [0x3f9a3a, 0x58b84a, 0x2f8a46]) {
  const trunk = toon(0x7a4a2a, { rough: 0.9, rim: 0 });
  const leafM = colors.map((c) => toon(c, { rough: 0.85, rim: 0.3 }));
  const ball = new THREE.IcosahedronGeometry(1, 1);
  spots.forEach(([x, z, s], i) => {
    add(root, new THREE.CylinderGeometry(0.25 * s, 0.35 * s, 3 * s, 7), trunk, [x, 1.5 * s, z]);
    const m = leafM[i % leafM.length];
    add(root, ball, m, [x, 3.6 * s, z], [2.1 * s, 2.0 * s, 2.1 * s]);
    add(root, ball, m, [x + 0.9 * s, 3.1 * s, z + 0.5 * s], [1.4 * s, 1.3 * s, 1.4 * s]);
    add(root, ball, m, [x - 0.8 * s, 3.2 * s, z - 0.4 * s], [1.5 * s, 1.4 * s, 1.5 * s]);
  });
}

function bunting(root, x0, x1, z, y) {
  const cols = [0xffcd1c, 0x8f52d9, 0xff7d22, 0x3cc6ef, 0xff4f9a, 0x5bd66b];
  const n = Math.floor((x1 - x0) / 1.1);
  const geo = new THREE.BufferGeometry(); const pos = [], col = []; const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = x0 + i * 1.1, sag = Math.sin((i % 12) / 12 * Math.PI) * 0.8, yy = y - sag;
    c.setHex(cols[i % cols.length]);
    pos.push(x - 0.4, yy, z, x + 0.4, yy, z, x, yy - 0.75, z);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  root.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
}

function skyline(root, night, tint = 0x5a5f8a) {
  // window lights on a tiled canvas
  const cv = canvas(128, 256), g = cv.getContext('2d');
  g.fillStyle = night ? '#141a3a' : '#7b84b0'; g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 256; y += 18) for (let x = 8; x < 128; x += 18) { const on = Math.random() < (night ? 0.55 : 0.25); g.fillStyle = on ? (night ? '#ffd27a' : '#cfe3ff') : (night ? '#232a55' : '#6a739c'); g.fillRect(x, y, 10, 12); }
  const t = tex(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const mat = night ? new THREE.MeshBasicMaterial({ map: t, color: 0xbfc6ff, fog: true }) : toon(0xffffff, { map: t, rough: 0.8, rim: 0 });
  for (let i = 0; i < 46; i++) {
    const w = 14 + Math.random() * 18, h = 30 + Math.random() * 80, d = 14 + Math.random() * 10;
    const x = -120 + i * 12 + Math.random() * 6, z = -140 - Math.random() * 90;
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / 16, uv.getY(k) * h / 32);
    add(root, geo, mat, [x, h / 2, z]);
  }
}

function bigScreen(root, x, z, rot, text) {
  const t = banner(text, '#11152e', '#ffffff', 1024, 256);
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; root.add(g);
  const dark = toon(0x23243a, { rough: 0.6, rim: 0 });
  add(g, new THREE.BoxGeometry(1, 16, 1), dark, [-9, 8, 0]); add(g, new THREE.BoxGeometry(1, 16, 1), dark, [9, 8, 0]);
  add(g, new THREE.BoxGeometry(22, 9.5, 0.8), dark, [0, 17, 0]);
  add(g, new THREE.PlaneGeometry(20.6, 8.2), new THREE.MeshBasicMaterial({ map: t }), [0, 17, 0.41]);
  return g;
}

function flame(root, x, y, z) {
  const bowl = toon(0xc9a24a, { rough: 0.3, metal: 0.6 });
  add(root, new THREE.CylinderGeometry(0.6, 1.4, y, 10), toon(0xeceef5, { rough: 0.5 }), [x, y / 2, z]);
  add(root, new THREE.CylinderGeometry(3.2, 1.2, 2, 20, 1, true), bowl, [x, y + 1, z]);
  const uT = { value: 0 };
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uT;
      void main(){ vec2 p = vUv - vec2(0.5, 0.0); float w = 0.5 * (1.0 - vUv.y) * (0.75 + 0.25 * sin(vUv.y * 9.0 - uT * 8.0));
        float x = p.x + 0.06 * sin(vUv.y * 7.0 + uT * 5.0) * vUv.y; float a = smoothstep(w, w * 0.2, abs(x)) * smoothstep(1.0, 0.25, vUv.y);
        vec3 c = mix(vec3(1.0, 0.95, 0.5), vec3(1.0, 0.35, 0.05), vUv.y * 1.2); gl_FragColor = vec4(c * a * 1.6, a); }` });
  const fl = new THREE.Group(); fl.position.set(x, y + 1.6, z); root.add(fl);
  for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(6 - i, 9 - i * 1.5), mat); m.position.y = 4 - i * 0.5; m.rotation.y = i * Math.PI / 3; fl.add(m); }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  glow.scale.set(26, 26, 1); glow.position.set(x, y + 5, z); root.add(glow);
  return uT;
}

// fireworks: bursts of additive points in the sky
function makeFireworks(root) {
  const N = 900, geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 1.4, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTex(), fog: false });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; root.add(pts);
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -999;
  let next = 0, auto = 0;
  const cols = [0xffcd1c, 0xff7d22, 0x8f52d9, 0x3cc6ef, 0xff4f9a, 0x5bd66b, 0xffffff];
  function burst(x, y, z) {
    const c = new THREE.Color(cols[Math.floor(Math.random() * cols.length)]);
    for (let k = 0; k < 90; k++) {
      const i = next; next = (next + 1) % N;
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = 9 + Math.random() * 3;
      pos.set([x, y, z], i * 3); vel.set([r * Math.cos(a) * sp, u * sp, r * Math.sin(a) * sp], i * 3);
      col.set([c.r, c.g, c.b], i * 3); life[i] = 1.6 + Math.random() * 0.6;
    }
  }
  return {
    burst, on: false,
    update(dt, cx) {
      if (this.on) { auto -= dt; if (auto < 0) { auto = 0.35 + Math.random() * 0.5; burst(cx + 10 + Math.random() * 60, 28 + Math.random() * 22, -40 - Math.random() * 40); } }
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        vel[i * 3 + 1] -= 6 * dt; vel[i * 3] *= 0.985; vel[i * 3 + 1] *= 0.985; vel[i * 3 + 2] *= 0.985;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const f = Math.max(0, Math.min(1, life[i] / 0.8)); col[i * 3] *= 0.995; col[i * 3 + 1] *= 0.995; col[i * 3 + 2] *= 0.995;
        if (life[i] <= 0) pos[i * 3 + 1] = -999; else if (f < 1) { col[i * 3] *= 0.97; col[i * 3 + 1] *= 0.97; col[i * 3 + 2] *= 0.97; }
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
  };
}

// ---------- build one place ----------
export function buildVenue(scene, idx) {
  const st = STAGES[idx];
  const root = new THREE.Group(); root.name = 'venue-' + st.id; scene.add(root);
  const sky = makeSky(st.sky); root.add(sky);
  scene.fog = new THREE.Fog(st.fog, 120, idx === 0 ? 520 : 600);
  makeTrack(st, root);
  const finish = makeFinish(root, st);
  const seats = [], flags = [];
  const stand = makeStands(root, st, seats, idx === 2 ? { seat: 0x1f3f8f } : idx === 3 ? { seat: 0x5b2bb0, concrete: 0x9a8fb8 } : {});
  const farZ = -(TRACK_W / 2 + 4);
  let flameT = null, fireworks = null;
  if (idx === 0) {
    schoolBuilding(root);
    // two small bleachers by the finish and a few at the start
    stand(FINISH - 30, farZ, 0, 40, 5, 0.6, 0.55, false);
    stand(40, farZ, 0, 26, 4, 0.6, 0.35, false);
    trees(root, [[-30, -22, 1.6], [-10, -26, 1.3], [90, -22, 1.5], [130, -24, 1.2], [160, -22, 1.4], [-40, 20, 1.5], [60, 26, 1.3], [120, 30, 1.6], [200, 26, 1.4], [260, 24, 1.6], [280, -26, 1.7], [-60, -10, 1.8]]);
    bunting(root, FINISH - 50, FINISH - 10, farZ - 3, 5.2);
    bunting(root, 20, 60, farZ - 2, 4.4);
    // a little fence along the near side
    const fence = toon(0xffffff, { rough: 0.6, rim: 0 });
    for (let x = -50; x < FINISH + 70; x += 3) add(root, new THREE.BoxGeometry(0.08, 0.9, 0.08), fence, [x, 0.45, TRACK_W / 2 + 4]);
    add(root, new THREE.BoxGeometry(FINISH + 120, 0.08, 0.06), fence, [FINISH / 2 + 10, 0.85, TRACK_W / 2 + 4]);
    add(root, new THREE.BoxGeometry(FINISH + 120, 0.08, 0.06), fence, [FINISH / 2 + 10, 0.5, TRACK_W / 2 + 4]);
  } else {
    const rows = idx === 1 ? 14 : 22, len = idx === 1 ? 180 : 260;
    const main = stand(FINISH / 2, farZ - 1, 0, len, rows, 1.2, st.crowd);
    // the far end (beyond the finish): a curved-ish stand made of three pieces
    stand(FINISH + 40, -2, -Math.PI / 2, 60, rows - 4, 1.2, st.crowd * 0.9);
    stand(FINISH + 32, -40, -Math.PI / 4, 30, rows - 4, 1.2, st.crowd * 0.9);
    if (idx >= 2) stand(FINISH / 2, TRACK_W / 2 + 40, Math.PI, len, rows, 1.2, st.crowd * 0.8);
    stand(-46, -2, Math.PI / 2, 60, rows - 6, 1.2, st.crowd * 0.7);
    floodlights(root, [[-30, -40, 42], [FINISH * 0.5, -48, 46], [FINISH + 30, -44, 42], [FINISH + 50, 30, 40], [-40, 36, 40]], new THREE.Vector3(FINISH / 2, 0, 0));
    if (idx === 1) skyline(root, false);
    if (idx >= 2) skyline(root, true);
    const scr = bigScreen(root, FINISH + 52, -36, -Math.PI / 2 + 0.6, idx === 3 ? 'THE FINAL' : idx === 2 ? 'SEMI-FINAL' : 'CITY GAMES');
    // banners in the crowd
    const bt = banner(idx === 3 ? 'GO FOXINO!' : 'FOXINO!', '#5b2bb0', '#fff');
    const bm = waveMat(bt); flags.push(bm);
    for (const [x, r] of [[60, 6], [130, 10], [190, 5]]) add(root, new THREE.PlaneGeometry(9, 2.25, 16, 4), bm, [x, 1.2 + r * 0.42 + 1.3, farZ - 1 - (r + 0.5) * 0.85]);
    // flags on the roof
    const flagGeo = new THREE.PlaneGeometry(2.6, 1.6, 12, 4); flagGeo.translate(1.3, 0, 0);
    const mast = toon(0xb9bccb, { rough: 0.6, rim: 0 });
    [0xffcd1c, 0x8f52d9, 0xff7d22, 0x3cc6ef, 0xffcd1c, 0x8f52d9, 0xff7d22, 0x3cc6ef].forEach((c, i) => {
      const x = FINISH / 2 - len / 2 + 12 + i * (len - 24) / 7, y = main.top + 4.6, z = farZ - 1 - main.depth * 0.55;
      add(root, new THREE.CylinderGeometry(0.06, 0.06, 4, 6), mast, [x, y + 2, z]);
      const fm = waveMat(null, c); flags.push(fm);
      add(root, flagGeo, fm, [x + 0.06, y + 3.2, z], null, [0, 0.2, 0]);
    });
    if (st.flame) flameT = flame(root, FINISH + 44, 30, -40);
    if (st.fireworks) fireworks = makeFireworks(root);
  }
  const crowd = makeCrowd(seats, [FINISH / 2, 0]);
  root.add(crowd.mesh);
  return {
    root, st, finish, crowd, fireworks,
    update(dt, t, camX) {
      crowd.uniforms.uTime.value = t;
      sky.material.uniforms.uTime.value = t;
      for (const f of flags) f.userData.t.value = t;
      if (flameT) flameT.value = t;
      if (fireworks) fireworks.update(dt, camX);
    },
    dispose() {
      scene.remove(root);
      root.traverse((o) => { if (o.geometry) o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); } });
    },
  };
}
