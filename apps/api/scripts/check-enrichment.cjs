#!/usr/bin/env node
/**
 * Checks Guided practical enrichment against its schema, its lessons and the
 * engine. Run from apps/api:
 *
 *   node scripts/check-enrichment.cjs woodwork            one subject (the slug of the lesson file)
 *   node scripts/check-enrichment.cjs --all               every enrichment file
 *   node scripts/check-enrichment.cjs woodwork --stats    plus coverage per lesson
 *
 * It needs @aischool/shared built (npm run build -w packages/shared, from the repo root).
 * Exit code 0: no errors (warnings are advice). Exit code 1: fix the errors.
 */
const { existsSync, readdirSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });

const { genEnrichmentFileSchema, genEnrichmentLessonSchema, GEN_PRACTICAL, rubricTotal } = require('@aischool/shared');
const { buildGen, genModelState } = require('../src/practicals/graders/gen-paper');
const { genPracticalGrader } = require('../src/practicals/graders/gen-practical');
const { keywordMarks } = require('../src/practicals/graders/helpers');
const { cleanPractical, lessonPool } = require('../src/prisma/practicals-install');

const ROOT = resolve(__dirname, '../prisma/practicals');
const DIR = join(ROOT, 'enrichment');
const args = process.argv.slice(2);
const stats = args.includes('--stats');
const names = args.includes('--all') ? (existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')) : []) : args.filter((a) => !a.startsWith('--')).map((a) => a.replace(/\.json$/, ''));
if (!names.length) {
  console.error('Name a subject slug (e.g. woodwork), or use --all.');
  process.exit(2);
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const SEEDS = Array.from({ length: 40 }, (_, i) => 1009 * (i + 1) + 17);
let errors = 0;
let warnings = 0;

function checkFile(slug) {
  const err = (m) => (errors++, console.log(`  ERROR ${m}`));
  const warn = (m) => (warnings++, console.log(`  warn  ${m}`));
  console.log(`\n${slug}`);
  const path = join(DIR, `${slug}.json`);
  const lessonPath = join(ROOT, 'waec', `${slug}.json`);
  if (!existsSync(path)) return err(`no file ${path}`);
  if (!existsSync(lessonPath)) return err(`no lesson file ${lessonPath}: the enrichment file must have the same name as the lesson file`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return err(`not valid JSON: ${e.message}`);
  }
  const parsed = genEnrichmentFileSchema.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues.slice(0, 30)) err(`${i.path.join('.')}: ${i.message}`);
    return;
  }
  const file = JSON.parse(readFileSync(lessonPath, 'utf8'));
  const lessons = file.practicals.map((p) => cleanPractical(p)).filter(Boolean);
  const byId = new Map(lessons.map((l) => [l.id, l]));
  if (norm(file.subject) !== norm(parsed.data.subject)) warn(`subject "${parsed.data.subject}" differs from the lesson file's "${file.subject}"`);

  for (const [id, entry] of Object.entries(parsed.data.lessons)) {
    const l = byId.get(id);
    if (!l) {
      err(`${id}: no such lesson in ${slug}.json`);
      continue;
    }
    const say = (m) => err(`${id}: ${m}`);
    const hint = (m) => warn(`${id}: ${m}`);
    const steps = l.procedure.length;

    // ---- references into the lesson
    for (const d of entry.decisions ?? []) if (d.afterStep > steps) say(`decision ${d.id}: afterStep ${d.afterStep}, but the lesson has ${steps} steps`);
    for (const g of entry.procedure?.anyOrder ?? []) for (const n of g) if (n > steps) say(`anyOrder: step ${n} does not exist (${steps} steps)`);
    for (const n of entry.procedure?.leaveOut ?? []) if (n > steps) say(`leaveOut: step ${n} does not exist (${steps} steps)`);
    const allTools = [...l.apparatus, ...l.materials];
    for (const o of entry.setOut?.optional ?? []) if (!allTools.includes(o)) say(`setOut.optional "${o}" is not an exact lesson apparatus or material line`);
    for (const k of Object.keys(entry.setOut?.shapes ?? {})) if (![...allTools, ...(entry.setOut?.distractors ?? []).map((x) => x.name)].includes(k)) say(`setOut.shapes "${k}" is not a tool of this lesson`);

    // ---- wrong things that are really right
    for (const d of entry.setOut?.distractors ?? []) {
      const n = norm(d.name);
      const clash = allTools.find((t) => norm(t).includes(n) || n.includes(norm(t)));
      if (clash) say(`distractor "${d.name}" overlaps the lesson's own "${clash}"`);
    }
    for (const w of entry.safety?.wrong ?? []) {
      if ([...l.safety, ...(entry.safety?.correct ?? [])].some((s) => norm(s) === norm(w.text))) say(`wrong safety item is also a right one: "${w.text}"`);
    }

    // ---- ids unique inside the lesson
    const ids = [...(entry.decisions ?? []), ...(entry.observations ?? []), ...(entry.numerics ?? []), ...(entry.faults ?? [])].map((x) => x.id);
    if (new Set(ids).size !== ids.length) say('item ids repeat');
    for (const list of [...(entry.decisions ?? []), ...(entry.observations ?? [])]) {
      const texts = list.options.map((o) => norm(o.text));
      if (new Set(texts).size !== texts.length) say(`${list.id}: two options say the same thing`);
      // A key that gives itself away.
      const right = list.options.find((o) => o.correct).text.length;
      const wrongMax = Math.max(...list.options.filter((o) => !o.correct).map((o) => o.text.length));
      if (right > wrongMax * 2 && right > 60) hint(`${list.id}: the right option is far longer than the others, which gives it away`);
    }
    for (const n of entry.numerics ?? []) {
      if (n.formula && !n.vars) hint(`numeric ${n.id}: a formula with no vars never varies: use answer instead`);
      if (n.tolerance.rel !== undefined && n.tolerance.rel > 0.1) hint(`numeric ${n.id}: tolerance over 10%`);
      if (n.formula && n.vars) {
        const seen = new Set();
        const k = Object.keys(n.vars);
        for (const s of SEEDS.slice(0, 12)) seen.add(buildGen({ ...l, gen: { enrichment: entry } }, s).paper.numerics.map((x) => x.prompt).join('|'));
        if (k.length && seen.size < 2 && (entry.numerics.length <= 3)) hint(`numeric ${n.id}: the numbers hardly vary across seeds`);
      }
    }

    // ---- coverage
    const missing = [];
    if (!entry.safety) missing.push('safety');
    if (!entry.setOut) missing.push('setOut');
    if (!entry.decisions?.length) missing.push('decisions');
    if (!entry.observations?.length) missing.push('observations');
    if (!entry.faults?.length) missing.push('faults');
    if (/\d/.test(l.dataAndCalculations) && !entry.numerics?.length) missing.push('numerics (the lesson has numbers)');
    if (missing.length) hint(`not authored yet: ${missing.join(', ')}`);

    // ---- it must run, and the model answers must earn full marks, on every seed
    const lesson = { ...l, gen: { enrichment: genEnrichmentLessonSchema.parse(entry), room: parsed.data.room, pool: lessonPool(lessons, l) } };
    for (const seed of SEEDS) {
      let built;
      try {
        built = buildGen(lesson, seed);
      } catch (e) {
        say(`seed ${seed}: the paper does not build: ${e.message}`);
        break;
      }
      const { paper, key } = built;
      const out = genPracticalGrader.grade(genModelState(key), seed, { lesson });
      const lost = out.auto.filter((a) => a.awarded < a.max);
      if (lost.length) {
        say(`seed ${seed}: model answers lose marks on ${lost.map((a) => `${a.label} (${a.awarded}/${a.max}): ${a.note}`).join('; ')}`);
        break;
      }
      for (const item of out.ai) {
        const marks = GEN_PRACTICAL.rubric.find((r) => r.id === item.criterionId).marks;
        if (keywordMarks(item.answer, item.keywords, item.need, marks).awarded < marks) {
          say(`${item.criterionId}: the model answer does not pass the keywords: check explainKeywords and explainNeed against explainGuide`);
          break;
        }
      }
      const ids2 = [...paper.safety, ...paper.tools, ...paper.steps].map((x) => x.id);
      if (new Set(ids2).size !== ids2.length) {
        say('two items on the paper have identical text');
        break;
      }
    }
    if (stats) {
      const { paper } = buildGen(lesson, SEEDS[0]);
      console.log(`  ok    ${id}: ${paper.safety.length} safety, ${paper.tools.length} tools, ${paper.steps.length} steps, ${paper.decisions.length} decisions, ${paper.observations.length}+${paper.numerics.length} results, ${paper.faults.length} fault scenario(s)`);
    }
  }
  const missingLessons = lessons.filter((l) => !parsed.data.lessons[l.id]);
  if (missingLessons.length) warn(`${missingLessons.length} of ${lessons.length} lessons have no entry yet: ${missingLessons.slice(0, 6).map((l) => l.id).join(', ')}${missingLessons.length > 6 ? ', …' : ''}`);
  const off = lessons.filter((l) => parsed.data.lessons[l.id] && l.simulator !== 'gen-practical');
  if (off.length) warn(`${off.length} enriched lesson(s) don't have "simulator": "gen-practical" in ${slug}.json, so the entry does nothing yet${off.some((l) => l.simulator) ? ` (${off.find((l) => l.simulator).simulator} is set on one: leave those alone)` : ''}`);
  console.log(`  ${Object.keys(parsed.data.lessons).length} of ${lessons.length} lessons enriched`);
}

if (rubricTotal(GEN_PRACTICAL.rubric) !== 20) {
  console.error('The rubric must total 20.');
  process.exit(1);
}
for (const n of names) checkFile(n);
console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
