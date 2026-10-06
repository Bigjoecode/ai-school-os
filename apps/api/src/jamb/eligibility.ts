import type { JambStatus } from '@aischool/shared';

/**
 * Reads JAMB's requirement wording ("Biology, Chemistry and Physics or
 * Mathematics", "Any three (3) Arts or Social Science subjects",
 * "Mathematics and any two (2) of …") into a rule a student's subjects can be
 * checked against, and checks them honestly:
 *
 *  - MATCH only when the whole text was understood and the subjects
 *    certainly satisfy it (named subjects, "any subject", or subjects that
 *    are clearly in a group such as Literature for "an Arts subject");
 *  - MISMATCH only when the whole text was understood and a subject it
 *    clearly requires is missing;
 *  - CHECK for everything else (vague wording, "relevant subjects", a
 *    borderline group member, extra conditions): the student reads the text.
 *
 * The official text is always shown beside the result; this only helps.
 */

export type Status = JambStatus;

export const isCredit = (g: string) => /^(A1|B2|B3|C4|C5|C6)$/i.test(g.trim());

const ENGLISH = '__ENGLISH__';

/** Phrase → our subject name. Order matters (Literature before English, etc.). */
const LEXICON: [RegExp, string][] = [
  [/^(use of )?english( language)?$|^english lang\.?$/, ENGLISH],
  [/^(lit\.?|literature)( in| in the)?( english| eng\.?)?( language)?$|^english literature$|^literature-in-english$/, 'Literature in English'],
  [/^further (mathematics|maths?)$/, 'Further Mathematics'],
  [/^(mathematics|maths?|mathematic|general mathematics)$/, 'Mathematics'],
  [/^physics$/, 'Physics'],
  [/^chemistry$/, 'Chemistry'],
  [/^biology$/, 'Biology'],
  [/^(agricultural science|agricultural sciences|agric\.? science|agriculture|agric\.?|agricultural)$/, 'Agricultural Science'],
  [/^geography$/, 'Geography'],
  [/^economics$/, 'Economics'],
  [/^commerce$/, 'Commerce'],
  [/^(principles? of accounts?|accounts?|accounting|financial accounting|book[- ]?keeping|principle of accounts)$/, 'Principles of Accounts'],
  [/^(government|govt\.?|government studies)$/, 'Government'],
  [/^history$/, 'History'],
  [/^(christian religious (studies|knowledge)|crs|crk|c\.r\.s\.?|christian religious studies \(crs\)|bible knowledge|christian studies)$/, 'Christian Religious Studies'],
  [/^(islamic (religious )?(studies|knowledge)|irs|irk|is|i\.s\.?|islamic religious studies \(irs\)|islamic religion)$/, 'Islamic Studies'],
  [/^(fine arts?|art|visual arts?|fine and applied arts?|fine & applied arts?)$/, 'Fine Arts'],
  [/^music$/, 'Music'],
  [/^french$/, 'French'],
  [/^arabic( language| studies)?$/, 'Arabic'],
  [/^hausa( language)?$/, 'Hausa'],
  [/^igbo( language)?$/, 'Igbo'],
  [/^yoruba( language)?$/, 'Yoruba'],
  [/^home economics$/, 'Home Economics'],
  [/^(physical and health education|physical & health education|phe|p\.h\.e\.?|physical education|health and physical education)$/, 'Physical and Health Education'],
  [/^(computer studies|computer science|computer|ict|information (and|&) communication technology)$/, 'Computer Studies'],
  [/^civic education$/, 'Civic Education'],
  [/^data processing$/, 'Data Processing'],
  [/^technical drawing$/, 'Technical Drawing'],
  [/^office practice$/, 'Office Practice'],
  [/^marketing$/, 'Marketing'],
  [/^animal husbandry$/, 'Animal Husbandry'],
  [/^(foods? and nutrition|foods?-nutrition|nutrition)$/, 'Food and Nutrition'],
  [/^(basic electricity|electricity)$/, 'Basic Electricity'],
  [/^(basic )?electronics$/, 'Electronics'],
  [/^auto[- ]?mechanics?$/, 'Auto Mechanics'],
  [/^metal ?work$/, 'Metalwork'],
  [/^wood ?work$/, 'Woodwork'],
  [/^(introduction to )?building construction$/, 'Building Construction'],
  [/^clothing( and |-)textiles?$/, 'Clothing and Textiles'],
  [/^(health sciences?|language-arts|nbc|ntc)$/, '~'],
  // Named in the brochure but not UTME subjects: understood, never on a student's list.
  [/^(general science|integrated science|basic science|rural science|integrated\/rural science|health science|social studies|business methods?|business studies|statistics|typewriting|shorthand|nature study|applied biology|commercial arithmetic|costing|edo|efik|ibibio|urhobo|ika|ukwani|tiv|nupe|kanuri|fulfulde|igala|idoma|izon|ijaw|isoko|itsekiri|esan|ebira|nigerian languages?|a nigerian language|german|russian|latin|greek|fisheries|mechanical engineering craft|applied electricity|tourism|catering craft practice|garment making)$/, '~'],
];

export function canonicalSubject(phrase: string): string | null {
  const p = phrase
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
    .replace(/^(a|an|the)\s+/, '')
    .trim();
  if (!p) return null;
  for (const [re, name] of LEXICON) if (re.test(p)) return name === '~' ? `~${p}` : name;
  return null;
}

// ---------------------------------------------------------------- categories

type Cat = 'ANY' | 'SCIENCE' | 'ARTS' | 'SOCIAL' | 'PHYSICAL' | 'COMMERCIAL' | 'RELEVANT' | 'LANGUAGE';

const CATS: Record<Exclude<Cat, 'ANY' | 'RELEVANT'>, { sure: string[]; maybe: string[] }> = {
  SCIENCE: {
    sure: ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Agricultural Science', 'Further Mathematics', 'Computer Studies'],
    maybe: ['Geography', 'Home Economics', 'Physical and Health Education', 'Technical Drawing', 'Food and Nutrition', 'Data Processing', 'Animal Husbandry', 'Basic Electricity', 'Electronics'],
  },
  PHYSICAL: { sure: ['Physics', 'Chemistry'], maybe: ['Mathematics', 'Further Mathematics', 'Geography'] },
  ARTS: {
    sure: ['Literature in English', 'History', 'Christian Religious Studies', 'Islamic Studies', 'French', 'Arabic', 'Hausa', 'Igbo', 'Yoruba', 'Fine Arts', 'Music'],
    maybe: ['Government', 'Civic Education'],
  },
  SOCIAL: { sure: ['Economics', 'Government', 'Geography', 'Commerce'], maybe: ['History', 'Principles of Accounts', 'Civic Education', 'Christian Religious Studies', 'Islamic Studies', 'Marketing', 'Office Practice'] },
  COMMERCIAL: { sure: ['Commerce', 'Principles of Accounts', 'Economics', 'Office Practice', 'Marketing'], maybe: ['Mathematics', 'Data Processing'] },
  LANGUAGE: { sure: ['French', 'Arabic', 'Hausa', 'Igbo', 'Yoruba'], maybe: ['Literature in English'] },
};

const CAT_LABEL: Record<Cat, string> = {
  ANY: 'any subject',
  SCIENCE: 'a Science subject',
  ARTS: 'an Arts subject',
  SOCIAL: 'a Social Science subject',
  PHYSICAL: 'a Physical Science subject',
  COMMERCIAL: 'a Commercial subject',
  RELEVANT: 'a relevant subject',
  LANGUAGE: 'a language',
};

function catWord(w: string): Cat | null {
  const t = w.trim().replace(/\bsubjects?\b/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return 'ANY';
  if (/^(social|social sciences?|social studies subjects?|management sciences?|social\/management sciences?)$/.test(t)) return 'SOCIAL';
  if (/^(physical sciences?)$/.test(t)) return 'PHYSICAL';
  if (/^(sciences?|science based|basic sciences?|natural sciences?|biological sciences?)$/.test(t)) return 'SCIENCE';
  if (/^(arts?|humanities|arts and humanities)$/.test(t)) return 'ARTS';
  if (/^(commercial|business|commercial\/business)$/.test(t)) return 'COMMERCIAL';
  if (/^(relevant|related|other relevant)$/.test(t)) return 'RELEVANT';
  if (/^(nigerian )?languages?$/.test(t)) return 'LANGUAGE';
  return null;
}

/** 2 = certainly counts, 1 = might count (check), 0 = doesn't. */
function catFit(cat: Cat, s: string): 0 | 1 | 2 {
  if (cat === 'ANY') return 2;
  if (cat === 'RELEVANT') return 1;
  const c = CATS[cat];
  return c.sure.includes(s) ? 2 : c.maybe.includes(s) ? 1 : 0;
}

// ---------------------------------------------------------------- parsing

interface Opt {
  subjects: string[];
  cats: Cat[];
}
export interface Unit {
  count: number;
  opts: Opt[];
  /** From "any two of A, B, C": the chosen subjects must be different options. */
  group: boolean;
  /** Padding we added because the text named fewer subjects than needed. */
  inferred?: boolean;
}
export interface ParsedRule {
  units: Unit[];
  slots: number;
  /** Why the text couldn't be read fully (empty = fully understood). */
  doubts: string[];
  /** More sentences of conditions after the part we read (they can only be checked by reading). */
  extra?: boolean;
  /** O'level: the number of credits required. */
  credits?: number;
}

const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, a: 1, an: 1, another: 1, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9 };

function clean(text: string): string {
  let t = ` ${text} `
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\(\s*\d+\s*\)?/g, ' ') // "two (2)" → "two", and the brochure's "(2relevant"
    .replace(/\(\s*s\s*\)/gi, 's')
    .replace(/(^|[\s:,])\d{1,2}\s*[.)]\s*(?=[A-Za-z])/g, '$1, ') // "1. Economics 2. History" → list
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/;/g, ',')
    .replace(/\bplus\b/g, ' and ')
    .replace(/\beither\b/g, ' ')
    .replace(/\band\s*\/\s*or\b/g, '/')
    .replace(/\bof(?=arts|science|social)/g, 'of ')
    .replace(/\bsocialscience/g, 'social science')
    .replace(/\s+/g, ' ');
  // Subject names that contain "and" (so splitting on "and" doesn't break them).
  t = t
    .replace(/physical and health education/g, 'phe')
    .replace(/health and physical education/g, 'phe')
    .replace(/fine and applied arts?/g, 'fine arts')
    .replace(/foods? and nutrition/g, 'food-nutrition')
    .replace(/clothing and textiles?/g, 'clothing-textiles')
    .replace(/information and communication technology/g, 'ict')
    .replace(/\barts? and social sciences?\b/g, 'arts/social science')
    .replace(/\bsocial sciences? and arts?\b/g, 'social science/arts')
    .replace(/\bliterature in english language\b/g, 'literature in english')
    .replace(/\blanguage arts\b/g, 'language-arts');
  // Group intros, in one shape: "<n> of <list>".
  t = t
    .replace(/\bany of the (one|two|three|four)\b\s*:?/g, 'any $1 of ')
    .replace(/\b(one|two|three|four)\s+(?:other\s+)?(?:relevant\s+)?(?:subjects?\s+|others\s+)?(?:chosen\s+|selected\s+)?(?:from|of|among|in)\b/g, '$1 of')
    .replace(/\b(?:of|from)\s+the\s+following(?:\s+(?:[a-z]+\s+){0,3}?subjects?)?\s*:?/g, 'of ')
    .replace(/\bof the (?=arts|sciences?|social)/g, 'of ')
    .replace(/\bany other (?:subjects? )?from\b/g, 'any one of')
    .replace(/\bany other of\b/g, 'any one of')
    .replace(/\bany of\b/g, 'any one of')
    .replace(/:/g, ' ')
    .replace(/\s+/g, ' ');
  // "Biology, Chemistry any other Science subject" → a missing comma.
  t = t.replace(/\b([a-z]+)\s+(any|another)\s/g, (m, w: string, a: string) => (['and', 'or', 'of', 'from', 'in', 'include', 'including', 'with', 'plus'].includes(w) ? m : `${w}, ${a} `));
  return t.trim().replace(/[.\s]+$/, '');
}

const QUALIFIERS = /\b(including|excluding|except|exception|but not|not|preferably|at least|at most|credit|pass(es)?|merit|sitting|sittings|equivalent|nb|group|required|compulsory|must|only|olevel|o'level|'o' level|a'level|'a' level|ssce?|wassce|neco|nabteb|gce|tc ?ii|grade)\b/;

function splitTop(s: string, ors: boolean): string[] {
  return s
    .split(ors ? /\s*,\s*|\s+and\s+|\s+or\s+/ : /\s*,\s*|\s+and\s+/)
    .map((x) => x.trim())
    .filter((x) => x && !/^(and|or|of)$/.test(x));
}

/** One list item: a subject (with "/" or "or" alternatives), or "<n> <category> subject(s)". */
function parseItem(raw: string, doubts: string[]): Unit | null {
  let s = raw.trim().replace(/^(and|or|the)\s+/, '');
  if (!s) return null;
  let count = 1;
  let generic = /\bsubjects?\b/.test(s);
  // Leading quantifiers: "any other two", "another", "one (1) other", "two", "any".
  for (;;) {
    const m = /^(any|other|another|one|two|three|four|a|an|1|2|3|4)\b\s*/.exec(s);
    if (!m) break;
    const w = m[1]!;
    if (w === 'a' || w === 'an') {
      // "a basic science", "an arts subject": only a quantifier before a category.
      if (!catWord(s.slice(m[0].length))) break;
    }
    if (w !== 'any' && w !== 'other') count = NUM[w] ?? count;
    if (w !== 'a' && w !== 'an') generic = true;
    s = s.slice(m[0].length);
  }
  s = s.replace(/^other\s+/, '').replace(/\s+subjects?$/, '').trim();
  if (QUALIFIERS.test(s) || /\bany\b/.test(s)) {
    doubts.push(`"${raw.trim()}"`);
    return null;
  }
  const parts = s.split(/\s*\/\s*|\s+or\s+/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) {
    if (generic) return { count, opts: [{ subjects: [], cats: ['ANY'] }], group: false };
    return null;
  }
  const opt: Opt = { subjects: [], cats: [] };
  let english = false;
  for (const p of parts) {
    const subj = generic && catWord(p) ? null : canonicalSubject(p);
    if (subj === ENGLISH) {
      english = true;
      continue;
    }
    if (subj) {
      opt.subjects.push(subj);
      continue;
    }
    const cat = catWord(p) ?? (p === 'art' && generic ? 'ARTS' : null);
    if (cat) {
      opt.cats.push(cat);
      continue;
    }
    doubts.push(`"${p}"`);
    return null;
  }
  if (english) opt.subjects.push(ENGLISH);
  return { count, opts: [opt], group: false };
}

function parseClause(text: string, doubts: string[]): Unit[] {
  const units: Unit[] = [];
  const intro = /\b(?:any\s+)?(?:other\s+)?(one|two|three|four)\s+(?:other\s+)?of\b/.exec(text);
  const head = intro ? text.slice(0, intro.index) : text;
  for (const item of splitTop(head, false)) {
    const u = parseItem(item, doubts);
    if (u) units.push(u);
  }
  if (intro) {
    const k = NUM[intro[1]!]!;
    const opts: Opt[] = [];
    for (const item of splitTop(text.slice(intro.index + intro[0].length), true)) {
      if (/\b(any|another|one|two|three|four)\b/.test(item)) {
        doubts.push(`"${item}"`);
        continue;
      }
      const u = parseItem(item, doubts);
      if (!u) continue;
      // A bare "arts" or "science" in a list means a subject from that group.
      for (const o of u.opts) {
        if (!o.subjects.length && !o.cats.length) continue;
        opts.push(o);
      }
    }
    if (opts.length) units.push({ count: k, opts, group: true });
    else doubts.push('an empty "any of" list');
  }
  return units;
}

/** A UTME subjects text → rule (three subjects besides Use of English). */
export function parseUtme(text: string): ParsedRule {
  const doubts: string[] = [];
  const t = clean(text);
  if (!t) return { units: [], slots: 0, doubts: ['no text'] };
  if (/\b(including|excluding|except|preferably|nb|or any|merit|credit|pass)\b/.test(t)) doubts.push('extra conditions');
  // Use of English is compulsory: an "English Language" item is that, not one of the three.
  const units = parseClause(t, doubts).filter((u) => !(u.opts.length === 1 && u.opts[0]!.subjects.length === 1 && u.opts[0]!.subjects[0] === ENGLISH && !u.opts[0]!.cats.length));
  const slots = units.reduce((n, u) => n + u.count, 0);
  if (slots > 3) doubts.push(`${slots} subjects besides English`);
  if (slots < 3 && slots > 0) units.push({ count: 3 - slots, opts: [{ subjects: [], cats: ['ANY'] }], group: false, inferred: true });
  if (!slots) doubts.push('no subjects found');
  return { units, slots: Math.max(slots, 3), doubts };
}

/** An O'level text → rule: the first sentence ("Five (5) SSC credit passes in …"). */
export function parseOlevel(text: string): ParsedRule {
  const doubts: string[] = [];
  let extra = false;
  const flat = text.replace(/\s+/g, ' ').trim();
  const head = /^(?:at least\s+)?(?:(one|two|three|four|five|six|seven|eight|nine|\d)\s*)?(?:\(\s*\d\s*\)\s*)?(?:ssce?|'o'\s*level|o'?\s*level|o\/level|wassce|senior secondary school certificate)?\s*(?:\/\s*[a-z]+\s*)?credits?\s*(?:passes)?\s*(?:or\s+(?:its\s+)?equivalents?|or\s+tc\s*ii\s+merits?)?\s*(?:,\s*)?(in|including|to include|which must include|which include|that include)\b/i.exec(flat);
  if (!head) return { units: [], slots: 0, doubts: ['the credit count could not be read'] };
  const stated = head[1] ? NUM[head[1].toLowerCase()] : undefined;
  const including = head[2]!.toLowerCase() !== 'in';
  let rest = flat.slice(head[0].length);
  // The first sentence only ("Further. Mathematics." is not a sentence end).
  const stop = /(?<!\b\d|\bFurther|\bNo)\.\s+(?=[A-Z'(])/.exec(rest);
  if (stop) {
    extra = true;
    rest = rest.slice(0, stop.index);
  }
  rest = rest.replace(/\bnot literature in english\b,?/i, ' ').replace(/\bat (not more than|most) (two|one|2|1)\s*(\(\s*\d\s*\))?\s*sittings?\b/i, ' ');
  const t = clean(rest);
  const units = parseClause(t, doubts).map((u) => ({ ...u, opts: u.opts.map((o) => ({ ...o, subjects: o.subjects.map((s) => (s === ENGLISH ? 'English Language' : s)) })) }));
  const slots = units.reduce((n, u) => n + u.count, 0);
  // "SSC credit passes in English Language and any three of …": as many credits as it lists.
  const credits = stated ?? slots;
  if (slots > credits) doubts.push(`${slots} subjects listed for ${credits} credits`);
  if (slots < credits) units.push({ count: credits - slots, opts: [{ subjects: [], cats: ['ANY'] }], group: false, inferred: !including });
  return { units, slots: Math.max(slots, credits), doubts, credits, extra };
}

// ---------------------------------------------------------------- checking

function optFit(o: Opt, s: string): 0 | 1 | 2 {
  if (o.subjects.includes(s)) return 2;
  let best: 0 | 1 | 2 = 0;
  for (const c of o.cats) best = Math.max(best, catFit(c, s)) as 0 | 1 | 2;
  return best;
}

/** Can the subjects fill every slot? 2 = certainly, 1 = only with borderline subjects, 0 = no. */
function fill(units: Unit[], subjects: string[], need: 1 | 2): boolean {
  const slots: { u: number }[] = [];
  units.forEach((u, i) => {
    for (let k = 0; k < u.count; k++) slots.push({ u: i });
  });
  const used = new Set<string>();
  const usedOpt = new Map<number, Set<number>>();
  const go = (i: number): boolean => {
    if (i === slots.length) return true;
    const u = units[slots[i]!.u]!;
    for (const s of subjects) {
      if (used.has(s)) continue;
      for (const [oi, o] of u.opts.entries()) {
        if (optFit(o, s) < need) continue;
        const takes = u.group && o.subjects.length > 0;
        const set = usedOpt.get(slots[i]!.u) ?? new Set<number>();
        if (takes && set.has(oi)) continue;
        used.add(s);
        if (takes) set.add(oi);
        usedOpt.set(slots[i]!.u, set);
        if (go(i + 1)) return true;
        used.delete(s);
        if (takes) set.delete(oi);
        break; // trying another option for the same subject in the same slot changes nothing (except group options)
      }
    }
    return false;
  };
  return go(0);
}

const listWords = (xs: string[], joiner = 'or') => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ${joiner} ${xs.at(-1)}`);

function optLabel(o: Opt): string {
  return listWords([...o.subjects.filter((s) => !s.startsWith('~')), ...o.subjects.filter((s) => s.startsWith('~')).map((s) => s.slice(1).replace(/\b\w/g, (c) => c.toUpperCase())), ...o.cats.map((c) => CAT_LABEL[c])]);
}

/** The rule in plain words, e.g. "Physics + Mathematics or Chemistry + 1 Science subject". */
export function describeRule(r: ParsedRule): string {
  if (!r.units.length) return '—';
  return r.units
    .map((u) => {
      const body = u.group ? `${u.count} of [${u.opts.map(optLabel).join('; ')}]` : `${u.count > 1 ? `${u.count} × ` : ''}${optLabel(u.opts[0]!)}`;
      return u.inferred ? `(${body}?)` : body;
    })
    .join(' + ');
}

export interface Verdict {
  status: Status;
  notes: string[];
  /** Named subjects the student lacks (MISMATCH), for highlighting. */
  missing: string[];
}

function strict(u: Unit) {
  return u.opts.every((o) => o.cats.length === 0 || o.cats.every((c) => c === 'ANY'));
}

/** Checks a parsed rule against a student's subjects (UTME: three besides English; O'level: their credits). */
export function judge(rule: ParsedRule, subjects: string[], kind: 'UTME' | 'OLEVEL'): Verdict {
  const what = kind === 'UTME' ? 'UTME subjects' : 'O’level credits';
  if (!rule.units.length) return { status: 'CHECK', notes: ['We couldn’t read this requirement — read JAMB’s wording below.'], missing: [] };
  const sure = !rule.doubts.length;
  const inferred = rule.units.some((u) => u.inferred);
  if (fill(rule.units, subjects, 2)) {
    if (sure && !inferred && !rule.extra) return { status: 'MATCH', notes: [`Your ${what} meet this requirement as written.`], missing: [] };
    if (sure && !inferred) return { status: 'CHECK', notes: [`Your ${what} meet the first part of this requirement — read the extra conditions in the wording.`], missing: [] };
    return { status: 'CHECK', notes: [inferred ? `Your ${what} fit the subjects this names, but it doesn’t name all of them — read the wording.` : `Your ${what} seem to fit, but part of the wording needs a careful read (${rule.doubts.slice(0, 2).join(', ')}).`], missing: [] };
  }
  // Which named subjects are clearly missing?
  const missing: string[] = [];
  const notes: string[] = [];
  for (const u of rule.units) {
    if (!strict(u) || u.inferred) continue;
    const named = u.opts.filter((o) => o.subjects.length && !o.cats.length);
    if (named.length !== u.opts.length) continue;
    const have = subjects.filter((s) => named.some((o) => o.subjects.includes(s))).length;
    if (have < u.count) {
      const labels = named.map(optLabel);
      missing.push(...named.flatMap((o) => o.subjects.filter((s) => !s.startsWith('~'))));
      notes.push(u.group ? `Needs ${u.count} of ${listWords(labels)}${have ? ` (you have ${have})` : ''}.` : `Needs ${labels[0]}.`);
    }
  }
  if (fill(rule.units, subjects, 1)) {
    return { status: 'CHECK', notes: [`It depends on whether your subjects count for the groups named (e.g. “an Arts subject”) — check with the institution.`], missing: [] };
  }
  // Fully understood, and no way to fill it even counting borderline subjects: a clear mismatch.
  if (sure) {
    if (!notes.length) {
      const groups = rule.units.filter((u) => !strict(u)).map((u) => `${u.count > 1 ? `${u.count} × ` : ''}${optLabel(u.opts[0]!)}`);
      notes.push(groups.length ? `Needs ${listWords(groups, 'and')} as well as the subjects it names — yours don’t cover it.` : `Your ${what} can’t cover everything this requires.`);
    }
    return { status: 'MISMATCH', notes, missing: [...new Set(missing)] };
  }
  return { status: 'CHECK', notes: notes.length ? notes.map((n) => `${n} Read the wording to be sure.`) : [`Your ${what} may not fit — read the wording carefully.`], missing: [...new Set(missing)] };
}

/** Words in the text that refer to the student's subjects (for highlighting). */
export function mentions(text: string, subjects: string[]): string[] {
  const found = new Set<string>();
  const words = text.match(/[A-Za-z'.&]+(?:[ -][A-Za-z'.&]+){0,4}/g) ?? [];
  const want = new Set(subjects);
  for (const chunk of words) {
    const tokens = chunk.split(/[ ]+/);
    for (let i = 0; i < tokens.length; i++) {
      for (let j = Math.min(tokens.length, i + 5); j > i; j--) {
        const phrase = tokens.slice(i, j).join(' ').replace(/[.,]+$/, '');
        const c = canonicalSubject(phrase);
        if (c && (want.has(c) || (c === ENGLISH && want.has('English Language')))) {
          found.add(phrase);
          i = j - 1;
          break;
        }
      }
    }
  }
  return [...found];
}
