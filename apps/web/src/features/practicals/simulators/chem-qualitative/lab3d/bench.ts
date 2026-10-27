import { QUAL_SALTS, QUAL_SALT_BY_ID, chemQualitativeVariant, type ChemQualitativeVariant, type QualSample } from '@aischool/shared';
import { create } from 'zustand';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { FUME, STATION } from '../../../lab3d-kit/layout';
import { DEFAULT_ROOM, type RoomConfig } from '../../../lab3d-kit/room';

/**
 * The qualitative-analysis bench: where things stand (station-local metres),
 * the camera presets, the room as this lab dresses it, the bench's own view
 * state (which test tube is in the holder, the sample chosen) and the demo /
 * sandbox variants.
 */

export const QSPOT = {
  /** The test tube in use, in its stand. */
  tube: [0.12, 0, 0.02] as const,
  burner: [0.42, 0, -0.02] as const,
  rack: [-0.28, 0, -0.26] as const,
  sampleC: [-0.66, 0, -0.26] as const,
  /** Prepared samples: solution / filtrate beakers, the residue on its filter paper. */
  samples: [-0.62, 0, 0.08] as const,
  reagents: [0.62, 0, -0.3] as const,
  gasKit: [0.72, 0, 0.2] as const,
  wire: [0.34, 0, 0.22] as const,
  holder: [0.0, 0, 0.26] as const,
  spatula: [-0.18, 0, 0.26] as const,
  washBottle: [0.95, 0, 0.05] as const,
  card: [-0.92, 0, -0.18] as const,
  book: [-0.95, 0, 0.27] as const,
  extras: [-1.05, 0, 0.0] as const,
};

/** Fume cupboard work top (kit room: top of its 3 cm slab at 0.925 m). */
const FUME_TOP = 0.925;
/** Where a harmful-gas test is done: on the fume cupboard's work top, right of its bottle, behind the sash (station-local). */
export const FUME_SPOT = [FUME.x - STATION[0] + 0.15, FUME_TOP - STATION[1], FUME.z - STATION[2] + 0.08] as const;
/** The camera on that test, looking in through the sash. */
export const FUME_VIEW = { target: [FUME_SPOT[0] - 0.02, FUME_SPOT[1] + 0.11, FUME_SPOT[2]] as [number, number, number], dist: 0.62, pitch: 0.28 };
/** …and on a tube heated there (held in the holder over the burner, its gas tests at the mouth). */
export const FUME_HEAT_VIEW = { target: [FUME_SPOT[0] - 0.06, FUME_SPOT[1] + 0.25, FUME_SPOT[2]] as [number, number, number], dist: 0.62, pitch: 0.2 };

export const QUAL_VIEWS: CameraPresets = {
  tube: { target: [QSPOT.tube[0], 0.1, QSPOT.tube[2]], dist: 0.42, pitch: 0.18 },
  burner: { target: [QSPOT.burner[0] - 0.1, 0.16, QSPOT.burner[2]], dist: 0.55, pitch: 0.2 },
  rack: { target: [QSPOT.rack[0], 0.08, QSPOT.rack[2]], dist: 0.55, pitch: 0.35 },
  reagents: { target: [QSPOT.reagents[0] + 0.15, 0.05, QSPOT.reagents[2] + 0.04], dist: 0.7, pitch: 0.4 },
};
export const QUAL_VIEW_BUTTONS = [
  { id: 'bench', label: 'Whole bench' },
  { id: 'tube', label: 'Test tube' },
  { id: 'reagents', label: 'Reagents' },
];

export const QUAL_ROOM: RoomConfig = {
  ...DEFAULT_ROOM,
  whiteboard: ['Chemistry — SS3 Practical', 'Qualitative analysis: identify the ions in C', 'Test every gas given off', 'Record TEST | OBSERVATION | INFERENCE'],
  whiteboardNote: 'Waft — never sniff!',
  frontPoster: { title: 'Gas tests', band: '#14853b', lines: ['CO₂: lime water turns milky', 'NH₃: damp red litmus turns blue', 'SO₂: K₂Cr₂O₇ paper orange → green', 'O₂: relights a glowing splint', 'H₂: burns with a "pop"'] },
};

/** The bench's view state: the test tube in the holder (index into tests), the sample chosen for the next test. */
interface QualBench {
  active: number;
  sample: QualSample;
  /** A test was just started: its tube "fills" (animation timestamp). */
  addedAt: number;
  set: (p: Partial<Omit<QualBench, 'set'>>) => void;
}
export const useQualBench = create<QualBench>((set) => ({ active: -1, sample: 'SOLID', addedAt: 0, set: (p) => set(p) }));

// ------------------------------------------------------------------ demo and sandbox variants

/** The demonstration salt: never the student's own (the demo would give their answers away). */
export function demoVariant(studentSeed: number): ChemQualitativeVariant {
  const mine = chemQualitativeVariant(studentSeed);
  const pick = (id: string) => saltVariant(id, 7_001, false);
  if (mine.main.id !== 'ZNSO4' && mine.partner?.id !== 'ZNSO4') return pick('ZNSO4');
  return pick('CUSO4');
}

/** A variant of a single known salt (the sandbox: the student chooses it; the demo). `named`: the task card names the salt (the sandbox), else it is found by the tests (the demo). */
export function saltVariant(id: string, seed = 424_242, named = true): ChemQualitativeVariant {
  const main = QUAL_SALT_BY_ID[id] ?? QUAL_SALTS[0]!;
  return {
    seed,
    kind: 'SALT',
    main,
    partner: null,
    given: named ? `C is ${main.name} (${main.formula}), a ${main.solid.name} salt.` : `C is a single salt (${main.solid.name}). It contains one cation and one anion from those in the WAEC syllabus.`,
    slots: { A: main, B: null },
    minRows: 5,
  };
}
