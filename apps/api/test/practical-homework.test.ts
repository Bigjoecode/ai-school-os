// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practical-homework.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRACTICAL_HOMEWORK_MAX, homeworkSchema } from '@aischool/shared';
import { bestHandIn, doneAttempts, handInFeedback, labLink, shouldWrite, splitLabLink, type HandInAttempt } from '../src/practicals/practical-homework';

const day = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => new Date(`${s}Z`);
const hw = { publishedAt: at('2026-10-20T08:00:00'), dueDate: '2026-10-22', allowLate: true };
const lab = (id: string, score: number | null, when: string | null, extra: Partial<HandInAttempt> = {}): HandInAttempt => ({ id, mode: 'LAB', score, maxScore: 25, override: null, submittedAt: when ? at(when) : null, ...extra });

test('the best lab handed in after publishing hands the homework in, as a percentage', () => {
  const best = bestHandIn([lab('a', 10, '2026-10-21T09:00:00'), lab('b', 20, '2026-10-21T10:00:00'), lab('c', 25, null)], true, hw, day);
  assert.equal(best?.attemptId, 'b');
  assert.equal(best?.percent, 80);
  assert.equal(best?.late, false);
});

test('attempts before the homework was published, or unpublished homework, do not count', () => {
  assert.equal(bestHandIn([lab('a', 25, '2026-10-19T09:00:00')], true, hw, day), null);
  assert.equal(bestHandIn([lab('a', 25, '2026-10-21T09:00:00')], true, { ...hw, publishedAt: null }, day), null);
});

test('late: after the due date it is marked late, and skipped when late work is not accepted', () => {
  const late = bestHandIn([lab('a', 20, '2026-10-23T09:00:00')], true, hw, day);
  assert.equal(late?.late, true);
  assert.equal(bestHandIn([lab('a', 20, '2026-10-23T09:00:00')], true, { ...hw, allowLate: false }, day), null);
  // An on-time attempt still counts when a later, better one is too late.
  const onTime = bestHandIn([lab('a', 10, '2026-10-22T20:00:00'), lab('b', 25, '2026-10-23T09:00:00')], true, { ...hw, allowLate: false }, day);
  assert.equal(onTime?.attemptId, 'a');
  // The school's day decides: 23:30 UTC on the due date is already the next day in Lagos (UTC+1).
  const lagos = (d: Date) => new Date(d.getTime() + 3_600_000).toISOString().slice(0, 10);
  assert.equal(bestHandIn([lab('a', 20, '2026-10-22T23:30:00')], true, hw, lagos)?.late, true);
});

test("a teacher's review is the score that counts", () => {
  const best = bestHandIn([lab('a', 20, '2026-10-21T09:00:00', { override: { score: 12.5 } })], true, hw, day);
  assert.equal(best?.percent, 50);
  assert.equal(best?.reviewed, true);
  assert.match(handInFeedback(best!), /12\.5\/25 \(50%\), reviewed by your teacher/);
});

test('ties keep the earlier attempt', () => {
  assert.equal(bestHandIn([lab('b', 20, '2026-10-21T10:00:00'), lab('a', 20, '2026-10-21T09:00:00')], true, hw, day)?.attemptId, 'a');
});

test('a practical with no virtual lab is done by passing its quick check', () => {
  const checks: HandInAttempt[] = [
    { id: 'c1', mode: 'CHECK', score: 2, maxScore: 5, override: null, submittedAt: at('2026-10-21T09:00:00') },
    { id: 'c2', mode: 'CHECK', score: 4, maxScore: 5, override: null, submittedAt: at('2026-10-21T10:00:00') },
  ];
  assert.deepEqual(doneAttempts(checks, false).map((a) => a.id), ['c2']);
  assert.equal(bestHandIn(checks, false, hw, day)?.percent, 80);
  // With a lab, quick checks don't hand it in; without one, labs don't.
  assert.equal(bestHandIn(checks, true, hw, day), null);
  assert.equal(bestHandIn([lab('a', 20, '2026-10-21T09:00:00')], false, hw, day), null);
  assert.match(handInFeedback(bestHandIn(checks, false, hw, day)!), /Quick check passed: 4\/5/);
});

test('only a better attempt replaces a marked hand-in; a review always does', () => {
  const best = bestHandIn([lab('a', 15, '2026-10-21T09:00:00')], true, hw, day)!;
  assert.equal(shouldWrite(null, best), true);
  assert.equal(shouldWrite({ status: 'SUBMITTED', score: null, links: [] }, best), true);
  assert.equal(shouldWrite({ status: 'GRADED', score: 80, links: [] }, best), false);
  assert.equal(shouldWrite({ status: 'GRADED', score: 40, links: [] }, best), true);
  assert.equal(shouldWrite({ status: 'GRADED', score: 80, links: [] }, best, true), true);
  assert.equal(shouldWrite({ status: 'GRADED', score: 60, links: [labLink('a')] }, best, true), false);
});

test('the lab link is kept apart from links the student added', () => {
  assert.deepEqual(splitLabLink([labLink('cm123'), 'https://example.com']), { labAttemptId: 'cm123', links: ['https://example.com'] });
  assert.deepEqual(splitLabLink(['https://example.com']), { labAttemptId: null, links: ['https://example.com'] });
});

test('homework schema: PRACTICAL needs a practical and is marked out of 100', () => {
  const base = { classArmId: 'arm1', title: 'Acid-base titration', instructions: 'Do the virtual lab', dueDate: '2026-10-30' };
  const missing = homeworkSchema.safeParse({ ...base, kind: 'PRACTICAL' });
  assert.equal(missing.success, false);
  assert.deepEqual(missing.error?.issues.map((i) => i.path.join('.')), ['practicalId']);
  const ok = homeworkSchema.parse({ ...base, kind: 'PRACTICAL', practicalId: 'pr-chem-acid-base-titration', maxScore: 20 });
  assert.equal(ok.practicalId, 'pr-chem-acid-base-titration');
  assert.equal(ok.maxScore, PRACTICAL_HOMEWORK_MAX);
  // Other kinds have no practical.
  assert.equal(homeworkSchema.safeParse({ ...base, kind: 'THEORY', practicalId: 'pr-x' }).success, false);
  const theory = homeworkSchema.parse({ ...base, kind: 'THEORY', maxScore: 20 });
  assert.equal(theory.practicalId, null);
  assert.equal(theory.maxScore, 20);
});
