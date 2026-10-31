import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { labBetween, labRandom, roundDp } from './seeded';

/**
 * chem-redox: WAEC redox volumetric analysis. Solution A is in the burette and
 * 25.0 cm³ of B is pipetted into a conical flask; everything else follows the
 * acid–base titration (chem-titration): rinsing, a rough then accurate
 * titrations, burette readings to 2 d.p., concordant titres within 0.10 cm³
 * and the mole-ratio calculation. Three tasks, one per lesson:
 *  - FE  (pr-chem-redox-permanganate-iron): A = standard KMnO₄, B = iron(II)
 *        tetraoxosulphate(VI) (FeSO₄·7H₂O), each portion acidified with about
 *        20 cm³ of dilute H₂SO₄. KMnO₄ is its own indicator: the end point is
 *        the first permanent pale pink. The burette is read at the TOP of the
 *        meniscus (the solution is too dark to see the bottom).
 *        MnO₄⁻ + 5Fe²⁺ + 8H⁺ → Mn²⁺ + 5Fe³⁺ + 4H₂O (1 : 5).
 *  - OX  (pr-chem-redox-permanganate-oxalate): A = KMnO₄ of unknown
 *        concentration, B = standard ethanedioic acid, acidified and warmed to
 *        about 60–70 °C. The first drops decolourise slowly, then quickly: Mn²⁺
 *        made by the reaction catalyses it (autocatalysis).
 *        2MnO₄⁻ + 5C₂O₄²⁻ + 16H⁺ → 2Mn²⁺ + 10CO₂ + 8H₂O (2 : 5).
 *  - IOD (pr-chem-iodine-thiosulphate): A = standard Na₂S₂O₃, B = iodine
 *        (liberated from KI, as I₂ in KI solution). Titrate brown → pale straw,
 *        add starch near the end point (blue-black), then to colourless.
 *        I₂ + 2S₂O₃²⁻ → 2I⁻ + S₄O₆²⁻ (1 : 2). Starch added early binds the
 *        iodine and the blue lingers past the end point.
 * Mistakes change the chemistry, not just the marks: HCl is oxidised by MnO₄⁻
 * (titre too high), HNO₃ oxidises iron(II) itself (too low), no acid gives brown
 * MnO₂ (Mn(VII) → Mn(IV), five-thirds the titre), and boiling the ethanedioic
 * acid decomposes some of it. Every attempt's seed gives different
 * concentrations, titre, drop size and per-run scatter.
 */

export const REDOX_TASKS = ['FE', 'OX', 'IOD'] as const;
export type RedoxTask = (typeof REDOX_TASKS)[number];
/** The lesson each task serves. */
export const REDOX_LESSONS: Record<string, RedoxTask> = {
  'pr-chem-redox-permanganate-iron': 'FE',
  'pr-chem-redox-permanganate-oxalate': 'OX',
  'pr-chem-iodine-thiosulphate': 'IOD',
};
export const redoxLessonTask = (practicalId?: string | null): RedoxTask => (practicalId && REDOX_LESSONS[practicalId]) || 'FE';

/** What a piece of glassware was last rinsed with. */
export const REDOX_RINSES = ['A', 'B', 'WATER', 'NONE'] as const;
export type RedoxRinse = (typeof REDOX_RINSES)[number];
/** Dilute acids on the bench (FE and OX are acidified with one of them). */
export const REDOX_ACIDS = ['H2SO4', 'HCL', 'HNO3'] as const;
export type RedoxAcid = (typeof REDOX_ACIDS)[number];
export const REDOX_ACID_INFO: Record<RedoxAcid, { label: string; formula: string }> = {
  H2SO4: { label: 'Dilute tetraoxosulphate(VI) acid', formula: 'H₂SO₄' },
  HCL: { label: 'Dilute hydrochloric acid', formula: 'HCl' },
  HNO3: { label: 'Dilute trioxonitrate(V) acid', formula: 'HNO₃' },
};
/** Indicators on the bench: starch for iodine; the acid–base ones are distractors. */
export const REDOX_INDICATORS = ['STARCH', 'METHYL_ORANGE', 'PHENOLPHTHALEIN'] as const;
export type RedoxIndicator = (typeof REDOX_INDICATORS)[number];
export const REDOX_INDICATOR_INFO: Record<RedoxIndicator, { label: string; colour: string }> = {
  STARCH: { label: 'Starch solution', colour: '#eef0f2' },
  METHYL_ORANGE: { label: 'Methyl orange', colour: '#f2a400' },
  PHENOLPHTHALEIN: { label: 'Phenolphthalein', colour: '#f2f2f6' },
};

export const REDOX_PIPETTE = 25.0;
export const REDOX_BURETTE = 50.0;
/** Concordant titres agree within this (cm³). */
export const REDOX_CONCORDANT = 0.1;
/** cm³ of dilute acid added to each portion (measuring cylinder), and of starch. */
export const REDOX_ACID_VOL = 20;
export const REDOX_STARCH_VOL = 1;
/** The top of the meniscus reads this much less than its bottom (cm³; the burette's curve is about 1.6 mm deep). */
export const REDOX_MENISCUS = 0.16;
/** OX: the warm range the lesson asks for (°C), what is accepted as "about" it at the start of titrating, and where ethanedioic acid starts to decompose. */
export const REDOX_WARM = { min: 60, max: 70, okMin: 55, okMax: 75, decompose: 80 } as const;
/** IOD: starch is "near the end point" once no more than this fraction of the iodine is left (pale straw). */
export const REDOX_STARCH_LATE = 0.25;
/** IOD: how far past the true end point the blue lingers when starch went in early (cm³). */
export const REDOX_STARCH_DELAY = 0.3;

export type RedoxTaskId = 'meanTitre' | 'molesKnown' | 'molesUnknown' | 'conc' | 'massConc';
export const REDOX_TASK_IDS: RedoxTaskId[] = ['meanTitre', 'molesKnown', 'molesUnknown', 'conc', 'massConc'];
export type RedoxUnit = 'cm3' | 'mol' | 'mol/dm3' | 'g/dm3';
export interface RedoxTaskDef {
  id: RedoxTaskId;
  label: string;
  unit: RedoxUnit;
}

export interface RedoxSolution {
  /** "potassium tetraoxomanganate(VII)" */
  name: string;
  formula: string;
  /** The reacting species in the ionic equation, e.g. MnO₄⁻. */
  species: string;
  /** mol dm⁻³ (exact). */
  conc: number;
  /** As given on the paper (3 s.f.); null: the unknown. */
  given: number | null;
}

export interface ChemRedoxVariant {
  seed: number;
  task: RedoxTask;
  /** A, in the burette. */
  A: RedoxSolution;
  /** B, 25.0 cm³ pipetted. */
  B: RedoxSolution;
  /** Mole ratio in the equation: a mol of A's species react with b mol of B's species. */
  a: number;
  b: number;
  equation: string;
  /** Which solution's concentration is given. */
  known: 'A' | 'B';
  /** The substance whose mass concentration is asked for, and the solution it is in. */
  mass: { name: string; formula: string; molarMass: number; of: 'A' | 'B' };
  pipette: number;
  /** The true titre (cm³) with the correct procedure. */
  trueTitre: number;
  /** Mean drop volume of this burette (cm³). */
  drop: number;
  /** Room temperature (°C). */
  room: number;
  /** A is dark (KMnO₄): read the top of the meniscus. */
  dark: boolean;
  given: { A: string; B: string };
  tasks: RedoxTaskDef[];
}

const KMNO4 = { name: 'potassium tetraoxomanganate(VII)', formula: 'KMnO₄', species: 'MnO₄⁻', molarMass: 158 };
const FESO4 = { name: 'iron(II) tetraoxosulphate(VI)', formula: 'FeSO₄·7H₂O', species: 'Fe²⁺', molarMass: 278 };
const OXALIC = { name: 'ethanedioic acid', formula: 'H₂C₂O₄', species: 'C₂O₄²⁻' };
const THIO = { name: 'sodium thiosulphate', formula: 'Na₂S₂O₃', species: 'S₂O₃²⁻' };
const IODINE = { name: 'iodine', formula: 'I₂', species: 'I₂', molarMass: 254 };

/** 3 significant figures, as a paper prints a concentration. */
const sf3 = (x: number) => Number(x.toPrecision(3));
const fmt3 = (x: number) => x.toPrecision(3);

function tasksFor(task: RedoxTask, v: Pick<ChemRedoxVariant, 'A' | 'B' | 'mass'>): RedoxTaskDef[] {
  const mean: RedoxTaskDef = { id: 'meanTitre', label: 'Average (mean) volume of A used, from your concordant titres', unit: 'cm3' };
  if (task === 'OX')
    return [
      mean,
      { id: 'molesKnown', label: `Amount (moles) of ${v.B.species} in 25.0 cm³ of B`, unit: 'mol' },
      { id: 'molesUnknown', label: `Amount (moles) of ${v.A.species} in the mean titre of A`, unit: 'mol' },
      { id: 'conc', label: `Concentration of ${v.A.formula} in A, in mol dm⁻³`, unit: 'mol/dm3' },
      { id: 'massConc', label: `Concentration of ${v.mass.formula} in A, in g dm⁻³`, unit: 'g/dm3' },
    ];
  return [
    mean,
    { id: 'molesKnown', label: `Amount (moles) of ${v.A.species} in the mean titre of A`, unit: 'mol' },
    { id: 'molesUnknown', label: `Amount (moles) of ${v.B.species} in 25.0 cm³ of B`, unit: 'mol' },
    { id: 'conc', label: `Concentration of ${v.B.species} in B, in mol dm⁻³`, unit: 'mol/dm3' },
    { id: 'massConc', label: `Concentration of ${v.mass.formula} in B, in g dm⁻³`, unit: 'g/dm3' },
  ];
}

function build(seed: number, task: RedoxTask, aConc: number | null, bConc: number | null, titre: number | null): ChemRedoxVariant {
  const r = labRandom(seed, `chem-redox-${task}`);
  const trueTitre0 = labBetween(r, task === 'IOD' ? 18.5 : 20.0, task === 'IOD' ? 26.5 : 27.0, 2);
  const drop = labBetween(r, 0.04, 0.05, 3);
  const room = labBetween(r, 25, 30, 1);
  const P = REDOX_PIPETTE;
  if (task === 'FE') {
    const cA = aConc ?? sf3(labBetween(r, 0.018, 0.022, 4));
    const tt = titre ?? trueTitre0;
    const cB = bConc ?? (cA * tt * 5) / P;
    const trueTitre = roundDp((cB * P) / (5 * cA), 2);
    const A = { ...KMNO4, conc: cA, given: cA };
    const B = { ...FESO4, conc: cB, given: null };
    const mass = { name: FESO4.name, formula: FESO4.formula, molarMass: FESO4.molarMass, of: 'B' as const };
    return {
      seed,
      task,
      A,
      B,
      a: 1,
      b: 5,
      equation: 'MnO₄⁻ + 5Fe²⁺ + 8H⁺ → Mn²⁺ + 5Fe³⁺ + 4H₂O',
      known: 'A',
      mass,
      pipette: P,
      trueTitre,
      drop,
      room,
      dark: true,
      given: {
        A: `A is a standard solution of ${KMNO4.name} (KMnO₄) containing ${fmt3(cA)} mol dm⁻³.`,
        B: `B is a solution of ${FESO4.name} (${FESO4.formula}) of unknown concentration. Acidify each 25.0 cm³ portion with about 20 cm³ of dilute H₂SO₄.`,
      },
      tasks: tasksFor(task, { A, B, mass }),
    };
  }
  if (task === 'OX') {
    const cB = bConc ?? sf3(labBetween(r, 0.045, 0.055, 4));
    const tt = titre ?? trueTitre0;
    const cA = aConc ?? (2 * cB * P) / (5 * tt);
    const trueTitre = roundDp((2 * cB * P) / (5 * cA), 2);
    const A = { ...KMNO4, conc: cA, given: null };
    const B = { ...OXALIC, conc: cB, given: cB };
    const mass = { name: KMNO4.name, formula: KMNO4.formula, molarMass: KMNO4.molarMass, of: 'A' as const };
    return {
      seed,
      task,
      A,
      B,
      a: 2,
      b: 5,
      equation: '2MnO₄⁻ + 5C₂O₄²⁻ + 16H⁺ → 2Mn²⁺ + 10CO₂ + 8H₂O',
      known: 'B',
      mass,
      pipette: P,
      trueTitre,
      drop,
      room,
      dark: true,
      given: {
        A: `A is a solution of ${KMNO4.name} (KMnO₄) of unknown concentration.`,
        B: `B is a standard solution of ${OXALIC.name} (${OXALIC.formula}) containing ${fmt3(cB)} mol dm⁻³. Acidify each 25.0 cm³ portion with about 20 cm³ of dilute H₂SO₄ and warm it to about 60–70 °C.`,
      },
      tasks: tasksFor(task, { A, B, mass }),
    };
  }
  const cA = aConc ?? sf3(labBetween(r, 0.095, 0.105, 4));
  const tt = titre ?? trueTitre0;
  const cB = bConc ?? (cA * tt) / (2 * P);
  const trueTitre = roundDp((2 * cB * P) / cA, 2);
  const A = { ...THIO, conc: cA, given: cA };
  const B = { ...IODINE, conc: cB, given: null };
  const mass = { name: IODINE.name, formula: IODINE.formula, molarMass: IODINE.molarMass, of: 'B' as const };
  return {
    seed,
    task,
    A,
    B,
    a: 2,
    b: 1,
    equation: 'I₂ + 2S₂O₃²⁻ → 2I⁻ + S₄O₆²⁻',
    known: 'A',
    mass,
    pipette: P,
    trueTitre,
    drop,
    room,
    dark: false,
    given: {
      A: `A is a standard solution of ${THIO.name} (${THIO.formula}) containing ${fmt3(cA)} mol dm⁻³.`,
      B: 'B is a solution of iodine (liberated from potassium iodide: I₂ in KI solution) of unknown concentration.',
    },
    tasks: tasksFor(task, { A, B, mass }),
  };
}

/** The hidden truth of one attempt (same on the web and the API). */
export function chemRedoxVariant(seed: number, task: RedoxTask = 'FE'): ChemRedoxVariant {
  return build(seed, task, null, null, null);
}

/**
 * A variant from the student's own choices (the 3D lab's unmarked sandbox):
 * both concentrations in mol dm⁻³. The titre follows from the same mole
 * ratio, and the end point, colours and kinetics work on it unchanged.
 */
export function chemRedoxCustomVariant(seed: number, task: RedoxTask, aConc: number, bConc: number): ChemRedoxVariant {
  const v = build(seed, task, aConc, bConc, null);
  return {
    ...v,
    A: { ...v.A, given: aConc },
    B: { ...v.B, given: bConc },
    given: { A: `A is ${v.A.name} (${v.A.formula}), ${aConc.toFixed(4)} mol dm⁻³ (your choice).`, B: `B is ${v.B.name} (${v.B.formula}), ${bConc.toFixed(4)} mol dm⁻³ (your choice).` },
  };
}

/** The titre a sandbox choice would give (cm³). */
export function redoxTitreFor(task: RedoxTask, aConc: number, bConc: number): number {
  const ratio = task === 'FE' ? 1 / 5 : task === 'OX' ? 2 / 5 : 2;
  return (bConc * REDOX_PIPETTE * ratio) / aConc;
}

/** mol of B's species per mol of A's species. */
export const redoxRatio = (v: ChemRedoxVariant) => v.b / v.a;

/** True answers for the calculation tasks. */
export function chemRedoxAnswers(v: ChemRedoxVariant): Record<RedoxTaskId, number> {
  const nA = (v.A.conc * v.trueTitre) / 1000;
  const nB = (v.B.conc * v.pipette) / 1000;
  const conc = v.known === 'A' ? v.B.conc : v.A.conc;
  return {
    meanTitre: v.trueTitre,
    molesKnown: v.known === 'A' ? nA : nB,
    molesUnknown: v.known === 'A' ? nB : nA,
    conc,
    massConc: conc * v.mass.molarMass,
  };
}

/**
 * The chain of calculations from a mean titre and the student's own earlier
 * answers (errors carried forward): what each answer should be.
 */
export function redoxChain(v: ChemRedoxVariant, titre: number, molesKnown?: number | null, molesUnknown?: number | null, conc?: number | null) {
  const ratio = redoxRatio(v);
  const known = v.known === 'A' ? ((v.A.given ?? v.A.conc) * titre) / 1000 : ((v.B.given ?? v.B.conc) * v.pipette) / 1000;
  const kUsed = molesKnown ?? known;
  // FE/IOD: unknown = B (moles of B = moles of A × b/a); OX: unknown = A (moles of A = moles of B × a/b).
  const unknown = v.known === 'A' ? kUsed * ratio : kUsed / ratio;
  const uUsed = molesUnknown ?? unknown;
  const c = v.known === 'A' ? (uUsed * 1000) / v.pipette : (uUsed * 1000) / titre;
  const cUsed = conc ?? c;
  return { known, unknown, conc: c, massConc: cUsed * v.mass.molarMass };
}

/** The part of a run the end point depends on. */
export type RedoxRunChem = Pick<RedoxRun, 'acid' | 'starchAt' | 'warm'>;

/** The end point without the starch effect (cm³ of A): the true titre with this run's scatter and its chemistry. */
export function redoxTrueEnd(v: ChemRedoxVariant, index: number, run: RedoxRunChem | null): number {
  const noise = labBetween(labRandom(v.seed, `redox-run-${index}`), -0.04, 0.04, 2);
  let f = 1;
  if (v.task !== 'IOD' && run) {
    if (run.acid === null) f = 5 / 3;
    else if (run.acid === 'HCL') f = v.task === 'FE' ? 1.04 : 1.03;
    else if (run.acid === 'HNO3' && v.task === 'FE') f = 0.93;
    if (v.task === 'OX' && run.warm !== null && run.warm > REDOX_WARM.decompose) f *= 1 - Math.min(0.15, (run.warm - REDOX_WARM.decompose) * 0.008);
  }
  return roundDp(v.trueTitre * f + noise, 2);
}
/** IOD: starch went in while too much iodine was left (still brown or deep yellow). */
export const redoxStarchEarly = (v: ChemRedoxVariant, index: number, run: RedoxRunChem) => v.task === 'IOD' && run.starchAt !== null && run.starchAt < (1 - REDOX_STARCH_LATE) * redoxTrueEnd(v, index, run) - 1e-9;
/**
 * The burette volume at which run `index` (0-based, in order of pipetting)
 * reaches the end point the student sees: the first permanent pink, or the
 * blue-black just gone (which lingers when starch went in early).
 */
export function redoxEndpoint(v: ChemRedoxVariant, index: number, run: RedoxRunChem | null): number {
  const end = redoxTrueEnd(v, index, run);
  return run && redoxStarchEarly(v, index, run) ? roundDp(end + REDOX_STARCH_DELAY, 2) : end;
}

/** Where the level stands after the burette's `fill`-th filling (0-based): near, not exactly at, the zero mark. */
export function redoxFillLevel(seed: number, fill: number): number {
  return labBetween(labRandom(seed, `redox-fill-${fill}`), 0.2, 1.6, 2);
}
/** One drop from the burette at this level (cm³): the burette's drop size with a little scatter. */
export function redoxDrop(v: ChemRedoxVariant, level: number): number {
  return roundDp(v.drop + labBetween(labRandom(v.seed, `redox-drop-${Math.round(level * 1000)}`), -0.004, 0.004, 3), 3);
}
/** The reading the student should record for a true level: the top of the meniscus for dark KMnO₄, else the bottom. */
export const redoxReading = (v: Pick<ChemRedoxVariant, 'dark'>, level: number) => (v.dark ? Math.max(0, level - REDOX_MENISCUS) : level);

// ------------------------------------------------------------------ the student's work

export interface RedoxRun {
  kind: 'ROUGH' | 'ACCURATE';
  /** The dilute acid measured in (FE and OX), null: none. */
  acid: RedoxAcid | null;
  /** Indicators added to this portion, in order (KMnO₄ needs none; iodine needs starch). */
  indicators: RedoxIndicator[];
  /** IOD: cm³ of A delivered when the starch went in (null: no starch). */
  starchAt: number | null;
  /** OX: the highest temperature the portion was warmed to (°C), and the temperature when the first A went in. */
  warm: number | null;
  startTemp: number | null;
  /** True burette level (cm³) when the first A went in; null until then. */
  initial: number | null;
  /** True burette level when the run was finished; null while it is open. */
  final: number | null;
  swirls: number;
  /** The filter funnel was out of the burette when titrating began. */
  funnelRemoved: boolean;
  done: boolean;
}
export interface RedoxRecord {
  initial: string;
  final: string;
  titre: string;
}
export interface RedoxAnswer {
  value: string;
  unit: string;
}
export interface ChemRedoxState {
  v: 1;
  task: RedoxTask | null;
  setup: { burette: RedoxRinse | null; pipette: RedoxRinse | null; flask: RedoxRinse | null };
  /** True level of A in the burette (null: not filled yet). */
  burette: number | null;
  fills: number;
  funnelIn: boolean;
  runs: RedoxRun[];
  table: RedoxRecord[];
  answers: Record<RedoxTaskId, RedoxAnswer>;
  written: { endpoint: string; explain: string; precautions: string };
  /** What the student did, in order (ms since the lab opened). */
  log: { t: number; a: string }[];
}

export function emptyChemRedoxState(): ChemRedoxState {
  const blank = () => ({ value: '', unit: '' });
  return {
    v: 1,
    task: null,
    setup: { burette: null, pipette: null, flask: null },
    burette: null,
    fills: 0,
    funnelIn: false,
    runs: [],
    table: [],
    answers: { meanTitre: blank(), molesKnown: blank(), molesUnknown: blank(), conc: blank(), massConc: blank() },
    written: { endpoint: '', explain: '', precautions: '' },
    log: [],
  };
}

const vol = z.number().min(-1).max(60);
const temp = z.number().min(-10).max(110);
const short = z.string().max(40);
const answer = z.object({ value: short, unit: short });
export const chemRedoxStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(REDOX_TASKS).nullable(),
  setup: z.object({ burette: z.enum(REDOX_RINSES).nullable(), pipette: z.enum(REDOX_RINSES).nullable(), flask: z.enum(REDOX_RINSES).nullable() }),
  burette: vol.nullable(),
  fills: z.number().int().min(0).max(100),
  funnelIn: z.boolean(),
  runs: z
    .array(
      z.object({
        kind: z.enum(['ROUGH', 'ACCURATE']),
        acid: z.enum(REDOX_ACIDS).nullable(),
        indicators: z.array(z.enum(REDOX_INDICATORS)).max(6),
        starchAt: vol.nullable(),
        warm: temp.nullable(),
        startTemp: temp.nullable(),
        initial: vol.nullable(),
        final: vol.nullable(),
        swirls: z.number().int().min(0).max(10_000),
        funnelRemoved: z.boolean(),
        done: z.boolean(),
      }),
    )
    .max(8),
  table: z.array(z.object({ initial: short, final: short, titre: short })).max(8),
  answers: z.object({ meanTitre: answer, molesKnown: answer, molesUnknown: answer, conc: answer, massConc: answer }),
  written: z.object({ endpoint: z.string().max(1000), explain: z.string().max(2000), precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<ChemRedoxState>;

export const CHEM_REDOX: SimulatorSpec = {
  id: 'chem-redox',
  subject: 'Chemistry',
  title: 'Redox titration',
  topicNames: ['Quantitative analysis', 'Volumetric analysis', 'Redox reactions', 'Oxidation and reduction'],
  minutes: 50,
  rubric: [
    { id: 'setup', label: 'Apparatus and setting up', marks: 3, how: 'AUTO', guide: 'Burette rinsed with A (1), pipette rinsed with B (1), conical flask rinsed with distilled water only (1).' },
    { id: 'procedure', label: 'Procedure', marks: 5, how: 'AUTO', guide: 'A rough titration first (1), at least two accurate titrations (1), no overshooting in the accurate ones — dropwise near the end point (1), the flask swirled throughout (1), the funnel removed before titrating (1).' },
    { id: 'technique', label: 'Redox technique', marks: 2, how: 'AUTO', guide: 'KMnO₄ with iron(II): every portion acidified with about 20 cm³ of dilute H₂SO₄, never HCl or HNO₃ (1); no indicator added — KMnO₄ is self-indicating (1). KMnO₄ with ethanedioic acid: dilute H₂SO₄ in every portion (1); every portion warmed to about 60–70 °C before titrating, not boiled (1). Iodine with thiosulphate: starch (and no other indicator) in every accurate titration (1); the starch added only near the end point, when the solution is pale straw (1).' },
    { id: 'readings', label: 'Table of burette readings', marks: 6, how: 'AUTO', guide: 'Every reading to 2 decimal places (1); readings that match the burette within ±0.05 cm³ — the top of the meniscus for the dark KMnO₄, the bottom for thiosulphate (2); titres subtracted correctly (1); two accurate titres within ±0.10 cm³ (1); an end point within ±0.20 cm³ of the true titre (1).' },
    { id: 'calculations', label: 'Calculations', marks: 6, how: 'AUTO', guide: 'Mean of the concordant titres (1); the moles of the standard reagent (1); the moles of the other using the mole ratio from the equation, 1 : 5, 2 : 5 or 1 : 2 (2); the concentration in mol dm⁻³ (1); the concentration in g dm⁻³ (1). Errors carried forward are not penalised twice.' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'Every answer with its correct unit (cm³, mol, mol dm⁻³, g dm⁻³).' },
    { id: 'endpoint', label: 'End-point colour change', marks: 1, how: 'AI', guide: 'KMnO₄: from colourless (or pale green / yellow) to the first permanent pale pink. Iodine: from blue-black to colourless (after starch was added at pale straw).' },
    { id: 'explain', label: 'Explanation', marks: 1, how: 'AI', guide: 'Iron(II): no indicator is needed because KMnO₄ is self-indicating — one excess drop shows pink. Ethanedioic acid: the reaction is slow at first and then fast because the Mn²⁺ ions it produces catalyse it (autocatalysis); warming speeds it up. Iodine: starch is added late because at high iodine concentration a stable starch–iodine complex forms that is slow to decolourise.' },
    { id: 'precautions', label: 'Precautions', marks: 1, how: 'AI', guide: 'Two correct precautions, e.g. read the top of the meniscus of the dark KMnO₄ at eye level; acidify with dilute H₂SO₄, not HCl; warm to 60–70 °C, not boiling; add starch only near the end point; swirl the flask; add dropwise near the end point; remove the funnel; remove air bubbles from the jet; use a white tile; rinse the burette with A and the pipette with B.' },
  ],
};
