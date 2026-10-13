// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/birthdays.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_COMMS_SETTINGS, birthdayKeysFor, daysUntilBirthday, dayMonthLabel, isBirthdayOn, type CommsSettings } from '@aischool/shared';
import { BirthdaysService, birthdayRow, birthdaySettingsOf, greetsStudents, upcoming } from '../src/birthdays/birthdays.service';
import { RequestContextStore } from '../src/common/request-context';
import { schoolNow } from '../src/common/school-time';
import { SchedulerService } from '../src/comms/scheduler.service';

const TZ = 'Africa/Lagos';
const today = schoolNow(TZ).date;
const md = today.slice(5);

// ---------------------------------------------------------------- dates

test('birthday keys: 29 February is celebrated on the 28th in other years', () => {
  assert.deepEqual(birthdayKeysFor('2027-02-28'), ['02-28', '02-29']);
  assert.deepEqual(birthdayKeysFor('2028-02-28'), ['02-28']);
  assert.deepEqual(birthdayKeysFor('2028-02-29'), ['02-29']);
  assert.equal(isBirthdayOn('2016-02-29', '2027-02-28'), true);
  assert.equal(isBirthdayOn('2015-10-12', '2026-10-12'), true);
  assert.equal(isBirthdayOn(null, '2026-10-12'), false);
});

test('days until a birthday wrap into next year', () => {
  assert.equal(daysUntilBirthday('10-12', '2026-10-12'), 0);
  assert.equal(daysUntilBirthday('10-19', '2026-10-12'), 7);
  assert.equal(daysUntilBirthday('10-11', '2026-10-12'), 364);
  assert.equal(daysUntilBirthday('01-02', '2026-12-31'), 2);
  assert.equal(dayMonthLabel('10-14'), '14 Oct');
});

test('rows carry the day and month only: no year, no age', () => {
  const r = birthdayRow('STUDENT', { id: 's1', firstName: 'Emeka', lastName: 'Obi', dateOfBirth: new Date('2011-10-14T00:00:00Z') }, '2026-10-12', 'JSS 1 A', 'arm1')!;
  assert.equal(r.day, '10-14');
  assert.equal(r.dayLabel, '14 Oct');
  assert.equal(r.inDays, 2);
  const json = JSON.stringify(r);
  assert.ok(!json.includes('2011'), 'the year of birth must not leave the server');
  assert.ok(!/age|turning|dateOfBirth/i.test(json));
  assert.deepEqual(upcoming([r, null], 1), []);
  assert.equal(upcoming([r], 7).length, 1);
});

test('settings: greetings are off by default; "greet the student" needs student birthdays on', () => {
  const d = birthdaySettingsOf(null);
  assert.equal(d.students.enabled, false);
  assert.equal(d.staff.enabled, false);
  assert.equal(d.studentGreeting.enabled, true);
  assert.equal(greetsStudents(d), false);
  // Settings saved before the student greeting existed get the default.
  const old = birthdaySettingsOf({ birthdays: { students: { enabled: true, channels: ['SMS'], template: 'x' }, staff: d.staff, sendAt: '07:00' } });
  assert.equal(greetsStudents(old), true);
});

// ---------------------------------------------------------------- the scheduler

function fakeScheduler(settings: CommsSettings['birthdays']) {
  const runs = new Set<string>();
  const sent = { broadcasts: [] as { audience: unknown; title: string }[], notifications: [] as { userId: string; title: string; body: string }[], pushes: [] as string[], mds: [] as unknown[] };
  const root = {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      if (sql.includes('FROM students')) {
        sent.mds.push(values[1]);
        return Promise.resolve([{ id: 'kid1', firstName: 'Emeka', userId: 'user-kid1' }, { id: 'kid2', firstName: 'Ada', userId: null }]);
      }
      return Promise.resolve([]);
    },
    automationRun: {
      create: ({ data }: { data: { kind: string; subjectKey: string; runDate: Date } }) => {
        const k = `${data.kind}|${data.subjectKey}|${data.runDate.toISOString()}`;
        if (runs.has(k)) return Promise.reject(new Error('Unique constraint failed'));
        runs.add(k);
        return Promise.resolve({});
      },
    },
    studentGuardian: { findFirst: ({ where }: { where: { studentId: string } }) => Promise.resolve({ guardianId: `g-${where.studentId}` }) },
    broadcast: {
      create: ({ data }: { data: { audience: unknown; title: string } }) => {
        sent.broadcasts.push({ audience: data.audience, title: data.title });
        return Promise.resolve({ id: `b${sent.broadcasts.length}` });
      },
      update: () => Promise.resolve({}),
    },
    notification: {
      create: ({ data }: { data: { userId: string; title: string; body: string } }) => {
        sent.notifications.push(data);
        return Promise.resolve({});
      },
    },
    schoolEvent: { findMany: () => Promise.resolve([]) },
  };
  const sender = {
    school: () => Promise.resolve({ name: 'Greenfield', settings: { ...DEFAULT_COMMS_SETTINGS, birthdays: settings, eventReminders: { enabled: false, channels: [] } } }),
    start: () => Promise.resolve(),
  };
  const channels = {
    sendPush: (userId: string) => {
      sent.pushes.push(userId);
      return Promise.resolve(1);
    },
  };
  const svc = new SchedulerService({ root } as never, sender as never, channels as never);
  const run = () => (svc as unknown as { automations: (t: string, tz: string) => Promise<{ birthdays: number }> }).automations('t1', TZ);
  return { run, sent };
}

const on = (over: Partial<CommsSettings['birthdays']> = {}): CommsSettings['birthdays'] => ({
  ...DEFAULT_COMMS_SETTINGS.birthdays,
  students: { ...DEFAULT_COMMS_SETTINGS.birthdays.students, enabled: true, channels: ['IN_APP'] },
  sendAt: '00:00',
  ...over,
});

test('scheduler: the primary guardian and the student are each greeted once per day', async () => {
  const f = fakeScheduler(on());
  await f.run();
  await f.run();
  assert.equal(f.sent.broadcasts.length, 2, 'one parent message per birthday child, not repeated');
  assert.deepEqual((f.sent.broadcasts[0]!.audience as { guardianIds: string[] }).guardianIds, ['g-kid1']);
  assert.equal(f.sent.notifications.length, 1, 'only the child with an app account gets a note, once');
  assert.equal(f.sent.notifications[0]!.userId, 'user-kid1');
  assert.match(f.sent.notifications[0]!.body, /Emeka/);
  assert.match(f.sent.notifications[0]!.body, /Greenfield/);
  assert.ok(!/\d{4}|years? old/.test(f.sent.notifications[0]!.body), 'no age or year in the greeting');
  assert.deepEqual(f.sent.pushes, ['user-kid1']);
  assert.ok((f.sent.mds[0] as string[]).includes(md), 'matches today’s day and month');
});

test('scheduler: "greet the student" off sends to parents only', async () => {
  const f = fakeScheduler(on({ studentGreeting: { enabled: false, message: 'Hi {{first_name}}' } }));
  await f.run();
  assert.equal(f.sent.broadcasts.length, 2);
  assert.equal(f.sent.notifications.length, 0);
});

test('scheduler: student birthdays off sends nothing (the default)', async () => {
  const f = fakeScheduler({ ...DEFAULT_COMMS_SETTINGS.birthdays, sendAt: '00:00' });
  await f.run();
  assert.equal(f.sent.broadcasts.length, 0);
  assert.equal(f.sent.notifications.length, 0);
});

test('scheduler: no parent channels still greets the student', async () => {
  const f = fakeScheduler(on({ students: { ...DEFAULT_COMMS_SETTINGS.birthdays.students, enabled: true, channels: [] } }));
  await f.run();
  assert.equal(f.sent.broadcasts.length, 0);
  assert.equal(f.sent.notifications.length, 1);
});

// ---------------------------------------------------------------- class teachers

function fakeBirthdays() {
  const asked: { studentWhere?: { classArmId: { in: string[] } } } = {};
  const dob = (mmdd: string) => new Date(`2014-${mmdd}T00:00:00Z`);
  const all = [
    { id: 's1', firstName: 'Ada', lastName: 'Eze', dateOfBirth: dob(md), classArmId: 'lead' },
    { id: 's2', firstName: 'Bayo', lastName: 'Ade', dateOfBirth: dob(md), classArmId: 'taught' },
    { id: 's3', firstName: 'Chidi', lastName: 'Okafor', dateOfBirth: dob(md), classArmId: 'other' },
  ];
  const db = {
    staff: { findFirst: () => Promise.resolve({ classesLed: [{ id: 'lead' }], classSubjects: [{ classArmId: 'taught' }, { classArmId: 'lead' }] }) },
    classArm: {
      findMany: ({ where }: { where: { id?: { in: string[] } } }) =>
        Promise.resolve(
          ['lead', 'taught', 'other']
            .filter((id) => !where.id || where.id.in.includes(id))
            .map((id) => ({ id, name: 'A', classLevel: { name: id === 'lead' ? 'Primary 4' : id === 'taught' ? 'Primary 5' : 'Primary 6', stage: 'Primary' } })),
        ),
    },
    student: {
      findMany: ({ where }: { where: { classArmId: { in: string[] } | string } }) => {
        if (typeof where.classArmId === 'object') asked.studentWhere = where as never;
        const ids = typeof where.classArmId === 'string' ? [where.classArmId] : where.classArmId.in;
        return Promise.resolve(all.filter((s) => ids.includes(s.classArmId)));
      },
    },
    automationRun: { findMany: () => Promise.resolve([]) },
  };
  const root = { tenant: { findUniqueOrThrow: () => Promise.resolve({ id: 't1', name: 'Greenfield', slug: 'greenfield', timezone: TZ, commsSettings: null, portalSettings: null }) } };
  const svc = new BirthdaysService({ db, root } as never, { log: () => Promise.resolve() } as never);
  return { svc, asked };
}

const asTeacher = <T>(fn: () => Promise<T>, perms: string[] = ['school.read']) =>
  RequestContextStore.run({ userId: 'u-teacher', tenantId: 't1', permissions: new Set(perms) as never }, fn);

test('teacher card: only the classes the teacher leads or teaches, day and month only', async () => {
  const { svc, asked } = fakeBirthdays();
  const r = await asTeacher(() => svc.myClasses());
  assert.deepEqual(asked.studentWhere!.classArmId.in.sort(), ['lead', 'taught']);
  assert.deepEqual(r.birthdays.map((b) => b.firstName).sort(), ['Ada', 'Bayo']);
  assert.equal(r.classes[0]!.classArmId, 'lead', 'the class they lead comes first');
  assert.equal(r.classes[0]!.lead, true);
  const json = JSON.stringify(r.birthdays);
  assert.ok(!json.includes('2014'), 'no year of birth for teachers');
  assert.ok(r.birthdays.every((b) => b.inDays === 0));
});

test('class wishes: not for a class the teacher does not lead or teach', async () => {
  const { svc } = fakeBirthdays();
  await assert.rejects(() => asTeacher(() => svc.classWishes({ classArmId: 'other', note: null })), /only send wishes to the classes you lead or teach/);
});
