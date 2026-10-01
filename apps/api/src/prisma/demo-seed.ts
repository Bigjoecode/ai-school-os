/**
 * Demo data: a platform owner, the per-student plan, and two schools —
 * Greenfield International School (full, realistic) and Sunrise Academy
 * (small) — so multi-tenancy can be seen working.
 *
 * Used by `npm run db:seed` locally and, on hosting without a shell, by the
 * API at boot when SEED_DEMO_ON_BOOT=true (only if the demo isn't there yet).
 * Re-running replaces the two demo schools.
 */
import {
  DEFAULT_BELL_SCHEDULE,
  DEFAULT_HR_SETTINGS,
  DEFAULT_LEAVE_TYPES,
  SYSTEM_ROLES,
  computePayslip,
  periodBounds,
  workingDaysBetween,
  type Allowance,
  type PayAdjustment,
} from '@aischool/shared';
import type { ClassArm, ClassLevel, Gender, Invoice, Prisma, PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../auth/password';
import { buildTimetable } from '../timetable/timetable-builder';
import { datesBetween, schoolNow, weekdayOf } from '../common/school-time';

let prisma: PrismaClient;

export interface SeedOptions {
  /**
   * Also create the demo platform owner (owner@aischool.os) whose password is
   * printed on the login page. Local development only — never on a live site.
   */
  demoOwner: boolean;
}

export async function seedDemo(client: PrismaClient, options: SeedOptions): Promise<string> {
  prisma = client;
  state = 20260924;
  return run(options);
}

// Deterministic randomness so every seed produces the same school.
let state = 20260924;
function rand() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const chance = (p: number) => rand() < p;
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

const MALE = ['Chinedu', 'Emeka', 'Tunde', 'Ibrahim', 'David', 'Samuel', 'Oluwaseun', 'Musa', 'Daniel', 'Ifeanyi', 'Kelechi', 'Babajide', 'Yusuf', 'Joshua', 'Obinna', 'Femi', 'Uche', 'Segun', 'Aliyu', 'Michael', 'Chukwuemeka', 'Tobi', 'Nnamdi', 'Kunle', 'Victor'];
const FEMALE = ['Adaeze', 'Ngozi', 'Aisha', 'Funmilayo', 'Chioma', 'Blessing', 'Zainab', 'Temitope', 'Amarachi', 'Grace', 'Halima', 'Ifeoma', 'Kemi', 'Nneka', 'Precious', 'Ruth', 'Sade', 'Titilayo', 'Uchechi', 'Esther', 'Fatima', 'Oluchi', 'Deborah', 'Mercy', 'Yetunde'];
const SURNAMES = ['Okafor', 'Adeyemi', 'Bello', 'Eze', 'Okonkwo', 'Ibrahim', 'Adebayo', 'Nwosu', 'Ogunleye', 'Abubakar', 'Chukwu', 'Olawale', 'Onyeka', 'Danjuma', 'Afolabi', 'Nnadi', 'Umar', 'Balogun', 'Obi', 'Akinola', 'Okoro', 'Suleiman', 'Ekwueme', 'Adeleke', 'Mohammed', 'Uzor', 'Oyelaran', 'Ogbu', 'Lawal', 'Nwachukwu'];
const OCCUPATIONS = ['Engineer', 'Trader', 'Civil servant', 'Doctor', 'Nurse', 'Banker', 'Lawyer', 'Teacher', 'Business owner', 'Accountant', 'Pharmacist', 'Architect'];

const SUBJECTS: [string, string, string, boolean][] = [
  ['Mathematics', 'MTH', 'Core', true],
  ['English Language', 'ENG', 'Core', true],
  ['Basic Science', 'BSC', 'Science', true],
  ['Basic Technology', 'BTE', 'Science', false],
  ['Biology', 'BIO', 'Science', false],
  ['Chemistry', 'CHM', 'Science', false],
  ['Physics', 'PHY', 'Science', false],
  ['Further Mathematics', 'FMT', 'Science', false],
  ['Economics', 'ECO', 'Social Science', false],
  ['Government', 'GOV', 'Social Science', false],
  ['Civic Education', 'CIV', 'Core', true],
  ['Literature in English', 'LIT', 'Arts', false],
  ['Computer Studies', 'CMP', 'Vocational', true],
  ['Agricultural Science', 'AGR', 'Vocational', false],
  ['French', 'FRE', 'Languages', false],
  ['Yoruba', 'YOR', 'Languages', false],
  ['Christian Religious Studies', 'CRS', 'Religion', false],
  ['Islamic Religious Studies', 'IRS', 'Religion', false],
];

const LEVELS: [string, string, string][] = [
  ['JSS 1', 'JSS1', 'Junior Secondary'],
  ['JSS 2', 'JSS2', 'Junior Secondary'],
  ['JSS 3', 'JSS3', 'Junior Secondary'],
  ['SS 1', 'SS1', 'Senior Secondary'],
  ['SS 2', 'SS2', 'Senior Secondary'],
  ['SS 3', 'SS3', 'Senior Secondary'],
];

async function upsertUser(email: string, password: string, firstName: string, lastName: string, platformRole?: 'SUPER_ADMIN') {
  return prisma.user.upsert({
    where: { email },
    update: { firstName, lastName, passwordHash: await hashPassword(password), status: 'ACTIVE', platformRole: platformRole ?? null },
    create: { email, firstName, lastName, passwordHash: await hashPassword(password), platformRole },
  });
}

async function createTenant(slug: string, name: string, shortName: string, motto: string, planId: string) {
  await prisma.tenant.deleteMany({ where: { slug } });
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name,
      shortName,
      motto,
      status: 'ACTIVE',
      planId,
      email: `info@${slug}.demo`,
      phone: '+234 800 000 0000',
      address: 'Lekki Phase 1, Lagos',
      primaryColor: '#4f46e5',
    },
  });
  await prisma.role.createMany({
    data: SYSTEM_ROLES.map((r) => ({
      tenantId: tenant.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: true,
      permissions: [...r.permissions],
    })),
  });
  return tenant;
}

async function member(tenantId: string, userId: string, roleKey: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { tenantId_key: { tenantId, key: roleKey } } });
  await prisma.membership.create({
    data: { tenantId, userId, roles: { create: { roleId: role.id } } },
  });
}

async function run({ demoOwner }: SeedOptions) {
  const plan = await prisma.plan.upsert({
    where: { code: 'school-license' },
    update: {},
    create: {
      code: 'school-license',
      name: 'School License',
      description: 'ERP, portals, AI academic tools, attendance, exams, finance and communication.',
      pricePerStudentKobo: 5000 * 100,
      billingPeriod: 'PER_SESSION',
      aiMonthlyBudgetUsd: 25,
      features: ['erp', 'portals', 'ai-academic', 'attendance', 'exams', 'finance', 'communication'],
    },
  });

  const owner = demoOwner ? await upsertUser('owner@aischool.os', 'AiSchoolOS#2026', 'Platform', 'Owner', 'SUPER_ADMIN') : null;
  const admin = await upsertUser('admin@greenfield.demo', 'Greenfield#2026', 'Adaeze', 'Okafor');
  const principal = await upsertUser('principal@greenfield.demo', 'Greenfield#2026', 'Babatunde', 'Adeyemi');
  const teacherUser = await upsertUser('teacher@greenfield.demo', 'Greenfield#2026', 'Ngozi', 'Eze');
  const parentUser = await upsertUser('parent@greenfield.demo', 'Greenfield#2026', 'Emeka', 'Nwosu');

  // ------------------------------------------------------------ Greenfield
  const g = await createTenant(
    'greenfield',
    'Greenfield International School',
    'GIS',
    'Knowledge, Character, Excellence',
    plan.id,
  );
  await prisma.tenantDomain.create({ data: { tenantId: g.id, hostname: 'greenfield.localhost', isPrimary: true } });
  await member(g.id, admin.id, 'school_admin');
  await member(g.id, principal.id, 'principal');
  await member(g.id, teacherUser.id, 'teacher');
  await member(g.id, parentUser.id, 'parent');

  const lekki = await prisma.branch.create({ data: { tenantId: g.id, name: 'Lekki Campus', code: 'LEK', isMain: true } });
  await prisma.branch.create({ data: { tenantId: g.id, name: 'Ikeja Campus', code: 'IKJ' } });

  const prev = await prisma.academicSession.create({
    data: { tenantId: g.id, name: '2025/2026', startsOn: day('2025-09-08'), endsOn: day('2026-07-24') },
  });
  const session = await prisma.academicSession.create({
    data: { tenantId: g.id, name: '2026/2027', startsOn: day('2026-09-07'), endsOn: day('2027-07-23'), isCurrent: true },
  });
  for (const [s, terms] of [
    [prev, [['2025-09-08', '2025-12-19'], ['2026-01-05', '2026-04-02'], ['2026-04-20', '2026-07-24']]],
    [session, [['2026-09-07', '2026-12-18'], ['2027-01-04', '2027-04-01'], ['2027-04-19', '2027-07-23']]],
  ] as const) {
    await prisma.term.createMany({
      data: terms.map(([start, end], i) => ({
        tenantId: g.id,
        sessionId: s.id,
        name: ['First Term', 'Second Term', 'Third Term'][i]!,
        order: i + 1,
        startsOn: day(start),
        endsOn: day(end),
        isCurrent: s.id === session.id && i === 0,
      })),
    });
  }

  const subjects = await Promise.all(
    SUBJECTS.map(([name, code, category, isCore]) =>
      prisma.subject.create({ data: { tenantId: g.id, name, code, category, isCore } }),
    ),
  );

  // Staff: one teacher per subject family plus a few extras, and support staff.
  const staffRows: { firstName: string; lastName: string; gender: Gender; jobTitle: string; type: 'TEACHING' | 'NON_TEACHING' }[] = [];
  for (const [name] of SUBJECTS) {
    const gender: Gender = chance(0.55) ? 'FEMALE' : 'MALE';
    staffRows.push({ firstName: pick(gender === 'MALE' ? MALE : FEMALE), lastName: pick(SURNAMES), gender, jobTitle: `${name} Teacher`, type: 'TEACHING' });
  }
  for (const title of ['Mathematics Teacher', 'English Language Teacher', 'Basic Science Teacher', 'Computer Studies Teacher', 'Physical & Health Education Teacher', 'Music Teacher']) {
    const gender: Gender = chance(0.5) ? 'FEMALE' : 'MALE';
    staffRows.push({ firstName: pick(gender === 'MALE' ? MALE : FEMALE), lastName: pick(SURNAMES), gender, jobTitle: title, type: 'TEACHING' });
  }
  for (const title of ['Bursar', 'Librarian', 'Admissions Officer', 'School Nurse', 'ICT Officer', 'Transport Coordinator']) {
    const gender: Gender = chance(0.5) ? 'FEMALE' : 'MALE';
    staffRows.push({ firstName: pick(gender === 'MALE' ? MALE : FEMALE), lastName: pick(SURNAMES), gender, jobTitle: title, type: 'NON_TEACHING' });
  }
  staffRows[1] = { firstName: 'Ngozi', lastName: 'Eze', gender: 'FEMALE', jobTitle: 'English Language Teacher', type: 'TEACHING' };

  const staff = [];
  for (const [i, s] of staffRows.entries()) {
    staff.push(
      await prisma.staff.create({
        data: {
          tenantId: g.id,
          staffNumber: `STF-${String(i + 1).padStart(4, '0')}`,
          ...s,
          email: `${s.firstName}.${s.lastName}`.toLowerCase() + '@greenfield.demo',
          phone: `+23480${Math.floor(10000000 + rand() * 89999999)}`,
          employedOn: day(`20${String(14 + Math.floor(rand() * 11)).padStart(2, '0')}-09-01`),
          userId: s.firstName === 'Ngozi' && s.lastName === 'Eze' ? teacherUser.id : undefined,
        },
      }),
    );
  }
  const teachers = staff.filter((s) => s.type === 'TEACHING');

  // Classes: two arms per level; JSS 1 has a third. Two arms are left without
  // a class teacher so the dashboard has something honest to flag.
  const arms: { level: ClassLevel; arm: ClassArm }[] = [];
  let t = 0;
  for (const [order, [name, code, stage]] of LEVELS.entries()) {
    const level = await prisma.classLevel.create({ data: { tenantId: g.id, name, code, stage, order } });
    for (const armName of code === 'JSS1' ? ['A', 'B', 'C'] : ['A', 'B']) {
      const withoutTeacher = (code === 'SS2' && armName === 'B') || (code === 'JSS1' && armName === 'C');
      arms.push({
        level,
        arm: await prisma.classArm.create({
          data: {
            tenantId: g.id,
            classLevelId: level.id,
            branchId: lekki.id,
            name: armName,
            capacity: 35,
            classTeacherId: withoutTeacher ? undefined : teachers[t++ % teachers.length]!.id,
          },
        }),
      });
    }
  }

  // What each class studies, how often, with whom and where. Junior classes
  // take 27 lessons a week, senior classes 32, out of 40 periods. Subjects
  // with two teachers (Maths, English…) alternate between class arms.
  const JUNIOR_LOAD: [string, number, string | null, boolean][] = [
    ['MTH', 5, null, false], ['ENG', 5, null, false], ['BSC', 3, null, true], ['BTE', 2, null, false], ['CIV', 2, null, false],
    ['CMP', 2, 'ICT', false], ['AGR', 2, null, false], ['FRE', 2, null, false], ['YOR', 2, null, false], ['CRS', 2, null, false],
  ];
  const SENIOR_LOAD: [string, number, string | null, boolean][] = [
    ['MTH', 5, null, false], ['ENG', 5, null, false], ['BIO', 3, 'LAB', true], ['CHM', 3, 'LAB', true], ['PHY', 3, 'LAB', true],
    ['ECO', 3, null, false], ['GOV', 2, null, false], ['LIT', 2, null, false], ['CIV', 2, null, false], ['CMP', 2, 'ICT', false],
    ['FMT', 2, null, false],
  ];
  const teachersOf = (subjectName: string) => teachers.filter((t) => t.jobTitle === `${subjectName} Teacher`);
  for (const [i, { level, arm }] of arms.entries()) {
    const plan = level.stage === 'Senior Secondary' ? SENIOR_LOAD : JUNIOR_LOAD;
    for (const [code, periodsPerWeek, roomKind, doublePeriod] of plan) {
      const subject = subjects.find((s) => s.code === code)!;
      const options = teachersOf(subject.name);
      await prisma.classSubject.create({
        data: {
          tenantId: g.id,
          classArmId: arm.id,
          subjectId: subject.id,
          teacherId: options.length ? options[i % options.length]!.id : undefined,
          periodsPerWeek,
          roomKind,
          doublePeriod,
        },
      });
    }
  }
  await prisma.room.createMany({
    data: [
      { tenantId: g.id, name: 'Science Lab 1', kind: 'LAB', capacity: 36 },
      { tenantId: g.id, name: 'Science Lab 2', kind: 'LAB', capacity: 36 },
      { tenantId: g.id, name: 'ICT Suite', kind: 'ICT', capacity: 40 },
      { tenantId: g.id, name: 'Main Hall', kind: 'HALL', capacity: 450 },
      { tenantId: g.id, name: 'Library', kind: 'LIBRARY', capacity: 60 },
    ],
  });
  // The French teacher works part-time: not available on Friday afternoons.
  const french = teachersOf('French')[0];
  if (french) {
    await prisma.staffUnavailability.createMany({
      data: [9, 10].map((period) => ({ tenantId: g.id, staffId: french.id, day: 5, period })),
    });
  }

  // Students. Most were admitted in earlier sessions; this session's new
  // intake arrived in August–September 2026, with a trickle across the year.
  const sizes: Record<string, number> = { JSS1: 30, JSS2: 33, JSS3: 31, SS1: 29, SS2: 34, SS3: 27 };
  let seq = 0;
  const students = [];
  for (const { level, arm } of arms) {
    const count = sizes[level.code]! + (arm.name === 'A' ? 1 : -2) + (level.code === 'SS2' && arm.name === 'A' ? 2 : 0);
    for (let i = 0; i < count; i++) {
      seq++;
      const gender: Gender = chance(0.5) ? 'MALE' : 'FEMALE';
      const age = 10 + level.order + Math.floor(rand() * 2);
      let admittedOn: Date;
      if (level.code === 'JSS1' || level.code === 'SS1') {
        admittedOn = day(`2026-0${chance(0.6) ? 8 : 9}-${String(1 + Math.floor(rand() * 20)).padStart(2, '0')}`);
      } else if (chance(0.12)) {
        const m = 1 + Math.floor(rand() * 9);
        admittedOn = day(`2026-${String(m).padStart(2, '0')}-${String(1 + Math.floor(rand() * 26)).padStart(2, '0')}`);
      } else {
        admittedOn = day(`${level.order <= 2 ? 2026 - level.order : 2026 - (level.order - 3)}-09-${String(7 + Math.floor(rand() * 10)).padStart(2, '0')}`);
      }
      students.push(
        await prisma.student.create({
          data: {
            tenantId: g.id,
            branchId: lekki.id,
            classArmId: arm.id,
            admissionNumber: `GIS/${admittedOn.getUTCFullYear()}/${String(seq).padStart(4, '0')}`,
            firstName: pick(gender === 'MALE' ? MALE : FEMALE),
            middleName: chance(0.4) ? pick(gender === 'MALE' ? MALE : FEMALE) : undefined,
            lastName: pick(SURNAMES),
            gender,
            dateOfBirth: day(`${2026 - age}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`),
            admittedOn,
          },
        }),
      );
    }
  }

  // Guardians: most students have one or two; siblings share parents; a few
  // records are incomplete, as in any real school.
  const bySurname = new Map<string, typeof students>();
  for (const s of students) bySurname.set(s.lastName, [...(bySurname.get(s.lastName) ?? []), s]);
  let parentLinked = false;
  for (const [surname, group] of bySurname) {
    for (let i = 0; i < group.length; i += chance(0.3) ? 2 : 1) {
      const kids = group.slice(i, i + (chance(0.3) ? 2 : 1)).filter((k) => !chance(0.07));
      if (!kids.length) continue;
      const isParentDemo = !parentLinked && surname === 'Nwosu';
      const father = await prisma.guardian.create({
        data: {
          tenantId: g.id,
          firstName: isParentDemo ? 'Emeka' : pick(MALE),
          lastName: surname,
          relationship: 'Father',
          phone: `+23480${Math.floor(10000000 + rand() * 89999999)}`,
          email: isParentDemo ? 'parent@greenfield.demo' : undefined,
          occupation: pick(OCCUPATIONS),
          userId: isParentDemo ? parentUser.id : undefined,
        },
      });
      if (isParentDemo) parentLinked = true;
      await prisma.studentGuardian.createMany({
        data: kids.map((k) => ({ tenantId: g.id, studentId: k.id, guardianId: father.id, isPrimary: true })),
        skipDuplicates: true,
      });
      if (chance(0.6)) {
        const mother = await prisma.guardian.create({
          data: {
            tenantId: g.id,
            firstName: pick(FEMALE),
            lastName: surname,
            relationship: 'Mother',
            phone: `+23481${Math.floor(10000000 + rand() * 89999999)}`,
            occupation: pick(OCCUPATIONS),
          },
        });
        await prisma.studentGuardian.createMany({
          data: kids.map((k) => ({ tenantId: g.id, studentId: k.id, guardianId: mother.id })),
          skipDuplicates: true,
        });
      }
    }
  }

  // 1st CA (out of 20) in the core subjects — the test schools hold around
  // week 3 of first term. Each learner has a general ability plus a
  // per-subject lean, so strengths and weaknesses show up in the analysis.
  const currentTerm = await prisma.term.findFirstOrThrow({ where: { tenantId: g.id, isCurrent: true } });
  const core = subjects.filter((s) => s.isCore);
  const gaussian = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
  const scoreRows = students.flatMap((st) => {
    const ability = 0.6 + 0.14 * gaussian();
    return core
      .filter(() => !chance(0.03)) // a few absences
      .map((subject) => {
        const pct = Math.min(1, Math.max(0.1, ability + 0.08 * gaussian() + (subject.code === 'MTH' ? -0.05 : 0)));
        return {
          tenantId: g.id,
          studentId: st.id,
          subjectId: subject.id,
          termId: currentTerm.id,
          classArmId: st.classArmId!,
          componentKey: 'ca1',
          score: Math.round(pct * 20 * 2) / 2,
          enteredById: admin.id,
        };
      });
  });
  await prisma.score.createMany({ data: scoreRows });

  // A published timetable for the current term, built by the real solver.
  const timetable = await prisma.timetable.create({
    data: {
      tenantId: g.id,
      termId: currentTerm.id,
      name: `${currentTerm.name} 2026/2027`,
      bellSchedule: DEFAULT_BELL_SCHEDULE as unknown as object,
      status: 'PUBLISHED',
      generation: 'DONE',
      publishedAt: new Date(),
      createdById: admin.id,
    },
  });
  await buildTimetable(prisma, g.id, timetable.id);

  // Attendance from the first day of term to today (school time). Most
  // learners attend ~96% of days; a few are persistently absent; Mondays are
  // a little worse. Today two classes haven't taken their register yet.
  const today = schoolNow('Africa/Lagos').date;
  const schoolDays = datesBetween('2026-09-07', today).filter((d) => weekdayOf(d) <= 5);
  const chronicIds = new Set(students.filter(() => chance(0.035)).map((s) => s.id));
  const notYetTaken = new Set([arms[4]!.arm.id, arms[9]!.arm.id]);
  const EXCUSES = ['Hospital appointment', 'Family emergency', 'Sick — note from parent', 'Religious observance'];
  const registerRows: { id: string; tenantId: string; classArmId: string; date: Date; takenById: string; takenAt: Date }[] = [];
  const markRows: { tenantId: string; registerId: string; studentId: string; date: Date; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'; note?: string }[] = [];
  for (const d of schoolDays) {
    const date = day(d);
    for (const { arm } of arms) {
      if (d === today && notYetTaken.has(arm.id)) continue;
      const registerId = `reg_${arm.id}_${d}`;
      registerRows.push({ id: registerId, tenantId: g.id, classArmId: arm.id, date, takenById: admin.id, takenAt: new Date(`${d}T07:05:00.000Z`) });
      for (const st of students.filter((s) => s.classArmId === arm.id)) {
        const pAbsent = (chronicIds.has(st.id) ? 0.2 : 0.03) + (weekdayOf(d) === 1 ? 0.015 : 0);
        const r = rand();
        const status = r < pAbsent ? 'ABSENT' : r < pAbsent + 0.008 ? 'EXCUSED' : r < pAbsent + 0.04 ? 'LATE' : 'PRESENT';
        markRows.push({
          tenantId: g.id,
          registerId,
          studentId: st.id,
          date,
          status,
          ...(status === 'EXCUSED' ? { note: pick(EXCUSES) } : {}),
        });
      }
    }
  }
  await prisma.attendanceRegister.createMany({ data: registerRows });
  for (let i = 0; i < markRows.length; i += 5000) await prisma.studentAttendance.createMany({ data: markRows.slice(i, i + 5000) });

  // Staff check in at the kiosk around 07:30 (late after 07:45); one teacher
  // is on leave for three days last week.
  const staffAttendanceRows: { tenantId: string; staffId: string; date: Date; status: 'PRESENT' | 'LATE' | 'ABSENT' | 'ON_LEAVE'; checkInAt?: Date; checkOutAt?: Date; method: string }[] = [];
  const onLeave = staff[7]!;
  for (const d of schoolDays) {
    for (const member of staff) {
      if (member.id === onLeave.id && schoolDays.indexOf(d) >= schoolDays.length - 8 && schoolDays.indexOf(d) < schoolDays.length - 5) {
        staffAttendanceRows.push({ tenantId: g.id, staffId: member.id, date: day(d), status: 'ON_LEAVE', method: 'MANUAL' });
        continue;
      }
      if (chance(0.015)) {
        staffAttendanceRows.push({ tenantId: g.id, staffId: member.id, date: day(d), status: 'ABSENT', method: 'MANUAL' });
        continue;
      }
      // Lagos is UTC+1: 07:30 school time is 06:30Z.
      const minutes = Math.round(6 * 60 + 30 + 9 * gaussian());
      const checkIn = new Date(`${d}T00:00:00.000Z`);
      checkIn.setUTCMinutes(minutes);
      const checkOut = d === today ? undefined : new Date(checkIn.getTime() + (8.5 + rand()) * 3_600_000);
      staffAttendanceRows.push({
        tenantId: g.id,
        staffId: member.id,
        date: day(d),
        status: minutes > 6 * 60 + 45 ? 'LATE' : 'PRESENT',
        checkInAt: checkIn,
        checkOutAt: checkOut,
        method: 'KIOSK',
      });
    }
  }
  await prisma.staffAttendance.createMany({ data: staffAttendanceRows });

  // ------------------------------------------------------------ fees
  // First-term fee schedule (amounts in kobo), invoices for every learner with
  // a 10% sibling discount on tuition, and a realistic payment spread: about
  // half paid in full, a quarter part-paid, the rest still owing after the
  // 21 September due date.
  const naira = (n: number) => n * 100;
  const levelIds = (codes: string[]) => arms.filter((a) => codes.includes(a.level.code)).map((a) => a.level.id).filter((v, i, xs) => xs.indexOf(v) === i);
  const junior = levelIds(['JSS1', 'JSS2', 'JSS3']);
  const senior = levelIds(['SS1', 'SS2', 'SS3']);
  const feeSpecs = [
    { name: 'Tuition (Junior Secondary)', category: 'TUITION', amount: 150_000, levels: junior },
    { name: 'Tuition (Senior Secondary)', category: 'TUITION', amount: 175_000, levels: senior },
    { name: 'Development levy', category: 'LEVY', amount: 20_000, levels: [] as string[] },
    { name: 'ICT fee', category: 'ICT', amount: 8_000, levels: [] },
    { name: 'Laboratory fee', category: 'LAB', amount: 12_000, levels: senior },
    { name: 'Books & stationery (new intake)', category: 'BOOKS', amount: 25_000, levels: levelIds(['JSS1', 'SS1']) },
    { name: 'WAEC & NECO registration', category: 'EXAM', amount: 45_000, levels: levelIds(['SS3']) },
    { name: 'School bus (optional)', category: 'TRANSPORT', amount: 60_000, levels: [], optional: true },
  ];
  const feeItems = [];
  for (const f of feeSpecs) {
    feeItems.push(
      await prisma.feeItem.create({
        data: {
          tenantId: g.id,
          termId: currentTerm.id,
          name: f.name,
          category: f.category,
          amountKobo: naira(f.amount),
          classLevelIds: f.levels,
          optional: f.optional ?? false,
        },
      }),
    );
  }

  const guardianLinks = await prisma.studentGuardian.findMany({ where: { tenantId: g.id } });
  const guardiansOf = new Map<string, string[]>();
  for (const l of guardianLinks) guardiansOf.set(l.studentId, [...(guardiansOf.get(l.studentId) ?? []), l.guardianId]);
  const levelOfArm = new Map(arms.map((a) => [a.arm.id, a.level.id]));
  const seenGuardians = new Set<string>();
  const eldestFirst = [...students].sort((a, b) => (a.dateOfBirth?.getTime() ?? 0) - (b.dateOfBirth?.getTime() ?? 0));
  const PAY_METHODS: [string, number][] = [['BANK_TRANSFER', 0.45], ['PAYSTACK', 0.2], ['POS', 0.2], ['CASH', 0.15]];
  const pickMethod = () => {
    let r = rand();
    for (const [m, p] of PAY_METHODS) if ((r -= p) < 0) return m;
    return 'CASH';
  };
  const paymentsToCreate: { invoiceIndex: number; amountKobo: number; method: string; paidAt: Date; reference: string | null }[] = [];
  const invoiceRows: { studentId: string; number: string; totalKobo: number; lines: { feeItemId: string | null; description: string; kind: string; amountKobo: number }[] }[] = [];

  for (const st of eldestFirst) {
    const levelId = levelOfArm.get(st.classArmId!)!;
    const items = feeItems.filter((f) => !f.optional && (!f.classLevelIds.length || f.classLevelIds.includes(levelId)));
    const lines: { feeItemId: string | null; description: string; kind: string; amountKobo: number }[] = items.map((f) => ({
      feeItemId: f.id,
      description: f.name,
      kind: 'FEE',
      amountKobo: f.amountKobo,
    }));
    if (chance(0.12)) {
      const bus = feeItems.find((f) => f.optional)!;
      lines.push({ feeItemId: bus.id, description: bus.name, kind: 'FEE', amountKobo: bus.amountKobo });
    }
    const gs = guardiansOf.get(st.id) ?? [];
    if (gs.some((x) => seenGuardians.has(x))) {
      const tuition = items.filter((f) => f.category === 'TUITION').reduce((n, f) => n + f.amountKobo, 0);
      lines.push({ feeItemId: null, description: 'Sibling discount (10% of tuition)', kind: 'DISCOUNT', amountKobo: -Math.round(tuition * 0.1) });
    }
    for (const x of gs) seenGuardians.add(x);
    const total = lines.reduce((n, l) => n + l.amountKobo, 0);
    const index = invoiceRows.length;
    invoiceRows.push({ studentId: st.id, number: `INV/2026/${String(index + 1).padStart(5, '0')}`, totalKobo: total, lines });

    // Payment behaviour for this family.
    const r = rand();
    const payDay = () => {
      const d = new Date('2026-08-24T09:00:00.000Z');
      d.setUTCDate(d.getUTCDate() + Math.floor(rand() * 30));
      d.setUTCHours(8 + Math.floor(rand() * 8), Math.floor(rand() * 60));
      return d.getTime() > Date.now() ? new Date(Date.now() - 3_600_000) : d;
    };
    if (r < 0.5) {
      paymentsToCreate.push({ invoiceIndex: index, amountKobo: total, method: pickMethod(), paidAt: payDay(), reference: null });
    } else if (r < 0.78) {
      const first = Math.round((total * (0.4 + rand() * 0.3)) / 100_000) * 100_000;
      paymentsToCreate.push({ invoiceIndex: index, amountKobo: Math.min(first, total), method: pickMethod(), paidAt: payDay(), reference: null });
      if (chance(0.35)) {
        paymentsToCreate.push({ invoiceIndex: index, amountKobo: Math.round((total - first) / 2 / 100) * 100, method: pickMethod(), paidAt: payDay(), reference: null });
      }
    }
  }

  const createdInvoices: Invoice[] = [];
  for (const inv of invoiceRows) {
    createdInvoices.push(
      await prisma.invoice.create({
        data: {
          tenantId: g.id,
          studentId: inv.studentId,
          termId: currentTerm.id,
          number: inv.number,
          totalKobo: inv.totalKobo,
          dueDate: day('2026-09-21'),
          issuedAt: new Date('2026-08-20T09:00:00.000Z'),
          createdById: admin.id,
          lines: { create: inv.lines.map((l) => ({ ...l, tenantId: g.id })) },
        },
      }),
    );
  }
  paymentsToCreate.sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
  const paidByInvoice = new Map<number, number>();
  await prisma.payment.createMany({
    data: paymentsToCreate.map((p, i) => {
      const inv = createdInvoices[p.invoiceIndex]!;
      paidByInvoice.set(p.invoiceIndex, (paidByInvoice.get(p.invoiceIndex) ?? 0) + p.amountKobo);
      return {
        tenantId: g.id,
        invoiceId: inv.id,
        studentId: inv.studentId,
        amountKobo: p.amountKobo,
        method: p.method,
        status: 'SUCCESS' as const,
        reference: p.method === 'PAYSTACK' ? `AIS-DEMO-${String(i + 1).padStart(5, '0')}` : p.method === 'BANK_TRANSFER' ? `TRF${100000 + i}` : null,
        receiptNumber: `RCT/2026/${String(i + 1).padStart(5, '0')}`,
        paidAt: p.paidAt,
        receivedById: p.method === 'PAYSTACK' ? null : admin.id,
      };
    }),
  });
  for (const [index, paid] of paidByInvoice) {
    const inv = createdInvoices[index]!;
    await prisma.invoice.update({
      where: { id: inv.id },
      data: { paidKobo: paid, status: paid >= inv.totalKobo ? 'PAID' : 'PART_PAID' },
    });
  }

  // ------------------------------------------------------------ HR & payroll
  // Departments, salary grades, everyone's pay and bank details, a term of
  // leave, two awards, and August and September payrolls (paid, and recorded
  // as salary expenses the way the app does it).
  const DEPARTMENTS: [string, string, (title: string) => boolean][] = [
    ['Mathematics & Sciences', 'Mathematics, the sciences, technology and computing', (t) => /Mathematics|Science|Technology|Biology|Chemistry|Physics|Agricultural|Computer Studies/.test(t)],
    ['Languages', 'English, literature and modern languages', (t) => /English|Literature|French|Yoruba/.test(t)],
    ['Humanities', 'Social sciences, civic and religious studies', (t) => /Economics|Government|Civic|Religious/.test(t)],
    ['Creative Arts & Sports', 'Music, physical and health education', (t) => /Music|Physical/.test(t)],
    ['Administration', 'Bursary, admissions and ICT', (t) => /Bursar|Admissions|ICT Officer/.test(t)],
    ['Student Services', 'Library, health and transport', (t) => /Librarian|Nurse|Transport/.test(t)],
  ];
  const QUALIFICATIONS = ['B.Sc. (Ed.)', 'B.A. (Ed.)', 'M.Ed.', 'B.Sc. + PGDE', 'B.A. + PGDE', 'NCE', 'M.Sc.'];
  const deptRows = [];
  for (const [name, description, match] of DEPARTMENTS) {
    const members = staff.filter((st) => match(st.jobTitle));
    const head = members.find((m) => m.type === 'TEACHING' && m.employedOn && m.employedOn.getUTCFullYear() <= 2019) ?? members[0];
    const dep = await prisma.department.create({ data: { tenantId: g.id, name, description, headStaffId: head?.id } });
    deptRows.push({ dep, members, head });
    for (const m of members) {
      await prisma.staff.update({
        where: { id: m.id },
        data: {
          departmentId: dep.id,
          dateOfBirth: day(`19${70 + Math.floor(rand() * 26)}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`),
          qualification: m.type === 'TEACHING' ? pick(QUALIFICATIONS) : pick(['B.Sc.', 'HND', 'OND', 'B.Sc. Accounting', 'RN, B.N.Sc.']),
          address: `${1 + Math.floor(rand() * 40)} ${pick(['Admiralty Way', 'Freedom Way', 'Bisola Durosinmi-Etti Drive', 'Ajah Road', 'Chevron Drive', 'Ikota Road'])}, Lekki, Lagos`,
          nextOfKinName: `${pick(rand() < 0.5 ? MALE : FEMALE)} ${m.lastName}`,
          nextOfKinPhone: `+23480${Math.floor(10000000 + rand() * 89999999)}`,
        },
      });
    }
  }
  const heads = new Set(deptRows.filter((d) => d.dep.name !== 'Administration' && d.dep.name !== 'Student Services').map((d) => d.head?.id));

  const grade = async (name: string, basic: number, housing: number, transport: number, other: { label: string; amountKobo: number }[] = []) =>
    prisma.salaryGrade.create({
      data: { tenantId: g.id, name, basicKobo: naira(basic), housingKobo: naira(housing), transportKobo: naira(transport), otherAllowances: other },
    });
  const grades = {
    support: await grade('Support Staff', 60_000, 24_000, 12_000),
    admin: await grade('Administrative Officer', 100_000, 40_000, 20_000),
    graduate: await grade('Graduate Teacher', 110_000, 44_000, 22_000),
    senior: await grade('Senior Teacher', 145_000, 58_000, 29_000),
    bursar: await grade('Bursar', 170_000, 68_000, 34_000),
    hod: await grade('Head of Department', 185_000, 74_000, 37_000, [{ label: 'Responsibility allowance', amountKobo: naira(30_000) }]),
  };
  const BANKS = ['GTBank', 'Access Bank', 'Zenith Bank', 'First Bank', 'UBA', 'Wema Bank', 'Stanbic IBTC'];
  const PFAS = ['Stanbic IBTC Pension Managers', 'ARM Pension Managers', 'Leadway Pensure', 'Premium Pension', 'Access Pensions'];
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 10)).join('');
  const payProfiles = new Map<string, Awaited<ReturnType<typeof prisma.staffPayProfile.create>>>();
  for (const [i, m] of staff.entries()) {
    const gr =
      m.jobTitle === 'Bursar' ? grades.bursar
      : m.jobTitle === 'Transport Coordinator' ? grades.support
      : m.type === 'NON_TEACHING' ? grades.admin
      : heads.has(m.id) ? grades.hod
      : m.employedOn && m.employedOn.getUTCFullYear() <= 2019 ? grades.senior
      : grades.graduate;
    const p = await prisma.staffPayProfile.create({
      data: {
        tenantId: g.id,
        staffId: m.id,
        gradeId: gr.id,
        basicKobo: gr.basicKobo,
        housingKobo: gr.housingKobo,
        transportKobo: gr.transportKobo,
        otherAllowances: gr.otherAllowances ?? [],
        pensionEnabled: true,
        nhfEnabled: chance(0.3),
        annualRentKobo: chance(0.6) ? naira(600_000 + Math.round(rand() * 9) * 100_000) : 0,
        bankName: pick(BANKS),
        accountNumber: digits(10),
        accountName: `${m.lastName} ${m.firstName}`.toUpperCase(),
        pfaName: pick(PFAS),
        // One pension PIN is still outstanding, so the payroll checks have something real to flag.
        pensionPin: i === 22 ? null : `PEN${digits(12)}`,
        taxId: digits(10),
      },
    });
    payProfiles.set(m.id, p);
  }

  // Leave: the standard types, the three sick days already on the register,
  // a teacher's summer leave, unpaid days in September, requests awaiting a
  // decision, maternity leave ahead and one declined request.
  const leaveTypes = new Map<string, { id: string }>();
  for (const [i, t] of DEFAULT_LEAVE_TYPES.entries()) {
    leaveTypes.set(t.name, await prisma.leaveType.create({ data: { tenantId: g.id, ...t, sortOrder: i } }));
  }
  const ngozi = staff.find((m) => m.userId === teacherUser.id)!;
  const sickDays = schoolDays.slice(-8, -5);
  const female = staff.filter((m) => m.gender === 'FEMALE' && m.type === 'TEACHING' && m.id !== ngozi.id);
  const male = staff.filter((m) => m.gender === 'MALE');
  const unpaidStaff = staff[25]!;
  const leaveRows: {
    staffId: string;
    type: string;
    start: string;
    end: string;
    status: 'PENDING' | 'APPROVED' | 'DECLINED';
    reason: string;
    note?: string;
  }[] = [
    { staffId: onLeave.id, type: 'Sick leave', start: sickDays[0]!, end: sickDays[2]!, status: 'APPROVED', reason: 'Malaria — doctor’s note submitted' },
    { staffId: ngozi.id, type: 'Annual leave', start: '2026-08-10', end: '2026-08-14', status: 'APPROVED', reason: 'Family holiday in Enugu' },
    { staffId: unpaidStaff.id, type: 'Unpaid leave', start: '2026-09-17', end: '2026-09-18', status: 'APPROVED', reason: 'Personal matter out of state' },
    { staffId: female[0]!.id, type: 'Maternity leave', start: '2026-11-02', end: '2026-12-18', status: 'APPROVED', reason: 'Expected due date mid-November' },
    { staffId: staff[27]!.id, type: 'Annual leave', start: '2026-10-19', end: '2026-10-23', status: 'PENDING', reason: 'Mid-term break extension — sister’s wedding in Ibadan' },
    { staffId: male[3]!.id, type: 'Compassionate leave', start: '2026-10-07', end: '2026-10-09', status: 'PENDING', reason: 'Burial of my father in Owerri' },
    { staffId: staff[12]!.id, type: 'Annual leave', start: '2026-10-12', end: '2026-10-16', status: 'DECLINED', reason: 'Short trip', note: 'Clashes with the SS 3 mock examinations — please choose the half-term break instead' },
  ];
  for (const l of leaveRows) {
    // Asked two weeks ahead (or yesterday, for short notice); decided the next day.
    const asked = new Date(Math.min(Date.parse(`${l.start}T09:00:00.000Z`) - 14 * 86_400_000, Date.parse(`${today}T09:00:00.000Z`) - 86_400_000));
    await prisma.leaveRequest.create({
      data: {
        tenantId: g.id,
        staffId: l.staffId,
        leaveTypeId: leaveTypes.get(l.type)!.id,
        startDate: day(l.start),
        endDate: day(l.end),
        days: workingDaysBetween(l.start, l.end),
        reason: l.reason,
        status: l.status,
        requestedById: l.staffId === ngozi.id ? teacherUser.id : admin.id,
        decidedById: l.status === 'PENDING' ? null : admin.id,
        decidedAt: l.status === 'PENDING' ? null : new Date(asked.getTime() + 86_400_000),
        createdAt: asked,
        decisionNote: l.note ?? null,
      },
    });
  }
  await prisma.staffAttendance.updateMany({ where: { staffId: onLeave.id, status: 'ON_LEAVE' }, data: { method: 'LEAVE' } });

  // Awards from the end of last session and resumption.
  const star = staff.find((m) => heads.has(m.id) && m.id !== ngozi.id)!;
  await prisma.award.create({
    data: {
      tenantId: g.id,
      staffId: star.id,
      title: 'Teacher of the Term — Third Term 2025/2026',
      category: 'TEACHER_OF_TERM',
      citation: `${star.firstName} ${star.lastName} led the department through a demanding third term: every scheme of work was in place by week two, and the department's classes met each assessment deadline. Colleagues speak of a steady, generous presence in the staffroom. For dedication that lifts the whole school, we name ${star.firstName} ${star.lastName} Teacher of the Term.`,
      prize: 'Gift voucher (₦50,000) and certificate',
      awardedOn: day('2026-07-17'),
      createdById: admin.id,
    },
  });
  const veteran = [...staff].sort((a, b) => (a.employedOn?.getTime() ?? 0) - (b.employedOn?.getTime() ?? 0))[0]!;
  await prisma.award.create({
    data: {
      tenantId: g.id,
      staffId: veteran.id,
      title: 'Long Service Award',
      category: 'LONG_SERVICE',
      citation: null,
      prize: 'Plaque',
      awardedOn: day('2026-09-07'),
      createdById: admin.id,
    },
  });

  // Payroll: August and September, worked out with the app's own payslip maths.
  const payrollExpenses: { description: string; amountKobo: number; spentOn: string; paidTo: string; reference: string }[] = [];
  for (const [period, paidOn] of [['2026-08', '2026-08-28'], ['2026-09', '2026-09-28']] as const) {
    const { start, end } = periodBounds(period);
    const workingDays = workingDaysBetween(start, end);
    const paid = paidOn <= today;
    const run = await prisma.payrollRun.create({
      data: {
        tenantId: g.id,
        period,
        workingDays,
        status: paid ? 'PAID' : 'APPROVED',
        preparedById: admin.id,
        approvedById: principal.id,
        approvedAt: new Date(`${paidOn}T09:00:00.000Z`),
        paidOn: paid ? day(paidOn) : null,
        payMethod: paid ? 'BANK_TRANSFER' : null,
        payReference: paid ? `GTB-BULK-${period.replace('-', '')}` : null,
      },
    });
    const slips: Prisma.PayslipCreateManyInput[] = [];
    for (const m of staff) {
      const p = payProfiles.get(m.id)!;
      const otherAllowances = p.otherAllowances as unknown as Allowance[];
      const adjustments: PayAdjustment[] =
        period === '2026-09' && m.id === staff[2]!.id ? [{ kind: 'EARNING', label: 'Exam supervision allowance', amountKobo: naira(25_000) }]
        : period === '2026-09' && m.id === staff[29]!.id ? [{ kind: 'DEDUCTION', label: 'Salary advance repayment', amountKobo: naira(30_000) }]
        : [];
      const unpaidLeaveDays = period === '2026-09' && m.id === unpaidStaff.id ? 2 : 0;
      const calc = computePayslip({ ...p, otherAllowances, unpaidLeaveDays, workingDays, adjustments }, DEFAULT_HR_SETTINGS);
      const dep = deptRows.find((d) => d.members.some((x) => x.id === m.id))?.dep.name ?? null;
      slips.push({
        tenantId: g.id,
        runId: run.id,
        staffId: m.id,
        staffName: `${m.firstName} ${m.lastName}`,
        staffNumber: m.staffNumber,
        jobTitle: m.jobTitle,
        department: dep,
        bankName: p.bankName,
        accountNumber: p.accountNumber,
        accountName: p.accountName,
        pfaName: p.pfaName,
        pensionPin: p.pensionPin,
        taxId: p.taxId,
        basicKobo: p.basicKobo,
        housingKobo: p.housingKobo,
        transportKobo: p.transportKobo,
        otherAllowances: otherAllowances as unknown as Prisma.InputJsonValue,
        pensionEnabled: p.pensionEnabled,
        nhfEnabled: p.nhfEnabled,
        annualRentKobo: p.annualRentKobo,
        unpaidLeaveDays,
        adjustments: adjustments as unknown as Prisma.InputJsonValue,
        earnings: calc.earnings as unknown as Prisma.InputJsonValue,
        deductions: calc.deductions as unknown as Prisma.InputJsonValue,
        grossKobo: calc.grossKobo,
        payeKobo: calc.payeKobo,
        pensionKobo: calc.pensionKobo,
        nhfKobo: calc.nhfKobo,
        otherDeductionsKobo: calc.otherDeductionsKobo,
        netKobo: calc.netKobo,
        employerPensionKobo: calc.employerPensionKobo,
      });
    }
    await prisma.payslip.createMany({ data: slips });
    if (paid) {
      const sum = (k: 'netKobo' | 'payeKobo' | 'pensionKobo' | 'employerPensionKobo' | 'nhfKobo') => slips.reduce((n, s) => n + (s[k] as number), 0);
      const label = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(day(start));
      const reference = `GTB-BULK-${period.replace('-', '')}`;
      payrollExpenses.push(
        { description: `${label} salaries (${slips.length} staff, net pay)`, amountKobo: sum('netKobo'), spentOn: paidOn, paidTo: 'Staff payroll', reference },
        {
          description: `${label} PAYE, pension & NHF remittances`,
          amountKobo: sum('payeKobo') + sum('pensionKobo') + sum('employerPensionKobo') + sum('nhfKobo'),
          spentOn: paidOn,
          paidTo: 'State IRS, PFAs & FMBN',
          reference,
        },
      );
    }
  }
  await prisma.expense.createMany({
    data: payrollExpenses.map((e) => ({ ...e, tenantId: g.id, category: 'SALARIES', spentOn: day(e.spentOn), method: 'BANK_TRANSFER', recordedById: admin.id })),
  });

  // Two months of spending: diesel most weeks, utilities and upkeep (salaries come from payroll above).
  const expenseRows: { category: string; description: string; amount: number; date: string; paidTo: string }[] = [
    { category: 'UTILITIES', description: 'Electricity (prepaid meter)', amount: 285_000, date: '2026-08-05', paidTo: 'Eko Electricity' },
    { category: 'UTILITIES', description: 'Internet — dedicated line', amount: 180_000, date: '2026-08-10', paidTo: 'Spectranet' },
    { category: 'MAINTENANCE', description: 'Classroom painting before resumption', amount: 1_150_000, date: '2026-08-18', paidTo: 'Ade Decor Services' },
    { category: 'SUPPLIES', description: 'Chalk, markers and exercise books', amount: 342_500, date: '2026-09-02', paidTo: 'Lekki Stationers' },
    { category: 'MAINTENANCE', description: 'Generator servicing', amount: 210_000, date: '2026-09-09', paidTo: 'PowerTech Nigeria' },
    { category: 'UTILITIES', description: 'Electricity (prepaid meter)', amount: 310_000, date: '2026-09-04', paidTo: 'Eko Electricity' },
    { category: 'UTILITIES', description: 'Internet — dedicated line', amount: 180_000, date: '2026-09-10', paidTo: 'Spectranet' },
    { category: 'EVENTS', description: 'Resumption assembly & welcome reception', amount: 275_000, date: '2026-09-07', paidTo: 'Various' },
    { category: 'TRANSPORT', description: 'School bus tyres', amount: 420_000, date: '2026-09-15', paidTo: 'Tyre Plus Lekki' },
  ];
  for (const d of ['2026-08-03', '2026-08-17', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21']) {
    if (d > today) continue;
    expenseRows.push({ category: 'FUEL', description: 'Diesel for generators (1,000 litres)', amount: 1_150_000 + Math.round(rand() * 8) * 25_000, date: d, paidTo: 'Conoil Lekki' });
  }
  await prisma.expense.createMany({
    data: expenseRows
      .filter((e) => e.date <= today)
      .map((e) => ({
        tenantId: g.id,
        category: e.category,
        description: e.description,
        amountKobo: naira(e.amount),
        spentOn: day(e.date),
        paidTo: e.paidTo,
        method: 'BANK_TRANSFER',
        recordedById: admin.id,
      })),
  });

  await prisma.auditLog.create({
    data: {
      tenantId: g.id,
      actorUserId: admin.id,
      action: 'data.imported',
      summary: `Imported ${students.length} students, ${staff.length} staff, the class structure and ${scoreRows.length} 1st CA marks from the demo dataset`,
    },
  });

  // ------------------------------------------------------------ Sunrise
  const s = await createTenant('sunrise', 'Sunrise Academy', 'SRA', 'Rise and Shine', plan.id);
  const sunriseAdmin = await upsertUser('admin@sunrise.demo', 'Sunrise#2026', 'Halima', 'Bello');
  await member(s.id, sunriseAdmin.id, 'school_admin');
  // The demo parent has a child here too: one login, two schools.
  await member(s.id, parentUser.id, 'parent');
  await prisma.branch.create({ data: { tenantId: s.id, name: 'Main Campus', code: 'MAIN', isMain: true } });
  const ss = await prisma.academicSession.create({
    data: { tenantId: s.id, name: '2026/2027', startsOn: day('2026-09-07'), endsOn: day('2027-07-23'), isCurrent: true },
  });
  await prisma.term.create({
    data: { tenantId: s.id, sessionId: ss.id, name: 'First Term', order: 1, startsOn: day('2026-09-07'), endsOn: day('2026-12-18'), isCurrent: true },
  });
  const p4 = await prisma.classLevel.create({ data: { tenantId: s.id, name: 'Primary 4', code: 'PRY4', stage: 'Primary', order: 4 } });
  const p4a = await prisma.classArm.create({ data: { tenantId: s.id, classLevelId: p4.id, name: 'Gold', capacity: 25 } });
  const child = await prisma.student.create({
    data: { tenantId: s.id, classArmId: p4a.id, admissionNumber: 'SRA/2026/0001', firstName: 'Chiamaka', lastName: 'Nwosu', gender: 'FEMALE', admittedOn: day('2026-09-07') },
  });
  const sunriseParent = await prisma.guardian.create({
    data: { tenantId: s.id, userId: parentUser.id, firstName: 'Emeka', lastName: 'Nwosu', relationship: 'Father', phone: '+2348030000000', email: 'parent@greenfield.demo' },
  });
  await prisma.studentGuardian.create({ data: { tenantId: s.id, studentId: child.id, guardianId: sunriseParent.id, isPrimary: true } });

  return `${owner ? `owner ${owner.email}; ` : ''}Greenfield (${students.length} students, ${staff.length} staff, ${arms.length} classes); Sunrise Academy`;
}
