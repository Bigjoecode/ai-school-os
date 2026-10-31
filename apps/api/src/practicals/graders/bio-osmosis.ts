import {
  AGAR_CLAIM_LABEL,
  BIO_OSMOSIS,
  FIRMNESS_LABEL,
  PLAS_CLAIM_LABEL,
  PLAS_LABELS,
  PLAS_MEDIUM_CONC,
  PLAS_MIN_WAIT,
  PLAS_STAGES,
  PLAS_STAGE_LABEL,
  POTATO_MIN_SOAK,
  agarClearTime,
  agarCovered,
  agarDepth,
  agarModelState,
  agarSeenClear,
  agarSide,
  bioDrawingMarks,
  bioOsmosisVariant,
  lineXIntercept,
  parseRatio,
  phyFit,
  plasCaptureOf,
  plasCount,
  plasInferenceKey,
  plasModelState,
  plasParts,
  plasStageAt,
  plasStageIrrigation,
  potatoFirmness,
  potatoModelState,
  potatoPhase,
  potatoReading,
  potatoSoaked,
  potatoTruth,
  roundDp,
  type BioOsmosisState,
  type BioOsmosisVariant,
  type CriterionScore,
  type OsmoTask,
  type PlasStage,
  type PotatoPhase,
} from '@aischool/shared';
import { observationCredit } from './chem-qualitative';
import { decimalPlaces, parseNumber, score, withinAbs, withinRel } from './helpers';
import { gradeGraph } from './phy-common';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => BIO_OSMOSIS.rubric.find((c) => c.id === id)!;
const half = (x: number) => Math.floor(x * 2 + 1e-9) / 2;
const num = (raw: string) => parseNumber((raw ?? '').replace(/\s*(mm|g|cm|min|mins|minutes|%|cm2|cm²|cm3|cm³|mm\/min)$/i, '').trim());
const pctOk = (val: number | null, want: number) => val !== null && (withinAbs(val, want, 0.15) || withinRel(val, want, 0.02));
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

// ------------------------------------------------------------------ AI items

const AI: Record<OsmoTask, { precautions: { q: string; guide: string; kw: string[][] }; explain: { q: string; guide: string; kw: string[][] } }> = {
  POTATO: {
    precautions: {
      q: 'State two precautions you took in the experiment on osmosis in potato cylinders.',
      guide: '2 marks: one for each correct precaution — all cylinders cut from the same tuber with the same cork borer; trimmed to the same length; each blotted the same way before every weighing; fully immersed in equal volumes of solution; the same soaking time for all; read the ruler at eye level / avoid parallax; labelled beakers. A source of error or a vague statement (“be careful”) earns nothing.',
      kw: [['same tuber', 'same potato', 'one tuber', 'same borer'], ['blot'], ['same length', 'equal length', 'trim'], ['cover', 'immerse', 'submerge', 'same volume', 'equal volume'], ['same time', 'equal time', 'same period'], ['parallax', 'eye level', 'eye-level'], ['label']],
    },
    explain: {
      q: 'Explain why the cylinders in distilled water became longer, heavier and firm while those in the strongest solutions became shorter, lighter and soft, and what the concentration where the graph crosses 0 % shows.',
      guide: '2 marks: (1) in water or dilute solutions water enters the cells by osmosis through the partially (selectively) permeable membrane — from the higher water potential outside — so the cells become turgid; in strong solutions water leaves the cells by osmosis, so they become flaccid (plasmolysed); (1) where the line crosses 0 % the solution is isotonic with the cell sap: no net movement of water, so this estimates the concentration of the cell sap. Saying water moves “from low to high concentration of water” earns nothing for that point.',
      kw: [['osmosis'], ['water potential', 'partially permeable', 'selectively permeable', 'semi permeable', 'semipermeable', 'membrane'], ['turgid', 'flaccid'], ['isotonic', 'no net', 'cell sap', 'equal concentration', 'same concentration']],
    },
  },
  PLASMOLYSIS: {
    precautions: {
      q: 'State two precautions you took when observing plasmolysis in the epidermal cells.',
      guide: '2 marks: one for each correct precaution — a thin, single layer of epidermis; the solution drawn right under the cover slip with filter paper; enough time (5–10 minutes) before observing; the cover slip lowered at an angle to avoid air bubbles; low power first, then high power; the slide kept from drying out under the lamp. A vague statement earns nothing.',
      kw: [['thin', 'single layer', 'one layer'], ['filter paper', 'drawn under', 'draw under', 'irrigat'], ['wait', 'enough time', 'minutes', 'allow time'], ['air bubble', 'angle', 'mounted needle'], ['low power', 'lower power'], ['dry', 'evaporat', 'lamp']],
    },
    explain: {
      q: 'Explain what happened to the cells in the strong solution and then in water, and why the space between the cell wall and the cell membrane fills with the outside solution.',
      guide: '2 marks: (1) the strong solution has a lower water potential than the cell sap, so water leaves the vacuole by osmosis through the partially permeable cell membrane; the vacuole and cytoplasm shrink and pull away from the rigid wall (plasmolysis); in water, water re-enters and the cell becomes turgid again (deplasmolysis), the wall stopping it from bursting; (1) the cell wall is fully (freely) permeable, so the outside solution passes through it into the space. Saying the salt entered the cell, or that the wall shrank, earns nothing for that point.',
      kw: [['osmosis'], ['water potential', 'partially permeable', 'selectively permeable', 'semi permeable', 'membrane', 'concentrated', 'hypertonic'], ['fully permeable', 'freely permeable', 'permeable wall', 'wall is permeable', 'wall permeable'], ['deplasmolys', 'turgid again', 're enter', 'reenter', 'enters again', 'back into']],
    },
  },
  AGAR: {
    precautions: {
      q: 'State two precautions you took in the experiment with the agar cubes.',
      guide: '2 marks: one for each correct precaution — the cubes cut accurately to size; all put into the acid at the same moment; enough acid to cover every cube; the same acid concentration and temperature throughout; the cubes handled with forceps and eye protection worn; the colour judged against a white background. A vague statement earns nothing.',
      kw: [['accurate', 'exact', 'carefully cut', 'measure'], ['same time', 'same moment', 'together', 'at once', 'simultaneous'], ['cover', 'immerse', 'submerge'], ['same concentration', 'same acid', 'temperature'], ['forceps', 'goggles', 'eye'], ['white']],
    },
    explain: {
      q: 'Explain why the smallest cube became colourless first, and what this experiment shows about why large organisms need transport and gas-exchange systems.',
      guide: '2 marks: (1) the acid diffuses in from the surface at the same rate in every cube; the smallest cube has the largest surface area to volume ratio and the shortest distance from the surface to its centre, so the acid reaches all of it soonest; (1) a large organism has a small surface area to volume ratio, so diffusion through its surface alone is too slow to supply all its cells — it needs transport (circulatory) and gas-exchange systems. Calling the process osmosis earns nothing for that point.',
      kw: [['surface area', 'sa v', 'sa to volume', 'ratio'], ['distance', 'centre', 'center', 'shorter'], ['diffus'], ['transport', 'circulat', 'gas exchange', 'gaseous exchange', 'lungs', 'gills', 'blood']],
    },
  },
};
function aiItems(task: OsmoTask, s: BioOsmosisState): AiItem[] {
  const a = AI[task];
  return [
    { criterionId: 'precautions', question: a.precautions.q, answer: s.written.precautions.trim(), guide: a.precautions.guide, keywords: a.precautions.kw, need: 2 },
    { criterionId: 'explanation', question: a.explain.q, answer: s.written.explain.trim(), guide: a.explain.guide, keywords: a.explain.kw, need: 3 },
  ];
}

// ------------------------------------------------------------------ POTATO

function gradePotato(s: BioOsmosisState, v: BioOsmosisVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.potato;
  const pv = v.potato;
  const cyl = w.cyl.map((c, i) => ({ c, i, row: w.rows[i] ?? { l0: '', l1: '', m0: '', m1: '', pl: '', pm: '', firm: null }, done: potatoPhase(c) === 'A' }));
  const n = Math.max(cyl.length, 5);

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (cyl.length && cyl.every((x) => x.c.trimmed)) m += 0.5;
    else if (cyl.length) notes.push('Trim every cylinder to the same length (50 mm) on the tile before measuring it.');
    const concs = new Set(cyl.map((x) => x.c.conc));
    if (concs.size >= 5 && concs.has(0)) m += 0.5;
    else notes.push(`Use at least five solutions including distilled water as the control (you used ${concs.size}${concs.has(0) ? '' : ', with no distilled water'}).`);
    const iso = pv.iso;
    if ([...concs].some((c) => c < iso - 0.02) && [...concs].some((c) => c > iso + 0.02)) m += 0.5;
    else if (concs.size) notes.push('Choose solutions on both sides of the isotonic point: some cylinders must gain and some lose mass.');
    // The weighing each recorded mass comes from (the last one of that cylinder in that phase) must be blotted.
    const lastW = [...new Map(w.weighs.map((x) => [`${x.cyl}|${x.phase}`, x])).values()];
    const wet = lastW.filter((x) => !x.blotted).length;
    if (lastW.length && !wet) m += 1;
    else if (lastW.length) notes.push(`Blot each cylinder dry with filter paper before every weighing (${wet} weighing${wet === 1 ? ' was' : 's were'} not blotted): surface liquid adds to the mass.`);
    else notes.push('Weigh each cylinder before and after soaking (blotted dry first).');
    const placed = cyl.filter((x) => x.c.placedAt !== null);
    const sameIn = placed.length === cyl.length && placed.length > 0 && new Set(placed.map((x) => x.c.placedAt)).size === 1;
    const done = cyl.filter((x) => x.done);
    const sameOut = done.length === cyl.length && done.length > 0 && new Set(done.map((x) => x.c.removedAt)).size === 1;
    if (sameIn && sameOut) m += 0.5;
    else if (placed.length) notes.push('Put all the cylinders into their solutions at the same time and take them out together, so each soaks for the same time.');
    const short = done.filter((x) => potatoSoaked(x.c, w.clock) < POTATO_MIN_SOAK);
    if (done.length && !short.length) m += 0.5;
    else if (done.length) notes.push(`Soak the cylinders for at least ${POTATO_MIN_SOAK} minutes (better an hour): ${short.length} came out too soon.`);
    const has = (i: number, ph: PotatoPhase) => w.measures.some((x) => x.cyl === i && x.phase === ph) && w.weighs.some((x) => x.cyl === i && x.phase === ph);
    if (cyl.length && cyl.every((x) => has(x.i, 'B') && has(x.i, 'A'))) m += 0.5;
    else if (cyl.length) notes.push('Measure the length and weigh every cylinder both before and after soaking.');
    if (!cyl.length) notes.splice(0, notes.length, 'No cylinders were prepared.');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4): lengths to ±1 mm of the true length, masses as the balance showed them
  {
    const notes: string[] = [];
    let lenOk = 0;
    let massOk = 0;
    const badL: string[] = [];
    const badM: string[] = [];
    for (const x of cyl) {
      const t = potatoTruth(pv, x.i, x.c, w.clock);
      for (const ph of ['B', 'A'] as const) {
        if (ph === 'A' && !x.done) continue;
        const raw = ph === 'B' ? x.row.l0 : x.row.l1;
        const measured = w.measures.some((y) => y.cyl === x.i && y.phase === ph);
        const val = num(raw);
        if (measured && withinAbs(val, ph === 'B' ? t.L0 : t.L, 1)) lenOk++;
        else if (raw.trim()) badL.push(`${x.c.conc} M ${ph === 'B' ? 'initial' : 'final'}`);
        const mraw = ph === 'B' ? x.row.m0 : x.row.m1;
        const mval = num(mraw);
        const seen = w.weighs.filter((y) => y.cyl === x.i && y.phase === ph).map((y) => potatoReading(pv, x.i, x.c, w.clock, ph, y.blotted).mass);
        if (seen.some((r) => withinAbs(mval, r, 0.01)) && decimalPlaces(mraw.trim()) >= 2) massOk++;
        else if (mraw.trim()) badM.push(`${x.c.conc} M ${ph === 'B' ? 'initial' : 'final'}`);
      }
    }
    const denom = 2 * n;
    if (badL.length) notes.push(`Lengths not read correctly to the nearest millimetre: ${list(badL.slice(0, 4))}.`);
    if (badM.length) notes.push(`Masses not as the balance showed them (to 2 decimal places): ${list(badM.slice(0, 4))}.`);
    if (cyl.length < 5) notes.push('Readings are marked out of at least five cylinders.');
    auto.push(score(crit('readings'), half((2 * lenOk) / denom) + half((2 * massOk) / denom), notes));
  }

  // ---- presentation (3): graph of % change in mass against concentration
  const pts = cyl.map((x) => ({ x: x.c.conc, y: num(x.row.pm) })).filter((p): p is { x: number; y: number } => p.y !== null);
  const g = gradeGraph(pts, w.line, '% change in mass against concentration');
  {
    const notes: string[] = [];
    let m = 0;
    if (pts.length >= 5 && pts.some((p) => p.y > 0) && pts.some((p) => p.y < 0)) m += 1;
    else notes.push('Plot at least five points of % change in mass against concentration, with gains (+) and losses (−).');
    m += g.marks;
    notes.push(...g.notes);
    auto.push(score(crit('presentation'), m, notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let pmOk = 0;
    let plOk = 0;
    let firmOk = 0;
    const done = cyl.filter((x) => x.done);
    for (const x of done) {
      const l0 = num(x.row.l0);
      const l1 = num(x.row.l1);
      const m0 = num(x.row.m0);
      const m1 = num(x.row.m1);
      if (m0 && m1 !== null && pctOk(num(x.row.pm), ((m1 - m0) / m0) * 100)) pmOk++;
      if (l0 && l1 !== null && pctOk(num(x.row.pl), ((l1 - l0) / l0) * 100)) plOk++;
      if (x.row.firm === potatoFirmness(potatoTruth(pv, x.i, x.c, w.clock).pm)) firmOk++;
    }
    const d = Math.max(done.length, 5);
    if (pmOk < done.length) notes.push('% change in mass = (final − initial) ÷ initial × 100, from your own masses, with a minus sign for a loss.');
    if (plOk < done.length) notes.push('Work out the % change in length the same way.');
    if (firmOk < done.length) notes.push('Feel each cylinder after soaking and record it as firm (turgid), soft (flaccid) or about the same.');
    let m = half((1.5 * pmOk) / d) + half(plOk / d) + half(firmOk / d);
    const said = num(w.iso);
    const ownLine = lineXIntercept(w.line);
    const ownFit = g.fit && Math.abs(g.fit.slope) > 1e-9 ? -g.fit.intercept / g.fit.slope : null;
    const ownOk = said !== null && ((ownFit !== null && withinAbs(said, ownFit, 0.025)) || (g.lineOk && ownLine !== null && withinAbs(said, ownLine, 0.015)));
    if (ownOk) m += 1;
    else notes.push(said === null ? 'Read the isotonic concentration where your line crosses 0 % change.' : `Read the isotonic concentration where your line crosses the 0 % line${ownLine !== null ? ` (your line crosses at about ${roundDp(ownLine, 2)} mol/dm³)` : ''}.`);
    if (said !== null && withinAbs(said, pv.iso, 0.05)) m += 0.5;
    else if (said !== null) notes.push('Your isotonic concentration is far from the true value: check the readings and the line.');
    auto.push(score(crit('results'), m, notes));
  }

  const model = potatoModelState(v);
  const solution = [
    `The cell sap of this potato is isotonic with about ${pv.iso.toFixed(2)} mol/dm³ sucrose: below it the cylinders gain water by osmosis, above it they lose water.`,
    ...model.potato.cyl.map((c, i) => {
      const r = model.potato.rows[i]!;
      return `${c.conc.toFixed(1)} mol/dm³ (${c.conc === 0 ? 'distilled water, the control' : 'sucrose'}): ${r.l0} → ${r.l1} mm, ${r.m0} → ${r.m1} g, % change in mass = (${r.m1} − ${r.m0}) ÷ ${r.m0} × 100 = ${r.pm} %; ${FIRMNESS_LABEL[r.firm ?? 'SAME'].toLowerCase()}.`;
    }),
    `The best line of % change in mass against concentration crosses 0 % at about ${model.potato.iso} mol/dm³ — the isotonic concentration (the concentration of the cell sap).`,
    'After 60 min the cylinders are near equilibrium; a shorter soak gives smaller changes but the same crossing point.',
  ];
  const facts = [`${cyl.length} cylinders (${cyl.map((x) => x.c.conc).join(', ')} mol/dm³); ${w.weighs.filter((x) => !x.blotted).length} weighings not blotted; soak ${cyl.length ? potatoSoaked(cyl[0]!.c, w.clock) : 0} min.`, `Isotonic read: ${w.iso || '—'} (true ${pv.iso.toFixed(2)}).`];
  return { auto, ai: aiItems('POTATO', s), solution, facts };
}

// ------------------------------------------------------------------ PLASMOLYSIS

function gradePlas(s: BioOsmosisState, v: BioOsmosisVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.plas;
  const pv = v.plas;
  const strongCap = plasCaptureOf(w, 'STRONG', 40);
  const capAt = (st: PlasStage) => {
    const i = plasCaptureOf(w, st);
    return i < 0 ? null : w.captures[i]!.at;
  };

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.mount === 'WATER' && w.coverslip) m += 0.5;
    else notes.push(w.mount && w.mount !== 'WATER' ? 'Mount the epidermis in water first, so you see the turgid cells before the strong solution.' : 'Mount the strip of epidermis in a drop of water under a cover slip.');
    const first40 = w.captures.findIndex((c) => c.objective === 40);
    const first10 = w.captures.findIndex((c) => c.objective === 10);
    if (first10 >= 0 && (first40 < 0 || first10 < first40)) m += 0.5;
    else notes.push('Look under low power (×10) first, then high power (×40).');
    const strong = w.irrigations.filter((x) => PLAS_MEDIUM_CONC[x.to] > 0.3);
    if (strong.length && strong.every((x) => x.drawn)) m += 1;
    else notes.push(strong.length ? 'Draw the strong solution right under the cover slip with filter paper at the opposite edge — a drop at the edge barely mixes in.' : 'Replace the water with a strong salt or sucrose solution, drawn under the cover slip with filter paper.');
    const sAt = capAt('STRONG');
    const sIrr = sAt === null ? null : plasStageIrrigation(w, 'STRONG', sAt);
    if (sAt !== null && sIrr && sAt - sIrr.at >= PLAS_MIN_WAIT) m += 1;
    else if (sAt !== null) notes.push(`Wait at least ${PLAS_MIN_WAIT} minutes in the strong solution before you record and count.`);
    else if (strong.length) notes.push('Record the view in the strong solution.');
    const bAt = capAt('BACK');
    const bIrr = bAt === null ? null : plasStageIrrigation(w, 'BACK', bAt);
    if (bAt !== null && bIrr && bIrr.drawn && bAt - bIrr.at >= PLAS_MIN_WAIT) m += 1;
    else notes.push('Finally draw water back under the cover slip and look again after at least 5 minutes (deplasmolysis).');
    if (!w.peeled) notes.splice(0, notes.length, 'No epidermis was prepared.');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4): the count at high power in the strong solution
  const truth = strongCap >= 0 ? plasCount(pv, w, w.captures[strongCap]!.at) : null;
  {
    const notes: string[] = [];
    let m = 0;
    const tot = num(w.count.total);
    const pl = num(w.count.plasmolysed);
    if (!truth) notes.push('Record a view at ×40 in the strong solution and count its cells.');
    else {
      const tol = (x: number) => Math.max(1, Math.round(0.08 * x));
      if (tot !== null && withinAbs(tot, truth.total, tol(truth.total))) m += 1.5;
      else notes.push(`Count every cell with its centre inside the field (there were ${truth.total}).`);
      if (pl !== null && withinAbs(pl, truth.plasmolysed, tol(truth.plasmolysed))) m += 1.5;
      else notes.push(`Count the cells whose cytoplasm has pulled away from the wall (there were ${truth.plasmolysed}).`);
    }
    if (tot && pl !== null && pctOk(num(w.count.pct), (pl / tot) * 100)) m += 1;
    else if (w.count.pct.trim() || truth) notes.push('% plasmolysed = plasmolysed cells ÷ cells counted × 100, from your own counts.');
    auto.push(score(crit('readings'), m, notes));
  }

  // ---- presentation (3): labels (2), drawing rules (1)
  {
    const notes: string[] = [];
    const right = PLAS_LABELS.filter((l, i) => (w.labels[i] ?? '') === l).length;
    let m = right === PLAS_LABELS.length ? 2 : right >= 4 ? 1 : 0;
    if (right < PLAS_LABELS.length) notes.push(`${right} of ${PLAS_LABELS.length} labels are right. The space between the wall and the shrunken cytoplasm holds the external solution; the wall keeps its shape.`);
    const d = bioDrawingMarks(v.drawing, w.drawing);
    m += d.awarded / 2;
    if (d.wrong.length) notes.push(`Drawing rules: ${d.wrong.map((x) => `“${x.text}” is ${x.good ? 'good' : 'poor'} practice`).join('; ')}.`);
    auto.push(score(crit('presentation'), m, notes));
  }

  // ---- results (5): observations (3) and inferences (2), one row per stage
  {
    const notes: string[] = [];
    let obs = 0;
    let inf = 0;
    PLAS_STAGES.forEach((st, k) => {
      const at = capAt(st);
      const row = w.rows[k] ?? { observation: '', claims: [] };
      if (at === null) {
        notes.push(`${PLAS_STAGE_LABEL[st]}: no view recorded.`);
        return;
      }
      const parts = plasParts(pv, w, st, at);
      const o = observationCredit(row.observation, parts);
      obs += o.credit;
      if (o.credit < 1) notes.push(`${PLAS_STAGE_LABEL[st]}: you should have seen ${parts.map((p) => p.text).join('; ')}.`);
      const key = plasInferenceKey(pv, w, st, at);
      const bad = row.claims.filter((c) => !key.allow.includes(c));
      if (!row.claims.length) notes.push(`${PLAS_STAGE_LABEL[st]}: no inference.`);
      else if (bad.length) notes.push(`${PLAS_STAGE_LABEL[st]}: ${bad.includes('WALL_SHRANK') ? 'the cell wall is rigid and keeps its shape' : bad.includes('SALT_ENTERED') ? 'water leaves the cell; the salt does not enter and shrink it' : `the view does not show “${list(bad.map((c) => PLAS_CLAIM_LABEL[c].toLowerCase()))}”`}.`);
      else if (key.need.every((c) => row.claims.includes(c))) inf += 1;
      else inf += 0.5;
    });
    auto.push(score(crit('results'), half(obs) + half((inf * 2) / 3), notes));
  }

  const model = plasModelState(v);
  const mc = model.plas.count;
  const solution = [
    'In water the coloured sap fills each cell and the cytoplasm is pressed against the wall: the cells are turgid.',
    `In 1.0 mol/dm³ sucrose (or strong salt) drawn under the cover slip, water leaves the vacuoles by osmosis: after 10 minutes about ${mc.plasmolysed} of the ${mc.total} cells in the ×40 field (${mc.pct} %) had the cytoplasm pulled away from the wall — plasmolysis. Damaged cells (colourless) do not respond.`,
    'The wall keeps its shape; the space between it and the membrane fills with the outside solution, because the wall is fully permeable.',
    'Back in water, water re-enters by osmosis and the cells become turgid again (deplasmolysis) within about 10 minutes.',
    `This epidermis’s cells start to plasmolyse at about ${pv.meanC.toFixed(2)} mol/dm³ sucrose — roughly isotonic with their sap.`,
  ];
  const facts = [`Mounted in ${w.mount ?? '—'}; ${w.irrigations.length} irrigations (${w.irrigations.filter((x) => !x.drawn).length} not drawn under); ${w.captures.length} views recorded.`, `Count: ${w.count.plasmolysed || '—'} of ${w.count.total || '—'} (true ${truth ? `${truth.plasmolysed} of ${truth.total}` : '—'}).`, ...w.captures.map((c) => `View at ${c.at} min ×${c.objective}: ${plasStageAt(w, c.at)}.`).slice(0, 4)];
  return { auto, ai: aiItems('PLASMOLYSIS', s), solution, facts };
}

// ------------------------------------------------------------------ AGAR

function gradeAgar(s: BioOsmosisState, v: BioOsmosisVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.agar;
  const av = v.agar;
  const cubes = w.cubes.map((c, i) => ({ c, i, row: w.rows[i] ?? { side: '', sa: '', vol: '', ratio: '', time: '' } }));
  const timed = cubes.filter((x) => x.c.cutAt === null && x.c.placedAt !== null);
  const n = Math.max(cubes.length, 3);

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    const sizes = new Set(cubes.map((x) => x.c.size));
    if (sizes.size >= 3) m += 1;
    else notes.push(`Cut cubes of at least three sizes (e.g. 1, 2 and 3 cm); you used ${sizes.size}.`);
    const placed = cubes.filter((x) => x.c.placedAt !== null);
    if (placed.length === cubes.length && placed.length > 0 && new Set(placed.map((x) => x.c.placedAt)).size === 1) m += 1;
    else if (placed.length) notes.push('Put all the cubes into the acid at the same moment.');
    if (w.acid && cubes.length && cubes.every((x) => agarCovered(w, x.c))) m += 1;
    else if (w.acid) notes.push('Pour in enough acid to cover every cube completely: an uncovered top is reached later.');
    const cut = cubes.find((x) => x.c.cutAt !== null && w.depthMeasured.includes(x.i));
    if (cut) m += 1;
    else notes.push('Take a spare cube out after a few minutes, cut it in half and measure the depth of the colourless zone.');
    if (!cubes.length) notes.splice(0, notes.length, 'No cubes were cut.');
    auto.push(score(crit('procedure'), m, notes));
  }

  // ---- readings (4): sides (1), times from own watching (2), depth (1)
  {
    const notes: string[] = [];
    let m = 0;
    const sideOk = cubes.filter((x) => w.measured.includes(x.i) && withinAbs(num(x.row.side), agarSide(av, x.i, x.c) / 10, 0.1)).length;
    m += half(sideOk / n);
    if (sideOk < cubes.length) notes.push('Measure each cube’s side with the ruler (to the nearest mm) and write it in cm.');
    const seen = timed.map((x) => ({ x, t: agarSeenClear(av, x.i, w) }));
    const timeOk = seen.filter(({ x, t }) => {
      const val = num(x.row.time);
      return t !== null ? withinAbs(val, t - (x.c.placedAt ?? 0), 0.5) : false;
    }).length;
    const notYet = seen.filter((y) => y.t === null).length;
    m += half((2 * timeOk) / Math.max(timed.length, 3));
    if (notYet) notes.push(`${notYet} cube${notYet === 1 ? ' was' : 's were'} not watched until colourless.`);
    else if (timeOk < timed.length) notes.push('Write the time when each cube first looked completely colourless, from the stopwatch.');
    const d = w.depth.cube !== null ? cubes[w.depth.cube] : undefined;
    if (d && d.c.cutAt !== null && w.depthMeasured.includes(d.i) && withinAbs(num(w.depth.depth), agarDepth(av, d.i, d.c, d.c.cutAt), 1)) m += 1;
    else notes.push('Measure the depth of the colourless zone of the cut cube with the ruler (mm).');
    auto.push(score(crit('readings'), m, notes));
  }

  // ---- presentation (3): SA, V, SA : V from own sides
  {
    const notes: string[] = [];
    let sa = 0;
    let vol = 0;
    let ratio = 0;
    for (const x of cubes) {
      const side = num(x.row.side);
      if (side === null || side <= 0) continue;
      if (withinRel(num(x.row.sa), 6 * side * side, 0.02)) sa++;
      if (withinRel(num(x.row.vol), side ** 3, 0.02)) vol++;
      const r = parseRatio(x.row.ratio);
      if (r !== null && (withinRel(r, 6 / side, 0.03) || withinAbs(r, 6 / side, 0.05))) ratio++;
    }
    if (sa < cubes.length) notes.push('Surface area = 6 × side² (cm²), from your measured side.');
    if (vol < cubes.length) notes.push('Volume = side³ (cm³).');
    if (ratio < cubes.length) notes.push('SA : V = surface area ÷ volume, written as e.g. 3 : 1.');
    auto.push(score(crit('presentation'), half(sa / n) + half(vol / n) + half(ratio / n), notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    const dep = num(w.depth.depth);
    const tm = num(w.depth.time);
    const rate = num(w.depth.rate);
    if (dep !== null && tm && rate !== null && rate > 0 && (withinRel(rate, dep / tm, 0.03) || withinAbs(rate, dep / tm, 0.02))) m += 1;
    else notes.push('Rate of diffusion = depth of the colourless zone ÷ time in the acid (mm per min).');
    const d = w.depth.cube !== null ? cubes[w.depth.cube] : undefined;
    const sideMm = d ? (num(d.row.side) ?? 0) * 10 : 0;
    const pct = num(w.depth.pct);
    if (d && dep !== null && sideMm > 0 && pct !== null && withinAbs(pct, (1 - Math.max(0, (sideMm - 2 * dep) / sideMm) ** 3) * 100, 2)) m += 1;
    else notes.push('% of the cut cube colourless = (1 − ((side − 2 × depth) ÷ side)³) × 100.');
    const clear = timed.map((x) => ({ i: x.i, t: agarClearTime(av, x.i, x.c, w) }));
    const firstTrue = clear.length ? clear.reduce((a, b) => (b.t < a.t ? b : a)).i : null;
    if (w.first !== null && firstTrue !== null && (w.first === firstTrue || cubes[w.first]?.c.size === cubes[firstTrue]?.c.size)) m += 1;
    else notes.push('Name the cube that became colourless first (the smallest).');
    const wrong = w.claims.filter((c) => c === 'LARGE_FIRST' || c === 'LARGE_RATIO' || c === 'OSMOSIS');
    let c = (w.claims.includes('RATIO_FASTER') ? 1 : 0) + (w.claims.includes('SAME_DEPTH') ? 1 : 0) - wrong.length;
    c = Math.max(0, c);
    m += c;
    if (wrong.length) notes.push(`Not true: ${list(wrong.map((x) => `“${AGAR_CLAIM_LABEL[x]}”`))}.`);
    if (!w.claims.includes('RATIO_FASTER') || !w.claims.includes('SAME_DEPTH')) notes.push('Conclude: the acid diffuses in to the same depth in every cube in a given time, so the cubes with the larger SA : V are reached all through sooner.');
    auto.push(score(crit('results'), m, notes));
  }

  const model = agarModelState(v);
  const solution = [
    `The acid front moved in about ${av.k.toFixed(2)} mm × √(minutes): ${roundDp(av.k * Math.sqrt(5), 1)} mm after 5 min, ${roundDp(av.k * Math.sqrt(20), 1)} mm after 20 min — the depth grows as the square root of the time.`,
    ...model.agar.cubes.map((c, i) => {
      const r = model.agar.rows[i]!;
      return c.cutAt !== null ? `Spare ${c.size} cm cube, cut open at ${c.cutAt} min: colourless to a depth of ${model.agar.depth.depth} mm; rate = ${model.agar.depth.depth} ÷ ${c.cutAt} = ${model.agar.depth.rate} mm/min; ${model.agar.depth.pct} % of it was colourless.` : `${r.side} cm cube: SA = 6 × ${r.side}² = ${r.sa} cm², V = ${r.vol} cm³, SA : V = ${r.ratio}; colourless after about ${r.time} min.`;
    }),
    'The 1 cm cube (largest SA : V, 6 : 1) was colourless first. Doubling the side quadruples the time, because the acid must diffuse twice as far and depth ∝ √t.',
  ];
  const facts = [`${cubes.length} cubes (${cubes.map((x) => `${x.c.size} cm${x.c.cutAt !== null ? ' cut' : ''}`).join(', ')}); acid ${w.acid ?? '—'}; clock ${w.clock} min.`, `Times: ${timed.map((x) => `${x.c.size} cm ${x.row.time || '—'} (seen ${agarSeenClear(av, x.i, w) ?? '—'})`).join('; ')}.`];
  return { auto, ai: aiItems('AGAR', s), solution, facts };
}

/**
 * Marks the osmosis lab the way a WAEC biology scheme does. POTATO: the set-up
 * (trimmed, a range with a control, blotted, soaked together), lengths and
 * masses against the ruler and balance, % changes from the student's own
 * readings, the graph and the isotonic point read from it. PLASMOLYSIS:
 * mounting, low then high power, irrigation with filter paper, waiting, the
 * count against the cells in the recorded field, the labelled drawing and the
 * three stages' observations and inferences. AGAR: sizes, timing, the depth,
 * SA : V from own sides and the conclusion. Precautions and the explanation
 * go to AI.
 */
export const bioOsmosisGrader: SimulatorGrader<'bio-osmosis'> = {
  id: 'bio-osmosis',
  grade(state: BioOsmosisState, seed: number): GraderOutput {
    const task = state.task ?? 'POTATO';
    const v = bioOsmosisVariant(seed, task);
    return task === 'PLASMOLYSIS' ? gradePlas(state, v) : task === 'AGAR' ? gradeAgar(state, v) : gradePotato(state, v);
  },
};
