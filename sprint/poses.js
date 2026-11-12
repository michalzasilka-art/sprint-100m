// Sprint poses for the Foxino rig (see olympics/common/foxino.js: +Z is his front, x rotations: legs/arms negative = forward,
// knees positive = bend, spine positive = lean forward).
import { blankPose, POSES } from '../olympics/common/foxino.js';
import { clamp, lerp, smooth } from '../olympics/common/mat.js';

export const SP = {
  // "On your marks" (u = 0) → "Set" (u = 1): hands on the line, front leg bent, back knee near the track
  crouch(u, t = 0) {
    const p = blankPose();
    const b = 0.01 * Math.sin(t * 3);
    p.y = lerp(-0.25, -0.15, u) + b;
    p.hips = [0, 0, 0];
    p.spine = [lerp(1.2, 1.05, u), 0, 0];
    p.neck = [-0.25, 0, 0]; p.head = [lerp(-0.45, -0.55, u), 0, 0];
    p.legL = [lerp(-1.25, -1.05, u), 0, 0.06]; p.kneeL = [lerp(1.95, 1.45, u), 0, 0]; p.ankleL = [-0.35, 0, 0];
    p.legR = [lerp(-0.35, 0.05, u), 0, -0.06]; p.kneeR = [lerp(1.9, 1.15, u), 0, 0]; p.ankleR = [-0.3, 0, 0];
    p.armL = [-1.15, 0, 0.16]; p.armR = [-1.15, 0, -0.16]; p.elbowL = [0, 0, 0]; p.elbowR = [0, 0, 0];
    p.tail = 0.4;
    return p;
  },
  // running: the Penalty Star run with a sprinter's high knees and big arms when fast (k = 0.4 … 1.3)
  run(ph, k = 1) {
    const p = POSES.run(ph, Math.min(1.15, k));
    const s = Math.sin(ph);
    const e = clamp(k - 0.8, 0, 0.6);
    p.armL[0] *= 1 + e; p.armR[0] *= 1 + e;
    p.kneeL[0] += e * 0.6 * Math.max(0, -Math.sin(ph - 1)); p.kneeR[0] += e * 0.6 * Math.max(0, Math.sin(ph - 1));
    p.spine[0] = 0.12 + 0.18 * k;
    p.y -= 0.02 * e;
    // feet: toes point down as a foot pushes off behind him, and lift as it swings through
    const kk = Math.min(1.2, k);
    p.ankleL = [0.1 + (0.6 * Math.max(0, -s) - 0.35 * Math.max(0, s)) * kk, 0, 0];
    p.ankleR = [0.1 + (0.6 * Math.max(0, s) - 0.35 * Math.max(0, -s)) * kk, 0, 0];
    // elbows pump: more bent as the arm comes forward
    p.elbowL = [-1.05 - 0.45 * Math.max(0, -s) * kk, 0, 0];
    p.elbowR = [-1.05 - 0.45 * Math.max(0, s) * kk, 0, 0];
    p.tail = s * 0.6;
    return p;
  },
  // a stumble after a wrong answer (u: 0 → 1): lurch forward, arms out
  stumble(ph, u) {
    const p = SP.run(ph, 0.7);
    const w = Math.sin(Math.PI * clamp(u, 0, 1));
    p.spine[0] += 0.55 * w; p.head[0] -= 0.4 * w;
    p.armL = [lerp(p.armL[0], -1.6, w), 0, lerp(0.2, 1.1, w)]; p.armR = [lerp(p.armR[0], -1.4, w), 0, lerp(-0.2, -1.2, w)];
    p.elbowL = [-0.3, 0, 0]; p.elbowR = [-0.3, 0, 0];
    p.y -= 0.06 * w;
    return p;
  },
  // the dip at the line: chest forward, arms back
  dip(ph, u) {
    const p = SP.run(ph, 1.1);
    const w = smooth(u);
    p.spine[0] = lerp(p.spine[0], 0.75, w); p.head[0] = lerp(p.head[0], -0.5, w);
    p.armL = [lerp(p.armL[0], 0.9, w), 0, 0.3]; p.armR = [lerp(p.armR[0], 0.9, w), 0, -0.3];
    return p;
  },
  // hands on knees, breathing
  tired(t) {
    const p = blankPose();
    const br = Math.sin(t * 4.5);
    p.y = -0.06 + 0.008 * br;
    p.spine = [0.75 + 0.04 * br, 0, 0]; p.neck = [-0.2, 0, 0]; p.head = [-0.35, 0.1 * Math.sin(t * 0.7), 0];
    p.legL = [-0.35, 0, 0.1]; p.kneeL = [0.6, 0, 0]; p.ankleL = [-0.2, 0, 0];
    p.legR = [-0.35, 0, -0.1]; p.kneeR = [0.6, 0, 0]; p.ankleR = [-0.2, 0, 0];
    p.armL = [-0.95, 0, 0.32]; p.armR = [-0.95, 0, -0.32]; p.elbowL = [-0.15, 0, 0]; p.elbowR = [-0.15, 0, 0];
    p.tail = -0.3;
    return p;
  },
  // slowing down after the line (u: 0 → 1 over about a second)
  jog(ph, u) { return SP.run(ph, lerp(0.9, 0.45, clamp(u, 0, 1))); },
};
