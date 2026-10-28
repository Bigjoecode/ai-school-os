// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-chem-rates.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHEM_RATES,
  RATES_CROSS_ACID,
  RATES_CROSS_CARD,
  RATES_CROSS_MADE_UP,
  RATES_INTERVAL,
  RATES_TEMP_CARD,
  RATES_TEMP_THIO,
  chemRatesStateSchema,
  chemRatesVariant,
  emptyChemRatesState,
  phyFit,
  ratesCrossTemp,
  ratesCrossVanish,
  ratesCrossVisibility,
  ratesCrossX,
  ratesMgEnd,
  ratesMgGas,
  ratesMgInitialRate,
  ratesMgSyringe,
  ratesMgTheory,
  rubricTotal,
  type ChemRatesState,
  type RatesCrossRun,
  type RatesMgRun,
} from '@aischool/shared';
import { chemRatesGrader, ratesUnit } from '../src/practicals/graders/chem-rates';

const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 7919);
const autoOf = (s: ChemRatesState, seed: number) => {
  const out = chemRatesGrader.grade(s, seed);
  return { out, by: Object.fromEntries(out.auto.map((c) => [c.id, c.awarded])) as Record<string, number>, total: out.auto.reduce((t, c) => t + c.awarded, 0) };
};
const AUTO_MAX = CHEM_RATES.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const half = (x: number) => Math.round(x * 2) / 2;
const lineAcross = (pts: { x: number; y: number }[]) => {
  const f = phyFit(pts)!;
  const xs = pts.map((p) => p.x);
  const a = Math.min(...xs);
  const b = Math.max(...xs);
  return { x1: a, y1: f.intercept + f.slope * a, x2: b, y2: f.intercept + f.slope * b };
};

/** Magnesium work as a careful student records it; options bring in typical mistakes. */
function mg(seed: number, o: { dirty?: boolean; bungLag?: number; watchLag?: number; noRun2?: boolean; straight?: boolean; misread?: number; late?: number; stopEarly?: boolean; rateUnit?: string; theory?: number; sameConc?: boolean; noZero?: boolean } = {}): ChemRatesState {
  const v = chemRatesVariant(seed);
  const s = emptyChemRatesState();
  s.task = 'MG';
  const concs = o.noRun2 ? [1.0] : [1.0, o.sameConc ? 1.0 : 0.5];
  const slots = new Set<number>([0]);
  const cells: Record<number, [string, string]> = {};
  concs.forEach((conc, i) => {
    const run: RatesMgRun = { conc, weighed: true, cleaned: !o.dirty, checked: true, start: o.noZero ? 4 : 0, dropped: true, bungLag: o.bungLag ?? 1.2, watchLag: o.watchLag ?? 0.4, done: true };
    s.mgRuns[i] = run;
    const end = ratesMgEnd(v, conc, run.cleaned);
    const last = o.stopEarly ? Math.floor((end - 1) / RATES_INTERVAL) : Math.ceil((end + 45) / RATES_INTERVAL);
    for (let k = 1; k <= last; k++) {
      const at = k * RATES_INTERVAL + (o.late ?? ((k % 3) - 1) * 0.8);
      s.readings.push({ run: i, at });
      slots.add(k * RATES_INTERVAL);
      const shown = ratesMgSyringe(v, run, at + run.watchLag!);
      (cells[k * RATES_INTERVAL] ??= ['', ''])[i] = String(half(shown + (o.misread ?? 0)));
    }
  });
  s.mgRows = [...slots].sort((a, b) => a - b);
  s.mg = s.mgRows.map((t) => ({ t: String(t), v1: t === 0 ? '0' : (cells[t]?.[0] ?? ''), v2: t === 0 && concs.length > 1 ? '0' : (cells[t]?.[1] ?? '') }));
  s.curves = { a: o.straight ? 'STRAIGHT' : 'SMOOTH', b: concs.length > 1 ? 'SMOOTH' : null };
  const rA = ratesMgInitialRate(v, 1.0);
  const rB = ratesMgInitialRate(v, 0.5);
  s.tangents = { a: { x1: 0, y1: 0, x2: 50, y2: 50 * rA }, b: concs.length > 1 ? { x1: 0, y1: 0, x2: 80, y2: 80 * rB } : null };
  s.answers.rateA = { value: rA.toFixed(2), unit: o.rateUnit ?? 'cm³ s⁻¹' };
  if (concs.length > 1) s.answers.rateB = { value: rB.toFixed(2), unit: o.rateUnit ?? 'cm³/s' };
  s.answers.vTheory = { value: String(o.theory ?? ratesMgTheory(v)), unit: 'cm3' };
  s.written = { explanation: 'The rate is fastest at the start and slows as the magnesium is used up; it levels off when no magnesium is left. More concentrated acid means more frequent collisions.', precautions: 'The bung was replaced at once. The magnesium was cleaned with sandpaper.' };
  return s;
}

/** Disappearing-cross work; options bring in typical mistakes. */
function cross(seed: number, o: { total?: number; side?: boolean; noRinse?: boolean; early?: number; badInv?: boolean; noTemp?: boolean; tempsBefore?: boolean; watchLag?: number; fewer?: number } = {}): ChemRatesState {
  const v = chemRatesVariant(seed);
  const s = emptyChemRatesState();
  s.task = 'CROSS';
  const add = (kind: 'CONC' | 'TEMP', thio: number, water: number, bath: number | null) => {
    const n = s.made++;
    const run: RatesCrossRun = { n, kind, thio, water, acid: RATES_CROSS_ACID, bath, rinsed: !(o.noRinse && n > 0), swirled: true, watchLag: o.watchLag ?? 0.3, elapsed: null, top: !o.side, temp: null, tempAfter: false, done: true };
    const tv = ratesCrossVanish(v, run);
    const stopAt = o.early ? tv * o.early : tv + 0.35;
    run.elapsed = Math.round((stopAt - run.watchLag!) * 100) / 100;
    if (kind === 'TEMP' && !o.noTemp) {
      run.temp = Math.round(ratesCrossTemp(v, run, o.tempsBefore ? -1 : tv / 2) * 100) / 100;
      run.tempAfter = !o.tempsBefore;
    }
    s.crossRuns.push(run);
    const t = run.elapsed.toFixed(1);
    s.cross.push({ v: String(thio), w: String(water), th: run.temp === null ? '' : run.temp.toFixed(0), t, inv: o.badInv ? (1 / Number(t) / 10).toPrecision(3) : (1 / Number(t)).toPrecision(3) });
  };
  for (const thio of RATES_CROSS_CARD.slice(0, 5 - (o.fewer ?? 0))) add('CONC', thio, (o.total ?? RATES_CROSS_MADE_UP) - thio, null);
  for (const b of RATES_TEMP_CARD) add('TEMP', RATES_TEMP_THIO, RATES_CROSS_MADE_UP - RATES_TEMP_THIO, b);
  const pts = s.crossRuns.map((r, i) => ({ r, row: s.cross[i]! })).filter((x) => x.r.kind === 'CONC').map((x) => ({ x: Number(x.row.v), y: Number(x.row.inv) }));
  s.line = lineAcross(pts);
  const f = phyFit(pts)!;
  s.answers.slope = { value: f.slope.toPrecision(3), unit: 's⁻¹ cm⁻³' };
  s.answers.tQuery = { value: (1 / (f.intercept + f.slope * v.queryVol)).toPrecision(3), unit: 's' };
  const temps = s.crossRuns.map((r, i) => ({ r, row: s.cross[i]! })).filter((x) => x.r.kind === 'TEMP' && x.row.th);
  if (temps.length >= 2) {
    const tf = phyFit(temps.map((x) => ({ x: Number(x.row.th), y: Math.log(1 / Number(x.row.t)) })))!;
    s.answers.factor = { value: Math.exp(10 * tf.slope).toFixed(1), unit: '' };
  }
  s.written = { explanation: 'More concentrated: more particles, so more frequent collisions. Hotter: particles move faster and more have energy above the activation energy.', precautions: 'The total volume was kept at 50 cm³. I looked down vertically through the solution at the same cross.' };
  return s;
}

test('rates: rubric 24 (20 AUTO); the variant is fixed per seed and in range', () => {
  assert.equal(rubricTotal(CHEM_RATES.rubric), 24);
  assert.equal(AUTO_MAX, 20);
  assert.deepEqual(chemRatesVariant(5), chemRatesVariant(5));
  assert.notDeepEqual(chemRatesVariant(5), chemRatesVariant(6));
  for (const seed of SEEDS) {
    const v = chemRatesVariant(seed);
    assert.ok(v.mgMass >= 0.036 && v.mgMass <= 0.06 && v.room >= 24 && v.room <= 30 && v.t50 >= 16 && v.t50 <= 24);
  }
});

test('rates: magnesium kinetics — stoichiometric volume, the Mg runs out, rate ∝ [acid]^order, Arrhenius, oxide layer', () => {
  for (const seed of SEEDS.slice(0, 10)) {
    const v = chemRatesVariant(seed);
    const final = ratesMgGas(v, 1, true, 2000);
    // n(H₂) = n(Mg); V = nRT/p at the room's temperature: within 3 % of 24 000 cm³ mol⁻¹ × n.
    assert.ok(Math.abs(final / ratesMgTheory(v) - 1) < 0.04, `final ${final} vs ${ratesMgTheory(v)}`);
    // the same final volume with half the acid (acid in excess), only later
    assert.ok(Math.abs(ratesMgGas(v, 0.5, true, 2000) - final) < 0.01);
    assert.ok(ratesMgEnd(v, 0.5, true) > 1.6 * ratesMgEnd(v, 1, true));
    // decreasing rate: equal time steps give smaller and smaller volumes
    const g = [0, 30, 60, 90].map((t) => ratesMgGas(v, 1, true, t));
    assert.ok(g[1]! - g[0]! > g[2]! - g[1]! && g[2]! - g[1]! > g[3]! - g[2]!);
    // initial rate ratio ≈ 2^order (the flask's warming makes it a little different)
    const ratio = ratesMgInitialRate(v, 1) / ratesMgInitialRate(v, 0.5);
    assert.ok(Math.abs(ratio / 2 ** v.order - 1) < 0.08, `ratio ${ratio} order ${v.order}`);
    // warmer room → faster; uncleaned ribbon → slow start
    assert.ok(ratesMgInitialRate({ ...v, room: v.room + 10 }, 1) > ratesMgInitialRate(v, 1) * 1.3);
    assert.ok(ratesMgGas(v, 1, false, 10) < ratesMgGas(v, 1, true, 10) * 0.5);
    // the syringe: nothing before the bung, gas made before it is lost, never more than produced
    const run = { conc: 1, cleaned: true, bungLag: 3, start: 0 };
    assert.equal(ratesMgSyringe(v, run, 2), 0);
    assert.ok(ratesMgSyringe(v, run, 2000) < final - 1);
  }
});

test('rates: thiosulphate kinetics — 1/t ∝ concentration, faster when hotter, the cross fades', () => {
  for (const seed of SEEDS.slice(0, 10)) {
    const v = chemRatesVariant(seed);
    const base = { n: -1, bath: null, acid: 5, rinsed: true, swirled: true };
    const t50 = ratesCrossVanish(v, { ...base, thio: 50, water: 0 });
    const t25 = ratesCrossVanish(v, { ...base, thio: 25, water: 25 });
    assert.ok(Math.abs(t25 / t50 - 2) < 0.15, `${t25} / ${t50}`);
    assert.ok(Math.abs(ratesCrossVanish({ ...v, room: 25 }, { ...base, thio: 50, water: 0 }) - v.t50) < 1.5);
    const hot = ratesCrossVanish(v, { ...base, thio: 10, water: 40, bath: 50 });
    const cool = ratesCrossVanish(v, { ...base, thio: 10, water: 40, bath: 30 });
    assert.ok(cool / hot > 2.5 && cool / hot < 6);
    // not made up to 50 cm³: a shallower, more concentrated liquid — a different time
    assert.ok(Math.abs(ratesCrossVanish(v, { ...base, thio: 25, water: 0 }) - t25) > 0.1);
    assert.equal(ratesCrossVisibility(0), 1);
    assert.equal(ratesCrossVisibility(1), 0);
    assert.ok(Math.abs(ratesCrossX(v, { ...base, thio: 50, water: 0 }, t50) - 1) < 0.01);
  }
});

test('rates: ideal magnesium work gets every AUTO mark across 40 seeds', () => {
  for (const seed of SEEDS) {
    const { total, out } = autoOf(mg(seed), seed);
    assert.equal(total, AUTO_MAX, `seed ${seed}: ${out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id}: ${c.note}`).join(' | ')}`);
    assert.deepEqual(out.ai.map((a) => a.criterionId), ['explanation', 'precautions']);
  }
});

test('rates: ideal disappearing-cross work gets every AUTO mark across 40 seeds', () => {
  for (const seed of SEEDS) {
    const { total, out } = autoOf(cross(seed), seed);
    assert.equal(total, AUTO_MAX, `seed ${seed}: ${out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id}: ${c.note}`).join(' | ')}`);
  }
});

test('rates: magnesium mistakes lose the right marks', () => {
  const seed = SEEDS[3]!;
  const lose = (o: Parameters<typeof mg>[1], id: string, by = 1) => {
    const { by: got } = autoOf(mg(seed, o), seed);
    const full = CHEM_RATES.rubric.find((c) => c.id === id)!.marks;
    assert.equal(got[id], full - by, `${JSON.stringify(o)} → ${id} ${got[id]} ${autoOf(mg(seed, o), seed).out.auto.find((c) => c.id === id)!.note}`);
  };
  lose({ dirty: true }, 'setup');
  lose({ bungLag: 6 }, 'setup');
  lose({ noZero: true }, 'setup');
  lose({ watchLag: 5 }, 'procedure');
  lose({ noRun2: true }, 'procedure');
  lose({ sameConc: true }, 'procedure');
  lose({ stopEarly: true }, 'procedure');
  lose({ straight: true }, 'graph');
  lose({ misread: 3 }, 'readings', 2);
  lose({ late: 6 }, 'readings');
  lose({ rateUnit: 'cm³' }, 'units');
  lose({ theory: 24 }, 'calculations');
  lose({ noRun2: true }, 'calculations');
  // an empty attempt scores nothing and does not crash
  const empty = emptyChemRatesState();
  empty.task = 'MG';
  assert.equal(autoOf(empty, seed).total, 0);
});

test('rates: disappearing-cross mistakes lose the right marks', () => {
  const seed = SEEDS[5]!;
  const lose = (o: Parameters<typeof cross>[1], id: string, by = 1) => {
    const { by: got } = autoOf(cross(seed, o), seed);
    const full = CHEM_RATES.rubric.find((c) => c.id === id)!.marks;
    assert.equal(got[id], full - by, `${JSON.stringify(o)} → ${id} ${got[id]} ${autoOf(mg(seed, o), seed).out.auto.find((c) => c.id === id)!.note}`);
  };
  lose({ total: 40 }, 'setup');
  lose({ noRinse: true }, 'setup');
  lose({ side: true }, 'procedure');
  lose({ early: 0.6 }, 'procedure');
  lose({ watchLag: 4 }, 'procedure');
  lose({ fewer: 2 }, 'procedure');
  lose({ badInv: true }, 'readings');
  lose({ tempsBefore: true }, 'readings');
  const empty = emptyChemRatesState();
  empty.task = 'CROSS';
  assert.equal(autoOf(empty, seed).total, 0);
});

test('rates: units as students write them', () => {
  for (const u of ['cm³ s⁻¹', 'cm3/s', 'cm^3 s^-1', 'cm3s-1', 'ml/s', 'cm³/sec']) assert.equal(ratesUnit(u), 'cm3/s', u);
  assert.equal(ratesUnit('cm³/min'), 'cm3/min');
  for (const u of ['s⁻¹ cm⁻³', 's-1 cm-3', '/s/cm3', 'cm⁻³ s⁻¹', 's^-1cm^-3']) assert.equal(ratesUnit(u), '/s/cm3', u);
  assert.equal(ratesUnit('seconds'), 's');
  assert.equal(ratesUnit('no unit'), 'none');
  assert.equal(ratesUnit(''), '');
});

test('rates: the state schema accepts real work and rejects garbage', () => {
  assert.ok(chemRatesStateSchema.safeParse(emptyChemRatesState()).success);
  assert.ok(chemRatesStateSchema.safeParse(mg(SEEDS[0]!)).success);
  assert.ok(chemRatesStateSchema.safeParse(cross(SEEDS[0]!)).success);
  const bad: unknown[] = [
    null,
    { v: 2 },
    { ...emptyChemRatesState(), task: 'ZINC' },
    { ...emptyChemRatesState(), mgRuns: [null, null, null] },
    { ...emptyChemRatesState(), readings: [{ run: 3, at: 10 }] },
    { ...emptyChemRatesState(), crossRuns: Array.from({ length: 17 }, () => cross(SEEDS[0]!).crossRuns[0]) },
    { ...emptyChemRatesState(), mg: [{ t: 'x'.repeat(41), v1: '', v2: '' }] },
    { ...emptyChemRatesState(), curves: { a: 'WIGGLY', b: null } },
    { ...emptyChemRatesState(), written: { explanation: 1, precautions: '' } },
  ];
  for (const b of bad) assert.equal(chemRatesStateSchema.safeParse(b).success, false, JSON.stringify(b)?.slice(0, 80));
});
