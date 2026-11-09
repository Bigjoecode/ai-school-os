import { compCodeVariant, compFamily, type CompCodeVariant, type CompTask } from '@aischool/shared';
import { create } from 'zustand';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import { DEFAULT_ROOM, type RoomConfig } from '../../../lab3d-kit/room';
import type { Spot } from '../../../lab3d-kit/store';

/** The computer bench: where things stand (station-local metres), the camera presets, its view state and the demo seed. */

type V3 = readonly [number, number, number];
export const CSPOT = {
  monitor: [-0.05, 0, -0.2] as V3,
  sysunit: [0.52, 0, -0.17] as V3,
  keyboard: [-0.05, 0, 0.12] as V3,
  mouse: [0.24, 0, 0.14] as V3,
  ups: [0.84, 0, -0.14] as V3,
  card: [-0.62, 0, -0.18] as V3,
  book: [-0.72, 0, 0.14] as V3,
  crimper: [-0.34, 0, 0.26] as V3,
  tester: [0.52, 0, 0.22] as V3,
  kit: [0.86, 0, 0.2] as V3,
};
const local = (p: V3, y: number): [number, number, number] => [p[0], y, p[2]];
export const COMP_VIEWS: CameraPresets = {
  monitor: { target: local(CSPOT.monitor, 0.24), dist: 0.75, pitch: 0.08 },
  sysunit: { target: local(CSPOT.sysunit, 0.18), dist: 0.8, pitch: 0.2 },
  keyboard: { target: local(CSPOT.keyboard, 0.02), dist: 0.55, pitch: 0.7 },
  ups: { target: local(CSPOT.ups, 0.08), dist: 0.5, pitch: 0.3 },
  tools: { target: [CSPOT.crimper[0] + 0.45, 0.04, CSPOT.crimper[2]], dist: 0.8, pitch: 0.65 },
};
export const compViews = (task: CompTask) => [
  { id: 'bench', label: 'Whole bench' },
  { id: 'monitor', label: 'Screen' },
  ...(task === 'CRIMP' ? [{ id: 'tools', label: 'Tools' }] : task === 'MAINT' ? [{ id: 'sysunit', label: 'System unit' }, { id: 'ups', label: 'UPS' }] : [{ id: 'keyboard', label: 'Keyboard' }]),
];
export const spotOf = (p: V3, y: number, dist: number, pitch = 0.3): Spot => ({ target: [p[0], y, p[2]], dist, pitch });
export const world = (p: V3, y = 0): [number, number, number] => [STATION[0] + p[0], STATION[1] + p[1] + y, STATION[2] + p[2]];

const BOARD: Record<CompTask, { lines: string[]; note: string; title: string; poster: string[] }> = {
  BASIC_IO: { lines: ['Computer Studies — SS3 Practical', 'INPUT, LET and PRINT', 'Use * for multiply, ^ for power', 'Brackets control the order'], note: 'Number lines in tens: 10, 20, 30', title: 'BASIC', poster: ['REM  a comment', 'INPUT  ask', 'LET  work out', 'PRINT  show', 'END  stop'] },
  BASIC_LOOP: { lines: ['Computer Studies — SS3 Practical', 'FOR … NEXT, READ and DATA', 'Set S = 0 before the loop', 'Trace it by hand first'], note: 'STEP 2 counts in twos', title: 'Loops', poster: ['FOR K = 1 TO 9 STEP 2', 'S = S + K', 'NEXT K', 'READ takes DATA', 'in order'] },
  BASIC_ARRAY: { lines: ['Computer Studies — SS3 Practical', 'Arrays: DIM N(10)', 'N(3): 3 is the subscript', 'Start BIG at N(1), not 0'], note: 'Reverse: STEP -1', title: 'Arrays', poster: ['DIM N(10)', 'READ N(I)', 'S = S + N(I)', 'IF N(I) > BIG', 'THEN BIG = N(I)'] },
  BASIC_FUNC: { lines: ['Computer Studies — SS3 Practical', 'SQR, INT, ABS, SIN, COS', 'INT(-7.8) = -8', 'Radians = D * PI / 180'], note: 'SIN wants radians', title: 'Functions', poster: ['SQR  square root', 'INT  round down', 'ABS  size only', 'SIN COS TAN', 'RND LOG EXP'] },
  BASIC_WHILE: { lines: ['Computer Studies — SS3 Practical', 'WHILE … WEND', 'Define, analyse, flowchart,', 'desk check, code, test, document'], note: 'The condition must become false', title: 'Development', poster: ['1 Define', '2 Analyse', '3 Flowchart', '4 Desk check', '5 Code, test'] },
  FLOW: { lines: ['Computer Studies — SS3 Practical', 'Algorithms and flowcharts', 'Oval, parallelogram, rectangle,', 'diamond, connector'], note: 'Every decision: YES and NO', title: 'Flowcharts', poster: ['Oval: start, stop', 'Slanted: in / out', 'Box: process', 'Diamond: decide', 'Circle: connect'] },
  HTML: { lines: ['Computer Studies — SS3 Practical', 'HTML and URLs', 'https :// domain / path / file', 'html, head, title, body'], note: 'Save as .html, not .txt', title: 'HTML', poster: ['<html>', '<head><title>', '<body><h1><p>', '<ul><li>', '<a href="…">'] },
  CRIMP: { lines: ['Computer Studies — SS3 Practical', 'A straight-through cable', 'Strip 2.5 cm, trim 1.3 cm', 'Clip down, crimp firmly'], note: 'Same order at both ends', title: 'Cabling', poster: ['Boots first', 'Strip, untwist', 'Arrange, trim', 'Push in, crimp', 'Test 1 to 8'] },
  MAINT: { lines: ['Computer Studies — SS3 Practical', 'Routine maintenance', 'Shut down before cleaning', 'Hardware first, then software'], note: 'Damp cloth, never wet', title: 'Maintenance', poster: ['Shut down', 'Clean', 'UPS test', 'Disk Cleanup', 'Back up'] },
};
export const compRoom = (task: CompTask, extras: RoomConfig['extras']): RoomConfig => ({
  ...DEFAULT_ROOM,
  whiteboard: BOARD[task].lines,
  whiteboardNote: BOARD[task].note,
  frontPoster: { title: BOARD[task].title, band: '#1e3a8a', lines: BOARD[task].poster },
  sinks: false,
  benchRacks: false,
  reagentShelf: false,
  fumeCupboard: false,
  periodicTable: false,
  fumeBottle: null,
  extras,
});

interface CompBench {
  /** The program or chart tab on the screen. */
  tab: number;
  set: (p: Partial<Omit<CompBench, 'set'>>) => void;
}
export const BENCH_IDLE = { tab: 0 };
export const useCompBench = create<CompBench>((set) => ({ ...BENCH_IDLE, set: (p) => set(p) }));

/** The demonstration's bench: a seed with a different problem from the student's, so the demo never gives the answer away. */
export function demoVariant(studentSeed: number, task: CompTask): CompCodeVariant {
  const mine = compCodeVariant(studentSeed, task);
  const differs = (v: CompCodeVariant) => {
    switch (task) {
      case 'BASIC_IO':
        return v.io.shape !== mine.io.shape && v.io.n !== mine.io.n;
      case 'BASIC_LOOP':
        return v.loop.power !== mine.loop.power || v.loop.step !== mine.loop.step;
      case 'BASIC_ARRAY':
        return v.arr.stat !== mine.arr.stat;
      case 'BASIC_FUNC':
        return v.fn.func !== mine.fn.func;
      case 'BASIC_WHILE':
        return v.wh.rate !== mine.wh.rate;
      case 'FLOW':
        return v.flow.form !== mine.flow.form && v.flow.series !== mine.flow.series;
      case 'HTML':
        return v.html.title !== mine.html.title;
      case 'CRIMP':
        return v.crimp.run !== mine.crimp.run;
      case 'MAINT':
        return v.maint.ah !== mine.maint.ah;
    }
  };
  for (let s = 7001; s < 7400; s++) {
    const v = compCodeVariant(s, task);
    if (differs(v)) return v;
  }
  return compCodeVariant(7001, task);
}
export const usesComputer = (t: CompTask) => compFamily(t) !== 'BENCH';
