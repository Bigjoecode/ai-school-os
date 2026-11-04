import {
  AIR_MIN,
  BIO_DISSECTION,
  EOSIN_ARRANGE_LABEL,
  EOSIN_CLAIM_LABEL,
  EOSIN_LABELS,
  EOSIN_MIN_READS,
  EOSIN_MIN_SPAN,
  EOSIN_NEED,
  EOSIN_SEEN_LABEL,
  EOSIN_WRONG,
  MICRO_CLAIM_LABEL,
  MICRO_NEED,
  MICRO_WRONG,
  MOULD_LABELS,
  PLATES,
  PLATE_LABEL,
  RAT_CLAIM_LABEL,
  RAT_LABELS,
  RAT_NEED,
  RAT_PART_LABEL,
  RAT_PARTS,
  RAT_WRONG,
  SLICES,
  bioDissectionVariant,
  bioDrawingMarks,
  eosinFront,
  eosinModelState,
  eosinSectionSeen,
  eosinShown,
  eosinVeinsRed,
  microIncDays,
  microModelState,
  mouldCover,
  mouldGrowthOf,
  plateKind,
  plateVisible,
  ratLast,
  ratModelState,
  type BioDissectionState,
  type BioDissectionVariant,
  type CriterionScore,
  type DissectTask,
} from '@aischool/shared';
import { parseNumber, score, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => BIO_DISSECTION.rubric.find((c) => c.id === id)!;
const half = (x: number) => Math.floor(x * 2 + 1e-9) / 2;
const num = (raw: string) => parseNumber((raw ?? '').replace(/\s*(cm\/min|cm per min(ute)?|cm\/h|cm per hour|cm|%|colonies)$/i, '').trim());
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const claimsMark = <C extends string>(claims: C[], need: C[], wrong: C[], label: Record<C, string>, each: number, notes: string[], ok: (c: C) => boolean = () => true) => {
  let m = 0;
  for (const c of need) {
    if (claims.includes(c) && ok(c)) m += each;
    else if (claims.includes(c)) notes.push(`“${label[c]}” needs evidence from your own experiment.`);
    else notes.push(`Conclude: “${label[c]}”.`);
  }
  const bad = claims.filter((c) => wrong.includes(c));
  if (bad.length) notes.push(`Not true: ${list(bad.map((x) => `“${label[x]}”`))}.`);
  return Math.max(0, m - 0.5 * bad.length);
};
const labelsRight = (want: readonly string[], got: string[]) => want.filter((l, i) => (got[i] ?? '') === l).length;

// ------------------------------------------------------------------ AI items

const AI: Record<DissectTask, { precautions: { q: string; guide: string; kw: string[][] }; explain: { q: string; guide: string; kw: string[][] } }> = {
  EOSIN: {
    precautions: {
      q: 'State two precautions you took when tracing the path of water with eosin.',
      guide: '2 marks: one for each correct precaution — the roots washed gently so they are not damaged (damaged roots let the dye in directly); a young plant with a translucent stem; thin sections cut with a sharp, wet razor blade; cutting on a tile, away from the fingers; the height read from the same point (the dye surface) at eye level; eosin kept off the skin and clothes. A vague statement (“be careful”) earns nothing.',
      kw: [['gentl', 'damag', 'root hair'], ['translucent', 'young', 'herbaceous'], ['thin'], ['tile', 'away from', 'finger'], ['same point', 'eye level', 'parallax', 'dye surface'], ['stain', 'spill', 'skin']],
    },
    explain: {
      q: 'Explain why only the xylem was stained, and how the water moves up the stem.',
      guide: '2 marks: (1) the xylem vessels are continuous tubes from the root through the stem into the leaf veins and carry water and mineral salts, so the dye in the water stains only the xylem (the phloem carries food; the pith and cortex do not conduct); (1) water evaporating from the leaves (transpiration) pulls the water column up the xylem (cohesion), helped by root pressure and capillarity, so the dye rises faster in bright, airy conditions. Saying the dye moves in the phloem earns nothing for that point.',
      kw: [['xylem'], ['vessel', 'tube', 'continuous', 'conduct'], ['transpiration', 'evaporat'], ['pull', 'cohesion', 'root pressure', 'capillar'], ['mineral', 'salts', 'water']],
    },
  },
  RAT: {
    precautions: {
      q: 'State two precautions you took during the dissection of the rat.',
      guide: '2 marks: one for each correct precaution — the skin lifted with forceps so the scissors do not cut too deeply; the body wall cut the same way, away from the body; the specimen kept moist with water; the gut displaced and unravelled with a seeker without tearing the mesentery; organs not removed unless asked; gloves worn and the tools and board disinfected afterwards, hands washed. A vague statement earns nothing.',
      kw: [['lift', 'not too deep', 'deep', 'shallow'], ['moist', 'water', 'wet'], ['seeker', 'mesentery', 'tear'], ['remove'], ['glove', 'disinfect', 'wash']],
    },
    explain: {
      q: 'Explain how the rat’s alimentary canal suits its diet, naming the functions of two of the organs you labelled.',
      guide: '2 marks: (1) the long, coiled small intestine (duodenum and ileum) gives a large surface area for the digestion and absorption of food; the liver makes bile, which flows straight into the duodenum because the rat has no gall bladder; the pancreas secretes digestive enzymes into the duodenum; the stomach stores food and begins protein digestion; (1) the large caecum holds bacteria that help to digest cellulose in plant food, and the gut : body ratio of about 5–6 : 1 suits an omnivore. Saying bile is stored in a gall bladder earns nothing for that point.',
      kw: [['absorb', 'absorption', 'surface area'], ['enzyme', 'digest'], ['bile', 'liver'], ['caecum', 'cellulose', 'bacteria'], ['omnivore', 'plant', 'mixed diet']],
    },
  },
  MICROBE: {
    precautions: {
      q: 'State two precautions you took when growing the microorganisms.',
      guide: '2 marks: one for each correct precaution — aseptic technique (the bench wiped with disinfectant, the lids lifted only slightly and briefly, a flamed loop); the plates labelled on the base, not the lid; the lids taped with two short strips (not sealed all round); the plates incubated upside down so condensation does not drip on the colonies; incubated at no more than 30 °C; the plates never opened after incubation and disposed of by autoclaving or soaking in disinfectant; hands washed afterwards. A vague statement earns nothing.',
      kw: [['aseptic', 'slightly', 'briefly', 'flame', 'wipe', 'disinfect'], ['base', 'label'], ['tape', 'strips'], ['upside down', 'invert', 'condensation'], ['30', 'temperature', 'pathogen'], ['never open', 'not open', 'sealed', 'autoclav']],
    },
    explain: {
      q: 'Explain your results on the plates and the bread, and what they show about hygiene and storing food.',
      guide: '2 marks: (1) microorganisms are everywhere — bacteria and fungal spores in the air and on the skin — and each one that lands on the nutrient agar multiplies into a visible colony; washing with soap removes most of those on the hands, so the washed finger gave far fewer colonies, and the unopened control shows the agar was sterile; (1) the mould (Rhizopus, a fungus) grew on the moist bread in the warm because spores from the air germinate where there is moisture, warmth and food; dry or cold bread grew little, which is why food is kept dry, cold or covered. Calling Rhizopus a bacterium earns nothing for that point.',
      kw: [['air', 'skin', 'everywhere', 'spore'], ['soap', 'wash', 'hygiene'], ['moist', 'water', 'warm', 'warmth'], ['fungus', 'fungi', 'rhizopus', 'mould'], ['control', 'sterile'], ['food', 'preserv', 'refrigerat', 'dry']],
    },
  },
};
function aiItems(task: DissectTask, s: BioDissectionState): AiItem[] {
  const a = AI[task];
  return [
    { criterionId: 'precautions', question: a.precautions.q, answer: s.written.precautions.trim(), guide: a.precautions.guide, keywords: a.precautions.kw, need: 2 },
    { criterionId: 'explanation', question: a.explain.q, answer: s.written.explain.trim(), guide: a.explain.guide, keywords: a.explain.kw, need: 3 },
  ];
}

// ------------------------------------------------------------------ EOSIN

function gradeEosin(s: BioDissectionState, v: BioDissectionVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.eosin;
  const reads = w.reads;
  const span = reads.length ? Math.max(...reads) - Math.min(...reads) : 0;
  const ts = w.sections.filter((x) => x.kind === 'TS');
  const viewed = (k: 'TS' | 'LS') => w.views.some((x) => w.sections[x.n]?.kind === k);
  const stainedTsSeen = w.views.some((x) => w.sections[x.n]?.kind === 'TS' && eosinSectionSeen(v.eosin, w, x.n) !== 'NONE');

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.wash === 'GENTLE' && w.dye) m += 1;
    else if (w.wash === 'ROUGH') notes.push('Wash the roots gently: torn roots let the dye straight in and it spreads sideways.');
    else notes.push('Wash the roots free of soil and stand them in the eosin.');
    if (w.place === 'BRIGHT' && reads.length >= EOSIN_MIN_READS && span >= EOSIN_MIN_SPAN - 1e-9) m += 1;
    else {
      if (w.place !== 'BRIGHT') notes.push('Leave the plant in a well-lit, airy place so it transpires.');
      if (reads.length < EOSIN_MIN_READS || span < EOSIN_MIN_SPAN) notes.push(`Read the height of the dye at least ${EOSIN_MIN_READS} times at intervals over an hour or more.`);
    }
    const heights = [...new Set(ts.map((x) => Math.round(x.at)))];
    if (heights.length >= 2 && Math.max(...heights) - Math.min(...heights) >= 3 && ts.every((x) => x.thin && x.tile)) m += 1;
    else {
      if (heights.length < 2 || Math.max(...heights) - Math.min(...heights) < 3) notes.push('Cut transverse sections at different heights (some centimetres apart).');
      if (ts.some((x) => !x.thin)) notes.push('Cut thin sections: thick ones let no light through.');
      if (w.sections.some((x) => !x.tile)) notes.push('Cut on a tile, away from your fingers — never towards a hand holding the stem.');
    }
    if (viewed('TS') && viewed('LS')) m += 1;
    else notes.push(viewed('TS') ? 'Cut and examine a longitudinal section too.' : 'Examine the sections with the hand lens or the microscope.');
    auto.push(score(crit('procedure'), m, notes));
  }

  // ---- readings (4): heights (3), section observations (1)
  {
    const notes: string[] = [];
    let ok = 0;
    const bad: string[] = [];
    reads.forEach((t, n) => {
      const raw = w.rows[n] ?? '';
      if (withinAbs(num(raw), eosinShown(v.eosin, w, n, v.seed), 0.1)) ok++;
      else if (raw.trim()) bad.push(`${t} min`);
    });
    let m = (3 * ok) / Math.max(EOSIN_MIN_READS, reads.length);
    if (bad.length) notes.push(`Heights not as the ruler showed them: ${list(bad.slice(0, 6))}. Read the top of the red line, to 0.1 cm, from the dye surface.`);
    if (reads.length < EOSIN_MIN_READS) notes.push(`Take at least ${EOSIN_MIN_READS} readings.`);
    else if (ok + bad.length < reads.length) notes.push('Write every height you read.');
    const secOk = w.sections.filter((_, n) => w.secRows[n] === eosinSectionSeen(v.eosin, w, n)).length;
    if (w.sections.length) m += secOk / w.sections.length;
    if (!w.sections.length) notes.push('Cut sections and record what each shows.');
    else if (secOk < w.sections.length) notes.push(`Record what each section showed: ${w.sections.map((x, n) => `${x.kind} at ${x.at} cm — ${EOSIN_SEEN_LABEL[eosinSectionSeen(v.eosin, w, n)].toLowerCase()}`).join('; ')}.`);
    auto.push(score(crit('readings'), half(m + 1e-9), notes));
  }

  // ---- presentation (3): rate (1), labels (1), shading (0.5), rules (0.5)
  {
    const notes: string[] = [];
    let m = 0;
    const n = reads.length;
    const h0 = num(w.rows[0] ?? '');
    const h1 = num(w.rows[n - 1] ?? '');
    if (n >= 2 && h0 !== null && h1 !== null && reads[n - 1]! > reads[0]!) {
      const truth = (h1 - h0) / (reads[n - 1]! - reads[0]!);
      const said = num(w.rate);
      const saidH = num(w.rateH);
      if (said !== null && (withinAbs(said, truth, 0.002) || withinRel(said, truth, 0.03))) m += 0.5;
      else notes.push(`Rate = (${h1} − ${h0}) ÷ (${reads[n - 1]} − ${reads[0]}) cm/min, from your own first and last readings.`);
      if (saidH !== null && (withinAbs(saidH, truth * 60, 0.15) || withinRel(saidH, truth * 60, 0.03))) m += 0.5;
      else notes.push('Give the rate in cm per hour as well (× 60).');
    } else notes.push('Work out the rate of rise from your first and last readings.');
    const right = labelsRight(EOSIN_LABELS, w.labels);
    m += right === EOSIN_LABELS.length ? 1 : right >= 4 ? 0.5 : 0;
    if (right < EOSIN_LABELS.length) notes.push(`${right} of ${EOSIN_LABELS.length} labels are right: epidermis, cortex, phloem (outside), xylem (inside, stained), cambium between them, pith in the centre.`);
    if (w.shade === 'XYLEM') m += 0.5;
    else if (w.shade) notes.push('Shade only the xylem — the stained tissue — not the whole bundle or the whole stem.');
    else notes.push('Show the stained tissue by shading the xylem.');
    const d = bioDrawingMarks(v.drawing, w.drawing);
    m += d.awarded / 4;
    if (d.wrong.length) notes.push(`Drawing rules: ${d.wrong.map((x) => `“${x.text}” is ${x.good ? 'good' : 'poor'} practice`).join('; ')}.`);
    auto.push(score(crit('presentation'), half(m + 1e-9), notes));
  }

  // ---- results (5): tissue (1), ring (1), veins (1), claims (2)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.tissue === 'XYLEM' && stainedTsSeen) m += 1;
    else if (w.tissue === 'XYLEM') notes.push('Examine a stained transverse section before you name the tissue.');
    else notes.push('The red dye is in the xylem only (the inner part of each vascular bundle).');
    if (w.arrange === 'RING' && viewed('TS')) m += 1;
    else notes.push(`Balsam is a dicot: the bundles are ${EOSIN_ARRANGE_LABEL.RING.toLowerCase()}.`);
    if (w.leafLook !== null && w.veins === (eosinVeinsRed(v.eosin, w) ? 'RED' : 'GREEN')) m += 1;
    else if (w.leafLook === null) notes.push('Look at the leaves and record whether their veins have turned red.');
    else notes.push(`The leaf veins were ${eosinVeinsRed(v.eosin, w) ? 'red' : 'still green'} when you looked.`);
    m += claimsMark(w.claims, EOSIN_NEED, EOSIN_WRONG, EOSIN_CLAIM_LABEL, 1, notes);
    auto.push(score(crit('results'), Math.min(5, m), notes));
  }

  const model = eosinModelState(v);
  const mw = model.eosin;
  const solution = [
    `Heights of the dye (from the dye surface): ${mw.reads.map((t, n) => `${t} min: ${mw.rows[n]} cm`).join('; ')}.`,
    `Rate = (${mw.rows.at(-1)} − ${mw.rows[0]}) ÷ (${mw.reads.at(-1)} − ${mw.reads[0]}) = ${mw.rate} cm/min = ${mw.rateH} cm/h.`,
    `Transverse sections below the front (e.g. at ${mw.sections[0]!.at} cm) show red only in the xylem of the bundles, arranged in a ring; above the front (${mw.sections[1]!.at} cm) nothing is stained. The longitudinal section shows red xylem vessels with spiral thickening.`,
    'The xylem conducts water and mineral salts from the roots to the leaves (its vessels continue into the leaf veins); transpiration pull, helped by root pressure and capillarity, draws the water up.',
  ];
  const facts = [`Wash ${w.wash ?? '—'}, place ${w.place ?? '—'}; read at ${reads.join(', ') || '—'} min; front at the cut ${eosinFront(v.eosin, w, w.clock).toFixed(1)} cm; sections ${w.sections.map((x) => `${x.kind}@${x.at}`).join(', ') || '—'}.`, `Claims: ${w.claims.join(', ') || '—'}.`];
  return { auto, ai: aiItems('EOSIN', s), solution, facts };
}

// ------------------------------------------------------------------ RAT

function gradeRat(s: BioDissectionState, v: BioDissectionVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.rat;
  const last = ratLast(v.rat, w, v.seed);
  const stretched = w.measures.some((m) => m.what !== 'BODY' && m.how === 'STRETCH');

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.gloves && w.pinned === 'VENTRAL') m += 1;
    else {
      if (!w.gloves) notes.push('Wear gloves to handle the specimen.');
      if (w.pinned !== 'VENTRAL') notes.push('Pin the rat on its back (ventral side up) by its four limbs.');
    }
    if (w.skin === 'LIFTED' && w.skinPinned) m += 1;
    else if (w.skin === 'DEEP') notes.push('Lift the skin with forceps before you cut, so the scissors do not go too deep.');
    else notes.push('Cut the skin along the midline and pin it back.');
    if (w.wall === 'LIFTED' && w.moist) m += 1;
    else {
      if (w.wall === 'DEEP') notes.push('Lift the body wall too: cutting straight in nicked the gut.');
      else if (!w.wall) notes.push('Cut the muscle wall to expose the abdominal organs.');
      if (!w.moist) notes.push('Keep the specimen moist with water.');
    }
    if (w.display === 'SEEKER' && w.unravelled && w.cleaned && !stretched) m += 1;
    else {
      if (w.display === 'FORCEPS') notes.push('Displace the gut with a seeker: pulling with forceps tears the mesentery.');
      else if (!w.unravelled) notes.push('Displace the gut to one side and unravel it with a seeker.');
      if (stretched) notes.push('Do not pull the gut straight to measure it: lay a damp thread along it instead.');
      if (!w.cleaned) notes.push('Disinfect the tools and the board at the end.');
    }
    auto.push(score(crit('procedure'), m, notes));
  }

  // ---- readings (4)
  {
    const notes: string[] = [];
    let m = 0;
    const want: Record<(typeof RAT_PARTS)[number], number> = { BODY: 1, SI: 1.5, LI: 1.5 };
    for (const part of RAT_PARTS) {
      const raw = part === 'BODY' ? w.body : part === 'SI' ? w.si : w.li;
      const shown = last[part];
      if (shown !== null && withinAbs(num(raw), shown, 0.25)) m += want[part];
      else if (shown === null) notes.push(`Measure the ${RAT_PART_LABEL[part].toLowerCase()}.`);
      else notes.push(`${RAT_PART_LABEL[part]}: your ruler showed ${shown.toFixed(1)} cm.`);
    }
    auto.push(score(crit('readings'), m, notes));
  }

  // ---- presentation (3): labels (2), displayed (0.5), rules (0.5)
  {
    const notes: string[] = [];
    let m = 0;
    const right = labelsRight(RAT_LABELS, w.labels);
    m += right === RAT_LABELS.length ? 2 : right >= 7 ? 1.5 : right >= 5 ? 1 : right >= 3 ? 0.5 : 0;
    if (right < RAT_LABELS.length) notes.push(`${right} of ${RAT_LABELS.length} labels are right. There is no gall bladder to label in a rat.`);
    if (w.labels.includes('Gall bladder')) notes.push('The rat has no gall bladder.');
    if (w.style === 'DISPLAYED') m += 0.5;
    else notes.push('Draw the dissection as you displayed it, not an idealised textbook diagram.');
    const d = bioDrawingMarks(v.drawing, w.drawing);
    m += d.awarded / 4;
    if (d.wrong.length) notes.push(`Drawing rules: ${d.wrong.map((x) => `“${x.text}” is ${x.good ? 'good' : 'poor'} practice`).join('; ')}.`);
    auto.push(score(crit('presentation'), half(m + 1e-9), notes));
  }

  // ---- results (5): ratio (1), gall bladder (1), claims (3)
  {
    const notes: string[] = [];
    let m = 0;
    const b = num(w.body);
    const si = num(w.si);
    const li = num(w.li);
    const said = num(w.ratio);
    if (b && si !== null && li !== null && said !== null && (withinAbs(said, (si + li) / b, 0.03) || withinRel(said, (si + li) / b, 0.01))) m += 1;
    else notes.push('Gut : body = (small intestine + large intestine) ÷ body length, from your own measurements.');
    if (w.gall === 'ABSENT') m += 1;
    else notes.push('The rat has no gall bladder: bile flows from the liver straight into the duodenum along the bile duct.');
    const opened = w.wall !== null;
    m += claimsMark(w.claims, RAT_NEED, RAT_WRONG, RAT_CLAIM_LABEL, 0.75, notes, (c) => opened && (c !== 'OMNIVORE' || last.SI !== null));
    auto.push(score(crit('results'), Math.min(5, half(m + 1e-9)), notes));
  }

  const model = ratModelState(v);
  const mr = model.rat;
  const solution = [
    'Pinned ventral side up by the four limbs; the skin lifted with forceps and cut along the midline from the lower abdomen to the jaw, with side cuts, and pinned back; the body wall cut the same way; the gut displaced and unravelled with a seeker.',
    `Body ${mr.body} cm; small intestine ${mr.si} cm; large intestine ${mr.li} cm (a damp thread along the gut, then on the ruler). Gut : body = (${mr.si} + ${mr.li}) ÷ ${mr.body} = ${mr.ratio} : 1.`,
    'Labelled: oesophagus, liver (dark red, lobed, below the diaphragm), stomach (on the left), duodenum with the pancreas in its loop, ileum (long and coiled), caecum (large, at the junction), colon and rectum. There is no gall bladder: the bile duct runs straight to the duodenum.',
  ];
  const facts = [`Gloves ${w.gloves ? 'yes' : 'no'}, pinned ${w.pinned ?? '—'}, skin ${w.skin ?? '—'}, wall ${w.wall ?? '—'}, display ${w.display ?? '—'}, moist ${w.moist ? 'yes' : 'no'}; measured ${w.measures.map((x) => `${x.what}/${x.how}`).join(', ') || '—'}.`, `Claims: ${w.claims.join(', ') || '—'}.`];
  return { auto, ai: aiItems('RAT', s), solution, facts };
}

// ------------------------------------------------------------------ MICROBE

function gradeMicro(s: BioDissectionState, v: BioDissectionVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.micro;
  const days = microIncDays(w);
  const P = w.plates;
  const [ctrl, air, unw, wsh] = P as [(typeof P)[number], (typeof P)[number], (typeof P)[number], (typeof P)[number]];
  const comparison = w.slices.some((x) => x.moist === false || x.place === 'COLD') && w.slices.some((x) => x.moist === true && x.place === 'WARM');

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (P.every((p) => p.label === 'BASE')) m += 0.5;
    else notes.push('Label every plate on the base, not the lid (lids get swapped).');
    if (!ctrl.airMin && !ctrl.touch && !ctrl.lid) m += 0.5;
    else notes.push('Never open the control plate: it shows whether the agar was sterile.');
    if (air.airMin === AIR_MIN && !air.touch) m += 0.5;
    else notes.push(`Leave the air plate open for ${AIR_MIN} minutes.`);
    if (unw.touch === 'UNWASHED' && wsh.touch === 'WASHED' && unw.lid === 'SLIGHT' && wsh.lid === 'SLIGHT') m += 0.5;
    else {
      if (wsh.touch !== 'WASHED') notes.push('Touch the last plate only after washing your hands with soap.');
      if (unw.touch !== 'UNWASHED') notes.push('Touch the unwashed-finger plate before you wash your hands.');
      if ([unw, wsh].some((p) => p.lid === 'WIDE')) notes.push('Lift the lid only slightly and briefly: air microbes fall in.');
    }
    if (P.every((p) => p.tape === 'STRIPS')) m += 0.5;
    else notes.push(P.some((p) => p.tape === 'SEALED') ? 'Two short strips of tape, not sealed all round: sealed plates favour anaerobic microbes, including pathogens.' : 'Tape each lid with two short strips so it cannot come off.');
    if (w.inverted && (w.temp === 25 || w.temp === 30)) m += 0.5;
    else {
      if (!w.inverted) notes.push('Incubate the plates upside down so condensation does not drip onto the colonies.');
      if (w.temp === 37) notes.push('Incubate at no more than 30 °C: 37 °C (body temperature) encourages human pathogens.');
      else if (w.temp === null) notes.push('Incubate the plates at 25–30 °C.');
    }
    if (w.breadExposed && w.bagged && comparison) m += 0.5;
    else {
      if (!w.breadExposed) notes.push('Expose the moist bread to the air for 30 minutes first.');
      if (!w.bagged) notes.push('Keep the bread in a polythene bag so it stays moist.');
      if (!comparison) notes.push('Set up a comparison: moist bread in the warm beside dry bread or bread kept cold.');
    }
    if (days !== null && days >= 2 && days <= 3 && !w.openedAfter && w.dispose === 'DISINFECT') m += 0.5;
    else {
      if (w.openedAfter) notes.push('Never open a plate after incubation: the colonies may include pathogens.');
      if (days === null || days < 2 || days > 3) notes.push('Count the colonies after 2–3 days of incubation.');
      if (w.dispose !== 'DISINFECT') notes.push('Dispose of the plates by soaking in strong disinfectant (or autoclaving), still taped.');
    }
    auto.push(score(crit('procedure'), m, notes));
  }

  // ---- readings (4): counts (3), kinds (0.5), bread (0.5)
  {
    const notes: string[] = [];
    let m = 0;
    if (days === null) notes.push('Count the colonies on each plate after incubation.');
    else {
      const bad: string[] = [];
      let kindsOk = 0;
      PLATES.forEach((role, k) => {
        const truth = plateVisible(v.micro, w, k, days, v.seed).length;
        const said = num(w.counts[k] ?? '');
        if (said !== null && Math.abs(said - truth) <= Math.max(1, Math.round(truth * 0.05))) m += 0.75;
        else bad.push(`${PLATE_LABEL[role].toLowerCase()} (${truth})`);
        if (w.kinds[k] === plateKind(v.micro, w, k, days, v.seed)) kindsOk++;
      });
      if (bad.length) notes.push(`Count again through the lid, quarter by quarter: ${list(bad)}.`);
      m += kindsOk === PLATES.length ? 0.5 : kindsOk >= 3 ? 0.25 : 0;
      if (kindsOk < PLATES.length) notes.push('Describe the colonies on each plate: shiny, creamy and round (bacteria) or fluffy (fungi).');
    }
    if (w.lensAt !== null && w.breadAt !== null && w.lensAt - w.breadAt >= 3) {
      const ok = SLICES.filter((_, k) => w.bread[k] === mouldGrowthOf(mouldCover(v.micro, w, k, w.lensAt!))).length;
      m += ok === SLICES.length ? 0.5 : ok >= 2 ? 0.25 : 0;
      if (ok < SLICES.length) notes.push('Record the mould on each slice as you saw it.');
    } else notes.push('Examine the bread after 3–5 days in its bag.');
    auto.push(score(crit('readings'), half(m + 1e-9), notes));
  }

  // ---- presentation (3): % reduction (1), labels (1.5), rules (0.5)
  {
    const notes: string[] = [];
    let m = 0;
    const u = num(w.counts[2] ?? '');
    const c = num(w.counts[3] ?? '');
    const said = num(w.reduction);
    if (u && c !== null && said !== null && (withinAbs(said, ((u - c) / u) * 100, 0.15) || withinRel(said, ((u - c) / u) * 100, 0.01))) m += 1;
    else notes.push('% reduction = (unwashed − washed) ÷ unwashed × 100, from your own counts.');
    const right = labelsRight(MOULD_LABELS, w.labels);
    m += right === MOULD_LABELS.length ? 1.5 : right >= 4 ? 1 : right >= 2 ? 0.5 : 0;
    if (right < MOULD_LABELS.length) notes.push(`${right} of ${MOULD_LABELS.length} labels on Rhizopus are right: sporangium (with spores) on a sporangiophore, hyphae, a stolon and rhizoids.`);
    if (!w.slide) notes.push('Look at the teacher’s slide of the mould under the microscope.');
    const d = bioDrawingMarks(v.drawing, w.drawing);
    m += d.awarded / 4;
    if (d.wrong.length) notes.push(`Drawing rules: ${d.wrong.map((x) => `“${x.text}” is ${x.good ? 'good' : 'poor'} practice`).join('; ')}.`);
    auto.push(score(crit('presentation'), half(m + 1e-9), notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    const ctrlClean = days !== null && plateVisible(v.micro, w, 0, days, v.seed).length === 0;
    const evidence: Record<string, boolean> = {
      CONTROL: ctrlClean,
      HYGIENE: days !== null && plateVisible(v.micro, w, 3, days, v.seed).length < plateVisible(v.micro, w, 2, days, v.seed).length && wsh.touch === 'WASHED',
      AIR: days !== null && air.airMin > 0,
      CONDITIONS: comparison && w.lensAt !== null,
      FUNGUS: w.lensAt !== null || w.slide,
    };
    const m = claimsMark(w.claims, MICRO_NEED, MICRO_WRONG, MICRO_CLAIM_LABEL, 1, notes, (x) => !!evidence[x]);
    auto.push(score(crit('results'), Math.min(5, m), notes));
  }

  const model = microModelState(v);
  const mm = model.micro;
  const solution = [
    `After ${microIncDays(mm)} days at 30 °C: ${PLATES.map((r, k) => `${PLATE_LABEL[r].toLowerCase()} ${mm.counts[k]} colonies`).join('; ')}.`,
    `% reduction = (${mm.counts[2]} − ${mm.counts[3]}) ÷ ${mm.counts[2]} × 100 = ${mm.reduction} %.`,
    'The air plate shows shiny, creamy bacterial colonies and some fluffy fungal ones; the finger plates mostly bacteria; the unopened control nothing (the agar was sterile).',
    'Moist bread in the warm is covered in white cottony hyphae with black pin-head sporangia (Rhizopus, a fungus); dry bread grows none and cold bread very little.',
  ];
  const facts = [`Plates ${P.map((p) => `${p.label ?? '—'}/${p.airMin}min/${p.touch ?? '—'}/${p.tape ?? '—'}`).join(' | ')}; inverted ${w.inverted ? 'yes' : 'no'}, ${w.temp ?? '—'} °C, counted after ${days ?? '—'} d.`, `Bread ${w.slices.map((x) => `${x.moist === null ? '—' : x.moist ? 'moist' : 'dry'}/${x.place ?? '—'}`).join(', ')}; claims ${w.claims.join(', ') || '—'}.`];
  return { auto, ai: aiItems('MICROBE', s), solution, facts };
}

/**
 * Marks the dissection lab. EOSIN: the washed roots, the bright place, the
 * heights against the ruler, the sections and what they showed, the rate,
 * the labelled section and the conclusions. RAT: gloves and pinning, the
 * lifted cuts, a moist specimen, the seeker, the lengths against the ruler,
 * the labelled drawing, the ratio and the conclusions. MICROBE: the four
 * plates and their treatments, tape and incubation, the bread slices, the
 * counts against the plates, the reduction, the Rhizopus drawing and the
 * conclusions. Precautions and the explanation go to AI.
 */
export const bioDissectionGrader: SimulatorGrader<'bio-dissection'> = {
  id: 'bio-dissection',
  grade(state: BioDissectionState, seed: number): GraderOutput {
    const task = state.task ?? 'EOSIN';
    const v = bioDissectionVariant(seed, task);
    return task === 'RAT' ? gradeRat(state, v) : task === 'MICROBE' ? gradeMicro(state, v) : gradeEosin(state, v);
  },
};
