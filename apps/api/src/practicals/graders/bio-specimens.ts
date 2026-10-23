import { BIO_SPECIMENS, bioDrawingMarks, bioSpecimensVariant, specimenNameMatches, type BioSpecimensState, type CriterionScore } from '@aischool/shared';
import { parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => BIO_SPECIMENS.rubric.find((c) => c.id === id)!;

/** cm per unit of a length as written ('' when blank, null when not a length unit). */
export function cmPer(unit: string): number | null | '' {
  const s = unit.toLowerCase().replace(/[\s.]+/g, '');
  if (!s) return '';
  if (/^(cm|centimet(re|er)s?)$/.test(s)) return 1;
  if (/^(mm|millimet(re|er)s?)$/.test(s)) return 0.1;
  if (/^(m|met(re|er)s?)$/.test(s)) return 100;
  return null;
}
const parseMag = (raw: string) => parseNumber(raw.trim().replace(/^[×xX*]\s*/, '').replace(/\s*([×xX]|times)$/, ''));
const magUnitOk = (u: string) => /^\s*([×xX]|times)?\s*$/.test(u);

/**
 * Marks the specimen bench the way a WAEC Paper 3 scheme does: names (one
 * name, no hedging), classification, labels on the drawings, the ruler
 * measurement against the specimen and the drawing magnification from the
 * student's own measurement, units and drawing practice. Features, functions
 * and the comparison are written answers, returned for AI marking.
 */
export const bioSpecimensGrader: SimulatorGrader<'bio-specimens'> = {
  id: 'bio-specimens',
  grade(state: BioSpecimensState, seed: number): GraderOutput {
    if (!state.set) {
      const auto = BIO_SPECIMENS.rubric.filter((c) => c.how === 'AUTO').map((c) => score(c, 0, ['No specimens were examined.']));
      const ai: AiItem[] = ['features', 'functions', 'comparison'].map((id) => ({ criterionId: id, question: crit(id).label, answer: '', keywords: [], need: 1 }));
      return { auto, ai, solution: [], facts: ['No specimen set was chosen.'] };
    }
    const v = bioSpecimensVariant(seed, state.set);
    const sp = v.specimens;
    const entry = (i: number) => state.entries[i] ?? { name: '', classification: '', labels: [], features: '', functions: '' };
    const auto: CriterionScore[] = [];

    // ---- identification (5)
    {
      const wrong = sp.filter((_, i) => !specimenNameMatches(v, i, entry(i).name));
      auto.push(score(crit('identification'), (5 * (sp.length - wrong.length)) / sp.length, wrong.length ? [`${wrong.map((s) => `${s.letter} is ${s.def.name.toLowerCase()}${entry(sp.indexOf(s)).name.trim() ? ` (you wrote “${entry(sp.indexOf(s)).name.trim()}”)` : ''}`).join('; ')}.`] : []));
    }
    // ---- classification (4)
    {
      const wrong = sp.filter((s, i) => entry(i).classification !== s.classification);
      auto.push(score(crit('classification'), (4 * (sp.length - wrong.length)) / sp.length, wrong.length ? [`${v.info.classify.question}: ${wrong.map((s) => `${s.letter} — ${s.classification}`).join('; ')}.`] : []));
    }
    // ---- labels (4)
    {
      const parts = sp.flatMap((s, i) => s.def.parts.map((p, k) => ({ s, p, got: entry(i).labels[k] ?? '' })));
      const wrong = parts.filter((x) => x.got !== x.p.label);
      auto.push(score(crit('labels'), (4 * (parts.length - wrong.length)) / parts.length, wrong.length ? [`Labels: ${wrong.slice(0, 6).map((x) => `${x.s.letter}${x.s.def.parts.indexOf(x.p) + 1} is the ${x.p.label.toLowerCase()}`).join('; ')}${wrong.length > 6 ? ` and ${wrong.length - 6} more` : ''}.`] : []));
    }
    // ---- measurement and magnification (3), units (1)
    const m = sp[v.measured]!;
    const raw = parseNumber(state.measure.length.value);
    const per = cmPer(state.measure.length.unit);
    const lengthCm = raw === null ? null : raw * (typeof per === 'number' ? per : 1);
    {
      const n: string[] = [];
      let mk = 0;
      if (withinAbs(lengthCm, v.trueLength, v.lengthTol)) mk += 2;
      else if (withinAbs(lengthCm, v.trueLength, v.lengthTol * 2)) {
        mk += 1;
        n.push(`Close: specimen ${m.letter} is ${v.trueLength} cm long (line the zero of the ruler up with one end and read the other end).`);
      } else n.push(raw === null ? `Measure the ${m.def.lengthOf ?? 'length'} of specimen ${m.letter}.` : `Specimen ${m.letter} is ${v.trueLength} cm long, not ${state.measure.length.value} ${state.measure.length.unit}.`);
      const mag = parseMag(state.measure.magnification.value);
      const own = lengthCm !== null && lengthCm > 0 ? v.drawingLength / lengthCm : null;
      if (mag !== null && ((own !== null && withinRel(mag, own, 0.03)) || withinRel(mag, v.drawingLength / v.trueLength, 0.05))) mk++;
      else n.push(mag === null ? 'Work out the magnification of the drawing.' : `Magnification = drawing length ÷ actual length = ${v.drawingLength} cm ÷ ${lengthCm !== null && lengthCm > 0 ? sf(lengthCm, 3) : v.trueLength} cm = ×${sf(own ?? v.drawingLength / v.trueLength)}.`);
      auto.push(score(crit('measurement'), mk, n));

      const un: string[] = [];
      let ok = !!state.measure.length.value.trim() || !!state.measure.magnification.value.trim();
      if (!ok) un.push('No measurement to check the units of.');
      if (state.measure.length.value.trim() && typeof per !== 'number') {
        ok = false;
        un.push('Give the length with its unit (cm or mm).');
      }
      if (!magUnitOk(state.measure.magnification.unit) || (/[a-wyz]/i.test(state.measure.magnification.value) && parseMag(state.measure.magnification.value) === null)) {
        ok = false;
        un.push('A magnification has no unit: write it as a number or with ×.');
      }
      auto.push(score(crit('units'), ok ? 1 : 0, un));
    }
    // ---- drawing (2)
    {
      const d = bioDrawingMarks(v.drawing, state.drawing);
      auto.push(score(crit('drawing'), d.awarded, d.wrong.map((s) => (s.good ? `Good practice you missed: “${s.text}”` : `Poor practice: “${s.text}”`))));
    }

    // ---- written (AI)
    const listed = (key: 'features' | 'functions') => sp.map((s, i) => `${s.letter}: ${entry(i)[key].trim() || '—'}`).join('\n');
    const anyWritten = (key: 'features' | 'functions') => sp.some((_, i) => entry(i)[key].trim());
    const [a, b] = v.compare.map((i) => sp[i]!);
    const ai: AiItem[] = [
      {
        criterionId: 'features',
        question: `State two observable features of each specimen. ${sp.map((s) => `${s.letter} is ${s.def.name.toLowerCase()}`).join('; ')}.`,
        answer: anyWritten('features') ? listed('features') : '',
        guide: `Marks shared equally between the specimens; two correct observable features each for full marks. ${sp.map((s) => `${s.letter} (${s.def.name}): ${s.def.features}`).join(' ')}`,
        keywords: sp.map((s) => s.def.featureKw.flat()),
        need: sp.length,
      },
      {
        criterionId: 'functions',
        question: `State one function or adaptation of each specimen (linked to a structure). ${sp.map((s) => `${s.letter} is ${s.def.name.toLowerCase()}`).join('; ')}.`,
        answer: anyWritten('functions') ? listed('functions') : '',
        guide: `Marks shared equally between the specimens. ${sp.map((s) => `${s.letter} (${s.def.name}): ${s.def.functions}`).join(' ')}`,
        keywords: sp.map((s) => s.def.functionKw.flat()),
        need: sp.length,
      },
      {
        criterionId: 'comparison',
        question: `State two similarities and two differences between specimens ${a.letter} (${a.def.name.toLowerCase()}) and ${b.letter} (${b.def.name.toLowerCase()}).`,
        answer: state.compare.similarities.trim() || state.compare.differences.trim() ? `Similarities: ${state.compare.similarities.trim() || '—'}\nDifferences: ${state.compare.differences.trim() || '—'}` : '',
        guide: `1 mark per correct similarity (max 2) and per correct difference stating both sides (max 2). ${a.letter}: ${a.def.features} ${b.letter}: ${b.def.features} Both are ${v.info.classify.answers[a.id] === v.info.classify.answers[b.id] ? `classed as ${v.info.classify.answers[a.id]!.toLowerCase()}` : `different in ${v.info.classify.question.toLowerCase()} (${a.classification} / ${b.classification})`}.`,
        keywords: [['both', 'similar', 'same', 'alike'], [...a.def.featureKw.flat()], [...b.def.featureKw.flat()], ['whereas', 'while', 'but', 'unlike', 'instead']],
        need: 4,
      },
    ];

    const solution = [
      ...sp.map((s) => `${s.letter}: ${s.def.name} — ${v.info.classify.question.toLowerCase()}: ${s.classification}. Parts: ${s.def.parts.map((p, k) => `${k + 1} ${p.label.toLowerCase()}`).join(', ')}. Features: ${s.def.features} Function/adaptation: ${s.def.functions}`),
      `Compare ${a.letter} and ${b.letter} on what can be seen: shape, parts present or absent, colour, size and arrangement; state both sides of each difference.`,
      `Specimen ${m.letter} is ${v.trueLength} cm long; your drawing is ${v.drawingLength} cm, so the magnification = ${v.drawingLength} ÷ ${v.trueLength} = ×${sf(v.drawingLength / v.trueLength)}.`,
    ];
    const facts = [
      `Set: ${v.info.title}; specimens ${sp.map((s) => `${s.letter} ${s.def.name}`).join(', ')}.`,
      `Names written: ${sp.map((s, i) => `${s.letter} “${entry(i).name || '—'}”`).join(', ')}.`,
      `Measured ${m.letter}: ${state.measure.length.value || '—'} ${state.measure.length.unit} (true ${v.trueLength} cm); magnification ${state.measure.magnification.value || '—'} (true ×${sf(v.drawingLength / v.trueLength)}).`,
    ];
    return { auto, ai, solution, facts };
  },
};
