// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practical-assessments.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPracticalAssessmentSchema, updatePracticalAssessmentSchema } from '@aischool/shared';
import { scaleToComponent, scoreRowStatus } from '../src/assessment/score-copy';
import { attemptDeadline, phaseOf, resultVisibility, windowError } from '../src/cbt/cbt-rules';
import { lockedChanges, overdue, sittingMode, sittingStatus, startDecision, studentView, timeTakenSeconds, type AssessmentRules } from '../src/practicals/practical-assessment';

const at = (s: string) => new Date(`${s}Z`);
const base: AssessmentRules = {
  status: 'SCHEDULED',
  kind: 'EXAM',
  opensAt: at('2026-11-10T09:00:00'),
  closesAt: at('2026-11-10T11:00:00'),
  durationMinutes: 45,
  accessCode: null,
  showResults: 'AFTER_CLOSE',
  resultsReleasedAt: null,
};
const during = at('2026-11-10T09:30:00');

// ---------------------------------------------------------- window and duration

test('the window must close after it opens and fit the whole duration', () => {
  assert.match(windowError(base.closesAt, base.opensAt, 45, false, during.getTime())!, /after the opening time/);
  assert.match(windowError(base.opensAt, at('2026-11-10T09:30:00'), 45, false, during.getTime())!, /at least 45 minutes/);
  assert.equal(windowError(base.opensAt, at('2026-11-10T09:45:00'), 45, false, during.getTime()), null);
});

test('a window that is already over can be saved as a draft but not scheduled', () => {
  const later = at('2026-11-12T09:00:00').getTime();
  assert.equal(windowError(base.opensAt, base.closesAt, 45, false, later), null);
  assert.match(windowError(base.opensAt, base.closesAt, 45, true, later)!, /already passed/);
});

test('phases: draft, upcoming, open, ended (closed early or past the closing time)', () => {
  assert.equal(phaseOf({ ...base, status: 'DRAFT' }, during), 'DRAFT');
  assert.equal(phaseOf(base, at('2026-11-10T08:59:00')), 'UPCOMING');
  assert.equal(phaseOf(base, during), 'OPEN');
  assert.equal(phaseOf(base, base.closesAt), 'ENDED');
  assert.equal(phaseOf({ ...base, status: 'CLOSED' }, during), 'ENDED');
});

test('each sitter gets the full duration, but never past the closing time', () => {
  assert.deepEqual(attemptDeadline(during, 45, base.closesAt), at('2026-11-10T10:15:00'));
  assert.deepEqual(attemptDeadline(at('2026-11-10T10:40:00'), 45, base.closesAt), base.closesAt);
});

test('the schema refuses a closing time before the opening time and durations outside 5–240 minutes', () => {
  const ok = { practicalId: 'pr-chem-acid-base-titration', subjectId: 's', termId: 't', title: 'Titration test', classArmIds: ['a'], opensAt: base.opensAt.toISOString(), closesAt: base.closesAt.toISOString(), durationMinutes: 45 };
  const parsed = createPracticalAssessmentSchema.parse({ ...ok, accessCode: 'ss2-lab' });
  assert.equal(parsed.kind, 'EXAM');
  assert.equal(parsed.accessCode, 'SS2-LAB');
  assert.equal(parsed.componentKey, null);
  assert.equal(createPracticalAssessmentSchema.safeParse({ ...ok, closesAt: ok.opensAt }).success, false);
  assert.equal(createPracticalAssessmentSchema.safeParse({ ...ok, durationMinutes: 2 }).success, false);
  assert.equal(createPracticalAssessmentSchema.safeParse({ ...ok, durationMinutes: 300 }).success, false);
  assert.equal(createPracticalAssessmentSchema.safeParse({ ...ok, accessCode: 'no spaces' }).success, false);
  assert.equal(updatePracticalAssessmentSchema.safeParse({ opensAt: ok.closesAt, closesAt: ok.opensAt }).success, false);
});

// ---------------------------------------------------------- starting: window, code, one attempt

test('a sitting can only be started inside the window', () => {
  assert.equal(startDecision(base, null, null, at('2026-11-10T08:00:00')).action, 'REFUSE');
  assert.match((startDecision(base, null, null, at('2026-11-10T08:00:00')) as { message: string }).message, /not opened yet/);
  assert.match((startDecision(base, null, null, at('2026-11-10T11:00:00')) as { message: string }).message, /closed/);
  assert.equal(startDecision({ ...base, status: 'CLOSED' }, null, null, during).action, 'REFUSE');
  assert.equal(startDecision({ ...base, status: 'DRAFT' }, null, null, during).action, 'REFUSE');
  const d = startDecision(base, null, null, during);
  assert.equal(d.action, 'CREATE');
  if (d.action === 'CREATE') {
    assert.deepEqual(d.endsAt, at('2026-11-10T10:15:00'));
    assert.equal(d.mode, 'EXAM');
  }
});

test('the access code must match (any case) when one is set', () => {
  const coded = { ...base, accessCode: 'LAB-7' };
  const wrong = startDecision(coded, null, 'lab-8', during);
  assert.equal(wrong.action === 'REFUSE' && wrong.code, 'ACCESS_CODE');
  assert.equal(startDecision(coded, null, null, during).action, 'REFUSE');
  assert.equal(startDecision(coded, null, ' lab-7 ', during).action, 'CREATE');
});

test('one attempt: an existing sitting is always returned, never re-rolled, even after closing', () => {
  assert.deepEqual(startDecision(base, { id: 'att1' }, null, during), { action: 'RESUME', attemptId: 'att1' });
  assert.deepEqual(startDecision({ ...base, status: 'CLOSED' }, { id: 'att1' }, 'wrong', at('2026-11-11T09:00:00')), { action: 'RESUME', attemptId: 'att1' });
});

test('an EXAM runs in the lab’s exam mode, a TEST in the guided lab (both timed)', () => {
  assert.equal(sittingMode('EXAM'), 'EXAM');
  assert.equal(sittingMode('TEST'), 'LAB');
  const d = startDecision({ ...base, kind: 'TEST' }, null, null, during);
  assert.equal(d.action === 'CREATE' && d.mode, 'LAB');
});

test('the time-up rule: overdue only after the clock and the grace period', () => {
  const s = { id: 'x', startedAt: during, endsAt: at('2026-11-10T10:15:00'), submittedAt: null };
  assert.equal(overdue(s, 120_000, at('2026-11-10T10:16:00').getTime()), false);
  assert.equal(overdue(s, 120_000, at('2026-11-10T10:17:01').getTime()), true);
  assert.equal(overdue({ ...s, submittedAt: at('2026-11-10T10:00:00') }, 120_000, at('2026-11-10T12:00:00').getTime()), false);
});

test('status and time taken (a sitting handed in for the student counts to its deadline)', () => {
  assert.equal(sittingStatus(null), 'NOT_STARTED');
  const s = { id: 'x', startedAt: during, endsAt: at('2026-11-10T10:15:00'), submittedAt: null as Date | null };
  assert.equal(sittingStatus(s), 'IN_PROGRESS');
  assert.equal(timeTakenSeconds(s), null);
  assert.equal(sittingStatus({ ...s, submittedAt: at('2026-11-10T10:00:00') }), 'SUBMITTED');
  assert.equal(timeTakenSeconds({ ...s, submittedAt: at('2026-11-10T10:00:00') }), 30 * 60);
  assert.equal(timeTakenSeconds({ ...s, submittedAt: at('2026-11-10T10:30:00') }), 45 * 60);
});

test('once anyone has started, the kind, classes, opening time and duration are locked', () => {
  assert.deepEqual(lockedChanges({ durationMinutes: 50, kind: 'TEST' }), ['kind', 'durationMinutes']);
  assert.deepEqual(lockedChanges({}), []);
});

// ---------------------------------------------------------- release visibility

test('results: straight away, after the close, or only once released', () => {
  const done = { id: 'x', startedAt: during, endsAt: at('2026-11-10T10:15:00'), submittedAt: at('2026-11-10T10:00:00') };
  const imm = studentView({ ...base, showResults: 'IMMEDIATE' }, done, during);
  assert.deepEqual(imm, { score: true, note: null });
  const afterClose = studentView(base, done, during);
  assert.equal(afterClose.score, false);
  assert.match(afterClose.note!, /when the practical test closes/);
  assert.equal(studentView(base, done, at('2026-11-10T11:00:00')).score, true);
  const never = studentView({ ...base, showResults: 'NEVER' }, done, at('2026-11-12T09:00:00'));
  assert.equal(never.score, false);
  assert.match(never.note!, /released by your teacher/);
  assert.equal(studentView({ ...base, showResults: 'NEVER', resultsReleasedAt: at('2026-11-12T09:00:00') }, done, at('2026-11-12T10:00:00')).score, true);
  // Not handed in: nothing to show, released or not.
  assert.deepEqual(studentView({ ...base, resultsReleasedAt: during }, { ...done, submittedAt: null }, during), { score: false, note: null });
  assert.equal(resultVisibility({ ...base, resultsReleasedAt: during }, { status: 'IN_PROGRESS' }, during).score, false);
});

// ---------------------------------------------------------- the score sheet

test('marks are scaled to the result component’s maximum', () => {
  assert.equal(scaleToComponent(18, 24, 20), 15);
  assert.equal(scaleToComponent(17, 24, 30), 21.3);
  assert.equal(scaleToComponent(24, 24, 60), 60);
  assert.equal(scaleToComponent(0, 24, 20), 0);
  // Never above the maximum, nothing to scale without a mark.
  assert.equal(scaleToComponent(30, 24, 20), 20);
  assert.equal(scaleToComponent(null, 24, 20), null);
  assert.equal(scaleToComponent(10, 0, 20), null);
});

test('what sending would do for each student', () => {
  const row = { hasClass: true, allowed: true, newScore: 15, existingScore: null };
  assert.equal(scoreRowStatus(row), 'NEW');
  assert.equal(scoreRowStatus({ ...row, existingScore: 15.001 }), 'SAME');
  assert.equal(scoreRowStatus({ ...row, existingScore: 12 }), 'CONFLICT');
  assert.equal(scoreRowStatus({ ...row, newScore: null }), 'NOT_MARKED');
  assert.equal(scoreRowStatus({ ...row, allowed: false }), 'NOT_ALLOWED');
  assert.equal(scoreRowStatus({ ...row, hasClass: false }), 'NO_CLASS');
});
