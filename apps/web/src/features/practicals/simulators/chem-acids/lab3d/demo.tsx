import { HARD_LABEL, IND_SOLS, PH_CLASS_LABEL, PH_LETTER, PH_SAMPLES, acidBalance, acidChips, emptyChemAcidsState, hardIdeal, indEndpoint, indOpenRun, phClassOf, phReading, zoboNames, type AcidsTask, type ChemAcidsState, type ChemAcidsVariant, type HardSample, type IndIndicator } from '@aischool/shared';
import { useMemo, useRef, useState } from 'react';
import { useDemoPlayer, type DemoBeat, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { makeClock, useAcids, type Acids } from '../actions';
import { Notebook } from '../notebook';
import { BENCH_IDLE, useBench } from './bench-store';
import { NEEDED } from './scene-state';
import { SPOT } from './views';

/**
 * Mrs Ada's demonstration of the lesson's experiment, step by step, on its own
 * demo seed (never the student's) and its own in-memory state and lab clock
 * (never the attempt's), through the same actions as the student's lab. The
 * marble's slow reaction is time-lapsed by jumping the demo clock. Jumping to
 * a step replays the earlier beats instantly from an empty bench.
 */
export const DEMO_SEED = 1;
export const demoSeed = (studentSeed: number) => (studentSeed !== DEMO_SEED ? DEMO_SEED : DEMO_SEED + 1);

export interface DemoCtx {
  x: Acids;
  v: ChemAcidsVariant;
  s: () => ChemAcidsState;
}
type Beat = DemoBeat<DemoCtx>;
type DemoStep = KitDemoStep<DemoCtx>;

const bench = (p: readonly number[], y: number, dist: number, pitch = 0.35) => ({ mode: 'bench' as const, spot: { target: [p[0]!, y, p[2]!] as [number, number, number], dist, pitch, yaw: 0.1 } });
const AT_BENCH = bench([0, 0, 0], 0.12, 1.15, 0.55);
const AT_RACK9 = bench(SPOT.rack9, 0.07, 0.55, 0.3);
const AT_CHART = { mode: 'read' as const, spot: null };
const AT_MORTAR = bench([-0.5, 0, 0.1], 0.08, 0.6, 0.4);
const AT_TUBES10 = bench(SPOT.rack10, 0.07, 0.55, 0.3);
const AT_BURETTE = bench(SPOT.buretteAxis, 0.25, 0.9, 0.15);
const AT_FLASK = bench(SPOT.buretteAxis, 0.1, 0.45, 0.25);
const AT_RACK5 = bench(SPOT.rack5, 0.08, 0.5, 0.3);
const AT_BALANCE = bench(SPOT.balance, 0.07, 0.5, 0.4);
const AT_BOIL = bench(SPOT.boil, 0.14, 0.6, 0.3);

const op = (f: (c: DemoCtx) => unknown): Beat['run'] => (c) => void f(c);
const seq = (start: number, gap: number, fns: ((c: DemoCtx) => unknown)[]): Beat[] => fns.map((f, i) => ({ at: start + i * gap, run: op(f) }));
const setRec = (c: DemoCtx, patch: Record<string, string>) => c.x.update((s) => ({ ...s, rec: { ...s.rec, ...patch } }));
const setAns = (c: DemoCtx, patch: Partial<Record<keyof ChemAcidsState['answers'], [string, string]>>) =>
  c.x.update((s) => ({ ...s, answers: { ...s.answers, ...Object.fromEntries(Object.entries(patch).map(([k, [value, unit]]) => [k, { value, unit }])) } }));
const p3 = (x: number) => Number(x.toPrecision(3)).toString();
const shake = (id: string) => useBench.setState({ shakeUntil: performance.now() + 1100, shakeId: id });

function intro(task: AcidsTask): DemoStep[] {
  const collect: Beat[] = NEEDED[task].map((id, i) => ({ at: 500 + i * 300, run: (c) => c.x.note(`collect:${id}`) }));
  return [
    { id: 'welcome', title: 'Welcome to the demonstration', say: () => 'Watch me do the whole practical. These are my demonstration samples, not yours — then it is your turn.', ms: 5000, view: AT_BENCH, beats: [] },
    { id: 'safety', title: 'Safety first', say: () => (task === 'IND' ? 'Coat and goggles on. Ethanol is flammable, so I only ever warm it in a water bath.' : task === 'ACID' ? 'Coat and goggles on. Acid splashes, and hydrogen pops near a flame — I test only small volumes.' : task === 'HARD' ? 'Coat and goggles on. Boiling water scalds, so I let it cool before pouring.' : 'Coat and goggles on, and I never taste any sample — not even the lime juice.'), ms: 4500, view: AT_BENCH, beats: [{ at: 700, run: (c) => c.x.note('safety:coat') }, { at: 1600, run: (c) => c.x.note('safety:goggles') }] },
    { id: 'apparatus', title: 'The apparatus', say: () => 'I collect what I need from the cupboard and set it out on my bench.', ms: 500 + NEEDED[task].length * 300 + 1500, view: AT_BENCH, beats: collect },
  ];
}

// ------------------------------------------------------------------ PH

function phSteps(): DemoStep[] {
  const groups = [PH_SAMPLES.slice(0, 3), PH_SAMPLES.slice(3, 6), PH_SAMPLES.slice(6, 9)];
  return [
    { id: 'rinse', title: 'Clean tubes, white background', say: () => 'I rinse every tube with distilled water — a trace of soap left in a tube would change the colour — and stand a white tile behind the rack.', ms: 6500, view: AT_RACK9, point: 'washBottle', beats: seq(900, 1800, [(c) => c.x.ops.rinseTubes(), (c) => c.x.ops.tile()]) },
    ...groups.map(
      (g, n): DemoStep => ({
        id: `tests${n}`,
        title: `Samples ${g.map((k) => PH_LETTER[k]).join(', ')}`,
        say: (c) => `About 2 cm³ each, two drops of universal indicator, and a gentle shake. ${g.map((k) => `${PH_LETTER[k]} matches pH ${phReading(c.v, c.s().ph, k)}`).join('; ')}.`,
        ms: 9000,
        view: AT_RACK9,
        point: `tube:${g[0]}`,
        beats: g.flatMap((k, i) => seq(600 + i * 2400, 550, [(c) => c.x.ops.pour(k), (c) => c.x.ops.drops(k, 2), (c) => (shake(`tube:${k}`), c.x.ops.shake(k)), (c) => c.x.ops.compare(k)])),
      }),
    ),
    { id: 'chart', title: 'Against the chart', say: () => 'Held against the chart in daylight: red for the strong acid, orange for the vinegar, green for water, blue for soap and wood ash, violet for the sodium hydroxide.', ms: 7000, view: AT_CHART, point: 'chart', beats: [] },
    {
      id: 'calc',
      title: 'pH from concentration',
      say: (c) => {
        const { cHcl, cNaoh } = c.v.ph;
        const a = phReading(c.v, c.s().ph, 'HCL');
        const b = phReading(c.v, c.s().ph, 'ETH');
        return `Hydrochloric acid is fully ionised, so [H⁺] = ${cHcl} and pH = ${-Math.log10(cHcl)}. For ${cNaoh} sodium hydroxide, pOH = ${-Math.log10(cNaoh)}, so pH = ${14 + Math.log10(cNaoh)}. The ethanoic acid reads pH ${b}: ${10 ** (b - a)} times less H⁺ than A, only about ${p3((10 ** -b / 0.1) * 100)} per cent ionised — a weak acid.`;
      },
      ms: 15000,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 2000,
          run: (c) => {
            const w = c.s().ph;
            const rec: Record<string, string> = {};
            for (const k of PH_SAMPLES) {
              const p = phReading(c.v, w, k);
              rec[`ph${k}`] = String(p);
              rec[`cl${k}`] = PH_CLASS_LABEL[phClassOf(p)];
            }
            setRec(c, rec);
            const a = phReading(c.v, w, 'HCL');
            const b = phReading(c.v, w, 'ETH');
            setAns(c, { hplus: [String(c.v.ph.cHcl), 'mol dm⁻³'], phHcl: [String(-Math.log10(c.v.ph.cHcl)), ''], phNaoh: [String(14 + Math.log10(c.v.ph.cNaoh)), ''], ratio: [String(10 ** (b - a)), ''], ionised: [p3((10 ** -b / 0.1) * 100), '%'] });
          },
        },
      ],
    },
  ];
}

// ------------------------------------------------------------------ IND

/** Run in quickly to about 1 cm³ before the end point, then drop by drop to the first colour change. */
function titrate(c: DemoCtx) {
  const r = indOpenRun(c.s().ind);
  if (!r) return;
  const end = indEndpoint(c.v, r);
  const fast = Math.max(0, Math.floor((end - 1) * 10) / 10);
  if (fast > 0) c.x.ops.addAcid(fast);
  let guard = 0;
  while ((indOpenRun(c.s().ind)?.added ?? 99) < end - 1e-9 && guard++ < 60) c.x.ops.addAcid(0.05);
}
function indRun(n: number, ind: IndIndicator): DemoStep {
  return {
    id: `run${ind}${n}`,
    title: `${ind === 'MO' ? 'Methyl orange' : 'Zobo extract'}: titration ${n}`,
    say: (c) => {
      const r = c.s().ind.runs.filter((q) => q.done && q.ind === ind)[n - 1];
      return r ? `${ind === 'MO' ? 'Yellow to the first orange' : 'Green, through purple, to the first red'}: ${r.start.toFixed(2)} to ${(r.start + r.added).toFixed(2)}, a titre of ${r.added.toFixed(2)} cm³.` : 'Twenty-five cubic centimetres of NaOH, three drops of indicator; I run in the acid fast, then drop by drop, swirling.';
    },
    ms: 8000,
    view: AT_FLASK,
    point: 'flask',
    beats: seq(600, 1400, [(c) => (c.s().ind.burette === null || (c.s().ind.burette ?? 0) > 22 ? c.x.ops.fillBurette() : undefined), (c) => c.x.ops.pipette(), (c) => c.x.ops.indicator(ind, 3), (c) => (shake('flask'), titrate(c)), (c) => c.x.ops.endPoint()]),
  };
}
function indSteps(): DemoStep[] {
  return [
    { id: 'crush', title: 'Extract the colour', say: () => 'I crush a handful of dried zobo calyces with a little warm water from the water bath — no flame near it — and filter. The deep-red filtrate is my indicator.', ms: 8000, view: AT_MORTAR, point: 'mortar', beats: seq(900, 2600, [(c) => (useBench.setState({ crushUntil: performance.now() + 1400 }), c.x.ops.crush('WATER', 'BATH')), (c) => c.x.ops.filterExtract()]) },
    { id: 'tests', title: 'Acid, neutral, alkali', say: (c) => `A few drops in each solution, with universal indicator beside it: ${IND_SOLS.map((k) => `${zoboNames(c.v.ind.pH[k])[0]} at pH ${Math.round(c.v.ind.pH[k])}`).join(', ')}.`, ms: 10000, view: AT_TUBES10, point: 'rack', beats: IND_SOLS.flatMap((k, i) => seq(600 + i * 1500, 600, [(c) => c.x.ops.testExtract(k), (c) => c.x.ops.testUi(k)])) },
    { id: 'setup', title: 'Rinse, then fill', say: () => 'I rinse the burette with the acid and the pipette with the alkali, so nothing is diluted, then fill the burette and read it at eye level.', ms: 7000, view: AT_BURETTE, point: 'burette', beats: seq(800, 1500, [(c) => c.x.ops.rinseBurette(), (c) => c.x.ops.fillBurette(), (c) => c.x.ops.rinsePipette()]) },
    indRun(1, 'MO'),
    indRun(2, 'MO'),
    indRun(1, 'ZOBO'),
    indRun(2, 'ZOBO'),
    {
      id: 'calc',
      title: 'Comparing the titres',
      say: (c) => {
        const t = (ind: IndIndicator) => c.s().ind.runs.filter((q) => q.done && q.ind === ind).map((q) => q.added);
        const mo = t('MO').reduce((a, b) => a + b, 0) / Math.max(1, t('MO').length);
        const z = t('ZOBO').reduce((a, b) => a + b, 0) / Math.max(1, t('ZOBO').length);
        return `Methyl orange: a mean of ${mo.toFixed(2)} cm³; the zobo extract ${z.toFixed(2)} cm³. The difference, ${(z - mo).toFixed(2)}, is ${p3(((z - mo) / mo) * 100)} per cent — so the extract is a good indicator for a strong acid and a strong base.`;
      },
      ms: 14000,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 2000,
          run: (c) => {
            const s = c.s();
            const rec: Record<string, string> = {};
            for (const k of IND_SOLS) {
              rec[`ex${k}`] = zoboNames(c.v.ind.pH[k])[0]!;
              rec[`ui${k}`] = String(Math.round(c.v.ind.pH[k]));
            }
            rec.rangeLo = '4';
            rec.rangeHi = '9';
            const means: Record<IndIndicator, number> = { MO: 0, ZOBO: 0 };
            for (const ind of ['MO', 'ZOBO'] as const) {
              const rs = s.ind.runs.filter((q) => q.done && q.ind === ind).slice(0, 3);
              rs.forEach((r, i) => {
                const p = `${ind === 'MO' ? 'mo' : 'z'}${i + 1}`;
                rec[`${p}i`] = r.start.toFixed(2);
                rec[`${p}f`] = (r.start + r.added).toFixed(2);
                rec[`${p}t`] = r.added.toFixed(2);
              });
              means[ind] = rs.reduce((a, r) => a + r.added, 0) / Math.max(1, rs.length);
            }
            setRec(c, rec);
            setAns(c, { meanMo: [means.MO.toFixed(2), 'cm³'], meanZobo: [means.ZOBO.toFixed(2), 'cm³'], diff: [(means.ZOBO - means.MO).toFixed(2), 'cm³'], pctDiff: [p3(((means.ZOBO - means.MO) / means.MO) * 100), '%'] });
          },
        },
      ],
    },
  ];
}

// ------------------------------------------------------------------ ACID

function acidSteps(): DemoStep[] {
  return [
    { id: 'metals', title: 'Magnesium, zinc, copper', say: () => 'Two cubic centimetres of dilute acid on each metal. Magnesium fizzes fast, zinc more slowly, copper not at all. A burning splint gives a squeaky pop: hydrogen.', ms: 9000, view: AT_RACK5, point: 'tube:MG', beats: seq(700, 1100, [(c) => c.x.ops.tubeAcid('MG'), (c) => c.x.ops.tubeAcid('ZN'), (c) => c.x.ops.tubeAcid('CU'), (c) => (useBench.setState({ popAt: performance.now() }), c.x.ops.gasTest('MG', 'BURNING')), (c) => c.x.ops.gasTest('ZN', 'BURNING'), (c) => c.x.ops.gasTest('CU', 'BURNING')]) },
    { id: 'cuo', title: 'Copper(II) oxide, warmed', say: () => 'Black copper oxide hardly changes in cold acid. Warmed gently, it dissolves to a blue-green solution of copper chloride: a base and an acid make a salt and water.', ms: 7500, view: AT_RACK5, point: 'tube:CUO', beats: seq(800, 2200, [(c) => c.x.ops.tubeAcid('CUO'), (c) => c.x.ops.warm('GENTLE')]) },
    { id: 'marble', title: 'Marble and limewater', say: () => 'Marble chips fizz briskly. The gas turns limewater milky: carbon dioxide.', ms: 6500, view: AT_RACK5, point: 'tube:CACO3', beats: seq(800, 2000, [(c) => c.x.ops.tubeAcid('CACO3'), (c) => c.x.ops.gasTest('CACO3', 'LIME')]) },
    {
      id: 'weigh',
      title: 'About 2 g of marble, excess acid',
      say: (c) => `I zero the balance, then weigh ${acidChips(c.v, c.s().acid).toFixed(2)} g of marble. Fifty cubic centimetres of acid — an excess — go into the flask with a cotton-wool plug, and I weigh them together: ${acidBalance(c.v, c.s().acid, 'flask').toFixed(2)} g.`,
      ms: 9500,
      view: AT_BALANCE,
      point: 'balance',
      beats: [
        { at: 600, run: op((c) => c.x.ops.zero()) },
        {
          at: 1400,
          run: (c) => {
            let g = 0;
            while (acidChips(c.v, c.s().acid) < 1.9 && g++ < 24) c.x.ops.tapChips();
          },
        },
        ...seq(3200, 1200, [(c) => c.x.ops.measureAcid(50), (c) => c.x.ops.plug(), (c) => c.x.ops.weighFlask()]),
      ],
    },
    { id: 'react', title: 'The mass falls', say: () => 'In go the chips and the plug goes back. Carbon dioxide escapes and the balance reading falls — fast at first, then slower. I use time-lapse and weigh again when the fizzing stops.', ms: 10000, view: AT_BALANCE, point: 'acidFlask', beats: [{ at: 700, run: op((c) => c.x.ops.addChips()) }, ...[2200, 3800, 5400, 7000].map((at) => ({ at, run: (c: DemoCtx) => c.x.skip(150_000) })), { at: 8200, run: op((c) => c.x.ops.weighTotal()) }, { at: 9000, run: (c: DemoCtx) => (c.x.skip(60_000), c.x.ops.weighTotal()) }] },
    {
      id: 'calc',
      title: 'Mass of carbon dioxide',
      say: (c) => {
        const a = c.s().acid;
        const m1 = acidBalance(c.v, a, 'flask');
        const m2 = acidBalance(c.v, a, 'chips');
        const m3 = acidBalance(c.v, a, 'total', a.weighings.at(-1) ?? 0);
        const n = m2 / 100;
        return `${m2.toFixed(2)} g of marble is ${p3(n)} mol, which should give ${p3(n * 44)} g of carbon dioxide. The flask lost ${(m1 + m2 - m3).toFixed(2)} g — ${p3(((m1 + m2 - m3) / (n * 44)) * 100)} per cent: a little carbon dioxide stays dissolved.`;
      },
      ms: 13000,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 2000,
          run: (c) => {
            const a = c.s().acid;
            const m1 = acidBalance(c.v, a, 'flask');
            const m2 = acidBalance(c.v, a, 'chips');
            const m3 = acidBalance(c.v, a, 'total', a.weighings.at(-1) ?? 0);
            const n = m2 / 100;
            const lost = Math.round((m1 + m2 - m3) * 100) / 100;
            setRec(c, { gasMG: 'hydrogen', gasZN: 'hydrogen', gasCU: 'none', gasCACO3: 'carbon dioxide', cuo: 'blue-green', m1: m1.toFixed(2), m2: m2.toFixed(2), m3: m3.toFixed(2) });
            setAns(c, { molCaco3: [p3(n), 'mol'], massCo2: [p3(n * 44), 'g'], lost: [lost.toFixed(2), 'g'], pctCo2: [p3((lost / (n * 44)) * 100), '%'] });
          },
        },
      ],
    },
  ];
}

// ------------------------------------------------------------------ HARD

function soapTo(c: DemoCtx, sample: HardSample, boiled: boolean) {
  if ((c.s().hard.burette ?? 0) > 34) c.x.ops.hFill();
  c.x.ops.measure(sample, boiled);
  const n = Math.round(hardIdeal(c.v, sample, boiled) / 0.5);
  for (let i = 0; i < n; i++) c.x.ops.addSoap(0.5, 'SHAKE');
  c.x.ops.watch();
  c.x.ops.finish();
}
function hardSteps(): DemoStep[] {
  const runStep = (id: string, title: string, list: [HardSample, boolean][], say: (c: DemoCtx) => string): DemoStep => ({ id, title, say, ms: 3000 + list.length * 2200, view: AT_FLASK, point: 'flask', beats: list.map(([k, b], i) => ({ at: 800 + i * 2200, run: (c: DemoCtx) => (shake('flask'), soapTo(c, k, b)) })) });
  const vol = (c: DemoCtx, k: HardSample, b: boolean) => c.s().hard.runs.filter((r) => r.done && r.sample === k && r.boiled === b).at(-1)?.added.toFixed(1) ?? '—';
  return [
    { id: 'burette', title: 'The soap burette', say: () => 'I rinse the burette with soap solution, fill it and read it.', ms: 5000, view: AT_BURETTE, point: 'burette', beats: seq(800, 1500, [(c) => c.x.ops.hRinse(), (c) => c.x.ops.hFill()]) },
    runStep('soft', 'Distilled and rain water', [['DIST', false], ['RAIN', false]], (c) => `Fifty cubic centimetres in the flask; soap half a cubic centimetre at a time, stopper and shake. Distilled water lathers almost at once — ${vol(c, 'DIST', false)} cm³, the blank — and rain water nearly as quickly, ${vol(c, 'RAIN', false)} cm³.`),
    runStep('hard', 'Tap water, X and Y', [['TAP', false], ['X', false], ['Y', false]], (c) => `Hard water makes a white scum first. Only when the lather lasts two minutes do I read the burette: tap ${vol(c, 'TAP', false)}, X ${vol(c, 'X', false)}, Y ${vol(c, 'Y', false)} cm³.`),
    { id: 'boil', title: 'Boil for 5 minutes', say: () => 'I boil fifty cubic centimetres of tap water, X and Y for five minutes, let them cool, make them up to fifty with distilled water and filter off the chalk.', ms: 7000, view: AT_BOIL, point: 'boil', beats: seq(900, 1500, [(c) => c.x.ops.boil('TAP', 'FULL'), (c) => c.x.ops.boil('X', 'FULL'), (c) => c.x.ops.boil('Y', 'FULL')]) },
    runStep('after', 'After boiling', [['TAP', true], ['X', true], ['Y', true]], (c) => `Boiled tap water ${vol(c, 'TAP', true)}, X ${vol(c, 'X', true)}, Y ${vol(c, 'Y', true)} cm³. Boiling removed the temporary hardness; what remains is permanent.`),
    {
      id: 'calc',
      title: 'Temporary and permanent',
      say: (c) => {
        const vx = Number(vol(c, 'X', false));
        const bx = Number(vol(c, 'X', true));
        const vd = Number(vol(c, 'DIST', false));
        return `For X: temporary hardness used ${vx.toFixed(1)} − ${bx.toFixed(1)} = ${(vx - bx).toFixed(1)} cm³ of soap; permanent ${bx.toFixed(1)} − ${vd.toFixed(1)} = ${(bx - vd).toFixed(1)}; total ${(vx - vd).toFixed(1)}. So ${p3(((vx - bx) / (vx - vd)) * 100)} per cent of X's hardness is temporary.`;
      },
      ms: 14000,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 2000,
          run: (c) => {
            const rec: Record<string, string> = {};
            for (const r of c.s().hard.runs.filter((q) => q.done)) rec[`${r.boiled ? 'b' : 'v'}${r.sample}`] = r.added.toFixed(1);
            const tot = (k: 'TAP' | 'X' | 'Y') => Number(rec[`v${k}`]);
            rec.hardest = (['TAP', 'X', 'Y'] as const).reduce((a, b) => (tot(b) > tot(a) ? b : a));
            rec.permSample = Number(rec.vX) - Number(rec.bX) < Number(rec.vY) - Number(rec.bY) ? 'X' : 'Y';
            setRec(c, rec);
            const vx = Number(rec.vX);
            const bx = Number(rec.bX);
            const vd = Number(rec.vDIST);
            setAns(c, { tempX: [(vx - bx).toFixed(1), 'cm³'], permX: [(bx - vd).toFixed(1), 'cm³'], totalX: [(vx - vd).toFixed(1), 'cm³'], pctTemp: [p3(((vx - bx) / (vx - vd)) * 100), '%'] });
          },
        },
      ],
    },
  ];
}
void HARD_LABEL;

export function demoScript(v: ChemAcidsVariant, precautions: string[]): DemoStep[] {
  const body = v.task === 'PH' ? phSteps() : v.task === 'IND' ? indSteps() : v.task === 'ACID' ? acidSteps() : hardSteps();
  return [
    ...intro(v.task),
    ...body,
    { id: 'precautions', title: 'Precautions', say: () => `Precautions I took: ${precautions.slice(0, 3).join(' ')}`, ms: 8000, view: AT_BENCH, beats: [] },
    { id: 'done', title: 'Your turn!', say: () => 'That is the whole practical. Now try it yourself with your own samples — and ask me if anything is unclear.', ms: 4500, view: AT_BENCH, beats: [] },
  ];
}

const demoEmpty = (task: AcidsTask): ChemAcidsState => ({ ...emptyChemAcidsState(), task });
const noop = () => undefined;

/** The acids demo: its own seed, clock and in-memory state, played by the kit's demo engine. */
export function useAcidsDemo({ studentSeed, task, startedAt, precautions, active, onFinished }: { studentSeed: number; task: AcidsTask; startedAt: string; precautions: string[]; active: boolean; onFinished: () => void }) {
  const seed = useMemo(() => demoSeed(studentSeed), [studentSeed]);
  const clock = useRef(makeClock()).current;
  const [state, setState] = useState<ChemAcidsState>(() => demoEmpty(task));
  const x = useAcids({ seed, state, onChange: setState, readOnly: false, startedAt, autoTask: false, clock, variant: undefined });
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
