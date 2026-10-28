import {
  AMY_BATH_SHORT,
  AMY_CLAIM_LABEL,
  BIO_FOOD_TESTS,
  BENEDICT_STAGE_NAME,
  FOOD_LETTERS,
  FOOD_TEST_INFO,
  NUTRIENT_LABEL,
  amyActive,
  amyInferenceKey,
  amyModelState,
  amyObservedEnd,
  amyOptimum,
  amySpots,
  amyTrueEnd,
  amyTubeParts,
  benedictFinal,
  benedictStage,
  bioFoodVariant,
  contentNutrients,
  emptyFoodRecord,
  foodIdealRecord,
  foodInferenceKey,
  foodModelTests,
  foodObserve,
  foodTestText,
  type AmyClaim,
  type BioFoodState,
  type BioFoodVariant,
  type CriterionScore,
  type FoodInferenceKey,
  type FoodPart,
  type FoodRecord,
  type FoodTest,
  type Nutrient,
} from '@aischool/shared';
import { observationCredit } from './chem-qualitative';
import { parseNumber, score, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => BIO_FOOD_TESTS.rubric.find((c) => c.id === id)!;
const lbl = (n: Nutrient) => NUTRIENT_LABEL[n].toLowerCase();
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
/** Benedict's tests must stay in the bath at least this long (s). */
export const FOOD_MIN_HEAT = 180;
/** Drops tested at intervals no longer than this (s). */
const AMY_MAX_GAP = 60;

// ------------------------------------------------------------------ inferences

interface InfMark {
  credit: number;
  why: string | null;
}
const writtenFood = (r: FoodRecord) => r.present.length + r.absent.length > 0 || !!r.note.trim();

/** Marks one row's inference against what its own result allows. */
export function foodInferenceCredit(key: FoodInferenceKey, r: FoodRecord, t: FoodTest): InfMark {
  if (!writtenFood(r)) return { credit: 0, why: 'no inference' };
  if (!key.complete) {
    if (r.present.length || r.absent.length)
      return {
        credit: 0,
        why:
          t.test === 'NONREDUCING'
            ? 'the test was not finished (boil with acid, neutralise, then add Benedict’s and heat): nothing can be inferred from it'
            : FOOD_TEST_INFO[t.test].heats
              ? 'the tube was not heated long enough in the water bath: nothing can be inferred from it yet'
              : 'the test was not finished: nothing can be inferred from it',
      };
    return { credit: 0, why: 'finish the test before inferring' };
  }
  const badP = r.present.filter((n) => !key.allowPresent.includes(n));
  const badA = r.absent.filter((n) => !key.allowAbsent.includes(n));
  if (badP.length) return { credit: 0, why: `the result does not show ${list(badP.map(lbl))} present` };
  if (badA.length) return { credit: 0, why: `this test cannot show that ${list(badA.map(lbl))} ${badA.length === 1 ? 'is' : 'are'} absent` };
  const ok = key.need.present.every((n) => r.present.includes(n)) && key.need.absent.every((n) => r.absent.includes(n));
  if (ok) return { credit: 1, why: null };
  if (!key.need.present.length && !key.need.absent.length) return { credit: 1, why: null };
  return { credit: 0.5, why:key.need.present.length ? `state that ${list(key.need.present.map(lbl))} ${key.need.present.length === 1 ? 'is' : 'are'} present` : `state that ${list(key.need.absent.map(lbl))} ${key.need.absent.length === 1 ? 'is' : 'are'} absent` };
}

export function amyInferenceCredit(v: BioFoodVariant, s: BioFoodState, i: number): InfMark {
  const claims = s.amy[i]?.claims ?? [];
  if (!amySpots(v, s, i).length) return { credit: 0, why: 'no drops of this mixture were tested' };
  if (!claims.length) return { credit: 0, why: 'no inference' };
  const key = amyInferenceKey(v, s, i);
  const bad = claims.filter((c) => !key.allow.includes(c));
  if (bad.length) {
    const tube = s.tubes[i]!;
    const cold = !tube.boiled && amyActive(v, tube) && bad.includes('DENATURED');
    return { credit: 0, why: cold ? 'a low temperature slows the enzyme but does not denature it' : `the result does not show “${list(bad.map((c) => AMY_CLAIM_LABEL[c].toLowerCase()))}”` };
  }
  if (key.need.every((c) => claims.includes(c))) return { credit: 1, why: null };
  if (claims.some((c) => key.half.includes(c))) return { credit: 0.5, why: `say why: ${list(key.need.map((c) => AMY_CLAIM_LABEL[c].toLowerCase()))}` };
  return { credit: 0.5, why: `state: ${list(key.need.map((c) => AMY_CLAIM_LABEL[c].toLowerCase()))}` };
}

// ------------------------------------------------------------------ AI items

const FOOD_PRECAUTION_KW: string[][] = [['clean', 'wash', 'rinse'], ['water bath', 'bath', 'not directly', 'indirect'], ['little', 'few drops', 'two drops', '2 drops', 'small amount', 'excess'], ['neutralis', 'neutraliz'], ['point', 'away from'], ['label'], ['flame', 'ethanol', 'flammable'], ['same volume', 'equal volume']];
const AMY_PRECAUTION_KW: string[][] = [['equilibrat', 'reach the temperature', 'same temperature', 'bath temperature', 'before mixing', 'temperature constant', 'constant temperature'], ['clean', 'rinse', 'separate dropper', 'different dropper', 'fresh'], ['same volume', 'equal volume', 'same amount', 'same concentration'], ['regular', 'interval', '30', 'every'], ['own saliva', 'disinfect'], ['stopwatch', 'timing', 'start the clock', 'start timing']];

function aiItems(v: BioFoodVariant, s: BioFoodState, amylase: boolean): AiItem[] {
  return [
    {
      criterionId: 'precautions',
      question: amylase ? 'State two precautions you took in the experiment on the action of salivary amylase on starch.' : 'State two precautions you took when carrying out the food tests.',
      answer: s.written.precautions.trim(),
      guide: amylase
        ? '2 marks: one for each correct precaution — the starch and saliva left in their baths to reach the temperature before mixing; a clean (separate) dropper each time; the same volumes and concentrations in every tube; drops tested at regular intervals (e.g. every 30 s); the bath temperatures kept constant; each student uses only their own saliva and apparatus is disinfected. A source of error or a vague statement (“be careful”) earns nothing.'
        : '2 marks: one for each correct precaution — clean test tubes for each test; Benedict’s heated in a water bath, not directly over the flame; only a little (two drops) copper(II) sulphate in the Biuret test so the blue does not mask the violet; the acid neutralised before Benedict’s in the non-reducing sugar test; test tubes pointed away from people while heating; ethanol kept away from flames; equal volumes of sample and reagent. A source of error or a vague statement (“be careful”) earns nothing.',
      keywords: amylase ? AMY_PRECAUTION_KW : FOOD_PRECAUTION_KW,
      need: 2,
    },
    amylase
      ? {
          criterionId: 'explanation',
          question: 'Explain your results: why the starch disappeared fastest at the temperature you found, why it was slow in the ice-cold bath, and why it was not digested with boiled saliva (or in the boiling bath).',
          answer: s.written.explain.trim(),
          guide: '2 marks: (1) amylase works fastest near its optimum temperature (about 37 °C, body temperature); in the cold the molecules have little kinetic energy, so the enzyme is less active (slow) but not destroyed; (1) boiling denatures the enzyme — the shape of its active site is changed for good — so starch is not digested. Saying the enzyme is “killed”, or that cold denatures it, earns nothing for that point.',
          keywords: [['optimum', 'body temperature', '37'], ['kinetic', 'slow', 'inactive', 'less active', 'low temperature', 'cold'], ['denatur', 'active site', 'destroy', 'shape']],
          need: 3,
        }
      : {
          criterionId: 'explanation',
          question: 'In the test for a non-reducing sugar, explain why the sample is first boiled with dilute hydrochloric acid, and why the acid is then neutralised before Benedict’s solution is added.',
          answer: s.written.explain.trim(),
          guide: '2 marks: (1) boiling with acid hydrolyses (breaks down) the non-reducing sugar, e.g. sucrose, into reducing sugars (glucose and fructose); (1) Benedict’s solution works only in alkaline (non-acidic) conditions — the acid would stop it — so the acid is neutralised with sodium hydrogencarbonate first.',
          keywords: [['hydrolys', 'break', 'split', 'convert', 'broken'], ['glucose', 'fructose', 'reducing', 'monosacch', 'simple sugar'], ['alkali', 'alkaline', 'acid', 'neutral', 'benedict']],
          need: 3,
        },
  ];
}

// ------------------------------------------------------------------ FOOD

const isLetter = (x: string) => (FOOD_LETTERS as readonly string[]).includes(x);
const COVER: { n: Nutrient; tests: FoodTest['test'][] }[] = [
  { n: 'STARCH', tests: ['IODINE'] },
  { n: 'REDUCING', tests: ['BENEDICT'] },
  { n: 'PROTEIN', tests: ['BIURET', 'MILLON'] },
  { n: 'FAT', tests: ['SUDAN', 'GREASE', 'EMULSION'] },
];

function gradeFood(s: BioFoodState, v: BioFoodVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const rows = s.tests.map((t, i) => ({ t, i, rec: s.table[i] ?? emptyFoodRecord(), out: foodObserve(v, s, t), key: foodInferenceKey(v, s, t) })).filter((r) => isLetter(r.t.sample));

  // ---- procedure (4)
  {
    const n: string[] = [];
    let m = 0;
    const missing: string[] = [];
    let covered = 0;
    for (const sm of v.samples)
      for (const c of COVER) {
        if (rows.some((r) => r.t.sample === sm.letter && c.tests.includes(r.t.test) && r.out.complete)) covered++;
        else missing.push(`${sm.letter} for ${lbl(c.n)}`);
      }
    m += (2 * covered) / (v.samples.length * COVER.length);
    if (missing.length) n.push(`Test ${list(missing.slice(0, 6))}${missing.length > 6 ? '…' : ''} (and finish each test).`);
    // Non-reducing test where the student's own Benedict's test was negative (or, with none done, where it would be).
    const needNr = v.samples.filter((sm) => {
      const own = rows.filter((r) => r.t.sample === sm.letter && r.t.test === 'BENEDICT' && r.out.complete);
      return own.length ? own.every((r) => !r.out.positive) : benedictStage(benedictFinal(sm.content.reducing)) === 0;
    });
    const nrDone = needNr.filter((sm) => rows.some((r) => r.t.sample === sm.letter && r.t.test === 'NONREDUCING' && r.out.complete));
    m += needNr.length ? nrDone.length / needNr.length : 1;
    if (nrDone.length < needNr.length) n.push(`Do the non-reducing sugar test on ${list(needNr.filter((x) => !nrDone.includes(x)).map((x) => x.letter))}: boil with dilute HCl, neutralise with NaHCO₃, then Benedict’s.`);
    const ben = rows.filter((r) => r.t.test === 'BENEDICT' || (r.t.test === 'NONREDUCING' && r.t.steps.includes('BENEDICT')));
    const heated = rows.filter((r) => FOOD_TEST_INFO[r.t.test].heats && r.t.heat > 0);
    const direct = heated.filter((r) => r.t.direct);
    const short = ben.filter((r) => r.t.heat < FOOD_MIN_HEAT);
    if (ben.length && !short.length) m += 0.5;
    else if (ben.length) n.push(`Heat every Benedict’s test in the boiling water bath for at least 3 minutes (${short.length} ${short.length === 1 ? 'was' : 'were'} not).`);
    if (heated.length && !direct.length) m += 0.5;
    else if (direct.length) n.push('Never heat a test tube directly over the flame: use the water bath (the liquid can spurt out).');
    if (!rows.length) n.splice(0, n.length, 'No tests were carried out.');
    auto.push(score(crit('procedure'), Math.floor(m * 2) / 2, n));
  }

  // ---- observations (5) and inferences (4): best row per distinct test, out of at least minRows
  const byTest = new Map<string, { obs: number; inf: number; text: string; missed: FoodPart[]; why: string | null }>();
  for (const r of rows) {
    const k = `${r.t.sample}|${r.t.test}`;
    const o = observationCredit(r.rec.observation, r.out.parts);
    const inf = foodInferenceCredit(r.key, r.rec, r.t);
    const prev = byTest.get(k);
    if (!prev || o.credit + inf.credit > prev.obs + prev.inf) byTest.set(k, { obs: o.credit, inf: inf.credit, text: foodTestText(s, r.t), missed: o.missed, why: inf.why });
  }
  const marks = [...byTest.values()];
  const denom = Math.max(marks.length, v.minRows);
  {
    const n: string[] = [];
    const total = marks.reduce((t, x) => t + x.obs, 0);
    if (!marks.length) n.push('No observations to mark.');
    else {
      for (const x of marks.filter((y) => y.obs < 1).slice(0, 4)) n.push(`“${x.text}”: ${x.missed.length ? `you should have seen ${x.missed.map((p) => p.text).join('; ')}` : 'record what you saw'}.`);
      if (marks.length < v.minRows) n.push(`Only ${marks.length} different test${marks.length === 1 ? '' : 's'} recorded; the three samples need about ${v.minRows}.`);
    }
    auto.push(score(crit('observations'), Math.floor((total / denom) * crit('observations').marks * 2) / 2, n));
  }
  {
    const n: string[] = [];
    const total = marks.reduce((t, x) => t + x.inf, 0);
    if (!marks.length) n.push('No inferences to mark.');
    else for (const x of marks.filter((y) => y.inf < 1).slice(0, 4)) n.push(`“${x.text}”: ${x.why ?? 'incomplete inference'}.`);
    if (marks.length && marks.length < v.minRows) n.push(`Inferences are marked out of at least ${v.minRows} different tests.`);
    auto.push(score(crit('inferences'), Math.floor((total / denom) * crit('inferences').marks * 2) / 2, n));
  }

  // ---- food substances identified (3)
  {
    const n: string[] = [];
    let m = 0;
    for (const sm of v.samples) {
      const truth = contentNutrients(sm.content);
      const said = s.conclusion[sm.letter] ?? [];
      const wrong = [...said.filter((x) => !truth.includes(x)), ...truth.filter((x) => !said.includes(x))];
      if (!wrong.length) m += 1;
      else if (wrong.length === 1 && said.length) m += 0.5;
      if (!said.length) n.push(`Name the food substances in ${sm.letter}.`);
      else if (wrong.length) n.push(`${sm.letter}: ${said.filter((x) => !truth.includes(x)).length ? `${list(said.filter((x) => !truth.includes(x)).map(lbl))} ${said.filter((x) => !truth.includes(x)).length === 1 ? 'is' : 'are'} not present` : ''}${said.filter((x) => !truth.includes(x)).length && truth.filter((x) => !said.includes(x)).length ? '; ' : ''}${truth.filter((x) => !said.includes(x)).length ? `${list(truth.filter((x) => !said.includes(x)).map(lbl))} not named` : ''}.`);
    }
    auto.push(score(crit('results'), m, n));
  }

  const solution = [
    `The samples were ${list(v.samples.map((sm) => `${sm.letter}: ${sm.food.name} (${list(contentNutrients(sm.content).map(lbl))})`))}.`,
    ...foodModelTests(v).map((t) => {
      const rec = foodIdealRecord(v, s, t);
      const inf = [rec.present.length ? `${list(rec.present.map((x) => NUTRIENT_LABEL[x]))} present` : '', rec.absent.length ? `${list(rec.absent.map((x) => NUTRIENT_LABEL[x]))} absent` : ''].filter(Boolean).join('; ');
      return `${foodTestText(s, t)} → ${rec.observation} → ${inf || 'no inference'}.`;
    }),
    'Benedict’s colours rank the reducing sugar: green (a trace) < yellow < orange < brick-red (a lot).',
  ];
  const facts = [`${rows.length} tests done (${marks.length} different) on P, Q and R; ${rows.filter((r) => r.t.direct).length} heated directly over the flame.`, `Named: ${v.samples.map((sm) => `${sm.letter} ${(s.conclusion[sm.letter] ?? []).map(lbl).join(', ') || '—'} (true ${contentNutrients(sm.content).map(lbl).join(', ')})`).join('; ')}.`];
  return { auto, ai: aiItems(v, s, false), solution, facts };
}

// ------------------------------------------------------------------ AMYLASE

function gradeAmylase(s: BioFoodState, v: BioFoodVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const tubes = s.tubes.map((tb, i) => ({ tb, i, spots: amySpots(v, s, i), end: amyObservedEnd(v, s, i), rec: s.amy[i] ?? { observation: '', claims: [] as AmyClaim[], end: '', rate: '' } }));
  const benRows = s.tests.map((t, i) => ({ t, i, rec: s.table[i] ?? emptyFoodRecord(), out: foodObserve(v, s, t), key: foodInferenceKey(v, s, t) })).filter((r) => !isLetter(r.t.sample));
  const name = (i: number) => `tube ${i + 1} (${s.tubes[i]!.boiled ? 'boiled saliva, ' : ''}${AMY_BATH_SHORT[s.tubes[i]!.bath]})`;

  // ---- procedure (4)
  {
    const n: string[] = [];
    let m = 0;
    const firstSpot = s.log.findIndex((e) => e.a.startsWith('spot'));
    const tileLate = firstSpot >= 0 && s.log.findIndex((e) => e.a === 'tile') > firstSpot;
    if (s.tile && !tileLate) m += 0.5;
    else n.push('Put drops of iodine solution in the wells of the spotting tile before you start.');
    if (s.equilibrated) m += 0.5;
    else if (s.tubes.length) n.push('Stand the starch and saliva tubes in their baths for 5 minutes before mixing, so they reach the bath’s temperature.');
    const baths = new Set(s.tubes.filter((t) => !t.boiled).map((t) => t.bath));
    const got = (baths.has('ICE') ? 1 : 0) + (baths.has('BODY') ? 1 : 0) + ([...baths].some((b) => b !== 'ICE' && b !== 'BODY') ? 1 : 0);
    m += got / 3;
    if (got < 3) n.push(`Set up tubes in the ice bath, at 37 °C and at least one other temperature${baths.size ? ` (you used ${[...baths].map((b) => AMY_BATH_SHORT[b]).join(', ')})` : ''}.`);
    if (s.tubes.some((t) => t.boiled)) m += 1;
    else n.push('Set up a control with boiled saliva: it shows that the enzyme causes the change.');
    // Regular drops: the gaps between a tube's drops are at most a minute, and the 37 °C tube's end point was seen.
    const gaps = tubes.flatMap((x) => x.spots.slice(1).map((sp, k) => sp.t - x.spots[k]!.t));
    const body = tubes.find((x) => x.tb.bath === 'BODY' && !x.tb.boiled);
    const regular = gaps.length > 0 && Math.max(...gaps) <= AMY_MAX_GAP;
    if (regular && body?.end != null) m += 0.5;
    else n.push(!gaps.length ? 'Test a drop of each mixture on the iodine at regular intervals (every 30 s).' : !regular ? `Test the drops at regular intervals of 30 s (at most a minute): one gap was ${Math.max(...gaps)} s.` : 'Keep testing until the 37 °C mixture no longer turns the iodine blue-black.');
    const benOk = benRows.some((r) => r.t.test === 'BENEDICT' && r.out.complete && !r.t.direct && r.out.positive);
    if (benOk) m += 0.5;
    else n.push('Test a digested mixture (e.g. the 37 °C tube at the end) with Benedict’s solution in a boiling water bath: the reducing sugar (maltose) formed gives a coloured precipitate.');
    if (!s.tubes.length) n.splice(0, n.length, 'No tubes were set up.');
    auto.push(score(crit('procedure'), Math.floor(m * 2) / 2, n));
  }

  // ---- observations (5) and inferences (4): one row per tube and per Benedict's test
  const marks: { obs: number; inf: number; text: string; missed: FoodPart[]; why: string | null }[] = [];
  for (const x of tubes) {
    const parts = amyTubeParts(v, s, x.i);
    const o = parts.length ? observationCredit(x.rec.observation, parts) : { credit: 0, missed: [] as FoodPart[] };
    const inf = amyInferenceCredit(v, s, x.i);
    marks.push({ obs: o.credit, inf: inf.credit, text: name(x.i), missed: o.missed, why: inf.why });
  }
  const byTest = new Map<string, (typeof marks)[number]>();
  for (const r of benRows) {
    const o = observationCredit(r.rec.observation, r.out.parts);
    const inf = foodInferenceCredit(r.key, r.rec, r.t);
    const k = `${r.t.sample}|${r.t.test}`;
    const prev = byTest.get(k);
    if (!prev || o.credit + inf.credit > prev.obs + prev.inf) byTest.set(k, { obs: o.credit, inf: inf.credit, text: foodTestText(s, r.t), missed: o.missed, why: inf.why });
  }
  marks.push(...byTest.values());
  const denom = Math.max(marks.length, v.minRows);
  {
    const n: string[] = [];
    const total = marks.reduce((t, x) => t + x.obs, 0);
    if (!marks.length) n.push('No observations to mark.');
    else for (const x of marks.filter((y) => y.obs < 1).slice(0, 4)) n.push(`${x.text}: ${x.missed.length ? `you should have seen ${x.missed.map((p) => p.text).join('; ')}` : 'record what you saw'}.`);
    if (marks.length < v.minRows) n.push(`Observations are marked out of at least ${v.minRows} rows (four tubes and a Benedict’s test).`);
    auto.push(score(crit('observations'), Math.floor((total / denom) * crit('observations').marks * 2) / 2, n));
  }
  {
    const n: string[] = [];
    const total = marks.reduce((t, x) => t + x.inf, 0);
    if (!marks.length) n.push('No inferences to mark.');
    else for (const x of marks.filter((y) => y.inf < 1).slice(0, 4)) n.push(`${x.text}: ${x.why ?? 'incomplete inference'}.`);
    auto.push(score(crit('inferences'), Math.floor((total / denom) * crit('inferences').marks * 2) / 2, n));
  }

  // ---- results (3): end points from own spots, rates, optimum
  {
    const n: string[] = [];
    let m = 0;
    const withSpots = tubes.filter((x) => x.spots.length);
    const endOk = withSpots.filter((x) => {
      const raw = x.rec.end.trim().toLowerCase();
      if (x.end === null) return /no|none|not|never|∞|infin|^-+$|^—$|persist|n\/a/.test(raw) || (parseNumber(raw) !== null && parseNumber(raw)! > (x.spots.at(-1)?.t ?? 0));
      const val = parseNumber(raw.replace(/\s*(s|sec|secs|seconds)$/, '')) ?? (/(\d+)\s*min/.test(raw) ? Number(/(\d+)\s*min/.exec(raw)![1]) * 60 : null);
      return withinAbs(val, x.end, 0.5);
    });
    m += withSpots.length ? endOk.length / Math.max(withSpots.length, 4) : 0;
    if (!withSpots.length) n.push('No end points: test drops of each mixture on the iodine.');
    else if (endOk.length < withSpots.length) n.push(`Read each end point from your own spots: the first time the iodine stayed yellow-brown${withSpots.filter((x) => !endOk.includes(x)).slice(0, 3).map((x) => ` — ${name(x.i)}: ${x.end === null ? 'no end point' : `${x.end} s`}`).join('')}.`);
    const rateOk = withSpots.filter((x) => {
      const r = parseNumber(x.rec.rate.trim());
      const e = parseNumber(x.rec.end.trim());
      if (x.end === null) return r === 0 || /no|none|-|—|^0/.test(x.rec.rate.trim().toLowerCase());
      return r !== null && e !== null && e > 0 && (withinRel(r, 1000 / e, 0.03) || withinAbs(r, 1000 / e, 0.051));
    });
    m += withSpots.length ? rateOk.length / Math.max(withSpots.length, 4) : 0;
    if (withSpots.length && rateOk.length < withSpots.length) n.push('Work out the rate as 1000 ÷ (end-point time in s) for each tube (0 where there is no end point).');
    const opt = amyOptimum(v, s);
    const ends = tubes.filter((x) => x.end !== null && !x.tb.boiled);
    const fastest = ends.length ? Math.min(...ends.map((x) => x.end!)) : null;
    const okOpt = s.optimum !== null && (s.optimum === opt || (fastest !== null && ends.some((x) => x.tb.bath === s.optimum && x.end === fastest)));
    if (okOpt) m += 1;
    else n.push(s.optimum ? `The optimum is the temperature with the shortest end-point time${opt ? ` (${AMY_BATH_SHORT[opt]})` : ''}, not ${AMY_BATH_SHORT[s.optimum]}.` : 'Name the optimum temperature: the one with the shortest end-point time.');
    auto.push(score(crit('results'), Math.floor(m * 2) / 2, n));
  }

  const model = amyModelState(v);
  const solution = [
    `This saliva reached its end point in about ${v.amy.t37} s at 37 °C (baths: ice ${v.amy.temps.ICE} °C, room ${v.amy.temps.ROOM} °C, ${v.amy.temps.BODY} °C, ${v.amy.temps.WARM} °C, boiling ${v.amy.temps.BOILING} °C).`,
    ...model.tubes.map((tb, i) => {
      const end = amyTrueEnd(v, tb, true);
      return `Tube ${i + 1} (${tb.boiled ? 'boiled saliva, ' : ''}${AMY_BATH_SHORT[tb.bath]}): ${end === null ? 'the iodine stays blue-black — no end point; ' + (tb.boiled || tb.bath === 'BOILING' ? 'the enzyme is denatured' : 'the enzyme is inactive') : `end point about ${end} s, rate 1000 ÷ ${end} = ${(1000 / end).toFixed(1)}; ${tb.bath === 'ICE' ? 'slow: little kinetic energy, the enzyme is not denatured' : tb.bath === 'BODY' ? 'fastest: near the optimum' : 'starch digested'}`}.`;
    }),
    `Benedict’s test on the digested 37 °C mixture: ${BENEDICT_STAGE_NAME[4]} precipitate — starch has been digested to a reducing sugar (maltose). The boiled-saliva mixture stays blue.`,
    'The optimum temperature is about 37 °C (body temperature).',
  ];
  const facts = [`${s.tubes.length} tubes (${s.tubes.map((t, i) => name(i)).join('; ') || 'none'}); ${s.spots.length} drops tested; equilibrated ${s.equilibrated ? 'yes' : 'no'}.`, `Optimum named: ${s.optimum ? AMY_BATH_SHORT[s.optimum] : '—'} (true ${amyOptimum(v, s) ? AMY_BATH_SHORT[amyOptimum(v, s)!] : '—'}).`];
  return { auto, ai: aiItems(v, s, true), solution, facts };
}

/**
 * Marks the food-tests lab the way a WAEC biology scheme does: FOOD — the
 * tests chosen and done properly (every class on every sample, the
 * non-reducing test where Benedict's was negative, the water bath), each
 * observation against what really happened in that tube, each inference
 * against what its result allows, and the food substances named; AMYLASE —
 * the set-up (iodine tile, equilibrated baths, a boiled-saliva control,
 * regular drops), what each tube's drops showed, the inference for each
 * tube, the end points from the student's own spots, 1000/t and the optimum.
 * Precautions and the explanation go to AI.
 */
export const bioFoodGrader: SimulatorGrader<'bio-food-tests'> = {
  id: 'bio-food-tests',
  grade(state: BioFoodState, seed: number): GraderOutput {
    const task = state.task ?? 'FOOD';
    const v = bioFoodVariant(seed, task);
    return task === 'AMYLASE' ? gradeAmylase(state, v) : gradeFood(state, v);
  },
};
