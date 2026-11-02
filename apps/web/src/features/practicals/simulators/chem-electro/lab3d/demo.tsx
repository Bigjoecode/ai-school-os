import { CELL_E0, ELEC_RUN, ELEC_STEPS, ELEC_TARGET, cellReading, dispFe, dispPeak, dispProduct, elecCharge, elecCurrent, elecMasses, emptyChemElectroState, rustIndex, woolReading, type ChemElectroState, type ChemElectroVariant, type ElectroTask } from '@aischool/shared';
import { useMemo, useRef, useState } from 'react';
import { useDemoPlayer, type DemoBeat, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { makeClock, useElectro, type Electro } from '../actions';
import { Notebook } from '../notebook';
import { BENCH_IDLE, useBench } from './bench-store';
import { NEEDED } from './scene-state';
import { SPOT } from './views';

/**
 * Mrs Ada's demonstration of the lesson's experiment, step by step, on its own
 * demo seed (never the student's) and its own in-memory state and lab clock
 * (never the attempt's), through the same actions as the student's lab. The
 * slow parts (40 minutes of current, the reaction, a week of rusting) are
 * time-lapsed by jumping the demo clock. Jumping to a step replays the
 * earlier beats instantly from an empty bench.
 */
export const DEMO_SEED = 1;
export const demoSeed = (studentSeed: number) => (studentSeed !== DEMO_SEED ? DEMO_SEED : DEMO_SEED + 1);

export interface DemoCtx {
  x: Electro;
  v: ChemElectroVariant;
  s: () => ChemElectroState;
}
type Beat = DemoBeat<DemoCtx>;
type DemoStep = KitDemoStep<DemoCtx>;

const bench = (p: readonly number[], y: number, dist: number, pitch = 0.35) => ({ mode: 'bench' as const, spot: { target: [p[0]!, y, p[2]!] as [number, number, number], dist, pitch, yaw: 0.1 } });
const AT_BENCH = bench([0, 0, 0], 0.12, 1.15, 0.55);
const AT_CELL = bench(SPOT.voltameter, 0.08, 0.6, 0.35);
const AT_METERS = bench([0.3, 0, -0.05], 0.08, 0.6, 0.35);
const AT_BALANCE = bench(SPOT.balance, 0.05, 0.45, 0.45);
const AT_DANIELL = bench([0, 0, 0.02], 0.1, 0.62, 0.35);
const AT_VOLTS = bench(SPOT.voltmeter, 0.06, 0.45, 0.3);
const AT_BEAKER = bench(SPOT.beaker, 0.08, 0.5, 0.4);
const AT_FUNNEL = bench(SPOT.funnel, 0.12, 0.55, 0.35);
const AT_RACK = bench(SPOT.rack, 0.1, 0.55, 0.25);
const AT_TROUGH = bench(SPOT.trough, 0.17, 0.6, 0.2);

const op = (f: (c: DemoCtx) => unknown): Beat['run'] => (c) => void f(c);
const seq = (start: number, gap: number, fns: ((c: DemoCtx) => unknown)[]): Beat[] => fns.map((f, i) => ({ at: start + i * gap, run: op(f) }));
const setRec = (c: DemoCtx, patch: Partial<ChemElectroState['rec']>) => c.x.update((s) => ({ ...s, rec: { ...s.rec, ...patch } }));
const setAns = (c: DemoCtx, patch: Partial<Record<keyof ChemElectroState['answers'], [string, string]>>) =>
  c.x.update((s) => ({ ...s, answers: { ...s.answers, ...Object.fromEntries(Object.entries(patch).map(([k, [value, unit]]) => [k, { value, unit }])) } }));
const p3 = (x: number) => x.toPrecision(3);
const half = (x: number) => (Math.round(x * 2) / 2).toFixed(1);

/** The rheostat step closest to 0.50 A at run time t. */
function bestStep(v: ChemElectroVariant, t: number): number {
  let best = 0;
  for (let s = 0; s <= ELEC_STEPS; s++) if (Math.abs(elecCurrent(v, s, t) - ELEC_TARGET) < Math.abs(elecCurrent(v, best, t) - ELEC_TARGET)) best = s;
  return best;
}
const setRheo = (c: DemoCtx, t: number) => {
  const want = bestStep(c.v, t);
  const now = c.s().elec.rheo;
  for (let i = 0; i < Math.abs(want - now); i++) c.x.ops.rheostat(want > now ? 1 : -1);
};

function intro(v: ChemElectroVariant): DemoStep[] {
  const collect: Beat[] = NEEDED[v.task].map((id, i) => ({ at: 500 + i * 300, run: (c) => c.x.note(`collect:${id}`) }));
  return [
    { id: 'welcome', title: 'Welcome to the demonstration', say: () => 'Watch me do the whole practical. These are my demonstration materials, not yours — then it is your turn.', ms: 5000, view: AT_BENCH, beats: [] },
    { id: 'safety', title: 'Safety first', say: () => (v.task === 'RUST' ? 'Coat and goggles on. I will boil some water, so I take care not to scald myself.' : 'Coat and goggles on. Copper sulphate is harmful, and propanone is very flammable — no flames near it.'), ms: 4500, view: AT_BENCH, beats: [{ at: 700, run: (c) => c.x.note('safety:coat') }, { at: 1600, run: (c) => c.x.note('safety:goggles') }] },
    { id: 'apparatus', title: 'The apparatus', say: () => 'I collect what I need from the cupboard and set it out on my bench.', ms: 500 + NEEDED[v.task].length * 300 + 1500, view: AT_BENCH, beats: collect },
  ];
}

function elecSteps(): DemoStep[] {
  const hold: Beat[] = Array.from({ length: 8 }, (_, k) => ({
    at: 700 + k * 900,
    run: (c: DemoCtx) => {
      const target = Math.min(ELEC_RUN, (k + 1) * 300);
      c.x.skip(Math.max(0, target - c.x.runSeconds()) * 1000);
      if (target < ELEC_RUN) setRheo(c, target + 150);
    },
  }));
  return [
    { id: 'clean', title: 'Clean, then weigh the plates', say: (c) => { const m = elecMasses(c.v, { ...c.s().elec, sanded: true }); return `Sandpaper takes off the oxide film, then I weigh each plate: the cathode ${m.cath1.toFixed(2)} g, the anode ${m.an1.toFixed(2)} g.`; }, ms: 6500, view: AT_BALANCE, point: 'sandpaper', beats: [{ at: 800, run: (c) => (useBench.setState({ sandUntil: performance.now() + 1200 }), c.x.ops.sandPlates()) }, { at: 2600, run: op((c) => c.x.ops.weighBefore()) }] },
    { id: 'connect', title: 'Cathode to the negative terminal', say: () => 'Into the copper sulphate, apart. The cathode goes to the negative terminal through the key; the anode to positive through the ammeter and rheostat — all in series.', ms: 7000, view: AT_CELL, point: 'voltameter', beats: [{ at: 1500, run: op((c) => c.x.ops.connect('NEG', 'APART')) }] },
    { id: 'switch', title: 'Switch on: 0.50 A', say: () => 'I close the key — the stopwatch starts — and move the rheostat until the ammeter reads 0.50 amperes.', ms: 7000, view: AT_METERS, point: 'rheostat', beats: [{ at: 900, run: op((c) => c.x.ops.closeKey()) }, { at: 2500, run: (c) => setRheo(c, 60) }] },
    { id: 'hold', title: 'Forty minutes at 0.50 A (time-lapse)', say: () => 'As the solution warms its resistance falls and the current creeps up, so every few minutes I nudge the rheostat back to 0.50 A. Pink copper builds up on the cathode; the blue colour does not change.', ms: 9000, view: AT_CELL, point: 'voltameter', beats: hold },
    { id: 'stop', title: 'Stop at 40:00', say: () => 'Forty minutes: 2400 seconds. I open the key.', ms: 4000, view: AT_METERS, point: 'key', beats: [{ at: 800, run: op((c) => c.x.ops.openKey()) }] },
    { id: 'rinse', title: 'Rinse gently, dry, reweigh', say: (c) => { const m = elecMasses(c.v, c.s().elec); return `Out, rinsed gently with water then propanone — never rubbed — and dried in the air. The cathode now weighs ${m.cath2.toFixed(2)} g; the anode ${m.an2.toFixed(2)} g.`; }, ms: 8500, view: AT_BALANCE, point: 'balance', beats: seq(900, 1300, [(c) => c.x.ops.removePlates(), (c) => c.x.ops.rinsePlates('GENTLE'), (c) => c.x.ops.dryPlates('AIR'), (c) => c.x.ops.weighAfter()]) },
    {
      id: 'calc',
      title: 'Faraday’s first law',
      say: (c) => {
        const w = c.s().elec;
        const I = Number((elecCharge(c.v, w) / w.ran).toFixed(2));
        const Q = I * w.ran;
        const m = elecMasses(c.v, w);
        return `Q = It = ${I.toFixed(2)} × ${w.ran} = ${Math.round(Q)} coulombs. Two electrons per copper atom: ${Math.round(Q)} ÷ (2 × 96 500) = ${p3(Q / 193000)} mol, × 63.5 = ${p3((Q * 63.5) / 193000)} g. The cathode gained ${(m.cath2 - m.cath1).toFixed(2)} g and the anode lost ${(m.an1 - m.an2).toFixed(2)} g — the same, within the balance's 0.01 g.`;
      },
      ms: 14000,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 2000,
          run: (c) => {
            const w = c.s().elec;
            const m = elecMasses(c.v, w);
            const I = Number((elecCharge(c.v, w) / w.ran).toFixed(2));
            const Q = I * w.ran;
            setRec(c, { cath1: m.cath1.toFixed(2), cath2: m.cath2.toFixed(2), an1: m.an1.toFixed(2), an2: m.an2.toFixed(2), current: I.toFixed(2), time: String(w.ran) });
            setAns(c, { charge: [String(Math.round(Q)), 'C'], molesCu: [p3(Q / 193000), 'mol'], massCalc: [p3((Q * 63.5) / 193000), 'g'], gain: [(m.cath2 - m.cath1).toFixed(2), 'g'], loss: [(m.an1 - m.an2).toFixed(2), 'g'] });
          },
        },
      ],
    },
  ];
}

function cellSteps(): DemoStep[] {
  const reading = (c: DemoCtx, i: number) => cellReading(c.v, c.s().cell.readings[i]!, i);
  return [
    { id: 'strips', title: 'Clean strips in their own solutions', say: () => 'I clean the zinc and copper strips with sandpaper, then stand zinc in zinc sulphate and copper in copper sulphate.', ms: 6500, view: AT_DANIELL, point: 'strips', beats: seq(900, 1800, [(c) => (useBench.setState({ sandUntil: performance.now() + 1200 }), c.x.ops.sandStrips()), (c) => c.x.ops.placeStrips('RIGHT')]) },
    { id: 'bridge', title: 'The salt bridge', say: () => 'A strip of filter paper soaked in saturated potassium nitrate joins the two beakers. It completes the circuit and keeps both solutions electrically neutral.', ms: 7000, view: AT_DANIELL, point: 'bridge', beats: seq(1000, 2000, [(c) => c.x.ops.soakBridge(), (c) => c.x.ops.setBridge(true)]) },
    { id: 'meter', title: '+ to copper, − to zinc', say: () => 'A high-resistance voltmeter, so almost no current flows: red, positive, to the copper; black, negative, to the zinc.', ms: 6500, view: AT_VOLTS, point: 'voltmeter', beats: seq(1000, 1800, [(c) => c.x.ops.chooseMeter('HIGH'), (c) => c.x.ops.connectLeads('CORRECT')]) },
    { id: 'read', title: 'Read the e.m.f.', say: (c) => (c.s().cell.readings.length ? `It reads ${reading(c, 0).toFixed(2)} volts — close to the 1.10 V from the standard electrode potentials.` : 'I read the voltmeter.'), ms: 6000, view: { mode: 'read' as const, spot: null }, point: 'voltmeter', beats: [{ at: 1200, run: op((c) => c.x.ops.readMeter()) }] },
    { id: 'remove', title: 'Remove the salt bridge', say: () => 'Now I lift the bridge out: the reading falls to zero. The circuit is broken.', ms: 6500, view: AT_DANIELL, point: 'bridge', beats: seq(900, 2200, [(c) => c.x.ops.setBridge(false), (c) => c.x.ops.readMeter()]) },
    { id: 'replace', title: 'Replace it, read again', say: (c) => (c.s().cell.readings.length >= 3 ? `Bridge back: ${reading(c, 2).toFixed(2)} V again — the readings agree.` : 'I put the bridge back and read again.'), ms: 6500, view: AT_VOLTS, point: 'voltmeter', beats: seq(900, 2000, [(c) => c.x.ops.setBridge(true), (c) => c.x.ops.readMeter()]) },
    {
      id: 'calc',
      title: 'E°cell and the difference',
      say: (c) => {
        const e = reading(c, 0);
        return `E°cell = E° of copper minus E° of zinc: 0.34 − (−0.76) = 1.10 V. The difference is (1.10 − ${e.toFixed(2)}) ÷ 1.10 × 100 = ${(((CELL_E0 - e) / CELL_E0) * 100).toFixed(1)} per cent: oxide films, the junction, solutions not exactly 1 mol dm⁻³. Zinc is the negative electrode — it is oxidised.`;
      },
      ms: 14000,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 2000,
          run: (c) => {
            const e = reading(c, 0);
            setRec(c, { emf: e.toFixed(2), emfNo: '0.00', negative: 'zinc' });
            setAns(c, { ecell: ['1.10', 'V'], pctDiff: [(((CELL_E0 - e) / CELL_E0) * 100).toFixed(1), '%'] });
          },
        },
      ],
    },
  ];
}

function dispSteps(v: ChemElectroVariant): DemoStep[] {
  let taps = 0;
  let fe = 0;
  while (fe < 0.53 && taps < 24) fe += v.disp.taps[taps++]!;
  return [
    { id: 'weigh', title: 'About 0.56 g of clean iron filings', say: (c) => `Clean filings, tapped onto the weighing boat: ${dispFe(c.v, { taps }).toFixed(2)} grams.`, ms: 1500 + taps * 500 + 1500, view: AT_BALANCE, point: 'balance', beats: [{ at: 500, run: op((c) => c.x.ops.chooseFilings('CLEAN')) }, ...seq(1200, 500, Array.from({ length: taps }, () => (c: DemoCtx) => c.x.ops.tap()))] },
    { id: 'cuso4', title: '50 cm³ of CuSO₄ — an excess', say: (c) => `50 cm³ of copper sulphate is more than enough for this iron. The thermometer reads ${half(c.v.disp.room)} °C.`, ms: 6000, view: AT_BEAKER, point: 'beaker', beats: seq(900, 1600, [(c) => c.x.ops.measureCuSO4(50), (c) => c.x.ops.thermometerIn()]) },
    { id: 'add', title: 'Add the iron and stir', say: () => 'In goes the iron, and I stir. Watch: the grey filings turn reddish-brown with copper, the blue fades towards pale green, and the beaker warms.', ms: 9000, view: AT_BEAKER, point: 'beaker', beats: [{ at: 800, run: (c) => (useBench.setState({ stirUntil: performance.now() + 4000 }), c.x.ops.addIron('STIR')) }, { at: 2400, run: (c) => c.x.skip(60_000) }, { at: 4200, run: (c) => c.x.skip(60_000) }, { at: 6200, run: (c) => c.x.skip(60_000) }] },
    { id: 'peak', title: 'The highest temperature', say: (c) => `It reached ${half(dispPeak(c.v, c.s().disp, 1e9))} °C and is starting to cool: the reaction is exothermic. Meanwhile I weigh a dry filter paper: ${c.v.disp.paper.toFixed(2)} g.`, ms: 7000, view: AT_BEAKER, point: 'thermometer', beats: [{ at: 800, run: (c) => c.x.skip(240_000) }, { at: 2500, run: op((c) => c.x.ops.weighPaper()) }] },
    { id: 'filter', title: 'Filter, wash, dry', say: () => 'All the iron has reacted. I filter, wash the copper with water and then a little propanone, and let it dry in a warm place — no flames.', ms: 8000, view: AT_FUNNEL, point: 'funnel', beats: seq(900, 1700, [(c) => c.x.ops.filter(), (c) => c.x.ops.washCopper('PROPANONE'), (c) => c.x.ops.dryCopper('AIR')]) },
    { id: 'weigh2', title: 'Weigh the copper', say: (c) => { const t = dispProduct(c.v, c.s().disp).total; return `Paper and copper: ${t.toFixed(2)} g, so the copper is ${(t - c.v.disp.paper).toFixed(2)} g.`; }, ms: 6000, view: AT_BALANCE, point: 'balance', beats: [{ at: 900, run: op((c) => c.x.ops.weighCopper()) }] },
    {
      id: 'calc',
      title: 'Moles and percentage',
      say: (c) => {
        const f = dispFe(c.v, c.s().disp);
        const cu = Number((dispProduct(c.v, c.s().disp).total - c.v.disp.paper).toFixed(2));
        const th = (f / 56) * 63.5;
        return `Moles of iron = ${f.toFixed(2)} ÷ 56 = ${p3(f / 56)}, the same moles of copper: × 63.5 = ${p3(th)} g. I got ${cu.toFixed(2)} g: ${p3((cu / th) * 100)} per cent — a little copper is always lost in filtering.`;
      },
      ms: 13000,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 2000,
          run: (c) => {
            const w = c.s().disp;
            const f = dispFe(c.v, w);
            const tot = dispProduct(c.v, w).total;
            const cu = Number((tot - c.v.disp.paper).toFixed(2));
            const th = (f / 56) * 63.5;
            const t1 = half(c.v.disp.room);
            const t2 = half(dispPeak(c.v, w, w.elapsed ?? 1e9));
            setRec(c, { fe: f.toFixed(2), t1, t2, paper: c.v.disp.paper.toFixed(2), paperCu: tot.toFixed(2), cu: cu.toFixed(2) });
            setAns(c, { molesFe: [p3(f / 56), 'mol'], massCu: [p3(th), 'g'], yield: [p3((cu / th) * 100), '%'], dT: [(Number(t2) - Number(t1)).toFixed(1), '°C'] });
          },
        },
      ],
    },
  ];
}

function rustSteps(): DemoStep[] {
  const DAY = 86_400_000;
  return [
    { id: 'nails', title: 'Clean nails; tubes A and D', say: () => 'Clean nails, rubbed bright with sandpaper. Tube A: tap water — air and water. Tube D: salt water.', ms: 7000, view: AT_RACK, point: 'rack', beats: seq(900, 1500, [(c) => (useBench.setState({ sandUntil: performance.now() + 1200 }), c.x.ops.sandNails()), (c) => c.x.ops.fillTube('A', 'TAP'), (c) => c.x.ops.fillTube('D', 'SALT')]) },
    { id: 'B', title: 'Tube B: boiled water under oil', say: () => 'I boil distilled water to drive out the dissolved air, let it cool a little, pour it over a nail and cover it with a layer of oil, so no air can dissolve back in.', ms: 8000, view: AT_RACK, point: 'tube:B', beats: seq(900, 1800, [(c) => c.x.ops.boilWater(), (c) => c.x.ops.fillTube('B', 'BOILED'), (c) => c.x.ops.oil('B')]) },
    { id: 'C', title: 'Tube C: dry air', say: () => 'Tube C: anhydrous calcium chloride keeps the air dry. A nail above it, and a tight stopper.', ms: 6500, view: AT_RACK, point: 'tube:C', beats: seq(900, 1800, [(c) => c.x.ops.fillTube('C', 'CACL2'), (c) => c.x.ops.stopper('C')]) },
    { id: 'wool', title: 'Iron wool and 50.0 cm³ of air', say: () => 'Moist iron wool pushed into the closed end of the graduated tube, 50.0 cm³ of air, inverted in the trough.', ms: 6000, view: AT_TROUGH, point: 'gradTube', beats: [{ at: 1200, run: op((c) => c.x.ops.setWool('MOIST')) }, { at: 2600, run: (c) => (c.x.ops.level(), c.x.ops.readVolume()) }] },
    { id: 'week', title: 'Leave it a week (time-lapse)', say: () => 'Now we leave everything. Each day I level the water inside and outside the tube and read it: the water rises as the iron uses up the oxygen — fast at first, then it stops.', ms: 11000, view: AT_TROUGH, point: 'gradTube', beats: [{ at: 500, run: op((c) => c.x.ops.startWeek()) }, ...Array.from({ length: 7 }, (_, k) => ({ at: 1500 + k * 1300, run: (c: DemoCtx) => { c.x.skip(DAY); c.x.ops.level(); c.x.ops.readVolume(); } }))] },
    { id: 'look', title: 'After a week', say: (c) => { const w = c.s().rust; const d = c.x.look.day; return `A is rusty and D, in salt water, is ${rustIndex(c.v, w, 'D', d) > rustIndex(c.v, w, 'A', d) ? 'the rustiest' : 'rusty'}. B and C have not rusted: B had no air, C no water. Rusting needs both water and oxygen.`; }, ms: 9000, view: AT_RACK, point: 'rack', beats: [{ at: 800, run: op((c) => c.x.ops.observe()) }] },
    {
      id: 'calc',
      title: 'The percentage of oxygen',
      say: (c) => {
        const w = c.s().rust;
        const last = w.readings.at(-1)!;
        const vf = Math.round(woolReading(c.v, w, last.day, last.levelled) * 2) / 2;
        return `The level stopped at ${vf.toFixed(1)} cm³. Oxygen used = 50.0 − ${vf.toFixed(1)} = ${(50 - vf).toFixed(1)} cm³; ÷ 50.0 × 100 = ${(((50 - vf) / 50) * 100).toFixed(1)} per cent — close to the 21 per cent of oxygen in air.`;
      },
      ms: 12000,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 2000,
          run: (c) => {
            const w = c.s().rust;
            const last = w.readings.at(-1)!;
            const vf = Math.round(woolReading(c.v, w, last.day, last.levelled) * 2) / 2;
            const day = Math.max(...w.observed);
            const yes = (t: 'A' | 'B' | 'C' | 'D') => (rustIndex(c.v, w, t, day) >= 0.05 ? 'yes' : 'no');
            setRec(c, { v0: '50.0', vFinal: vf.toFixed(1), rustA: yes('A'), rustB: yes('B'), rustC: yes('C'), rustD: yes('D'), most: 'D' });
            setAns(c, { o2Vol: [(50 - vf).toFixed(1), 'cm³'], o2Pct: [(((50 - vf) / 50) * 100).toFixed(1), '%'] });
          },
        },
      ],
    },
  ];
}

export function demoScript(v: ChemElectroVariant, precautions: string[]): DemoStep[] {
  const body = v.task === 'ELEC' ? elecSteps() : v.task === 'CELL' ? cellSteps() : v.task === 'DISP' ? dispSteps(v) : rustSteps();
  return [
    ...intro(v),
    ...body,
    { id: 'precautions', title: 'Precautions', say: () => `Precautions I took: ${precautions.slice(0, 3).join(' ')}`, ms: 8000, view: AT_BENCH, beats: [] },
    { id: 'done', title: 'Your turn!', say: () => 'That is the whole practical. Now try it yourself with your own materials — and ask me if anything is unclear.', ms: 4500, view: AT_BENCH, beats: [] },
  ];
}

const demoEmpty = (task: ElectroTask): ChemElectroState => ({ ...emptyChemElectroState(), task });
const noop = () => undefined;

/** The electrochemistry demo: its own seed, clock and in-memory state, played by the kit's demo engine. */
export function useElectroDemo({ studentSeed, task, startedAt, precautions, active, onFinished }: { studentSeed: number; task: ElectroTask; startedAt: string; precautions: string[]; active: boolean; onFinished: () => void }) {
  const seed = useMemo(() => demoSeed(studentSeed), [studentSeed]);
  const clock = useRef(makeClock()).current;
  const [state, setState] = useState<ChemElectroState>(() => demoEmpty(task));
  const x = useElectro({ seed, state, onChange: setState, readOnly: false, startedAt, autoTask: false, clock, variant: undefined });
  const steps = useMemo(() => demoScript(x.v, precautions), [x.v, precautions]);
  const player = useDemoPlayer<DemoCtx>({
    steps,
    ctx: () => ({ x, v: x.v, s: () => x.ref.current }),
    reset: () => {
      useBench.setState(BENCH_IDLE);
      x.ref.current = demoEmpty(task);
      x.resetLive();
      setState(x.ref.current);
    },
    goggles: (c) => c.s().log.some((e) => e.a === 'safety:goggles'),
    active,
    onFinished,
  });
  const panel = (id: string) =>
    id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[60vh] w-[380px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        <Notebook v={x.v} state={state} readOnly update={noop} className="border-0 p-0 shadow-none sm:p-0 [&_input]:h-8 [&_textarea]:hidden" />
      </section>
    ) : null;
  return { player, state, x, panel };
}
