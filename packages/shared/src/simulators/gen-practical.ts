import { z } from 'zod';
import type { PracticalContent, RubricCriterion, SimulatorSpec } from '../practicals';

/**
 * "Guided practical": one data-driven simulator (`gen-practical`) that runs any
 * Practical Academy lesson from the lesson's own data plus an optional
 * enrichment entry (prisma/practicals/enrichment/<subject-slug>.json).
 *
 * Unlike the other simulators nothing about the answers can be worked out from
 * the seed in the browser: the API builds a public paper for each attempt (items
 * under opaque ids, ordered by a hash of seed + text, so neither position nor id
 * says anything about the key) and keeps the key to itself until marking.
 *
 * It is a marked guided workflow, not a simulation: never call it a virtual
 * experiment or a virtual lab to users.
 */

export const GEN_PRACTICAL_ID = 'gen-practical' as const;
export const GUIDED_PRACTICAL_LABEL = 'Guided practical';

const RUBRIC: RubricCriterion[] = [
  { id: 'safety', label: 'Safety before starting', marks: 3, how: 'AUTO', guide: 'Choose every correct precaution and item of protective equipment, and none of the wrong ones.' },
  { id: 'setout', label: 'Setting out tools and materials', marks: 3, how: 'AUTO', guide: 'Pick everything the job needs from the bench, and leave out what it does not need.' },
  { id: 'order', label: 'Order of the procedure', marks: 3, how: 'AUTO', guide: 'Put the steps in a workable order.' },
  { id: 'decisions', label: 'Decisions at key steps', marks: 3, how: 'AUTO', guide: 'Take the sound decision at each key step.' },
  { id: 'observe', label: 'Observations and results', marks: 3, how: 'AUTO', guide: 'Choose the right observations; numeric results within tolerance, with the unit.' },
  { id: 'faults', label: 'Spot the fault', marks: 2, how: 'AUTO', guide: 'Find every fault in the scenario without accusing sound work.' },
  { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two precautions specific to this practical, each stated clearly.' },
  { id: 'explanation', label: 'Explanation', marks: 1, how: 'AI', guide: 'A clear explanation that makes the key point of this practical.' },
];

export const GEN_PRACTICAL: SimulatorSpec = {
  id: GEN_PRACTICAL_ID,
  subject: 'Guided practical',
  title: GUIDED_PRACTICAL_LABEL,
  topicNames: [],
  minutes: 40,
  rubric: RUBRIC,
};

// ------------------------------------------------------------------ rooms and tool pictures

export const GEN_ROOMS = ['workshop', 'kitchen', 'studio', 'field', 'drawing', 'lab'] as const;
export type GenRoom = (typeof GEN_ROOMS)[number];

/** Generic procedural pictures of tools: nothing depends on per-lesson models. */
export const GEN_TOOL_SHAPES = ['saw', 'hammer', 'chisel', 'plane', 'square', 'rule', 'gauge', 'clamp', 'screwdriver', 'spanner', 'pliers', 'drill', 'brush', 'bottle', 'jar', 'bowl', 'pot', 'pan', 'knife', 'spoon', 'board', 'scale', 'stove', 'book', 'paper', 'pencil', 'gloves', 'goggles', 'apron', 'mask', 'instrument', 'drum', 'keyboard', 'meter', 'wire', 'tray', 'box', 'cloth', 'plant', 'generic'] as const;
export type GenToolShape = (typeof GEN_TOOL_SHAPES)[number];

const SHAPE_RULES: [RegExp, GenToolShape][] = [
  [/goggle|safety glasses|eye protect|visor/i, 'goggles'],
  [/glove|gauntlet|oven mitt/i, 'gloves'],
  [/apron|overall|lab coat|hair ?net|chef/i, 'apron'],
  [/dust mask|respirator|face mask|\bmask\b/i, 'mask'],
  [/\bsaw\b|tenon|hacksaw|jigsaw/i, 'saw'],
  [/hammer|mallet/i, 'hammer'],
  [/chisel|gouge|parting tool/i, 'chisel'],
  [/\bplanes?\b|spokeshave/i, 'plane'],
  [/square|bevel/i, 'square'],
  [/gauge/i, 'gauge'],
  [/rule\b|ruler|tape|measure\b|calipers?|callipers?|t-square|protractor/i, 'rule'],
  [/clamp|\bvice\b|cramp/i, 'clamp'],
  [/screwdriver/i, 'screwdriver'],
  [/spanner|wrench|socket/i, 'spanner'],
  [/plier|pincer|cutter|snips|tweezers|tongs/i, 'pliers'],
  [/drill|brace|\bbit\b|auger/i, 'drill'],
  [/brush|roller|broom/i, 'brush'],
  [/knife|cleaver|scalpel|blade|grater|peeler/i, 'knife'],
  [/spoon|spatula|ladle|whisk|fork|\bturner\b/i, 'spoon'],
  [/saucepan|\bpot\b|kettle|steamer|cauldron/i, 'pot'],
  [/frying|\bpan\b|\btin\b|griddle|baking sheet/i, 'pan'],
  [/bowl|basin|dish\b|plate|beaker|cup\b|mug|glass\b/i, 'bowl'],
  [/board|bench hook|rolling pin/i, 'board'],
  [/scale|balance|weighing/i, 'scale'],
  [/stove|cooker|oven|burner|hob|lathe|machine|kiln/i, 'stove'],
  [/bottle|oil\b|varnish|lacquer|polish|glue|adhesive|reagent|preservative|solution|paint\b/i, 'bottle'],
  [/\bjar\b|salt|sugar|flour|powder|spice|seasoning|yeast/i, 'jar'],
  [/book|table\b|chart|record|score\b|manual|notebook|sheet\b/i, 'book'],
  [/paper|staff|manuscript|card\b|tracing/i, 'paper'],
  [/pencil|\bpen\b|chalk|marker|crayon|eraser|rubber/i, 'pencil'],
  [/drum|tambourine|shaker|maraca|rattle|gong/i, 'drum'],
  [/piano|keyboard|organ|harmonium/i, 'keyboard'],
  [/guitar|violin|flute|recorder|trumpet|instrument|tuning fork|sekere|kora|xylophone/i, 'instrument'],
  [/meter|thermometer|timer|stopwatch|tester|gps|compass/i, 'meter'],
  [/wire|cable|lead\b|flex|rope|string|thread|twine/i, 'wire'],
  [/tray|rack|trolley|stand\b/i, 'tray'],
  [/\bbox\b|case\b|container|bag\b|bucket|bin\b|crate/i, 'box'],
  [/cloth|fabric|towel|rag|sponge|sandpaper|glasspaper|abrasive/i, 'cloth'],
  [/plant|seed|leaf|leaves|soil|yam|plantain|vegetable|fruit|okra|tomato/i, 'plant'],
];
/** The picture for a tool's name (enrichment can override it per tool). */
export function genToolShape(name: string): GenToolShape {
  return SHAPE_RULES.find(([re]) => re.test(name))?.[1] ?? 'generic';
}

// ------------------------------------------------------------------ small formula language (numeric answers)

/** Evaluates + - * / ^, brackets, unary minus, sqrt, round, abs, min, max, pi over named variables. Throws on anything else. Never uses eval. */
export function genFormula(src: string, vars: Record<string, number>): number {
  const toks = src.match(/\d+\.?\d*(?:e[+-]?\d+)?|\.\d+|[a-z][a-z0-9]*|[-+*/^(),]|\S/gi) ?? [];
  let i = 0;
  const peek = () => toks[i];
  const eat = (t?: string) => {
    if (t && toks[i] !== t) throw new Error(`expected ${t}`);
    return toks[i++];
  };
  const FN: Record<string, (...a: number[]) => number> = { sqrt: Math.sqrt, abs: Math.abs, round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d, min: Math.min, max: Math.max };
  const atom = (): number => {
    const t = eat();
    if (t === undefined) throw new Error('unexpected end');
    if (t === '(') {
      const v = sum();
      eat(')');
      return v;
    }
    if (t === '-') return -power();
    if (t === '+') return power();
    if (/^[\d.]/.test(t)) return Number(t);
    if (/^[a-z]/i.test(t)) {
      if (peek() === '(' && FN[t]) {
        eat('(');
        const args = [sum()];
        while (peek() === ',') {
          eat(',');
          args.push(sum());
        }
        eat(')');
        return FN[t]!(...args);
      }
      if (t === 'pi') return Math.PI;
      if (t in vars) return vars[t]!;
      throw new Error(`unknown name ${t}`);
    }
    throw new Error(`unexpected ${t}`);
  };
  const power = (): number => {
    const b = atom();
    if (peek() !== '^') return b;
    eat('^');
    return b ** power();
  };
  const product = (): number => {
    let v = power();
    while (peek() === '*' || peek() === '/') v = eat() === '*' ? v * power() : v / power();
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (peek() === '+' || peek() === '-') v = eat() === '+' ? v + product() : v - product();
    return v;
  };
  const out = sum();
  if (i < toks.length) throw new Error(`unexpected ${toks[i]}`);
  if (!Number.isFinite(out)) throw new Error('not a finite number');
  return out;
}

// ------------------------------------------------------------------ enrichment (authored; stays on the server)

const text = (max = 400) => z.string().trim().min(3).max(max);
const itemId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'lower-case letters, digits and hyphens');

const wrongItem = z.strictObject({ text: text(), why: text() });
const optionText = z.string().trim().min(1).max(400);
const choiceOption = z.strictObject({ text: optionText, correct: z.boolean().default(false), why: text().optional() });
const oneCorrect = (o: { correct: boolean }[]) => o.filter((x) => x.correct).length === 1;

const decisionSchema = z
  .strictObject({
    id: itemId,
    /** 1-based number of the lesson's procedure step this decision comes after. */
    afterStep: z.number().int().min(1).max(80),
    prompt: text(),
    options: z.array(z.strictObject({ text: optionText, correct: z.boolean().default(false), consequence: text() })).min(3).max(4),
  })
  .refine((d) => oneCorrect(d.options), { message: 'exactly one option must be correct', path: ['options'] });

const observationSchema = z
  .strictObject({ id: itemId, prompt: text(), options: z.array(choiceOption).min(3).max(5) })
  .refine((d) => oneCorrect(d.options), { message: 'exactly one option must be correct', path: ['options'] });

const numericVar = z.strictObject({ min: z.number(), max: z.number(), step: z.number().positive() }).refine((v) => v.max >= v.min, { message: 'max must be at least min' });
const numericSchema = z
  .strictObject({
    id: itemId,
    /** May use {name} placeholders from `vars`. */
    prompt: text(),
    /** A fixed answer, or… */
    answer: z.number().optional(),
    /** …a formula over `vars` (+ - * / ^, brackets, sqrt, round, min, max, pi). */
    formula: z.string().trim().min(1).max(200).optional(),
    vars: z.record(z.string().regex(/^[a-z][a-z0-9]*$/i), numericVar).optional(),
    /** '' = no unit asked for. */
    unit: z.string().trim().max(24).default(''),
    /** Other ways of writing the unit that earn the mark. */
    unitAliases: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
    /** Absolute tolerance, or relative (0.02 = 2%). Give exactly one. */
    tolerance: z.strictObject({ abs: z.number().nonnegative().optional(), rel: z.number().min(0).max(0.5).optional() }),
    /** Decimal places shown in the worked answer. */
    decimals: z.number().int().min(0).max(6).optional(),
    /** Worked solution; may use {name} and {answer}. */
    working: text(600).optional(),
  })
  .superRefine((n, ctx) => {
    if ((n.answer === undefined) === (n.formula === undefined)) ctx.addIssue({ code: 'custom', message: 'give exactly one of answer or formula', path: ['answer'] });
    if ((n.tolerance.abs === undefined) === (n.tolerance.rel === undefined)) ctx.addIssue({ code: 'custom', message: 'give exactly one of abs or rel', path: ['tolerance'] });
    const names = Object.keys(n.vars ?? {});
    if (n.formula) {
      try {
        genFormula(n.formula, Object.fromEntries(names.map((k) => [k, n.vars![k]!.min])));
      } catch (e) {
        ctx.addIssue({ code: 'custom', message: `formula: ${(e as Error).message}`, path: ['formula'] });
      }
    }
    for (const k of names) if (!n.prompt.includes(`{${k}}`)) ctx.addIssue({ code: 'custom', message: `the prompt never shows {${k}}`, path: ['prompt'] });
    for (const m of n.prompt.matchAll(/\{([a-z][a-z0-9]*)\}/gi)) if (!names.includes(m[1]!)) ctx.addIssue({ code: 'custom', message: `{${m[1]}} is not in vars`, path: ['prompt'] });
  });

const faultSchema = z
  .strictObject({
    id: itemId,
    scenario: text(600),
    lines: z.array(z.strictObject({ text: text(), fault: z.boolean().default(false), why: text() })).min(3).max(6),
  })
  .refine((f) => f.lines.some((l) => l.fault) && f.lines.some((l) => !l.fault), { message: 'needs at least one fault and one sound line', path: ['lines'] });

/** One lesson's enrichment: everything optional, each part replaces or adds to what the engine derives from the lesson. */
export const genEnrichmentLessonSchema = z.strictObject({
  room: z.enum(GEN_ROOMS).optional(),
  safety: z.strictObject({ correct: z.array(text()).max(6).optional(), wrong: z.array(wrongItem).min(3).max(10) }).optional(),
  setOut: z
    .strictObject({
      distractors: z.array(z.strictObject({ name: text(120), why: text() })).min(3).max(10),
      /** Lesson apparatus or materials that are nice to have: never marked either way (exact lesson text). */
      optional: z.array(text(200)).max(8).optional(),
      /** Picture for a tool by its exact name, when the automatic one is wrong. */
      shapes: z.record(z.string(), z.enum(GEN_TOOL_SHAPES)).optional(),
    })
    .optional(),
  procedure: z
    .strictObject({
      /** Groups of 1-based step numbers that may be done in any order among themselves. */
      anyOrder: z.array(z.array(z.number().int().min(1).max(80)).min(2).max(10)).max(6).optional(),
      /** 1-based step numbers left out of the ordering task (notes rather than steps). */
      leaveOut: z.array(z.number().int().min(1).max(80)).max(20).optional(),
    })
    .optional(),
  decisions: z.array(decisionSchema).max(6).optional(),
  observations: z.array(observationSchema).max(4).optional(),
  numerics: z.array(numericSchema).max(5).optional(),
  faults: z.array(faultSchema).max(4).optional(),
  written: z
    .strictObject({
      precautionsPrompt: text().optional(),
      explainPrompt: text().optional(),
      explainGuide: text(600).optional(),
      /** One group per point: any word of a group earns the point (the stand-in when AI can't mark). */
      explainKeywords: z.array(z.array(z.string().trim().min(2).max(40)).min(1).max(8)).min(1).max(6).optional(),
      explainNeed: z.number().int().min(1).max(6).optional(),
    })
    .optional(),
  /** Lines on the room's whiteboard (first line is its title). */
  board: z.array(text(80)).max(4).optional(),
});
export type GenEnrichmentLesson = z.output<typeof genEnrichmentLessonSchema>;

/** A file prisma/practicals/enrichment/<subject-slug>.json. */
export const genEnrichmentFileSchema = z.strictObject({
  subject: text(80),
  /** The room for the subject's lessons unless a lesson names its own. */
  room: z.enum(GEN_ROOMS).optional(),
  lessons: z.record(z.string(), genEnrichmentLessonSchema),
});
export type GenEnrichmentFile = z.output<typeof genEnrichmentFileSchema>;

/** What install keeps with a lesson, private to the server (see `publicLessonData`). */
export interface GenLessonPrivate {
  enrichment?: GenEnrichmentLesson;
  room?: GenRoom;
  /** From the subject's other lessons: tools and results that can serve as distractors with no enrichment. */
  pool?: { tools: string[]; observations: string[] };
}
export type GenLesson = PracticalContent & { gen?: GenLessonPrivate; practicalPaper?: string };

/** A stored lesson without the server's private part: everything that goes to a browser passes through this. */
export function publicLessonData<T extends object>(d: T): Omit<T, 'gen'> {
  const { gen: _gen, ...rest } = d as T & { gen?: unknown };
  return rest as Omit<T, 'gen'>;
}

// ------------------------------------------------------------------ the public paper (what the browser gets)

export interface GenOption {
  id: string;
  text: string;
}
export interface GenTool extends GenOption {
  shape: GenToolShape;
}
export interface GenChoice {
  id: string;
  prompt: string;
  options: GenOption[];
}
export interface GenDecisionItem extends GenChoice {
  /** The step just finished, for context. */
  context?: string;
}
export interface GenNumericItem {
  id: string;
  prompt: string;
  /** The student is asked for a unit too. */
  wantsUnit: boolean;
}
export interface GenFaultItem {
  id: string;
  scenario: string;
  lines: GenOption[];
}
/** The key, shown only after marking when the marks may be seen in detail. */
export interface GenReveal {
  correct: string[];
  order: string[];
  numbers: Record<string, string>;
}
export interface GenPaper {
  room: GenRoom;
  title: string;
  aim: string;
  /** Whiteboard lines. */
  board: string[];
  /** True while the server will answer guided checks (a practice attempt, not a sitting or exam mode). */
  feedback: boolean;
  /** This lesson has authored enrichment. */
  enriched: boolean;
  safety: GenOption[];
  tools: GenTool[];
  steps: GenOption[];
  decisions: GenDecisionItem[];
  observations: GenChoice[];
  numerics: GenNumericItem[];
  faults: GenFaultItem[];
  written: { precautions: string; explanation: string };
  reveal?: GenReveal;
}

// ------------------------------------------------------------------ the student's work

export interface GenPracticalState {
  /** Stage the student is on (0–5). */
  stage: number;
  /** Chosen item ids. */
  safety: string[];
  tools: string[];
  /** Step ids in the student's order. */
  order: string[];
  /** Decision or observation id → chosen option id. */
  decisions: Record<string, string>;
  observations: Record<string, string>;
  numerics: Record<string, { value: string; unit: string }>;
  /** Scenario id → the lines tapped as faults. */
  faults: Record<string, string[]>;
  written: { precautions: string; explanation: string };
  log: { t: number; a: string }[];
}

export const emptyGenPracticalState = (): GenPracticalState => ({ stage: 0, safety: [], tools: [], order: [], decisions: {}, observations: {}, numerics: {}, faults: {}, written: { precautions: '', explanation: '' }, log: [] });

const idStr = z.string().min(1).max(40);
export const genPracticalStateSchema = z.object({
  stage: z.number().int().min(0).max(5),
  safety: z.array(idStr).max(40),
  tools: z.array(idStr).max(40),
  order: z.array(idStr).max(40),
  decisions: z.record(idStr, idStr),
  observations: z.record(idStr, idStr),
  numerics: z.record(idStr, z.object({ value: z.string().max(40), unit: z.string().max(40) })),
  faults: z.record(idStr, z.array(idStr).max(12)),
  written: z.object({ precautions: z.string().max(3000), explanation: z.string().max(3000) }),
  log: z.array(z.object({ t: z.number(), a: z.string().max(120) })).max(800),
});

/** What is still unanswered, against the paper. */
export function genPracticalMissing(s: GenPracticalState, paper: GenPaper | null | undefined): string[] {
  if (!paper) return [];
  const out: string[] = [];
  if (!s.safety.length) out.push('No safety choices made.');
  if (!s.tools.length) out.push('No tools or materials set out.');
  if (s.order.length < paper.steps.length) out.push('The procedure is not fully in order.');
  const dec = paper.decisions.filter((d) => !s.decisions[d.id]).length;
  if (dec) out.push(`${dec} decision${dec === 1 ? '' : 's'} not taken.`);
  const obs = paper.observations.filter((d) => !s.observations[d.id]).length + paper.numerics.filter((n) => !s.numerics[n.id]?.value.trim()).length;
  if (obs) out.push(`${obs} observation${obs === 1 ? '' : 's'} or result${obs === 1 ? '' : 's'} not recorded.`);
  if (paper.faults.some((f) => !s.faults[f.id]?.length)) out.push('The fault scenario is not answered.');
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  if (!s.written.explanation.trim()) out.push('No explanation written.');
  return out;
}

// ------------------------------------------------------------------ guided checks (practice only; the server answers)

export const GEN_CHECK_SECTIONS = ['safety', 'tools', 'order', 'decision', 'observation', 'numeric', 'fault'] as const;
export type GenCheckSection = (typeof GEN_CHECK_SECTIONS)[number];
export const genCheckSchema = z.object({
  section: z.enum(GEN_CHECK_SECTIONS),
  /** The decision, observation, numeric or fault item. */
  id: idStr.optional(),
  /** Chosen ids, in order for the procedure. */
  pick: z.array(idStr).max(40).default([]),
  value: z.string().max(40).optional(),
  unit: z.string().max(40).optional(),
});
export type GenCheckInput = z.input<typeof genCheckSchema>;
export interface GenCheckResult {
  ok: boolean;
  /** The consequence, or what to do about it. */
  message: string;
  /** Chosen ids that are wrong, with the reason. */
  wrong: { id: string; why: string }[];
  /** How many right ones have not been chosen. */
  missed: number;
}

/** The worked example shown by Demo: its own seed, its own paper, and the model answers for that paper. */
export interface GenDemoView {
  paper: GenPaper;
  model: GenPracticalState;
  /** Why, by item id (decisions), shown as the demonstrator's commentary. */
  notes: Record<string, string>;
}

export const isGuidedPractical = (id: string | null | undefined) => id === GEN_PRACTICAL_ID;
/** What a practical's interactive part is called to users. */
export const labWord = (id: string | null | undefined) => (isGuidedPractical(id) ? 'guided practical' : 'virtual lab');
