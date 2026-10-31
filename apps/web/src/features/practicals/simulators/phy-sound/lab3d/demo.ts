import { emptyPhySoundState, labBetween, labRandom, phyFit, SONO_CARD_LOAD, SOUND_CARD, soundDefaultLen, sonoResonance, tubeHalfWidth, tubeResonance, type PhySoundState, type PhySoundVariant, type SoundTask } from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import type { Spot } from '../../../lab3d-kit/store';
import type { Sound } from '../actions';
import { TUBE_ORDER } from './guide';
import { makeOps, type Ops } from './lab-actions';
import { NEEDED, PLACEABLE } from './scene-state';
import { bridgeX, JAR, SONO, SPOT, tubeTopY } from './views';

/**
 * Mr Bayo's demonstration: the whole practical with his own tube or wire (a
 * demo seed that is never the student's) and his own in-memory state, through
 * the same operations as the student's bench and on the same physics. Tube:
 * the 512 Hz fork step by step — struck on the pad, the tube raised slowly
 * through the loud region and back to the loudest point (his ear is a little
 * off, as anyone's is), read at eye level — then its second resonance, the
 * other forks in one go, l against 1/f, v and e. Sonometer: the load, the
 * rider, the first fork with the bridge moved slowly until the rider jumps,
 * the others in one go, f against 1/l, v and μ.
 */

export const DEMO_SEED = 29;
export const demoSeed = (studentSeed: number) => (studentSeed === DEMO_SEED ? DEMO_SEED + 1 : DEMO_SEED);
export const demoEmpty = (task: SoundTask): PhySoundState => ({ ...emptyPhySoundState(), task, len: soundDefaultLen(task), log: [{ t: 0, a: `task:${task}` }] });

export interface DemoCtx {
  o: Sound;
  v: PhySoundVariant;
  s: () => PhySoundState;
  ops: () => Ops;
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const r1 = (x: number) => Math.round(x * 10) / 10;
const bench = (spot: Spot) => ({ mode: 'bench' as const, spot });
const READ = { mode: 'read' as const, spot: null, eye: 0 };

/** Where Mr Bayo judges the loudest sound for fork f (resonance n): the true peak, off by a little (his ear). */
const judged = (v: PhySoundVariant, f: number, n: 1 | 2) => {
  const r = labRandom(v.seed, `demo-ear-${f}-${n}`);
  return r1(tubeResonance(v, f, n) + labBetween(r, -0.3, 0.3, 2) * tubeHalfWidth(v, f, n));
};
/** Move the bridge out slowly (0.1 cm at a time) from just short of resonance until the rider is thrown off. */
function sweepBridge(c: DemoCtx, f: number) {
  const L = sonoResonance(c.v, f, c.s().load);
  for (let l = r1(L - 2); l <= L + 2 && c.s().rider; l = r1(l + 0.1)) c.o.setLen(l);
}

function fillTube(c: DemoCtx) {
  c.o.update((x) => ({
    ...x,
    tube: x.rows.map((f) => {
      const rs = x.readings.filter((r) => r.fork === f).sort((a, b) => a.len - b.len);
      return { f: String(f), inv: (1 / f).toPrecision(3), l1: rs[0] ? r1(rs[0].len).toFixed(1) : '', l2: rs[1] ? r1(rs[1].len).toFixed(1) : '' };
    }),
  }));
}
function fillSono(c: DemoCtx) {
  c.o.update((x) => ({
    ...x,
    sono: x.rows.map((f) => {
      const r = x.readings.filter((y) => y.fork === f).pop();
      const l = r ? r1(r.len) : 0;
      return { f: String(f), l: r ? (l / 100).toFixed(3) : '', inv: r ? (100 / l).toPrecision(3) : '' };
    }),
  }));
}
function drawLine(c: DemoCtx, sono: boolean) {
  const st = c.s();
  const pts = sono ? st.sono.map((r) => ({ x: Number(r.inv), y: Number(r.f) })) : st.tube.map((r) => ({ x: Number(r.inv), y: Number(r.l1) }));
  const fit = phyFit(pts);
  if (!fit) return;
  const xs = pts.map((p) => p.x);
  const a = Math.min(...xs);
  const b = Math.max(...xs);
  c.o.update((x) => ({ ...x, line: { x1: a, y1: Number((fit.intercept + fit.slope * a).toFixed(4)), x2: b, y2: Number((fit.intercept + fit.slope * b).toFixed(4)) } }));
}
const lineOf = (s: PhySoundState) => {
  const l = s.line;
  if (!l) return null;
  const slope = (l.y2 - l.y1) / (l.x2 - l.x1);
  return { slope, intercept: l.y1 - slope * l.x1 };
};
const collectBeats = (task: SoundTask): Beat[] => NEEDED[task].map((id, n) => ({ at: 300 + n * 350, run: (c: DemoCtx) => c.o.note(`collect:${id}`) }));
const setupBeats = (task: SoundTask): Beat[] => PLACEABLE[task].map((id, n): Beat => ({ at: 500 + n * 1400, run: (c) => c.ops().place(id) }));

function tubeScript(precautions: string[]): DemoStep[] {
  const prec = precautions.slice(0, 2).join(' ');
  const AT_BENCH = bench({ target: [0.35, 0.15, 0.4], dist: 2.2, pitch: 0.28 });
  const AT_TUBE = bench({ target: [JAR.x, tubeTopY(16) - 0.1, JAR.z], dist: 0.9, pitch: 0.12 });
  const AT_MOUTH = bench({ target: [JAR.x - 0.05, tubeTopY(16), JAR.z], dist: 0.55, pitch: 0.22 });
  const AT_FORKS = bench({ target: [(SPOT.forks[0] + SPOT.pad[0]) / 2, 0.03, SPOT.forks[2]], dist: 0.6, pitch: 0.75 });
  /** Raise the tube 1 cm at a time from 8 cm to past the peak, then back to where it sounded loudest. */
  const scan = (from: number, to: number, f: number, n: 1 | 2, at0: number, gap: number): Beat[] => {
    const out: Beat[] = [];
    let k = 0;
    for (let l = from; l <= to; l += 1, k++) out.push({ at: at0 + k * gap, run: (c) => c.o.setLen(l) });
    out.push({ at: at0 + (k + 1) * gap, run: (c) => c.o.setLen(judged(c.v, f, n) + 0.8) });
    out.push({ at: at0 + (k + 3) * gap, run: (c) => c.o.setLen(judged(c.v, f, n)) });
    return out;
  };
  return [
    { id: 'intro', title: 'The apparatus', say: () => 'Today: the speed of sound with a resonance tube. A tube standing in a tall jar of water, a clamp and stand, a metre rule, a set of tuning forks and a rubber pad to strike them on.', ms: 7500, view: AT_BENCH, point: 'forks', beats: collectBeats('TUBE') },
    { id: 'setup', title: 'Setting up', say: () => 'The jar of water stands on the floor; the tube goes into it, clamped vertical so I can slide it up and down. The rule runs along the tube with 0 at the open top: it reads l, the length of air above the water.', ms: 8000, view: AT_TUBE, point: 'tube', beats: [...setupBeats('TUBE'), { at: 4800, run: (c) => c.o.setLen(8) }] },
    {
      id: 'strike',
      title: 'Strike the 512 Hz fork',
      say: () => 'I take the 512 hertz fork and strike it on the rubber pad — never on the bench — then hold it horizontally just above the mouth, not touching the tube.',
      ms: 6500,
      view: AT_FORKS,
      point: 'pad',
      beats: [
        { at: 400, run: (c) => c.ops().pickFork(512) },
        { at: 3200, run: (c) => c.ops().strike('pad') },
      ],
    },
    {
      id: 'scan',
      title: 'Find the loudest sound',
      say: () => 'Starting with a short column I raise the tube slowly. Listen, and watch the loudness meter: the sound swells, peaks, and fades again. I go a little past it, then back to where it was loudest. That is the first resonance.',
      ms: 11000,
      view: AT_MOUTH,
      point: 'tube',
      beats: [{ at: 200, run: (c) => c.ops().strike('pad') }, ...scan(9, 21, 512, 1, 600, 520)],
    },
    {
      id: 'read',
      title: 'Read l₁',
      say: (c) => `I read the rule at the water surface with my eye level with it: l one is ${c.s().len.toFixed(1)} centimetres.`,
      ms: 6500,
      view: READ,
      panel: 'notebook',
      beats: [{ at: 3000, run: (c) => (c.ops().take(), fillTube(c)) }],
    },
    {
      id: 'second',
      title: 'The second resonance',
      say: () => 'Raising the tube further, the sound grows loud again at about three times the length: the second resonance, at three quarters of a wavelength. l two minus l one is half a wavelength.',
      ms: 10000,
      view: bench({ target: [JAR.x, tubeTopY(40), JAR.z], dist: 1.2, pitch: 0.12 }),
      point: 'tube',
      beats: [{ at: 200, run: (c) => c.ops().strike('pad') }, ...scan(40, 54, 512, 2, 500, 420), { at: 8800, run: (c) => (c.ops().take(), fillTube(c)) }],
    },
    {
      id: 'others',
      title: 'The other forks',
      say: () => 'Then the same with the 384, 320, 288 and 256 hertz forks, each time from a short column upwards: the lower the frequency, the longer the tube at resonance.',
      ms: 9500,
      view: AT_TUBE,
      point: 'tube',
      beats: TUBE_ORDER.slice(1).flatMap((f, n): Beat[] => [
        { at: 300 + n * 2000, run: (c) => (c.ops().pickFork(f), c.o.setLen(8), c.ops().strike('pad')) },
        { at: 900 + n * 2000, run: (c) => c.o.setLen(judged(c.v, f, 1)) },
        { at: 1500 + n * 2000, run: (c) => (c.ops().take(), fillTube(c)) },
      ]),
    },
    { id: 'graph', title: 'l against 1/f', say: () => 'I work out one over f for each fork and plot l against one over f. The points lie on a straight line — and it cuts the l-axis just below zero.', ms: 8000, view: AT_BENCH, point: 'book', panel: 'notebook', beats: [{ at: 1200, run: (c) => (fillTube(c), drawLine(c, false)) }] },
    {
      id: 'v',
      title: 'v and e',
      say: (c) => {
        const L = lineOf(c.s());
        return L ? `l plus e equals v over 4f, so the slope is v over four: about ${(L.slope / 100).toFixed(1)} metres per second, and v is four times that, ${((4 * L.slope) / 100).toFixed(0)} metres per second. The intercept is minus e: e is about ${(-L.intercept).toFixed(1)} centimetres. ${prec ? `Precautions: ${prec}` : ''}` : 'From the slope and the intercept: v and e.';
      },
      ms: 11000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 1500,
          run: (c) =>
            c.o.update((x) => {
              const L = lineOf(x);
              if (!L) return x;
              const s3 = Number(L.slope.toPrecision(3));
              const r512 = x.tube[x.rows.indexOf(512)];
              const v2 = r512 && r512.l2 ? ((2 * 512 * (Number(r512.l2) - Number(r512.l1))) / 100).toFixed(0) : '';
              return {
                ...x,
                answers: { ...x.answers, slope: { value: String(s3), unit: 'cm/s' }, v: { value: ((4 * s3) / 100).toFixed(0), unit: 'm/s' }, intercept: { value: L.intercept.toFixed(2), unit: 'cm' }, e: { value: (-L.intercept).toFixed(2), unit: 'cm' }, v2: { value: v2, unit: 'm/s' } },
                written: { precautions: prec || 'I struck the fork on a rubber pad and held it just above the mouth. I approached resonance from short lengths and checked by moving the tube back and forth.' },
              };
            }),
        },
      ],
    },
  ];
}

function sonoScript(precautions: string[]): DemoStep[] {
  const prec = precautions.slice(0, 2).join(' ');
  const AT_BENCH = bench({ target: [0.45, 0.1, 0.05], dist: 2.0, pitch: 0.4 });
  const AT_SONO = bench({ target: [(SONO.x0 + SONO.x1) / 2, 0.1, SONO.z], dist: 1.25, pitch: 0.45 });
  const AT_RIDER = bench({ target: [(SONO.fixed + bridgeX(50)) / 2 + 0.1, 0.12, SONO.z], dist: 0.75, pitch: 0.4 });
  const AT_LOAD = bench({ target: [SONO.pulleyX, -0.1, SONO.z], dist: 0.9, pitch: 0.12 });
  const forks = SOUND_CARD.SONO;
  return [
    { id: 'intro', title: 'The apparatus', say: () => 'Today: the sonometer. A wire stretched over two bridges on a hollow box, its tension from a hanger of masses over a pulley; a set of tuning forks, a rubber pad and small paper riders.', ms: 7500, view: AT_BENCH, point: 'forks', beats: collectBeats('SONO') },
    { id: 'setup', title: 'Setting up', say: () => 'The sonometer lies along the bench with its pulley just past the end, so the load hangs freely.', ms: 5500, view: AT_SONO, point: 'sonometer', beats: setupBeats('SONO') },
    {
      id: 'load',
      title: `The tension: ${SONO_CARD_LOAD} kg`,
      say: () => `I hang the 1 kilogram hanger and add the masses gently, one at a time, up to ${SONO_CARD_LOAD} kilograms — my face well back from the wire. The tension stays the same for every fork.`,
      ms: 8000,
      view: AT_LOAD,
      point: 'hanger',
      beats: [{ at: 400, run: (c) => c.ops().hangHanger() }, ...Array.from({ length: Math.round((SONO_CARD_LOAD - 1) / 0.5) }, (_, n): Beat => ({ at: 1400 + n * 800, run: (c) => c.ops().addMass() }))],
    },
    {
      id: 'rider',
      title: 'Rider and fork',
      say: () => 'A small paper rider goes on the middle of the wire. I take the 256 hertz fork, strike it on the rubber pad and press its stem on the box.',
      ms: 7000,
      view: AT_RIDER,
      point: 'rider',
      beats: [
        { at: 300, run: (c) => c.o.setLen(30) },
        { at: 900, run: (c) => c.ops().pickFork(256) },
        { at: 2200, run: (c) => c.ops().placeRider() },
        { at: 5000, run: (c) => c.ops().strike('pad') },
      ],
    },
    {
      id: 'sweep',
      title: 'Move the bridge until the rider jumps',
      say: () => 'Starting with the bridges close together I move the bridge out slowly. The wire starts to hum and the rider trembles — and at resonance it is thrown off. The wire’s natural frequency now equals the fork’s.',
      ms: 11000,
      view: AT_RIDER,
      point: 'bridge',
      beats: [
        ...Array.from({ length: 14 }, (_, k): Beat => ({ at: 300 + k * 350, run: (c) => c.s().rider && c.o.setLen(r1(sonoResonance(c.v, 256, c.s().load) - 7 + k * 0.5)) })),
        { at: 5600, run: (c) => c.ops().strike('pad') },
        { at: 6000, run: (c) => sweepBridge(c, 256) },
      ],
    },
    { id: 'take', title: 'Take the length', say: (c) => `I read the scale at the moving bridge: ${c.s().len.toFixed(1)} centimetres, that is ${(c.s().len / 100).toFixed(3)} metres between the bridges.`, ms: 6500, view: bench({ target: [bridgeX(50), 0.1, SONO.z], dist: 0.55, pitch: 0.7 }), panel: 'notebook', point: 'bridge', beats: [{ at: 2500, run: (c) => (c.ops().take(), fillSono(c)) }] },
    {
      id: 'others',
      title: 'The other forks',
      say: () => 'Then the same for 320, 384 and 512 hertz, at the same tension: the higher the frequency, the shorter the length. f times l stays the same.',
      ms: 9000,
      view: AT_SONO,
      point: 'sonometer',
      beats: forks.slice(1).flatMap((f, n): Beat[] => [
        { at: 300 + n * 2400, run: (c) => (c.ops().pickFork(f), c.ops().placeRider(), c.ops().strike('pad')) },
        { at: 1000 + n * 2400, run: (c) => sweepBridge(c, f) },
        { at: 1700 + n * 2400, run: (c) => (c.ops().take(), fillSono(c)) },
      ]),
    },
    { id: 'graph', title: 'f against 1/l', say: () => 'I work out one over l for each length and plot f against one over l: a straight line through the origin.', ms: 7500, view: AT_BENCH, point: 'book', panel: 'notebook', beats: [{ at: 1200, run: (c) => (fillSono(c), drawLine(c, true)) }] },
    {
      id: 'mu',
      title: 'v and μ',
      say: (c) => {
        const L = lineOf(c.s());
        return L ? `f equals v over 2l, so the slope is v over two: ${L.slope.toFixed(0)} hertz metres, and v is ${(2 * L.slope).toFixed(0)} metres per second. The tension is M g: 4 kilograms times 9.8, 39.2 newtons. So mu, T over v squared, is about ${(39.2 / (2 * L.slope) ** 2).toExponential(1)} kilograms per metre. ${prec ? `Precautions: ${prec}` : ''}` : 'From the slope: v, then μ = T/v².';
      },
      ms: 12000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 1500,
          run: (c) =>
            c.o.update((x) => {
              const L = lineOf(x);
              if (!L) return x;
              const s3 = Number(L.slope.toPrecision(3));
              const vv = 2 * s3;
              const T = SONO_CARD_LOAD * 9.8;
              return {
                ...x,
                answers: { ...x.answers, slope: { value: String(s3), unit: 'Hz m' }, v: { value: vv.toFixed(0), unit: 'm/s' }, T: { value: T.toFixed(1), unit: 'N' }, mu: { value: (T / Number(vv.toFixed(0)) ** 2).toPrecision(3), unit: 'kg/m' } },
                written: { precautions: prec || 'The tension was kept constant. The rider was placed at the middle of the vibrating length and the fork’s stem pressed on the box.' },
              };
            }),
        },
      ],
    },
  ];
}

export function demoScript(task: SoundTask, precautions: string[]): DemoStep[] {
  return task === 'SONO' ? sonoScript(precautions) : tubeScript(precautions);
}

/** The worked calculation shown with the last step (demonstration values). */
export function demoCalculation(s: PhySoundState): string[] {
  const L = lineOf(s);
  if (!L || !s.answers.slope.value) return [];
  if (s.task === 'SONO')
    return [
      `Slope = Δf ÷ Δ(1/l) = ${s.answers.slope.value} Hz m.`,
      `v = 2 × slope = ${s.answers.v.value} m s⁻¹.`,
      `T = Mg = ${SONO_CARD_LOAD} × 9.8 = ${s.answers.T.value} N; μ = T/v² = ${s.answers.T.value} ÷ ${s.answers.v.value}² = ${s.answers.mu.value} kg m⁻¹.`,
    ];
  return [
    `Slope = Δl ÷ Δ(1/f) = ${s.answers.slope.value} cm s⁻¹ = ${(Number(s.answers.slope.value) / 100).toFixed(1)} m s⁻¹.`,
    `v = 4 × slope = ${s.answers.v.value} m s⁻¹.`,
    `Intercept on the l-axis = ${s.answers.intercept.value} cm, so e = ${s.answers.e.value} cm.`,
    ...(s.answers.v2.value ? [`Two resonances: v = 2f(l₂ − l₁) = ${s.answers.v2.value} m s⁻¹.`] : []),
  ];
}
export { makeOps };
