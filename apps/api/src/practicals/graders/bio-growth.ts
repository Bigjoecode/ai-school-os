import {
  BIO_GROWTH,
  GERM_CLAIM_LABEL,
  GERM_KIND_CLAIM,
  GERM_KIND_LABEL,
  GERM_KIND_MISSING,
  GERM_MIN_DAY,
  GERM_MISSING_LABEL,
  GERM_SOWN,
  GERM_TUBES,
  GERM_WRONG,
  RESP_CLAIM_LABEL,
  RESP_EQUATIONS,
  RESP_NEED,
  RESP_WRONG,
  SEED_CLAIM_LABEL,
  SEED_KINDS,
  SEED_KIND_LABEL,
  SEED_LABELS,
  SEED_NEED,
  SEED_TABLE,
  SEED_TABLE_OPTION_LABEL,
  SEED_TABLE_TRUTH,
  SEED_WRONG,
  TROP_CLAIM_LABEL,
  TROP_N,
  TROP_NEED,
  TROP_SKETCH_LABEL,
  TROP_WRONG,
  bioDrawingMarks,
  bioGrowthVariant,
  germCount,
  germFinalDay,
  germKind,
  germModelState,
  respCo2,
  respCo2Parts,
  respModelState,
  respShown,
  roundDp,
  seedMeasureShown,
  seedModelState,
  seedMoist,
  tropDown,
  tropModelState,
  tropMoist,
  tropShown,
  type BioGrowthState,
  type BioGrowthVariant,
  type CriterionScore,
  type GermKind,
  type GrowthTask,
  type SeedKind,
  type SeedTableKey,
} from '@aischool/shared';
import { observationCredit } from './chem-qualitative';
import { parseNumber, score, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => BIO_GROWTH.rubric.find((c) => c.id === id)!;
const half = (x: number) => Math.floor(x * 2 + 1e-9) / 2;
const quarter = (x: number) => Math.floor(x * 4 + 1e-9) / 4;
const num = (raw: string) => parseNumber((raw ?? '').replace(/\s*(°c|°|degrees?|mm\/day|mm per day|°\/day|° per day|°c\/day|mm|%|seeds?|days?|h)$/i, '').trim());
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const okPct = (said: number | null, truth: number) => said !== null && (withinAbs(said, truth, 0.15) || withinRel(said, truth, 0.01));

// ------------------------------------------------------------------ AI items

const AI: Record<GrowthTask, { precautions: { q: string; guide: string; kw: string[][] }; explain: { q: string; guide: string; kw: string[][] } }> = {
  GERM: {
    precautions: {
      q: 'State two precautions you took in the experiment on the conditions for germination.',
      guide: '2 marks: one for each correct precaution — seeds of the same kind, size and age (sorted, undamaged); the same number of seeds in each tube; all the tubes except D kept at the same (room) temperature; the tubes labelled; only seeds with a visible radicle counted as germinated; the water boiled to remove dissolved oxygen and covered at once with oil; the cotton wool kept moist. A source of error or a vague statement (“be careful”) earns nothing.',
      kw: [['same size', 'same type', 'same kind', 'same age', 'similar', 'undamaged', 'sorted', 'viable'], ['same number', 'equal number', '10 seeds', 'ten seeds'], ['same temperature', 'room temperature'], ['label'], ['radicle'], ['boil', 'oil'], ['moist']],
    },
    explain: {
      q: 'Explain why water, oxygen and a suitable temperature are each needed for germination.',
      guide: '2 marks: (1) water is absorbed so the seed swells and the testa bursts; it activates the enzymes that change stored food (starch) into soluble food (sugar) for the growing embryo; (1) oxygen is needed for aerobic respiration, which releases the energy for growth; a suitable (warm) temperature is needed because enzymes work best at their optimum and are too slow in the cold. Saying light is needed earns nothing for that point.',
      kw: [['enzyme'], ['respiration', 'respire', 'energy'], ['soluble', 'starch', 'sugar', 'stored food', 'food reserve'], ['swell', 'testa', 'seed coat', 'imbib']],
    },
  },
  SEEDLING: {
    precautions: {
      q: 'State two precautions you took when growing and measuring the seedlings.',
      guide: '2 marks: one for each correct precaution — the sawdust (and blotting paper) kept moist but not waterlogged; the shoot measured from the same reference point each day; the seeds soaked overnight first; the seedlings handled gently when dug up; curved shoots straightened along the ruler or measured with a thread; readings at the same time each day. A vague statement earns nothing.',
      kw: [['moist', 'water', 'waterlog'], ['same point', 'same reference', 'same mark', 'same place', 'from the seed'], ['soak'], ['gentl', 'careful', 'damage'], ['thread', 'string', 'straighten'], ['same time']],
    },
    explain: {
      q: 'Explain how cowpea (epigeal) and maize (hypogeal) germination differ, naming the part that elongates in each.',
      guide: '2 marks: (1) in cowpea the hypocotyl (the part below the cotyledons) elongates and arches, pulling the cotyledons above the soil, where they turn green and photosynthesise — epigeal germination; (1) in maize the epicotyl (with the coleoptile protecting the plumule) elongates while the cotyledon and the grain (endosperm) stay below the soil — hypogeal germination. Calling maize epigeal or confusing the hypocotyl with the epicotyl earns nothing for that point.',
      kw: [['hypocotyl'], ['epicotyl', 'coleoptile'], ['above', 'brought up', 'lifted'], ['below', 'remain', 'stay', 'underground', 'in the soil']],
    },
  },
  RESP: {
    precautions: {
      q: 'State two precautions you took in the experiment on respiration in germinating seeds.',
      guide: '2 marks: one for each correct precaution — both batches of seeds rinsed in dilute disinfectant so microorganisms do not respire; equal quantities of seeds in the two flasks; the flasks plugged loosely with cotton wool (not airtight, so the seeds do not run out of oxygen); the flasks inverted so heat is not lost upwards and CO₂ can escape; the thermometer bulbs in among the seeds; the thermometers read at eye level. A vague statement earns nothing.',
      kw: [['disinfect', 'sterilis', 'steriliz', 'microorganism', 'microbe'], ['equal', 'same quantity', 'same amount', 'same number'], ['cotton wool', 'loose', 'not airtight', 'airtight'], ['invert', 'upside down'], ['eye level', 'parallax'], ['bulb', 'touch']],
    },
    explain: {
      q: 'Explain why the temperature rose in flask A but not in flask B, and why the seeds were rinsed in disinfectant.',
      guide: '2 marks: (1) the germinating seeds are alive and respire aerobically — glucose + oxygen → carbon dioxide + water + energy — and some of the energy is released as heat, which the vacuum flask keeps in; the boiled seeds are dead and do not respire, so B stays at room temperature (it is the control); (1) the disinfectant kills microorganisms on the seeds, which would also respire and give off heat (especially on the dead seeds), so any rise is due to the seeds alone. Saying the heat comes from the sun earns nothing.',
      kw: [['respir'], ['energy', 'heat'], ['dead', 'killed', 'boiled'], ['microorganism', 'microbe', 'bacteria', 'fungi', 'decay'], ['glucose', 'oxygen', 'carbon dioxide']],
    },
  },
  TROPISM: {
    precautions: {
      q: 'State two precautions you took in the experiments on phototropism and geotropism.',
      guide: '2 marks: one for each correct precaution — the seedlings and the cork kept moist; the box made light-proof except for the slit; a control in each experiment (the clinostat turning); the seedlings pinned gently so they are not damaged; the angle measured with a protractor from the same line each time; the clinostat kept away from water. A vague statement earns nothing.',
      kw: [['moist', 'water'], ['light-proof', 'light proof', 'lightproof', 'gaps', 'tape', 'no light'], ['control', 'clinostat', 'klinostat'], ['gentl', 'damage', 'careful'], ['protractor', 'same line'], ['electric']],
    },
    explain: {
      q: 'Explain, using auxin, why the shoots bent towards the light, and why the clinostat is used as the control.',
      guide: '2 marks: (1) auxin is made at the shoot tip and moves to the shaded side, where it makes the cells elongate more than on the lit side, so the shoot bends towards the light (in a horizontal root auxin gathers on the lower side and inhibits elongation there, so the root curves down); (1) the clinostat rotates slowly, so every side receives the light (or the pull of gravity) equally — the one-sided effect is cancelled and the control grows straight. Saying auxin makes the lit side grow faster earns nothing for that point.',
      kw: [['auxin'], ['shaded', 'shade', 'dark side', 'lower side', 'away from the light'], ['elongat', 'faster', 'grow more'], ['clinostat', 'klinostat', 'rotat', 'turn'], ['equal', 'all sides', 'cancel', 'one-sided', 'unilateral']],
    },
  },
};
function aiItems(task: GrowthTask, s: BioGrowthState): AiItem[] {
  const a = AI[task];
  return [
    { criterionId: 'precautions', question: a.precautions.q, answer: s.written.precautions.trim(), guide: a.precautions.guide, keywords: a.precautions.kw, need: 2 },
    { criterionId: 'explanation', question: a.explain.q, answer: s.written.explain.trim(), guide: a.explain.guide, keywords: a.explain.kw, need: 3 },
  ];
}

// ------------------------------------------------------------------ GERM

function gradeGerm(s: BioGrowthState, v: BioGrowthVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.germ;
  const kinds = w.tubes.map(germKind);
  const sown = w.tubes.map((t, k) => ({ t, k })).filter((x) => x.t.seeds > 0);
  const fin = germFinalDay(w);
  const looks = [...new Set(w.looks)].sort((a, b) => a - b);

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    const need: GermKind[] = ['CONTROL', 'DRY', 'NOOXY', 'COLD'];
    const have = need.filter((k) => kinds.includes(k));
    m += 0.5 * have.length;
    for (const k of need.filter((x) => !have.includes(x))) notes.push(`Set up a tube with ${GERM_KIND_LABEL[k].toLowerCase()}.`);
    if (w.tubes.some((t) => t.water === 'BOILED' && !t.oil)) notes.push('Cover the boiled, cooled water with a layer of oil at once: without it oxygen from the air dissolves back into the water.');
    if (w.tubes.some((t) => t.water === 'TAP')) notes.push('Boil the water first to drive out the dissolved oxygen: tap water still has oxygen in it.');
    if (w.batch === 'SORTED') m += 0.5;
    else notes.push('Use seeds of the same kind, size and age, sorted so that damaged ones are left out.');
    if (sown.length === GERM_TUBES.length && sown.every((x) => x.t.seeds === GERM_SOWN)) m += 0.5;
    else notes.push(`Put the same number of seeds (${GERM_SOWN}) in every tube.`);
    if (w.tubes.every((t) => t.label)) m += 0.5;
    else notes.push('Label every tube (A, B, C, D) before you leave them.');
    if (fin !== null && fin >= GERM_MIN_DAY) m += 0.5;
    else notes.push(`Leave the tubes for at least ${GERM_MIN_DAY} days before the final count.`);
    if (!sown.length) notes.splice(0, notes.length, 'No seeds were set up.');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4): daily counts (3), the number sown (1)
  {
    const notes: string[] = [];
    let ok = 0;
    const bad: string[] = [];
    for (const { t, k } of sown)
      for (const d of looks) {
        const raw = w.rows[k]?.c[d] ?? '';
        const val = num(raw);
        if (val !== null && val === germCount(v.germ, w, t, k, d)) ok++;
        else if (raw.trim()) bad.push(`tube ${GERM_TUBES[k]} on day ${d}`);
      }
    const denom = GERM_TUBES.length * Math.max(3, looks.length);
    let m = (3 * ok) / denom;
    if (bad.length) notes.push(`Counts not as the tubes showed them: ${list(bad.slice(0, 6))}${bad.length > 6 ? '…' : ''}. Count only seeds with a radicle showing; swollen seeds have not germinated yet.`);
    if (looks.length < 3) notes.push('Inspect and count the tubes on at least three days.');
    else if (ok + bad.length < sown.length * looks.length) notes.push('Write the count for every tube on every day you inspected them.');
    const sownOk = sown.filter(({ t, k }) => num(w.rows[k]?.sown ?? '') === t.seeds).length;
    m += sownOk / GERM_TUBES.length;
    if (sownOk < sown.length) notes.push('Record the number of seeds sown in each tube.');
    auto.push(score(crit('readings'), half(m), notes));
  }

  // ---- presentation (3): % germination (2), the missing condition (1)
  {
    const notes: string[] = [];
    let pctOk = 0;
    for (const { k } of sown) {
      const r = w.rows[k]!;
      const g = num(r.germ);
      const n = num(r.sown);
      if (g !== null && n && okPct(num(r.pct), (g / n) * 100)) pctOk++;
    }
    let m = (2 * pctOk) / GERM_TUBES.length;
    if (pctOk < sown.length) notes.push('% germination = number germinated ÷ number sown × 100, from your own final counts.');
    if (fin !== null) {
      const wrongFinal = sown.filter(({ t, k }) => num(w.rows[k]!.germ) !== germCount(v.germ, w, t, k, fin));
      if (wrongFinal.length) notes.push(`The number germinated is the count on your last day (day ${fin}): ${list(wrongFinal.map((x) => `tube ${GERM_TUBES[x.k]}`))}.`);
    }
    let mis = 0;
    w.tubes.forEach((t, k) => {
      const truth = GERM_KIND_MISSING[germKind(t)];
      if (truth && w.rows[k]?.missing === truth) mis++;
    });
    m += mis / GERM_TUBES.length;
    if (mis < GERM_TUBES.length) notes.push('Name the condition missing from each tube (none for the control).');
    auto.push(score(crit('presentation'), quarter(m), notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    for (const k of ['DRY', 'NOOXY', 'COLD'] as GermKind[]) {
      const c = GERM_KIND_CLAIM[k]!;
      if (kinds.includes(k) && kinds.includes('CONTROL') && w.claims.includes(c)) m += 1;
      else if (kinds.includes(k) && kinds.includes('CONTROL')) notes.push(`Conclude from tube ${GERM_TUBES[kinds.indexOf(k)]}: “${GERM_CLAIM_LABEL[c]}”.`);
      else if (w.claims.includes(c)) notes.push(`“${GERM_CLAIM_LABEL[c]}” needs a tube without it beside the control.`);
    }
    if (kinds.includes('CONTROL') && w.claims.includes('CONTROL')) m += 1;
    else if (kinds.includes('CONTROL')) notes.push('Say which tube is the control: it has all three conditions.');
    if (w.tubes.some((t) => t.oil) && w.claims.includes('OIL')) m += 1;
    else notes.push('The oil layer stops oxygen from the air dissolving back into the boiled water.');
    const wrong = w.claims.filter((c) => GERM_WRONG.includes(c));
    m = Math.max(0, m - 0.5 * wrong.length);
    if (wrong.length) notes.push(`Not true: ${list(wrong.map((x) => `“${GERM_CLAIM_LABEL[x]}”`))}.`);
    auto.push(score(crit('results'), Math.min(5, m), notes));
  }

  const model = germModelState(v);
  const solution = [
    'Four tubes of 10 sorted seeds: A moist cotton wool at room temperature (control), B dry cotton wool, C boiled and cooled water under a layer of oil, D moist cotton wool in a refrigerator.',
    ...model.germ.rows.map((r, k) => `Tube ${GERM_TUBES[k]}: ${model.germ.looks.map((d) => `day ${d}: ${r.c[d]}`).join(', ')} — ${r.germ} of ${r.sown} germinated = ${r.pct} %; missing: ${GERM_MISSING_LABEL[r.missing || 'NONE'].toLowerCase()}.`),
    'Only A germinates well: water, oxygen and warmth are all needed. Water activates the enzymes; oxygen is needed for respiration; warmth for enzyme activity. Seeds that have only swollen have not germinated: count a seed only when its radicle shows.',
  ];
  const facts = [`Batch ${w.batch ?? '—'}; tubes ${kinds.join(', ')}; seeds ${w.tubes.map((t) => t.seeds).join('/')}; inspected days ${looks.join(', ') || '—'}.`, `Claims: ${w.claims.join(', ') || '—'}.`];
  return { auto, ai: aiItems('GERM', s), solution, facts };
}

// ------------------------------------------------------------------ SEEDLING

function gradeSeedling(s: BioGrowthState, v: BioGrowthVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.seedling;
  const sv = v.seedling;
  const shownOf = (kind: SeedKind, d: number) => {
    const n = w.measures.findIndex((m) => m.kind === kind && m.day === d);
    return n < 0 ? null : seedMeasureShown(sv, w, w.measures[n]!, n, v.seed);
  };
  const days = [...new Set(w.measures.map((m) => m.day))].sort((a, b) => a - b);
  const lastDay = Math.max(w.day, ...days, 0);

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.soaked) m += 0.5;
    else notes.push('Soak the seeds overnight first: it softens the testa and starts germination.');
    if (w.box && w.jar) m += 0.5;
    else notes.push('Sow seeds both in the box of moist sawdust and between the blotting paper and the wall of the seed jar.');
    const dry = Array.from({ length: Math.max(0, Math.floor(lastDay)) }, (_, i) => i).filter((i) => !seedMoist(w, i));
    if ((w.box || w.jar) && !dry.length) m += 1;
    else if (dry.length) notes.push(`Keep the medium moist every day: it was dry on day ${list(dry.map(String))}, and growth almost stopped.`);
    const refs = new Set(w.measures.map((m) => m.ref));
    const both = days.filter((d) => SEED_KINDS.every((k) => w.measures.some((m) => m.day === d && m.kind === k)));
    if (both.length >= 5 && Math.min(...both) <= 2 && Math.max(...both) >= 8 && refs.size === 1) m += 1;
    else {
      if (refs.size > 1) notes.push('Measure from the same reference point every day.');
      if (!(both.length >= 5 && Math.min(...both) <= 2 && Math.max(...both) >= 8)) notes.push('Measure both shoots on at least five days, from day 2 or earlier to day 8 or later.');
    }
    const drew = (d: number) => w.draws.some((x) => Math.abs(x - d) <= 1);
    if (drew(3) && drew(7)) m += 1;
    else if (drew(3) || drew(7)) {
      m += 0.5;
      notes.push('Draw the seedlings at both day 3 and day 7.');
    } else notes.push('Draw the seedlings at day 3 and at day 7.');
    if (!w.box && !w.jar) notes.splice(0, notes.length, 'No seeds were sown.');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4): lengths as shown (3), the radicle first (1)
  {
    const notes: string[] = [];
    let ok = 0;
    const bad: string[] = [];
    const rowsMeasured = w.rows.filter((r) => days.includes(r.day));
    for (const r of rowsMeasured)
      for (const kind of SEED_KINDS) {
        const raw = kind === 'COWPEA' ? r.cow : r.maize;
        const truth = shownOf(kind, r.day);
        const val = num(raw);
        if (truth !== null && val !== null && withinAbs(val, truth, 1)) ok++;
        else if (raw.trim()) bad.push(`${SEED_KIND_LABEL[kind].toLowerCase()} on day ${r.day}`);
      }
    let m = (3 * ok) / (2 * Math.max(5, days.length));
    if (bad.length) notes.push(`Lengths not as the ruler showed them (to 1 mm): ${list(bad.slice(0, 6))}${bad.length > 6 ? '…' : ''}.`);
    if (ok < 2 * days.length) notes.push('Write each shoot length in the table on the day you measure it.');
    if (w.first === 'RADICLE') m += 1;
    else notes.push('The radicle always appears first.');
    auto.push(score(crit('readings'), half(m), notes));
  }

  // ---- presentation (3): graph (1), smooth curve (0.5), labels (1), drawing rules (0.5)
  {
    const notes: string[] = [];
    let m = 0;
    const pts = w.rows.filter((r) => num(r.cow) !== null || num(r.maize) !== null).length;
    if (w.graph && pts >= 5) m += 1;
    else notes.push('Plot shoot length against time for both seedlings: at least five points.');
    if (w.graph && w.curve === 'SMOOTH') m += 0.5;
    else if (w.curve === 'DOT') notes.push('Join growth points with a smooth curve, not dot to dot.');
    else if (w.curve === 'STRAIGHT') notes.push('Growth speeds up: a smooth curve fits the points, not one straight line.');
    const right = SEED_LABELS.filter((l, i) => (w.labels[i] ?? '') === l).length;
    m += right === SEED_LABELS.length ? 1 : right >= 4 ? 0.5 : 0;
    if (right < SEED_LABELS.length) notes.push(`${right} of ${SEED_LABELS.length} labels are right: the cowpea’s radicle, hypocotyl, cotyledons and plumule; the maize’s coleoptile and grain.`);
    const d = bioDrawingMarks(v.drawing, w.drawing);
    m += d.awarded / 4;
    if (d.wrong.length) notes.push(`Drawing rules: ${d.wrong.map((x) => `“${x.text}” is ${x.good ? 'good' : 'poor'} practice`).join('; ')}.`);
    auto.push(score(crit('presentation'), quarter(m), notes));
  }

  // ---- results (5): rates (1), comparison table (3), claims (1)
  {
    const notes: string[] = [];
    let m = 0;
    for (const [kind, raw] of [['COWPEA', w.rateCow], ['MAIZE', w.rateMaize]] as const) {
      const key = kind === 'COWPEA' ? 'cow' : 'maize';
      const a = num(w.rows.find((r) => r.day === 4)?.[key] ?? '');
      const b = num(w.rows.find((r) => r.day === 8)?.[key] ?? '');
      const said = num(raw);
      if (a !== null && b !== null && said !== null && withinAbs(said, (b - a) / 4, 0.06)) m += 0.5;
      else notes.push(`${SEED_KIND_LABEL[kind]}: growth rate between day 4 and day 8 = (length on day 8 − length on day 4) ÷ 4, from your own table.`);
    }
    let cells = 0;
    for (const kind of SEED_KINDS)
      for (const key of Object.keys(SEED_TABLE) as SeedTableKey[]) {
        if (w.table[kind][key] === SEED_TABLE_TRUTH[kind][key]) cells++;
        else if (w.table[kind][key]) notes.push(`${SEED_KIND_LABEL[kind]} — ${SEED_TABLE[key].label.toLowerCase()}: ${SEED_TABLE_OPTION_LABEL[SEED_TABLE_TRUTH[kind][key]]!.toLowerCase()}.`);
      }
    m += cells * 0.5;
    if (cells < 6 && !notes.some((n) => n.includes('—'))) notes.push('Complete the comparison table for cowpea and maize.');
    const got = SEED_NEED.filter((c) => w.claims.includes(c)).length;
    const wrong = w.claims.filter((c) => SEED_WRONG.includes(c));
    m += got >= 2 ? 1 : got === 1 ? 0.5 : 0;
    if (got < 2) notes.push(`Conclude: ${list(SEED_NEED.filter((c) => !w.claims.includes(c)).map((c) => `“${SEED_CLAIM_LABEL[c]}”`))}.`);
    m = Math.max(0, m - 0.5 * wrong.length);
    if (wrong.length) notes.push(`Not true: ${list(wrong.map((x) => `“${SEED_CLAIM_LABEL[x]}”`))}.`);
    auto.push(score(crit('results'), Math.min(5, half(m)), notes));
  }

  const model = seedModelState(v);
  const r4 = model.seedling.rows.find((r) => r.day === 4);
  const r8 = model.seedling.rows.find((r) => r.day === 8);
  const solution = [
    `Shoot lengths (mm, from the seed): ${model.seedling.rows.map((r) => `day ${r.day}: cowpea ${r.cow}, maize ${r.maize}`).join('; ')}.`,
    `Growth rate between day 4 and day 8: cowpea (${r8?.cow} − ${r4?.cow}) ÷ 4 = ${model.seedling.rateCow} mm/day; maize (${r8?.maize} − ${r4?.maize}) ÷ 4 = ${model.seedling.rateMaize} mm/day.`,
    'The radicle appears first. Cowpea is epigeal: its hypocotyl elongates and arches, pulling the cotyledons above the soil, where they turn green. Maize is hypogeal: the coleoptile pushes up (the epicotyl elongates) while the grain stays below.',
    'Plotted against time the lengths rise slowly, then faster: a smooth curve that becomes S-shaped over a longer period.',
  ];
  const facts = [`Soaked ${w.soaked ? 'yes' : 'no'}, box ${w.box ? 'yes' : 'no'}, jar ${w.jar ? 'yes' : 'no'}; watered on days ${w.waters.join(', ') || '—'}; measured on days ${days.join(', ') || '—'}; drawn on ${w.draws.join(', ') || '—'}.`];
  return { auto, ai: aiItems('SEEDLING', s), solution, facts };
}

// ------------------------------------------------------------------ RESP

function gradeResp(s: BioGrowthState, v: BioGrowthVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.resp;
  const rv = v.resp;
  const setUp = w.startAt !== null;

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.disLive) m += 0.5;
    else notes.push('Rinse the germinating seeds in dilute disinfectant too: microbes on them respire and give off heat.');
    if (w.disBoiled) m += 0.5;
    else notes.push('Rinse the boiled seeds in dilute disinfectant: otherwise microbes rot them and flask B warms up as well.');
    if (w.B.seeds === 'BOILED') m += 0.5;
    else notes.push('Flask B (the control) must hold boiled, killed seeds.');
    if (w.A.fill && w.A.fill === w.B.fill) m += 0.5;
    else notes.push('Use equal quantities of seeds in the two flasks.');
    if (w.A.plug === 'COTTON' && w.B.plug === 'COTTON') m += 0.5;
    else if (w.A.plug === 'BUNG' || w.B.plug === 'BUNG') notes.push('Plug the flasks loosely with cotton wool, not an airtight bung: sealed in, the seeds run out of oxygen.');
    else notes.push('Plug each flask loosely with cotton wool round the thermometer.');
    if (w.A.inverted && w.B.inverted) m += 0.5;
    else notes.push('Invert the flasks so heat is not lost upwards and the carbon dioxide (denser than air) can escape.');
    const rel = setUp ? w.reads.map((t) => t - w.startAt!) : [];
    const daily = [24, 48, 72].every((d) => rel.some((x) => Math.abs(x - d) <= 3));
    if (rel.some((x) => x <= 1) && daily) m += 1;
    else notes.push('Read both thermometers at the start and then once a day for three days.');
    if (!setUp) notes.splice(0, notes.length, 'The flasks were not set up.');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4): thermometers (3), the CO₂ test (1)
  {
    const notes: string[] = [];
    let ok = 0;
    const bad: string[] = [];
    w.reads.forEach((at, n) => {
      const r = w.rows[n] ?? { a: '', b: '' };
      for (const [which, f, raw] of [['A', w.A, r.a], ['B', w.B, r.b]] as const) {
        const val = num(raw);
        if (val !== null && withinAbs(val, respShown(rv, w, which, f, at, n, v.seed), 0.01)) ok++;
        else if (raw.trim()) bad.push(`${which} at ${Math.round(at - (w.startAt ?? 0))} h`);
      }
    });
    let m = (3 * ok) / (2 * Math.max(4, w.reads.length));
    if (bad.length) notes.push(`Thermometer readings not as shown (to 0.5 °C): ${list(bad.slice(0, 6))}.`);
    if (ok < 2 * w.reads.length) notes.push('Write both thermometer readings each time you read them.');
    const parts = respCo2Parts(rv, w);
    if (!parts) notes.push('Connect a flask of germinating seeds to a tube of lime water (or hydrogencarbonate indicator) and observe it.');
    else {
      if (observationCredit(w.obsLive, parts.live).credit >= 1) m += 0.5;
      else notes.push(`The test with germinating seeds: ${parts.live.map((p) => p.text).join('; ')}.`);
      if (parts.ctrl.length && observationCredit(w.obsCtrl, parts.ctrl).credit >= 1) m += 0.5;
      else if (parts.ctrl.length) notes.push(`The control (boiled seeds): ${parts.ctrl.map((p) => p.text).join('; ')}.`);
      else notes.push('Set up a control tube connected to boiled seeds beside the germinating ones.');
    }
    auto.push(score(crit('readings'), half(m), notes));
  }

  // ---- presentation (3): rise A (1), rise B (0.5), per day (1), difference (0.5)
  {
    const notes: string[] = [];
    let m = 0;
    const first = w.rows[0];
    const last = w.rows[w.reads.length - 1];
    const a0 = num(first?.a ?? '');
    const a1 = num(last?.a ?? '');
    const b0 = num(first?.b ?? '');
    const b1 = num(last?.b ?? '');
    const riseA = a0 !== null && a1 !== null ? a1 - a0 : null;
    const riseB = b0 !== null && b1 !== null ? b1 - b0 : null;
    const sA = num(w.riseA);
    const sB = num(w.riseB);
    if (riseA !== null && sA !== null && withinAbs(sA, riseA, 0.06)) m += 1;
    else notes.push('Rise in A = last reading − first reading, from your own table.');
    if (riseB !== null && sB !== null && withinAbs(sB, riseB, 0.06)) m += 0.5;
    else notes.push('Rise in B = last reading − first reading.');
    const days = w.reads.length > 1 ? Math.round((w.reads.at(-1)! - w.reads[0]!) / 24) : 0;
    const pd = num(w.perDay);
    if (sA !== null && days > 0 && pd !== null && (withinAbs(pd, sA / days, 0.02) || withinRel(pd, sA / days, 0.01))) m += 1;
    else notes.push(`Mean rise per day = rise in A ÷ the number of days (${days || 3}).`);
    const df = num(w.diff);
    if (sA !== null && sB !== null && df !== null && withinAbs(df, sA - sB, 0.06)) m += 0.5;
    else notes.push('Difference due to respiration = rise in A − rise in B.');
    auto.push(score(crit('presentation'), m, notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    const c = respCo2(rv, w, w.co2.look ?? w.clock);
    const allow = { HEAT: setUp, CO2: !!c && c.live >= 0.55, CONTROL: w.B.seeds === 'BOILED', DISINFECT: true } as const;
    for (const k of RESP_NEED) {
      if (w.claims.includes(k) && allow[k as keyof typeof allow]) m += 1;
      else if (w.claims.includes(k)) notes.push(`“${RESP_CLAIM_LABEL[k]}” is not shown by your own results.`);
      else notes.push(`Conclude: “${RESP_CLAIM_LABEL[k]}”.`);
    }
    if (w.eq === 'AEROBIC') m += 1;
    else notes.push(`The word equation for aerobic respiration: ${RESP_EQUATIONS[0].text}.`);
    const wrong = w.claims.filter((x) => RESP_WRONG.includes(x));
    m = Math.max(0, m - 0.5 * wrong.length);
    if (wrong.length) notes.push(`Not true: ${list(wrong.map((x) => `“${RESP_CLAIM_LABEL[x]}”`))}.`);
    auto.push(score(crit('results'), Math.min(5, m), notes));
  }

  const model = respModelState(v);
  const mr = model.resp;
  const solution = [
    `Readings at 0, 24, 48 and 72 h — flask A: ${mr.rows.map((r) => r.a).join(', ')} °C; flask B: ${mr.rows.map((r) => r.b).join(', ')} °C.`,
    `Rise in A = ${mr.riseA} °C; mean rise per day = ${mr.riseA} ÷ 3 = ${mr.perDay} °C; rise in B = ${mr.riseB} °C; difference due to respiration = ${mr.diff} °C.`,
    `Lime water bubbled through by germinating seeds: ${mr.obsLive}; with the boiled seeds: ${mr.obsCtrl}.`,
    'Germinating seeds respire aerobically: glucose + oxygen → carbon dioxide + water + energy, part of it as heat. The boiled seeds are dead (the control). Both batches are disinfected so that microbes cannot respire and give off heat; the flasks are plugged loosely and inverted.',
  ];
  const facts = [`Disinfected live ${w.disLive ? 'yes' : 'no'}, boiled ${w.disBoiled ? 'yes' : 'no'}; A ${w.A.seeds ?? '—'} ${w.A.fill ?? ''} ${w.A.plug ?? ''}${w.A.inverted ? ' inverted' : ''}; B ${w.B.seeds ?? '—'} ${w.B.fill ?? ''} ${w.B.plug ?? ''}${w.B.inverted ? ' inverted' : ''}; reads at ${w.reads.map((t) => Math.round(t)).join(', ')} h.`];
  return { auto, ai: aiItems('RESP', s), solution, facts };
}

// ------------------------------------------------------------------ TROPISM

function gradeTrop(s: BioGrowthState, v: BioGrowthVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.trop;
  const tv = v.trop;
  const shownOf = (pot: 'TEST' | 'CTRL', d: number) => {
    const n = w.measures.findIndex((m) => m.pot === pot && m.day === d);
    return n < 0 ? null : tropShown(tv, w, w.measures[n]!, n, v.seed);
  };
  const days = [...new Set(w.measures.map((m) => m.day))].sort((a, b) => a - b);

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.box && w.slit === 'LAMP') m += 0.5;
    else if (w.box && w.slit === 'AWAY') notes.push('Turn the box so its slit faces the lamp: the light must come from one side.');
    else notes.push('Put the test pot in the light-proof box with its slit facing the lamp.');
    if (w.box && w.taped) m += 0.5;
    else if (w.box) notes.push('Make the box light-proof (tape over the gaps) so light enters only through the slit.');
    if (w.ctrl === 'UNIFORM' || (w.ctrl === 'KLINO' && w.klinoOn)) m += 1;
    else if (w.ctrl === 'KLINO') notes.push('Switch the clinostat on: standing still, the control gets one-sided light too.');
    else notes.push('Keep a control pot on the rotating clinostat or in uniform light.');
    if (w.pinned) m += 0.5;
    else notes.push('Pin soaked bean seedlings to the cork with their radicles pointing in different directions.');
    const dry = Array.from({ length: Math.floor(w.day) }, (_, i) => i).filter((i) => !tropMoist(w, i));
    if (w.moist && !dry.length) m += 0.5;
    else notes.push(w.moist ? `Keep the seedlings moist every day (dry on day ${list(dry.map(String))}).` : 'Keep the cotton wool in the gas jar moist so the radicles do not dry out.');
    if (w.klinoSet && w.klinoOn) m += 1;
    else if (w.klinoSet) notes.push('The geotropism control only works while the clinostat turns.');
    else notes.push('Fix a similar set of seedlings on the clinostat, rotating, as the control.');
    if (!w.box && !w.pinned) notes.splice(0, notes.length, 'Neither experiment was set up.');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4): angles (3), radicles down (1)
  {
    const notes: string[] = [];
    let ok = 0;
    const bad: string[] = [];
    for (const r of w.rows.filter((x) => days.includes(x.day)))
      for (const [pot, raw] of [['TEST', r.test], ['CTRL', r.ctrl]] as const) {
        const truth = shownOf(pot, r.day);
        const val = num(raw);
        if (truth !== null && val !== null && withinAbs(val, truth, 2)) ok++;
        else if (raw.trim()) bad.push(`${pot === 'TEST' ? 'test' : 'control'} on day ${r.day}`);
      }
    let m = (3 * ok) / (2 * Math.max(3, days.length));
    if (bad.length) notes.push(`Angles not as the protractor showed them: ${list(bad)}.`);
    if (ok < 2 * days.length) notes.push('Measure the angle of both the test and the control shoot each day.');
    if (w.countAt !== null && w.countAt >= 1) {
      const d = num(w.down);
      if (d !== null && d === tropDown(tv, w, w.countAt)) m += 1;
      else notes.push(`On day ${w.countAt}, ${tropDown(tv, w, w.countAt)} of the ${TROP_N} radicles on the cork were growing downwards.`);
    } else notes.push('After a day or more, count the radicles on the cork that are growing downwards.');
    auto.push(score(crit('readings'), half(m), notes));
  }

  // ---- presentation (3): rate (1), % (1), sketches (1)
  {
    const notes: string[] = [];
    let m = 0;
    const lastT = [...w.rows].filter((r) => r.day > 0 && num(r.test) !== null).sort((a, b) => b.day - a.day)[0];
    const rate = num(w.rate);
    if (lastT && rate !== null && withinAbs(rate, num(lastT.test)! / lastT.day, 0.06)) m += 1;
    else notes.push('Mean rate of curvature = angle on your last day ÷ the number of days (° per day).');
    const d = num(w.down);
    const t = num(w.total);
    if (d !== null && t && okPct(num(w.pct), (d / t) * 100)) m += 1;
    else notes.push('% of radicles curving down = number growing down ÷ number pinned × 100.');
    if (w.sketchCork === 'DOWN') m += 0.5;
    else notes.push(`Stationary cork: ${TROP_SKETCH_LABEL.DOWN.toLowerCase()}.`);
    const klinoTruth = w.klinoSet && w.klinoOn ? 'STRAIGHT' : 'DOWN';
    if (w.klinoSet && w.sketchKlino === klinoTruth) m += 0.5;
    else if (w.klinoSet) notes.push(`On the clinostat: ${TROP_SKETCH_LABEL[klinoTruth].toLowerCase()}.`);
    auto.push(score(crit('presentation'), m, notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    const allow: Record<string, boolean> = { POS_PHOTO: w.box, POS_GEO: w.pinned, KLINO: w.ctrl !== null || w.klinoSet, AUXIN: true, CTRL_STRAIGHT: (w.ctrl === 'UNIFORM' || (w.ctrl === 'KLINO' && w.klinoOn)) && (!w.klinoSet || w.klinoOn) };
    for (const k of TROP_NEED) {
      if (w.claims.includes(k) && allow[k]) m += 1;
      else if (w.claims.includes(k)) notes.push(`“${TROP_CLAIM_LABEL[k]}” is not shown by your own set-up.`);
      else notes.push(`Conclude: “${TROP_CLAIM_LABEL[k]}”.`);
    }
    const wrong = w.claims.filter((x) => TROP_WRONG.includes(x));
    m = Math.max(0, m - 0.5 * wrong.length);
    if (wrong.length) notes.push(`Not true: ${list(wrong.map((x) => `“${TROP_CLAIM_LABEL[x]}”`))}.`);
    auto.push(score(crit('results'), Math.min(5, m), notes));
  }

  const model = tropModelState(v);
  const mt = model.trop;
  const solution = [
    `Angle of the test shoot towards the light: ${mt.rows.map((r) => `day ${r.day}: ${r.test}°`).join(', ')}; the control on the clinostat: ${mt.rows.map((r) => `${r.ctrl}°`).join(', ')}. Mean rate = ${mt.rows.at(-1)?.test} ÷ ${mt.rows.at(-1)?.day} = ${mt.rate}° per day.`,
    `Radicles growing down on the stationary cork: ${mt.down} of ${TROP_N} = ${mt.pct} % (the others were damaged when pinned); on the turning clinostat they grew straight on.`,
    'Shoots show positive phototropism and radicles positive geotropism. Auxin from the tip collects on the shaded side, where the cells elongate more, so the shoot bends towards the light. The clinostat turns slowly so every side gets the stimulus equally: the controls grow straight.',
  ];
  const facts = [`Box ${w.box ? 'yes' : 'no'}, slit ${w.slit ?? '—'}, taped ${w.taped ? 'yes' : 'no'}, lamp ${w.lamp ? 'on' : 'off'}, control ${w.ctrl ?? '—'}; cork pinned ${w.pinned ? 'yes' : 'no'}, moist ${w.moist ? 'yes' : 'no'}, clinostat set ${w.klinoSet ? 'yes' : 'no'} ${w.klinoOn ? 'on' : 'off'}; measured days ${days.join(', ') || '—'}.`];
  return { auto, ai: aiItems('TROPISM', s), solution, facts };
}

/**
 * Marks the germination, seed-respiration and plant-response lab the way a
 * WAEC biology scheme does. GERM: the four tubes, sorted seeds and equal
 * numbers, the daily counts against the seeds' own fates, % germination, the
 * missing condition and the conclusions. SEEDLING: soaking, moist medium,
 * daily measurement from one reference, drawings, the lengths against the
 * ruler, the graph, labels, growth rates and the epigeal/hypogeal table. RESP:
 * disinfected seeds, a boiled control, loose plugs and inverted flasks, daily
 * readings against the thermometers, the CO₂ test, the rises and the
 * conclusions. TROPISM: the light-proof box and slit, the clinostat controls,
 * the moist cork, the angles against the protractor, the radicle count, the
 * sketches and the conclusions. Precautions and the explanation go to AI.
 */
export const bioGrowthGrader: SimulatorGrader<'bio-growth'> = {
  id: 'bio-growth',
  grade(state: BioGrowthState, seed: number): GraderOutput {
    const task = state.task ?? 'GERM';
    const v = bioGrowthVariant(seed, task);
    return task === 'SEEDLING' ? gradeSeedling(state, v) : task === 'RESP' ? gradeResp(state, v) : task === 'TROPISM' ? gradeTrop(state, v) : gradeGerm(state, v);
  },
};
