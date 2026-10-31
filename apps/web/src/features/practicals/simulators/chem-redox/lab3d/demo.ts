import { emptyChemRedoxState, redoxChain, redoxEndpoint, redoxReading, redoxTrueEnd, type ChemRedoxState, type ChemRedoxVariant, type RedoxTask } from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import type { Redox } from '../actions';
import { useBench, type BenchState } from './bench-store';
import { apparatusFor } from './scene-state';
import { SPOT } from './spots';

/**
 * Mrs Ada's demonstration: the whole redox titration of the lesson's task,
 * step by step, on its own demo seed (never the student's, so nothing about
 * their answers is revealed) and its own in-memory state (never the
 * attempt's), through the same actions as the student's lab. Jumping to a
 * step replays the earlier beats instantly from an empty state.
 */

export const DEMO_SEED = 1;
export const demoSeed = (studentSeed: number) => (studentSeed !== DEMO_SEED ? DEMO_SEED : DEMO_SEED + 1);

export interface DemoCtx {
  t: Redox;
  v: ChemRedoxVariant;
  s: () => ChemRedoxState;
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const fmt = (x: number) => x.toFixed(2);
const r2 = (x: number) => Math.round(x * 100) / 100;
const view = (p: Partial<BenchState>) => useBench.setState(p);
const bench = (target: [number, number, number], dist: number, pitch = 0.32, yaw = 0.1) => ({ mode: 'bench' as const, spot: { target, dist, pitch, yaw } });
const AT_BURETTE = bench([SPOT.buretteAxis[0], 0.5, SPOT.buretteAxis[2]], 0.9, 0.12);
const AT_FLASK = bench([SPOT.buretteAxis[0], 0.12, SPOT.buretteAxis[2]], 0.45, 0.4);
const AT_BENCH = bench([0.12, 0.14, -0.06], 1.05, 0.55);
const AT_PIPETTE = bench([SPOT.flaskHome[0], 0.22, SPOT.flaskHome[2]], 0.8, 0.3);
const AT_TRIPOD = bench([SPOT.tripod[0], 0.2, SPOT.tripod[2]], 0.65, 0.3);
const AT_ACIDS = bench([SPOT.acids[0] + 0.1, 0.08, SPOT.acids[2] + 0.1], 0.7, 0.35);
const READ = { mode: 'read' as const, spot: null, eye: 0 };

const deliveredNow = (c: DemoCtx) => {
  const run = c.s().runs.at(-1)!;
  return run.initial === null ? 0 : c.s().burette! - run.initial;
};
/** A stream to `fastTo` cm³ delivered (0.5 cm³ a beat, swirling), starting `slowFirst` cm³ drop by drop (OX: waiting for Mn²⁺). */
function stream(start: number, fastTo: number, slow: number): { beats: Beat[]; at: number } {
  const out: Beat[] = [];
  let at = start;
  for (let i = 0; i < Math.ceil(slow / 0.05); i++) {
    at += 700;
    out.push({ at, run: (c) => (c.t.drop(), view({ dropAt: performance.now() }), c.t.swirl(), view({ swirlUntil: performance.now() + 500 })) });
  }
  out.push({ at: at + 100, run: () => view({ streaming: true, tap: 0.9 }) });
  const n = Math.max(1, Math.ceil((fastTo - slow) / 0.5));
  for (let i = 0; i < n; i++) {
    at += 100;
    out.push({
      at,
      run: (c) => {
        const step = Math.min(0.5, Math.max(0, fastTo - deliveredNow(c)));
        if (step > 0) c.t.deliver(r2(step), true);
        if (i % 3 === 2) c.t.swirl();
      },
    });
  }
  out.push({ at: at + 60, run: () => view({ streaming: false, tap: 0 }) });
  return { beats: out, at: at + 400 };
}
/** Drop by drop, swirling after each, until `stopAt` cm³ delivered. */
function dropwise(start: number, stopAt: number, gap: number, n = 40): Beat[] {
  const out: Beat[] = [];
  let at = start;
  for (let i = 0; i < n; i++) {
    at += gap;
    out.push({
      at,
      run: (c) => {
        if (c.s().runs.at(-1)!.initial === null || deliveredNow(c) >= stopAt - 0.001) return;
        c.t.drop();
        view({ dropAt: performance.now() });
        c.t.swirl();
        view({ swirlUntil: performance.now() + 250 });
      },
    });
  }
  return out;
}

function runSteps(task: RedoxTask, n: number, kind: 'ROUGH' | 'ACCURATE'): DemoStep[] {
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
        { at: 1800, run: (c) => c.t.placeFunnel() },
        { at: 2500, run: (c) => c.t.fill() },
        { at: 3600, run: (c) => c.t.note('clear-jet') },
        { at: 4300, run: (c) => c.t.removeFunnel() },
      ],
    });
  steps.push({
    id: `pipette-${n}`,
    title: `Pipette 25.0 cm³ of B (${label})`,
    say: () => 'With the filler — never by mouth — I draw B above the mark, let it down until the bottom of the meniscus sits on the line, run it into the flask and touch the tip on the side.',
    ms: 6000,
    view: AT_PIPETTE,
    point: 'pipette',
    beats: [
      { at: 600, run: () => view({ pip: 'filled' }) },
      { at: 3000, run: (c) => (c.t.pipette(kind), view({ pip: 'drained' })) },
      { at: 4600, run: (c) => (c.t.note('touch-tip'), view({ pip: 'idle' })) },
    ],
  });
  if (task !== 'IOD')
    steps.push({
      id: `acid-${n}`,
      title: 'About 20 cm³ of dilute H₂SO₄',
      say: () => 'With the measuring cylinder I add about 20 cm³ of dilute tetraoxosulphate(VI) acid. Permanganate needs the H⁺ ions to be reduced to colourless Mn²⁺. Never hydrochloric acid — permanganate would oxidise the chloride. And no indicator: KMnO₄ is its own.',
      ms: 7500,
      view: AT_ACIDS,
      point: 'acid:H2SO4',
      beats: [{ at: 2500, run: (c) => c.t.addAcid('H2SO4') }],
    });
  if (task === 'OX')
    steps.push({
      id: `warm-${n}`,
      title: 'Warm to about 60–70 °C',
      say: () => 'On the gauze over the burner, with the thermometer in the flask. Cold, this reaction is far too slow. At about 65 °C I lift the flask off with a cloth — never let it boil, or the ethanedioic acid decomposes.',
      ms: 8000,
      view: AT_TRIPOD,
      point: 'tripod',
      beats: [
        { at: 500, run: (c) => (c.t.note('flask-to-tripod'), c.t.note('light-burner')) },
        { at: 1200, run: (c) => c.t.heatStart() },
        { at: 6200, run: (c) => (c.t.heatStop(), c.t.warmTo(66)) },
        { at: 6900, run: (c) => (c.t.note('burner-off'), c.t.note('flask-off-tripod')) },
      ],
    });
  steps.push(
    {
      id: `tile-${n}`,
      title: 'Onto the white tile',
      say: () => (task === 'IOD' ? 'The iodine solution is brown. On the white tile under the burette every change of colour is easy to see.' : 'Onto the white tile under the burette: the first faint pink will be easy to see.'),
      ms: 3800,
      view: AT_FLASK,
      point: 'flask',
      beats: [{ at: 1200, run: (c) => c.t.note('flask-to-tile') }],
    },
    {
      id: `initial-${n}`,
      title: task === 'IOD' ? 'Initial reading, at eye level' : 'Initial reading: the TOP of the meniscus',
      say: (c) => {
        const r = fmt(redoxReading(c.v, c.s().burette ?? 0));
        return task === 'IOD' ? `My eye is level with the bottom of the meniscus. It reads ${r} cm³, so I write ${r}.` : `KMnO₄ is so dark I cannot see the bottom of the meniscus, so I read its top edge, at eye level: ${r} cm³. I read the top every time, so the titre is still right.`;
      },
      ms: 6500,
      view: READ,
      point: 'burette',
      beats: [{ at: 3800, run: (c) => c.t.update((x) => ({ ...x, table: x.table.map((r, i) => (i === x.runs.length - 1 ? { ...r, initial: fmt(redoxReading(c.v, x.burette ?? 0)) } : r)) })) }],
    },
  );
  steps.push({
    id: `titrate-${n}`,
    title:
      task === 'IOD'
        ? 'Thiosulphate until pale straw'
        : task === 'OX'
          ? kind === 'ROUGH'
            ? 'Slowly at first — then it speeds up'
            : 'Slow start, quickly to 1 cm³ short, then dropwise'
          : kind === 'ROUGH'
            ? 'Rough titration: fairly quickly, swirling'
            : 'Quickly to 1 cm³ short, then drop by drop',
    say: () =>
      task === 'IOD'
        ? 'I run in the thiosulphate, swirling. The brown iodine fades through yellow to a pale straw colour. I do not add the starch yet.'
        : task === 'OX'
          ? 'The first drops of purple take a while to go — there is no catalyst yet. Once some Mn²⁺ has formed it catalyses the reaction and each drop vanishes at once: autocatalysis.'
          : kind === 'ROUGH'
            ? 'Each drop of purple permanganate is decolourised at once as it oxidises iron(II) to iron(III). I swirl all the time.'
            : 'I run in KMnO₄ quickly to about one cubic centimetre short of the rough titre, then one drop at a time, swirling after each.',
    ms: task === 'OX' ? 13000 : task === 'IOD' ? 8000 : kind === 'ROUGH' ? 9000 : 12000,
    view: AT_FLASK,
    point: 'tap',
    beats: [],
  });
  if (task === 'IOD')
    steps.push(
      {
        id: `starch-${n}`,
        title: 'Now the starch: blue-black',
        say: () => 'Pale straw — very little iodine left. Now about 1 cm³ of starch: it turns blue-black. Added any earlier, the starch would bind the iodine and the end point would come late.',
        ms: 6000,
        view: AT_FLASK,
        point: 'ind:STARCH',
        beats: [{ at: 2200, run: (c) => c.t.addIndicator('STARCH') }],
      },
      { id: `blue-${n}`, title: 'Drop by drop to colourless', say: () => 'Now one drop at a time, swirling, until the blue-black just disappears.', ms: 9000, view: AT_FLASK, point: 'tap', beats: [] },
    );
  steps.push(
    {
      id: `endpoint-${n}`,
      title: 'The end point',
      say: () => (task === 'IOD' ? 'There — the blue-black has gone: colourless. That is the end point. I close the tap.' : `There — the first pale pink that stays${task === 'OX' ? ' for thirty seconds' : ''}. One drop of excess KMnO₄. That is the end point.`),
      ms: 4500,
      view: AT_FLASK,
      point: 'flask',
      beats: [{ at: 3000, run: (c) => c.t.finish() }],
    },
    {
      id: `final-${n}`,
      title: 'Final reading and titre',
      say: (c) => {
        const r = c.s().runs.at(-1)!;
        const i = redoxReading(c.v, r.initial ?? 0);
        const f = redoxReading(c.v, r.final ?? 0);
        return `Final reading, again at eye level${c.v.dark ? ', the top of the meniscus' : ''}: ${fmt(f)} cm³. Titre = ${fmt(f)} − ${fmt(i)} = ${fmt(Number(fmt(f)) - Number(fmt(i)))} cm³.`;
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
              table: x.table.map((row, i) => {
                if (i !== x.runs.length - 1) return row;
                const ri = fmt(redoxReading(c.v, x.runs[i]!.initial ?? 0));
                const rf = fmt(redoxReading(c.v, x.runs[i]!.final ?? 0));
                return { ...row, final: rf, titre: fmt(Number(rf) - Number(ri)) };
              }),
            })),
        },
      ],
    },
  );
  return steps;
}

/** The titration steps' beats: they depend on the demo run's own end point. */
export function beatsFor(step: DemoStep, c: DemoCtx): DemoStep['beats'] {
  const i = c.s().runs.length - 1;
  const run = c.s().runs[i];
  if (!run) return step.beats;
  const rough = run.kind === 'ROUGH';
  if (step.id.startsWith('titrate-')) {
    if (c.v.task === 'IOD') {
      const straw = Math.round(redoxTrueEnd(c.v, i, run) * 0.88 * 100) / 100;
      return stream(200, straw, 0).beats;
    }
    const end = redoxEndpoint(c.v, i, run);
    const lead = rough ? 1.5 : 1.0;
    const s = stream(200, Math.max(0, end - lead), c.v.task === 'OX' ? 0.25 : 0);
    return [...s.beats, ...dropwise(s.at, rough ? end + 0.08 : end, rough ? 140 : c.v.task === 'OX' ? 320 : 260, Math.ceil(lead / 0.04) + 6)];
  }
  if (step.id.startsWith('blue-')) {
    const end = redoxEndpoint(c.v, i, run);
    const s = stream(200, end - 0.6, 0);
    return [...s.beats, ...dropwise(s.at, end, rough ? 160 : 260, Math.ceil(0.6 / 0.04) + 6)];
  }
  return step.beats;
}

const concordantMean = (titres: number[]) => {
  for (let i = 0; i < titres.length; i++) for (let j = i + 1; j < titres.length; j++) if (Math.abs(titres[i]! - titres[j]!) <= 0.1 + 1e-9) return (titres[i]! + titres[j]!) / 2;
  return titres.reduce((a, b) => a + b, 0) / (titres.length || 1);
};
const p3 = (x: number) => x.toPrecision(3);

/** The worked calculation from the demo's own titres (the lesson's method). */
export function demoCalculation(s: ChemRedoxState, v: ChemRedoxVariant): string[] {
  const acc = s.runs.map((r, i) => ({ r, row: s.table[i] })).filter(({ r, row }) => r.done && r.kind === 'ACCURATE' && row?.titre).map(({ row }) => Number(row!.titre));
  if (acc.length < 2) return [];
  const mean = concordantMean(acc);
  const c = redoxChain(v, mean);
  const lines = [`Accurate titres: ${acc.map(fmt).join(' and ')} cm³ — they agree within 0.10 cm³, so they are concordant. The rough titre is not used.`, `Mean titre = ${fmt(mean)} cm³.`, `${v.equation}: ${v.A.species} : ${v.B.species} = ${v.a} : ${v.b}.`];
  if (v.known === 'A')
    lines.push(
      `Moles of ${v.A.species} = ${p3(v.A.given!)} × ${fmt(mean)} ÷ 1000 = ${p3(c.known)} mol.`,
      `Moles of ${v.B.species} in 25.0 cm³ = ${p3(c.known)} × ${v.b} ÷ ${v.a} = ${p3(c.unknown)} mol.`,
      `Concentration of ${v.B.species} = ${p3(c.unknown)} × 1000 ÷ 25.0 = ${p3(c.conc)} mol dm⁻³; × ${v.mass.molarMass} = ${p3(c.massConc)} g dm⁻³ of ${v.mass.formula}.`,
    );
  else
    lines.push(
      `Moles of ${v.B.species} in 25.0 cm³ = ${p3(v.B.given!)} × 25.0 ÷ 1000 = ${p3(c.known)} mol.`,
      `Moles of ${v.A.species} = ${p3(c.known)} × ${v.a} ÷ ${v.b} = ${p3(c.unknown)} mol, in ${fmt(mean)} cm³.`,
      `Concentration of KMnO₄ = ${p3(c.unknown)} × 1000 ÷ ${fmt(mean)} = ${p3(c.conc)} mol dm⁻³; × 158 = ${p3(c.massConc)} g dm⁻³.`,
    );
  return lines;
}

export function demoScript(v: ChemRedoxVariant, precautions: string[]): DemoStep[] {
  const task = v.task;
  const collect: Beat[] = apparatusFor(task)
    .filter((a) => a.needed)
    .map((a, i) => ({ at: 600 + i * 380, run: (c) => c.t.note(`collect:${a.id}`) }));
  return [
    { id: 'welcome', title: 'Welcome to the demonstration', say: () => `Watch me carry out the whole titration. These are my demonstration values, not yours: ${v.given.A} Then it’s your turn.`, ms: 6500, view: AT_BENCH, beats: [] },
    {
      id: 'safety',
      title: 'Safety first',
      say: () => (v.dark ? 'Lab coat on, goggles on. Acid can splash into your eyes, and permanganate stains skin and clothes brown.' : 'Lab coat on, goggles on. Iodine stains the skin — wash any spill off at once.'),
      ms: 4500,
      view: AT_BENCH,
      beats: [
        { at: 800, run: (c) => c.t.note('safety:coat') },
        { at: 1800, run: (c) => c.t.note('safety:goggles') },
      ],
    },
    {
      id: 'apparatus',
      title: 'The apparatus',
      say: () => `From the cupboard: a 50 cm³ burette, a retort stand and clamp, a funnel, a 25.0 cm³ pipette with its filler, a conical flask, a white tile, a waste beaker and a wash bottle${task !== 'IOD' ? ', a measuring cylinder for the acid' : ''}${task === 'OX' ? ', and a tripod, gauze, Bunsen burner and thermometer' : ''}.`,
      ms: 6500,
      view: AT_BENCH,
      beats: collect,
    },
    {
      id: 'rinse-burette',
      title: 'Rinse the burette with A, clamp it',
      say: () => 'I rinse the burette with a little of A and drain it — water left inside would dilute it. Then I clamp it upright.',
      ms: 5200,
      view: AT_BURETTE,
      point: 'burette',
      beats: [
        { at: 900, run: (c) => c.t.rinse('burette', 'A') },
        { at: 2600, run: (c) => c.t.note('clamp-burette') },
      ],
    },
    {
      id: 'fill',
      title: 'Fill through the funnel, below eye level',
      say: () => 'Funnel in, and I fill the burette with A to near the zero mark. I run a little into the waste beaker to push the air bubble out of the jet, and take the funnel out.',
      ms: 6800,
      view: AT_BURETTE,
      point: 'funnel',
      beats: [
        { at: 600, run: (c) => c.t.placeFunnel() },
        { at: 1600, run: (c) => c.t.fill() },
        { at: 3800, run: (c) => c.t.note('clear-jet') },
        { at: 5200, run: (c) => c.t.removeFunnel() },
      ],
    },
    {
      id: 'rinse-pipette',
      title: 'Rinse the pipette with B, the flask with water',
      say: () => 'The pipette is rinsed with B, the solution it will measure. The conical flask is rinsed with distilled water only.',
      ms: 5600,
      view: AT_PIPETTE,
      point: 'pipette',
      beats: [
        { at: 800, run: (c) => c.t.rinse('pipette', 'B') },
        { at: 2200, run: (c) => c.t.note('filler-on') },
        { at: 3400, run: (c) => c.t.rinse('flask', 'WATER') },
      ],
    },
    ...runSteps(task, 0, 'ROUGH'),
    ...runSteps(task, 1, 'ACCURATE'),
    ...runSteps(task, 2, 'ACCURATE'),
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
            const mean = demoCalculation(c.s(), c.v)[1]?.match(/= ([\d.]+) cm³/)?.[1] ?? '';
            c.t.update((x) => ({ ...x, answers: { ...x.answers, meanTitre: { value: mean, unit: 'cm³' } } }));
          },
        },
      ],
    },
    { id: 'calc', title: 'The calculation', say: () => `Now the calculation: moles of the standard solution, the mole ratio ${v.a} to ${v.b} from the equation, then the concentration.`, ms: 9000, view: AT_BENCH, point: 'book', panel: 'calc', beats: [] },
    { id: 'precautions', title: 'Precautions', say: () => `Precautions I took: ${precautions.slice(0, 3).join(' ')}`, ms: 8000, view: AT_BENCH, beats: [] },
    { id: 'done', title: 'Your turn!', say: () => 'That’s the whole titration. Now try it yourself with your own solutions — and ask me if anything is unclear.', ms: 4500, view: AT_BENCH, beats: [] },
  ];
}

export const demoEmpty = (task: RedoxTask) => ({ ...emptyChemRedoxState(), task });
