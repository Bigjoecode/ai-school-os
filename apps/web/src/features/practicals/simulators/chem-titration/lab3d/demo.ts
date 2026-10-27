import { TITRATION_INDICATOR_INFO, chemTitrationVariant, emptyChemTitrationState, titrationEndpoint, type ChemTitrationState, type ChemTitrationVariant, type TitrationIndicator } from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import type { Titration } from '../actions';
import { useBench, type BenchState } from './bench-store';
import { APPARATUS } from './scene-state';
import { SPOT } from './spots';

/**
 * Mrs Ada's demonstration: the whole titration, step by step, on its own
 * fixed demo values (never the student's seed, so nothing about their own
 * answers is revealed) and its own in-memory state (never the attempt's).
 *
 * Each step has a caption (always shown, optionally spoken), a camera view,
 * and timed beats that act on the demo titration through the same actions as
 * the student's lab — so the demo obeys exactly the same simulation. Jumping
 * to a step replays the earlier beats instantly from an empty state.
 */

export const DEMO_SEED = 1;
/** A demo seed that is never the student's own (HCl against NaOH, methyl orange). */
export function demoSeed(studentSeed: number): number {
  if (studentSeed !== DEMO_SEED) return DEMO_SEED;
  for (let s = DEMO_SEED + 1; s < 100_000; s++) {
    const v = chemTitrationVariant(s);
    if (s !== studentSeed && v.acid.formula === 'HCl' && v.base.formula === 'NaOH' && v.finalTask === 'MASS_CONC') return s;
  }
  return DEMO_SEED + 1;
}

export interface DemoCtx {
  t: Titration;
  v: ChemTitrationVariant;
  /** The demo state as the beats have left it. */
  s: () => ChemTitrationState;
}
type Beat = DemoBeat<DemoCtx>;
/** A demo step ('notebook' / 'calc' panels show the demo notebook / the worked calculation). */
export type DemoStep = KitDemoStep<DemoCtx>;

const r2 = (x: number) => Math.round(x * 100) / 100;
const fmt = (x: number) => x.toFixed(2);
const view = (p: Partial<BenchState>) => useBench.setState(p);
const bench = (target: [number, number, number], dist: number, pitch = 0.32, yaw = 0.1) => ({ mode: 'bench' as const, spot: { target, dist, pitch, yaw } });
const AT_BURETTE = bench([SPOT.buretteAxis[0], 0.5, SPOT.buretteAxis[2]], 0.9, 0.12);
const AT_FLASK = bench([SPOT.buretteAxis[0], 0.12, SPOT.buretteAxis[2]], 0.45, 0.4);
const AT_BENCH = bench([0.12, 0.14, -0.06], 1.05, 0.55);
const AT_PIPETTE = bench([SPOT.flaskHome[0], 0.22, SPOT.flaskHome[2]], 0.8, 0.3);
const READ = { mode: 'read' as const, spot: null, eye: 0 };

/** Beats that run acid in: a fast stream to `fastTo` cm³ delivered, then drops until the colour changes for good. */
function titrate(start: number, fastTo: number, stopAt: number, rough: boolean): Beat[] {
  const out: Beat[] = [];
  let at = start;
  out.push({ at, run: () => view({ streaming: true, tap: 0.9 }) });
  // the stream: 0.5 cm³ per beat, swirling every few beats
  const streamBeats = Math.max(1, Math.ceil(fastTo / 0.5));
  for (let i = 0; i < streamBeats; i++) {
    at += rough ? 120 : 90;
    out.push({
      at,
      run: (c) => {
        const run = c.s().runs.at(-1)!;
        const done = c.s().burette! - (run.initial ?? c.s().burette!);
        const step = Math.min(0.5, Math.max(0, fastTo - done));
        if (step > 0) c.t.deliver(r2(step), false);
        if (i % 3 === 2) c.t.swirl();
      },
    });
  }
  out.push({ at: at + 60, run: () => view({ streaming: false, tap: 0 }) });
  at += 400;
  // dropwise, swirling after each drop, until the end point (rough: a little past it)
  for (let i = 0; i < 70; i++) {
    at += rough ? 140 : 260;
    out.push({
      at,
      run: (c) => {
        const run = c.s().runs.at(-1)!;
        if (run.initial === null) return;
        const done = c.s().burette! - run.initial;
        if (done >= stopAt - 0.001) return;
        c.t.deliver(0.05, false);
        view({ dropAt: performance.now() });
        c.t.swirl();
        view({ swirlUntil: performance.now() + 250 });
      },
    });
  }
  return out;
}

/** One titration run from a rinsed flask: pipette B, indicator, tile, initial reading, titrate, final reading and titre. */
function runSteps(n: number, kind: 'ROUGH' | 'ACCURATE', ind: TitrationIndicator): DemoStep[] {
  const label = kind === 'ROUGH' ? 'rough titration' : `accurate titration ${n}`;
  const steps: DemoStep[] = [];
  if (kind === 'ACCURATE')
    steps.push({
      id: `refill-${n}`,
      title: `Ready for ${label}`,
      say: () => `For ${label} I wash the conical flask with distilled water only, and refill the burette with A to near the zero mark, clearing the jet again.`,
      ms: 5200,
      view: AT_BURETTE,
      point: 'burette',
      beats: [
        { at: 300, run: (c) => c.t.note('flask-off-tile') },
        { at: 900, run: (c) => c.t.rinse('flask', 'WATER') },
        { at: 1800, run: (c) => c.t.update((x) => ({ ...x, funnelIn: true }), 'place-funnel') },
        { at: 2500, run: (c) => c.t.fill() },
        { at: 3600, run: (c) => c.t.note('clear-jet') },
        { at: 4300, run: (c) => c.t.removeFunnel() },
      ],
    });
  steps.push(
    {
      id: `pipette-${n}`,
      title: `Pipette 25.0 cm³ of B (${label})`,
      say: () => 'With the filler — never by mouth — I draw B above the mark, let it down until the bottom of the meniscus sits on the line, run it into the flask and touch the tip on the side. I don’t blow out the last drop.',
      ms: 6200,
      view: AT_PIPETTE,
      point: 'pipette',
      beats: [
        { at: 600, run: () => view({ pip: 'filled' }) },
        { at: 3200, run: (c) => (c.t.pipette(kind), view({ pip: 'drained' })) },
        { at: 4800, run: (c) => (c.t.note('touch-tip'), view({ pip: 'idle' })) },
      ],
    },
    {
      id: `indicator-${n}`,
      title: 'Indicator, then onto the white tile',
      say: () => `Two or three drops of ${TITRATION_INDICATOR_INFO[ind].label.toLowerCase()}: the solution turns ${TITRATION_INDICATOR_INFO[ind].baseName}. The white tile under the flask makes the colour change easy to see.`,
      ms: 5200,
      view: AT_FLASK,
      point: 'flask',
      beats: [
        { at: 700, run: (c) => (c.t.chooseIndicator(ind), c.t.addIndicator()) },
        { at: 2600, run: (c) => c.t.note('flask-to-tile') },
      ],
    },
    {
      id: `initial-${n}`,
      title: 'Initial reading, at eye level',
      say: (c) => `My eye is level with the bottom of the meniscus. It reads ${fmt(c.s().burette ?? 0)} cm³ — two decimal places — so I write ${fmt(c.s().burette ?? 0)} in the initial column.`,
      ms: 6000,
      view: READ,
      point: 'burette',
      beats: [{ at: 3500, run: (c) => c.t.update((x) => ({ ...x, table: x.table.map((r, i) => (i === x.runs.length - 1 ? { ...r, initial: fmt(x.burette ?? 0) } : r)) })) }],
    },
  );
  // The titration itself: its beats need the end point, known once the run exists, so they are built when the step starts.
  steps.push({
    id: `titrate-${n}`,
    title: kind === 'ROUGH' ? 'Rough titration: fairly quickly, swirling' : 'Quickly to 1 cm³ short, then drop by drop',
    say: () =>
      kind === 'ROUGH'
        ? 'For the rough titration I run the acid in fairly quickly, swirling all the time, until the colour just changes. It tells me roughly where the end point is.'
        : `I run in acid quickly to about one cubic centimetre short of the rough titre, then add it one drop at a time, swirling after each drop, until one drop changes the colour for good.`,
    ms: kind === 'ROUGH' ? 9000 : 12500,
    view: AT_FLASK,
    point: 'tap',
    beats: [], // filled by `beatsFor`
  });
  steps.push({
    id: `endpoint-${n}`,
    title: 'The end point',
    say: () => `There — ${TITRATION_INDICATOR_INFO[ind].baseName} has turned ${TITRATION_INDICATOR_INFO[ind].endName.split(' (')[0]}. That is the end point. I close the tap.`,
    ms: 4200,
    view: AT_FLASK,
    point: 'flask',
    beats: [{ at: 2800, run: (c) => c.t.finish() }],
  });
  steps.push({
    id: `final-${n}`,
    title: 'Final reading and titre',
    say: (c) => {
      const r = c.s().runs.at(-1)!;
      return `Final reading, again at eye level: ${fmt(r.final ?? 0)} cm³. Titre = final − initial = ${fmt(r.final ?? 0)} − ${fmt(r.initial ?? 0)} = ${fmt((r.final ?? 0) - (r.initial ?? 0))} cm³.`;
    },
    ms: 6500,
    view: READ,
    point: 'burette',
    panel: 'notebook',
    beats: [
      {
        at: 3000,
        run: (c) =>
          c.t.update((x) => ({
            ...x,
            table: x.table.map((row, i) => (i === x.runs.length - 1 ? { ...row, final: fmt(x.runs[i]!.final ?? 0), titre: fmt((x.runs[i]!.final ?? 0) - (x.runs[i]!.initial ?? 0)) } : row)),
          })),
      },
    ],
  });
  return steps;
}

/** The titration step's beats: they depend on the demo run's own end point. */
export function beatsFor(step: DemoStep, c: DemoCtx, ind: TitrationIndicator): DemoStep['beats'] {
  if (!step.id.startsWith('titrate-')) return step.beats;
  const i = c.s().runs.length - 1;
  const end = titrationEndpoint(c.v, i, ind);
  const rough = c.s().runs[i]?.kind === 'ROUGH';
  return rough ? titrate(200, Math.max(0, end - 1.5), end + 0.08, true) : titrate(200, Math.max(0, end - 1.0), end, false);
}

const concordantMean = (titres: number[]) => {
  for (let i = 0; i < titres.length; i++) for (let j = i + 1; j < titres.length; j++) if (Math.abs(titres[i]! - titres[j]!) <= 0.1 + 1e-9) return (titres[i]! + titres[j]!) / 2;
  return titres.reduce((a, b) => a + b, 0) / (titres.length || 1);
};

/** The worked calculation from the demo's own titres (same method as the lesson). */
export function demoCalculation(s: ChemTitrationState, v: ChemTitrationVariant): string[] {
  const acc = s.runs.filter((r) => r.done && r.kind === 'ACCURATE' && r.initial !== null && r.final !== null).map((r) => r.final! - r.initial!);
  if (acc.length < 2) return [];
  const mean = concordantMean(acc);
  const cA = v.acidConc;
  const molA = (cA * mean) / 1000;
  const molB = (molA * v.b) / v.a;
  const cB = (molB * 1000) / 25;
  return [
    `Accurate titres: ${acc.map(fmt).join(' and ')} cm³ — they agree within 0.10 cm³, so they are concordant. The rough titre is not used.`,
    `Mean titre = ${fmt(mean)} cm³.`,
    `${v.equation}: mole ratio acid : base = ${v.a} : ${v.b}.`,
    `C(A) = ${v.acidMassConc.toFixed(2)} g dm⁻³ ÷ ${v.acid.molarMass} g mol⁻¹ = ${cA.toPrecision(3)} mol dm⁻³.`,
    `Moles of A = ${cA.toPrecision(3)} × ${fmt(mean)} ÷ 1000 = ${molA.toPrecision(3)} mol; moles of B = ${molB.toPrecision(3)} mol in 25.0 cm³.`,
    `C(B) = ${molB.toPrecision(3)} × 1000 ÷ 25.0 = ${cB.toPrecision(3)} mol dm⁻³ = ${(cB * v.base.molarMass).toPrecision(3)} g dm⁻³.`,
  ];
}

export function demoScript(v: ChemTitrationVariant, precautions: string[]): DemoStep[] {
  const ind = v.indicators[0]!;
  const collect: Beat[] = APPARATUS.filter((a) => a.needed).map((a, i) => ({ at: 600 + i * 450, run: (c) => c.t.note(`collect:${a.id}`) }));
  return [
    {
      id: 'welcome',
      title: 'Welcome to the demonstration',
      say: () => `Watch me carry out the whole titration. These are my demonstration values, not yours: ${v.given.A.replace(/^A is /, 'A is ')} Then it’s your turn.`,
      ms: 6000,
      view: AT_BENCH,
      beats: [],
    },
    {
      id: 'safety',
      title: 'Safety first',
      say: () => 'Lab coat on, goggles on. Acids and alkalis can splash into your eyes.',
      ms: 4200,
      view: AT_BENCH,
      beats: [
        { at: 800, run: (c) => c.t.note('safety:coat') },
        { at: 1800, run: (c) => c.t.note('safety:goggles') },
      ],
    },
    {
      id: 'apparatus',
      title: 'The apparatus',
      say: () => 'From the cupboard: a 50 cm³ burette, a retort stand and clamp, a funnel, a 25.0 cm³ pipette with its filler, a conical flask, a white tile, a beaker for waste and a wash bottle of distilled water.',
      ms: 6000,
      view: AT_BENCH,
      beats: collect,
    },
    {
      id: 'rinse-burette',
      title: 'Rinse the burette with A, clamp it',
      say: () => 'I rinse the burette with a little of the acid A and drain it — water left inside would dilute A. Then I clamp it upright.',
      ms: 5200,
      view: AT_BURETTE,
      point: 'burette',
      beats: [
        { at: 900, run: (c) => c.t.rinse('burette', 'ACID') },
        { at: 2600, run: (c) => c.t.note('clamp-burette') },
      ],
    },
    {
      id: 'fill',
      title: 'Fill through the funnel, below eye level',
      say: () => 'Funnel in, and I fill the burette with A to near the zero mark. Then I run a little into the waste beaker to push the air bubble out of the jet, and take the funnel out.',
      ms: 6800,
      view: AT_BURETTE,
      point: 'funnel',
      beats: [
        { at: 600, run: (c) => c.t.update((x) => ({ ...x, funnelIn: true }), 'place-funnel') },
        { at: 1600, run: (c) => c.t.fill() },
        { at: 3800, run: (c) => c.t.note('clear-jet') },
        { at: 5200, run: (c) => c.t.removeFunnel() },
      ],
    },
    {
      id: 'rinse-pipette',
      title: 'Rinse the pipette with B, the flask with water',
      say: () => 'The pipette is rinsed with B, the solution it will measure. The conical flask is rinsed with distilled water only — B left in it would add extra base.',
      ms: 5600,
      view: AT_PIPETTE,
      point: 'pipette',
      beats: [
        { at: 800, run: (c) => c.t.rinse('pipette', 'BASE') },
        { at: 2200, run: (c) => c.t.note('filler-on') },
        { at: 3400, run: (c) => c.t.rinse('flask', 'WATER') },
      ],
    },
    ...runSteps(0, 'ROUGH', ind),
    ...runSteps(1, 'ACCURATE', ind),
    ...runSteps(2, 'ACCURATE', ind),
    {
      id: 'mean',
      title: 'Concordant titres and the mean',
      say: (c) => {
        const lines = demoCalculation(c.s(), c.v);
        return lines.length ? `${lines[0]} ${lines[1]}` : 'I average the accurate titres that agree within 0.10 cm³.';
      },
      ms: 7500,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 1500,
          run: (c) => {
            const lines = demoCalculation(c.s(), c.v);
            const mean = lines[1]?.match(/= ([\d.]+) cm³/)?.[1] ?? '';
            c.t.update((x) => ({ ...x, answers: { ...x.answers, meanTitre: { value: mean, unit: 'cm³' } } }));
          },
        },
      ],
    },
    {
      id: 'calc',
      title: 'The calculation',
      say: () => 'Now the concentration of B: concentration of A, moles of A from the mean titre, the mole ratio from the equation, then moles of B in 25.0 cm³.',
      ms: 9000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [],
    },
    {
      id: 'precautions',
      title: 'Precautions',
      say: () => `Precautions I took: ${precautions.slice(0, 3).join(' ')}`,
      ms: 8000,
      view: AT_BENCH,
      beats: [],
    },
    {
      id: 'done',
      title: 'Your turn!',
      say: () => 'That’s the whole titration. Now try it yourself with your own solutions — and ask me if anything is unclear.',
      ms: 4500,
      view: AT_BENCH,
      beats: [],
    },
  ];
}

export const demoEmpty = () => emptyChemTitrationState();
