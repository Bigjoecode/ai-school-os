import {
  genFormula,
  genToolShape,
  labRandom,
  roundDp,
  type GenCheckInput,
  type GenCheckResult,
  type GenDecisionItem,
  type GenDemoView,
  type GenEnrichmentLesson,
  type GenFaultItem,
  type GenLesson,
  type GenNumericItem,
  type GenOption,
  type GenPaper,
  type GenPracticalState,
  type GenReveal,
  type GenRoom,
  type GenTool,
  type GenToolShape,
} from '@aischool/shared';
import { normaliseUnit, parseNumber, withinAbs } from './helpers';

/**
 * The Guided practical's paper and key, built on the server from the lesson,
 * its enrichment and the seed. The paper goes to the browser; the key never does.
 *
 * Why the browser cannot work the key out although it has the seed: every id
 * and every position comes from a hash of (seed, item text), which is the same
 * for right and wrong items and says nothing about a step's place in the lesson.
 * (A seeded Fisher–Yates of the true order could simply be run backwards.)
 */

const MAX_SAFETY_RIGHT = 5;
const MAX_TOOLS_RIGHT = 9;
const MAX_STEPS = 8;
const DERIVED_NUMERIC_REL = 0.02;

interface Keyed {
  id: string;
  text: string;
  correct: boolean;
  why: string;
}
export interface GenKeyDecision extends GenDecisionItem {
  right: string;
  consequence: Record<string, string>;
}
export interface GenKeyChoice {
  id: string;
  prompt: string;
  right: string;
  why: Record<string, string>;
  rightText: string;
}
export interface GenKeyNumeric extends GenNumericItem {
  value: number;
  abs: number;
  shown: string;
  unit: string;
  units: string[];
  working: string;
}
export interface GenKeyFault extends GenFaultItem {
  faults: string[];
  why: Record<string, string>;
}
export interface GenKey {
  safety: Keyed[];
  tools: Keyed[];
  /** Tool ids that are never marked. */
  optional: string[];
  /** Step ids in the true order. */
  order: string[];
  /** Id groups that may go in any order among themselves. */
  anyOrder: string[][];
  stepText: Record<string, string>;
  decisions: GenKeyDecision[];
  observations: GenKeyChoice[];
  numerics: GenKeyNumeric[];
  faults: GenKeyFault[];
  written: {
    precautions: { guide: string; keywords: string[][]; need: number; model: string };
    explanation: { guide: string; keywords: string[][]; need: number; model: string };
  };
}

// ---- seeded helpers: by text, never by position

const rank = (seed: number, salt: string) => labRandom(seed, `rank:${salt}`)();
export const opaqueId = (seed: number, tag: string, text: string) => {
  const r = labRandom(seed, `id:${tag}:${text}`);
  return `i${Math.floor(r() * 2 ** 32).toString(36)}${Math.floor(r() * 2 ** 32).toString(36)}`;
};
const byHash = <T extends { text: string }>(seed: number, xs: T[]) => [...xs].sort((a, b) => rank(seed, a.text) - rank(seed, b.text));
const pickHash = <T extends { text: string }>(seed: number, xs: T[], n: number) => byHash(seed, xs).slice(0, n);
const uniq = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.toLowerCase().trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
/** How many of a pool of wrong items to show: leave at least one out, so that papers differ. */
const spread = (pool: number, want: number) => Math.min(want, Math.max(3, pool - 1));
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
const firstSentences = (s: string, n: number) => (s.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [s]).slice(0, n).join(' ').trim();

// ---- what a lesson with no enrichment borrows

/** True things worth doing, and plausible wrong ones, for each kind of room. */
const SAFETY_BANK: Record<GenRoom, { right: string[]; wrong: { text: string; why: string }[] }> = {
  workshop: {
    right: ['Tie back long hair and tuck in loose clothing before work starts.', 'Keep the bench and the floor around it clear of offcuts and tools you are not using.'],
    wrong: [
      { text: 'Test a sharp edge by running your thumb along it.', why: 'That is how fingers get cut. Test an edge on waste material.' },
      { text: 'Keep your hands in front of the cutting edge so you can guide it.', why: 'Hands stay behind the cutting edge at all times.' },
      { text: 'Wear loose sleeves so that your arms can move freely.', why: 'Loose clothing catches in tools and machines.' },
      { text: 'Carry tools with the sharp end pointing forwards so others can see it.', why: 'Carry sharp tools pointing down and away from people.' },
      { text: 'Leave the power on when you step away so that work can continue quickly.', why: 'Switch off and isolate before leaving a machine or tool.' },
    ],
  },
  kitchen: {
    right: ['Wash your hands with soap before handling food.', 'Wear a clean apron and tie back or cover your hair.'],
    wrong: [
      { text: 'Use one chopping board for raw meat and for cooked food to save washing up.', why: 'That spreads bacteria from raw to cooked food.' },
      { text: 'Add water to hot oil if it starts to smoke.', why: 'Water on hot oil spatters and can cause a fire. Turn the heat off.' },
      { text: 'Turn pan handles outwards over the edge of the cooker so they are easy to grab.', why: 'Handles over the edge get knocked. Turn them inwards.' },
      { text: 'Taste food with the stirring spoon and put it back in the pot.', why: 'That puts saliva and bacteria into the food.' },
      { text: 'Cool cooked food slowly on the worktop overnight.', why: 'Food left warm grows bacteria quickly.' },
    ],
  },
  studio: {
    right: ['Sit or stand with a straight back and relaxed shoulders.', 'Keep leads, bags and stands out of the way of the walkways.'],
    wrong: [
      { text: 'Keep practising through pain until the exercise is perfect.', why: 'Pain is a warning. Stop, rest and check your technique.' },
      { text: 'Turn the volume up as far as it will go so that you hear every detail.', why: 'High volume damages hearing. Keep it at a comfortable level.' },
      { text: 'Share another student’s mouthpiece without cleaning it.', why: 'That spreads infection.' },
      { text: 'Rinse brushes and tools in the drinking water sink.', why: 'Keep work materials well away from drinking water.' },
    ],
  },
  field: {
    right: ['Wear covered shoes and clothes suited to the ground.', 'Work with a partner and tell the teacher where you are going.'],
    wrong: [
      { text: 'Go off alone to save time.', why: 'Field work is done in pairs or groups.' },
      { text: 'Taste unknown plants or water to help identify them.', why: 'They may be poisonous or contaminated.' },
      { text: 'Walk through standing crops to take a shorter route.', why: 'That damages crops. Keep to paths and get permission first.' },
      { text: 'Reach into holes and under stones with bare hands.', why: 'Snakes and stinging animals shelter there. Use a stick.' },
    ],
  },
  drawing: {
    right: ['Keep sharp instruments in their case when you are not using them.', 'Sit with good posture and keep your work well lit.'],
    wrong: [
      { text: 'Point a compass at your neighbour to pass it across.', why: 'Pass sharp instruments handle first.' },
      { text: 'Blow eraser dust across the table towards other people.', why: 'Brush it away gently from the sheet.' },
      { text: 'Cut against a plastic ruler with a craft knife towards your hand.', why: 'Use a steel rule and cut away from your hand.' },
    ],
  },
  lab: {
    right: ['Wear eye protection and tie back long hair.', 'Keep hazardous materials away from food and drink.'],
    wrong: [
      { text: 'Smell a chemical by putting your nose over the container.', why: 'Waft vapour towards you. Never sniff directly.' },
      { text: 'Eat or drink at the bench while you wait for a result.', why: 'Food and work materials never mix.' },
      { text: 'Pour waste down the sink without asking.', why: 'Use the disposal your teacher has set out.' },
      { text: 'Leave spills for the end of the session.', why: 'Clear spills and report them at once.' },
    ],
  },
};
const TOOL_BANK: Record<GenRoom, string[]> = {
  workshop: ['Soldering iron', 'Grease gun', 'Paint roller', 'Spirit level', 'Tin snips', 'Wire stripper'],
  kitchen: ['Rolling pin', 'Colander', 'Potato masher', 'Pastry brush', 'Egg whisk', 'Sieve'],
  studio: ['Metronome', 'Music stand', 'Tracing paper', 'Palette knife', 'Tuning fork', 'Sketch pad'],
  field: ['Ranging pole', 'Spade', 'Soil auger', 'Hand lens', 'Tape measure', 'Clipboard'],
  drawing: ['Set square', 'Pair of compasses', 'French curve', 'Drawing board', 'Protractor', 'Tracing paper'],
  lab: ['Test tube rack', 'Filter funnel', 'Tripod stand', 'Wash bottle', 'Stirring rod', 'Measuring cylinder'],
};
const KIND_ROOM: Record<string, GenRoom> = { WORKSHOP: 'workshop', LAB: 'lab', FIELD: 'field', STUDIO: 'studio', PERFORMANCE: 'studio', DRAWING: 'drawing', COMPUTER: 'drawing' };

const STOP = new Set(['about', 'above', 'after', 'again', 'always', 'around', 'avoid', 'before', 'being', 'below', 'between', 'carefully', 'check', 'correct', 'correctly', 'could', 'during', 'each', 'every', 'first', 'from', 'have', 'into', 'keep', 'make', 'make', 'many', 'more', 'most', 'must', 'never', 'only', 'other', 'over', 'should', 'some', 'such', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'under', 'until', 'used', 'using', 'very', 'well', 'were', 'what', 'when', 'where', 'which', 'while', 'with', 'without', 'would', 'your']);
/** The words a line would be recognised by: its point in the keyword stand-in. */
export function lineKeywords(line: string, n = 4): string[] {
  const words = (line.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w));
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, n).map((w) => (w.length > 6 ? w.slice(0, w.length - 2) : w));
}

/** The last worked "= number unit" in a lesson's calculation, as a fill-in: the fallback numeric. */
export function derivedNumeric(data: string): { prompt: string; value: number; unit: string; shown: string } | null {
  const text = data.replace(/\s+/g, ' ').trim();
  const re = /=\s*(?:about\s*|approximately\s*|≈\s*)?(N\s?)?(-?\d[\d,]*(?:\.\d+)?)\s*(%|[a-zA-Z°µ/]{0,8})/g;
  let last: RegExpExecArray | null = null;
  for (let m = re.exec(text); m; m = re.exec(text)) last = m;
  if (!last) return null;
  const value = parseNumber(last[2]);
  if (value === null || !Number.isFinite(value) || Math.abs(value) < 1e-9) return null;
  const before = text.slice(0, last.index).trim();
  if (before.length < 12) return null;
  let unit = (last[1] ? '' : last[3]) ?? '';
  // A word straight after the number is the sentence going on, not a unit.
  if (unit.length > 4 && !/\//.test(unit)) unit = '';
  if (/^(so|and|or|the|of|to|in|at|is|per|each|for|with|by|pieces|parts)$/i.test(unit)) unit = '';
  return { prompt: `Complete the working: ${clip(before, 300)} = ?${last[1] ? ' (naira)' : ''}`, value, unit, shown: `${last[1] ? 'N' : ''}${last[2]}${unit ? ` ${unit}` : ''}` };
}

const fill = (s: string, vars: Record<string, number | string>) => s.replace(/\{([a-z][a-z0-9]*)\}/gi, (m, k: string) => (k in vars ? String(vars[k]) : m));

function numericItems(seed: number, l: GenLesson, en: GenEnrichmentLesson | undefined): GenKeyNumeric[] {
  const out: GenKeyNumeric[] = [];
  for (const n of pickHash(seed, (en?.numerics ?? []).map((x) => ({ ...x, text: x.id })), 3)) {
    const vars: Record<string, number> = {};
    for (const [k, v] of Object.entries(n.vars ?? {})) {
      const steps = Math.floor((v.max - v.min) / v.step + 1e-9);
      const dp = (String(v.step).split('.')[1] ?? '').length;
      vars[k] = roundDp(v.min + Math.floor(labRandom(seed, `num:${n.id}:${k}`)() * (steps + 1)) * v.step, dp);
    }
    const value = n.formula ? genFormula(n.formula, vars) : n.answer!;
    const abs = n.tolerance.abs ?? Math.abs(value) * (n.tolerance.rel ?? 0);
    const shown = n.decimals !== undefined ? value.toFixed(n.decimals) : String(roundDp(value, 4));
    const prompt = fill(n.prompt, vars);
    out.push({
      id: opaqueId(seed, 'num', n.id),
      prompt,
      wantsUnit: !!n.unit,
      value,
      abs,
      shown,
      unit: n.unit,
      units: [n.unit, ...(n.unitAliases ?? [])].filter(Boolean),
      working: n.working ? fill(n.working, { ...vars, answer: shown }) : `${prompt} Answer: ${shown}${n.unit ? ` ${n.unit}` : ''}.`,
    });
  }
  if (!out.length) {
    const d = derivedNumeric(l.dataAndCalculations);
    if (d) out.push({ id: opaqueId(seed, 'num', d.prompt), prompt: d.prompt, wantsUnit: !!d.unit, value: d.value, abs: Math.abs(d.value) * DERIVED_NUMERIC_REL, shown: d.shown, unit: d.unit, units: d.unit ? [d.unit] : [], working: `${d.prompt.replace('Complete the working: ', '').replace(/ = \?.*$/, '')} = ${d.shown}.` });
  }
  return out;
}

/** The paper (public) and the key (server only) of a lesson for a seed. Pure: same lesson and seed, same paper and ids. */
export function buildGen(l: GenLesson, seed: number): { paper: GenPaper; key: GenKey } {
  const en = l.gen?.enrichment;
  const room: GenRoom = en?.room ?? l.gen?.room ?? KIND_ROOM[l.kind] ?? 'workshop';
  const bank = SAFETY_BANK[room];

  // ---- safety: the lesson's own lines, the authored ones, then the room's true basics
  const rightSafety = uniq([...l.safety, ...(en?.safety?.correct ?? []), ...(l.safety.length + (en?.safety?.correct?.length ?? 0) < 3 ? bank.right : [])]);
  const wrongSafety = en?.safety?.wrong?.length ? en.safety.wrong : bank.wrong;
  const safetyRight = pickHash(seed, rightSafety.map((text) => ({ text })), MAX_SAFETY_RIGHT);
  const safetyWrong = pickHash(seed, wrongSafety, spread(wrongSafety.length, Math.max(3, Math.min(5, safetyRight.length))));
  const safety: Keyed[] = [...safetyRight.map((x) => ({ id: opaqueId(seed, 'safety', x.text), text: x.text, correct: true, why: 'Correct practice for this job.' })), ...safetyWrong.map((x) => ({ id: opaqueId(seed, 'safety', x.text), text: x.text, correct: false, why: x.why }))];

  // ---- set out: everything the lesson lists, plus distractors
  const needed = uniq([...l.apparatus, ...l.materials]);
  const optionalNames = new Set((en?.setOut?.optional ?? []).map((x) => x.toLowerCase().trim()));
  const neededPicked = pickHash(seed, needed.map((text) => ({ text })), MAX_TOOLS_RIGHT);
  const neededLower = new Set(needed.map((x) => x.toLowerCase()));
  const pool = uniq([...(l.gen?.pool?.tools ?? []), ...TOOL_BANK[room]]).filter((x) => !neededLower.has(x.toLowerCase()) && !needed.some((n) => n.toLowerCase().includes(x.toLowerCase()) || x.toLowerCase().includes(n.toLowerCase())));
  const distractorPool = en?.setOut?.distractors?.length ? en.setOut.distractors.map((d) => ({ text: d.name, why: d.why })) : pool.map((text) => ({ text, why: `${text} is not needed for this job.` }));
  const distractors = pickHash(seed, distractorPool, spread(distractorPool.length, Math.max(3, Math.min(5, Math.ceil(neededPicked.length * 0.6)))));
  const tools: Keyed[] = [...neededPicked.map((x) => ({ id: opaqueId(seed, 'tool', x.text), text: x.text, correct: true, why: 'This job needs it.' })), ...distractors.map((x) => ({ id: opaqueId(seed, 'tool', x.text), text: x.text, correct: false, why: x.why }))];
  const shapeOf = (name: string): GenToolShape => en?.setOut?.shapes?.[name] ?? genToolShape(name);

  // ---- procedure: at most MAX_STEPS consecutive steps
  const leaveOut = new Set((en?.procedure?.leaveOut ?? []).map((n) => n - 1));
  const numbered = l.procedure.map((text, i) => ({ text, i })).filter((s) => !leaveOut.has(s.i));
  const start = numbered.length > MAX_STEPS ? Math.floor(labRandom(seed, 'window')() * (numbered.length - MAX_STEPS + 1)) : 0;
  const window = numbered.slice(start, start + MAX_STEPS);
  const stepId = (text: string) => opaqueId(seed, 'step', text);
  const anyOrder = (en?.procedure?.anyOrder ?? []).map((g) => g.map((n) => window.find((s) => s.i === n - 1)).filter((s): s is (typeof window)[number] => !!s).map((s) => stepId(s.text))).filter((g) => g.length > 1);

  // ---- decisions: authored, else "what comes next" from the procedure and the quick check
  const decisions: GenKeyDecision[] = [];
  const authored = en?.decisions ?? [];
  for (const d of pickHash(seed, authored.map((x) => ({ ...x, text: x.id })), 3)) {
    const options = d.options.map((o) => ({ id: opaqueId(seed, `dec:${d.id}`, o.text), text: o.text, correct: o.correct, consequence: o.consequence }));
    decisions.push({
      id: opaqueId(seed, 'dec', d.id),
      prompt: d.prompt,
      context: l.procedure[d.afterStep - 1],
      options: byHash(seed, options).map((o) => ({ id: o.id, text: o.text })),
      right: options.find((o) => o.correct)!.id,
      consequence: Object.fromEntries(options.map((o) => [o.id, o.consequence])),
    });
  }
  if (decisions.length < 2) {
    // A quick-check question is a decision about the method; the key stays here too.
    for (const c of pickHash(seed, (l.checkQuestions ?? []).map((q) => ({ ...q, text: q.q })), 2 - decisions.length)) {
      const options = c.options.map((text, i) => ({ id: opaqueId(seed, `chk:${c.q}`, text), text, right: i === c.answer }));
      decisions.push({
        id: opaqueId(seed, 'dec', c.q),
        prompt: c.q,
        options: byHash(seed, options).map((o) => ({ id: o.id, text: o.text })),
        right: options.find((o) => o.right)!.id,
        consequence: Object.fromEntries(options.map((o) => [o.id, o.right ? c.explanation || 'Yes.' : `Not quite. ${c.explanation}`.trim()])),
      });
    }
  }
  if (decisions.length < 2 && window.length >= 3) {
    const i = Math.floor(labRandom(seed, 'next')() * (window.length - 1));
    const now = window[i]!;
    const next = window[i + 1]!;
    const others = pickHash(seed, window.filter((s) => s !== now && s !== next), 2);
    const options = [next, ...others].map((s) => ({ id: opaqueId(seed, 'nxt', s.text), text: s.text }));
    decisions.push({
      id: opaqueId(seed, 'dec', `next:${now.text}`),
      prompt: 'You have just finished this step. What do you do next?',
      context: now.text,
      options: byHash(seed, options),
      right: options[0]!.id,
      consequence: Object.fromEntries(options.map((o, k) => [o.id, k === 0 ? 'Yes: that is the next step.' : 'That step does not come next: going out of order wastes work or spoils it.'])),
    });
  }

  // ---- observe
  const observations: GenKeyChoice[] = [];
  for (const o of pickHash(seed, (en?.observations ?? []).map((x) => ({ ...x, text: x.id })), 2)) {
    const options = o.options.map((x) => ({ id: opaqueId(seed, `obs:${o.id}`, x.text), text: x.text, correct: x.correct, why: x.why }));
    const right = options.find((x) => x.correct)!;
    observations.push({ id: opaqueId(seed, 'obs', o.id), prompt: o.prompt, right: right.id, rightText: right.text, why: Object.fromEntries(options.map((x) => [x.id, x.why ?? (x.correct ? 'Yes.' : 'That is not what you should find here.')])) });
    (observations.at(-1) as GenKeyChoice & { options?: GenOption[] }).options = byHash(seed, options).map((x) => ({ id: x.id, text: x.text }));
  }
  if (!observations.length && l.expectedObservations) {
    const rightText = clip(firstSentences(l.expectedObservations, 2), 300);
    const wrong = pickHash(seed, uniq(l.gen?.pool?.observations ?? []).filter((x) => x !== rightText).map((text) => ({ text })), 3);
    if (wrong.length >= 2) {
      const options = [{ text: rightText }, ...wrong].map((x) => ({ id: opaqueId(seed, 'obsd', x.text), text: x.text }));
      const k: GenKeyChoice & { options?: GenOption[] } = { id: opaqueId(seed, 'obs', 'derived'), prompt: 'Which of these is what you should find at the end of this practical?', right: options[0]!.id, rightText, why: Object.fromEntries(options.map((x, i) => [x.id, i === 0 ? 'Yes.' : `That belongs to a different practical. Here: ${rightText}`])), options: byHash(seed, options) };
      observations.push(k);
    }
  }
  const numerics = numericItems(seed, l, en);

  // ---- spot the fault
  const faults: GenKeyFault[] = [];
  for (const f of pickHash(seed, (en?.faults ?? []).map((x) => ({ ...x, text: x.id })), 1)) {
    const lines = f.lines.map((x) => ({ id: opaqueId(seed, `flt:${f.id}`, x.text), text: x.text, fault: x.fault, why: x.why }));
    faults.push({ id: opaqueId(seed, 'flt', f.id), scenario: f.scenario, lines: byHash(seed, lines).map((x) => ({ id: x.id, text: x.text })), faults: lines.filter((x) => x.fault).map((x) => x.id), why: Object.fromEntries(lines.map((x) => [x.id, x.why])) });
  }
  if (!faults.length) {
    const bad = pickHash(seed, uniq([...l.commonMistakes, ...l.sourcesOfError]).map((text) => ({ text })), 3);
    const good = pickHash(seed, uniq(l.precautions).map((text) => ({ text })), 3);
    if (bad.length && good.length) {
      const lines = [...bad.map((x) => ({ ...x, fault: true })), ...good.map((x) => ({ ...x, fault: false }))].map((x) => ({ id: opaqueId(seed, 'fltd', x.text), text: x.text, fault: x.fault }));
      faults.push({ id: opaqueId(seed, 'flt', 'derived'), scenario: `A student's work on "${l.title}" was reviewed. Tap every line that is a fault or a source of error; leave the sound practice alone.`, lines: byHash(seed, lines).map((x) => ({ id: x.id, text: x.text })), faults: lines.filter((x) => x.fault).map((x) => x.id), why: Object.fromEntries(lines.map((x) => [x.id, x.fault ? 'This is a mistake examiners look for in this practical.' : 'This is sound practice, not a fault.'])) });
    }
  }

  // ---- written answers
  const precLines = l.precautions.length ? l.precautions : l.safety;
  const precKeys = precLines.slice(0, 6).map((p) => lineKeywords(p)).filter((g) => g.length);
  const explainGuide = en?.written?.explainGuide ?? firstSentences(l.expectedObservations || l.aim, 3);
  const explainKeys = en?.written?.explainKeywords ?? lineKeywords(explainGuide, 8).map((w) => [w]);
  const written = {
    precautions: { guide: `Any two of: ${precLines.join(' ')}`, keywords: precKeys, need: Math.min(2, precKeys.length || 1), model: precLines.slice(0, 2).join(' ') },
    explanation: { guide: explainGuide, keywords: explainKeys, need: en?.written?.explainNeed ?? Math.min(2, explainKeys.length || 1), model: explainGuide },
  };

  const paper: GenPaper = {
    room,
    title: l.title,
    aim: l.aim,
    board: en?.board?.length ? en.board : [clip(l.title, 60), clip(l.aim, 70), 'Safety first, then set out your bench'],
    feedback: false,
    enriched: !!en,
    safety: byHash(seed, safety).map((x) => ({ id: x.id, text: x.text })),
    tools: byHash(seed, tools).map((x): GenTool => ({ id: x.id, text: x.text, shape: shapeOf(x.text) })),
    steps: byHash(seed, window.map((s) => ({ id: stepId(s.text), text: s.text }))),
    decisions: byHash(seed, decisions.map((d) => ({ ...d, text: d.id }))).map(({ id, prompt, context, options }) => ({ id, prompt, ...(context ? { context } : {}), options })),
    observations: observations.map((o) => ({ id: o.id, prompt: o.prompt, options: (o as GenKeyChoice & { options: GenOption[] }).options })),
    numerics: numerics.map((n) => ({ id: n.id, prompt: n.prompt, wantsUnit: n.wantsUnit })),
    faults: faults.map((f) => ({ id: f.id, scenario: f.scenario, lines: f.lines })),
    written: {
      precautions: en?.written?.precautionsPrompt ?? 'State two precautions you must take in this practical, and say why each matters.',
      explanation: en?.written?.explainPrompt ?? 'In your own words, what should the finished work show, and what does that tell you?',
    },
  };
  const key: GenKey = {
    safety,
    tools,
    optional: tools.filter((t) => optionalNames.has(t.text.toLowerCase().trim())).map((t) => t.id),
    order: window.map((s) => stepId(s.text)),
    anyOrder,
    stepText: Object.fromEntries(window.map((s) => [stepId(s.text), s.text])),
    decisions,
    observations,
    numerics,
    faults,
    written,
  };
  return { paper, key };
}

// ---- marking one part at a time (shared by the grader and the guided check)

/** (right picks − wrong picks) ÷ everything right. */
export function pickFraction(right: string[], picked: string[], ignore: string[] = []) {
  const want = right.filter((x) => !ignore.includes(x));
  const hits = want.filter((x) => picked.includes(x)).length;
  const wrong = [...new Set(picked)].filter((x) => !right.includes(x) && !ignore.includes(x));
  return { fraction: want.length ? Math.max(0, (hits - wrong.length) / want.length) : 1, hits, wrong, missed: want.length - hits };
}

/** Pairs of steps in the right relative order (pairs inside an any-order group always count), scaled so that shuffled work earns nothing. */
export function orderFraction(order: string[], key: Pick<GenKey, 'order' | 'anyOrder'>) {
  const n = key.order.length;
  if (n < 2) return { fraction: 1, placed: n, firstWrong: -1, perfect: true };
  const seen = new Set<string>();
  const list = order.filter((x) => key.order.includes(x) && !seen.has(x) && !!seen.add(x));
  const at = new Map(list.map((x, i) => [x, i]));
  const free = (a: string, b: string) => key.anyOrder.some((g) => g.includes(a) && g.includes(b));
  let good = 0;
  let total = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const a = key.order[i]!;
      const b = key.order[j]!;
      total++;
      const pa = at.get(a);
      const pb = at.get(b);
      if (pa === undefined || pb === undefined) continue;
      if (free(a, b) || pa < pb) good++;
    }
  const share = good / total;
  const perfect = list.length === n && good === total;
  // Where the student's list first breaks a pair.
  let firstWrong = -1;
  outer: for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      if (!free(a, b) && key.order.indexOf(a) > key.order.indexOf(b)) {
        firstWrong = i;
        break outer;
      }
    }
  return { fraction: perfect ? 1 : Math.max(0, (share - 0.5) * 2), placed: list.length, firstWrong, perfect };
}

export function unitOk(raw: string, units: string[]) {
  if (!units.length) return true;
  const u = raw.trim();
  if (!u) return false;
  const a = normaliseUnit(u);
  return units.some((x) => x.toLowerCase() === u.toLowerCase() || normaliseUnit(x) === a);
}
export const numericRight = (n: GenKeyNumeric, value: string) => withinAbs(parseNumber(value.replace(/^N\s?/i, '').replace(/[^\d.,eE×x^*+\-⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+$/, '')), n.value, n.abs);

/** The guided feedback for one part: what happens, what is wrong, how many are missing. It reveals only what this answer earned. */
export function genCheck(key: GenKey, input: GenCheckInput): GenCheckResult {
  const pick = input.pick ?? [];
  const lists = (items: Keyed[], ignore: string[] = []) => {
    const right = items.filter((x) => x.correct).map((x) => x.id);
    const r = pickFraction(right, pick, ignore);
    const wrong = r.wrong.map((id) => ({ id, why: items.find((x) => x.id === id)?.why ?? 'That is not right here.' }));
    const ok = !wrong.length && !r.missed;
    return { ok, wrong, missed: r.missed, message: ok ? 'All correct.' : `${wrong.length ? `${wrong.length} choice${wrong.length === 1 ? ' is' : 's are'} wrong. ` : ''}${r.missed ? `${r.missed} more to find.` : ''}`.trim() };
  };
  if (input.section === 'safety') return lists(key.safety);
  if (input.section === 'tools') return lists(key.tools, key.optional);
  if (input.section === 'order') {
    const r = orderFraction(pick, key);
    if (r.perfect) return { ok: true, message: 'That order works.', wrong: [], missed: 0 };
    if (r.placed < key.order.length) return { ok: false, message: `Place all ${key.order.length} steps first.`, wrong: [], missed: key.order.length - r.placed };
    return { ok: false, message: r.firstWrong >= 0 ? `Step ${r.firstWrong + 1} in your list is too early: something needs doing before it.` : 'Not quite: look again at what each step depends on.', wrong: [], missed: 0 };
  }
  if (input.section === 'decision') {
    const d = key.decisions.find((x) => x.id === input.id);
    const c = pick[0] ?? '';
    if (!d || !d.consequence[c]) return { ok: false, message: 'Choose an option first.', wrong: [], missed: 0 };
    return { ok: d.right === c, message: d.consequence[c]!, wrong: d.right === c ? [] : [{ id: c, why: d.consequence[c]! }], missed: 0 };
  }
  if (input.section === 'observation') {
    const o = key.observations.find((x) => x.id === input.id);
    const c = pick[0] ?? '';
    if (!o || !o.why[c]) return { ok: false, message: 'Choose an option first.', wrong: [], missed: 0 };
    return { ok: o.right === c, message: o.why[c]!, wrong: o.right === c ? [] : [{ id: c, why: o.why[c]! }], missed: 0 };
  }
  if (input.section === 'numeric') {
    const n = key.numerics.find((x) => x.id === input.id);
    if (!n) return { ok: false, message: 'That result is not on this paper.', wrong: [], missed: 0 };
    const v = numericRight(n, input.value ?? '');
    const u = unitOk(input.unit ?? '', n.units);
    return { ok: v && u, message: v && u ? 'Correct.' : v ? 'The number is right: add the correct unit.' : 'That number does not come out right: check your working.', wrong: [], missed: 0 };
  }
  const f = key.faults.find((x) => x.id === input.id);
  if (!f) return { ok: false, message: 'That scenario is not on this paper.', wrong: [], missed: 0 };
  const r = pickFraction(f.faults, pick);
  const wrong = r.wrong.map((id) => ({ id, why: f.why[id] ?? 'That is sound work.' }));
  const ok = !wrong.length && !r.missed;
  return { ok, wrong, missed: r.missed, message: ok ? 'All the faults found.' : `${wrong.length ? 'Some of those lines are sound work. ' : ''}${r.missed ? `${r.missed} fault${r.missed === 1 ? '' : 's'} still to find.` : ''}`.trim() };
}

/** Model answers for a key: Demo, and the "full marks" checks. */
export function genModelState(key: GenKey): GenPracticalState {
  return {
    stage: 5,
    safety: key.safety.filter((x) => x.correct).map((x) => x.id),
    tools: key.tools.filter((x) => x.correct).map((x) => x.id),
    order: key.order,
    decisions: Object.fromEntries(key.decisions.map((d) => [d.id, d.right])),
    observations: Object.fromEntries(key.observations.map((o) => [o.id, o.right])),
    numerics: Object.fromEntries(key.numerics.map((n) => [n.id, { value: n.shown.replace(/^N/, '').split(' ')[0]!.replace(/,/g, ''), unit: n.unit }])),
    faults: Object.fromEntries(key.faults.map((f) => [f.id, f.faults])),
    written: { precautions: key.written.precautions.model, explanation: key.written.explanation.model },
    log: [],
  };
}

export function genReveal(key: GenKey): GenReveal {
  return {
    correct: [...key.safety.filter((x) => x.correct).map((x) => x.id), ...key.tools.filter((x) => x.correct).map((x) => x.id), ...key.decisions.map((d) => d.right), ...key.observations.map((o) => o.right), ...key.faults.flatMap((f) => f.faults)],
    order: key.order,
    numbers: Object.fromEntries(key.numerics.map((n) => [n.id, `${n.shown}${n.unit && !n.shown.endsWith(n.unit) ? ` ${n.unit}` : ''}`])),
  };
}

/** The worked example: a seed the student's attempt can't share, the paper, the model answers and the demonstrator's reasons. */
export function genDemo(l: GenLesson, studentSeed = 0): GenDemoView {
  const seed = ((studentSeed * 31 + 7919) % 2_000_003) + 1;
  const { paper, key } = buildGen(l, seed);
  const notes: Record<string, string> = {};
  for (const d of key.decisions) notes[d.id] = d.consequence[d.right] ?? '';
  for (const o of key.observations) notes[o.id] = o.why[o.right] ?? '';
  for (const n of key.numerics) notes[n.id] = n.working;
  for (const f of key.faults) notes[f.id] = f.faults.map((id) => f.why[id]).filter(Boolean).join(' ');
  return { paper, model: genModelState(key), notes };
}

/** Whether a lesson's stored data can run: a paper needs at least steps or tools. */
export const genRunnable = (l: GenLesson) => l.procedure.length >= 2 || l.apparatus.length + l.materials.length >= 2;
