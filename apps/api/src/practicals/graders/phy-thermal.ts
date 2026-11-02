import {
  PHY_THERMAL,
  THERM_C_WATER,
  THERM_HEAT_TIME,
  phyLineSlope,
  phyThermalVariant,
  thermCRef,
  thermIdealExpansion,
  thermIndicates,
  thermMetal,
  thermPower,
  thermBore,
  thermSnapshots,
  thermThermo,
  type CriterionScore,
  type PhyAnswer,
  type PhyThermalState,
  type PhyThermalVariant,
  type ThermEvent,
  type ThermPhys,
  type ThermRow,
  type ThermTask,
} from '@aischool/shared';
import { decimalPlaces, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import { gradeGraph, slopeAccepted, type XY } from './phy-common';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => PHY_THERMAL.rubric.find((c) => c.id === id)!;
const num = (raw: string | undefined) => parseNumber(raw);
const filled = (raw: string | undefined) => !!raw && raw.trim().length > 0;
const avg = (xs: number[]) => xs.reduce((t, x) => t + x, 0) / (xs.length || 1);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dpIn = (raw: string | undefined, lo: number, hi: number) => filled(raw) && decimalPlaces(raw!) >= lo && decimalPlaces(raw!) <= hi;

/** A thermal unit as written → 'K-1', 'cm/K', 'C', 'K', 'J', 'kJ', 'W', 'J/kgK', 'none', '' or 'other:…'. */
export function thermUnit(raw: string | null | undefined): string {
  const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁻': '-', '⁺': '+' };
  const s = (raw ?? '')
    .replace(/[⁰¹²³⁻⁺]/g, (c) => SUP[c]!)
    .replace(/[−–—]/g, '-')
    .toLowerCase()
    .replace(/degrees?|deg|celsius|centigrade/g, 'c')
    .replace(/kelvins?/g, 'k')
    .replace(/joules?/g, 'j')
    .replace(/watts?/g, 'w')
    .replace(/kilograms?/g, 'kg')
    .replace(/centimet(re|er)s?/g, 'cm')
    .replace(/\bper\b/g, '/')
    .replace(/[°º˚()\s^·.*×]/g, '')
    .replace(/oc/g, 'c');
  if (!s) return '';
  if (/^(nounit|none|nil|-+|unitless)$/.test(s)) return 'none';
  if (/^(k-1|\/k|1\/k|c-1|\/c|1\/c|perk|perc)$/.test(s)) return 'K-1';
  if (/^(cm\/k|cmk-1|cm\/c|cmc-1)$/.test(s)) return 'cm/K';
  if (/^c$/.test(s)) return 'C';
  if (/^k$/.test(s)) return 'K';
  if (/^j$/.test(s)) return 'J';
  if (/^kj$/.test(s)) return 'kJ';
  if (/^(w|j\/s|js-1)$/.test(s)) return 'W';
  if (/^j(\/kg\/?|kg-1)(k|c)(-1)?$/.test(s) || /^j\/kg(k|c)$/.test(s)) return 'J/kgK';
  return `other:${s}`;
}

/** Match each written value to a distinct instrument value within tol (greedy, closest first). */
function matchAll(written: (number | null)[], truth: number[], tol: number): boolean[] {
  const used = new Set<number>();
  return written.map((w) => {
    if (w === null) return false;
    let best = -1;
    for (let k = 0; k < truth.length; k++) if (!used.has(k) && Math.abs(truth[k]! - w) <= tol + 1e-9 && (best < 0 || Math.abs(truth[k]! - w) < Math.abs(truth[best]! - w))) best = k;
    if (best < 0) return false;
    used.add(best);
    return true;
  });
}
const near = (x: number | null, truths: number[], tol: number) => x !== null && truths.some((t) => withinAbs(x, t, tol));
/** Three marks in proportion to the tests passed (all: 3, two thirds: 2, half: 1). */
const prop3 = (good: number, all: number) => (all === 0 ? 0 : good === all ? 3 : good >= (2 * all) / 3 ? 2 : good >= all / 2 ? 1 : 0);
const sorted = (ev: readonly ThermEvent[]) => [...ev].sort((a, b) => a.t - b.t);
const firstOf = (ev: readonly ThermEvent[], pred: (e: ThermEvent) => boolean, after = -Infinity) => sorted(ev).find((e) => e.t >= after && pred(e)) ?? null;

type Part = { auto: CriterionScore[]; ai: AiItem[]; solution: string[]; facts: string[] };
type Read = { k: string; t: number; p: ThermPhys; x: number };

function readsOf(s: PhyThermalState, v: PhyThermalVariant, task: ThermTask, extra: number[] = []) {
  const times = [...s.reads.map((r) => r.t), ...extra];
  const tEnd = Math.max(0, ...times, ...s.events.map((e) => e.t)) + 0.1;
  const snap = thermSnapshots(v, s.events, [...times, tEnd]);
  const reads: Read[] = s.reads.map((r) => {
    const p = snap.get(r.t)!;
    return { k: r.k, t: r.t, p, x: thermIndicates(v, p, r.k, task, r.t) };
  });
  return { reads, snap, end: snap.get(tEnd)! };
}

// ================================================================== EXPANSION

function gradeExpansion(s: PhyThermalState, v: PhyThermalVariant): Part {
  const auto: CriterionScore[] = [];
  const { reads, end } = readsOf(s, v, 'EXPANSION');
  const C = s.cells;
  const xIdeal = thermIdealExpansion(v);
  const cold = (r: Read) => r.p.rod - v.room < 0.3;
  const thermo = reads.filter((r) => r.k === 'thermo');
  const thCold = thermo.filter(cold).map((r) => r.x);
  const thHot = thermo.filter((r) => r.p.thJ >= v.boil - 0.3).map((r) => r.x);
  const micro = reads.filter((r) => r.k === 'micro' && r.p.contact);
  const mCold = micro.filter(cold).map((r) => r.x);
  const mHot = micro.filter((r) => r.p.rod - v.room > 5).map((r) => r.x);
  const mSteady = micro.filter((r) => v.alpha * v.L0 * v.eff * (r.p.rod - v.room) >= 0.99 * xIdeal).map((r) => r.x);
  const rule = reads.filter((r) => r.k === 'rule');
  const touches = s.events.filter((e) => e.e === 'micro:ratchet' || e.e === 'micro:thimble');
  const steamed = s.events.some((e) => e.e === 'boiler:on');
  let l0 = num(C.l0);
  if (l0 !== null && l0 < 100) l0 *= 10; // written in cm
  const th1 = num(C.th1);
  const th2 = num(C.th2);
  const r1 = num(C.r1);
  const r2 = num(C.r2);
  const r2b = num(C.r2b);

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (steamed && !end.strained) k++;
    else n.push(steamed ? 'Back the micrometer off before you pass the steam: left touching, the rod pushed against it as it expanded and was strained (it bows, and the reading is unreliable).' : 'No steam was passed through the jacket.');
    if (touches.length && touches.every((e) => e.e === 'micro:ratchet')) k++;
    else if (!touches.length) n.push('The micrometer was never screwed up to the rod.');
    else n.push('Use the ratchet every time: turning the thimble tight presses the spindle on too hard and the reading is too high.');
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    if (rule.length && filled(C.l0)) k++;
    else n.push('Measure the length of the rod l₀ with the metre rule at room temperature, before it goes into the jacket.');
    if (thCold.length && mCold.length) k++;
    else n.push('Before the steam, read the thermometer (θ₁) and the micrometer as its ratchet just touches the rod (the first reading).');
    if (thHot.length) k++;
    else n.push('Pass the steam until the thermometer in the jacket is steady at the steam’s temperature, then read θ₂.');
    if (mSteady.length && near(r2, mSteady, 0.011)) k++;
    else n.push(mHot.length ? 'The rod was still expanding when you took the final micrometer reading: it lags behind the steam. Wait, screw the micrometer up again, and repeat until two readings agree.' : 'Screw the micrometer up to the hot rod (ratchet) and take the final reading.');
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- readings (5)
  {
    const n: string[] = [];
    let k = 0;
    const tests = [
      l0 !== null && withinAbs(l0, v.L0, 1.0),
      near(th1, thCold, 0.5),
      near(th2, thermo.map((r) => r.x), 0.5),
      near(r1, mCold, 0.011),
      near(r2, mHot, 0.011),
      ...(filled(C.r2b) ? [near(r2b, mHot, 0.011)] : []),
    ];
    const good = tests.filter(Boolean).length;
    k += prop3(good, tests.length);
    if (good < tests.length) n.push(`${tests.length - good} of your ${tests.length} readings do not match the instruments: the metre rule to 1 mm, the thermometer to 0.5 °C, the micrometer to 0.01 mm (the sleeve plus the thimble division on the datum line).`);
    if (dpIn(C.l0, 0, 1) && dpIn(C.r1, 2, 3) && dpIn(C.r2, 2, 3) && dpIn(C.th1, 1, 2) && dpIn(C.th2, 1, 2)) k++;
    else n.push('Record l₀ to the nearest mm (e.g. 600.0 mm), the micrometer readings to 0.01 mm and the temperatures to 1 decimal place.');
    if (r2 !== null && r2b !== null && withinAbs(r2, r2b, 0.01) && near(r2b, mSteady, 0.011)) k++;
    else n.push('Repeat the final micrometer reading a minute later (back off, ratchet in again) until two readings agree: then the rod has stopped expanding.');
    auto.push(score(crit('readings'), k, n));
  }

  // ---- working (2)
  const dth = num(C.dth);
  const e = num(C.e);
  const rFinal = r2 !== null && r2b !== null ? (r2 + r2b) / 2 : r2;
  {
    const n: string[] = [];
    let k = 0;
    if (th1 !== null && th2 !== null && withinAbs(dth, th2 - th1, 0.06)) k++;
    else n.push('Work out the rise in temperature θ₂ − θ₁ from your readings.');
    if (r1 !== null && rFinal !== null && e !== null && (withinAbs(Math.abs(e), Math.abs(r1 - rFinal), 0.006) || (r2 !== null && withinAbs(Math.abs(e), Math.abs(r1 - r2), 0.006)))) k++;
    else n.push('The expansion e is the difference of your two micrometer readings, r₁ − r₂ (the rod pushes towards the gauge, so the second reading is smaller).');
    auto.push(score(crit('graph'), k, n));
  }

  // ---- results (4)
  const a = num(s.answers.alpha.value);
  {
    const n: string[] = [];
    let k = 0;
    const own = l0 !== null && dth !== null && e !== null && dth !== 0 ? Math.abs(e) / (l0 * dth) : null;
    if (a !== null && own !== null && withinRel(a, own, 0.02)) k += 2;
    else if (a === null) n.push('Work out α = e ÷ (l₀ (θ₂ − θ₁)).');
    else if (own !== null && (withinRel(a, own * 1000, 0.02) || withinRel(a, own / 1000, 0.02) || withinRel(a, own * 10, 0.02) || withinRel(a, own / 10, 0.02))) n.push('Put e and l₀ in the same unit (both in mm, or both in m) before you divide.');
    else if (own !== null && withinRel(a, own, 0.05)) (k += 1), n.push(`From your values α = ${sf(own, 3)} K⁻¹ (work it to 3 significant figures).`);
    else n.push(own !== null ? `From your values, α = ${sf(Math.abs(e!), 3)} ÷ (${sf(l0!, 4)} × ${sf(dth!, 3)}) = ${sf(own, 3)} K⁻¹.` : 'Fill in l₀, e and θ₂ − θ₁ first.');
    if (withinRel(a, v.alpha, 0.1)) k++;
    else if (a !== null) n.push(`Your α is more than 10 % from the true value for this rod (${sf(v.alpha, 3)} K⁻¹).`);
    if (withinRel(a, v.alpha, 0.05)) k++;
    else if (a !== null && withinRel(a, v.alpha, 0.1)) n.push(`Your α is within 10 % but not 5 % of the true value (${sf(v.alpha, 3)} K⁻¹).`);
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const u = s.answers.alpha.value.trim() && thermUnit(s.answers.alpha.unit) === 'K-1' ? 1 : 0;
    auto.push(score(crit('units'), u, u ? [] : [s.answers.alpha.value.trim() ? 'Give α its unit: K⁻¹ (or °C⁻¹) — a fraction of the length per kelvin.' : 'No answer to check the unit of.']));
  }

  const m = thermMetal(v);
  const ai: AiItem[] = [
    {
      criterionId: 'precautions',
      question: 'State two precautions taken to obtain accurate results when determining the linear expansivity of a metal rod with a steam jacket and a micrometer screw gauge.',
      answer: s.written.precautions.trim(),
      guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
      keywords: [
        ['steady', 'constant', 'stopped rising', 'waited', 'wait'],
        ['ratchet', 'over tighten', 'overtighten', 'not tighten', 'too tight'],
        ['fixed firmly', 'firmly', 'fixed at one end', 'clamped'],
        ['back off', 'backed off', 'withdrawn', 'unscrewed', 'free to expand'],
        ['steam outlet', 'outlet', 'away from', 'scald'],
        ['parallax', 'eye level', 'perpendicular'],
        ['repeat', 'repeated', 'average'],
        ['backlash', 'same direction'],
      ],
      need: 2,
    },
  ];
  const solution = [
    `The rod is ${m.name}: α = ${sf(v.alpha, 3)} K⁻¹; its length at room temperature is l₀ = ${v.L0.toFixed(1)} mm.`,
    `Room temperature θ₁ ≈ ${v.room.toFixed(1)} °C; the steam is at θ₂ ≈ ${v.boil.toFixed(1)} °C (water boils a little below 100 °C here), a rise of ${(v.boil - v.room).toFixed(1)} K.`,
    `e = α l₀ Δθ = ${sf(v.alpha, 3)} × ${v.L0.toFixed(1)} × ${(v.boil - v.room).toFixed(1)} ≈ ${xIdeal.toFixed(2)} mm (the ends outside the jacket and the frame’s own expansion take about ${((1 - v.eff) * 100).toFixed(1)} % off).`,
    `The thermometer is steady within about a minute of the steam arriving, but the rod lags behind it (time constant about ${Math.round(v.tauRod)} s): keep screwing the micrometer up until two readings agree — about five minutes.`,
    'Back the micrometer off before steaming, and use the ratchet for every reading so the spindle presses equally hard each time.',
  ];
  const facts = [
    `Task: linear expansivity (${m.name}, true α ${sf(v.alpha, 3)} K⁻¹, ideal e ${xIdeal.toFixed(3)} mm); ${plural(touches.length, 'micrometer contact')}, ${plural(micro.length, 'micrometer reading')}; strained ${end.strained ? 'yes' : 'no'}.`,
    `Student: l₀ ${C.l0 || '—'} mm, θ₁ ${C.th1 || '—'}, θ₂ ${C.th2 || '—'}, r₁ ${C.r1 || '—'}, r₂ ${C.r2 || '—'}, e ${C.e || '—'}; α ${s.answers.alpha.value || '—'} ${s.answers.alpha.unit}.`,
  ];
  return { auto, ai, solution, facts };
}

// ================================================================== CHARLES

const lastStirBefore = (ev: readonly ThermEvent[], t: number) => sorted(ev).filter((e) => e.e === 'stir' && e.t <= t + 1e-9).at(-1)?.t ?? null;

function gradeCharles(s: PhyThermalState, v: PhyThermalVariant): Part {
  const auto: CriterionScore[] = [];
  const { reads } = readsOf(s, v, 'CHARLES');
  const thermo = reads.filter((r) => r.k === 'thermo');
  const col = reads.filter((r) => r.k === 'column');
  const rows = s.rows;
  const rc = (r: ThermRow, id: string) => num(r.c[id]);
  const ths = rows.map((r) => rc(r, 'th'));
  const ls = rows.map((r) => rc(r, 'l'));

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (col.length && col.every((r) => r.p.immersed === 'full')) k++;
    else n.push(col.length ? 'Push the tube down so the whole air column is under the water: the part above it stays cooler, so the column reads short.' : 'No lengths of the air column were read.');
    const careful = (r: Read) => {
      const st = lastStirBefore(s.events, r.t);
      return !r.p.bunsen && st !== null && r.t - st <= 90;
    };
    if (col.length && col.every(careful)) k++;
    else if (col.length) n.push(col.some((r) => r.p.bunsen) ? 'Remove the flame before each reading: while it heats, the water and the air column are not at one steady temperature.' : 'Stir the water well before each reading, so the thermometer and the air column are at the same temperature.');
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    if (rows.length >= 5) k++;
    else n.push(`Take at least five pairs of readings (you have ${rows.length}).`);
    const tv = ths.filter((x): x is number => x !== null);
    if (tv.length && Math.max(...tv) - Math.min(...tv) >= 50) k++;
    else n.push('Spread the readings over at least 50 °C (e.g. from room temperature to about 90 °C), at intervals of about 15 °C.');
    if (col.length && col.every((r) => Math.abs(r.p.air - r.p.thB) <= 1.0 && Math.abs(r.p.tw - r.p.thB) <= 1.0)) k++;
    else if (col.length) n.push('Wait after stirring until the temperature is steady: the air in the thin tube takes a little while to reach the water’s temperature.');
    else n.push('Read the length of the air column at each temperature.');
    if (col.length && col.every((r) => thermo.some((x) => Math.abs(x.t - r.t) <= 60))) k++;
    else if (col.length) n.push('Read the thermometer and the air column together, one straight after the other.');
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- readings (5)
  const pts: XY[] = [];
  {
    const n: string[] = [];
    let k = 0;
    const mt = matchAll(ths, thermo.map((r) => r.x), 0.5);
    const ml = matchAll(ls, col.map((r) => r.x), 0.1);
    const all = rows.length * 2;
    const good = mt.filter(Boolean).length + ml.filter(Boolean).length;
    k += prop3(good, all);
    if (!rows.length) n.push('There are no rows in your table.');
    else if (good < all) n.push(`${all - good} of your ${all} readings do not match the instruments: the thermometer to 0.5 °C and the air column to the nearest mm on the ruler (eye level with the bottom of the index).`);
    if (rows.length && rows.every((r) => dpIn(r.c.th, 1, 2) && dpIn(r.c.l, 1, 2))) k++;
    else n.push('Record θ to 1 decimal place and l in cm to 0.1 cm or 0.05 cm.');
    const derived =
      rows.length > 0 &&
      rows.every((r) => {
        const th = rc(r, 'th');
        const l = rc(r, 'l');
        const T = rc(r, 'T');
        return th !== null && l !== null && T !== null && withinAbs(T, th + 273, 0.6) && withinRel(rc(r, 'lT'), l / T, 0.015);
      });
    if (derived) k++;
    else n.push('Work out T = θ + 273 (in K) and l/T for each row.');
    auto.push(score(crit('readings'), k, n));
    rows.forEach((r, i) => {
      const x = ths[i];
      const y = ls[i];
      if (x !== null && x !== undefined && y !== null && y !== undefined) pts.push({ x, y });
    });
  }

  // ---- graph (2)
  const graph = gradeGraph(pts, s.line, 'l against θ');
  auto.push(score(crit('graph'), graph.marks, graph.notes));

  // ---- results (4)
  const slope = num(s.answers.slope.value);
  const zero = num(s.answers.zero.value);
  const ratio = num(s.answers.ratio.value);
  {
    const n: string[] = [];
    let k = 0;
    if (slope !== null && slopeAccepted(slope, graph.fit?.slope ?? null, s.line, graph.lineOk)) k++;
    else if (slope === null) n.push('Find the slope of your line from two points far apart on it.');
    else n.push(graph.fit ? `Your slope does not fit your points (their best line has a slope of about ${sf(graph.fit.slope, 3)} cm K⁻¹).` : 'The slope needs your points first.');
    const ls2 = phyLineSlope(s.line);
    const lineZero = s.line && ls2 ? s.line.x1 - s.line.y1 / ls2 : null;
    const fitZero = graph.fit && graph.fit.slope ? -graph.fit.intercept / graph.fit.slope : null;
    if (zero !== null && ((lineZero !== null && withinAbs(zero, lineZero, 5)) || (fitZero !== null && withinAbs(zero, fitZero, 5)))) k++;
    else if (zero === null) n.push('Extend your line back to l = 0 and read the temperature there: absolute zero.');
    else if (zero > 0) n.push('Absolute zero is the (negative) temperature where your line meets the θ axis, l = 0.');
    else n.push(lineZero !== null ? `Your line meets l = 0 at about ${lineZero.toFixed(0)} °C.` : 'Draw your line first.');
    if (withinAbs(zero, -273, 25)) k++;
    else if (zero !== null) n.push('Your absolute zero is more than 25 °C from −273 °C: check that each reading was steady and the column fully immersed.');
    const lts = pts.map((p) => p.y / (p.x + 273));
    if (ratio !== null && lts.length && withinRel(ratio, avg(lts), 0.025)) k++;
    else if (ratio === null) n.push('Work out l/T (T in kelvin) for your readings: it is about constant — Charles’s law.');
    else n.push(lts.length ? `From your readings l/T ≈ ${sf(avg(lts), 3)} cm K⁻¹ (T = θ + 273, not θ).` : 'Fill in your table first.');
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    if (!s.answers.slope.value.trim() && !s.answers.zero.value.trim()) (u = 0), un.push('No answers to check the units of.');
    if (s.answers.slope.value.trim() && thermUnit(s.answers.slope.unit) !== 'cm/K') (u = 0), un.push('Give the slope its unit: cm K⁻¹ (cm °C⁻¹).');
    if (s.answers.zero.value.trim() && thermUnit(s.answers.zero.unit) !== 'C') (u = 0), un.push('Absolute zero from this graph is in °C.');
    if (s.answers.ratio.value.trim() && thermUnit(s.answers.ratio.unit) !== 'cm/K') (u = 0), un.push('l/T is in cm K⁻¹.');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai: AiItem[] = [
    {
      criterionId: 'precautions',
      question: 'State two precautions taken to obtain accurate results when verifying Charles’s law with air trapped in a capillary tube by a thread of sulphuric acid.',
      answer: s.written.precautions.trim(),
      guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
      keywords: [
        ['stir', 'stirred', 'stirring'],
        ['steady', 'wait', 'waited', 'constant temperature'],
        ['flame removed', 'remove the flame', 'removed the flame', 'burner removed', 'heating stopped'],
        ['immersed', 'covered', 'under the water', 'below the water'],
        ['parallax', 'eye level', 'perpendicular'],
        ['acid', 'corrosive', 'never open'],
        ['gently', 'slowly'],
      ],
      need: 2,
    },
  ];
  const l30 = thermBoreLen(v, 30);
  const l90 = thermBoreLen(v, 90);
  const solution = [
    `The trapped air is dry (the acid absorbs water vapour) and at constant pressure (the atmosphere plus the short index). Here l ≈ ${l30.toFixed(2)} cm at 30 °C and ${l90.toFixed(2)} cm at 90 °C.`,
    `l rises in equal steps for equal rises in θ: the slope is about ${sf((l90 - l30) / 60, 3)} cm K⁻¹.`,
    `Extended back, the line meets l = 0 at about ${(30 - l30 / ((l90 - l30) / 60)).toFixed(0)} °C — absolute zero, −273 °C (0 K). So l ∝ T: l/T ≈ ${sf(l30 / 303, 3)} cm K⁻¹.`,
    'Remove the flame, stir and wait before each reading: the gauze goes on heating for a short while, and the air in the tube lags behind the water.',
    graph.fit ? `From your own points the best line has slope ${sf(graph.fit.slope, 3)} cm K⁻¹ and meets l = 0 at ${(-graph.fit.intercept / graph.fit.slope).toFixed(0)} °C.` : 'Plot l against θ from your table.',
  ];
  const facts = [
    `Task: Charles's law (true absolute zero −273 °C; bore taper ${(v.bore * 100).toFixed(1)} %); ${plural(col.length, 'column reading')}, ${plural(thermo.length, 'thermometer reading')}, ${plural(rows.length, 'row')}.`,
    `Student's slope ${s.answers.slope.value || '—'} ${s.answers.slope.unit}; absolute zero ${s.answers.zero.value || '—'} ${s.answers.zero.unit}; l/T ${s.answers.ratio.value || '—'}.`,
  ];
  return { auto, ai, solution, facts };
}
/** The steady length of the column (cm) with the air at θ, fully immersed. */
const thermBoreLen = (v: PhyThermalVariant, theta: number) => thermBore(v, (v.lRef * (theta + 273.15)) / (v.room + 273.15));

// ================================================================== ELECTRIC

/** The fraction of [t0, t1] spent stirring (from stir:on / stir:off). */
function stirFraction(events: readonly ThermEvent[], t0: number, t1: number): number {
  if (t1 <= t0) return 0;
  let on = false;
  let total = 0;
  let last = t0;
  for (const e of sorted(events)) {
    if (e.e !== 'stir:on' && e.e !== 'stir:off') continue;
    if (e.t <= t0) {
      on = e.e === 'stir:on';
      continue;
    }
    if (e.t >= t1) break;
    if (on) total += e.t - last;
    last = e.t;
    on = e.e === 'stir:on';
  }
  if (on) total += t1 - last;
  return total / (t1 - t0);
}

function gradeElectric(s: PhyThermalState, v: PhyThermalVariant): Part {
  const auto: CriterionScore[] = [];
  const ev = s.events;
  // the heating run: the longest spell the heater was on
  const runs = sorted(ev)
    .filter((e) => e.e === 'switch:on')
    .map((on) => ({ on, off: firstOf(ev, (e) => e.e === 'switch:off', on.t) }))
    .map((r) => ({ ...r, len: (r.off?.t ?? Infinity) - r.on.t }));
  const run = runs.reduce<(typeof runs)[number] | null>((a, b) => (!a || b.len > a.len ? b : a), null);
  const onE = run?.on ?? null;
  const offE = run?.off ?? null;
  const wStart = firstOf(ev, (e) => e.e === 'watch:start');
  const peakTimes = offE ? Array.from({ length: 121 }, (_, i) => offE.t + i * 1.5) : [];
  const { reads, snap, end } = readsOf(s, v, 'ELECTRIC', [...(onE ? [onE.t] : []), ...(offE ? [offE.t] : []), ...peakTimes]);
  const C = s.cells;
  const bal = reads.filter((r) => r.k === 'balance' && r.p.pan);
  const balEmpty = bal.filter((r) => r.p.mw <= 0).map((r) => r.x);
  const balFull = bal.filter((r) => r.p.mw > 0).map((r) => r.x);
  const thermo = reads.filter((r) => r.k === 'thermo');
  const before = thermo.filter((r) => !onE || r.t <= onE.t).map((r) => r.x);
  const after = thermo.filter((r) => offE && r.t >= offE.t);
  const heating = (r: Read) => r.p.on && r.p.amps > 0;
  const amm = reads.filter((r) => r.k === 'ammeter' && heating(r)).map((r) => r.x);
  const vol = reads.filter((r) => r.k === 'voltmeter' && heating(r)).map((r) => r.x);
  const watch = reads.filter((r) => r.k === 'watch').map((r) => r.x);
  const offWatch = offE ? thermIndicates(v, snap.get(offE.t)!, 'watch', 'ELECTRIC', offE.t) : null;
  const peak = offE ? Math.max(...peakTimes.map((t) => thermThermo(v, snap.get(t)!, 'ELECTRIC'))) : null;
  const mc = num(C.mc);
  const mcw = num(C.mcw);
  const m = num(C.m);
  const V = num(C.V);
  const I = num(C.I);
  const t = num(C.t);
  const th0 = num(C.th0);
  const thmax = num(C.thmax);
  const dth = num(C.dth);
  const pOn = onE ? snap.get(onE.t)! : null;
  const pOff = offE ? snap.get(offE.t)! : null;

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (onE && !end.dry) k++;
    else n.push(onE ? 'Never switch the heater on until it is fully under the water: in air it overheats and burns out.' : 'The heater was never switched on.');
    const covered = !!pOn && !!pOff && pOn.lagged && pOn.lid && pOff.lagged && pOff.lid && !ev.some((e) => (e.e === 'lag:off' || e.e === 'lid:off') && e.t > onE!.t && e.t < offE!.t);
    if (covered) k++;
    else if (onE) n.push('Stand the calorimeter in its lagging and put the lid on before you switch on: otherwise heat is lost to the room and c comes out too large.');
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    if (balEmpty.length && balFull.length) k++;
    else n.push('Weigh the calorimeter empty and again with the water: the difference is the mass of water m.');
    if (onE && wStart && Math.abs(wStart.t - onE.t) <= 3 && offWatch !== null && Math.abs(offWatch - THERM_HEAT_TIME) <= 5) k++;
    else n.push(!onE ? 'Switch the heater on.' : !wStart || Math.abs(wStart.t - onE.t) > 3 ? 'Start the stopwatch at the moment you switch the heater on.' : `Switch the heater off when the stopwatch reads ${THERM_HEAT_TIME} s (it read ${offWatch !== null ? offWatch.toFixed(0) : '—'} s).`);
    if (onE && offE && stirFraction(ev, onE.t, offE.t) >= 0.9) k++;
    else if (onE) n.push('Stir gently all the time while the heater is on, so the heat spreads through the water and the thermometer reads the whole of it.');
    if (peak !== null && after.some((r) => r.x >= peak - 0.2)) k++;
    else if (offE) n.push(`After switching off, keep stirring and read the thermometer as it creeps up: record the highest temperature (it reached ${peak !== null ? peak.toFixed(1) : '—'} °C).`);
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- readings (5)
  const pts: XY[] = [];
  {
    const n: string[] = [];
    let k = 0;
    const thAll = thermo.map((r) => r.x);
    const rowsTh = s.rows.map((r) => num(r.c.th));
    const mt = matchAll(rowsTh, thAll, 0.5);
    const tests = [near(mc, balEmpty, 0.2), near(mcw, balFull, 0.2), near(V, vol, 0.1), near(I, amm, 0.05), t !== null && (near(t, watch, 1) || (offWatch !== null && withinAbs(t, offWatch, 1))), near(th0, before, 0.5), near(thmax, after.map((r) => r.x), 0.5), ...mt];
    const good = tests.filter(Boolean).length;
    k += prop3(good, tests.length);
    if (good < tests.length) n.push(`${tests.length - good} of your ${tests.length} readings do not match the instruments: the balance to 0.1 g, the voltmeter to 0.1 V, the ammeter to 0.05 A, the stopwatch to 1 s and the thermometer to 0.5 °C.`);
    if (dpIn(C.mc, 1, 1) && dpIn(C.mcw, 1, 1) && dpIn(C.V, 1, 2) && dpIn(C.I, 2, 2) && dpIn(C.th0, 1, 2) && dpIn(C.thmax, 1, 2) && s.rows.length > 0 && s.rows.every((r) => dpIn(r.c.th, 1, 2))) k++;
    else n.push('Record the masses to 0.1 g, V to 0.1 V, I to 0.01 A and the temperatures to 1 decimal place.');
    if (mc !== null && mcw !== null && withinAbs(m, mcw - mc, 0.15) && th0 !== null && thmax !== null && withinAbs(dth, thmax - th0, 0.06)) k++;
    else n.push('Work out m = (calorimeter + water) − calorimeter, and the rise Δθ = θ_max − θ₀.');
    auto.push(score(crit('readings'), k, n));
    for (const r of s.rows) {
      const y = num(r.c.th);
      if (y !== null) pts.push({ x: r.key, y });
    }
  }

  // ---- graph (2)
  const graph = gradeGraph(pts, s.line, 'θ against t');
  auto.push(score(crit('graph'), graph.marks, graph.notes));

  // ---- results (4)
  const ans = s.answers;
  const joules = (a: PhyAnswer) => {
    const x = num(a.value);
    return x === null ? null : thermUnit(a.unit) === 'kJ' ? x * 1000 : x;
  };
  const E = joules(ans.energy);
  const P = num(ans.power.value);
  const c = num(ans.c.value);
  const cRef = thermCRef(v);
  {
    const n: string[] = [];
    let k = 0;
    if (V !== null && I !== null && t !== null && withinRel(E, V * I * t, 0.02) && withinRel(P, V * I, 0.02)) k++;
    else if (V !== null && I !== null && t !== null && withinRel(E, (V * I * t) / 60, 0.02)) n.push('Use t in seconds, not minutes: E = VIt with t in s gives joules.');
    else n.push(V !== null && I !== null && t !== null ? `From your readings E = VIt = ${sf(V, 3)} × ${sf(I, 3)} × ${sf(t, 3)} = ${sf(V * I * t, 4)} J and P = VI = ${sf(V * I, 3)} W.` : 'Record V, I and t, then work out E = VIt and P = VI.');
    const own = E !== null && m !== null && dth !== null && m > 0 && dth !== 0 ? E / ((m / 1000) * dth) : null;
    if (c !== null && own !== null && withinRel(c, own, 0.03)) k++;
    else if (c !== null && own !== null && withinRel(c, own / 1000, 0.03)) n.push('Put m in kilograms (÷ 1000) in c = E ÷ (m Δθ).');
    else if (c === null) n.push('Work out c = E ÷ (m Δθ).');
    else n.push(own !== null ? `From your values c = ${sf(E!, 4)} ÷ (${sf(m! / 1000, 4)} × ${sf(dth!, 3)}) = ${sf(own, 3)} J kg⁻¹ K⁻¹.` : 'Fill in E, m and Δθ first.');
    if (withinRel(c, cRef, 0.1)) k++;
    else if (c !== null) n.push(`Your c is more than 10 % from what careful work gives with this calorimeter (about ${sf(cRef, 3)} J kg⁻¹ K⁻¹).`);
    if (withinRel(c, cRef, 0.05)) k++;
    else if (c !== null && withinRel(c, cRef, 0.1)) n.push(`Your c is within 10 % but not 5 % of what careful work gives (about ${sf(cRef, 3)} J kg⁻¹ K⁻¹): heat lost to the room makes it too large.`);
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    if (!ans.energy.value.trim() && !ans.c.value.trim()) (u = 0), un.push('No answers to check the units of.');
    if (ans.energy.value.trim() && !['J', 'kJ'].includes(thermUnit(ans.energy.unit))) (u = 0), un.push('Energy is in joules, J.');
    if (ans.power.value.trim() && thermUnit(ans.power.unit) !== 'W') (u = 0), un.push('Power is in watts, W (J s⁻¹).');
    if (ans.c.value.trim() && thermUnit(ans.c.unit) !== 'J/kgK') (u = 0), un.push('c is in J kg⁻¹ K⁻¹.');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai: AiItem[] = [
    {
      criterionId: 'precautions',
      question: 'State two precautions taken to obtain accurate results when determining the specific heat capacity of water by an electrical method.',
      answer: s.written.precautions.trim(),
      guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
      keywords: [
        ['lagged', 'lagging', 'insulated', 'cotton wool'],
        ['lid', 'covered'],
        ['stir', 'stirred', 'stirring'],
        ['fully immersed', 'immersed', 'covered by water', 'under the water'],
        ['highest temperature', 'maximum temperature', 'highest'],
        ['steady', 'constant current', 'kept steady'],
        ['parallax', 'eye level'],
        ['low voltage', '12 v'],
      ],
      need: 2,
    },
  ];
  const Pt = thermPower(v);
  const dIdeal = (Pt * THERM_HEAT_TIME) / (v.pour * 4186 + v.cCal + v.cHeater);
  const solution = [
    `The heater takes about I = ${(v.emf / (v.R + v.rInt + v.rA)).toFixed(2)} A at V = ${((v.emf * v.R) / (v.R + v.rInt + v.rA)).toFixed(1)} V: P = VI ≈ ${Pt.toFixed(1)} W, so in ${THERM_HEAT_TIME} s E = VIt ≈ ${(Pt * THERM_HEAT_TIME).toFixed(0)} J.`,
    `The water (${(v.pour * 1000).toFixed(1)} g) and the calorimeter (with the heater, heat capacity about ${(v.cCal + v.cHeater).toFixed(0)} J K⁻¹) warm by about ${dIdeal.toFixed(1)} K if no heat is lost.`,
    `c = E ÷ (m Δθ): careful work with this calorimeter gives about ${sf(cRef, 3)} J kg⁻¹ K⁻¹ — a little above ${THERM_C_WATER}, because the calorimeter and heater also take heat; heat lost to the room makes it larger still.`,
    'The heater’s own body is hotter than the water, so the temperature goes on rising for a short while after switching off: keep stirring and record the highest reading.',
    graph.fit ? `From your table θ rose at about ${sf(graph.fit.slope * 60, 3)} K per minute.` : 'Plot θ against t from your table.',
  ];
  const facts = [
    `Task: electrical heating (P ≈ ${Pt.toFixed(1)} W, careful c ${sf(cRef, 4)}); switched on ${onE ? 'yes' : 'no'}, off at watch ${offWatch !== null ? offWatch.toFixed(0) : '—'} s; lagged+lid ${pOn?.lagged && pOn?.lid ? 'yes' : 'no'}; dry ${end.dry ? 'yes' : 'no'}; peak ${peak !== null ? peak.toFixed(2) : '—'} °C.`,
    `Student: m ${C.m || '—'} g, V ${C.V || '—'}, I ${C.I || '—'}, t ${C.t || '—'}, Δθ ${C.dth || '—'}; E ${ans.energy.value || '—'} ${ans.energy.unit}; c ${ans.c.value || '—'} ${ans.c.unit}.`,
  ];
  return { auto, ai, solution, facts };
}

/**
 * Marks the thermal lab (linear expansivity, Charles's law, electrical
 * heating). The bench is re-simulated from the attempt's events, so every
 * reading is checked against what the instrument showed at that moment (the
 * micrometer as it touched the rod, the air column and thermometer in the
 * bath, the meters, balance and stopwatch), the technique (backing off and the
 * ratchet; the column immersed, the flame removed and the water stirred; the
 * heater immersed, the calorimeter lagged and covered, continuous stirring)
 * from what was done, and the answers against the student's own numbers and
 * the truth. Precautions go to AI.
 */
export const phyThermalGrader: SimulatorGrader<'phy-thermal'> = {
  id: 'phy-thermal',
  grade(state: PhyThermalState, seed: number): GraderOutput {
    const v = phyThermalVariant(seed);
    const task: ThermTask = state.task ?? 'EXPANSION';
    const part = task === 'CHARLES' ? gradeCharles(state, v) : task === 'ELECTRIC' ? gradeElectric(state, v) : gradeExpansion(state, v);
    const order = PHY_THERMAL.rubric.filter((c) => c.how === 'AUTO').map((c) => c.id);
    part.auto.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return part;
  },
};
