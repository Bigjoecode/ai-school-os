import {
  BIO_PLANT,
  LEAF_SHORT,
  OXY_CLAIM_LABEL,
  OXY_MIN_WAIT,
  OXY_NEED,
  OXY_WRONG,
  POTO_CLAIM_LABEL,
  POTO_CONDS,
  POTO_COND_CLAIM,
  POTO_COND_SHORT,
  POTO_DIST,
  POTO_MIN_WAIT,
  POTO_WRONG,
  STARCH_CLAIM_LABEL,
  STARCH_LABELS,
  STARCH_MIN_HOURS,
  STARCH_WRONG,
  bioDrawingMarks,
  bioPlantVariant,
  leafComplete,
  leafInferenceKey,
  leafParts,
  oxyCountsAt,
  oxyIntensity,
  oxyModelState,
  oxySplint,
  potoArea,
  potoCondSince,
  potoModelState,
  potoRunMinutes,
  potoRunShown,
  roundDp,
  starchGridTruth,
  starchModelState,
  type BioPlantState,
  type BioPlantVariant,
  type CriterionScore,
  type PlantTask,
  type PotoCond,
} from '@aischool/shared';
import { observationCredit } from './chem-qualitative';
import { parseNumber, score, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => BIO_PLANT.rubric.find((c) => c.id === id)!;
const half = (x: number) => Math.floor(x * 2 + 1e-9) / 2;
const num = (raw: string) => parseNumber((raw ?? '').replace(/\s*(mm\/min|mm3\/min|mm³\/min|mm|s|secs?|min|cm|%|bubbles\/min|bubbles|mm3|mm³)$/i, '').trim());
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// ------------------------------------------------------------------ AI items

const AI: Record<PlantTask, { precautions: { q: string; guide: string; kw: string[][] }; explain: { q: string; guide: string; kw: string[][] } }> = {
  POTOMETER: {
    precautions: {
      q: 'State two precautions you took when measuring the rate of water uptake with the potometer.',
      guide: '2 marks: one for each correct precaution — the shoot cut under water (so no air enters the xylem); fitted under water; all joints airtight (Vaseline); the shoot left 5 minutes to adjust after each change; the bubble kept on the scale and reset with the reservoir; each condition timed three times and averaged; the leaves dried before starting. A source of error or a vague statement (“be careful”) earns nothing.',
      kw: [['under water', 'underwater'], ['airtight', 'vaseline', 'seal', 'leak'], ['adjust', 'wait', 'equilibrat', 'settle', '5 min'], ['scale', 'reservoir', 'reset'], ['three', 'repeat', 'average', 'mean'], ['dry', 'dried']],
    },
    explain: {
      q: 'Explain why the bubble moved fastest with the fan (or in bright light) and slowest in the dark or in humid air.',
      guide: '2 marks: (1) moving air removes the water vapour around the leaf, keeping a steep diffusion (water potential) gradient between the air spaces and the air outside, so more water vapour diffuses out of the stomata; humid air makes the gradient smaller; (1) light opens the stomata (more evaporation and transpiration); in the dark the stomata close, so transpiration and the uptake that replaces it fall. Saying the potometer measures water lost directly earns nothing for that point.',
      kw: [['water vapour', 'vapour', 'humid'], ['gradient', 'diffusion', 'diffuse', 'concentration'], ['stomata', 'stoma', 'guard cell'], ['open', 'close']],
    },
  },
  OXYGEN: {
    precautions: {
      q: 'State two precautions you took when counting the bubbles from the water plant.',
      guide: '2 marks: one for each correct precaution — the temperature kept constant (a water trough or heat filter between the lamp and the beaker; a thermometer checked); 5 minutes allowed at each distance before counting; the same piece of plant throughout; the room darkened so only the lamp lights the plant; each count repeated three times and averaged; distances measured from the lamp to the plant. A vague statement earns nothing.',
      kw: [['temperature', 'heat filter', 'heat shield', 'water trough', 'thermometer'], ['adjust', 'wait', 'equilibrat', 'settle', '5 min'], ['same plant', 'same piece', 'same elodea'], ['dark', 'background', 'other light'], ['three', 'repeat', 'average', 'mean']],
    },
    explain: {
      q: 'Explain the shape of your graph of rate against light intensity, why the bubbling stopped when the lamp was far away, and how you know the gas was oxygen.',
      guide: '2 marks: (1) light provides the energy for photosynthesis, so at low intensity light is the limiting factor and the rate rises as the lamp comes closer; at high intensity the rate levels off because another factor — carbon dioxide (or temperature) — limits it; (1) far from the lamp photosynthesis only balances respiration (the compensation point), so no oxygen is given off; the gas relights a glowing splint, so it is mainly oxygen. Calling the gas carbon dioxide earns nothing for that point.',
      kw: [['limiting factor', 'limiting', 'limit'], ['carbon dioxide', 'co2', 'co₂', 'temperature'], ['respiration', 'compensation', 'balance'], ['relight', 'glowing splint', 'oxygen']],
    },
  },
  STARCH: {
    precautions: {
      q: 'State two precautions you took when testing the leaves for starch.',
      guide: '2 marks: one for each correct precaution — the plant destarched fully before the experiment; the flame turned off before using the ethanol; the ethanol never heated directly (only in the hot water bath); the hot leaf handled with forceps; the brittle leaf softened in warm water before spreading it; the foil covering both sides of the leaf; eye protection worn. A vague statement earns nothing.',
      kw: [['destarch', 'dark for 48', '48 hours'], ['flame off', 'turn off', 'turned off', 'put out', 'no flame', 'naked flame', 'flammable'], ['water bath', 'never heat', 'not heat'], ['forceps'], ['soften', 'warm water', 'brittle'], ['both sides', 'foil'], ['goggles', 'eye']],
    },
    explain: {
      q: 'Explain why each leaf was boiled in water and then put in ethanol, and what your results show about the conditions needed for photosynthesis.',
      guide: '2 marks: (1) boiling kills the cells and breaks down the membranes so the iodine can reach the starch (and softens the leaf); the ethanol dissolves the chlorophyll, decolourising the leaf so the iodine colour can be seen — it does not remove starch; (1) starch (blue-black) formed only where the leaf had chlorophyll, light and carbon dioxide: the parts under the foil, the white parts and the leaf without CO₂ stayed yellow-brown, so all three are needed for photosynthesis. Saying the ethanol removes starch, or that iodine tests for glucose, earns nothing for that point.',
      kw: [['kill', 'membrane', 'cell wall', 'soften'], ['chlorophyll', 'decolouris', 'decoloriz', 'remove the green'], ['light'], ['carbon dioxide', 'co2', 'co₂'], ['photosynthesis']],
    },
  },
};
function aiItems(task: PlantTask, s: BioPlantState): AiItem[] {
  const a = AI[task];
  return [
    { criterionId: 'precautions', question: a.precautions.q, answer: s.written.precautions.trim(), guide: a.precautions.guide, keywords: a.precautions.kw, need: 2 },
    { criterionId: 'explanation', question: a.explain.q, answer: s.written.explain.trim(), guide: a.explain.guide, keywords: a.explain.kw, need: 3 },
  ];
}

// ------------------------------------------------------------------ POTOMETER

function gradePoto(s: BioPlantState, v: BioPlantVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.poto;
  const pv = v.poto;
  const used = POTO_CONDS.filter((c) => w.runs.some((r) => r.cond === c));
  const runsOf = (c: PotoCond) => w.runs.filter((r) => r.cond === c);
  const shownOf = (c: PotoCond) => runsOf(c).map((r) => potoRunShown(pv, w, r, v.seed));
  const rowOf = (c: PotoCond) => w.rows[POTO_CONDS.indexOf(c)] ?? { t1: '', t2: '', t3: '', mean: '', rate: '', vol: '' };

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.cut === 'WATER') m += 1;
    else if (w.cut) notes.push('Cut the shoot under water: cut in air, air enters the xylem and blocks the water column (an air lock).');
    else notes.push('Cut a leafy shoot (under water).');
    if (w.fit === 'WATER' && w.sealed) m += 1;
    else if (w.fit) notes.push(w.fit === 'AIR' ? 'Fit the shoot into the potometer under water, so no air gets in at the cut end.' : 'Seal the joint between the shoot and the tube with Vaseline: a leaking joint lets air in and the bubble moves erratically.');
    const three = used.filter((c) => runsOf(c).length >= 3);
    if (three.includes('STILL') && three.length >= 3) m += 1;
    else if (three.length >= 2) {
      m += 0.5;
      notes.push('Time still air (the control) and at least two other conditions, three times each.');
    } else if (w.runs.length) notes.push('Time still air (the control) and at least two other conditions, three times each.');
    const early = w.runs.filter((r) => r.at - potoCondSince(w, r.at) < POTO_MIN_WAIT - 1e-9);
    if (w.runs.length && !early.length) m += 1;
    else if (early.length) notes.push(`Let the shoot adjust for at least ${POTO_MIN_WAIT} minutes after setting up and after every change before you time the bubble (${early.length} timing${early.length === 1 ? ' was' : 's were'} too soon).`);
    if (!w.cut && !w.runs.length) notes.splice(0, notes.length, 'No shoot was set up.');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4): times as the stopwatch showed them
  {
    const notes: string[] = [];
    let ok = 0;
    const bad: string[] = [];
    for (const c of used) {
      const pool = shownOf(c);
      const r = rowOf(c);
      for (const raw of [r.t1, r.t2, r.t3]) {
        const val = num(raw);
        const k = val === null ? -1 : pool.findIndex((x) => withinAbs(val, x, 0.15));
        if (k >= 0) {
          ok++;
          pool.splice(k, 1);
        } else if (raw.trim()) bad.push(POTO_COND_SHORT[c]);
      }
    }
    const denom = 3 * Math.max(3, used.length);
    if (bad.length) notes.push(`Times not as the stopwatch showed them (to 0.1 s): ${list([...new Set(bad)])}.`);
    if (ok < 3 * used.length) notes.push('Record all three times of each condition, in seconds as the stopwatch shows them.');
    if (used.length < 3) notes.push('Readings are marked out of at least three conditions.');
    auto.push(score(crit('readings'), half((4 * ok) / denom), notes));
  }

  // ---- presentation (3): means, rates, bar chart
  {
    const notes: string[] = [];
    let meanOk = 0;
    let rateOk = 0;
    for (const c of used) {
      const r = rowOf(c);
      const ts = [r.t1, r.t2, r.t3].map(num).filter((x): x is number => x !== null && x > 0);
      const mn = num(r.mean);
      if (ts.length && mn !== null && (withinAbs(mn, mean(ts), 0.15) || withinRel(mn, mean(ts), 0.005))) meanOk++;
      const rt = num(r.rate);
      if (mn && rt !== null && withinRel(rt, POTO_DIST / (mn / 60), 0.02)) rateOk++;
    }
    const d = Math.max(3, used.length);
    if (meanOk < used.length) notes.push('Mean time = (t₁ + t₂ + t₃) ÷ 3, from your own times.');
    if (rateOk < used.length) notes.push(`Rate = ${POTO_DIST} mm ÷ mean time in minutes (mm/min): divide the seconds by 60 first.`);
    let m = half(meanOk / d) + half(rateOk / d);
    const plotted = w.bars.filter((b) => used.includes(b) && num(rowOf(b).rate) !== null);
    if (plotted.length >= 3 && plotted.includes('STILL')) m += 1;
    else notes.push('Draw a bar chart of the rate for each condition, including still air (the control).');
    auto.push(score(crit('presentation'), m, notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    let volOk = 0;
    for (const c of used) {
      const r = rowOf(c);
      const rt = num(r.rate);
      const vol = num(r.vol);
      if (rt !== null && vol !== null && withinRel(vol, rt * potoArea(pv), 0.03)) volOk++;
    }
    m += half(volOk / Math.max(3, used.length));
    if (volOk < used.length) notes.push(`Volume taken up per minute = rate × πr², with r = ${pv.r} mm (mm³/min).`);
    const trueRate = (c: PotoCond) => mean(runsOf(c).map((r) => POTO_DIST / potoRunMinutes(pv, w, r.at)));
    const fastest = used.length ? used.reduce((a, b) => (trueRate(b) > trueRate(a) ? b : a)) : null;
    if (fastest && w.fastest === fastest) m += 1;
    else if (fastest) notes.push(`Name the condition with the fastest uptake (${POTO_COND_SHORT[fastest].toLowerCase()}, from your rates).`);
    const tested = used.filter((c): c is Exclude<PotoCond, 'STILL'> => c !== 'STILL' && used.includes('STILL'));
    const got = tested.filter((c) => w.claims.includes(POTO_COND_CLAIM[c])).length;
    const wrong = w.claims.filter((c) => POTO_WRONG.includes(c));
    let c = tested.length ? (2 * got) / Math.max(2, tested.length) : 0;
    c += w.claims.includes('UPTAKE') ? 1 : 0;
    c = Math.max(0, c - wrong.length);
    m += half(Math.min(3, c));
    if (got < tested.length) notes.push(`Conclude for each condition compared with still air: ${list(tested.filter((x) => !w.claims.includes(POTO_COND_CLAIM[x])).map((x) => `“${POTO_CLAIM_LABEL[POTO_COND_CLAIM[x]]}”`))}.`);
    if (!w.claims.includes('UPTAKE')) notes.push('A potometer measures water uptake; we assume it equals the water lost in transpiration (some is used in photosynthesis and to keep cells turgid).');
    if (wrong.length) notes.push(`Not true: ${list(wrong.map((x) => `“${POTO_CLAIM_LABEL[x]}”`))}.`);
    auto.push(score(crit('results'), Math.min(5, m), notes));
  }

  const model = potoModelState(v);
  const solution = [
    `This shoot took up water at about ${roundDp(pv.base, 1)} mm/min in still air (capillary radius ${pv.r} mm, so ${roundDp(pv.base * potoArea(pv), 2)} mm³/min).`,
    ...POTO_CONDS.map((c, i) => {
      const r = model.poto.rows[i]!;
      return `${POTO_COND_SHORT[c]}: ${r.t1}, ${r.t2}, ${r.t3} s for ${POTO_DIST} mm; mean ${r.mean} s; rate = ${POTO_DIST} ÷ (${r.mean} ÷ 60) = ${r.rate} mm/min; volume = ${r.rate} × π × ${pv.r}² = ${r.vol} mm³/min.`;
    }),
    'Wind and bright light raise the rate (water vapour carried away; stomata open); darkness and humid air lower it (stomata close; a smaller diffusion gradient).',
    'Cut and fit the shoot under water: an air lock in the xylem cuts the uptake to a fraction. After every change the rate takes a few minutes to settle — longest going into or out of the dark.',
  ];
  const facts = [`Cut ${w.cut ?? '—'}, fitted ${w.fit ?? '—'}, ${w.sealed ? 'sealed' : 'not sealed'}; ${w.runs.length} timings (${used.map((c) => `${POTO_COND_SHORT[c]} ×${runsOf(c).length}`).join(', ')}).`, `Fastest named: ${w.fastest ?? '—'}.`];
  return { auto, ai: aiItems('POTOMETER', s), solution, facts };
}

// ------------------------------------------------------------------ OXYGEN

function gradeOxy(s: BioPlantState, v: BioPlantVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.oxy;
  const ov = v.oxy;
  const seen = oxyCountsAt(ov, w, v.seed);
  const rowFor = (d: number) => w.rows.find((r) => r.d === d);

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.nahco3) m += 0.5;
    else notes.push('Add a pinch of sodium hydrogencarbonate to the water: it supplies carbon dioxide.');
    if (w.dark) m += 0.5;
    else notes.push('Darken the room so that only the lamp lights the plant: background light keeps it bubbling.');
    if (w.shield) m += 1;
    else notes.push('Put a water trough (heat filter) between the lamp and the beaker so the lamp does not warm the water.');
    const ds = seen.map((x) => x.d);
    if (ds.length >= 5 && Math.min(...ds) <= 15 && Math.max(...ds) >= 50) m += 1;
    else notes.push('Count at five or more lamp distances, from 15 cm or nearer to 50 cm or further.');
    const early = seen.filter((x) => x.firstAt - x.since < OXY_MIN_WAIT - 1e-9);
    if (seen.length && !early.length) m += 1;
    else if (early.length) notes.push(`Wait at least ${OXY_MIN_WAIT} minutes after moving the lamp before counting (${list(early.map((x) => `${x.d} cm`))}).`);
    if (!w.plant) notes.splice(0, notes.length, 'The water plant was not set up.');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4): counts as seen (3), three at each distance (1)
  {
    const notes: string[] = [];
    let ok = 0;
    const bad: string[] = [];
    for (const e of seen) {
      const pool = [...e.shown];
      const r = rowFor(e.d);
      for (const raw of r ? [r.c1, r.c2, r.c3] : []) {
        const val = num(raw);
        const k = val === null ? -1 : pool.findIndex((x) => x === Math.round(val) && Math.abs(val - x) < 1e-9);
        if (k >= 0) {
          ok++;
          pool.splice(k, 1);
        } else if (raw.trim()) bad.push(`${e.d} cm`);
      }
    }
    let m = half((3 * ok) / (3 * Math.max(5, seen.length)));
    if (bad.length) notes.push(`Counts not as you saw them: ${list([...new Set(bad)])}.`);
    const full = seen.filter((e) => e.shown.length >= 3).length;
    if (full >= 5 && full === seen.length) m += 1;
    else notes.push('Count the bubbles for one minute three times at every distance (at least five distances).');
    auto.push(score(crit('readings'), m, notes));
  }

  // ---- presentation (3): intensity, points, curve
  const means = w.rows.map((r) => ({ d: r.d, y: num(r.mean), li: num(r.li) })).filter((p): p is { d: number; y: number; li: number | null } => p.y !== null);
  {
    const notes: string[] = [];
    let m = 0;
    const counted = w.rows.filter((r) => seen.some((e) => e.d === r.d));
    const liOk = counted.filter((r) => withinRel(num(r.li), oxyIntensity(r.d), 0.01) || withinAbs(num(r.li), oxyIntensity(r.d), 0.05)).length;
    m += half(liOk / Math.max(5, counted.length));
    if (liOk < counted.length) notes.push('Light intensity = 10 000 ÷ d² (d in cm): it falls with the square of the distance.');
    const pts = means.filter((p) => (w.axis === 'DISTANCE' ? true : p.li !== null));
    if (w.axis && pts.length >= 5) m += 1;
    else notes.push('Plot at least five points of the mean rate against light intensity (or distance).');
    if (w.curve === 'SMOOTH' && pts.length >= 3) m += 1;
    else if (w.curve === 'DOT') notes.push('Never join the points dot to dot: draw one smooth curve of best fit.');
    else if (w.curve === 'STRAIGHT') notes.push('The rate levels off at high light intensity: a smooth curve fits the points, not one straight line.');
    else notes.push('Draw a smooth curve of best fit through the points.');
    auto.push(score(crit('presentation'), m, notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    let meanOk = 0;
    for (const r of w.rows) {
      const cs = [r.c1, r.c2, r.c3].map(num).filter((x): x is number => x !== null);
      const mn = num(r.mean);
      if (cs.length && mn !== null && withinAbs(mn, mean(cs), 0.06)) meanOk++;
    }
    const nr = w.rows.filter((r) => seen.some((e) => e.d === r.d)).length;
    m += half(meanOk / Math.max(5, nr));
    if (meanOk < nr) notes.push('Mean = (c₁ + c₂ + c₃) ÷ 3 for each distance, from your own counts.');
    const pos = means.filter((p) => p.y > 0).map((p) => p.d);
    const lastPos = pos.length ? Math.max(...pos) : null;
    const zeros = means.filter((p) => p.y === 0 && (lastPos === null || p.d > lastPos)).map((p) => p.d);
    const said = num(w.compD);
    if (lastPos !== null && zeros.length && said !== null && said >= lastPos - 2 && said <= Math.min(...zeros) + 2) m += 1;
    else if (!zeros.length) notes.push('Move the lamp further away until the bubbling stops, and note that distance (the compensation point).');
    else notes.push(`The bubbling stopped between ${lastPos ?? 0} cm and ${Math.min(...zeros)} cm on your own counts.`);
    const sp = oxySplint(ov, w);
    if (sp && observationCredit(w.splintObs, sp.parts).credit >= 1) m += 1;
    else if (sp) notes.push(`The splint: ${sp.parts.map((p) => p.text).join('; ')}.`);
    else notes.push('Test the gas collected in the test tube with a glowing splint.');
    const got = OXY_NEED.filter((c) => w.claims.includes(c) && (c !== 'GAS_OXYGEN' || sp?.relit)).length;
    const wrong = w.claims.filter((c) => OXY_WRONG.includes(c));
    m += Math.max(0, half(got / 2) - wrong.length * 0.5);
    if (got < OXY_NEED.length) notes.push('Conclude about the limiting factor at low and at high light intensity, the compensation point, and the gas.');
    if (wrong.length) notes.push(`Not true: ${list(wrong.map((x) => `“${OXY_CLAIM_LABEL[x]}”`))}.`);
    auto.push(score(crit('results'), Math.min(5, m), notes));
  }

  const model = oxyModelState(v);
  const solution = [
    `This plant gave about ${model.oxy.rows[0]?.mean ?? '—'} bubbles per minute with the lamp at 10 cm (intensity 100). Intensity = 10 000 ÷ d², so 20 cm gives a quarter of it.`,
    ...model.oxy.rows.map((r) => `${r.d} cm: ${r.c1}, ${r.c2}, ${r.c3} — mean ${r.mean} bubbles/min; intensity ${r.li}.`),
    'The rate rises steeply at low intensity (light limiting) and levels off near the lamp (CO₂ or temperature limiting): a smooth saturating curve.',
    `In a darkened room bubbling stops at about ${roundDp(ov.dComp, 0)} cm: there photosynthesis only balances respiration (the compensation point). The gas relights a glowing splint: it is mainly oxygen.`,
  ];
  const facts = [`NaHCO₃ ${w.nahco3 ? 'yes' : 'no'}, heat filter ${w.shield ? 'yes' : 'no'}, room dark ${w.dark ? 'yes' : 'no'}; distances ${seen.map((e) => `${e.d} (${e.shown.join('/')})`).join(', ')}.`, `Compensation said ${w.compD || '—'} (true ${roundDp(ov.dComp, 0)} cm, dark room).`];
  return { auto, ai: aiItems('OXYGEN', s), solution, facts };
}

// ------------------------------------------------------------------ STARCH

function gradeStarch(s: BioPlantState, v: BioPlantVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.starch;
  const sv = v.starch;
  const tested = w.leaves.map((l, i) => ({ l, i })).filter((x) => x.l.iodine);

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.plant === 'DESTARCHED' && w.leaves.length && w.leaves.every((l) => l.at >= STARCH_MIN_HOURS)) m += 1;
    else if (w.plant === 'DESTARCHED' && w.leaves.length) {
      m += 0.5;
      notes.push(`Leave the plant in bright light for at least ${STARCH_MIN_HOURS} hours before picking the leaves.`);
    } else if (w.plant === 'WINDOW') notes.push('Use a destarched plant (48 hours in the dark): otherwise starch made before the experiment is still in the leaves.');
    else notes.push('Choose the destarched plant and light it for at least 4 hours.');
    if (w.leaves.length && w.leaves.every((l) => l.boiled > 0 && l.boiledFirst)) m += 1;
    else if (w.leaves.length) notes.push('Boil each leaf in water for about a minute before the ethanol: it kills the cells and breaks the membranes so iodine can get in.');
    const unsafe = w.leaves.filter((l) => l.ethFlame || l.direct);
    if (w.leaves.some((l) => l.eth > 0) && !unsafe.length) m += 1;
    else if (unsafe.length) notes.push(unsafe.some((l) => l.direct) ? 'Never heat ethanol over a flame: it is highly flammable and catches fire. Turn the flame off and stand the tube in the hot water bath.' : 'Turn the Bunsen flame off before the ethanol goes into the hot water bath: ethanol vapour catches fire easily.');
    else if (w.leaves.length) notes.push('Decolourise each leaf in a tube of ethanol standing in the hot water bath (flame off).');
    const softOk = tested.length > 0 && tested.every((x) => x.l.soft);
    const design = w.leaves.some((l) => l.kind === 'FOIL' || l.kind === 'VARIEGATED' || l.kind === 'NOCO2');
    if (softOk && design) m += 1;
    else if (softOk || design) {
      m += 0.5;
      notes.push(softOk ? 'Test a leaf that shows what photosynthesis needs: the foil strip (light), the variegated leaf (chlorophyll) or the leaf without CO₂.' : 'Dip the brittle leaf in warm water to soften it before spreading it on the tile.');
    } else if (w.leaves.length) notes.push('Soften each leaf in warm water before spreading it, and test a leaf that shows what photosynthesis needs.');
    if (!w.plant && !w.leaves.length) notes.splice(0, notes.length, 'No leaves were tested.');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4): the grid count
  {
    const notes: string[] = [];
    let m = 0;
    const gi = w.grid.leaf;
    const gl = gi !== null ? w.leaves[gi] : undefined;
    if (!gl || !gl.iodine || !leafComplete(gl)) notes.push('Lay a fully tested leaf (the foil-strip or variegated leaf) on the 1 cm² grid and count its squares.');
    else {
      const t = starchGridTruth(sv, w, gl);
      const tol = (x: number) => Math.max(1, Math.round(0.06 * x));
      const tot = num(w.grid.total);
      const blue = num(w.grid.blue);
      if (tot !== null && withinAbs(tot, t.total, tol(t.total))) m += 1.5;
      else notes.push(`Count every square the leaf covers more than half of (there were ${t.total}).`);
      if (blue !== null && withinAbs(blue, t.blue, tol(t.blue))) m += 1.5;
      else notes.push(`Count the squares that turned blue-black (there were ${t.blue}).`);
      const pct = num(w.grid.pct);
      if (tot && blue !== null && pct !== null && (withinAbs(pct, (blue / tot) * 100, 0.15) || withinRel(pct, (blue / tot) * 100, 0.01))) m += 1;
      else notes.push('% of the leaf that made starch = blue-black squares ÷ all squares × 100, from your own counts.');
    }
    auto.push(score(crit('readings'), m, notes));
  }

  // ---- presentation (3): labels (2), drawing rules (1)
  {
    const notes: string[] = [];
    const right = STARCH_LABELS.filter((l, i) => (w.labels[i] ?? '') === l).length;
    let m = right === STARCH_LABELS.length ? 2 : right >= 2 ? 1 : 0;
    if (right < STARCH_LABELS.length) notes.push(`${right} of ${STARCH_LABELS.length} labels are right. Before the test the leaf is green where it has chlorophyll and white where it has none; after it, the green parts are blue-black and the white parts yellow-brown.`);
    const d = bioDrawingMarks(v.drawing, w.drawing);
    m += d.awarded / 2;
    if (d.wrong.length) notes.push(`Drawing rules: ${d.wrong.map((x) => `“${x.text}” is ${x.good ? 'good' : 'poor'} practice`).join('; ')}.`);
    auto.push(score(crit('presentation'), m, notes));
  }

  // ---- results (5): observations (3) and inferences (2)
  {
    const notes: string[] = [];
    let obs = 0;
    let inf = 0;
    for (const { l, i } of tested) {
      const row = w.rows[i] ?? { observation: '', claims: [] };
      const parts = leafParts(sv, w, l);
      const o = observationCredit(row.observation, parts);
      obs += o.credit;
      if (o.credit < 1) notes.push(`${LEAF_SHORT[l.kind]}: you should have seen ${parts.map((p) => p.text).join('; ')}.`);
      const key = leafInferenceKey(sv, w, l);
      const bad = row.claims.filter((c) => !key.allow.includes(c));
      if (!key.complete) {
        if (row.claims.length) notes.push(`${LEAF_SHORT[l.kind]}: the test was not finished properly (boiled and fully decolourised), so nothing can be inferred.`);
        continue;
      }
      if (!row.claims.length) notes.push(`${LEAF_SHORT[l.kind]}: no inference.`);
      else if (bad.length) notes.push(`${LEAF_SHORT[l.kind]}: ${bad.includes('ETHANOL_STARCH') ? 'ethanol removes the chlorophyll, not the starch' : bad.includes('GLUCOSE') ? 'iodine tests for starch, not glucose' : `the result does not show “${list(bad.map((c) => STARCH_CLAIM_LABEL[c].toLowerCase()))}”`}.`);
      else if (key.need.every((c) => row.claims.includes(c))) inf += 1;
      else inf += 0.5;
    }
    const d = Math.max(3, tested.length);
    if (tested.length < 3) notes.push('Observations and inferences are marked out of at least three leaves.');
    if (STARCH_WRONG.some((c) => w.rows.some((r) => r.claims.includes(c)))) notes.push('Ethanol dissolves chlorophyll; iodine shows starch.');
    auto.push(score(crit('results'), half((3 * obs) / d) + half((2 * inf) / d), notes));
  }

  const model = starchModelState(v);
  const g = model.starch.grid;
  const solution = [
    'Each leaf: boiled in water for a minute (kills the cells, breaks the membranes), then — flame off — in a tube of ethanol standing in the hot water bath until white (dissolves the chlorophyll), dipped in warm water (softens it), spread on a white tile and covered with iodine.',
    ...model.starch.leaves.map((l, i) => `${LEAF_SHORT[l.kind]}: ${model.starch.rows[i]!.observation} — ${model.starch.rows[i]!.claims.map((c) => STARCH_CLAIM_LABEL[c].toLowerCase()).join('; ')}.`),
    `On the grid the foil-strip leaf covers ${g.total} squares, ${g.blue} of them blue-black: ${g.pct} % of it made starch.`,
    'Starch forms only where chlorophyll, light and carbon dioxide were all present — the plant must be destarched first so any starch found was made during the experiment.',
  ];
  const facts = [`Plant ${w.plant ?? '—'}, ${w.hours} h of light; ${w.leaves.length} leaves (${w.leaves.map((l) => `${l.kind}${l.ethFlame ? ' eth+flame' : ''}${l.direct ? ' DIRECT' : ''}${l.iodine ? '' : ' no iodine'}`).join(', ')}).`, `Grid: ${w.grid.blue || '—'} of ${w.grid.total || '—'}.`];
  return { auto, ai: aiItems('STARCH', s), solution, facts };
}

/**
 * Marks the plant physiology lab the way a WAEC biology scheme does.
 * POTOMETER: the set-up (cut and fitted under water, sealed), the conditions
 * timed three times after adjusting, the times against the stopwatch, means,
 * rates, the bar chart, volumes and conclusions. OXYGEN: NaHCO₃, heat filter
 * and dark room, distances and waiting, the counts as seen, intensity
 * 10 000 ÷ d², the smooth curve, the compensation point from the student's
 * own counts, the splint and the limiting-factor conclusions. STARCH: the
 * destarched plant, boiling, ethanol with the flame off, softening, the grid
 * count, the labelled drawing, and each leaf's observation and inference.
 * Precautions and the explanation go to AI.
 */
export const bioPlantGrader: SimulatorGrader<'bio-plant'> = {
  id: 'bio-plant',
  grade(state: BioPlantState, seed: number): GraderOutput {
    const task = state.task ?? 'POTOMETER';
    const v = bioPlantVariant(seed, task);
    return task === 'OXYGEN' ? gradeOxy(state, v) : task === 'STARCH' ? gradeStarch(state, v) : gradePoto(state, v);
  },
};
