import { EN_C, emptyChemEnergeticsState, enExtreme, solyAppearTime, solyFromPoints, type ChemEnergeticsState, type ChemEnergeticsVariant, type EnergeticsTask } from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import type { Spot } from '../../../lab3d-kit/store';
import { curveRun, halfDegree, openRun, openTube, type Clock, type Energetics } from '../actions';
import { makeOps, type Ops } from './lab-actions';
import { NEEDED, PLACEABLE } from './scene-state';
import { BATH, BURETTE, CUP, SPOT, TUBE_RACK } from './views';

/**
 * Mrs Ada's demonstration: the whole practical on her own seed (never the
 * student's) and her own in-memory state, through the same operations as the
 * student's bench and on the same thermochemistry. Waits run on the demo's
 * own clock (jumped forward), and every reading is taken at an exact clock
 * moment, so jumping between steps replays the same results.
 */

export const DEMO_SEED = 7;
export const demoSeed = (studentSeed: number) => (studentSeed === DEMO_SEED ? DEMO_SEED + 1 : DEMO_SEED);
export const demoEmpty = (task: EnergeticsTask): ChemEnergeticsState => ({ ...emptyChemEnergeticsState(), task, log: [{ t: 0, a: `task:${task}` }] });

export interface DemoCtx {
  o: Energetics;
  v: ChemEnergeticsVariant;
  s: () => ChemEnergeticsState;
  ops: () => Ops;
  clock: Clock;
  /** Clock time (ms) the mixture was made / the tube came out of the bath. */
  marks: { mix: number; cool: number };
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const bench = (spot: Spot) => ({ mode: 'bench' as const, spot });
const AT_BENCH = bench({ target: [0, 0.14, 0.02], dist: 1.35, pitch: 0.5 });
const AT_CUP = bench({ target: [CUP[0], 0.09, CUP[2]], dist: 0.55, pitch: 0.35 });
const AT_THERMO = bench({ target: [CUP[0], 0.17, CUP[2]], dist: 0.4, pitch: 0.12 });
const AT_CYL = bench({ target: [(SPOT.cylA[0] + SPOT.cylB[0]) / 2, 0.1, CUP[2]], dist: 0.75, pitch: 0.35 });
const AT_TUBE = bench({ target: [TUBE_RACK[0], 0.13, TUBE_RACK[2]], dist: 0.42, pitch: 0.2 });
const AT_BATH = bench({ target: [(BATH[0] + TUBE_RACK[0]) / 2, 0.1, BATH[2]], dist: 0.75, pitch: 0.4 });
const AT_BURETTE = bench({ target: [BURETTE[0], 0.3, BURETTE[2]], dist: 0.9, pitch: 0.2 });

/** Jump the demo clock forward to `at`. */
const reach = (c: DemoCtx, at: number) => {
  const d = at - c.clock.now();
  if (d > 0) c.clock.shift(d);
};
const row = (c: DemoCtx, patch: Partial<ChemEnergeticsState['table'][number]>) =>
  c.o.update((x) => {
    const i = x.runs.length - 1;
    return i < 0 ? x : { ...x, table: x.table.map((r, k) => (k === i ? { ...r, ...patch } : r)) };
  });

/** Thermometer into a liquid, wait for it to settle, read it and write it down. */
function readInto(c: DemoCtx, where: 'A' | 'B', key: 'a' | 'b') {
  c.ops().thermoTo(where);
  reach(c, c.clock.now() + 8000);
  c.o.readStart();
  row(c, { [key]: halfDegree(c.o.thermoNow()) });
}
/** Mix, cover and stir at once, then watch until just past the extreme: write it down and finish. */
function mixAndWatch(c: DemoCtx, phase: 'mix' | 'peak') {
  if (phase === 'mix') {
    c.marks.mix = c.clock.now();
    c.o.mix(c.marks.mix);
    c.o.stir(c.marks.mix + 800);
    c.o.lid(c.marks.mix + 2000);
    reach(c, c.marks.mix + 2000);
    return;
  }
  const r = openRun(c.s());
  if (!r) return;
  const ex = enExtreme(c.v, curveRun({ ...r.r, stirAt: 0.8, lidAt: 2 }, r.i));
  reach(c, c.marks.mix + (ex.at + 1) * 1000);
  row(c, { extreme: halfDegree(c.o.thermoNow()) });
  reach(c, c.marks.mix + (ex.at + 40) * 1000);
  c.o.finish();
}
function cupAnswers(c: DemoCtx, task: 'NEUT' | 'SOLN') {
  c.o.update((x) => {
    const table = x.table.map((r, i) => {
      const run = x.runs[i];
      if (!run) return r;
      if (task === 'NEUT') {
        const initial = ((Number(r.a) + Number(r.b)) / 2).toFixed(1);
        return { ...r, initial, dT: (Number(r.extreme) - Number(initial)).toFixed(1) };
      }
      return { ...r, dT: Math.abs(Number(r.extreme) - Number(r.a)).toFixed(1) };
    });
    const main = task === 'NEUT' ? table[table.length - 1] : table[x.runs.findIndex((r) => r.kind === 'SALT')];
    const dT = Math.abs(Number(main?.dT ?? 0));
    const q = (task === 'NEUT' ? 100 : 50) * EN_C * dT;
    return {
      ...x,
      table,
      nature: task === 'NEUT' ? { main: 'EXO', other: null } : { main: 'ENDO', other: 'EXO' },
      answers: { ...x.answers, q: { value: q.toFixed(0), unit: 'J' }, n: { value: '0.0500', unit: 'mol' }, dH: { value: `${task === 'NEUT' ? '−' : '+'}${(q / 0.05 / 1000).toFixed(1)}`, unit: 'kJ mol⁻¹' } },
    };
  });
}

function neutScript(_v: ChemEnergeticsVariant, precautions: string[]): DemoStep[] {
  const prec = precautions.slice(0, 2).join(' ');
  return [
    { id: 'welcome', title: 'Welcome', say: () => 'Watch me measure the heat of neutralisation of hydrochloric acid by sodium hydroxide. These are my own solutions — then it is your turn.', ms: 6000, view: AT_BENCH, beats: [] },
    { id: 'safety', title: 'Safety first', say: () => 'Goggles on: both the acid and the alkali are corrosive. A splash on the skin is rinsed off at once with plenty of water.', ms: 5000, view: AT_BENCH, beats: [{ at: 800, run: (c) => c.ops().wear('goggles') }] },
    { id: 'apparatus', title: 'The apparatus', say: () => 'A polystyrene cup with a lid, a beaker to hold it, two 50 cm³ measuring cylinders, a thermometer and a stopwatch.', ms: 6500, view: AT_BENCH, beats: NEEDED.NEUT.map((id, n) => ({ at: 300 + n * 450, run: (c: DemoCtx) => c.o.note(`collect:${id}`) })) },
    { id: 'cup', title: 'The calorimeter', say: () => 'I use the polystyrene cup — a poor conductor, so very little heat escapes — and stand it in the beaker so it cannot tip over.', ms: 6000, view: AT_CUP, point: 'cup', beats: [{ at: 800, run: (c) => c.ops().vessel('CUP') }, { at: 2500, run: (c) => c.ops().support() }] },
    { id: 'acid', title: '50.0 cm³ of acid', say: () => '50.0 cm³ of the acid goes into the cup. I put the thermometer in, wait for it to settle, and read it at eye level to the nearest half degree.', ms: 8000, view: AT_THERMO, point: 'thermometer', panel: 'notebook', beats: [{ at: 600, run: (c) => c.ops().measureA(50) }, { at: 3500, run: (c) => readInto(c, 'A', 'a') }] },
    { id: 'alkali', title: '50.0 cm³ of alkali', say: () => 'Now 50.0 cm³ of the alkali in the other cylinder, and its temperature too. They are not quite the same, so the initial temperature is their mean.', ms: 8000, view: AT_CYL, point: 'cylinder2', panel: 'notebook', beats: [{ at: 600, run: (c) => c.ops().measureB(50) }, { at: 3500, run: (c) => readInto(c, 'B', 'b') }] },
    { id: 'mix', title: 'Pour, cover, stir', say: () => 'I pour the alkali in quickly, put the lid on at once and stir with the thermometer. Watch the red column climb.', ms: 7000, view: AT_THERMO, point: 'thermometer', beats: [{ at: 1200, run: (c) => mixAndWatch(c, 'mix') }] },
    { id: 'peak', title: 'The highest temperature', say: () => 'It rises quickly, stops… and then very slowly starts to fall as the cup loses heat to the room. I record the highest temperature it reached, then finish.', ms: 8000, view: AT_THERMO, point: 'thermometer', panel: 'notebook', beats: [{ at: 2500, run: (c) => mixAndWatch(c, 'peak') }] },
    {
      id: 'calc',
      title: 'Q, moles and ΔH',
      say: (c) => {
        const a = c.s().answers;
        return `ΔT is the highest minus the initial temperature. Q = 100 × 4.2 × ΔT = ${a.q.value} joules. 50.0 cm³ of 1.00 mol dm⁻³ acid gives 0.0500 mol of water, so ΔH = −Q ÷ n = ${a.dH.value} kJ per mole — negative, because heat was given out. ${prec ? `Precautions: ${prec}` : ''}`;
      },
      ms: 13000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [{ at: 600, run: (c) => (cupAnswers(c, 'NEUT'), c.o.update((x) => ({ ...x, written: { explanation: 'Every strong acid–strong base reaction is H⁺ + OH⁻ → H₂O, so the heat per mole of water is the same, about −57 kJ mol⁻¹. Ethanoic acid is weak: some of the energy released is used to ionise it, so ΔH is less negative.', precautions: prec || 'A polystyrene cup with a lid was used to reduce heat loss. The mixture was stirred and the highest temperature recorded.' } }))) }],
    },
    { id: 'done', title: 'Your turn!', say: () => `That is the whole practical. Accepted value: about −57 kJ mol⁻¹ — mine came out a little less because some heat still escapes. Now try it yourself.`, ms: 5000, view: AT_BENCH, beats: [] },
  ];
}

function solnScript(_v: ChemEnergeticsVariant, precautions: string[]): DemoStep[] {
  const prec = precautions.slice(0, 2).join(' ');
  const run = (kind: 'SALT' | 'NAOH'): Beat[] => [
    { at: 300, run: (c) => c.ops().measureA(50) },
    { at: 1500, run: (c) => readInto(c, 'A', 'a') },
    { at: 3000, run: (c) => c.ops().weigh(kind, kind === 'NAOH' ? 2 : 4) },
    { at: 4500, run: (c) => mixAndWatch(c, 'mix') },
  ];
  return [
    { id: 'welcome', title: 'Welcome', say: () => 'Watch me measure the heat of solution of ammonium trioxonitrate(V), and compare it with sodium hydroxide. My own chemicals — then your turn.', ms: 6000, view: AT_BENCH, beats: [] },
    { id: 'safety', title: 'Safety first', say: () => 'Goggles on. NaOH pellets are corrosive: only the spatula touches them. NH₄NO₃ is an oxidiser: no flames near it.', ms: 5500, view: AT_BENCH, beats: [{ at: 800, run: (c) => c.ops().wear('goggles') }] },
    { id: 'apparatus', title: 'The apparatus', say: () => 'A polystyrene cup in a beaker, a measuring cylinder, a thermometer, a balance, a spatula and a stopwatch.', ms: 6000, view: AT_BENCH, beats: [...NEEDED.SOLN.map((id, n) => ({ at: 300 + n * 400, run: (c: DemoCtx) => c.o.note(`collect:${id}`) })), { at: 3600, run: (c: DemoCtx) => c.ops().vessel('CUP') }, { at: 4300, run: (c: DemoCtx) => c.ops().support() }] },
    { id: 'salt', title: 'Water, then 4.00 g of NH₄NO₃', say: () => '50.0 cm³ of water in the cup; its steady temperature first. Then I weigh 4.00 g of NH₄NO₃, tip it in, cover the cup and stir until it has all dissolved.', ms: 9000, view: AT_CUP, point: 'cup', panel: 'notebook', beats: run('SALT') },
    { id: 'low', title: 'The lowest temperature', say: () => 'The temperature falls as the crystals dissolve — heat is taken from the water. When it stops falling and starts to creep back up, I record the lowest value.', ms: 7500, view: AT_THERMO, point: 'thermometer', panel: 'notebook', beats: [{ at: 2500, run: (c) => mixAndWatch(c, 'peak') }] },
    { id: 'naoh', title: 'The comparison: NaOH', say: () => 'Now fresh water and 2.00 g of NaOH pellets. This time the temperature rises: dissolving NaOH gives out heat.', ms: 9000, view: AT_CUP, point: 'cup', panel: 'notebook', beats: [...run('NAOH'), { at: 7000, run: (c) => mixAndWatch(c, 'peak') }] },
    {
      id: 'calc',
      title: 'Q, moles and ΔH',
      say: (c) => {
        const a = c.s().answers;
        return `For NH₄NO₃: Q = 50.0 × 4.2 × ΔT = ${a.q.value} joules absorbed; 4.00 ÷ 80 = 0.0500 mol; ΔH = +${a.dH.value.replace('+', '')} kJ per mole — positive, endothermic. NaOH dissolving is exothermic. ${prec ? `Precautions: ${prec}` : ''}`;
      },
      ms: 12000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [{ at: 600, run: (c) => (cupAnswers(c, 'SOLN'), c.o.update((x) => ({ ...x, written: { explanation: 'Dissolving NH₄NO₃ absorbs heat from the water, so the temperature falls: endothermic, ΔH positive. Dissolving NaOH releases heat, so the temperature rises: exothermic.', precautions: prec || 'I stirred until all the solid dissolved and read the lowest temperature. The cup was covered.' } }))) }],
    },
    { id: 'done', title: 'Your turn!', say: () => 'That is the whole practical. Now try it yourself — and ask me if anything is unclear.', ms: 4000, view: AT_BENCH, beats: [] },
  ];
}

/** One solubility run: water in, warm until dissolved, out, stir, read the first crystals and write the row. */
function solyRun(c: DemoCtx, vol: number) {
  c.ops().water(vol);
  const t0 = c.clock.now();
  c.o.heatStart('BATH', t0);
  c.o.setStir(true, t0);
  reach(c, t0 + 80_000);
  c.o.tick();
  c.marks.cool = c.clock.now();
  c.o.heatStop(c.marks.cool);
  const T0 = c.o.tubeTemp(c.marks.cool);
  const app = c.o.appearTemp();
  const tApp = solyAppearTime(c.v, T0, app, true);
  if (!Number.isFinite(tApp)) return;
  reach(c, c.marks.cool + (tApp + 0.8) * 1000);
  c.o.tick();
  const value = c.o.tubeThermo();
  c.o.crystalsSeen();
  c.o.update((x) => {
    const i = x.soly.runs.length - 1;
    const w = x.soly.runs[i]!.water;
    return { ...x, solyTable: x.solyTable.map((r, k) => (k === i ? { water: w.toFixed(1), temp: halfDegree(value), sol: ((4 * 100) / w).toFixed(1) } : r)) };
  });
}
function solyScript(v: ChemEnergeticsVariant, precautions: string[]): DemoStep[] {
  const prec = precautions.slice(0, 2).join(' ');
  return [
    { id: 'welcome', title: 'Welcome', say: () => 'Watch me find the solubility curve of potassium trioxonitrate(V). My own tube of KNO₃ — then it is your turn.', ms: 5500, view: AT_BENCH, beats: [] },
    { id: 'safety', title: 'Safety first', say: () => 'Goggles on. The water bath is hot: I lift the boiling tube with the holder, never with my fingers.', ms: 5000, view: AT_BENCH, beats: [{ at: 800, run: (c) => c.ops().wear('goggles') }] },
    { id: 'apparatus', title: 'The apparatus', say: () => 'A boiling tube and rack, a thermometer, a water bath, a burette of distilled water, a balance and a spatula.', ms: 6500, view: AT_BENCH, beats: [...NEEDED.SOLY.map((id, n) => ({ at: 300 + n * 400, run: (c: DemoCtx) => c.o.note(`collect:${id}`) })), ...PLACEABLE.SOLY.map((id, n) => ({ at: 3600 + n * 1000, run: (c: DemoCtx) => c.ops().place(id) }))] },
    { id: 'weigh', title: '4.0 g of KNO₃ and 5.0 cm³ of water', say: () => 'I weigh 4.0 g of KNO₃ into the tube and run in 5.0 cm³ of water from the burette. Most of the solid does not dissolve in the cold.', ms: 7000, view: AT_BURETTE, point: 'burette', beats: [{ at: 800, run: (c) => c.ops().kno3(4) }] },
    {
      id: 'first',
      title: 'Warm, then cool and stir',
      say: () => 'In the water bath, stirring, every crystal dissolves. Then I take the tube out and stir gently with the thermometer as it cools, watching the clear solution closely… there! The first crystals — I read the thermometer at once.',
      ms: 12000,
      view: AT_TUBE,
      point: 'tube',
      panel: 'notebook',
      beats: [{ at: 1500, run: (c) => solyRun(c, 5) }],
    },
    { id: 'more', title: 'More water each time', say: () => 'Then 1.0 cm³ more water, warm to redissolve, cool and read again — 6, 7 and 8 cm³. The more water, the lower the temperature at which crystals appear.', ms: 11000, view: AT_BATH, point: 'bath', panel: 'notebook', beats: [0, 1, 2].map((n) => ({ at: 800 + n * 2800, run: (c: DemoCtx) => solyRun(c, 1) })) },
    {
      id: 'graph',
      title: 'The solubility curve',
      say: () => 'Solubility is 4.0 × 100 ÷ the volume of water, in grams per 100 g of water. I plot it against temperature and draw a smooth curve through the points: it rises more and more steeply.',
      ms: 8500,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [{ at: 2000, run: (c) => c.o.update((x) => ({ ...x, curve: 'SMOOTH' })) }],
    },
    {
      id: 'calc',
      title: 'Reading the curve',
      say: (c) => {
        const a = c.s().answers;
        return `From my curve, ${a.sHi.value} g dissolve in 100 g of water at ${v.tHi} °C and ${a.sLo.value} g at ${v.tLo} °C, so ${a.mass.value} g of crystals come out on cooling. At ${v.tLo} °C that is ${a.molal.value} moles per kilogram of water. ${prec ? `Precautions: ${prec}` : ''}`;
      },
      ms: 12500,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 600,
          run: (c) =>
            c.o.update((x) => {
              const pts = x.solyTable.map((r) => ({ x: Number(r.temp), y: Number(r.sol) }));
              const hi = solyFromPoints(pts, c.v.tHi) ?? 0;
              const lo = solyFromPoints(pts, c.v.tLo) ?? 0;
              const H = Number(hi.toFixed(1));
              const L = Number(lo.toFixed(1));
              return {
                ...x,
                answers: { ...x.answers, sHi: { value: H.toFixed(1), unit: 'g/100 g water' }, sLo: { value: L.toFixed(1), unit: 'g/100 g water' }, mass: { value: (H - L).toFixed(1), unit: 'g' }, molal: { value: ((L * 10) / 101).toFixed(2), unit: 'mol kg⁻¹' } },
                written: { explanation: 'Solubility is the maximum mass of solute that saturates 100 g of solvent at a given temperature. KNO₃ is less soluble at lower temperatures, so as the solution cools it becomes saturated and the excess crystallises out.', precautions: prec || 'I stirred continuously while cooling and recorded the temperature as the crystals first appeared.' },
              };
            }),
        },
      ],
    },
    { id: 'done', title: 'Your turn!', say: () => 'That is the whole practical. Now try it yourself — and ask me if anything is unclear.', ms: 4000, view: AT_BENCH, beats: [] },
  ];
}

export function demoScript(task: EnergeticsTask, v: ChemEnergeticsVariant, precautions: string[]): DemoStep[] {
  return task === 'SOLY' ? solyScript(v, precautions) : task === 'SOLN' ? solnScript(v, precautions) : neutScript(v, precautions);
}

/** The worked calculation shown with the calculation step (demonstration values). */
export function demoCalculation(s: ChemEnergeticsState, v: ChemEnergeticsVariant): string[] {
  const a = s.answers;
  if (s.task === 'SOLY') {
    if (!a.sHi.value) return [];
    return [`Solubility = 4.0 × 100 ÷ water: 5.0 cm³ → 80.0 g per 100 g of water.`, `From the curve: ${a.sHi.value} g at ${v.tHi} °C, ${a.sLo.value} g at ${v.tLo} °C.`, `Deposited = ${a.sHi.value} − ${a.sLo.value} = ${a.mass.value} g.`, `${a.sLo.value} g per 100 g = ${(Number(a.sLo.value) * 10).toFixed(0)} g per kg ÷ 101 = ${a.molal.value} mol kg⁻¹.`];
  }
  if (!a.q.value) return [];
  const t = s.table[s.task === 'SOLN' ? s.runs.findIndex((r) => r.kind === 'SALT') : s.table.length - 1];
  return s.task === 'SOLN'
    ? [`ΔT = ${t?.a} − ${t?.extreme} = ${t?.dT} K.`, `Q = 50.0 × 4.2 × ${t?.dT} = ${a.q.value} J (absorbed).`, `n(NH₄NO₃) = 4.00 ÷ 80 = 0.0500 mol.`, `ΔH = +${a.q.value} ÷ 0.0500 ÷ 1000 = ${a.dH.value} kJ mol⁻¹.`]
    : [`Initial = (${t?.a} + ${t?.b}) ÷ 2 = ${t?.initial} °C; ΔT = ${t?.extreme} − ${t?.initial} = ${t?.dT} K.`, `Q = 100 × 4.2 × ${t?.dT} = ${a.q.value} J.`, `n(H₂O) = 50.0 × 1.00 ÷ 1000 = 0.0500 mol.`, `ΔH = −${a.q.value} ÷ 0.0500 ÷ 1000 = ${a.dH.value} kJ mol⁻¹.`];
}
export { makeOps, openTube };
