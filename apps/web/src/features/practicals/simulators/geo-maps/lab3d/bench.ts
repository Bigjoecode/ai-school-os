import { geoMapsVariant, type GeoMapsState, type GeoPanel, type GeoTask, type GeoTool, type GeoVariant } from '@aischool/shared';
import { create } from 'zustand';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import type { RoomConfig } from '../../../lab3d-kit/room';
import type { Spot } from '../../../lab3d-kit/store';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';
import { isMapTask } from '../actions';

/**
 * The classroom bench: where things lie (station-local metres: x along the
 * bench, y up from its top, z towards the student), the camera presets, the
 * bench's own view state, what each exercise needs from the cupboard, and the
 * demo and sandbox sheets.
 */

type V3 = readonly [number, number, number];
export const GSPOT = {
  map: [0, 0, 0.02] as V3,
  card: [-0.98, 0, -0.18] as V3,
  book: [-0.98, 0, 0.24] as V3,
  ruler: [0.0, 0, 0.42] as V3,
  protractor: [0.62, 0, -0.2] as V3,
  thread: [0.6, 0, 0.1] as V3,
  dividers: [0.68, 0, 0.26] as V3,
  romer: [0.86, 0, -0.14] as V3,
  pins: [0.84, 0, 0.1] as V3,
  strip: [-0.6, 0, 0.3] as V3,
  pencil: [-0.56, 0, -0.2] as V3,
  calculator: [-0.66, 0, 0.06] as V3,
  compasses: [0.84, 0, 0.3] as V3,
  colours: [1.02, 0, -0.26] as V3,
  atlas: [1.06, 0, 0.14] as V3,
  globe: [0.72, 0, -0.34] as V3,
};
const local = (p: V3, y: number): [number, number, number] => [p[0], y, p[2]];
export const GEO_VIEWS: CameraPresets = {
  map: { target: local(GSPOT.map, 0.02), dist: 0.86, pitch: 1.05 },
  tools: { target: local(GSPOT.thread, 0.02), dist: 0.6, pitch: 0.7 },
};
export const spotOf = (p: V3, y: number, dist: number, pitch: number): Spot => ({ target: local(p, y), dist, pitch });
export const worldOf = (p: V3, y: number): [number, number, number] => [STATION[0] + p[0], STATION[1] + y, STATION[2] + p[2]];

export const VIEW_BUTTONS = [
  { id: 'bench', label: 'Whole bench' },
  { id: 'map', label: 'The sheet' },
  { id: 'tools', label: 'Instruments' },
];

export const useGeoBench = create<{ tool?: GeoTool; panel?: GeoPanel }>(() => ({}));
export const BENCH_IDLE = { tool: undefined, panel: undefined };

export type GeoApparatusId = 'ruler' | 'thread' | 'dividers' | 'protractor' | 'romer' | 'pins' | 'strip' | 'pencil' | 'calculator' | 'compasses' | 'colours' | 'atlas' | 'globe';
export const GEO_APPARATUS: { id: GeoApparatusId; label: string }[] = [
  { id: 'ruler', label: '30 cm ruler' },
  { id: 'pencil', label: 'Sharp HB pencil and eraser' },
  { id: 'thread', label: 'Reel of thread' },
  { id: 'dividers', label: 'Pair of dividers' },
  { id: 'protractor', label: 'Protractor' },
  { id: 'romer', label: 'Tenths square (romer)' },
  { id: 'pins', label: 'Map pins' },
  { id: 'strip', label: 'Paper strip' },
  { id: 'calculator', label: 'Calculator' },
  { id: 'compasses', label: 'Pair of compasses' },
  { id: 'colours', label: 'Coloured pencils' },
  { id: 'atlas', label: 'Atlas' },
  { id: 'globe', label: 'Globe' },
];
export const GEO_APPARATUS_LABEL = Object.fromEntries(GEO_APPARATUS.map((a) => [a.id, a.label])) as Record<GeoApparatusId, string>;
const TOOL_ITEM: Partial<Record<GeoTool, GeoApparatusId>> = { ruler: 'ruler', string: 'thread', dividers: 'dividers', protractor: 'protractor', romer: 'romer', pin: 'pins', strip: 'strip', pencil: 'pencil' };

/** What this exercise needs from the cupboard. */
export function neededFor(v: GeoVariant): GeoApparatusId[] {
  const out = new Set<GeoApparatusId>(['pencil', 'calculator']);
  for (const t of v.def.tools) {
    const a = TOOL_ITEM[t];
    if (a) out.add(a);
  }
  if (!isMapTask(v.task)) out.add('ruler');
  if (v.task === 'PIE') {
    out.add('compasses');
    out.add('protractor');
  }
  if (['DOTS', 'FLOW', 'BARS', 'CLIMATE', 'CLIMTYPE'].includes(v.task)) out.add('colours');
  if (v.task === 'LONGTIME') {
    out.add('globe');
    out.add('atlas');
  }
  return [...out];
}

export function sceneFromState(s: GeoMapsState) {
  const { collected } = collectedFromLog(s.log);
  const from2d = startedIn2d(s.log, /^(ruler|protractor|run:|pin:|square:|tick|vertex:|axis:|choice:)/);
  return { collected: collected as Set<string>, from2d };
}
export type GeoScene = ReturnType<typeof sceneFromState>;

/** The demonstration's sheet: never the student's own (the demo would give their answers away). */
export function demoVariant(studentSeed: number, task: GeoTask): GeoVariant {
  return geoMapsVariant(studentSeed === 9301 ? 9302 : 9301, task);
}

export function geoRoom(task: GeoTask): RoomConfig {
  const map = isMapTask(task);
  return {
    whiteboard: ['Geography — SS3 Practical', 'Paper 3: map work and statistics', map ? '1 km = 100 000 cm · Eastings first' : 'Title · Scale · Key · Units', map ? 'Gradient = VI ÷ HE' : 'Start value axes at zero'],
    whiteboardNote: map ? 'Sharp pencil!' : 'Label everything!',
    frontPoster: { title: 'Map reading', band: '#00695c', lines: ['Scale: RF, statement, line.', 'Grid: eastings, then northings.', 'Bearing: clockwise from north.', 'Close contours: steep slope.'] },
    doorPoster: { title: 'Earth facts', band: '#1565c0', lines: ['15° of longitude = 1 hour.', '1° of latitude ≈ 111 km.', 'The earth turns west to east.'] },
    sinks: false,
    benchRacks: false,
    reagentShelf: false,
    fumeCupboard: false,
    periodicTable: false,
    fans: true,
    shelfBottles: [],
    fumeBottle: null,
  };
}
