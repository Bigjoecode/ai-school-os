import {
  BIO_ECOLOGY,
  CAP_ASSUME_LABEL,
  CAP_ASSUME_RIGHT,
  CAP_ERROR_LABEL,
  CAP_ERROR_RIGHT,
  CAP_FORMULA_LABEL,
  CAP_MARK_LABEL,
  CAP_MAX_WAIT,
  CAP_MIN_WAIT,
  FAC_CLAIM_LABEL,
  FAC_CLAIM_RIGHT,
  FAC_DAYS,
  FAC_DIRS,
  FAC_INSTS,
  FAC_MIN_DAYS,
  FAC_SITES,
  FAC_SITE_LABEL,
  QUAD_AREA,
  QUAD_HERBS,
  QUAD_HERB_LABEL,
  QUAD_MIN,
  SOIL_AIR_SOIL,
  SOIL_CLAIM_LABEL,
  SOIL_CLAIM_RIGHT,
  SOIL_DRAIN_TIMES,
  SOIL_JAR_LABELS,
  SOIL_LABEL,
  SOIL_LAYERS,
  SOIL_MIN_SETTLE,
  SOIL_WATER,
  bioEcologyVariant,
  capFirstCatch,
  capModelState,
  capSecondCatch,
  emptyFacRow,
  emptyQuadRow,
  facModelState,
  facParts,
  facRH,
  facRain,
  facShown,
  facSix,
  quadCount,
  quadCover,
  quadModelState,
  roundDp,
  soilAirFinal,
  soilConstant,
  soilCrucibleMass,
  soilDrainReading,
  soilJarParts,
  soilJarReading,
  soilModelState,
  type BioEcologyState,
  type BioEcologyVariant,
  type CriterionScore,
  type EcoTask,
  type FacInst,
  type FacSite,
  type QuadHerb,
} from '@aischool/shared';
import { observationCredit } from './chem-qualitative';
import { decimalPlaces, parseNumber, score, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => BIO_ECOLOGY.rubric.find((c) => c.id === id)!;
const half = (x: number) => Math.floor(x * 2 + 1e-9) / 2;
const num = (raw: string) =>
  parseNumber(
    (raw ?? '')
      .replace(/\s*(per\s*m2|per\s*m²|\/\s*m2|\/\s*m²|plants?|grasshoppers?|animals?|mm|g|cm3|cm³|ml|min|mins|minutes|%|lux|lx|m\/s|°c|oc|c)\s*$/i, '')
      .trim(),
  );
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const pctOk = (val: number | null, want: number) => val !== null && (withinAbs(val, want, 0.5) || withinRel(val, want, 0.02));
const close = (val: number | null, want: number, abs: number, rel = 0.02) => val !== null && (withinAbs(val, want, abs) || withinRel(val, want, rel));

// ------------------------------------------------------------------ AI items

const AI: Record<EcoTask, { precautions: { q: string; guide: string; kw: string[][] }; explain: { q: string; guide: string; kw: string[][] } }> = {
  QUADRAT: {
    precautions: {
      q: 'State two precautions you took when sampling the plants with quadrats.',
      guide: '2 marks: one for each correct precaution — quadrats placed at random (random-number coordinates), not by eye; a rule for plants on the frame (count those on two sides only); enough quadrats (at least ten); each species identified carefully (with the guide); the quadrat laid flat on the ground; counted carefully, each plant once. A vague statement (“be careful”) earns nothing.',
      kw: [['random'], ['edge', 'frame', 'two sides', 'boundary'], ['enough', 'ten', '10', 'many quadrats', 'more quadrats', 'large number'], ['identif', 'guide', 'key'], ['flat', 'once', 'carefully count', 'counted carefully']],
    },
    explain: {
      q: 'Explain why the quadrats were placed using random numbers, and why ten or more quadrats were used rather than two or three.',
      guide: '2 marks: (1) random placement gives every part of the plot an equal chance of being sampled, so the sample is representative and free of bias (choosing places by eye picks the patches where plants grow); (1) the plants grow in clumps, so counts vary a lot from quadrat to quadrat — more quadrats give a more reliable (accurate) mean and estimate of density and frequency.',
      kw: [['bias', 'unbiased'], ['representative', 'equal chance'], ['clump', 'patch', 'uneven', 'vary', 'variation'], ['reliable', 'accurate', 'average', 'mean']],
    },
  },
  CAPTURE: {
    precautions: {
      q: 'State two precautions you took in the capture–recapture experiment.',
      guide: '2 marks: one for each correct precaution — a small mark of non-toxic paint where it does not harm the animal or make it more visible to predators; the animals handled gently and released where they were caught; enough time (about 24 hours) for the marked animals to mix with the rest; the same method, area and sampling time for both samples; the marked animals counted carefully. A vague statement earns nothing.',
      kw: [['non toxic', 'nontoxic', 'harmless', 'small dot', 'small mark', 'underside', 'not visible', 'predator'], ['gentl', 'release'], ['mix', '24 h', '24 hours', 'a day', 'time'], ['same time', 'same effort', 'same method', 'same area', 'same way'], ['count']],
    },
    explain: {
      q: 'Explain why N = n₁ × n₂ ÷ m gives the population, and why the marked grasshoppers must be left about a day before the second sample.',
      guide: '2 marks: (1) if the marked animals have mixed evenly, the fraction marked in the second sample (m ÷ n₂) equals the fraction marked in the whole population (n₁ ÷ N), so N = n₁ × n₂ ÷ m; (1) recaptured too soon, the marked animals are still near where they were released and are over-represented in the catch, so m is too large and N too small; the day lets them mix (but not so long that births, deaths and migration change the population).',
      kw: [['proportion', 'fraction', 'ratio', 'same as'], ['mix', 'disperse', 'spread'], ['too soon', 'still near', 'released', 'over represent', 'more marked'], ['birth', 'death', 'migrat', 'emigrat', 'immigrat']],
    },
  },
  FACTORS: {
    precautions: {
      q: 'State two precautions you took when measuring the ecological factors.',
      guide: '2 marks: one for each correct precaution — readings at both sites at the same time of day; thermometers shaded from direct sunlight; instruments read at eye level; the light meter held at the same height (ground level) at each site; readings repeated on three days and averaged; the Six’s thermometer reset and the rain gauge emptied after each reading; kept away from deep water at the pond. A vague statement earns nothing.',
      kw: [['same time'], ['shade', 'direct sun', 'sunlight'], ['eye level', 'eye-level', 'parallax'], ['repeat', 'three days', 'average', 'mean'], ['reset', 'magnet', 'empt'], ['same height', 'ground level']],
    },
    explain: {
      q: 'Explain how the differences in light, temperature, humidity and wind between the two sites affect the organisms found in each.',
      guide: '2 marks: (1) the open field gets more light, so grasses and sun-loving plants photosynthesise and grow well there; it is warmer, windier and drier, so water evaporates fast; (1) under the canopy it is cooler and more humid with less wind, so organisms that lose water easily (mosses, ferns, snails, millipedes, woodlice) live there; less light means fewer grasses.',
      kw: [['photosynth', 'light'], ['evaporat', 'transpir', 'dry', 'water loss', 'lose water'], ['humid', 'damp', 'moist'], ['moss', 'fern', 'snail', 'millipede', 'woodlice', 'grass']],
    },
  },
  SOIL: {
    precautions: {
      q: 'State two precautions you took in the soil experiments.',
      guide: '2 marks: one for each correct precaution — the same mass of dry soil and the same volume of water in each funnel; the funnels plugged with cotton wool; oven-dried soil for the humus test; heated to constant mass; the crucible cooled (in a desiccator) before weighing; hot crucibles handled with tongs; the soil stirred to release all the air; the measuring cylinder read at the bottom of the meniscus, at eye level; the jar left to settle. A vague statement earns nothing.',
      kw: [['same mass', 'same amount', 'equal mass', '100 g'], ['same volume', 'equal volume', '100 cm'], ['cotton'], ['oven', 'dried', 'dry soil'], ['constant mass'], ['cool', 'desiccator', 'tongs'], ['stir'], ['meniscus', 'eye level']],
    },
    explain: {
      q: 'Explain why water drains fastest through sandy soil and most is retained by clay soil, and why loamy soil lost the most mass on heating.',
      guide: '2 marks: (1) sand has large particles with large air spaces (pores) between them, so water drains through quickly and little is held; clay has very fine particles with tiny pores that hold water by capillarity, so it drains slowly and retains most; (1) the loss on heating is the humus (organic matter) burning off — loam has the most humus, which holds water and nutrients and supports soil life.',
      kw: [['large particle', 'coarse', 'big particle', 'large pore', 'large air space', 'large space'], ['fine', 'small particle', 'tiny', 'small pore', 'capillar'], ['humus', 'organic'], ['burn', 'heat', 'oxidis', 'combust']],
    },
  },
};
function aiItems(task: EcoTask, s: BioEcologyState): AiItem[] {
  const a = AI[task];
  return [
    { criterionId: 'precautions', question: a.precautions.q, answer: s.written.precautions.trim(), guide: a.precautions.guide, keywords: a.precautions.kw, need: 2 },
    { criterionId: 'explanation', question: a.explain.q, answer: s.written.explain.trim(), guide: a.explain.guide, keywords: a.explain.kw, need: 3 },
  ];
}

/** Picks: +0.5 for each right one, −0.5 for each wrong one, at most `cap`. */
function pickMarks<T extends string>(chosen: T[], right: T[], cap: number): number {
  const r = chosen.filter((c) => right.includes(c)).length;
  const w = chosen.length - r;
  return Math.max(0, Math.min(cap, 0.5 * r) - 0.5 * w);
}

// ------------------------------------------------------------------ QUADRAT

function gradeQuadrat(s: BioEcologyState, v: BioEcologyVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.quad;
  const qv = v.quad;
  const quads = w.quads.map((q, i) => ({ q, i, row: w.rows[i] ?? emptyQuadRow(), looked: w.looked.includes(i) }));
  const n = quads.length;
  const denom = Math.max(n, QUAD_MIN);

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.pegged) m += 0.5;
    else notes.push('Mark out the plot with pegs and tapes along two edges first: the tapes are the axes for the coordinates.');
    const chosen = quads.filter((x) => x.q.how === 'CHOSEN').length;
    if (n && !chosen) m += 1.5;
    else if (n && chosen <= n / 4) {
      m += 0.5;
      notes.push(`${chosen} quadrat${chosen === 1 ? ' was' : 's were'} placed by eye. Use coordinates from the random-number table for every one: choosing places picks out the patches where plants grow (bias).`);
    } else if (n) notes.push('Place every quadrat at coordinates from the random-number table, not where you can see plants: that biases the estimate.');
    if (n >= QUAD_MIN) m += 1;
    else if (n >= 6) {
      m += 0.5;
      notes.push(`Use at least ${QUAD_MIN} quadrats (you used ${n}): the plants grow in clumps, so a few quadrats give an unreliable estimate.`);
    } else notes.push(`Use at least ${QUAD_MIN} quadrats (you used ${n}).`);
    const looked = quads.filter((x) => x.looked).length;
    m += Math.min(1, looked / denom);
    if (looked < n) notes.push('Examine each quadrat closely before you write its counts.');
    if (!n) notes.splice(0, notes.length, ...(w.pegged ? [] : ['Mark out the plot first.']), 'No quadrats were placed.');
    auto.push(score(crit('procedure'), m, notes));
  }

  // ---- readings (4): counts (3), grass cover (1)
  const own = QUAD_HERBS.map((h) => {
    const counts = quads.map((x) => num(x.row[h]));
    const valid = counts.filter((c): c is number => c !== null);
    return { h, counts, total: valid.reduce((a, b) => a + b, 0), present: valid.filter((c) => c > 0).length };
  });
  {
    const notes: string[] = [];
    let ok = 0;
    let covOk = 0;
    const bad: string[] = [];
    for (const x of quads) {
      for (const h of QUAD_HERBS) {
        const c = quadCount(qv, h, x.q.x, x.q.y);
        const val = num(x.row[h]);
        if (x.looked && val !== null && val >= c.strict && val <= c.loose && Number.isInteger(val)) ok++;
        else if (x.row[h].trim() || x.looked) bad.push(`quadrat ${x.i + 1} ${QUAD_HERB_LABEL[h].split(' ')[0]}`);
      }
      const cov = num(x.row.grass);
      if (x.looked && withinAbs(cov, quadCover(qv, x.q.x, x.q.y), 10)) covOk++;
    }
    if (bad.length) notes.push(`Counts not right: ${list(bad.slice(0, 4))}${bad.length > 4 ? ' …' : ''}. Count every plant rooted inside the frame; for plants on the frame use one rule (those on two sides only).`);
    if (covOk < n) notes.push('Grass cover: count the small squares of the grid that are more than half covered by grass (each is 1 %).');
    if (n < QUAD_MIN) notes.push(`Readings are marked out of at least ${QUAD_MIN} quadrats.`);
    auto.push(score(crit('readings'), half((3 * ok) / (3 * denom)) + half(covOk / denom), notes));
  }

  // ---- presentation (3): totals (1), bar chart of density (2)
  {
    const notes: string[] = [];
    let tot = 0;
    let bars = 0;
    for (const o of own) {
      if (n && num(w.res[o.h].total) === o.total) tot++;
      const d = num(w.res[o.h].density) ?? (n ? o.total / n : null);
      const b = w.bars[o.h];
      if (d !== null && b !== null && withinAbs(b, d, Math.max(0.15, 0.05 * d))) bars++;
    }
    if (tot < 3) notes.push('Add up each herb’s counts over all the quadrats (the column totals).');
    if (bars < 3) notes.push('Draw a bar for each herb to the height of its density (plants per m²).');
    auto.push(score(crit('presentation'), tot / 3 + (2 * bars) / 3, notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    let dOk = 0;
    let fOk = 0;
    let pOk = 0;
    for (const o of own) {
      const r = w.res[o.h];
      if (n && close(num(r.density), o.total / n, 0.02)) dOk++;
      if (n && pctOk(num(r.freq), (o.present / n) * 100)) fOk++;
      const d = num(r.density);
      if (d !== null && close(num(r.pop), d * QUAD_AREA, 2, 0.02)) pOk++;
    }
    m += dOk * 0.5 + fOk * 0.5 + (pOk === 3 ? 0.5 : 0);
    if (dOk < 3) notes.push(`Density = total number ÷ total area sampled (${n} quadrats × 1 m² = ${n} m²), in plants per m².`);
    if (fOk < 3) notes.push('Frequency = number of quadrats with the herb ÷ total number of quadrats × 100 — not just those where it was found.');
    if (pOk < 3) notes.push(`Estimated population = density × area of the plot (${QUAD_AREA} m²).`);
    const covers = quads.map((x) => num(x.row.grass)).filter((c): c is number => c !== null);
    if (covers.length && close(num(w.cover), covers.reduce((a, b) => a + b, 0) / covers.length, 0.5)) m += 0.5;
    else notes.push('Mean grass cover = the sum of the covers ÷ the number of quadrats.');
    const freqs = own.map((o) => ({ h: o.h, f: n ? o.present / n : 0, d: n ? o.total / n : 0 }));
    const maxF = Math.max(...freqs.map((x) => x.f));
    const maxD = Math.max(...freqs.map((x) => x.d));
    if (w.mostFreq && n && Math.abs(freqs.find((x) => x.h === w.mostFreq)!.f - maxF) < 1e-9) m += 0.5;
    else notes.push('Name the herb found in the most quadrats (the highest frequency).');
    if (w.mostDense && n && Math.abs(freqs.find((x) => x.h === w.mostDense)!.d - maxD) < 1e-9) m += 0.5;
    else notes.push('Name the herb with the most plants per m² (the highest density).');
    auto.push(score(crit('results'), m, notes));
  }

  const model = quadModelState(v);
  const truePop = (h: QuadHerb) => qv.plants[h].length;
  const solution = [
    `The plot holds ${QUAD_HERBS.map((h) => `${truePop(h)} ${QUAD_HERB_LABEL[h]}`).join(', ')} — true densities ${QUAD_HERBS.map((h) => roundDp(truePop(h) / QUAD_AREA, 2)).join(', ')} per m². They grow in clumps, so quadrats placed by eye on a clump overestimate them.`,
    ...QUAD_HERBS.map((h) => {
      const r = model.quad.res[h];
      return `${QUAD_HERB_LABEL[h]} in ${model.quad.quads.length} random quadrats: total ${r.total}; density = ${r.total} ÷ ${model.quad.quads.length} m² = ${r.density} per m²; frequency = ${r.freq} %; population ≈ ${r.density} × ${QUAD_AREA} = ${r.pop}.`;
    }),
    `Mean grass cover ${model.quad.cover} %. More quadrats bring the estimates closer to the true values: with clumped plants, two or three quadrats can miss a species or hit a clump.`,
  ];
  const facts = [`${n} quadrats (${quads.filter((x) => x.q.how === 'CHOSEN').length} placed by eye); ${quads.filter((x) => x.looked).length} examined.`, `Estimates: ${QUAD_HERBS.map((h) => `${QUAD_HERB_LABEL[h].split(' ')[0]} ${w.res[h].pop || '—'} (true ${truePop(h)})`).join('; ')}.`];
  return { auto, ai: aiItems('QUADRAT', s), solution, facts };
}

// ------------------------------------------------------------------ CAPTURE

function gradeCapture(s: BioEcologyState, v: BioEcologyVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.cap;
  const cv = v.cap;
  const n1True = w.first ? capFirstCatch(cv, w.first.effort) : null;
  const second = w.first && w.mark && w.release && w.second ? capSecondCatch(cv, { firstEffort: w.first.effort, mark: w.mark, release: w.release, effort: w.second.effort, t: w.second.at }) : null;

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.first && w.second && w.first.effort === w.second.effort) m += 0.5;
    else if (w.first && w.second) notes.push('Sweep for the same time in both samples (the same effort).');
    if (w.mark === 'DOT') m += 1;
    else if (w.mark) notes.push(w.mark === 'BRIGHT' ? 'A large bright mark on the back makes the grasshoppers easy for birds and lizards to see: marked ones are eaten, fewer are recaptured and N comes out too large. Use a small dot of non-toxic paint underneath.' : 'Clipping a wing harms the grasshopper: it cannot escape or fly, so it dies sooner and is caught more easily. Use a small dot of non-toxic paint underneath.');
    else notes.push('Mark each grasshopper of the first sample.');
    if (w.release === 'SCATTER') m += 0.5;
    else if (w.release) notes.push('Release them all over the area where they were caught, not in one heap: then they mix sooner.');
    const at = w.second?.at ?? null;
    if (at !== null && at >= CAP_MIN_WAIT && at <= CAP_MAX_WAIT) m += 1;
    else if (at !== null && at < CAP_MIN_WAIT) notes.push(`The recapture was too soon (${at} h): the marked grasshoppers were still near where they were released, so too many were recaptured and N came out too small. Wait about 24 hours.`);
    else if (at !== null) notes.push(`The recapture was too late (${at} h): births, deaths, migration and lost marks change the population. About 24 hours is right.`);
    else notes.push('Take a second sample about a day after the release.');
    if (w.examined) m += 0.5;
    else if (w.second) notes.push('Look over every animal of the second catch for marks.');
    if (w.freed) m += 0.5;
    else if (w.second) notes.push('Release the second catch where it was caught when you have counted it.');
    if (!w.first) notes.splice(0, notes.length, 'No sample was caught.');
    auto.push(score(crit('procedure'), m, notes));
  }

  // ---- readings (4)
  {
    const notes: string[] = [];
    let m = 0;
    const tol = (x: number) => (x >= 30 ? 1 : 0);
    if (n1True !== null && w.counted1 && withinAbs(num(w.n1), n1True, tol(n1True))) m += 1.5;
    else notes.push(n1True !== null ? `Count the first catch carefully (there were ${n1True}).` : 'Catch and count a first sample.');
    if (second && withinAbs(num(w.n2), second.n2, tol(second.n2))) m += 1.5;
    else if (second) notes.push(`Count the second catch (there were ${second.n2}).`);
    if (second && w.examined && withinAbs(num(w.m), second.m, second.m >= 15 ? 1 : 0)) m += 1;
    else if (second) notes.push(`Count the marked grasshoppers in the second catch (there were ${second.m}).`);
    auto.push(score(crit('readings'), m, notes));
  }

  // ---- presentation (3)
  const n1 = num(w.n1);
  const n2 = num(w.n2);
  const mm = num(w.m);
  const Nown = n1 !== null && n2 !== null && mm ? (n1 * n2) / mm : null;
  {
    const notes: string[] = [];
    let m = 0;
    if (w.formula === 'A') m += 1;
    else notes.push(`The Lincoln index is ${CAP_FORMULA_LABEL.A}${w.formula ? ` (not ${CAP_FORMULA_LABEL[w.formula]})` : ''}.`);
    const N = num(w.N);
    if (Nown !== null && close(N, Nown, 1, 0.01)) {
      m += 1.5;
      if (decimalPlaces(w.N) === 0) m += 0.5;
      else notes.push('Give the population as a whole number of grasshoppers.');
    } else notes.push('Work out N = n₁ × n₂ ÷ m from your own counts.');
    auto.push(score(crit('presentation'), m, notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    if (n2 && mm !== null && pctOk(num(w.pct), (mm / n2) * 100)) m += 1;
    else notes.push('% marked in the second sample = m ÷ n₂ × 100.');
    const N = num(w.N);
    if (N !== null && close(num(w.density), N / QUAD_AREA, 0.01, 0.03)) m += 1;
    else notes.push(`Population density = N ÷ area of the plot (${QUAD_AREA} m²), per m².`);
    const a = pickMarks(w.assume, CAP_ASSUME_RIGHT, 2);
    m += a;
    const wrongA = w.assume.filter((x) => !CAP_ASSUME_RIGHT.includes(x));
    if (wrongA.length) notes.push(`Not an assumption of the method: ${list(wrongA.map((x) => `“${CAP_ASSUME_LABEL[x]}”`))}.`);
    else if (a < 2) notes.push('The assumptions: a closed population (no births, deaths or migration), marks not lost, marked animals mix evenly, and marking does not change their survival or behaviour.');
    const e = pickMarks(w.errors, CAP_ERROR_RIGHT, 1);
    m += e;
    const wrongE = w.errors.filter((x) => !CAP_ERROR_RIGHT.includes(x));
    if (wrongE.length) notes.push(`Not a source of error here: ${list(wrongE.map((x) => `“${CAP_ERROR_LABEL[x]}”`))}.`);
    else if (e < 1) notes.push('Give two sources of error for the capture–recapture method.');
    auto.push(score(crit('results'), m, notes));
  }

  const model = capModelState(v);
  const mc = model.cap;
  const solution = [
    `There were ${cv.N} grasshoppers in the plot (${roundDp(cv.N / QUAD_AREA, 2)} per m²). Each 10-minute sweep catches about ${Math.round(100 * (1 - Math.exp(-cv.q * 10)))} % of them.`,
    `A model run: n₁ = ${mc.n1} marked with a small dot underneath and released where caught; 24 h later n₂ = ${mc.n2}, of which m = ${mc.m} were marked. N = ${mc.n1} × ${mc.n2} ÷ ${mc.m} = ${mc.N}. Sampling varies, so a single estimate can be 20–30 % out; repeating and averaging helps.`,
    'Recaptured after an hour, the marked ones are still bunched where they were released and are over-represented: N comes out far too small. A bright mark gets the marked ones eaten, and a week lets births, deaths and moulting remove marks: N comes out too large.',
  ];
  const facts = [`First sweep ${w.first?.effort ?? '—'} min, mark ${w.mark ? CAP_MARK_LABEL[w.mark].toLowerCase() : '—'}, release ${w.release ?? '—'}, recapture at ${w.second?.at ?? '—'} h (${w.second?.effort ?? '—'} min).`, `Counts n₁ ${w.n1 || '—'} (true ${n1True ?? '—'}), n₂ ${w.n2 || '—'} (true ${second?.n2 ?? '—'}), m ${w.m || '—'} (true ${second?.m ?? '—'}); N ${w.N || '—'} (true ${cv.N}).`];
  return { auto, ai: aiItems('CAPTURE', s), solution, facts };
}

// ------------------------------------------------------------------ FACTORS

const FIELD: Partial<Record<FacInst, 'air' | 'soil' | 'light' | 'wind'>> = { AIR: 'air', SOIL: 'soil', LIGHT: 'light', WIND: 'wind' };
function gradeFactors(s: BioEcologyState, v: BioEcologyVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.fac;
  const fv = v.fac;
  const reads = w.reads.map((rd, k) => ({ rd, k, shown: facShown(fv, rd, k) }));
  const of = (site: FacSite, day: number, inst: FacInst) => reads.filter((x) => x.rd.site === site && x.rd.day === day && x.rd.inst === inst);
  const siteDays = (site: FacSite) => new Set(reads.filter((x) => x.rd.site === site && x.rd.inst !== 'PH').map((x) => x.rd.day));
  const bothDays = [...siteDays('OPEN')].filter((d) => siteDays('SHADE').has(d)).sort();
  const sixDays = [...new Set(w.station.filter((x) => x.inst === 'SIX').map((x) => x.day))].sort();
  const rainDays = [...new Set(w.station.filter((x) => x.inst === 'RAIN').map((x) => x.day))].sort();

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (siteDays('OPEN').size && siteDays('SHADE').size) m += 0.5;
    else notes.push('Take readings at both sites: the open field and under the tree canopy.');
    const meanH = (site: FacSite, d: number) => {
      const hs = reads.filter((x) => x.rd.site === site && x.rd.day === d).map((x) => x.rd.h);
      return hs.reduce((a, b) => a + b, 0) / hs.length;
    };
    const apart = bothDays.filter((d) => Math.abs(meanH('OPEN', d) - meanH('SHADE', d)) > 1);
    if (bothDays.length && !apart.length) m += 1;
    else if (apart.length) notes.push(`Read both sites at the same time of day (within an hour): on day${apart.length === 1 ? '' : 's'} ${apart.join(', ')} they were read hours apart, so the difference is partly the time of day.`);
    else notes.push('Read both sites on the same day, at the same time.');
    const sunny = reads.filter((x) => x.rd.site === 'OPEN' && (x.rd.inst === 'AIR' || x.rd.inst === 'HYGRO'));
    const unshaded = sunny.filter((x) => !x.rd.shaded).length;
    if (sunny.length && !unshaded) m += 1;
    else if (unshaded) notes.push(`${unshaded} thermometer reading${unshaded === 1 ? ' was' : 's were'} taken in direct sunlight: the sun heats the bulb, so it reads too high. Shade it (with a card or your body) and wait a minute.`);
    if (bothDays.length >= FAC_MIN_DAYS) m += 0.5;
    else notes.push(`Repeat the site readings on ${FAC_MIN_DAYS} days (you have ${bothDays.length}) and take the means.`);
    const notReset = sixDays.filter((d) => !w.resets.includes(d));
    if (sixDays.length >= FAC_MIN_DAYS && !notReset.length) m += 0.5;
    else if (notReset.length) notes.push('Reset the Six’s thermometer’s indices with the magnet after each reading, or the next reading includes the day before.');
    else notes.push('Read the Six’s thermometer each morning.');
    const notEmptied = rainDays.filter((d) => !w.empties.includes(d));
    if (rainDays.length >= FAC_MIN_DAYS && !notEmptied.length) m += 0.5;
    else if (notEmptied.length) notes.push('Empty the rain gauge after each reading, or the next reading adds the day before.');
    else notes.push('Read the rain gauge each morning.');
    auto.push(score(crit('procedure'), m, notes));
  }

  // ---- readings (4)
  {
    const notes: string[] = [];
    const rowsWanted = FAC_SITES.length * Math.max(FAC_MIN_DAYS, bothDays.length);
    const matches = (site: FacSite, day: number, inst: FacInst, raw: string, pick: (x: { value: number; dry?: number; wet?: number }) => number | undefined) => {
      const val = num(raw);
      return val !== null && of(site, day, inst).some((x) => {
        const want = pick(x.shown);
        return want !== undefined && close(val, want, inst === 'LIGHT' ? 0.5 : 0.01, inst === 'LIGHT' ? 0.005 : 0);
      });
    };
    let temps = 0;
    let hyg = 0;
    let lw = 0;
    const badT: string[] = [];
    for (const site of FAC_SITES)
      for (let d = 1; d <= FAC_DAYS; d++) {
        const r = w.rows[site][d - 1] ?? emptyFacRow();
        if (matches(site, d, 'AIR', r.air, (x) => x.value)) temps += 0.5;
        else if (r.air.trim()) badT.push(`${FAC_SITE_LABEL[site].toLowerCase()} day ${d}`);
        if (matches(site, d, 'SOIL', r.soil, (x) => x.value)) temps += 0.5;
        if (matches(site, d, 'HYGRO', r.dry, (x) => x.dry)) hyg += 0.5;
        if (matches(site, d, 'HYGRO', r.wet, (x) => x.wet)) hyg += 0.5;
        if (matches(site, d, 'LIGHT', r.light, (x) => x.value)) lw += 0.5;
        if (matches(site, d, 'WIND', r.wind, (x) => x.value)) lw += 0.5;
      }
    let m = half(temps / rowsWanted) + half(hyg / rowsWanted) + half((lw / rowsWanted) * 0.5);
    if (badT.length) notes.push(`Temperatures not as the thermometer showed them: ${list(badT.slice(0, 3))}. Read to the nearest 0.5 °C.`);
    if (temps < rowsWanted) notes.push('Read the air and soil temperatures at each site on each day.');
    if (hyg < rowsWanted) notes.push('Record both the dry-bulb and the wet-bulb readings.');
    if (lw < rowsWanted) notes.push('Record the light intensity and the wind speed at each site each day.');
    let phS = 0;
    for (const site of FAC_SITES) {
      const val = num(w.ph[site]);
      if (val !== null && reads.some((x) => x.rd.site === site && x.rd.inst === 'PH' && x.shown.value === val)) phS++;
    }
    if (phS === 2 && w.secchiRead && withinAbs(num(w.secchi), fv.secchi, 2)) m += 0.5;
    else notes.push('Find the soil pH at each site by matching the indicator colour to the chart, and read the Secchi disc depth at the pond.');
    let st = 0;
    const days = Math.max(FAC_MIN_DAYS, sixDays.length, rainDays.length);
    for (const d of sixDays) {
      const six = facSix(fv, d, w.resets);
      const row = w.six[d - 1];
      if (row && num(row.max) === six.max) st++;
      if (row && num(row.min) === six.min) st++;
    }
    for (const d of rainDays) if (num(w.rain[d - 1] ?? '') === facRain(fv, d, w.empties)) st++;
    m += half(st / (3 * days));
    if (st < 3 * days) notes.push('Read the Six’s maximum and minimum (at the bottom of each index) and the rain gauge every morning.');
    auto.push(score(crit('readings'), m, notes));
  }

  // ---- presentation (3): means (1.5), RH from the table (1.5)
  {
    const notes: string[] = [];
    let means = 0;
    for (const site of FAC_SITES) {
      const rows = w.rows[site].filter((r) => r.air.trim());
      for (const k of ['air', 'soil', 'rh', 'light', 'wind'] as const) {
        const vals = rows.map((r) => num(r[k])).filter((x): x is number => x !== null);
        if (vals.length && close(num(w.means[site][k]), vals.reduce((a, b) => a + b, 0) / vals.length, k === 'light' ? 1 : 0.1, k === 'light' ? 0.01 : 0.005)) means++;
      }
    }
    if (means < 10) notes.push('Work out the mean of each factor at each site over the days (add the readings, divide by the number of days).');
    let rh = 0;
    let rhRows = 0;
    for (const site of FAC_SITES)
      for (const r of w.rows[site]) {
        const dry = num(r.dry);
        const wet = num(r.wet);
        if (dry === null || wet === null) continue;
        rhRows++;
        if (withinAbs(num(r.rh), facRH(dry, wet), 4)) rh++;
      }
    if (rh < rhRows || !rhRows) notes.push('Relative humidity: depression = dry − wet bulb; read the % from the humidity table at your dry-bulb temperature.');
    auto.push(score(crit('presentation'), (1.5 * means) / 10 + (1.5 * rh) / Math.max(rhRows, FAC_SITES.length * FAC_MIN_DAYS), notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    let meanOk = 0;
    let rangeOk = 0;
    const filled = w.six.map((r, i) => ({ r, d: i + 1 })).filter((x) => x.r.max.trim() && x.r.min.trim());
    for (const { r } of filled) {
      const mx = num(r.max);
      const mn = num(r.min);
      if (mx === null || mn === null) continue;
      if (close(num(r.mean), (mx + mn) / 2, 0.05, 0)) meanOk++;
      if (close(num(r.range), mx - mn, 0.05, 0)) rangeOk++;
    }
    const dd = Math.max(filled.length, FAC_MIN_DAYS);
    m += meanOk / dd + (0.5 * rangeOk) / dd;
    if (meanOk < filled.length || !filled.length) notes.push('Daily mean temperature = (maximum + minimum) ÷ 2.');
    if (rangeOk < filled.length || !filled.length) notes.push('Daily range = maximum − minimum.');
    const rains = w.rain.map((x) => num(x)).filter((x): x is number => x !== null);
    const total = rains.reduce((a, b) => a + b, 0);
    if (rains.length >= FAC_MIN_DAYS && close(num(w.rainTotal), total, 0.05, 0)) m += 0.5;
    else notes.push('Total rainfall = the sum of the daily readings (mm).');
    if (rains.length >= FAC_MIN_DAYS && close(num(w.rainMean), total / rains.length, 0.05, 0.01)) m += 0.5;
    else notes.push('Mean rainfall = total ÷ number of days.');
    const parts = facParts();
    const o = observationCredit(w.obs, parts);
    m += o.credit;
    if (o.credit < 1) notes.push(`Compare the sites: ${parts.map((p) => p.text).join('; ')}.`);
    m += pickMarks(w.claims, FAC_CLAIM_RIGHT, 1.5);
    const wrong = w.claims.filter((c) => !FAC_CLAIM_RIGHT.includes(c));
    if (wrong.length) notes.push(`Your readings do not support ${list(wrong.map((c) => `“${FAC_CLAIM_LABEL[c]}”`))}.`);
    else if (w.claims.length < 3) notes.push('Relate the readings to where organisms are found in each site.');
    auto.push(score(crit('results'), m, notes));
  }

  const model = facModelState(v);
  const mf = model.fac;
  const solution = [
    `Six’s thermometer: ${mf.six.map((r, i) => `day ${i + 1} max ${r.max} °C, min ${r.min} °C → mean ${r.mean} °C, range ${r.range} °C`).join('; ')}.`,
    `Rain gauge: ${mf.rain.join(', ')} mm → total ${mf.rainTotal} mm, mean ${mf.rainMean} mm per day. Wind from ${mf.dir.join(', ')}.`,
    `Means at about 10 am — open field: ${mf.means.OPEN.air} °C air, ${mf.means.OPEN.rh} % RH, ${mf.means.OPEN.light} lux, ${mf.means.OPEN.wind} m/s; under the canopy: ${mf.means.SHADE.air} °C, ${mf.means.SHADE.rh} % RH, ${mf.means.SHADE.light} lux, ${mf.means.SHADE.wind} m/s. Soil pH ${mf.ph.OPEN} and ${mf.ph.SHADE}; Secchi depth ${mf.secchi} cm.`,
    `A thermometer in direct sun in the open read about ${roundDp(fv.sunBias, 1)} °C too high. Relative humidity from the table: e.g. dry 30 °C, wet 26 °C → depression 4 °C → about ${Math.round(facRH(30, 26))} %.`,
  ];
  const facts = [`${reads.length} site readings on days ${bothDays.join(', ') || '—'}; ${reads.filter((x) => x.rd.site === 'OPEN' && (x.rd.inst === 'AIR' || x.rd.inst === 'HYGRO') && !x.rd.shaded).length} thermometer readings in the sun.`, `Station: Six’s read on days ${sixDays.join(', ') || '—'} (reset ${w.resets.join(', ') || 'never'}); rain on ${rainDays.join(', ') || '—'} (emptied ${w.empties.join(', ') || 'never'}); wind ${w.dir.filter(Boolean).join(', ') || '—'} (true ${fv.days.slice(0, FAC_DAYS).map((d) => FAC_DIRS[d.dir]).join(', ')}).`, `Instruments: ${FAC_INSTS.length} per site.`];
  return { auto, ai: aiItems('FACTORS', s), solution, facts };
}

// ------------------------------------------------------------------ SOIL

function gradeSoil(s: BioEcologyState, v: BioEcologyVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.soil;
  const sv = v.soil;
  const measuredJars = w.jars.map((j, i) => ({ j, i, at: w.jarReads.filter((x) => x.jar === i).at(-1)?.at ?? null })).filter((x) => x.at !== null && x.j.shakenAt !== null) as { j: (typeof w.jars)[number]; i: number; at: number }[];

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    const F = w.funnels;
    if (F.length >= 3 && new Set(F.map((f) => f.mass)).size === 1) m += 0.5;
    else if (F.length) notes.push(F.length < 3 ? 'Set up a funnel for each of the three soils.' : 'Put the same mass of dry soil in every funnel, or the volumes cannot be compared.');
    if (F.length && F.every((f) => f.cotton)) m += 0.5;
    else if (F.length) notes.push('Plug each funnel with cotton wool: without it soil washes through into the cylinder.');
    if (F.length && F.every((_, i) => w.dReads.some((x) => x.f === i && Math.abs(x.t - 30) < 1e-9))) m += 0.5;
    else if (F.length) notes.push('Collect the drainage for 30 minutes and read every cylinder at 30 minutes.');
    if (!F.length) notes.push('No funnels were set up.');
    if (w.airs.length && w.airs.every((a) => a.stirred)) m += 0.5;
    else if (w.airs.length) notes.push('Stir the soil in the water with the glass rod until no more bubbles rise: air trapped in lumps is not measured.');
    else notes.push('Measure the air content of each soil.');
    if (w.crucibles.length && w.crucibles.every((c) => c.dried)) m += 0.5;
    else if (w.crucibles.length) notes.push('Use oven-dried soil for the humus test: damp soil loses its water on heating too, and that is counted as humus.');
    const constant = w.crucibles.filter((_, c) => soilConstant(sv, w, c)).length;
    if (w.crucibles.length && constant === w.crucibles.length) m += 1;
    else if (constant) {
      m += 0.5;
      notes.push('Heat every crucible to constant mass (two weighings, cooled, within 0.01 g).');
    } else if (w.crucibles.length) notes.push('Heat, cool (in the desiccator) and reweigh until two weighings agree to 0.01 g: constant mass.');
    if (w.weighs.some((x) => x.hot)) notes.push('A hot crucible weighs too little (rising hot air): cool it in the desiccator before weighing.');
    if (measuredJars.some((x) => x.at - (x.j.shakenAt ?? 0) >= SOIL_MIN_SETTLE)) m += 0.5;
    else if (measuredJars.length) notes.push('Leave the jar to settle for a day before measuring the layers: the clay settles slowly.');
    else notes.push('Shake soil with water in a jar, leave it to settle and measure the layers.');
    auto.push(score(crit('procedure'), m, notes));
  }

  // ---- readings (4)
  {
    const notes: string[] = [];
    let m = 0;
    let d = 0;
    w.funnels.forEach((f, i) =>
      SOIL_DRAIN_TIMES.forEach((t, k) => {
        if (w.dReads.some((x) => x.f === i && Math.abs(x.t - t) < 1e-9) && num(w.dRows[i]?.[k] ?? '') === soilDrainReading(sv, f, t)) d++;
      }),
    );
    const dWant = Math.max(3, w.funnels.length) * SOIL_DRAIN_TIMES.length;
    m += half((1.5 * d) / dWant);
    if (d < dWant) notes.push('Read every measuring cylinder at each time (1, 2, 5, 10, 20 and 30 min), to the nearest cm³ at the bottom of the meniscus.');
    let a = 0;
    w.airs.forEach((x, i) => {
      if (w.airReads.includes(i) && num(w.airRows[i]?.final ?? '') === soilAirFinal(sv, x)) a++;
    });
    m += half(a / Math.max(3, w.airs.length));
    if (a < 3) notes.push('Read each cylinder’s final volume once the bubbles stop.');
    let hOk = 0;
    let hWant = 0;
    w.crucibles.forEach((cr, c) => {
      const row = w.hRows[c];
      const shown = (k: number, soilIn: boolean) => w.weighs.filter((x) => x.c === c && x.k === k && x.soilIn === soilIn).map((x) => soilCrucibleMass(sv, c, cr, x));
      const ok = (raw: string | undefined, vals: number[]) => {
        const val = num(raw ?? '');
        return val !== null && decimalPlaces((raw ?? '').trim()) >= 2 && vals.some((x) => Math.abs(x - val) < 0.0051);
      };
      const after = row?.after ?? [];
      hWant += 2 + Math.max(2, after.length);
      if (ok(row?.empty, shown(0, false))) hOk++;
      if (ok(row?.full, shown(0, true))) hOk++;
      after.forEach((x, j) => ok(x, shown(j + 1, true)) && hOk++);
    });
    hWant = Math.max(hWant, 12);
    m += half(hOk / hWant);
    if (hOk < hWant) notes.push('Record every crucible mass exactly as the balance shows it (to 0.01 g).');
    let j = 0;
    for (const x of measuredJars) {
      const rd = soilJarReading(sv, x.j, x.at);
      for (const l of SOIL_LAYERS) if (withinAbs(num(w.jarRows[x.i]?.[l] ?? ''), rd[l], 1)) j++;
    }
    m += half((0.5 * j) / (4 * Math.max(1, measuredJars.length)));
    if (!measuredJars.length) notes.push('Measure the thickness of each layer in the jar with the ruler.');
    auto.push(score(crit('readings'), m, notes));
  }

  // ---- presentation (3)
  {
    const notes: string[] = [];
    const right = SOIL_JAR_LABELS.filter((l, i) => (w.labels[i] ?? '') === l).length;
    let m = right === 6 ? 1.5 : right >= 4 ? 1 : right >= 2 ? 0.5 : 0;
    if (right < 6) notes.push(`${right} of 6 labels are right on the jar: the heaviest particles at the bottom, clay on top of the sediment, humus floating.`);
    if (w.plotted && w.funnels.length >= 3 && w.funnels.every((_, i) => (w.dRows[i] ?? []).filter((x) => num(x) !== null).length >= 5)) m += 0.5;
    else notes.push('Plot the volume collected against time for the three soils (at least five points each).');
    let p = 0;
    for (const x of measuredJars) {
      const row = w.jarRows[x.i];
      if (!row) continue;
      const hs = SOIL_LAYERS.map((l) => num(row[l]) ?? 0);
      const tot = hs.reduce((a, b) => a + b, 0);
      SOIL_LAYERS.forEach((l, k) => tot > 0 && withinAbs(num(w.jarPct[x.i]?.[l] ?? ''), (hs[k]! / tot) * 100, 1) && p++);
    }
    m += p / (4 * Math.max(1, measuredJars.length));
    if (p < 4 * Math.max(1, measuredJars.length)) notes.push('% of each layer = its thickness ÷ the total thickness of the sediment × 100.');
    auto.push(score(crit('presentation'), m, notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    let ret = 0;
    w.funnels.forEach((_, i) => {
      const v30 = num(w.dRows[i]?.[SOIL_DRAIN_TIMES.length - 1] ?? '');
      if (v30 !== null && withinAbs(num(w.retained[i] ?? ''), SOIL_WATER - v30, 0.5)) ret++;
    });
    m += ret / Math.max(3, w.funnels.length);
    if (ret < 3) notes.push('Water retained = 100 cm³ poured − the volume collected after 30 minutes (not the volume collected).');
    let air = 0;
    w.airRows.forEach((r) => {
      const fin = num(r.final);
      const a = num(r.air);
      if (fin !== null && withinAbs(a, SOIL_WATER - fin, 0.5) && a !== null && pctOk(num(r.pct), (a / SOIL_AIR_SOIL) * 100)) air++;
    });
    m += air / Math.max(3, w.airs.length);
    if (air < 3) notes.push('Air = 100 cm³ − the final volume; % air = air ÷ 50 cm³ of soil × 100 (the soil’s volume, not the cylinder’s).');
    let hum = 0;
    w.hRows.forEach((r) => {
      const e = num(r.empty);
      const f = num(r.full);
      const last = num(r.after.at(-1) ?? '');
      const loss = num(r.loss);
      if (e === null || f === null || last === null || loss === null) return;
      if (withinAbs(loss, f - last, 0.011) && f - e > 0 && close(num(r.pct), (loss / (f - e)) * 100, 0.15)) hum++;
    });
    m += hum / Math.max(3, w.crucibles.length);
    if (hum < 3) notes.push('Loss in mass = (crucible + soil) − the final constant mass; % humus = loss ÷ mass of dry soil × 100.');
    const jar = measuredJars[0];
    if (jar) {
      const parts = soilJarParts(sv, jar.j, jar.at);
      const o = observationCredit(w.obs, parts);
      m += o.credit;
      if (o.credit < 1) notes.push(`The jar showed: ${parts.map((p) => p.text).join('; ')}.`);
    } else notes.push('Describe what the settled jar showed.');
    m += Math.max(0, Math.min(1, w.claims.filter((c) => SOIL_CLAIM_RIGHT.includes(c)).length / 3) - 0.5 * w.claims.filter((c) => !SOIL_CLAIM_RIGHT.includes(c)).length);
    const wrong = w.claims.filter((c) => !SOIL_CLAIM_RIGHT.includes(c));
    if (wrong.length) notes.push(`Your results do not show ${list(wrong.map((c) => `“${SOIL_CLAIM_LABEL[c]}”`))}.`);
    auto.push(score(crit('results'), m, notes));
  }

  const model = soilModelState(v);
  const ms = model.soil;
  const solution = [
    ...ms.funnels.map((f, i) => `${SOIL_LABEL[f.soil]}: ${ms.dRows[i]!.join(', ')} cm³ at ${SOIL_DRAIN_TIMES.join(', ')} min → retained 100 − ${ms.dRows[i]!.at(-1)} = ${ms.retained[i]} cm³.`),
    ...ms.airs.map((a, i) => `${SOIL_LABEL[a.soil]}: 50 + 50 cm³ → ${ms.airRows[i]!.final} cm³, air ${ms.airRows[i]!.air} cm³ = ${ms.airRows[i]!.pct} %.`),
    ...ms.crucibles.map((c, i) => `${SOIL_LABEL[c.soil]}: crucible ${ms.hRows[i]!.empty} g, with soil ${ms.hRows[i]!.full} g, after heating ${ms.hRows[i]!.after.join(', ')} g → loss ${ms.hRows[i]!.loss} g = ${ms.hRows[i]!.pct} % humus.`),
    `Loam jar after a day: ${SOIL_LAYERS.map((l) => `${l.toLowerCase()} ${ms.jarRows[0]![l]} mm`).join(', ')}. The coarse particles settle in seconds, the clay over hours.`,
  ];
  const facts = [`${w.funnels.length} funnels (${w.funnels.map((f) => `${f.soil.toLowerCase()} ${f.mass} g${f.cotton ? '' : ' no cotton'}`).join(', ')}); ${w.airs.length} air tests (${w.airs.filter((a) => !a.stirred).length} unstirred); ${w.crucibles.length} crucibles (${w.crucibles.filter((c) => !c.dried).length} damp soil, ${w.weighs.filter((x) => x.hot).length} hot weighings).`, `Jars measured: ${measuredJars.map((x) => `${x.j.soil.toLowerCase()} after ${roundDp(x.at - (x.j.shakenAt ?? 0), 1)} h`).join(', ') || '—'}.`];
  return { auto, ai: aiItems('SOIL', s), solution, facts };
}

/**
 * Marks the ecology lab the way a WAEC biology scheme does. QUADRAT: random
 * placement, enough quadrats, counts against the plants in each frame, cover
 * against the grid, density, frequency and population from the student's own
 * counts. CAPTURE: a harmless mark, mixing time, equal effort, the counts
 * against the catch, the Lincoln index and its assumptions. FACTORS: same
 * time of day, shaded thermometers, repeated days, the readings against the
 * instruments, means, humidity from the table, the Six's and rain-gauge
 * calculations and the habitat comparison. SOIL: drainage, air, humus and
 * sedimentation against the apparatus, and the calculations. Precautions and
 * the explanation go to AI.
 */
export const bioEcologyGrader: SimulatorGrader<'bio-ecology'> = {
  id: 'bio-ecology',
  grade(state: BioEcologyState, seed: number): GraderOutput {
    const task = state.task ?? 'QUADRAT';
    const v = bioEcologyVariant(seed, task);
    return task === 'CAPTURE' ? gradeCapture(state, v) : task === 'FACTORS' ? gradeFactors(state, v) : task === 'SOIL' ? gradeSoil(state, v) : gradeQuadrat(state, v);
  },
};
