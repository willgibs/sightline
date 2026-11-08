import { describe, expect, it } from 'vitest';
import { defaultTuning } from '../src/config/tuning';
import { flightAt, timeAtRange, velocityAt, vec3, type Flight, type Vec3 } from '../src/sim/ballistics/trajectory';
import { holdBetween, landing, markDirection, solveAim, unit, zeroFor, type Ballistic } from '../src/sim/ballistics/aim';
import { glint } from '../src/sim/ballistics/glint';
import { crackAt } from '../src/sim/ballistics/crack';

/**
 * The one ballistic function (sim/ballistics/trajectory.ts) against physics it stands for:
 * a numerical integration of its own model on slopes and in wind, and a G7 point-mass
 * solver's published load. Then the aiming built on it: the zero, and holds that put a
 * shot on a point whatever the range, wind, slope or target's walk.
 */

const B = defaultTuning.ballistics;
const G = defaultTuning.sim.gravity;
const MATCH: Ballistic = { v0: B.loads.match.muzzleSpeed, k: B.loads.match.drag, g: G, wx: 0, wz: 0 };
const SUBSONIC: Ballistic = { v0: B.loads.subsonic.muzzleSpeed, k: B.loads.subsonic.drag, g: G, wx: 0, wz: 0 };

/** The model the closed form solves, integrated with RK4 at 0.05 ms: a = −k·|v − W|·(v − W) − g. */
function integrate(f: Flight, T: number): Vec3 {
  let p = [f.x, f.y, f.z];
  let v = [f.dx * f.v0, f.dy * f.v0, f.dz * f.v0];
  const acc = (vv: number[]): number[] => {
    const rx = vv[0]! - f.wx;
    const ry = vv[1]!;
    const rz = vv[2]! - f.wz;
    const s = Math.sqrt(rx * rx + ry * ry + rz * rz);
    return [-f.k * s * rx, -f.k * s * ry - f.g, -f.k * s * rz];
  };
  const h0 = 5e-5;
  for (let t = 0; t < T - 1e-12; ) {
    const h = Math.min(h0, T - t);
    const k1v = acc(v);
    const k1p = v;
    const v2 = v.map((x, i) => x + 0.5 * h * k1v[i]!);
    const k2v = acc(v2);
    const v3 = v.map((x, i) => x + 0.5 * h * k2v[i]!);
    const k3v = acc(v3);
    const v4 = v.map((x, i) => x + h * k3v[i]!);
    const k4v = acc(v4);
    p = p.map((x, i) => x + (h / 6) * (k1p[i]! + 2 * v2[i]! + 2 * v3[i]! + v4[i]!));
    v = v.map((x, i) => x + (h / 6) * (k1v[i]! + 2 * k2v[i]! + 2 * k3v[i]! + k4v[i]!));
    t += h;
  }
  return { x: p[0]!, y: p[1]!, z: p[2]! };
}

function flight(b: Ballistic, pitchDeg: number, yawDeg = 0): Flight {
  const p = (pitchDeg * Math.PI) / 180;
  const y = (yawDeg * Math.PI) / 180;
  return { x: 0, y: 0, z: 0, dx: -Math.sin(y) * Math.cos(p), dy: Math.sin(p), dz: -Math.cos(y) * Math.cos(p), t: 0, v0: b.v0, k: b.k, g: b.g, wx: b.wx, wz: b.wz };
}

describe('the ballistic function', () => {
  it('matches a numerical integration of its own model across the line of aim, on slopes to ±30°', () => {
    for (const b of [MATCH, SUBSONIC]) {
      for (const deg of [-30, -15, 0, 10, 20, 30]) {
        const f = flight(b, deg, 37);
        // Out to about 500 m for the match load, 300 m for the subsonic.
        for (const T of b === MATCH ? [0.13, 0.41, 0.74] : [0.32, 0.65, 0.99]) {
          const exact = integrate(f, T);
          const p = flightAt(f, T, vec3());
          const e = { x: p.x - exact.x, y: p.y - exact.y, z: p.z - exact.z };
          // Across the bore (what the reticle sees), and along it (only timing).
          const along = e.x * f.dx + e.y * f.dy + e.z * f.dz;
          const across = Math.sqrt(Math.max(0, e.x * e.x + e.y * e.y + e.z * e.z - along * along));
          // Gravity along the bore changes the speed, and so the drag, a little: 0.53 mm at
          // ±30° and 500 m for the match load, 1.1 mm at 300 m for the slower subsonic.
          expect(across, `${b.v0} m/s at ${deg}°, ${T} s`).toBeLessThan(b === MATCH ? 0.0006 : 0.0012);
          expect(Math.abs(along) / Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z), `${b.v0} m/s at ${deg}°, ${T} s: along`).toBeLessThan(0.002);
        }
      }
    }
  });

  it('drifts in a crosswind by the lag rule, as the integration does', () => {
    for (const w of [2, 4, 8]) {
      const b = { ...MATCH, wx: w, wz: 0 };
      // Shooting north into a wind from the west.
      const f = flight(b, 0);
      for (const T of [0.41, 0.74]) {
        const exact = integrate(f, T);
        const p = flightAt(f, T, vec3());
        expect(Math.abs(p.x - exact.x), `${w} m/s, ${T} s`).toBeLessThan(0.005);
      }
    }
  });

  it('reproduces a G7 point-mass solver for the match load: drop within 1 cm and drift within 0.5 cm to 500 m', () => {
    // docs/research/scripts/ballistics.py, ICAO sea level, 100 m zero, the bullet leaving
    // from the line of sight; drift in a 4 m/s full-value crosswind. Range m: [time s, drop cm, drift cm].
    const G7: Record<number, [number, number, number]> = {
      100: [0.126, 0, 1.8],
      200: [0.2617, -16.78, 7.45],
      300: [0.4081, -53.05, 17.41],
      400: [0.5664, -112.09, 32.15],
      500: [0.7383, -197.85, 52.28],
    };
    const zero = zeroFor(100, MATCH, B.maxFlight);
    const eye = vec3();
    const north = { x: 0, y: 0, z: -1 };
    for (const [range, [time, drop, drift]] of Object.entries(G7).map(([r, v]) => [Number(r), v] as const)) {
      const still = vec3();
      const t = landing(eye, north, north, range, zero, MATCH, B.maxFlight, still);
      const windy = vec3();
      landing(eye, north, north, range, zero, { ...MATCH, wx: 4 }, B.maxFlight, windy);
      expect(Math.abs(t - time), `${range} m: time`).toBeLessThan(0.004);
      expect(Math.abs(still.y * 100 - drop), `${range} m: drop ${still.y * 100} cm`).toBeLessThan(1);
      expect(Math.abs(windy.x * 100 - drift), `${range} m: drift ${windy.x * 100} cm`).toBeLessThan(0.5);
    }
  });

  it('flies about half a second to 400 m, as the design doc has it, and stays supersonic to 500 m', () => {
    const f = flight(MATCH, 0);
    const t400 = timeAtRange(f, 0, 0, -1, 400, B.maxFlight);
    expect(t400).toBeGreaterThan(0.5);
    expect(t400).toBeLessThan(0.6);
    const v = velocityAt(f, timeAtRange(f, 0, 0, -1, 500, B.maxFlight), vec3());
    expect(Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)).toBeGreaterThan(1.6 * 340);
  });

  it('is exact at any instant: no state but the launch, and the same answer however it is asked', () => {
    const f = { ...flight(MATCH, 3, 120), t: 12.25, x: 5, y: 2, z: -7, wx: 1.5, wz: -2 };
    const a = flightAt(f, 12.25 + 0.3, vec3());
    const b = flightAt({ ...f }, 12.25 + 0.3, vec3());
    expect(a).toEqual(b);
    // Before launch it is still at the muzzle.
    expect(flightAt(f, 10, vec3())).toEqual({ x: 5, y: 2, z: -7 });
    // Velocity is the derivative of position.
    const h = 1e-5;
    const p0 = flightAt(f, 12.6 - h, vec3());
    const p1 = flightAt(f, 12.6 + h, vec3());
    const v = velocityAt(f, 12.6, vec3());
    expect(Math.abs((p1.x - p0.x) / (2 * h) - v.x)).toBeLessThan(1e-3);
    expect(Math.abs((p1.y - p0.y) / (2 * h) - v.y)).toBeLessThan(1e-3);
    expect(Math.abs((p1.z - p0.z) / (2 * h) - v.z)).toBeLessThan(1e-3);
  });
});

describe('aiming', () => {
  it('zeroes: the bullet comes back to the line of sight at every step of the dial', () => {
    const north = { x: 0, y: 0, z: -1 };
    for (const b of [MATCH, SUBSONIC]) {
      for (let range = B.rifle.zero.min; range <= B.rifle.zero.max; range += B.rifle.zero.step) {
        if (b === SUBSONIC && range > 300) continue;
        const zero = zeroFor(range, b, B.maxFlight);
        const p = vec3();
        landing(vec3(), north, north, range, zero, b, B.maxFlight, p);
        expect(Math.abs(p.y), `${b.v0} m/s zeroed at ${range} m`).toBeLessThan(1e-6);
        expect(zero.elevation).toBeGreaterThan(0);
      }
    }
  });

  it('finds the hold that puts a shot on any point: loads, 100–500 m, winds from any side, slopes, walkers', () => {
    let worst = 0;
    for (const b of [MATCH, SUBSONIC]) {
      for (const range of [100, 250, 300, 420, 500]) {
        if (b === SUBSONIC && range > 300) continue;
        for (const slopeDeg of [-30, -12, 0, 15, 30]) {
          for (const [windSpeed, windDeg] of [[0, 0], [4, 90], [8, 225], [6, 0]] as const) {
            const wb = { ...b, wx: windSpeed * Math.sin((windDeg * Math.PI) / 180), wz: -windSpeed * Math.cos((windDeg * Math.PI) / 180) };
            for (const walk of [0, 1.35]) {
              const zero = zeroFor(100, b, B.maxFlight);
              const eye = { x: 3, y: 10, z: -4 };
              const s = (slopeDeg * Math.PI) / 180;
              const heading = 0.6;
              const target = { x: eye.x - Math.sin(heading) * Math.cos(s) * range, y: eye.y + Math.sin(s) * range, z: eye.z - Math.cos(heading) * Math.cos(s) * range };
              const sight = vec3();
              const tof = solveAim(eye, target, walk, 0, zero, wb, B.maxFlight, sight);
              // Fly that aim and see where it lands when it gets to the walker.
              const there = { x: target.x + walk * tof, y: target.y, z: target.z };
              const d = unit(there.x - eye.x, there.y - eye.y, there.z - eye.z, vec3());
              const r = Math.sqrt((there.x - eye.x) ** 2 + (there.y - eye.y) ** 2 + (there.z - eye.z) ** 2);
              const p = vec3();
              landing(eye, sight, d, r, zero, wb, B.maxFlight, p);
              const miss = Math.sqrt((p.x - there.x) ** 2 + (p.y - there.y) ** 2 + (p.z - there.z) ** 2);
              worst = Math.max(worst, miss);
            }
          }
        }
      }
    }
    expect(worst).toBeLessThan(1e-4);
  });

  it('names holds in the reticle\'s mils, and reads a mark back as the direction it points', () => {
    const zero = zeroFor(100, MATCH, B.maxFlight);
    const eye = vec3();
    const target = { x: 0, y: 0, z: -300 };
    const sight = vec3();
    solveAim(eye, target, 0, 0, zero, MATCH, B.maxFlight, sight);
    const hold = holdBetween(sight, unit(target.x, target.y, target.z, vec3()), { up: 0, right: 0 });
    // About 1.8 mil of drop at 300 m from a 100 m zero, the bullet leaving from the eye.
    expect(hold.up).toBeGreaterThan(1.7);
    expect(hold.up).toBeLessThan(1.85);
    expect(Math.abs(hold.right)).toBeLessThan(1e-9);
    // The mark the hold names points at the target.
    const back = markDirection(sight, -hold.up, -hold.right, vec3());
    expect(Math.abs(back.y - 0)).toBeLessThan(1e-12);
    expect(Math.abs(back.x)).toBeLessThan(1e-12);
  });
});

describe('lens glint', () => {
  const G = defaultTuning.ballistics.glint;
  const n = (x: number, y: number, z: number): Vec3 => {
    const l = Math.hypot(x, y, z);
    return { x: x / l, y: y / l, z: z / l };
  };

  it('flashes at whoever the scope points at when it faces the sun, and not with the sun behind', () => {
    const sun = n(0, 0.4, -1);
    const aim = n(0, 0.1, -1);
    const ahead = aim;
    expect(glint(aim, 1, sun, ahead, G)).toBeGreaterThan(0.9);
    // Turned away from the sun, or the sun behind the shooter: nothing.
    expect(glint(n(1, 0, 0), 1, sun, n(1, 0, 0), G)).toBe(0);
    expect(glint(aim, 1, n(0, 0.4, 1), ahead, G)).toBe(0);
    // Only as far as the optic is up, and never at night.
    expect(glint(aim, 0.5, sun, ahead, G)).toBeCloseTo(glint(aim, 1, sun, ahead, G) / 2, 12);
    expect(glint(aim, 0, sun, ahead, G)).toBe(0);
    expect(glint(aim, 1, n(0, -0.1, -1), ahead, G)).toBe(0);
  });

  it('eases from full to nothing between its two angles', () => {
    const sun = n(0, 0, -1);
    let last = 1;
    for (let deg = 0; deg <= 40; deg += 2) {
      const r = (deg * Math.PI) / 180;
      const g = glint(n(Math.sin(r), 0, -Math.cos(r)), 1, sun, n(0, 0, -1), G);
      expect(g).toBeLessThanOrEqual(last + 1e-12);
      last = g;
    }
    expect(last).toBe(0);
  });
});

describe('the crack', () => {
  it('comes from d·tan μ upstream of the nearest pass, for a straight supersonic path', () => {
    // Constant speed, no gravity: Mach 2 in 343 m/s air.
    const f: Flight = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1, t: 5, v0: 686, k: 0, g: 0, wx: 0, wz: 0 };
    const out = { t: 0, emitted: 0, x: 0, y: 0, z: 0, distance: 0 };
    const c = crackAt(f, 7, { x: 10, y: 0, z: -200 }, 343, out)!;
    expect(c).not.toBeNull();
    // tan μ = 1/√(M² − 1) = 1/√3: 5.77 m upstream of z = −200.
    expect(c.z).toBeCloseTo(-200 + 10 / Math.sqrt(3), 4);
    expect(c.emitted).toBeCloseTo(5 + (200 - 10 / Math.sqrt(3)) / 686, 6);
    expect(c.t).toBeCloseTo(c.emitted + Math.hypot(10, 10 / Math.sqrt(3)) / 343, 6);
  });

  it('is never heard behind the muzzle, from a subsonic load, or past where the bullet stopped short', () => {
    const fast: Flight = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1, t: 0, v0: 823, k: 0.000756, g: 9.81, wx: 0, wz: 0 };
    const out = { t: 0, emitted: 0, x: 0, y: 0, z: 0, distance: 0 };
    expect(crackAt(fast, 2, { x: 0, y: 0, z: 20 }, 340, out)).toBeNull();
    expect(crackAt({ ...fast, v0: 320, k: 0.00037 }, 2, { x: 5, y: 0, z: -100 }, 340, out)).toBeNull();
    // A guard 10 m off the path at 300 m hears it from about 6 m before the bullet's nearest pass.
    const c = crackAt(fast, 2, { x: 10, y: 0, z: -300 }, 340, out)!;
    expect(c.z).toBeGreaterThan(-300);
    expect(c.z).toBeLessThan(-292);
  });
});
