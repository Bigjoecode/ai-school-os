import { MP_LIT, PPT_INFO, chromSolventDist, chromSpots, emptyChemSaltsState, mpMinWater, mpProduct, pptChain, pptTotal, solChain, solCrystalPoint, solFiltrate, solProduct, type ChemSaltsState, type ChemSaltsVariant, type SaltsTask } from '@aischool/shared';
import { useMemo, useRef, useState } from 'react';
import { useDemoPlayer, type DemoBeat, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { makeClock, useSalts, type Salts } from '../actions';
import { Notebook } from '../notebook';
import { BENCH_IDLE, useBench } from './bench-store';
import { NEEDED } from './scene-state';
import { GAUZE_Y, SPOT } from './views';

/**
 * Mrs Ada's demonstration of the lesson's task, step by step, on its own demo
 * seed (never the student's) and its own in-memory state and lab clock
 * (never the attempt's), through the same actions as the student's lab. The
 * slow parts (warming, evaporating, cooling, the solvent rising, the oil bath)
 * are time-lapsed by jumping the demo clock. Jumping to a step replays the
 * earlier beats instantly from an empty bench.
 */
export const DEMO_SEED = 1;
export const demoSeed = (studentSeed: number) => (studentSeed !== DEMO_SEED ? DEMO_SEED : DEMO_SEED + 1);

export interface DemoCtx {
  x: Salts;
  v: ChemSaltsVariant;
  s: () => ChemSaltsState;
}
type Beat = DemoBeat<DemoCtx>;
type DemoStep = KitDemoStep<DemoCtx>;

const bench = (p: readonly number[], y: number, dist: number, pitch = 0.35) => ({ mode: 'bench' as const, spot: { target: [p[0]!, y, p[2]!] as [number, number, number], dist, pitch, yaw: 0.1 } });
const AT_BENCH = bench([0, 0, 0], 0.12, 1.15, 0.55);
const AT_HEAT = bench(SPOT.tripod, GAUZE_Y + 0.03, 0.6, 0.38);
const AT_BEAKER = bench(SPOT.beaker, 0.06, 0.55, 0.45);
const AT_FUNNEL = bench(SPOT.funnel, 0.12, 0.6, 0.35);
const AT_BALANCE = bench(SPOT.balance, 0.05, 0.45, 0.45);
const AT_TANK = bench(SPOT.tank, 0.12, 0.55, 0.2);
const AT_PAPER = bench(SPOT.paper, 0.01, 0.42, 1.15);
const AT_OVEN = bench(SPOT.oven, 0.12, 0.7, 0.3);
const AT_OIL = bench(SPOT.tripod, GAUZE_Y + 0.12, 0.45, 0.15);

/** Run the beats' ops; `say` nothing on failure (the demo is scripted to succeed). */
const op = (f: (c: DemoCtx) => unknown): Beat['run'] => (c) => void f(c);
const seq = (start: number, gap: number, fns: ((c: DemoCtx) => unknown)[]): Beat[] => fns.map((f, i) => ({ at: start + i * gap, run: op(f) }));
/** Jump the demo clock forward in steps until `cond` (at most `max` steps). */
const skipUntil = (c: DemoCtx, cond: () => boolean, stepMs: number, max = 2000) => {
  for (let i = 0; i < max && !cond(); i++) c.x.skip(stepMs);
};
const setRec = (c: DemoCtx, patch: Partial<ChemSaltsState['rec']>) => c.x.update((s) => ({ ...s, rec: { ...s.rec, ...patch } }));
const setAns = (c: DemoCtx, patch: Partial<Record<keyof ChemSaltsState['answers'], string>>, units: Partial<Record<keyof ChemSaltsState['answers'], string>>) =>
  c.x.update((s) => ({ ...s, answers: Object.fromEntries(Object.entries(s.answers).map(([k, a]) => [k, k in patch ? { value: patch[k as keyof typeof patch]!, unit: units[k as keyof typeof units] ?? '' } : a])) as ChemSaltsState['answers'] }));
const p3 = (x: number) => x.toPrecision(3);

function intro(v: ChemSaltsVariant): DemoStep[] {
  const collect: Beat[] = NEEDED[v.task].map((id, i) => ({ at: 500 + i * 300, run: (c) => c.x.note(`collect:${id}`) }));
  return [
    { id: 'welcome', title: 'Welcome to the demonstration', say: () => 'Watch me do the whole practical. These are my demonstration samples, not yours — then it is your turn.', ms: 5000, view: AT_BENCH, beats: [] },
    { id: 'safety', title: 'Safety first', say: () => (v.task === 'CHROM' ? 'Coat and goggles on. Ethanol is flammable, so no flames near the tank.' : v.task === 'MP' ? 'Coat and goggles on. Boiling water and hot oil burn — I heat slowly and carefully.' : v.task === 'PPT' ? 'Coat and goggles on. Some of these salts are toxic: I never taste anything, and I wash my hands afterwards.' : 'Coat and goggles on. Hot acid spits, so I only warm it gently.'), ms: 4500, view: AT_BENCH, beats: [{ at: 700, run: (c) => c.x.note('safety:coat') }, { at: 1600, run: (c) => c.x.note('safety:goggles') }] },
    { id: 'apparatus', title: 'The apparatus', say: () => 'I collect what I need from the cupboard and set it out on my bench.', ms: 500 + NEEDED[v.task].length * 300 + 1500, view: AT_BENCH, beats: collect },
  ];
}

function solSteps(v: ChemSaltsVariant): DemoStep[] {
  const need = (v.sol.acidConc * 50 * 79.5) / 1000;
  const portions = Math.ceil((need + 0.3) / v.sol.portion);
  return [
    { id: 'acid', title: '50.0 cm³ of dilute H₂SO₄', say: () => 'With the measuring cylinder, read at eye level, I measure 50.0 cm³ of the dilute acid into the beaker.', ms: 4500, view: AT_BEAKER, point: 'bottle:acid', beats: [{ at: 1800, run: op((c) => c.x.ops.measureAcid(50)) }] },
    { id: 'warm', title: 'Warm it gently', say: () => 'On the gauze with a low flame, to about 60 °C — warm acid dissolves the oxide quickly. Not boiling: hot acid spits. The clock is speeded up.', ms: 6500, view: AT_HEAT, point: 'burner', beats: [{ at: 600, run: (c) => (c.x.note('gauze:beaker'), c.x.note('burner:LOW')) }, { at: 2500, run: (c) => skipUntil(c, () => c.x.acidT() >= 60, 5000) }, { at: 5200, run: (c) => (c.x.note('burner:OFF'), c.x.note('gauze:none')) }] },
    {
      id: 'cuo',
      title: 'CuO a spatula at a time, until some stays',
      say: () => 'The black oxide dissolves and the solution turns blue. I add it a little at a time, stirring, until some black solid stays undissolved: then the base is in excess and all the acid is used up.',
      ms: 1200 + portions * 900 + 1500,
      view: AT_BEAKER,
      point: 'jar:cuo',
      beats: seq(800, 900, Array.from({ length: portions }, () => (c: DemoCtx) => (c.x.ops.addCuO(), c.x.ops.stir(), useBench.setState({ stirUntil: performance.now() + 700 })))),
    },
    { id: 'filter', title: 'Filter off the excess', say: () => 'I filter off the excess black oxide. The clear blue filtrate runs into the evaporating dish.', ms: 4500, view: AT_FUNNEL, point: 'funnel', beats: [{ at: 1800, run: op((c) => c.x.ops.filterExcess()) }] },
    {
      id: 'evap',
      title: 'Evaporate — and test with a cold rod',
      say: () => 'Now I heat the dish to evaporate the water, dipping a cold glass rod in now and then. No crystals on the rod yet… keep heating.',
      ms: 7000,
      view: AT_HEAT,
      point: 'dish',
      beats: [
        { at: 600, run: (c) => (c.x.note('gauze:dish'), c.x.note('burner:HIGH')) },
        { at: 2500, run: (c) => { const cp = solCrystalPoint(solFiltrate(c.v, c.s().sol).n); skipUntil(c, () => c.x.dishW() <= cp * 1.4, 5000); c.x.ops.rodTest(); } },
      ],
    },
    {
      id: 'point',
      title: 'Crystals on the rod: stop heating',
      say: () => 'Now small crystals form on the cold rod — the crystallisation point, about a third of the volume left. I stop heating. Never to dryness: that would drive off the water of crystallisation and leave a white powder.',
      ms: 8500,
      view: AT_HEAT,
      point: 'rod',
      beats: [{ at: 1200, run: (c) => { const cp = solCrystalPoint(solFiltrate(c.v, c.s().sol).n); skipUntil(c, () => c.x.dishW() <= cp * 0.85, 3000); c.x.ops.rodTest(); } }, { at: 4500, run: (c) => (c.x.note('burner:OFF'), c.x.note('gauze:none')) }],
    },
    { id: 'cool', title: 'Leave it to cool', say: () => 'As it cools, blue crystals of copper(II) tetraoxosulphate(VI) grow — the colder, the more crystallise.', ms: 6000, view: bench(SPOT.dish, 0.03, 0.42, 0.7), point: 'dish', beats: [{ at: 1500, run: (c) => skipUntil(c, () => c.x.dishT() < c.v.sol.room + 1.5, 20_000) }] },
    { id: 'collect', title: 'Filter, wash, dry', say: () => 'I filter off the crystals, wash them with a little cold distilled water and press them dry between filter papers — never by heating.', ms: 7000, view: AT_FUNNEL, point: 'filterPaper', beats: seq(1000, 1600, [(c) => c.x.ops.filterCrystals(), (c) => c.x.ops.washCrystals('COLD'), (c) => c.x.ops.dryCrystals('PAPER')]) },
    {
      id: 'weigh',
      title: 'Weigh the crystals',
      say: (c) => `The dry blue crystals weigh ${solProduct(c.v, c.s().sol).mass.toFixed(2)} g. I record it to 2 decimal places.`,
      ms: 5500,
      view: AT_BALANCE,
      point: 'balance',
      panel: 'notebook',
      beats: [{ at: 800, run: op((c) => c.x.ops.weighCrystals()) }, { at: 2500, run: (c) => setRec(c, { acidVol: '50.0', mass: solProduct(c.v, c.s().sol).mass.toFixed(2) }) }],
    },
    {
      id: 'calc',
      title: 'The percentage yield',
      say: (c) => {
        const m = solProduct(c.v, c.s().sol).mass;
        const k = solChain(c.v, 50, m);
        return `Moles of acid = ${c.v.sol.acidConc.toFixed(2)} × 50.0 ÷ 1000 = ${p3(k.molesAcid)} mol, the same moles of CuSO₄·5H₂O. Molar mass 249.5, so the maximum is ${p3(k.theoretical)} g. Yield = ${m.toFixed(2)} ÷ ${p3(k.theoretical)} × 100 = ${p3(k.yield!)} per cent — some salt always stays in the solution.`;
      },
      ms: 12000,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [{ at: 2000, run: (c) => { const m = solProduct(c.v, c.s().sol).mass; const k = solChain(c.v, 50, m); setAns(c, { molesAcid: p3(k.molesAcid), molesSalt: p3(k.molesSalt), molarMass: '249.5', theoretical: p3(k.theoretical), yield: p3(k.yield!) }, { molesAcid: 'mol', molesSalt: 'mol', molarMass: 'g mol⁻¹', theoretical: 'g', yield: '%' }); } }],
    },
  ];
}

function pptSteps(v: ChemSaltsVariant): DemoStep[] {
  const i = PPT_INFO[v.ppt.pair];
  return [
    { id: 'mix', title: 'Mix the two solutions', say: () => `25.0 cm³ of ${i.cation.formula}, then 30 cm³ of ${i.anion.formula} — an excess. A ${i.product.colourName} precipitate of ${i.product.formula} forms at once. I stir.`, ms: 7500, view: AT_BEAKER, point: 'beaker', beats: seq(800, 1800, [(c) => c.x.ops.measureCat(25), (c) => c.x.ops.addAn(30), (c) => (c.x.ops.stirPpt(), useBench.setState({ stirUntil: performance.now() + 1200 }))]) },
    { id: 'paper', title: 'Weigh a dry filter paper', say: () => `First I weigh a dry filter paper: ${v.ppt.paper.toFixed(2)} g. I need it to find the mass of the precipitate.`, ms: 5000, view: AT_BALANCE, point: 'balance', beats: [{ at: 1000, run: op((c) => c.x.ops.weighPaper()) }] },
    { id: 'filter', title: 'Filter, rinse, wash', say: () => `I filter, rinse the beaker into the funnel so none is left behind, and wash the precipitate twice with distilled water to remove the soluble ${i.spectator}.`, ms: 8000, view: AT_FUNNEL, point: 'funnel', beats: seq(900, 1500, [(c) => c.x.ops.filterPpt(), (c) => c.x.ops.rinseBeaker(), (c) => c.x.ops.washPpt(), (c) => c.x.ops.washPpt()]) },
    { id: 'dry', title: 'Dry to constant mass', say: (c) => `Into the warm oven, about 100 °C — never over a flame. Weigh, dry again, weigh again: ${pptTotal(c.v, { ...c.s().ppt }, 2).toFixed(2)} g and ${pptTotal(c.v, { ...c.s().ppt }, 3).toFixed(2)} g agree, so it is dry.`, ms: 10000, view: AT_OVEN, point: 'oven', beats: seq(800, 1200, [(c) => c.x.ops.dryPpt(false), (c) => c.x.ops.dryPpt(false), (c) => c.x.ops.weighPpt(), (c) => c.x.ops.dryPpt(false), (c) => c.x.ops.weighPpt()]) },
    {
      id: 'calc',
      title: 'Mass and percentage yield',
      say: (c) => {
        const t = pptTotal(c.v, c.s().ppt, 3);
        const m = Number((t - c.v.ppt.paper).toFixed(2));
        const k = pptChain(c.v, 25, m);
        return `Precipitate = ${t.toFixed(2)} − ${c.v.ppt.paper.toFixed(2)} = ${m.toFixed(2)} g. Moles of ${i.cation.formula} = ${p3(k.molesAcid)}; theoretical mass = ${p3(k.molesAcid)} × ${i.product.M} = ${p3(k.theoretical)} g; yield ${p3(k.yield!)} per cent.`;
      },
      ms: 11000,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 1500,
          run: (c) => {
            const w = c.s().ppt;
            const t1 = pptTotal(c.v, w, 2);
            const t2 = pptTotal(c.v, w, 3);
            const m = Number((t2 - c.v.ppt.paper).toFixed(2));
            const k = pptChain(c.v, 25, m);
            setRec(c, { catVol: '25.0', anVol: '30.0', paper: c.v.ppt.paper.toFixed(2), total1: t1.toFixed(2), total2: t2.toFixed(2), ppt: m.toFixed(2) });
            setAns(c, { molesAcid: p3(k.molesAcid), molesSalt: p3(k.molesSalt), molarMass: String(k.molarMass), theoretical: p3(k.theoretical), yield: p3(k.yield!) }, { molesAcid: 'mol', molesSalt: 'mol', molarMass: 'g mol⁻¹', theoretical: 'g', yield: '%' });
          },
        },
      ],
    },
  ];
}

function chromSteps(): DemoStep[] {
  return [
    { id: 'line', title: 'A pencil baseline', say: () => 'A pencil line 1.5 cm from the bottom. Pencil, never ink: graphite does not dissolve in the solvent, but ink would run.', ms: 5500, view: AT_PAPER, point: 'pencil', beats: [{ at: 1800, run: op((c) => c.x.ops.drawLine('PENCIL', 1.5)) }] },
    { id: 'spots', title: 'Small, concentrated spots', say: () => 'With capillary tubes I spot the ink, dye A and dye B on the line, let them dry, and spot each again on the same place.', ms: 8000, view: AT_PAPER, point: 'vial:INK', beats: seq(800, 800, [(c) => c.x.ops.spot('INK'), (c) => c.x.ops.spot('A'), (c) => c.x.ops.spot('B'), (c) => c.x.ops.drySpots(), (c) => c.x.ops.spot('INK'), (c) => c.x.ops.spot('A'), (c) => c.x.ops.spot('B'), (c) => c.x.ops.drySpots()]) },
    { id: 'tank', title: 'Solvent below the line; cover', say: () => 'Water 1 cm deep — below the baseline, or the spots would dissolve into it. I stand the paper in and cover the tank so the air inside stays saturated.', ms: 7000, view: AT_TANK, point: 'tank', beats: seq(800, 1500, [(c) => c.x.ops.pourSolvent('WATER', 1), (c) => c.x.ops.placePaper(), (c) => c.x.ops.cover(true)]) },
    { id: 'run', title: 'The solvent rises (time-lapse)', say: () => 'The solvent climbs the paper, fast at first then slower, carrying each dye at its own rate. The ink separates into coloured spots.', ms: 9000, view: AT_TANK, point: 'tank', beats: Array.from({ length: 8 }, (_, k) => ({ at: 600 + k * 900, run: (c: DemoCtx) => skipUntil(c, () => c.x.devSeconds() >= ((k + 1) / 8) * ((11 * 11) / c.v.chrom.K.WATER), 4000) })) },
    { id: 'out', title: 'Out — mark the front at once', say: () => 'Near the top I take the paper out and mark the solvent front in pencil straight away, before it dries and fades.', ms: 6000, view: AT_PAPER, point: 'paper', beats: seq(800, 1600, [(c) => c.x.ops.removePaper(), (c) => c.x.ops.markFront(), (c) => c.x.ops.dryPaper()]) },
    {
      id: 'measure',
      title: 'Measure from the baseline; Rf',
      say: (c) => {
        const sd = chromSolventDist(c.v, c.s().chrom) ?? 0;
        const a = chromSpots(c.v, c.s().chrom).find((p) => p.lane === 'A')?.dist ?? 0;
        return `From the baseline: the solvent moved ${sd.toFixed(1)} cm, dye A ${a.toFixed(1)} cm, so Rf of A = ${a.toFixed(1)} ÷ ${sd.toFixed(1)} = ${(Number(a.toFixed(1)) / Number(sd.toFixed(1))).toFixed(2)}. An ink spot at the same height and colour as a pure dye shows the ink contains it.`;
      },
      ms: 11000,
      view: { mode: 'read' as const, spot: null },
      point: 'ruler',
      panel: 'notebook',
      beats: [
        {
          at: 2500,
          run: (c) => {
            const w = c.s().chrom;
            const sd = Number((chromSolventDist(c.v, w) ?? 0).toFixed(1));
            const sp = chromSpots(c.v, w);
            const d = (l: 'A' | 'B') => Number((sp.find((p) => p.lane === l)?.dist ?? 0).toFixed(1));
            const ink = sp.filter((p) => p.lane === 'INK').sort((a, b) => a.dist - b.dist);
            const rec: Partial<ChemSaltsState['rec']> = { solvent: sd.toFixed(1), spotA: d('A').toFixed(1), spotB: d('B').toFixed(1), hasA: 'yes', hasB: c.v.chrom.ink.includes(c.v.chrom.B) ? 'yes' : 'no', nComp: String(ink.length) };
            ink.forEach((p, k) => {
              const dd = Number(p.dist.toFixed(1));
              rec[`ink${k + 1}` as 'ink1'] = dd.toFixed(1);
              rec[`rf${k + 1}` as 'rf1'] = (dd / sd).toFixed(2);
            });
            setRec(c, rec);
            setAns(c, { rfA: (d('A') / sd).toFixed(2), rfB: (d('B') / sd).toFixed(2) }, {});
          },
        },
      ],
    },
  ];
}

function mpSteps(v: ChemSaltsVariant): DemoStep[] {
  const portions = Math.ceil(mpMinWater(v) / 10);
  const heatRun = (sample: 'IMPURE' | 'PURE', n: number): DemoStep[] => [
    { id: `pack-${n}`, title: `Capillary: ${sample === 'IMPURE' ? 'impure' : 'recrystallised'} sample`, say: () => '2–3 mm of dry powder in a capillary sealed at one end, fastened to the thermometer with the sample level with the bulb, in the oil bath.', ms: 6000, view: AT_OIL, point: 'capillary', beats: [{ at: 600, run: (c) => { skipUntil(c, () => c.x.bathT() <= 100, 10_000); c.x.ops.pack(sample); } }, { at: 2200, run: op((c) => c.x.ops.attach()) }, { at: 3200, run: (c) => (c.x.note('gauze:oil'), c.x.note('burner:HIGH')) }] },
    { id: `fast-${n}`, title: 'Fast to 110 °C, then slowly', say: () => 'Quickly up to about 110 °C, then a low flame: about 2 °C a minute near the melting point, so the thermometer keeps up with the sample.', ms: 6500, view: AT_OIL, point: 'burner', beats: [{ at: 1000, run: (c) => skipUntil(c, () => c.x.bathT() >= 108, 3000) }, { at: 3500, run: (c) => c.x.note('burner:LOW') }] },
    { id: `melt-${n}`, title: 'Read: melting starts … all clear', say: (c) => { const r = [...c.s().mp.runs].reverse().find((q) => q.done); return r && r.sample === sample ? `It started to melt at ${r.start?.toFixed(1)} °C and was all clear at ${r.end?.toFixed(1)} °C.` : 'The first drop of liquid… I read the thermometer. Now the last of the solid goes — I read it again.'; }, ms: 8000, view: { mode: 'read' as const, spot: null }, point: 'oilBath', beats: [{ at: 1000, run: (c) => { const run = c.x.openRun(); if (run) skipUntil(c, () => c.x.meltFraction(c.x.openRun()!) > 0, 1000); c.x.ops.recordStart(); } }, { at: 4500, run: (c) => { const run = c.x.openRun(); if (run) skipUntil(c, () => c.x.meltFraction(c.x.openRun()!) >= 1, 1000); c.x.ops.recordEnd(); c.x.note('burner:OFF'); } }] },
  ];
  return [
    { id: 'weigh', title: 'Weigh the impure sample', say: () => `The impure benzoic acid weighs ${v.mp.impure.toFixed(2)} g. It contains sand, charcoal and a soluble impurity.`, ms: 4500, view: AT_BALANCE, point: 'balance', beats: [{ at: 1200, run: op((c) => c.x.ops.weighImpure()) }] },
    { id: 'dissolve', title: 'The minimum of boiling water', say: () => `On the gauze, boiling, I add water 10 cm³ at a time — ${portions * 10} cm³ just dissolves it. More water would leave more benzoic acid dissolved when cold. The sand and charcoal never dissolve.`, ms: 2500 + portions * 600, view: AT_HEAT, point: 'hotWater', beats: [{ at: 500, run: (c) => (c.x.note('gauze:beaker'), c.x.note('burner:HIGH')) }, ...seq(1300, 600, Array.from({ length: portions }, () => (c: DemoCtx) => c.x.ops.addWater()))] },
    { id: 'hot', title: 'Filter hot through a warm funnel', say: () => 'I warm the funnel with boiling water first, then filter the hot solution quickly: the sand and charcoal stay on the paper.', ms: 6500, view: AT_FUNNEL, point: 'funnel', beats: [{ at: 800, run: op((c) => c.x.ops.warmFunnel()) }, { at: 2400, run: (c) => (c.x.ops.hotFilter(), c.x.note('burner:OFF'), c.x.note('gauze:none')) }] },
    { id: 'cool', title: 'Cool slowly, then ice', say: () => 'Slow cooling gives large, pure needle crystals; then the ice bath leaves less dissolved. I filter them off, wash with a little ice-cold water and dry them.', ms: 9000, view: AT_FUNNEL, point: 'iceBath', beats: seq(800, 1300, [(c) => c.x.ops.cool('SLOW'), (c) => c.x.ops.ice(), (c) => c.x.ops.collect(), (c) => c.x.ops.washMp(), (c) => c.x.ops.dryMp()]) },
    { id: 'weigh-p', title: 'Weigh the pure crystals', say: (c) => `${mpProduct(c.v, c.s().mp).mass.toFixed(2)} g of white crystals: a recovery of ${p3((mpProduct(c.v, c.s().mp).mass / c.v.mp.impure) * 100)} per cent.`, ms: 5000, view: AT_BALANCE, point: 'balance', beats: [{ at: 1000, run: op((c) => c.x.ops.weighPure()) }] },
    ...heatRun('IMPURE', 0),
    ...heatRun('PURE', 1),
    {
      id: 'compare',
      title: 'Purer: higher and sharper',
      say: () => `The impure sample melted lower and over a wider range; the recrystallised one sharply, close to ${MP_LIT} °C. Impurities lower the melting point and broaden its range.`,
      ms: 9000,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 1500,
          run: (c) => {
            const w = c.s().mp;
            const ri = w.runs.find((r) => r.sample === 'IMPURE' && r.done);
            const rp = w.runs.find((r) => r.sample === 'PURE' && r.done);
            const pure = mpProduct(c.v, w).mass;
            if (!ri || !rp) return;
            const f = (x: number | null) => (x ?? 0).toFixed(1);
            setRec(c, { impure: c.v.mp.impure.toFixed(2), pure: pure.toFixed(2), iStart: f(ri.start), iEnd: f(ri.end), pStart: f(rp.start), pEnd: f(rp.end) });
            setAns(c, { recovery: p3((pure / c.v.mp.impure) * 100), impureWidth: (Number(f(ri.end)) - Number(f(ri.start))).toFixed(1), pureWidth: (Number(f(rp.end)) - Number(f(rp.start))).toFixed(1), depression: (MP_LIT - Number(f(ri.end))).toFixed(1) }, { recovery: '%', impureWidth: '°C', pureWidth: '°C', depression: '°C' });
          },
        },
      ],
    },
  ];
}

export function demoScript(v: ChemSaltsVariant, precautions: string[]): DemoStep[] {
  const body = v.task === 'SOL' ? solSteps(v) : v.task === 'PPT' ? pptSteps(v) : v.task === 'CHROM' ? chromSteps() : mpSteps(v);
  return [
    ...intro(v),
    ...body,
    { id: 'precautions', title: 'Precautions', say: () => `Precautions I took: ${precautions.slice(0, 3).join(' ')}`, ms: 8000, view: AT_BENCH, beats: [] },
    { id: 'done', title: 'Your turn!', say: () => 'That is the whole practical. Now try it yourself with your own samples — and ask me if anything is unclear.', ms: 4500, view: AT_BENCH, beats: [{ at: 300, run: (c) => c.x.note('burner:OFF') }] },
  ];
}

const demoEmpty = (task: SaltsTask): ChemSaltsState => ({ ...emptyChemSaltsState(), task });
const noop = () => undefined;

/** The salts demo: its own seed, clock and in-memory state, played by the kit's demo engine. */
export function useSaltsDemo({ studentSeed, task, startedAt, precautions, active, onFinished }: { studentSeed: number; task: SaltsTask; startedAt: string; precautions: string[]; active: boolean; onFinished: () => void }) {
  const seed = useMemo(() => demoSeed(studentSeed), [studentSeed]);
  const clock = useRef(makeClock()).current;
  const [state, setState] = useState<ChemSaltsState>(() => demoEmpty(task));
  const x = useSalts({ seed, state, onChange: setState, readOnly: false, startedAt, autoTask: false, clock, variant: undefined });
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
