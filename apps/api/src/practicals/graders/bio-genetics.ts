import {
  BIO_GENETICS,
  CROSS_CLAIM_LABEL,
  CROSS_N,
  CROSS_NEED,
  CROSS_WRONG,
  DISC_CLAIM_LABEL,
  DISC_GROUPS,
  DISC_NEED,
  DISC_TRIES,
  DISC_WRONG,
  FOOD_CHAIN_MAIN,
  FOOD_CLAIM_LABEL,
  FOOD_LEVELS,
  FOOD_LINKS,
  FOOD_NEED,
  FOOD_ORGS,
  FOOD_ORG_LABEL,
  FOOD_SPOTS,
  FOOD_TRUE_LEVEL,
  FOOD_WRONG,
  HEIGHT_CLAIM_LABEL,
  HEIGHT_NEED,
  HEIGHT_WRONG,
  bioGeneticsVariant,
  classLabel,
  crossBatches,
  crossModelState,
  crossPairs,
  discModelState,
  discRoll,
  foodChainOk,
  foodModelState,
  foodSeenLinks,
  foodSeenOrgs,
  heightClasses,
  heightFreq,
  heightMidMean,
  heightModelState,
  heightSeen,
  roundDp,
  type BioGeneticsState,
  type BioGeneticsVariant,
  type CriterionScore,
  type DiscGroup,
  type FoodLevel,
  type GenTask,
} from '@aischool/shared';
import { parseNumber, score, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => BIO_GENETICS.rubric.find((c) => c.id === id)!;
const half = (x: number) => Math.floor(x * 2 + 1e-9) / 2;
const num = (raw: string) => parseNumber((raw ?? '').replace(/\s*(cm|mm|kj\/m²\/year|kj|%|°|degrees|organisms|per mm|: ?1)$/i, '').trim());
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const close = (x: number | null, target: number, abs: number, rel: number) => withinAbs(x, target, abs) || withinRel(x, target, rel);
/** A "x : 1" ratio or a plain number. */
const ratioNum = (raw: string) => {
  const m = (raw ?? '').match(/^\s*([\d.]+)\s*:\s*([\d.]+)\s*$/);
  if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
  return num(raw);
};
function claimMarks<C extends string>(chosen: C[], need: C[], wrong: C[], max: number, pen: number) {
  const got = need.filter((c) => chosen.includes(c));
  const bad = chosen.filter((c) => wrong.includes(c));
  return { m: Math.max(0, half((max * got.length) / need.length) - bad.length * pen), got, bad };
}

// ------------------------------------------------------------------ AI items

const AI: Record<GenTask, { precautions: { q: string; guide: string; kw: string[][] }; explain: { q: string; guide: string; kw: string[][] } }> = {
  HEIGHT: {
    precautions: {
      q: 'State two precautions you took when measuring the heights and hand spans of your class.',
      guide: '2 marks: one for each correct precaution — shoes taken off; a set square held flat on the head against the board; the scale read at eye level; everyone measured the same way (standing straight, heels against the board); the hand spread fully for the span; equal class widths used; anyone who declined was not measured. A vague statement earns nothing.',
      kw: [['shoe'], ['set square', 'flat on the head', 'ruler on the head'], ['eye level', 'parallax'], ['same way', 'straight', 'heels'], ['spread', 'stretch'], ['equal class', 'equal width', 'same width'], ['declin', 'consent', 'respect']],
    },
    explain: {
      q: 'Explain why height shows continuous variation and why most students are near the middle of the range.',
      guide: '2 marks: (1) height is controlled by many genes (polygenic), each adding a little, and is also affected by the environment (diet, health, exercise), so there is a continuous range of values with intermediates and no distinct groups; (1) most combinations of many small effects add up to values near the average, and few to the extremes, giving a bell-shaped (normal) distribution. Saying it is controlled by one gene earns nothing for that point.',
      kw: [['many genes', 'polygen', 'several genes'], ['environment', 'diet', 'nutrition', 'food'], ['range', 'intermediate', 'continuous'], ['average', 'mean', 'middle', 'normal', 'bell']],
    },
  },
  DISCRETE: {
    precautions: {
      q: 'State two precautions you took in the survey of tongue rolling and blood groups.',
      guide: '2 marks: one for each correct precaution — each person was given several attempts to roll the tongue; the results were recorded anonymously (by number); blood groups were taken from health records with consent — no blood was taken in class; the percentages were checked to add up to 100 % and the pie-chart angles to 360°; each person counted once. A vague statement earns nothing.',
      kw: [['several attempts', 'three attempts', 'more than one attempt', 'try again', 'attempts'], ['anonym', 'number', 'privacy'], ['record', 'health card', 'consent', 'no blood'], ['100', '360'], ['once', 'twice']],
    },
    explain: {
      q: 'Explain why tongue rolling and blood groups show discontinuous variation.',
      guide: '2 marks: (1) they are controlled by one or a few genes (blood group by the alleles IA, IB and i), so each person falls into one of a few distinct groups with no intermediates; (1) they are hardly affected by the environment, so they cannot be changed by diet or practice and cannot be measured on a continuous scale — unlike height. Saying blood group varies continuously earns nothing for that point.',
      kw: [['one gene', 'few genes', 'single gene', 'allele'], ['distinct', 'no intermediate', 'groups', 'categor'], ['environment', 'diet'], ['continuous', 'height', 'measured']],
    },
  },
  CROSS: {
    precautions: {
      q: 'State two precautions you took in the model monohybrid cross with beads.',
      guide: '2 marks: one for each correct precaution — the beads were drawn without looking; each bead was returned to its beaker and the beaker shaken after every draw (so the probability stays ½); equal numbers of red and white beads (50 : 50) in each beaker; beads of the same size; many (100) draws made; each pair recorded immediately. A vague statement earns nothing.',
      kw: [['without looking', 'not look', 'blind', 'closed eyes'], ['return', 'replace', 'put back'], ['shake', 'mix'], ['equal number', '50', 'same number'], ['same size'], ['100', 'many', 'large number']],
    },
    explain: {
      q: 'Explain why the expected phenotypic ratio from Tt × Tt is 3 : 1, and why your own result was not exactly 3 : 1.',
      guide: '2 marks: (1) each Tt parent produces gametes T and t in equal numbers (probability ½ each); fertilisation is random, so P(TT) = ¼, P(Tt) = ½, P(tt) = ½ × ½ = ¼; T is dominant, so TT and Tt are both tall: ¾ tall : ¼ short = 3 : 1; (1) which gametes meet is a matter of chance, so a small sample deviates from the expected ratio; the larger the sample (the class total) the closer to 3 : 1. Saying the genotypes are 3 : 1 earns nothing.',
      kw: [['gamete'], ['½', '1/2', 'half', 'equal'], ['¼', '1/4', 'quarter', '0.25'], ['dominant'], ['chance', 'random', 'probab'], ['larger', 'more', 'sample']],
    },
  },
  FOOD: {
    precautions: {
      q: 'State two precautions you took when constructing the food chains, food web and pyramids.',
      guide: '2 marks: one for each correct precaution — the arrows drawn from the eaten to the eater (the direction of energy flow); a scale stated and used for each pyramid; feeding relationships recorded from what was observed, not assumed; gloves and covered shoes worn when collecting; each organism counted once; every chain started with a producer. A vague statement earns nothing.',
      kw: [['arrow', 'eaten to', 'direction'], ['scale'], ['observ', 'not assum', 'saw'], ['glove', 'covered shoe', 'shoes'], ['count', 'once'], ['producer', 'green plant', 'start']],
    },
    explain: {
      q: 'Explain why the numbers of organisms and the energy decrease at each higher trophic level, and why food chains are short.',
      guide: '2 marks: (1) only about 10 % of the energy at one level is passed on to the next: the rest is lost in respiration (as heat), in excretion and faeces, and in parts not eaten; (1) so less energy is available at each higher level and it supports fewer (often larger) organisms, and after four or five levels too little is left for another level — chains are short. A pyramid of energy is therefore always upright. Saying energy is recycled earns nothing.',
      kw: [['10', 'ten percent', 'small fraction'], ['respiration', 'heat'], ['excret', 'faeces', 'waste', 'uneaten', 'not eaten'], ['fewer', 'less energy', 'decrease'], ['short', 'four', 'five', 'few levels']],
    },
  },
};
function aiItems(task: GenTask, s: BioGeneticsState): AiItem[] {
  const a = AI[task];
  return [
    { criterionId: 'precautions', question: a.precautions.q, answer: s.written.precautions.trim(), guide: a.precautions.guide, keywords: a.precautions.kw, need: 2 },
    { criterionId: 'explanation', question: a.explain.q, answer: s.written.explain.trim(), guide: a.explain.guide, keywords: a.explain.kw, need: 3 },
  ];
}

// ------------------------------------------------------------------ HEIGHT

function gradeHeight(s: BioGeneticsState, v: BioGeneticsVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.height;
  const hv = v.height;
  const seen = heightSeen(hv, w, v.seed);
  const willing = hv.people.map((p, i) => ({ p, i })).filter((x) => !x.p.declines);
  const pushed = w.measures.some((m) => hv.people[m.who]?.declines);
  const hMeas = seen.filter((x) => x.hm);
  const sMeas = seen.filter((x) => x.sm);
  const row = (i: number) => w.rows[i] ?? { h: '', s: '' };
  const own = seen.map((x) => num(row(x.who).h)).filter((x): x is number => x !== null);
  const ownS = seen.map((x) => num(row(x.who).s)).filter((x): x is number => x !== null);

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (pushed) notes.push('A classmate who declined was measured anyway: respect anyone who would rather not be measured, and leave them out.');
    else {
      const done = willing.filter((x) => seen[x.i]!.hm).length;
      m += done / Math.max(1, willing.length);
      if (done < willing.length) notes.push(`Measure everyone who agrees (${done} of ${willing.length} measured).`);
    }
    if (hMeas.length && hMeas.every((x) => !x.hm!.shoes)) m += 1;
    else if (hMeas.some((x) => x.hm!.shoes)) notes.push('Take shoes off for every measurement: the heel adds 2–3 cm and varies from person to person.');
    if (hMeas.length && hMeas.every((x) => x.hm!.square)) m += 1;
    else if (hMeas.length) notes.push('Rest a set square flat on the head against the board and read at eye level: guessing the top of the head is out by 1–2 cm.');
    if (sMeas.length >= willing.length && sMeas.every((x) => x.sm!.spread)) m += 0.5;
    else if (sMeas.some((x) => !x.sm!.spread)) notes.push('Spread the fingers fully for the hand span (tip of the thumb to tip of the little finger).');
    else notes.push('Measure everyone’s hand span too.');
    if (w.scheme === 'W5' || w.scheme === 'W10') m += 0.5;
    else if (w.scheme === 'UNEQUAL') notes.push('Use classes of equal width (e.g. 150–154, 155–159 cm): unequal classes distort the shape.');
    else notes.push('Group the heights into classes of equal width.');
    if (!w.measures.length) notes.splice(0, notes.length, 'Nobody was measured.');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4)
  {
    const notes: string[] = [];
    let ho = 0;
    let so = 0;
    let bad = 0;
    for (const x of seen) {
      if (x.h !== null) {
        if (num(row(x.who).h) === x.h) ho++;
        else if (row(x.who).h.trim()) bad++;
      }
      if (x.s !== null && withinAbs(num(row(x.who).s), x.s, 0.26)) so++;
    }
    const d = Math.max(1, willing.length);
    if (bad) notes.push(`${bad} height${bad === 1 ? ' is' : 's are'} not as the board showed.`);
    if (ho < willing.length) notes.push('Record every height to the nearest cm as you read it.');
    if (so < willing.length) notes.push('Record every hand span to the nearest 0.5 cm.');
    auto.push(score(crit('readings'), half((3 * Math.min(ho, d)) / d + Math.min(so, d) / d), notes));
  }

  // ---- presentation (3)
  {
    const notes: string[] = [];
    let m = 0;
    const cs = heightClasses(w.scheme);
    const want = heightFreq(own, w.scheme);
    if (cs.length && own.length) {
      const ok = want.filter((f, k) => {
        const raw = (w.freq[k] ?? '').trim();
        return raw ? num(raw) === f : f === 0;
      }).length;
      m += half((1.5 * ok) / cs.length);
      if (ok < cs.length) notes.push('Count the frequency of each class from your own heights (a height on a boundary such as 154.5 rounds into its class).');
    } else notes.push('Make a frequency table of your heights.');
    if (own.length && num(w.total) === own.length) m += 0.5;
    else notes.push('The total frequency is the number of students measured.');
    if (w.chart === 'HISTOGRAM') m += 1;
    else if (w.chart === 'BAR') notes.push('Height is continuous: draw a histogram with the bars touching, not a bar chart with gaps.');
    else notes.push('Draw a histogram of frequency against height class.');
    auto.push(score(crit('presentation'), Math.min(3, m), notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    const ownFreq = w.freq.map((x) => num(x) ?? 0);
    const mids = heightMidMean(heightClasses(w.scheme).map((_, k) => ownFreq[k] ?? 0), w.scheme);
    const mn = num(w.mean);
    if (own.length && (close(mn, mean(own), 0.3, 0.002) || (mids !== null && close(mn, mids, 0.3, 0.002)))) m += 1;
    else notes.push('Mean = sum of heights ÷ number of students (or Σ f × mid-point ÷ Σ f).');
    const cs = heightClasses(w.scheme);
    if (cs.length && ownFreq.length) {
      const top = Math.max(...cs.map((_, k) => ownFreq[k] ?? 0));
      if (w.modal !== null && top > 0 && (ownFreq[w.modal] ?? 0) === top) m += 1;
      else notes.push('The modal class is the class with the highest frequency in your table.');
    } else notes.push('State the modal class.');
    if (own.length && num(w.range) === Math.max(...own) - Math.min(...own)) m += 0.5;
    else notes.push('Range = tallest − shortest.');
    if (ownS.length && close(num(w.spanMean), mean(ownS), 0.06, 0.003) && close(num(w.spanRange), Math.max(...ownS) - Math.min(...ownS), 0.06, 0)) m += 0.5;
    else notes.push('Work out the mean and the range of the hand spans too.');
    const c = claimMarks(w.claims, HEIGHT_NEED, HEIGHT_WRONG, 2, 0.5);
    m += c.m;
    if (c.got.length < HEIGHT_NEED.length) notes.push('Conclude: a continuous range with most students near the middle — continuous, normal variation.');
    if (c.bad.length) notes.push(`Not true: ${list(c.bad.map((x) => `“${HEIGHT_CLAIM_LABEL[x]}”`))}.`);
    auto.push(score(crit('results'), Math.min(5, m), notes));
  }

  const model = heightModelState(v).height;
  const solution = [
    `${hv.n} classmates; ${hv.people.filter((p) => p.declines).length} declined and were not measured. Shoes off, set square on the head, read at eye level.`,
    `Frequencies (5 cm classes): ${heightClasses('W5').map((c, k) => `${classLabel(c)}: ${model.freq[k]}`).join(', ')} — total ${model.total}.`,
    `Mean ${model.mean} cm; modal class ${model.modal !== null ? classLabel(heightClasses('W5')[model.modal]!) : '—'} cm; range ${model.range} cm. Hand span: mean ${model.spanMean} cm, range ${model.spanRange} cm.`,
    'Height varies continuously (many genes plus the environment): most students near the mean, few at the extremes — a bell-shaped histogram with no gaps.',
  ];
  const facts = [`${hMeas.length} heights (${hMeas.filter((x) => x.hm!.shoes).length} with shoes, ${hMeas.filter((x) => !x.hm!.square).length} without set square), ${sMeas.length} spans; declined measured: ${pushed ? 'yes' : 'no'}; scheme ${w.scheme ?? '—'}; chart ${w.chart ?? '—'}.`];
  return { auto, ai: aiItems('HEIGHT', s), solution, facts };
}

// ------------------------------------------------------------------ DISCRETE

function gradeDisc(s: BioGeneticsState, v: BioGeneticsVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.disc;
  const dv = v.disc;
  const n = dv.n;
  const row = (i: number) => w.rows[i] ?? { roll: '' as const, group: '' as const };
  const asked = Array.from({ length: n }, (_, i) => i).filter((i) => (w.tries[i] ?? 0) > 0);
  const failed = asked.filter((i) => discRoll(dv, w, i) === 'N');

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    m += asked.length / n;
    if (asked.length < n) notes.push(`Ask every classmate to try rolling the tongue (${asked.length} of ${n}).`);
    const short = failed.filter((i) => (w.tries[i] ?? 0) < DISC_TRIES);
    if (asked.length && !short.length) m += 1;
    else if (short.length) notes.push(`Allow each person several attempts: ${short.length} classmate${short.length === 1 ? ' was' : 's were'} recorded as non-rollers after fewer than ${DISC_TRIES} tries — some people manage it only at the second or third attempt.`);
    const cards = Array.from({ length: n }, (_, i) => i).filter((i) => w.cards[i]).length;
    m += cards / n;
    if (cards < n) notes.push(`Read every health card (${cards} of ${n}).`);
    if (w.recordBy === 'NUMBER') m += 1;
    else if (w.recordBy === 'NAME') notes.push('Record the survey anonymously, by number: blood groups are private health information.');
    else notes.push('Decide how to record: anonymously, by number.');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4)
  {
    const notes: string[] = [];
    let ro = 0;
    let go = 0;
    for (let i = 0; i < n; i++) {
      const seenR = discRoll(dv, w, i);
      if (seenR && row(i).roll === seenR) ro++;
      if (w.cards[i] && row(i).group === dv.people[i]!.group) go++;
    }
    if (ro < n) notes.push('Record each classmate as a roller (R) or non-roller (N) as you saw it.');
    if (go < n) notes.push('Record each blood group exactly as on the health card.');
    auto.push(score(crit('readings'), half((2 * ro) / n + (2 * go) / n), notes));
  }

  // ---- presentation (3)
  {
    const notes: string[] = [];
    let m = 0;
    const R = w.rows.filter((x) => x.roll === 'R').length;
    const N = w.rows.filter((x) => x.roll === 'N').length;
    const g = (k: DiscGroup) => w.rows.filter((x) => x.group === k).length;
    let t = 0;
    if (R + N && num(w.tot.r) === R && num(w.tot.n) === N) t += 0.5;
    else notes.push('Count the rollers and non-rollers from your own record sheet.');
    if (DISC_GROUPS.every((k) => num(w.grp[k]) === g(k)) && DISC_GROUPS.some((k) => g(k))) t += 0.5;
    else notes.push('Count each blood group from your own record sheet.');
    m += t;
    if (w.chartT === 'PIE') m += 1;
    else notes.push('Show the tongue rolling as a pie chart, as the task asks.');
    if (w.chartB === 'BAR') m += 1;
    else if (w.chartB === 'HISTOGRAM') notes.push('Blood groups are separate categories: draw a bar chart with gaps, not a histogram.');
    else notes.push('Draw a bar chart (with gaps) of the blood groups.');
    auto.push(score(crit('presentation'), m, notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    const R = num(w.tot.r);
    const N = num(w.tot.n);
    const T = (R ?? 0) + (N ?? 0);
    if (T && close(num(w.tot.pr), (R! / T) * 100, 0.06, 0.002) && close(num(w.tot.pn), (N! / T) * 100, 0.06, 0.002)) m += 0.5;
    else notes.push('% rollers = rollers ÷ total × 100 (and the same for non-rollers).');
    const ar = num(w.tot.ar);
    const an = num(w.tot.an);
    if (T && close(ar, (R! / T) * 360, 0.6, 0.003) && close(an, (N! / T) * 360, 0.6, 0.003)) m += 1;
    else notes.push('Pie-chart angle = number ÷ total × 360°; the angles add up to 360°.');
    const gs = DISC_GROUPS.map((k) => num(w.grp[k]) ?? 0);
    const G = gs.reduce((a, b) => a + b, 0);
    if (G && DISC_GROUPS.every((k, j) => close(num(w.gpct[k]), (gs[j]! / G) * 100, 0.06, 0.002))) m += 1;
    else notes.push('% of each blood group = number ÷ total × 100; check they add up to 100 %.');
    const top = Math.max(...gs);
    if (w.most && G && (num(w.grp[w.most]) ?? 0) === top) m += 0.5;
    else notes.push('Name the most common blood group from your own counts.');
    const c = claimMarks(w.claims, DISC_NEED, DISC_WRONG, 2, 0.5);
    m += c.m;
    if (c.got.length < DISC_NEED.length) notes.push('Conclude: distinct groups with no intermediates, controlled by one or a few genes, not measurable on a continuous scale.');
    if (c.bad.length) notes.push(`Not true: ${list(c.bad.map((x) => `“${DISC_CLAIM_LABEL[x]}”`))}.`);
    auto.push(score(crit('results'), Math.min(5, m), notes));
  }

  const model = discModelState(v).disc;
  const solution = [
    `${n} classmates: ${model.tot.r} rollers (${model.tot.pr} %, ${model.tot.ar}°) and ${model.tot.n} non-rollers (${model.tot.pn} %, ${model.tot.an}°). ${dv.people.filter((p) => p.roller && p.needs > 1).length} rollers managed it only at the second or third attempt.`,
    `Blood groups from the health cards: ${DISC_GROUPS.map((k) => `${k} ${model.grp[k]} (${model.gpct[k]} %)`).join(', ')}; most common ${model.most}.`,
    'A pie chart for tongue rolling, a bar chart with gaps for blood groups. No blood is taken in class; the survey is anonymous.',
    'Discontinuous variation: distinct groups, one or a few genes, little effect of the environment.',
  ];
  const facts = [`Asked ${asked.length}/${n}; cards ${w.cards.filter(Boolean).length}/${n}; record by ${w.recordBy ?? '—'}; charts ${w.chartT ?? '—'}/${w.chartB ?? '—'}.`];
  return { auto, ai: aiItems('DISCRETE', s), solution, facts };
}

// ------------------------------------------------------------------ CROSS

function gradeCross(s: BioGeneticsState, v: BioGeneticsVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.cross;
  const pairs = crossPairs(w, v.seed);
  const batches = crossBatches(pairs);

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.fill === 'EQUAL') m += 1;
    else if (w.fill) notes.push('Each beaker stands for a Tt parent: put 50 red (T) and 50 white (t) beads in each.');
    else notes.push('Fill the two beakers with beads.');
    if (w.draws.length && w.draws.every((d) => d.blind)) m += 1;
    else if (w.draws.some((d) => !d.blind)) notes.push('Draw without looking: looking lets you favour one colour.');
    if (w.draws.length && w.draws.every((d) => d.back)) m += 1;
    else if (w.draws.some((d) => !d.back)) notes.push('Return the beads and shake the beakers after every draw: keeping them out changes the probabilities.');
    m += Math.min(1, pairs.length / CROSS_N);
    if (pairs.length < CROSS_N) notes.push(`Make ${CROSS_N} draws (${pairs.length} so far).`);
    if (!w.draws.length) notes.splice(0, notes.length, 'No beads were drawn.');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4)
  {
    const notes: string[] = [];
    let ok = 0;
    batches.forEach((b, k) => {
      const r = w.rows[k];
      if (r && num(r.TT) === b.TT && num(r.Tt) === b.Tt && num(r.tt) === b.tt) ok++;
    });
    const d = Math.max(CROSS_N / 10, batches.length);
    if (ok < batches.length) notes.push('Count TT, Tt and tt in each batch of ten draws exactly as drawn.');
    if (batches.length < d) notes.push('Readings are marked out of ten batches (100 draws).');
    auto.push(score(crit('readings'), half((4 * ok) / d), notes));
  }

  // ---- presentation (3)
  {
    const notes: string[] = [];
    let m = 0;
    const sum = (k: 'TT' | 'Tt' | 'tt') => w.rows.reduce((a, r) => a + (num(r[k]) ?? 0), 0);
    const tt = { TT: num(w.tot.TT), Tt: num(w.tot.Tt), tt: num(w.tot.tt) };
    if (w.rows.length && tt.TT === sum('TT') && tt.Tt === sum('Tt') && tt.tt === sum('tt')) m += 1;
    else notes.push('Total each genotype over all your batches.');
    if (tt.TT !== null && tt.Tt !== null && num(w.dom) === tt.TT + tt.Tt && num(w.rec) === tt.tt) m += 1;
    else notes.push('T is dominant: dominant (tall) = TT + Tt; recessive (short) = tt.');
    const d = num(w.dom);
    const r = num(w.rec);
    if (d !== null && r && close(ratioNum(w.ratio), d / r, 0.02, 0.01)) m += 1;
    else notes.push('Ratio = dominant ÷ recessive, written as x : 1.');
    auto.push(score(crit('presentation'), m, notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    const own = (num(w.dom) ?? 0) + (num(w.rec) ?? 0);
    if (own && close(num(w.expDom), own * 0.75, 0.06, 0) && close(num(w.expRec), own * 0.25, 0.06, 0)) m += 1;
    else notes.push('Expected: ¾ of your draws dominant and ¼ recessive (75 and 25 in 100).');
    const pt = (w.ptt ?? '').trim();
    if (['0.25', '1/4', '¼', '25%', '25 %', '.25'].includes(pt.replace(/\s+/g, ' ')) || num(pt) === 0.25) m += 0.5;
    else notes.push('P(tt) = ½ × ½ = ¼ = 0.25.');
    const od = num(w.dom);
    const or = num(w.rec);
    const cd = (od ?? 0) + v.cross.groups.reduce((a, g) => a + g.TT + g.Tt, 0);
    const cr = (or ?? 0) + v.cross.groups.reduce((a, g) => a + g.tt, 0);
    if (od !== null && or !== null && num(w.clsDom) === cd && num(w.clsRec) === cr && close(ratioNum(w.clsRatio), cd / cr, 0.02, 0.01)) m += 1;
    else notes.push('Class totals = the seven other groups plus yours; class ratio = dominant ÷ recessive.');
    const ownR = ratioNum(w.ratio);
    const clsR = ratioNum(w.clsRatio);
    if (ownR !== null && clsR !== null && w.closer) {
      const want = Math.abs(ownR - 3) < Math.abs(clsR - 3) ? 'OWN' : 'CLASS';
      if (w.closer === want || Math.abs(Math.abs(ownR - 3) - Math.abs(clsR - 3)) < 0.005) m += 0.5;
      else notes.push(`On your own ratios the ${want === 'OWN' ? 'group' : 'class'} result was closer to 3 : 1.`);
    } else notes.push('Compare your ratio and the class ratio with 3 : 1.');
    const c = claimMarks(w.claims, CROSS_NEED, CROSS_WRONG, 2, 0.5);
    m += c.m;
    if (c.got.length < CROSS_NEED.length) notes.push('Conclude: chance deviation; the larger sample is closer to 3 : 1; returning beads keeps the probability at ½.');
    if (c.bad.length) notes.push(`Not true: ${list(c.bad.map((x) => `“${CROSS_CLAIM_LABEL[x]}”`))}.`);
    auto.push(score(crit('results'), Math.min(5, m), notes));
  }

  const model = crossModelState(v).cross;
  const solution = [
    'Each beaker = a Tt parent: 50 red (T) and 50 white (t). One bead from each, without looking, returned and shaken: P(T) = P(t) = ½ every time.',
    `A model run of 100 draws: TT ${model.tot.TT}, Tt ${model.tot.Tt}, tt ${model.tot.tt} → dominant ${model.dom} : recessive ${model.rec} = ${model.ratio} : 1 (expected 75 : 25).`,
    `Class: the seven other groups (dominant ${v.cross.groups.map((g) => g.TT + g.Tt).join(', ')}) plus yours — the larger sample is usually closer to 3 : 1.`,
    'P(tt) = ½ × ½ = ¼; genotypes about 1 TT : 2 Tt : 1 tt; phenotypes about 3 tall : 1 short.',
  ];
  const facts = [`Fill ${w.fill ?? '—'}; ${w.draws.length} draws (${w.draws.filter((d) => !d.blind).length} looking, ${w.draws.filter((d) => !d.back).length} not returned); closer ${w.closer ?? '—'}.`];
  return { auto, ai: aiItems('CROSS', s), solution, facts };
}

// ------------------------------------------------------------------ FOOD

function gradeFood(s: BioGeneticsState, v: BioGeneticsVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.food;
  const seen = foodSeenLinks(w);
  const seenOrgs = foodSeenOrgs(w);
  const visited = FOOD_SPOTS.filter((x) => w.visited.includes(x));

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.gloves && w.glovedAt === 0) m += 1;
    else if (w.gloves) notes.push('Put on covered shoes and gloves before you start collecting, not part-way through.');
    else notes.push('Wear covered shoes and gloves when collecting (stinging insects, thorns).');
    m += (1.5 * visited.length) / FOOD_SPOTS.length;
    if (visited.length < FOOD_SPOTS.length) notes.push(`Survey every field spot (${visited.length} of ${FOOD_SPOTS.length}): missed spots mean missed organisms and feeding relationships.`);
    if (w.arrow === 'EATEN_EATER') m += 0.5;
    else if (w.arrow === 'EATER_EATEN') notes.push('Arrows point from the eaten to the eater: the direction energy flows.');
    else notes.push('Choose the direction of the arrows.');
    if ((num(w.scaleN) ?? 0) > 0) m += 0.5;
    else notes.push('State the scale of the pyramid of numbers (organisms per mm).');
    if ((num(w.scaleE) ?? 0) > 0) m += 0.5;
    else notes.push('State the scale of the pyramid of energy (kJ per mm).');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4)
  {
    const notes: string[] = [];
    const ok = FOOD_ORGS.filter((o) => seenOrgs.includes(o) && num(w.counts[o]) === v.food.counts[o]).length;
    const bad = FOOD_ORGS.filter((o) => w.counts[o].trim() && (!seenOrgs.includes(o) || num(w.counts[o]) !== v.food.counts[o]));
    if (bad.length) notes.push(`Counts not as in your field notes: ${list(bad.map((o) => FOOD_ORG_LABEL[o].toLowerCase()))}.`);
    if (ok < FOOD_ORGS.length && !bad.length) notes.push('Record the count of every organism from the field spots.');
    auto.push(score(crit('readings'), half((4 * ok) / FOOD_ORGS.length), notes));
  }

  // ---- presentation (3)
  {
    const notes: string[] = [];
    let m = 0;
    const valid = new Set(w.chains.filter((c) => foodChainOk(c, seen)).map((c) => c.join('>')));
    m += half(Math.min(valid.size, 3) / 3);
    if (valid.size < 3) {
      const bad = w.chains.filter((c) => !foodChainOk(c, seen));
      if (bad.some((c) => c[0] !== 'GRASS')) notes.push('Every food chain starts with the producer (the grass), never with an animal or the sun.');
      if (bad.length) notes.push('Each link in a chain must be a feeding relationship you saw in the field notes.');
      notes.push(`Write at least three different food chains (${valid.size} so far).`);
    }
    const trueSeen = FOOD_LINKS.filter((l) => seen.includes(l));
    const got = trueSeen.filter((l) => w.links.includes(l)).length;
    const wrong = w.links.filter((l) => !(FOOD_LINKS as readonly string[]).includes(l)).length;
    const web = Math.max(0, got - wrong) / FOOD_LINKS.length;
    m += half(web);
    if (got < FOOD_LINKS.length) notes.push('Combine every feeding relationship you saw into the food web.');
    if (wrong) notes.push(`${wrong} link${wrong === 1 ? '' : 's'} in the web ${wrong === 1 ? 'is' : 'are'} not a feeding relationship (check the arrow direction).`);
    const cnt = (o: string) => num(w.counts[o as keyof typeof w.counts]) ?? 0;
    const nums: Record<FoodLevel, number> = { P: cnt(FOOD_CHAIN_MAIN[0]!), C1: cnt(FOOD_CHAIN_MAIN[1]!), C2: cnt(FOOD_CHAIN_MAIN[2]!), C3: cnt(FOOD_CHAIN_MAIN[3]!) };
    const sN = num(w.scaleN);
    const sE = num(w.scaleE);
    const okN = sN && sN > 0 && FOOD_LEVELS.every((L) => close(num(w.widthN[L]), nums[L] / sN, 0.051, 0.03));
    const okE = sE && sE > 0 && FOOD_LEVELS.every((L) => close(num(w.widthE[L]), v.food.energy[L] / sE, 0.051, 0.03));
    if (okN) m += 0.5;
    else notes.push('Pyramid of numbers: bar width = count ÷ your scale, for grass, grasshopper, lizard and hawk.');
    if (okE) m += 0.5;
    else notes.push('Pyramid of energy: bar width = energy ÷ your scale, from the data card.');
    auto.push(score(crit('presentation'), Math.min(3, m), notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    const lv = FOOD_ORGS.filter((o) => w.levels[o] === FOOD_TRUE_LEVEL[o]).length;
    const badLv = FOOD_ORGS.filter((o) => w.levels[o] && w.levels[o] !== FOOD_TRUE_LEVEL[o]);
    m += half((1.5 * lv) / FOOD_ORGS.length);
    if (badLv.length) notes.push(`Trophic levels to check: ${list(badLv.map((o) => FOOD_ORG_LABEL[o].toLowerCase()))} (count the steps from the grass).`);
    else if (lv < FOOD_ORGS.length) notes.push('Give every organism its trophic level.');
    if (close(num(w.eff), (v.food.energy.C1 / v.food.energy.P) * 100, 0.06, 0.005)) m += 1;
    else notes.push('Efficiency = energy in primary consumers ÷ energy in producers × 100.');
    if (w.invert === 'NUMBERS') m += 0.5;
    else notes.push('A pyramid of numbers can be inverted (one tree, many insects); a pyramid of energy never is.');
    const c = claimMarks(w.claims, FOOD_NEED, FOOD_WRONG, 2, 0.5);
    m += c.m;
    if (c.got.length < FOOD_NEED.length) notes.push('Conclude: arrows show energy flow; numbers and energy fall at each level; energy is lost in respiration, excretion and uneaten parts.');
    if (c.bad.length) notes.push(`Not true: ${list(c.bad.map((x) => `“${FOOD_CLAIM_LABEL[x]}”`))}.`);
    auto.push(score(crit('results'), Math.min(5, m), notes));
  }

  const model = foodModelState(v).food;
  const solution = [
    `Counts: ${FOOD_ORGS.map((o) => `${FOOD_ORG_LABEL[o].toLowerCase()} ${v.food.counts[o]}`).join(', ')}.`,
    `Chains: ${model.chains.map((c) => c.map((o) => FOOD_ORG_LABEL[o]).join(' → ')).join('; ')}.`,
    'Levels: grass producer; grasshopper, caterpillar, goat primary; lizard, weaver bird, toad, man secondary; hawk tertiary.',
    `Pyramid of numbers at 10 per mm: ${FOOD_LEVELS.map((L) => `${model.widthN[L]} mm`).join(', ')}. Energy ${FOOD_LEVELS.map((L) => v.food.energy[L]).join(', ')} kJ/m²/year at 100 kJ per mm: ${FOOD_LEVELS.map((L) => `${model.widthE[L]} mm`).join(', ')} — the top bars are tiny, so a different (or log) scale is needed.`,
    `Efficiency = ${v.food.energy.C1} ÷ ${v.food.energy.P} × 100 = ${model.eff} %. About 90 % is lost at each step in respiration, excretion and uneaten parts.`,
  ];
  const facts = [`Gloves ${w.gloves ? `on (after ${w.glovedAt} spots)` : 'no'}; spots ${visited.length}/${FOOD_SPOTS.length}; ${w.chains.length} chains; ${w.links.length} web links; arrows ${w.arrow ?? '—'}.`];
  return { auto, ai: aiItems('FOOD', s), solution, facts };
}

/**
 * Marks the variation, genetics and food-web lab the way a WAEC biology scheme
 * does: from the student's own readings (the heights as the board showed
 * them, the survey as seen, the beads as drawn, the field counts) through the
 * table, chart and calculations to the conclusions. Precautions and the
 * explanation go to AI.
 */
export const bioGeneticsGrader: SimulatorGrader<'bio-genetics'> = {
  id: 'bio-genetics',
  grade(state: BioGeneticsState, seed: number): GraderOutput {
    const task = state.task ?? 'HEIGHT';
    const v = bioGeneticsVariant(seed, task);
    return task === 'DISCRETE' ? gradeDisc(state, v) : task === 'CROSS' ? gradeCross(state, v) : task === 'FOOD' ? gradeFood(state, v) : gradeHeight(state, v);
  },
};
void roundDp;
