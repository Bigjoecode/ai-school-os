import type { SimulatorSpec } from '../practicals';
import { chartTask, NO_CHART_EXTRAS, type GeoChartExtras } from './geo-maps-chart';
import { GEO_TASKS, emptyGeoMapsState, type GeoMapsState, type GeoTask, type GeoTaskDef } from './geo-maps-data';
import { NO_EXTRAS, mapTask, type GeoMapExtras } from './geo-maps-map';
import type { GeoSheet } from './geo-maps-sheet';

export * from './geo-maps-data';
export * from './geo-maps-sheet';
export * from './geo-maps-map';
export * from './geo-maps-chart';

/** The map-sheet tasks (the rest are statistical diagrams on graph paper or outline maps). */
export const GEO_MAP_TASKS: GeoTask[] = ['SCALE', 'DISTANCE', 'BEARING', 'GRIDAREA', 'REDUCE', 'RELIEF', 'GRADIENT', 'PROFILE', 'DRAINAGE', 'SETTLE', 'GIS'];

export const GEO_MAPS: SimulatorSpec = {
  id: 'geo-maps',
  subject: 'Geography',
  title: 'Map work and statistical diagrams',
  topicNames: ['Maps: meaning, types and uses', 'Statistical maps and diagrams', 'Geographic Information System (GIS)', 'The earth as a planet', 'Elements of climate', 'Classification of climate', 'World population'],
  minutes: 45,
  rubric: [
    { id: 'construction', label: 'Using the tools and construction', marks: 5, how: 'AUTO', guide: 'The instruments really used on the map or graph paper: ruler, thread, protractor, tenths square, square count and paper strip laid on the right points; pins on the right places; a graph, section, pie, outline or copied map drawn accurately, with its scale, title and key.' },
    { id: 'readings', label: 'Measurements and readings', marks: 4, how: 'AUTO', guide: 'Distances, bearings, heights, grid references and data values read correctly, in the right units, within the tolerance of the instrument.' },
    { id: 'calculation', label: 'Calculation and results', marks: 4, how: 'AUTO', guide: 'Worked from the student’s own readings: conversions to ground distance, sinuosity, gradient, drainage density, density, sector angles, rates and time.' },
    { id: 'interpretation', label: 'Interpretation', marks: 3, how: 'AUTO', guide: 'Features named, patterns identified and statements chosen correctly, with evidence from the map or data.' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions for this exercise (1 each), e.g. a sharp pencil, the ruler read straight on, measuring from the point stated, consistent units, a graph scale that uses the paper.' },
    { id: 'explanation', label: 'Explanation', marks: 2, how: 'AI', guide: 'The question on the task card (2 marks), answered with reasons and evidence from the map or the data.' },
  ],
};

/** What the notebook asks in words (marked by AI, or keywords when AI can't run). */
export const GEO_WRITTEN: Record<GeoTask, { prec: string; explain: string }> = {
  SCALE: { prec: 'map scale conversions', explain: 'Explain why an RF has no units, and why a smaller denominator means a larger scale.' },
  DISTANCE: { prec: 'measuring straight and curved distances', explain: 'Explain why the road is longer than the direct line, and what the road’s route shows about the land.' },
  BEARING: { prec: 'measuring bearings on a map', explain: 'Explain why a bearing is more exact than a compass direction, and why the back bearing differs by 180°.' },
  GRIDAREA: { prec: 'grid references and counting squares', explain: 'Explain why part squares are divided by two, and why the area is still only an estimate.' },
  REDUCE: { prec: 'copying a map by the square method', explain: 'Explain why halving the lengths quarters the area, and what happens to the detail on a reduced map.' },
  RELIEF: { prec: 'reading relief from contours', explain: 'Explain how you can tell a valley from a spur, and what close contours mean.' },
  GRADIENT: { prec: 'calculating gradient', explain: 'Explain why VI and HE must be in the same unit, and how contour spacing relates to the gradient.' },
  PROFILE: { prec: 'drawing a cross profile', explain: 'Explain why the vertical scale is exaggerated, and how the line of sight decides inter-visibility.' },
  DRAINAGE: { prec: 'measuring streams with thread', explain: 'Explain what the drainage pattern tells you about the land, giving evidence from the map.' },
  SETTLE: { prec: 'counting settlements in sample blocks', explain: 'Explain why settlement density differs between the lowland and the upland, using the map.' },
  GIS: { prec: 'digitising layers', explain: 'Explain the difference between raster and vector data, and why a GIS is more than software.' },
  BARS: { prec: 'drawing bar and line graphs', explain: 'Explain when a line graph suits data better than a bar graph, and why a bar graph’s axis must start at zero.' },
  PIE: { prec: 'drawing pie charts and proportional circles', explain: 'Explain why a proportional circle’s radius is proportional to the square root of the value.' },
  DOTS: { prec: 'drawing dot and density maps', explain: 'Explain what a dot map shows that a density map hides, and why isopleths cannot cross.' },
  FLOW: { prec: 'drawing flow maps', explain: 'Explain why a flow map is more useful than a table of traffic figures to a road planner.' },
  CLIMATE: { prec: 'drawing a climograph', explain: 'Explain the season pattern you see, and why the annual range of temperature is small or large here.' },
  CLIMTYPE: { prec: 'working out climatic statistics', explain: 'Justify your identification of Station X with evidence from the figures.' },
  POPULATION: { prec: 'drawing an age–sex pyramid', explain: 'Explain what the pyramid’s shape shows about births, deaths and dependency.' },
  LONGTIME: { prec: 'calculating distance and time', explain: 'Explain why places to the east are ahead in time, and why 15° equals one hour.' },
};

export interface GeoVariant extends GeoMapExtras, GeoChartExtras {
  seed: number;
  task: GeoTask;
  sheet: GeoSheet | null;
  def: GeoTaskDef;
}

const cache = new Map<string, GeoVariant>();
/** Everything hidden about an attempt, derived only from the seed and the lesson's task. */
export function geoMapsVariant(seed: number, task: GeoTask = 'DISTANCE'): GeoVariant {
  const key = `${seed}|${task}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let v: GeoVariant;
  if (GEO_MAP_TASKS.includes(task)) {
    const m = mapTask(seed, task);
    v = { seed, task, sheet: m.sheet, def: m.def, ...m.ex, ...NO_CHART_EXTRAS };
  } else {
    const c = chartTask(seed, task);
    v = { seed, task, sheet: null, def: c.def, ...NO_EXTRAS, ...c.ex };
  }
  if (cache.size > 40) cache.delete(cache.keys().next().value as string);
  cache.set(key, v);
  return v;
}

/** The model answer: every step of the task done the model way. */
export function geoModelState(seed: number, task: GeoTask): GeoMapsState {
  const v = geoMapsVariant(seed, task);
  const s = emptyGeoMapsState();
  s.task = task;
  for (const st of v.def.steps) st.apply(s);
  return s;
}
export { GEO_TASKS };
