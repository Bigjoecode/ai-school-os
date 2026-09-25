/**
 * Stress check for the timetable solver on a Greenfield-sized school, and an
 * independent verification that no hard constraint is broken.
 *   node -r ts-node/register/transpile-only scripts/solver-check.ts
 */
import { DEFAULT_BELL_SCHEDULE, canStartDouble, lessonPeriods } from '@aischool/shared';
import { solve, type SolverInput, type SolverLesson } from '../src/timetable/solver';

const bell = DEFAULT_BELL_SCHEDULE;
const periods = lessonPeriods(bell);

const junior: [string, number, string | null, boolean, boolean][] = [
  ['MTH', 5, null, false, true], ['ENG', 5, null, false, true], ['BSC', 3, null, true, true], ['BTE', 2, null, false, false],
  ['CIV', 2, null, false, true], ['CMP', 2, 'ICT', false, true], ['AGR', 2, null, false, false], ['FRE', 2, null, false, false],
  ['YOR', 2, null, false, false], ['CRS', 2, null, false, false],
];
const senior: [string, number, string | null, boolean, boolean][] = [
  ['MTH', 5, null, false, true], ['ENG', 5, null, false, true], ['BIO', 3, 'LAB', true, false], ['CHM', 3, 'LAB', true, false],
  ['PHY', 3, 'LAB', true, false], ['ECO', 3, null, false, false], ['GOV', 2, null, false, false], ['LIT', 2, null, false, false],
  ['CIV', 2, null, false, true], ['CMP', 2, 'ICT', false, true], ['FMT', 2, null, false, false],
];
const arms = [
  ...['JSS1 A', 'JSS1 B', 'JSS1 C', 'JSS2 A', 'JSS2 B', 'JSS3 A', 'JSS3 B'].map((n) => ({ n, plan: junior })),
  ...['SS1 A', 'SS1 B', 'SS2 A', 'SS2 B', 'SS3 A', 'SS3 B'].map((n) => ({ n, plan: senior })),
];
// Two teachers for the big subjects, split by arm.
const teacherFor = (code: string, armIndex: number) =>
  ['MTH', 'ENG', 'BSC', 'CMP'].includes(code) ? `${code}-${armIndex % 2}` : code;

const lessons: SolverLesson[] = arms.flatMap((a, i) =>
  a.plan.map(([code, n, room, dbl, core]) => ({
    key: `${a.n}-${code}`,
    classArmId: a.n,
    subjectId: code,
    teacherId: teacherFor(code, i),
    periodsPerWeek: n,
    roomKind: room,
    double: dbl,
    isCore: core,
    labels: { classArm: a.n, subject: code, teacher: teacherFor(code, i) },
  })),
);

const input: SolverInput = {
  days: bell.days,
  lessonPeriods: periods,
  doubleStarts: periods.filter((p) => canStartDouble(bell, p)),
  lessons,
  rooms: [{ id: 'Lab 1', kind: 'LAB' }, { id: 'Lab 2', kind: 'LAB' }, { id: 'ICT', kind: 'ICT' }],
  unavailable: new Map([['ENG-0', new Set(['5:9', '5:10'])]]), // Friday afternoon off
  locked: [],
};

void (async () => {
const r = await solve(input);
console.log(`placed ${r.placed}/${r.required} in ${r.durationMs}ms; unplaced ${r.unplaced.length}; quality ${JSON.stringify(r.quality)}`);
for (const u of r.unplaced) console.log('  unplaced:', u.lesson.key, u.missing, u.reason);
for (const w of r.warnings) console.log('  warning:', w);

// Independent verification of every hard constraint.
const errors: string[] = [];
const seen = new Map<string, string>();
const claim = (key: string, what: string) => {
  if (seen.has(key)) errors.push(`clash ${key}: ${seen.get(key)} vs ${what}`);
  seen.set(key, what);
};
for (const p of r.placements) {
  const what = `${p.classArmId} ${p.subjectId}`;
  claim(`class|${p.classArmId}|${p.day}|${p.period}`, what);
  if (p.teacherId) claim(`teacher|${p.teacherId}|${p.day}|${p.period}`, what);
  if (p.roomId) claim(`room|${p.roomId}|${p.day}|${p.period}`, what);
  if (!periods.includes(p.period)) errors.push(`non-lesson period ${what} ${p.period}`);
  if (p.teacherId && input.unavailable.get(p.teacherId)?.has(`${p.day}:${p.period}`)) errors.push(`unavailable ${what}`);
  const lesson = lessons.find((l) => l.classArmId === p.classArmId && l.subjectId === p.subjectId)!;
  if (lesson.roomKind && !input.rooms.find((x) => x.id === p.roomId && x.kind === lesson.roomKind)) errors.push(`wrong room ${what}`);
}
const groups = new Map<string, number[]>();
for (const p of r.placements) if (p.doubleGroup) groups.set(`${p.doubleGroup}|${p.day}`, [...(groups.get(`${p.doubleGroup}|${p.day}`) ?? []), p.period]);
for (const [g, ps] of groups) {
  const [a, b] = ps.sort((x, y) => x - y);
  if (ps.length !== 2 || !canStartDouble(bell, a!) || periods[periods.indexOf(a!) + 1] !== b) errors.push(`bad double ${g} ${ps}`);
}
const perLesson = new Map<string, number>();
for (const p of r.placements) perLesson.set(`${p.classArmId}-${p.subjectId}`, (perLesson.get(`${p.classArmId}-${p.subjectId}`) ?? 0) + 1);
for (const l of lessons) {
  const missing = r.unplaced.find((u) => u.lesson.key === l.key)?.missing ?? 0;
  if ((perLesson.get(l.key) ?? 0) + missing !== l.periodsPerWeek) errors.push(`count mismatch ${l.key}`);
}
console.log(errors.length ? `HARD CONSTRAINT ERRORS:\n${errors.slice(0, 20).join('\n')}` : 'All hard constraints hold.');
process.exitCode = errors.length ? 1 : 0;
})();
