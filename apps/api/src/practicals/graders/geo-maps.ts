import { GEO_MAPS, GEO_WRITTEN, geoFieldOk, geoMapsVariant, type CriterionScore, type GeoCrit, type GeoMapsState, type GeoTask } from '@aischool/shared';
import { score } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

/**
 * Geo-maps grader: everything is recomputed from the seed (the height function,
 * the sheet, the data). Answers are compared with the sheet within the
 * instrument's tolerance, calculations are marked from the student's own
 * readings, and each construction mark is earned from the student's own tool
 * records. The mark scheme lives with the task (shared), so the lab's steps,
 * its pre-hand-in check and the marks can never disagree.
 */

const GENERAL_PRECAUTION = 'a sharp pencil; the ruler read straight on with zero on the point; consistent units; measuring from the point stated; a scale that uses most of the paper; neat, labelled work.';
const MAP_KW = [['sharp', 'pencil'], ['ruler', 'zero', 'straight'], ['unit', 'convert', 'metre', 'km'], ['point stated', 'exact point', 'centre', 'from the point'], ['fold', 'careful', 'neat', 'flat'], ['scale'], ['parallax', 'directly above', 'eye']];
const CHART_KW = [['sharp', 'pencil'], ['scale', 'paper'], ['zero', 'origin'], ['label', 'title', 'key', 'unit'], ['accurate', 'exact', 'protractor', 'compass', 'ruler'], ['check', 'total', 'add up', '360']];
const AI: Record<GeoTask, { guide: string; kw: string[][] }> = {
  SCALE: { guide: '2 marks: (1) both sides of an RF are in the same unit, so it works in any unit and has none; (1) a smaller denominator means each map centimetre covers less ground, so features are drawn larger and in more detail.', kw: [['same unit', 'any unit', 'no unit'], ['less ground', 'smaller area', 'more detail', 'larger', 'detail']] },
  DISTANCE: { guide: '2 marks: (1) the road bends, so its length exceeds the straight line (sinuosity above 1); (1) roads bend to follow gentle ground, join settlements, cross rivers at bridges or avoid steep slopes.', kw: [['bend', 'curve', 'winding', 'sinuosity'], ['steep', 'gentle', 'river', 'bridge', 'settlement', 'relief', 'avoid']] },
  BEARING: { guide: '2 marks: (1) a compass direction covers a wide sector (22.5° on 16 points), while a bearing gives the exact angle clockwise from north; (1) the reverse direction points the opposite way, half a circle round.', kw: [['exact', 'precise', 'accurate', 'sector'], ['opposite', 'reverse', 'half', '180']] },
  GRIDAREA: { guide: '2 marks: (1) on average a part square is about half covered, some more and some less, so they balance; (1) the edge is irregular, so the count approximates; smaller squares would give a better estimate.', kw: [['half', 'average', 'balance'], ['estimate', 'irregular', 'approximate', 'smaller square']] },
  REDUCE: { guide: '2 marks: (1) area is length × width and both are multiplied by the factor, so area changes by its square; (1) a reduced map is more crowded, so fine detail must be simplified or left out.', kw: [['length', 'width', 'both', 'square'], ['detail', 'crowd', 'simplif', 'omit', 'left out']] },
  RELIEF: { guide: '2 marks: (1) both show a V: in a valley it points uphill, on a spur it points downhill, shown by the contour values; (1) close contours mean a steep slope, wide spacing a gentle one.', kw: [['uphill', 'upstream', 'higher'], ['downhill', 'lower'], ['close', 'steep', 'spacing']] },
  GRADIENT: { guide: '2 marks: (1) gradient is a ratio, so the units must match or it is wrong by a factor; (1) closer contours mean a steeper gradient, because more height is gained over less distance.', kw: [['same unit', 'ratio', 'metres', 'unit'], ['close', 'steeper', 'spacing', 'closer']] },
  PROFILE: { guide: '2 marks: (1) at the true scale relief would look almost flat, so the vertical is stretched to show it; (1) a straight line joins the two points; if the ground rises above it, they cannot see each other.', kw: [['flat', 'show', 'stretch', 'exaggerat', 'relief'], ['line of sight', 'straight line', 'block', 'above', 'rises']] },
  DRAINAGE: { guide: '2 marks: (1) the pattern is named with evidence from how the tributaries join or run; (1) it is linked to relief or rock: dendritic on uniform rock, trellis on alternating hard and soft bands, radial from a central hill, parallel on a uniform slope.', kw: [['dendritic', 'trellis', 'radial', 'parallel'], ['rock', 'slope', 'hill', 'uniform', 'band', 'relief']] },
  SETTLE: { guide: '2 marks: (1) lowlands are gentle, with fertile soil, water and easy building and transport; (1) uplands are steep, hard to farm or reach, so settlements are few and scattered.', kw: [['gentle', 'flat', 'lowland', 'fertile', 'water', 'river'], ['steep', 'upland', 'difficult', 'hard', 'few', 'access']] },
  GIS: { guide: '2 marks: (1) raster stores a grid of cells; vector stores points, lines and polygons with attributes; (1) a GIS also needs hardware, data, procedures and people, not only software.', kw: [['cell', 'grid', 'pixel'], ['point', 'line', 'polygon'], ['people', 'procedure', 'hardware', 'data']] },
  BARS: { guide: '2 marks: (1) a line suits a continuous series over time; bars suit discrete categories; (1) bar heights compare totals, so a false zero exaggerates the differences.', kw: [['continuous', 'time', 'trend'], ['discrete', 'categor', 'separate'], ['zero', 'exaggerat', 'mislead']] },
  PIE: { guide: '2 marks: (1) the eye compares circle areas, and area depends on the radius squared; (1) a radius equal to the value would exaggerate large values, so radius ∝ √value.', kw: [['area'], ['radius', 'square', 'root'], ['exaggerat', 'large']] },
  DOTS: { guide: '2 marks: (1) a density map gives one value for a whole region, hiding uneven distribution; dots show where people really are; (1) an isopleth joins equal values, so two different values cannot meet at one point.', kw: [['distribution', 'uneven', 'where', 'whole region', 'average'], ['equal', 'same value', 'one value', 'cross']] },
  FLOW: { guide: '2 marks: (1) width shows the volume at a glance, and arrows the direction; (1) the map shows where the routes run, so busy routes needing repair or widening stand out.', kw: [['width', 'thick', 'volume', 'quantity', 'at a glance'], ['route', 'where', 'plan', 'repair', 'busy', 'widen']] },
  CLIMATE: { guide: '2 marks: (1) the rains follow the overhead sun and the moist monsoon air, giving peaks with a short break; the dry season comes with the dry harmattan; (1) the sun stays high all year near the equator, so the range is small.', kw: [['monsoon', 'overhead sun', 'harmattan', 'moist', 'trade wind', 'itcz', 'season'], ['equator', 'latitude', 'high sun', 'small range', 'sun']] },
  CLIMTYPE: { guide: '2 marks: (1) temperature figures quoted (mean and range) and what they show; (1) rainfall total and its season quoted, and linked to the climate type and hemisphere.', kw: [['range', 'mean', 'temperature', '°c'], ['rainfall', 'total', 'dry', 'wet', 'rain', 'season']] },
  POPULATION: { guide: '2 marks: (1) a wide base means many births; a narrow top means fewer people reach old age; (1) a large share of children means many dependants on each worker, with pressure on schools and health care.', kw: [['birth', 'wide base', 'young', 'children'], ['depend', 'worker', 'school', 'health', 'death']] },
  LONGTIME: { guide: '2 marks: (1) the earth rotates from west to east, so the sun reaches the east first; (1) it turns 360° in 24 hours, which is 15° an hour.', kw: [['west to east', 'rotat', 'sun', 'east first'], ['360', '24', '15', 'hour']] },
};

const CHART_TASKS: GeoTask[] = ['BARS', 'PIE', 'DOTS', 'FLOW', 'CLIMATE', 'CLIMTYPE', 'POPULATION'];
const half = (x: number) => Math.floor(x * 2 + 1e-6) / 2;

function grade(s: GeoMapsState, seed: number): GraderOutput {
  const task: GeoTask = s.task ?? 'DISTANCE';
  const v = geoMapsVariant(seed, task);
  const { def } = v;
  const notes: Record<GeoCrit, string[]> = { construction: [], readings: [], calculation: [], interpretation: [] };
  const got: Record<GeoCrit, number> = { construction: 0, readings: 0, calculation: 0, interpretation: 0 };
  let answered = 0;
  for (const b of def.builds) {
    const part = Math.max(0, Math.min(1, b.test(s)));
    got[b.crit] += b.marks * part;
    if (part < 1) notes[b.crit].push(b.note);
  }
  for (const f of def.fields) {
    if ((s.entries[f.id] ?? '').trim()) answered++;
    if (geoFieldOk(f, s, def.fields)) got[f.crit] += f.marks;
    else notes[f.crit].push((s.entries[f.id] ?? '').trim() ? `${f.label}: ${f.note}` : `${f.label}: not answered.`);
  }
  for (const c of def.choices) {
    if (s.choices[c.id] === c.truth) got[c.crit] += c.marks;
    else notes[c.crit].push(s.choices[c.id] ? c.note : `${c.label}: not answered.`);
  }
  const auto: CriterionScore[] = (['construction', 'readings', 'calculation', 'interpretation'] as const).map((id) => {
    const c = GEO_MAPS.rubric.find((x) => x.id === id)!;
    return score(c, Math.min(c.marks, half(got[id])), notes[id]);
  });
  const a = AI[task];
  const w = GEO_WRITTEN[task];
  const kwP = CHART_TASKS.includes(task) ? CHART_KW : MAP_KW;
  const ai: AiItem[] = [
    { criterionId: 'precautions', question: `State two precautions you took when ${w.prec}.`, answer: s.written.precautions.trim(), guide: `2 marks: one for each correct precaution, e.g. ${GENERAL_PRECAUTION} A vague statement (“be careful”) earns nothing.`, keywords: kwP, need: 2 },
    { criterionId: 'explanation', question: w.explain, answer: s.written.explain.trim(), guide: a.guide, keywords: a.kw, need: Math.min(2, a.kw.length) },
  ];
  return {
    auto,
    ai,
    solution: def.solution,
    facts: [`Exercise: ${def.title}.`, `${answered} of ${def.fields.length} answers written.`, `${Object.keys(s.squares).length + s.rulers.length + s.runs.length + s.protractors.length + s.pins.length + s.ticks.length} marks made with the tools.`],
  };
}

export const geoMapsGrader: SimulatorGrader<'geo-maps'> = { id: 'geo-maps', grade };
