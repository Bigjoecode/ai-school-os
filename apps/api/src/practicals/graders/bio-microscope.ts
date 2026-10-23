import {
  BIO_MICROSCOPE,
  MICRO_MEDIUM_LABELS,
  MICRO_ORGANISM_PARTS,
  bioDrawingMarks,
  bioMicroscopeAnswers,
  bioMicroscopeVariant,
  microIdentityAnswer,
  microViewQuality,
  type BioMicroscopeState,
  type BioMicroscopeVariant,
  type CriterionScore,
  type MicroObjective,
} from '@aischool/shared';
import { parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => BIO_MICROSCOPE.rubric.find((c) => c.id === id)!;
const plain = (s: string) => s.replace(/[−–—]/g, '-').replace(/[⁻]/g, '-').replace(/²/g, '2').toLowerCase().replace(/\s+/g, '');

/** A length unit as written → µm per unit ('' when blank, null when not a length). */
export function micronsPer(unit: string): number | null | '' {
  const s = plain(unit).replace(/\./g, '');
  if (!s) return '';
  if (/^(µm|μm|um|micrometres?|micrometers?|microns?|micro)$/.test(s)) return 1;
  if (/^(mm|millimet(re|er)s?)$/.test(s)) return 1000;
  if (/^(cm|centimet(re|er)s?)$/.test(s)) return 10_000;
  if (/^(m|met(re|er)s?)$/.test(s)) return 1_000_000;
  if (/^(nm|nanomet(re|er)s?)$/.test(s)) return 0.001;
  return null;
}
/** "per mm²", "/mm2", "mm-2", "stomata per mm²" … */
export const isPerMm2 = (unit: string) => /^(per|\/)(1)?mm\^?2$|^mm\^?-2$/.test(plain(unit).replace(/\./g, '').replace(/^(stomata|number|no)/, ''));
/** A magnification as written: "400", "×400", "x 400", "400×", "400 times" → number. */
export function parseMag(raw: string): number | null {
  const s = raw.trim().replace(/^[×xX*]\s*/, '').replace(/\s*([×xX]|times)$/, '');
  return parseNumber(s);
}
/** The unit box of a magnification: blank or × only. */
const magUnitOk = (u: string) => /^\s*([×xX]|times)?\s*$/.test(u);

const SLIDE_OBS: Record<string, { guide: string; kw: string[][] }> = {
  ONION: { guide: 'Brick-shaped (rectangular) cells in rows, closely packed with no air spaces; a distinct cell wall; the nucleus stained brown by iodine, often at one side; a thin layer of cytoplasm stained yellow; a large central vacuole; no chloroplasts.', kw: [['rectangular', 'brick', 'oblong'], ['row', 'packed', 'no air space', 'no space'], ['cell wall', 'wall'], ['nucleus'], ['brown', 'yellow', 'stain'], ['vacuole'], ['no chloroplast']] },
  CHEEK: { guide: 'Flat, irregular or roughly polygonal cells, scattered singly or in small groups; a thin cell membrane; granular cytoplasm stained pale blue; a darker blue central nucleus; no cell wall, no large vacuole and no chloroplasts.', kw: [['irregular', 'flat', 'polygon', 'round', 'oval'], ['scatter', 'single', 'separate', 'group'], ['membrane'], ['nucleus', 'central'], ['blue'], ['no cell wall', 'no wall'], ['no vacuole', 'no chloroplast']] },
  PLASMOLYSED: { guide: 'The coloured (purple/red) protoplast has shrunk and pulled away from the cell wall; the vacuole is smaller and its sap darker; the space between the wall and the membrane holds the outside solution; the cell walls keep their shape.', kw: [['shrunk', 'shrink', 'pulled away', 'away from the wall', 'contract'], ['vacuole', 'sap'], ['darker', 'purple', 'red', 'colour', 'color'], ['space', 'gap'], ['wall', 'rigid', 'shape']] },
  TURGID: { guide: 'The coloured sap fills each cell and the protoplast presses against the wall (the cells are turgid); there is no plasmolysis because water is not a strong solution.', kw: [['fill', 'full', 'turgid', 'press'], ['no plasmolysis', 'not plasmolysed', 'normal'], ['purple', 'red', 'sap', 'colour', 'color']] },
  AMOEBA: { guide: 'An irregular shape that keeps changing; pseudopodia; granular cytoplasm with a nucleus, food vacuoles and a contractile vacuole; colourless; moves slowly by flowing (amoeboid movement).', kw: [['irregular', 'changing', 'no fixed shape'], ['pseudopod'], ['nucleus'], ['vacuole'], ['colourless', 'colorless', 'transparent', 'grey'], ['slow', 'flow', 'amoeboid']] },
  PARAMECIUM: { guide: 'Slipper-shaped; covered with beating cilia; an oral groove; a macronucleus and micronucleus; contractile vacuoles; colourless; swims fast, rotating.', kw: [['slipper'], ['cilia'], ['oral groove', 'groove'], ['nucleus', 'macronucleus'], ['contractile vacuole', 'vacuole'], ['fast', 'rapid', 'spin', 'rotat']] },
  EUGLENA: { guide: 'A spindle-shaped green cell; one long flagellum at the front; a red eyespot; many chloroplasts; a nucleus; swims with the flagellum and changes shape slightly.', kw: [['spindle', 'elongat'], ['green', 'chloroplast'], ['flagell'], ['eyespot', 'eye spot', 'red'], ['nucleus'], ['swim', 'move']] },
  SPIROGYRA: { guide: 'An unbranched filament of cylindrical cells joined end to end by cross walls; ribbon-shaped spiral chloroplasts with pyrenoids; a central nucleus held by strands of cytoplasm; green; does not move.', kw: [['filament', 'unbranched', 'chain'], ['cylindr', 'rectang'], ['spiral', 'ribbon', 'chloroplast'], ['pyrenoid'], ['nucleus'], ['green', 'cross wall']] },
  DICOT: { guide: 'A circular outline; a one-cell-thick epidermis; a cortex (collenchyma beneath the epidermis); vascular bundles arranged in a ring, each with xylem towards the centre (stained red) and phloem outside, separated by cambium; a large central pith.', kw: [['circular', 'round'], ['epidermis'], ['cortex', 'collenchyma'], ['ring', 'circle'], ['xylem', 'phloem', 'red'], ['cambium'], ['pith']] },
  MONOCOT: { guide: 'A circular outline; epidermis; a sclerenchyma hypodermis; many vascular bundles scattered through the ground tissue, more crowded near the outside, each with a sclerenchyma sheath (stained red); no cambium; no distinct pith or cortex.', kw: [['circular', 'round'], ['epidermis'], ['scatter'], ['sheath', 'sclerenchyma'], ['xylem', 'phloem', 'red'], ['no cambium'], ['no pith', 'no distinct', 'ground tissue']] },
  LEAF: { guide: 'Irregular, wavy-walled epidermal cells fitting closely together; stomata scattered between them, each a pore between two bean-shaped guard cells; the guard cells contain chloroplasts, the other epidermal cells do not; the number of stomata (the lower surface of a dicot leaf has many more than the upper).', kw: [['irregular', 'wavy', 'jigsaw'], ['pore', 'stoma', 'stomata'], ['guard cell', 'bean', 'kidney'], ['chloroplast'], ['scatter', 'many', 'few', 'more', 'fewer'], ['lower', 'upper']] },
};
const PRECAUTION_KW: string[][] = [['angle', 'bubble'], ['low power', 'lowest', 'low-power'], ['fine focus', 'fine adjustment', 'coarse'], ['thin', 'single layer', 'one layer'], ['dry', 'drying', 'evaporat'], ['lens tissue', 'clean'], ['excess', 'blot', 'filter paper'], ['diaphragm', 'light', 'mirror']];
const EXTRA_PRECAUTIONS: Record<string, { text: string; kw: string[] }> = {
  CHEEK: { text: 'use a sterile cotton bud on your own cheek only and put it in disinfectant afterwards', kw: ['disinfect', 'sterile', 'own cheek', 'discard', 'dispose'] },
  STEM: { text: 'cut sections away from the body with a wet razor blade and keep them in water', kw: ['razor', 'blade', 'wet', 'away from', 'brush'] },
  LEAF: { text: 'use a thin, colourless strip of epidermis without green mesophyll; count several fields and both surfaces', kw: ['strip', 'mesophyll', 'several field', 'both surface', 'average'] },
  POND: { text: 'use a cavity slide and cotton fibres to slow fast swimmers; do not let the drop dry', kw: ['cavity', 'cotton', 'gently'] },
  PLASMOLYSIS: { text: 'draw the salt solution under the cover slip with filter paper and leave it long enough', kw: ['irrigat', 'draw', 'leave', 'wait', 'minutes'] },
  ONION: { text: 'peel a single-cell layer and keep it flat without folds', kw: ['fold', 'flat', 'peel'] },
};

/**
 * Marks the light-microscope practical: slide preparation and microscope use
 * (from the recorded actions), focus and illumination of the captured views
 * (recomputed from the settings), identification and labels, the count or
 * graticule reading and the size worked out from it (consistent with the
 * student's own reading, and accuracy against the true value), magnification,
 * units and drawing practice. Observations and precautions go to AI.
 */
export const bioMicroscopeGrader: SimulatorGrader<'bio-microscope'> = {
  id: 'bio-microscope',
  grade(state: BioMicroscopeState, seed: number): GraderOutput {
    if (!state.slide) {
      const auto = BIO_MICROSCOPE.rubric.filter((c) => c.how === 'AUTO').map((c) => score(c, 0, ['No slide was prepared.']));
      const ai: AiItem[] = [
        { criterionId: 'observations', question: 'Describe what you observed under the microscope.', answer: state.written.observations.trim(), keywords: [['cell']], need: 3 },
        { criterionId: 'precautions', question: 'State two precautions you took.', answer: state.written.precautions.trim(), keywords: PRECAUTION_KW, need: 2 },
      ];
      return { auto, ai, solution: ['Choose the slide, prepare it, and use the microscope before handing in.'], facts: ['No slide was chosen.'] };
    }
    const v = bioMicroscopeVariant(seed, state.slide);
    return gradeWith(v, state);
  },
};

function gradeWith(v: BioMicroscopeVariant, state: BioMicroscopeState): GraderOutput {
  const info = v.info;
  const medium = state.prep.medium;
  const truth = bioMicroscopeAnswers(v);
  const auto: CriterionScore[] = [];
  const capAt = (o: MicroObjective) => state.captures.filter((c) => c.objective === o).at(-1) ?? null;

  // ---- procedure (4)
  {
    const n: string[] = [];
    let m = 0;
    if (medium && info.media.includes(medium)) m++;
    else n.push(medium ? `${MICRO_MEDIUM_LABELS[medium]} is not right for this slide: use ${info.media.map((x) => MICRO_MEDIUM_LABELS[x].toLowerCase()).join(' or ')}.` : 'Choose what to mount the specimen in.');
    if (state.prep.coverslip === 'ANGLE') m++;
    else n.push(state.prep.coverslip === 'DROP' ? 'Lower the cover slip at an angle with a mounted needle: dropping it flat traps air bubbles.' : 'Put a cover slip on the specimen, lowering it at an angle.');
    if (!state.prep.placed) n.push('The slide was never placed on the stage.');
    else {
      if (state.flags.focusedLow && !state.flags.highBeforeLow) m++;
      else n.push(state.flags.highBeforeLow ? 'Always find and focus the specimen at low power (×4 or ×10) before turning to ×40.' : 'Bring the specimen into focus at low power first.');
      if (state.flags.coarseAtHigh === 0 && !state.flags.crashed) m++;
      else n.push(state.flags.crashed ? 'The objective was driven into the cover slip: with ×40 use only the fine focus, and focus by moving the stage away from the lens.' : 'Use only the fine focus with the ×40 objective; the coarse focus can crush the slide.');
    }
    auto.push(score(crit('procedure'), m, n));
  }

  // ---- focus and illumination (3)
  const labelCap = capAt(info.labelObjective);
  const measureCap = capAt(info.measureObjective);
  {
    const n: string[] = [];
    let m = 0;
    const ql = labelCap ? microViewQuality(v, labelCap, medium) : null;
    const qm = measureCap ? microViewQuality(v, measureCap, medium) : null;
    if (ql?.sharp) m++;
    else n.push(labelCap ? `Your ×${info.labelObjective} view was out of focus: use the fine focus until the edges are sharp.` : `Capture a view at ×${info.labelObjective} for labelling.`);
    if (qm?.sharp) m++;
    else n.push(measureCap ? `Your ×${info.measureObjective} view was out of focus.` : `Capture a view at ×${info.measureObjective} for measuring.`);
    const qs = [ql, qm].filter((q): q is NonNullable<typeof q> => !!q);
    if (qs.length && qs.every((q) => q.lit && q.contrast)) m++;
    else if (qs.length) {
      const bad = qs.find((q) => !q.lit || !q.contrast)!;
      n.push(!bad.lit ? (bad.brightness < 0.3 ? 'The view was too dark: turn up the lamp or open the diaphragm.' : 'The view was too bright and washed out: turn down the lamp or close the diaphragm a little.') : 'This specimen is colourless: close the diaphragm partly to give enough contrast.');
    } else n.push('No views were captured.');
    auto.push(score(crit('image'), m, n));
  }

  // ---- identification and labels (4)
  {
    const n: string[] = [];
    let m = 0;
    const want = microIdentityAnswer(v, medium);
    if (state.identity === want) m++;
    else n.push(state.identity ? `${v.identity.question} — ${want}, not ${state.identity.toLowerCase()}.` : `Answer: ${v.identity.question}`);
    const right = v.targets.filter((t, i) => state.labels[i] === t.label);
    m += (3 * right.length) / v.targets.length;
    const wrong = v.targets.map((t, i) => ({ t, i, got: state.labels[i] })).filter((x) => x.got !== x.t.label);
    if (wrong.length) n.push(`Labels: ${wrong.map((x) => `${x.i + 1} is the ${x.t.label.toLowerCase()}${x.got ? ` (not ${x.got.toLowerCase()})` : ''}`).join('; ')}.`);
    auto.push(score(crit('labels'), m, n));
  }

  // ---- measurement (4)
  const ans = state.answers;
  const reading = parseNumber(ans.reading.value);
  const sizeRaw = parseNumber(ans.size.value);
  const per = micronsPer(ans.size.unit);
  const fovMo = v.fov[info.measureObjective] * 1000;
  const cal = v.calibration[info.measureObjective];
  const area = Math.PI * (v.fov[40] / 2) ** 2;
  const fromReading = (x: number) => (info.method === 'COUNT' ? fovMo / x : info.method === 'GRATICULE' ? x * cal : x / area);
  /** The student's size in µm (density as written), trying µm and mm when the unit is missing. */
  const sizeCandidates: number[] = sizeRaw === null ? [] : info.method === 'STOMATA' ? [sizeRaw] : typeof per === 'number' ? [sizeRaw * per] : per === '' ? [sizeRaw, sizeRaw * 1000] : [];
  {
    const n: string[] = [];
    let m = 0;
    const tol = info.method === 'GRATICULE' ? 1.5 : 1;
    const what = info.method === 'COUNT' ? 'cells across the field' : info.method === 'GRATICULE' ? 'eyepiece units' : 'stomata in the field';
    if (withinAbs(reading, v.trueReading, tol)) m += 2;
    else if (withinAbs(reading, v.trueReading, tol * 2)) {
      m += 1;
      n.push(`Your reading (${ans.reading.value}) is close; the specimen shows about ${sf(v.trueReading, 3)} ${what}.`);
    } else n.push(reading === null ? `Record the number of ${what}.` : `The specimen shows about ${sf(v.trueReading, 3)} ${what}, not ${ans.reading.value}.`);
    const own = reading !== null && reading > 0 ? fromReading(reading) : null;
    if (own !== null && sizeCandidates.some((s) => withinRel(s, own, 0.03))) m++;
    else if (sizeRaw === null) n.push(info.method === 'STOMATA' ? 'Work out the stomatal density.' : 'Work out the actual size.');
    else if (own !== null)
      n.push(
        info.method === 'COUNT'
          ? `From your count: size = field diameter ÷ number of cells = ${fovMo} µm ÷ ${ans.reading.value} = ${sf(own)} µm.`
          : info.method === 'GRATICULE'
            ? `From your reading: size = eyepiece units × calibration = ${ans.reading.value} × ${cal.toFixed(2)} µm = ${sf(own)} µm.`
            : `Density = count ÷ field area = ${ans.reading.value} ÷ ${sf(area, 3)} mm² = ${sf(own)} per mm².`,
      );
    if (sizeCandidates.some((s) => withinRel(s, v.trueSize, 0.15))) m++;
    else if (sizeRaw !== null) n.push(`The true ${info.method === 'STOMATA' ? `density is about ${sf(v.trueSize)} per mm²` : `size is about ${sf(v.trueSize)} µm`}.`);
    auto.push(score(crit('measurement'), m, n));
  }

  // ---- magnification (3)
  {
    const n: string[] = [];
    let m = 0;
    const tm = parseMag(ans.totalMag.value);
    if (tm !== null && withinAbs(tm, truth.totalMag, 0.01)) m++;
    else n.push(`Total magnification = eyepiece × objective = ${v.eyepiece} × ${info.labelObjective} = ×${truth.totalMag}.`);
    const dm = parseMag(ans.drawingMag.value);
    const actual = info.method === 'STOMATA' ? [v.drawnActual] : sizeCandidates.filter((s) => s > 0);
    const expected = actual.map((a) => (v.drawingLength * 1000) / a);
    if (dm !== null && (expected.some((e) => withinRel(dm, e, 0.03)) || withinRel(dm, truth.drawingMag, 0.05))) m += 2;
    else if (dm !== null && [...expected, truth.drawingMag].some((e) => [10, 100, 1000, 0.1, 0.01, 0.001].some((k) => withinRel(dm, e * k, 0.03)))) {
      m += 1;
      n.push('Put the drawing size and the actual size in the same units before dividing (1 mm = 1000 µm).');
    } else n.push(dm === null ? 'Work out the magnification of your drawing.' : `Drawing magnification = drawing size ÷ actual size = ${v.drawingLength} mm ÷ ${sf(info.method === 'STOMATA' ? v.drawnActual / 1000 : (actual[0] ?? v.trueSize) / 1000)} mm = ×${sf(expected[0] ?? truth.drawingMag)}.`);
    auto.push(score(crit('magnification'), m, n));
  }

  // ---- units (1)
  {
    const n: string[] = [];
    const any = [ans.reading, ans.size, ans.totalMag, ans.drawingMag].some((a) => a.value.trim());
    let ok = any;
    if (!any) n.push('No answers to check the units of.');
    if (ans.size.value.trim()) {
      if (info.method === 'STOMATA' ? !isPerMm2(ans.size.unit) : typeof per !== 'number') {
        ok = false;
        n.push(info.method === 'STOMATA' ? 'Stomatal density is a number per mm² (mm⁻²).' : 'Give the size with a length unit (µm or mm).');
      }
    }
    if (!magUnitOk(ans.totalMag.unit) || !magUnitOk(ans.drawingMag.unit) || (/[a-wyz]/i.test(ans.totalMag.value) && parseMag(ans.totalMag.value) === null) || (/[a-wyz]/i.test(ans.drawingMag.value) && parseMag(ans.drawingMag.value) === null)) {
      ok = false;
      n.push('A magnification has no unit: write it as a number or with ×.');
    }
    auto.push(score(crit('units'), ok ? 1 : 0, n));
  }

  // ---- drawing practice (2)
  {
    const d = bioDrawingMarks(v.drawing, state.drawing);
    auto.push(score(crit('drawing'), d.awarded, d.wrong.map((s) => (s.good ? `Good practice you missed: “${s.text}”` : `Poor practice: “${s.text}”`))));
  }

  // ---- written (AI)
  const obsKey = v.slide === 'PLASMOLYSIS' ? (medium === 'SALT' ? 'PLASMOLYSED' : 'TURGID') : v.slide === 'POND' ? v.organism! : v.slide === 'STEM' ? v.stemType! : v.slide;
  const obs = SLIDE_OBS[obsKey]!;
  const extra = EXTRA_PRECAUTIONS[v.slide];
  const seen = v.slide === 'POND' ? `a ${MICRO_ORGANISM_PARTS[v.organism!].name} in pond water` : v.slide === 'STEM' ? `a ${v.stemType === 'DICOT' ? 'dicot' : 'monocot'} stem section` : v.slide === 'LEAF' ? `a ${v.surface === 'LOWER' ? 'lower' : 'upper'}-surface leaf epidermis peel` : info.title.toLowerCase();
  const ai: AiItem[] = [
    {
      criterionId: 'observations',
      question: `State three observations of what you saw under the microscope. (The slide: ${seen}; mounted in ${medium ? MICRO_MEDIUM_LABELS[medium].toLowerCase() : 'nothing recorded'}.)`,
      answer: state.written.observations.trim(),
      guide: `1 mark for each correct observation, up to 3: ${obs.guide}`,
      keywords: obs.kw,
      need: 3,
    },
    {
      criterionId: 'precautions',
      question: `State two precautions you took in preparing and examining the slide (${info.title.toLowerCase()}).`,
      answer: state.written.precautions.trim(),
      guide: `1 mark each for two correct precautions. ${crit('precautions').guide}${extra ? ` For this slide also: ${extra.text}.` : ''}`,
      keywords: extra ? [...PRECAUTION_KW, extra.kw] : PRECAUTION_KW,
      need: 2,
    },
  ];

  const sizeText = info.method === 'STOMATA' ? `${sf(v.trueSize)} per mm²` : `${sf(v.trueSize)} µm (${sf(v.trueSize / 1000)} mm)`;
  const solution = [
    `Slide: ${info.title}. ${info.prepare} Mount in ${info.media.map((x) => MICRO_MEDIUM_LABELS[x].toLowerCase()).join(' or ')}; lower the cover slip at an angle.`,
    `Focus at ×4 with the coarse focus, then the fine focus; turn to ×${info.labelObjective} and use only the fine focus. Set the lamp and diaphragm for a bright view${info.coloured ? '' : ' (close the diaphragm a little for contrast if unstained)'}.`,
    `${v.identity.question} ${microIdentityAnswer(v, info.media[0]!)}. Labels: ${v.targets.map((t, i) => `${i + 1} ${t.label.toLowerCase()}`).join(', ')}.`,
    info.method === 'COUNT'
      ? `About ${sf(v.trueReading, 3)} cells span the ${v.fov[info.measureObjective]} mm (${fovMo} µm) field at ×${info.measureObjective}, so one cell ≈ ${fovMo} ÷ ${sf(v.trueReading, 3)} = ${sizeText}.`
      : info.method === 'GRATICULE'
        ? `The specimen spans ${sf(v.trueReading, 3)} eyepiece units (from ${v.object.startUnit} to ${sf(v.object.startUnit + v.trueReading, 3)}); size = ${sf(v.trueReading, 3)} × ${cal.toFixed(2)} µm = ${sizeText}.`
        : `${v.trueReading} stomata in a field of diameter ${v.fov[40]} mm; area = π × ${sf(v.fov[40] / 2, 3)}² = ${sf(area, 3)} mm²; density = ${v.trueReading} ÷ ${sf(area, 3)} = ${sizeText}.`,
    `Total magnification = ${v.eyepiece} × ${info.labelObjective} = ×${truth.totalMag}.`,
    `Drawing magnification = ${v.drawingLength} mm ÷ ${sf(v.drawnActual / 1000)} mm = ×${sf(truth.drawingMag)}.`,
    `Drawing practice: ${v.drawing.filter((s) => s.good).length} of the statements shown were good practice; avoid shading, arrowheads, sketchy lines and labels on the drawing.`,
  ];
  const facts = [
    `Slide ${info.title}; mounted in ${medium ? MICRO_MEDIUM_LABELS[medium] : 'nothing'}; cover slip ${state.prep.coverslip ?? 'none'}; captures at ${state.captures.map((c) => `×${c.objective}`).join(', ') || 'none'}.`,
    `Reading ${ans.reading.value || '—'} (true ${sf(v.trueReading, 3)}); size ${ans.size.value || '—'} ${ans.size.unit} (true ${sizeText}).`,
    `Magnifications: total ${ans.totalMag.value || '—'} (true ×${truth.totalMag}); drawing ${ans.drawingMag.value || '—'} (true ×${sf(truth.drawingMag)}).`,
  ];
  return { auto, ai, solution, facts };
}
