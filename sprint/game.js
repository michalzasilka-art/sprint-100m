// Foxino Olympics · 100 m Sprint. Foxino runs a 100 m race against three rival foxes. Questions come one after another;
// a right answer makes him faster, and the faster it comes, the faster he runs. A wrong one makes him stumble.
// The rivals adapt: each has a pace line (its "honest" race). While Foxino is ahead of a rival's line, that rival stays
// just behind him (a close race that he wins); while he is behind it, the rival stays a little ahead, never faster than
// its line. So a child who answers everything right and quickly wins, and one who answers right but always at the last
// second is too slow for the leader's line and loses. Four places, each unlocked by winning the one before.
import * as THREE from '../olympics/common/lib/three.module.min.js';
import { RoomEnvironment } from '../olympics/common/lib/RoomEnvironment.js';
import { FURS, POSES, makeFoxino } from '../olympics/common/foxino.js';
import { makeBlob, makeConfetti } from '../olympics/common/props.js';
import { sfx, unlock, crowd as crowdSound, setMuted, isMuted } from '../olympics/common/sound.js';
import { clamp, lerp, damp, smooth, easeInOut } from '../olympics/common/mat.js';
import { makeDeck, timeFor, packFor, choosePacks, packSummary } from '../olympics/common/quiz.js';
import { createQuiz } from '../olympics/common/quizui.js';
import { Players, mountProfile } from '../olympics/common/players.js';
import { buildVenue, STAGES, VIS, FINISH, laneZ } from './venues.js';
import { SP } from './poses.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const params = new URLSearchParams(location.search);

// ---------- tuning ----------
const V_START = 1.6;                    // race m/s before the first answer
const V_LOW = 1.9, V_HIGH = 3.9;        // a right answer at the last moment … at once
const V_WRONG = 1.15, STUMBLE = 0.9;    // a wrong answer: a stumble, then this speed until the next answer
const ACC = 2.6;                        // how fast the speed changes (race m/s²)
const REACT = 0.45;                     // the rivals' reaction at the gun (s)
const CLOCK = 0.36;                     // shown race time = game seconds × CLOCK (a 100 m in about 10–15 "seconds")
const RIVALS = [
  { name: 'Blaze', fur: 'blaze', lane: 4, k: 1.0, behind: 0.7, ahead: 2.6, kit: { jersey: 0x2c5fd6, trim: 0xffffff, accent: 0xff5a4f, light: 0xffffff, shorts: 0x1d2f7a, sock: 0xffffff, sockBand: 0x2c5fd6, name: 'BLAZE', number: 7 } },
  { name: 'Frost', fur: 'frost', lane: 3, k: 0.95, behind: 1.8, ahead: 1.3, kit: { jersey: 0xe23c3c, trim: 0xffffff, accent: 0x1d2f7a, light: 0xffffff, shorts: 0x2a2c40, sock: 0xe23c3c, sockBand: 0xffffff, name: 'FROST', number: 3 } },
  { name: 'Shadow', fur: 'shadow', lane: 2, k: 0.85, behind: 2.9, ahead: -1.1, kit: { jersey: 0x1fae55, trim: 0xffcd1c, accent: 0x0f5e2e, light: 0xffffff, shorts: 0x0f5e2e, sock: 0x1fae55, sockBand: 0xffcd1c, name: 'SHADOW', number: 22 } },
];
const ME = { name: 'Foxino', fur: 'foxino', lane: 5, kit: { jersey: 0xffcd1c, trim: 0x5b2bb0, accent: 0xff7d22, sleeveless: true, name: 'FOXINO', number: 10 } };
const DOT = ['#ffcd1c', '#2c5fd6', '#e23c3c', '#1fae55'];
const ORD = ['1st', '2nd', '3rd', '4th'];
const MEDAL = ['🥇', '🥈', '🥉', ''];

// ---------- renderer / scene ----------
const canvas = $('gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (e) { $('loadText').textContent = 'Sorry, this device cannot show 3D graphics (WebGL).'; throw e; }
canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
canvas.addEventListener('webglcontextrestored', () => location.reload());
let pr = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pr);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 2000);
scene.add(camera);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
const hemi = new THREE.HemisphereLight(0xe4f0ff, 0x5a8a45, 1.25); scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff1de, 2.3); key.position.set(20, 30, 30); scene.add(key); scene.add(key.target);
const rim = new THREE.DirectionalLight(0xffe0b8, 1.0); rim.position.set(-20, 12, -30); scene.add(rim);

// ---------- the runners (the code-built Foxino; rivals are recoloured foxes) ----------
$('loadText').textContent = 'Warming up the runners…';
function makeRunner(def, isMe) {
  const fox = makeFoxino({ colors: FURS[def.fur], kit: def.kit });
  fox.root.rotation.y = Math.PI / 2;    // face +x
  scene.add(fox.root);
  const blob = makeBlob(1.0, 0.38); scene.add(blob);
  return { ...def, me: !!isMe, fox, blob, pos: 0, v: 0, ph: Math.random() * 6, finishT: 0, stumble: 0, pose: 'crouch', poseT: 0, place: 0 };
}
const me = makeRunner(ME, true);
const rivals = RIVALS.map((r) => makeRunner(r, false));
const all = [me, ...rivals];
const confetti = makeConfetti(320); scene.add(confetti.mesh);

// ---------- saved progress (per player) ----------
function save() { return Players.data('sprint'); }
function prefs() { const p = Players.prefs(); p.level = p.level || 1; p.packs = p.packs || []; return p; }

// ---------- state ----------
let venue = null, stageIdx = 0;
let state = 'menu';            // menu → intro → marks → set → race → done → results
let stT = 0, raceT = 0, gunT = 0, raceId = 0, timeScale = 1;
let vt = V_START;              // the player's target speed
let deck = null, qn = 0, stats = { right: 0, wrong: 0, fast: 0, missed: [] };
let clockShown = 0;
const quiz = createQuiz();

function setStage(i) {
  stageIdx = clamp(i | 0, 0, STAGES.length - 1);
  if (venue) venue.dispose();
  venue = buildVenue(scene, stageIdx);
  const st = STAGES[stageIdx];
  hemi.color.setHex(st.light.hemi[0]); hemi.groundColor.setHex(st.light.hemi[1]); hemi.intensity = st.light.hemi[2];
  key.color.setHex(st.light.key[0]); key.intensity = st.light.key[1];
  renderer.toneMappingExposure = st.light.exp;
  document.body.dataset.stage = st.id;
  resetRunners();
}
function resetRunners() {
  for (const r of all) {
    r.pos = -0.25; r.v = 0; r.finishT = 0; r.stumble = 0; r.place = 0; r.pose = 'stand'; r.poseT = 0;
    r.fox.root.position.set(r.pos * VIS, 0, laneZ(r.lane));
    r.fox.face('happy');
  }
  venue.finish.tape.visible = true;
  confetti.clear();
  if (venue.fireworks) venue.fireworks.on = false;
}

// ---------- camera ----------
const camPos = new THREE.Vector3(8, 3, 10), camLook = new THREE.Vector3(0, 0.8, 0);
const _p = new THREE.Vector3(), _l = new THREE.Vector3();
let camSnap = true, fovNow = 42, viewY = 0, viewX = 0;
const band = { top: 0, bot: 0, h: 0 };
function camTarget(dt) {
  const a = innerWidth / innerHeight;
  const w = clamp((a - 0.62) / (1.5 - 0.62), 0, 1);      // 0 = tall phone, 1 = wide board
  const x = me.pos * VIS;
  let fov = lerp(58, 38, w);
  if (state === 'poster') {
    const ol = posterKind === 'olympics';
    _p.set(x + (ol ? 2.7 : 4.2), ol ? 0.95 : 1.05, laneZ(5) + (ol ? 1.7 : 1.7));
    _l.set(x - (ol ? 0.9 : 1.8), ol ? 1.32 : 1.2, laneZ(ol ? 4.5 : 3.6));
    fov = ol ? 50 : 50;
  } else if (state === 'menu') {
    // a slow drift past Foxino warming up at the start
    const t = stT * 0.15;
    _p.set(4.5 + Math.sin(t) * 1.2, lerp(2.4, 1.9, w), laneZ(5) + lerp(6.5, 5.2, w) + Math.cos(t) * 0.6);
    _l.set(lerp(0.4, -0.6, w), lerp(0.55, 0.75, w), lerp(laneZ(5) - 0.8, laneZ(4), w));
    fov = lerp(52, 36, w);
  } else if (state === 'intro' || state === 'marks' || state === 'set') {
    // from in front of the blocks, low, the four runners in a row
    const u = state === 'intro' ? smooth(stT / 2.2) : 1;
    _p.set(lerp(14, lerp(4.2, 4.6, w), u), lerp(3.5, 1.25, u), lerp(laneZ(5) + 9, laneZ(5) + lerp(4.6, 3.4, w), u));
    _l.set(-0.3, 0.35, lerp(laneZ(3.5), laneZ(3.6), w));
    fov = lerp(64, 46, w);
  } else if (state === 'race' || (state === 'done' && stT < 1.2)) {
    const sp = clamp(me.v / V_HIGH, 0, 1);
    // tall: from behind and above (the rivals beside him); wide: from the side in front (3/4 view of his face)
    // tall screens: in front of the runners, coming toward the camera (the lanes go back in depth);
    // wide screens: from the side in front (a 3/4 view of Foxino's face, the rivals behind him)
    _p.set(x + lerp(7.2, 3.3, w), lerp(2.6, 1.7, w), lerp(laneZ(5) + 2.4, laneZ(5) + 5.2, w));
    _l.set(x + lerp(-1.0, -0.5, w), lerp(0.55, 0.72, w), lerp(laneZ(4.1), laneZ(3.9), w));
    fov += sp * 5;
  } else {
    // after the line: from beyond the finish looking back at the runners
    const fx = Math.max(FINISH, x);
    _p.set(fx + lerp(6.5, 5, w), lerp(2.4, 1.9, w), laneZ(5) + lerp(5.5, 4.6, w));
    _l.set(fx - lerp(1.5, 0.8, w), 0.75, laneZ(3.6));
    fov = lerp(58, 42, w);
  }
  if (camSnap) { camPos.copy(_p); camLook.copy(_l); fovNow = fov; camSnap = false; }
  else { camPos.x = damp(camPos.x, _p.x, 5, dt); camPos.y = damp(camPos.y, _p.y, 3, dt); camPos.z = damp(camPos.z, _p.z, 3, dt); camLook.lerp(_l, 1 - Math.exp(-5 * dt)); fovNow = damp(fovNow, fov, 3, dt); }
  // the race camera follows his x tightly (no lag at full speed)
  if (state === 'race') { camPos.x = _p.x; camLook.x = _l.x; }
  camera.position.copy(camPos); camera.lookAt(camLook);
  camera.fov = fovNow;
  // keep the runners in the free band between the question card and the answer bubbles
  const H = innerHeight;
  if (quiz.open) {
    const cr = document.querySelector('.qz-card').getBoundingClientRect();
    const b = [...document.querySelector('.qz-opts').children].filter((c) => !c.hidden).map((c) => c.getBoundingClientRect().top);
    band.top = Math.max(56, cr.bottom); band.bot = b.length ? Math.min(H, ...b) : H; band.h = H;
  }
  if (band.h !== H) { band.top = H * 0.3; band.bot = H * 0.8; band.h = H; }
  const racing = state === 'race' || state === 'done';
  const want = state === 'poster' ? H * 0.62 : racing ? (band.top + band.bot) / 2 + (band.bot - band.top) * 0.08 : state === 'menu' ? H * 0.47 : H * 0.5;
  const off = clamp(H / 2 - want, -H * 0.35, H * 0.35);
  viewY = damp(viewY, off, 6, dt);
  // on a wide screen the results panel sits on the left: the runners move to the right
  const offX = state === 'results' && innerWidth / H > 1.3 ? -innerWidth * 0.2 : 0;
  viewX = damp(viewX, offX, 4, dt);
  camera.setViewOffset(innerWidth, H, viewX, viewY, innerWidth, H);
  camera.updateProjectionMatrix();
}

// ---------- the race model ----------
const pace = () => STAGES[stageIdx].pace;
const line = (r, t) => Math.max(0, r.k * pace() * (t - REACT));
function stepRace(dt) {
  raceT += dt;
  // the player
  if (!me.finishT) {
    if (me.stumble > 0) { me.stumble -= dt; me.v = damp(me.v, 0.7, 6, dt); }
    else me.v += clamp(vt - me.v, -ACC * 1.6 * dt, ACC * dt);
  }
  me.pos += me.v * dt;
  // the rivals
  for (const r of rivals) {
    const H = line(r, raceT);
    let target, vref;
    if (me.finishT || r.finishT) { target = H + 2; vref = r.k * pace() * 1.05; }
    else if (me.pos >= H) { target = me.pos - r.behind; vref = me.v; }
    else { target = Math.min(H, me.pos + r.ahead); vref = Math.min(r.k * pace(), me.v + 0.6); }
    if (r.finishT) { r.pos += r.v * dt; continue; }
    if (raceT < REACT) { r.v = 0; continue; }
    const want = clamp(vref + (target - r.pos) * 1.3, 0, Math.max(r.k * pace(), me.v) * 1.35);
    r.v += clamp(want - r.v, -ACC * 2 * dt, ACC * 1.4 * dt);
    r.pos += r.v * dt;
  }
  // after the line: slow down and stop before the end of the run-out
  for (const r of all) if (r.finishT) { r.v = damp(r.v, r.pos > 106 ? 0 : 1.2, 1.6, dt); }
  // crossing the line
  for (const r of all) {
    if (!r.finishT && r.pos >= 100) {
      r.finishT = raceT - (r.pos - 100) / Math.max(0.1, r.v);
      r.place = all.filter((o) => o.finishT).length;
      if (r.place === 1) { venue.finish.tape.visible = false; sfx.whistle(false); }
      if (r === me) playerFinished();
    }
  }
}
function ranks() { return all.slice().sort((a, b) => (a.finishT && b.finishT ? a.finishT - b.finishT : a.finishT ? -1 : b.finishT ? 1 : b.pos - a.pos)); }

// ---------- animating the runners ----------
function animRunners(dt, t) {
  for (const r of all) {
    const f = r.fox;
    let P;
    if (state === 'poster') P = r.me && posterKind === 'olympics' ? CELEBRATE(0.15) : SP.run(r.posterPh, 1.25);
    else if (state === 'menu') P = POSE_WARM(t + (r.me ? 0 : r.lane * 1.3));
    else if (state === 'intro') P = POSE_WARM(t + r.lane * 0.7);
    else if (state === 'marks') P = SP.crouch(0, t);
    else if (state === 'set') P = SP.crouch(smooth(stT / 0.5), t);
    else {
      const wv = r.v * VIS;
      r.ph += dt * wv / 1.55 * Math.PI;
      const k = clamp(r.v / 3.0, 0.3, 1.3);
      if (r.finishT && raceT - r.finishT > 1.2 && r.v < 1.3) {
        P = r.place === 1 ? CELEBRATE(t) : SP.tired(t + r.lane);
      } else if (r.me && me.stumble > 0) P = SP.stumble(r.ph, 1 - me.stumble / STUMBLE);
      else if (!r.finishT && r.pos > 97.5) P = SP.dip(r.ph, (r.pos - 97.5) / 2.5);
      else P = SP.run(r.ph, k);
    }
    if (P) f.apply(P, state === 'race' ? 22 : 12, dt);
    // the eyes: down the track while racing, now and then a glance at the rival beside him; the camera otherwise
    if (f.lookAt) {
      r.glance = (r.glance || 0) - dt;
      if (r.glance < -2.5 - (r.lane % 3)) r.glance = 0.6 + Math.random() * 0.6;
      const racing = state === 'race' || (state === 'done' && !r.finishT);
      if (racing) {
        const nb = all.find((o) => o.lane === r.lane + (r.lane > 2 ? -1 : 1));
        if (r.glance > 0 && nb) _look.set(nb.pos * VIS + 0.5, 1.1, laneZ(nb.lane)); else _look.set(r.pos * VIS + 14, 0.9, laneZ(r.lane));
      } else _look.copy(camera.position);
      f.lookAt(_look);
    }
    f.update(dt, t + r.lane);
    f.root.position.set(r.pos * VIS, 0, laneZ(r.lane));
    // the winner turns to the camera to celebrate
    const turn = (r.finishT && r.place === 1 && raceT - r.finishT > 1.2 && r.v < 1.3) || (state === 'poster' && r.me && posterKind === 'olympics');
    f.root.rotation.y = state === 'poster' && turn ? 0.95 : damp(f.root.rotation.y, turn ? Math.PI * 0.85 : Math.PI / 2, 4, dt);
    r.blob.position.set(r.pos * VIS + 0.05, 0.015, laneZ(r.lane));
  }
}
const _look = new THREE.Vector3();
const POSE_WARM = (t) => { const k = Math.floor(t / 3) % 4; return k === 3 ? POSES.wave(t) : POSES.ready(t); };
const CELEBRATE = (t) => POSES.celebrate(t);

// ---------- HUD: the race strip ----------
const strip = $('strip'), dots = all.map((r, i) => { const d = document.createElement('i'); d.style.background = DOT[i]; if (r.me) d.className = 'me'; $('stripBar').appendChild(d); return d; });
function hud() {
  all.forEach((r, i) => { dots[i].style.left = `${clamp(r.pos, 0, 100)}%`; });
  $('stripM').textContent = `${Math.floor(clamp(me.pos, 0, 100))} m`;
  const place = ranks().indexOf(me);
  $('stripP').textContent = ORD[place];
  $('stripP').className = place === 0 ? 'lead' : '';
  const sp = clamp((me.v - 1) / (V_HIGH - 1), 0, 1);
  $('speedFill').style.transform = `scaleY(${sp.toFixed(3)})`;
  const clk = state === 'race' || state === 'done' ? (me.finishT || raceT) * CLOCK : 0;
  if (Math.abs(clk - clockShown) > 0.009) { clockShown = clk; $('clock').textContent = clk.toFixed(2); }
}

// ---------- banners and flow ----------
function bannerWord(text, cls = '') {
  const b = $('banner'); b.innerHTML = `<span class="word ${cls}">${esc(text)}</span>`;
}
function show(id, on) { $(id).classList.toggle('hidden', !on); }
function wait(s) { return new Promise((r) => setTimeout(r, s * 1000)); }
function setPhase(s) { state = s; stT = 0; document.body.dataset.state = s; }

async function startRace() {
  unlock(); sfx.click();
  raceId++;
  const p = prefs();
  const pack = p.packs.length ? await packFor(p.packs).catch(() => null) : null;
  deck = makeDeck({ level: p.level, pack });
  qn = 0; stats = { right: 0, wrong: 0, fast: 0, missed: [] };
  resetRunners();
  show('start', false); show('end', false); show('strip', true); show('speed', true); show('clockBox', true);
  $('profileBtn').classList.add('hidden');
  raceT = 0; vt = V_START; clockShown = -1;
  setPhase('intro'); camSnap = true;
  bannerWord(STAGES[stageIdx].name, 'small');
  crowdSound(0.25);
}

function praise(frac) {
  if (frac < 0.25) { stats.fast++; return '⚡ LIGHTNING FAST!'; }
  if (frac < 0.5) return '🔥 FAST!';
  if (frac < 0.8) return '✓ Good!';
  return '✓ Right — but faster next time!';
}

async function quizLoop(id) {
  while (state === 'race' && id === raceId && !me.finishT) {
    qn++;
    const q = deck.next();
    const p = prefs();
    const T = timeFor(q, p.level >= 2 ? 7 : 6.5);
    const r = await quiz.ask(q, { time: T, kicker: `QUESTION ${qn}`, extra: STAGES[stageIdx].name.toUpperCase() });
    if (id !== raceId || state !== 'race') { quiz.hide(); return; }
    if (r.ok) {
      stats.right++;
      vt = V_LOW + (V_HIGH - V_LOW) * (1 - r.frac);
      quiz.reveal(r, praise(r.frac));
      sfx.right(); if (r.frac < 0.5) sfx.boost();
      $('speed').classList.remove('boost'); void $('speed').offsetWidth; $('speed').classList.add('boost');
    } else {
      stats.wrong++; deck.miss(q);
      if (!stats.missed.some((m) => m.full === q.full)) stats.missed.push(q);
      vt = V_WRONG; me.stumble = STUMBLE;
      quiz.reveal(r);
      sfx.wrong(); sfx.stumble();
    }
    await wait(r.ok ? 0.8 : 1.9);
    if (id !== raceId) return;
    quiz.hide();
    if (me.finishT) return;
    await wait(0.2);
  }
}

function playerFinished() {
  quiz.hide();
  setPhase('done');
  const place = me.place;
  if (place === 1) { bannerWord('GOLD!'); sfx.cheer(); sfx.fanfare(); crowdSound(1); confetti.burst(new THREE.Vector3(FINISH + 3, 0, laneZ(4)), 9, 5); if (venue.fireworks) venue.fireworks.on = true; }
  else { bannerWord(ORD[place - 1].toUpperCase(), place <= 3 ? '' : 'bad'); place <= 3 ? sfx.cheer() : sfx.aww(); crowdSound(0.5); }
  me.fox.face(place === 1 ? 'happy' : place <= 3 ? 'happy' : 'sad');
  // remember
  const s = save(), st = STAGES[stageIdx];
  s.races = (s.races || 0) + 1;
  s.best = s.best || {};
  const time = me.finishT * CLOCK;
  const prev = s.best[st.id];
  const rec = !prev || place < prev.place || (place === prev.place && time < prev.time);
  if (rec) s.best[st.id] = { place, time: +time.toFixed(2) };
  s.unlocked = Math.max(s.unlocked || 0, place === 1 ? Math.min(STAGES.length - 1, stageIdx + 1) : 0);
  if (place === 1 && stageIdx === STAGES.length - 1) s.champion = true;
  Players.save();
  setTimeout(() => { if (state === 'done') showResults(rec); }, 3600);
}

function showResults(record) {
  setPhase('results');
  show('strip', false); show('speed', false);
  $('profileBtn').classList.remove('hidden');
  // the rivals that have not finished yet get a time from where they are
  for (const r of rivals) if (!r.finishT) r.finishT = raceT + (100 - r.pos) / Math.max(0.8, r.k * pace());
  const order = all.slice().sort((a, b) => a.finishT - b.finishT);
  const place = order.indexOf(me) + 1, st = STAGES[stageIdx];
  const nextSt = STAGES[stageIdx + 1];
  const win = place === 1;
  $('endTitle').textContent = win ? (stageIdx === STAGES.length - 1 ? 'OLYMPIC CHAMPION!' : 'You won!') : place <= 3 ? `${ORD[place - 1]} place!` : 'Keep training!';
  $('endMedal').textContent = MEDAL[place - 1] || '🏃';
  $('endTime').innerHTML = `<b>${(me.finishT * CLOCK).toFixed(2)}</b><span> s</span>${record ? '<em>NEW BEST!</em>' : ''}`;
  $('podium').innerHTML = order.map((r, i) => `<li class="${r.me ? 'me' : ''}"><span class="pl">${i + 1}</span><i style="background:${DOT[all.indexOf(r)]}"></i><b>${esc(r.name)}</b><span class="tm">${(r.finishT * CLOCK).toFixed(2)} s</span></li>`).join('');
  const tot = stats.right + stats.wrong;
  $('endStats').innerHTML = `<span>✓ <b>${stats.right}</b> / ${tot} right</span><span>⚡ <b>${stats.fast}</b> lightning answers</span>`;
  let msg = '';
  if (win && nextSt) msg = `<b>${esc(nextSt.icon)} ${esc(nextSt.name)}</b> is open!`;
  else if (win) msg = 'You won the Foxino Olympics final! 🏆';
  else if (stats.wrong === 0 && tot > 0) msg = 'All answers right — now answer <b>faster</b> to run faster!';
  else msg = 'Answer right <b>and fast</b> to win.' + (nextSt ? ` Win to open <b>${esc(nextSt.name)}</b>.` : '');
  $('endMsg').innerHTML = msg;
  const mi = stats.missed.slice(0, 6);
  $('missed').classList.toggle('hidden', !mi.length);
  $('missedList').innerHTML = mi.map((q) => `<li>${esc(q.full)}</li>`).join('');
  $('nextBtn').classList.toggle('hidden', !(win && nextSt));
  $('nextBtn').textContent = nextSt ? `NEXT: ${nextSt.name.toUpperCase()}` : '';
  show('end', true);
  quiz.hide();
}

function goMenu() {
  raceId++; quiz.hide();
  show('end', false); show('strip', false); show('speed', false); show('clockBox', false);
  $('profileBtn').classList.remove('hidden');
  resetRunners();
  setPhase('menu'); camSnap = true;
  renderStart();
  show('start', true);
  crowdSound(0.15);
}

// ---------- the start screen ----------
function renderStart() {
  const s = save(), un = s.unlocked || 0;
  $('stages').innerHTML = STAGES.map((st, i) => {
    const b = (s.best || {})[st.id], locked = i > un;
    return `<button type="button" class="stage s-${st.id}${i === stageIdx ? ' on' : ''}${locked ? ' locked' : ''}" data-i="${i}" ${locked ? 'aria-disabled="true"' : ''}>
      <span class="sicon">${locked ? '🔒' : st.icon}</span><b>${esc(st.name)}</b>
      <small>${locked ? 'Win the race before' : b ? `${MEDAL[b.place - 1] || ORD[b.place - 1]} · best ${b.time.toFixed(2)} s` : esc(i === 3 ? 'The final' : 'New race')}</small></button>`;
  }).join('');
  const p = prefs();
  document.querySelectorAll('#levelSeg button').forEach((b) => b.classList.toggle('on', +b.dataset.lv === p.level));
  paintPack();
  $('champ').classList.toggle('hidden', !s.champion);
}
async function paintPack() {
  const p = prefs();
  const sum = p.packs.length ? await packSummary(p.packs).catch(() => null) : null;
  $('packBtn').innerHTML = sum
    ? `<span class="lv">${esc(sum.level)}</span><span><b>${esc(sum.title)}</b><small>${esc(sum.sub)}</small></span><span class="chg">CHANGE</span>`
    : `<span class="lv">${p.level >= 2 ? 'A2' : 'A1'}</span><span><b>Foxino mix</b><small>Words, gaps and replies · Czech help</small></span><span class="chg">TOPICS</span>`;
}
$('stages').addEventListener('click', (e) => {
  const b = e.target.closest('.stage'); if (!b) return;
  if (b.classList.contains('locked')) { sfx.wrong(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
  unlock(); sfx.pick();
  const i = +b.dataset.i; if (i !== stageIdx) { setStage(i); camSnap = true; }
  renderStart();
});
$('levelSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; prefs().level = +b.dataset.lv; Players.save(); sfx.pick(); renderStart(); });
$('packBtn').addEventListener('click', async () => {
  const p = prefs();
  const ids = await choosePacks(p.packs).catch(() => null);
  if (ids) { p.packs = ids; Players.save(); paintPack(); }
});
$('playBtn').addEventListener('click', startRace);
$('againBtn').addEventListener('click', startRace);
$('menuBtn').addEventListener('click', goMenu);
$('nextBtn').addEventListener('click', () => { setStage(stageIdx + 1); startRace(); });
mountProfile($('profileBtn'), () => { const s = save(); if (stageIdx > (s.unlocked || 0)) setStage(s.unlocked || 0); renderStart(); });
$('muteBtn').classList.toggle('muted', isMuted());
$('muteBtn').addEventListener('click', () => { setMuted(!isMuted()); $('muteBtn').classList.toggle('muted', isMuted()); });
$('leaveBtn').addEventListener('click', () => {
  if (state !== 'menu' && state !== 'results') { goMenu(); return; }
  // opened from the Foxino Olympics page: back there; inside the fugio.co library: ask it to close the game
  let hub = false; try { hub = sessionStorage.getItem('olympics-hub') === '1'; } catch (e) {}
  if (hub || window.parent === window) location.href = '/olympics/'; else window.parent.postMessage({ fugio: 'leave' }, '*');
});
addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    if (!$('start').classList.contains('hidden') && !document.querySelector('.pf-sheet')) { e.preventDefault(); startRace(); }
    else if (!$('end').classList.contains('hidden')) { e.preventDefault(); startRace(); }
  }
});

// ---------- the loop ----------
let last = performance.now(), t = 0, slowFrames = 0;
function resize() {
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', () => { resize(); camSnap = true; });
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(0.05, (now - last) / 1000); last = now;
  // too slow: lower the resolution
  if (real > 0.04 && !document.hidden) {
    if (++slowFrames > 60) { if (pr > 1) { pr = Math.max(1, pr - 0.25); resize(); } slowFrames = 0; }
  } else slowFrames = Math.max(0, slowFrames - 1);
  const dt = real * timeScale;
  t += dt; stT += dt;
  if (state === 'intro' && stT > 2.4) { setPhase('marks'); bannerWord('On your marks…', 'small'); crowdSound(0.12); }
  else if (state === 'marks' && stT > 1.4) { setPhase('set'); bannerWord('Set…', 'small'); }
  else if (state === 'set' && stT > 0.9 + (raceId % 3) * 0.25) {
    setPhase('race'); raceT = 0; bannerWord('GO!'); sfx.gun(); crowdSound(0.45); me.v = 0;
    quizLoop(raceId);
  }
  if (state === 'race' || state === 'done' || state === 'results') stepRace(dt);
  animRunners(dt, t);
  hud();
  camTarget(real);
  venue.update(dt, t, camera.position.x);
  confetti.update(dt);
  renderer.render(scene, camera);
}

// ---------- poster mode (?poster=sprint|olympics): a still for the library poster, no UI ----------
let posterKind = '';
function posterMode(kind) {
  posterKind = kind;
  setStage(3);
  document.body.classList.add('poster');
  const lead = kind === 'olympics' ? 0 : 0;
  [[me, 60, 2.2], [rivals[0], 59.2, 4.0], [rivals[1], 58.5, 0.9], [rivals[2], 57.6, 5.3]].forEach(([r, pos, ph]) => { r.pos = pos + lead; r.posterPh = ph; r.v = 0; });
  me.fox.tailAmp = 0.2;
  if (kind === 'olympics') {
    // a gold medal on a purple ribbon
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc21c, metalness: 0.8, roughness: 0.25 }), rib = new THREE.MeshStandardMaterial({ color: 0x5b2bb0, roughness: 0.7 });
    const m = new THREE.Group(); m.position.set(0, 0.13, 0.15); me.fox.J.spine.add(m);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 24), gold); disc.rotation.x = Math.PI / 2; m.add(disc);
    for (const sx of [1, -1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.2, 0.01), rib); r.position.set(sx * 0.04, 0.1, -0.01); r.rotation.z = sx * 0.35; m.add(r); }
  }
  setPhase('poster'); camSnap = true;
  if (venue.fireworks) { for (let i = 0; i < 7; i++) venue.fireworks.burst(me.pos * VIS - 30 + i * 12, 26 + (i % 3) * 7, -45 - (i % 2) * 20); for (let k = 0; k < 40; k++) venue.fireworks.update(0.02, 0); }
  const el = document.createElement('div'); el.id = 'posterTitle';
  el.innerHTML = kind === 'olympics' ? '<span class="pk">FOXINO</span><span class="pt">OLYMPICS</span><span class="ps">SPRINT · STREETBALL · SKY DIVE · PENALTY</span>' : '<span class="pk">FOXINO OLYMPICS</span><span class="pt">100 M</span><span class="pt2">SPRINT</span>';
  document.body.appendChild(el);
  if (kind === 'sprint') {
    const b = document.createElement('div'); b.id = 'posterBubbles';
    b.innerHTML = ['fast', 'faster', 'fastest'].map((w, i) => `<span style="--i:${i}">${w}</span>`).join('');
    document.body.appendChild(b);
  }
}

// ---------- start ----------
const S0 = save();
setStage(params.has('stage') ? clamp(+params.get('stage'), 0, 3) : Math.min(S0.unlocked || 0, STAGES.length - 1));
renderStart();
setPhase('menu');
if (params.get('poster')) posterMode(params.get('poster'));
resize();
requestAnimationFrame((n) => { last = n; frame(n); });
$('loadFill').style.width = '100%';
setTimeout(() => { $('loading').classList.add('done'); if (state === 'menu') show('start', true); }, 250);

// ---------- test hooks ----------
window.SP = {
  ready: true,
  state: () => ({ state, stT, raceT, stage: stageIdx, me: { pos: me.pos, v: me.v, place: me.place, finishT: me.finishT }, rivals: rivals.map((r) => ({ name: r.name, pos: r.pos, place: r.place, finishT: r.finishT })), qn, stats: { ...stats, missed: stats.missed.length }, quizOpen: quiz.open }),
  start: (i) => { if (i !== undefined) setStage(i); startRace(); },
  answer: (right = true, frac = 0.1) => quiz.cheat(right, frac),
  rightIndex: () => (quiz.question ? quiz.question.opts.findIndex((o) => o.right) : -1),
  stage: (i) => { setStage(i); renderStart(); },
  timeScale: (k) => { timeScale = k; },
  menu: goMenu,
  unlockAll: () => { save().unlocked = 3; Players.save(); renderStart(); },
};
