/**
 * Checks the full-mock paper specs (WASSCE_PAPERS, BECE_PAPERS) against the
 * shipped syllabi: every spec is keyed by a syllabus subject (as subjectKey
 * names it), every restricted or excluded topic exists in that syllabus, and
 * the papers are well formed.
 *   node -r ts-node/register/transpile-only scripts/check-mock-papers.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MOCK_EXAMS, MOCK_PAPERS, inAppPapers } from '@aischool/shared';
import { subjectKey } from '../src/learning/mastery.service';

const root = join(__dirname, '../prisma/syllabi');
let problems = 0;
const fail = (msg: string) => (problems++, console.log(`  ✗ ${msg}`));

for (const exam of MOCK_EXAMS) {
  const specs = MOCK_PAPERS[exam];
  const topics = new Map<string, Set<string>>();
  for (const f of readdirSync(join(root, exam.toLowerCase())).filter((x) => x.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(join(root, exam.toLowerCase(), f), 'utf8')) as { subject: string; topics: { name: string; subtopics?: { name: string }[] }[] };
    const names = new Set<string>();
    for (const t of j.topics) for (const n of [t.name, ...(t.subtopics ?? []).map((s) => s.name)]) names.add(n.toLowerCase());
    topics.set(subjectKey(j.subject), names);
  }
  console.log(`${exam}: ${Object.keys(specs).length} subjects with a mock`);
  for (const [subject, papers] of Object.entries(specs)) {
    if (subjectKey(subject) !== subject) fail(`${subject}: not the app's subject key (${subjectKey(subject)})`);
    const names = topics.get(subject);
    if (!names) fail(`${subject}: no ${exam} syllabus with this subject`);
    if (new Set(papers.map((p) => p.paper)).size !== papers.length) fail(`${subject}: paper numbers repeat`);
    if (!inAppPapers(papers).length) console.log(`  · ${subject}: no paper is sat in the app`);
    for (const p of papers) {
      if (p.kind === 'OBJECTIVE' && !p.questions) fail(`${subject} ${p.title}: objective paper without a question count`);
      if ((p.kind === 'THEORY' || p.kind === 'PRACTICAL') && (!p.offered || !p.answer || p.answer > p.offered)) fail(`${subject} ${p.title}: offered/answer`);
      if (p.kind !== 'NOT_IN_APP' && !(p.marks > 0)) fail(`${subject} ${p.title}: no marks`);
      if (!p.title.startsWith(`Paper ${p.paper}`) && p.kind !== 'NOT_IN_APP') fail(`${subject} ${p.title}: title doesn't match paper ${p.paper}`);
      for (const t of [...(p.topics ?? []), ...(p.excludeTopics ?? [])]) if (names && !names.has(t.toLowerCase())) fail(`${subject} ${p.title}: unknown topic "${t}"`);
    }
  }
}
console.log(problems ? `${problems} problem(s)` : 'All mock paper specs check out.');
process.exit(problems ? 1 : 0);
