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
  DEFAULT_WEBSITE_SETTINGS,
  SYSTEM_ROLES,
  computePayslip,
  periodBounds,
  workingDaysBetween,
  type Allowance,
  type PayAdjustment,
} from '@aischool/shared';
import type { ClassArm, ClassLevel, Gender, HostelRoom, Invoice, Prisma, PrismaClient, Staff, TransportRoute } from '../generated/prisma/client';
import { hashPassword } from '../auth/password';
import { ensurePlatformContent } from './platform-content';
import { seedLearning } from './learning-seed';
import { seedPlans, seedPlatform } from './platform-seed';
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
  await ensurePlatformContent(prisma);
  const plans = await seedPlans(prisma);
  const plan = plans.growth;

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

  const staff: Staff[] = [];
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

  // ------------------------------------------------------------ operations
  // A working library, stores, three bus routes, two boarding houses, the
  // front desk's visitor book and enquiries, and a few certificates.
  const ago = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const lagos = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+01:00`);
  const levelOf = new Map(arms.map(({ level, arm }) => [arm.id, level.code]));
  const active = students.filter((st) => st.classArmId);
  await prisma.tenant.update({
    where: { id: g.id },
    data: { operationsSettings: { libraryLoanDays: 14, libraryStudentMaxLoans: 3, libraryStaffMaxLoans: 5, libraryFinePerDayKobo: 2_000, certificatePrefix: 'GIS', idCardValidUntil: '2027-07-23' } },
  });

  // Library
  const BOOKS: [string, string, string, string | null, string | null, number, string][] = [
    ['Things Fall Apart', 'Chinua Achebe', 'AFRICAN_LITERATURE', 'Literature in English', 'SS 1–3', 6, 'Okonkwo, a proud Igbo wrestler and farmer, and the coming of colonial rule to Umuofia.'],
    ['Arrow of God', 'Chinua Achebe', 'AFRICAN_LITERATURE', 'Literature in English', 'SS 2–3', 3, 'Ezeulu, chief priest of Ulu, caught between his people and the colonial administration.'],
    ['Chike and the River', 'Chinua Achebe', 'AFRICAN_LITERATURE', null, 'JSS 1–2', 5, 'Young Chike longs to cross the Niger to Asaba — a short adventure about courage and honesty.'],
    ['Purple Hibiscus', 'Chimamanda Ngozi Adichie', 'AFRICAN_LITERATURE', 'Literature in English', 'SS 1–3', 4, 'Kambili grows up in Enugu under a devout, violent father, and finds a different life at her aunt’s in Nsukka.'],
    ['Half of a Yellow Sun', 'Chimamanda Ngozi Adichie', 'AFRICAN_LITERATURE', null, 'SS 2–3', 2, 'Three lives swept up in the Nigerian Civil War.'],
    ['The Lion and the Jewel', 'Wole Soyinka', 'AFRICAN_LITERATURE', 'Literature in English', 'SS 1–3', 5, 'A comic play: the village belle Sidi, the schoolteacher Lakunle and the wily Bale, Baroka.'],
    ['The Joys of Motherhood', 'Buchi Emecheta', 'AFRICAN_LITERATURE', null, 'SS 2–3', 2, 'Nnu Ego’s life in colonial Lagos and the cost of devotion to her children.'],
    ['Second Class Citizen', 'Buchi Emecheta', 'AFRICAN_LITERATURE', null, 'SS 1–3', 2, 'Adah moves from Lagos to London and fights to write and raise her children.'],
    ['Eze Goes to School', 'Onuora Nzekwu & Michael Crowder', 'AFRICAN_LITERATURE', null, 'JSS 1–2', 6, 'A village boy’s determination to stay in school against the odds.'],
    ['The Drummer Boy', 'Cyprian Ekwensi', 'AFRICAN_LITERATURE', null, 'JSS 1–3', 4, 'Akin, a blind young drummer, and the music and dangers of the city.'],
    ['An African Night’s Entertainment', 'Cyprian Ekwensi', 'AFRICAN_LITERATURE', null, 'JSS 2–3', 3, 'A tale of love and revenge told under the moonlight.'],
    ['Without a Silver Spoon', 'Eddie Iroh', 'AFRICAN_LITERATURE', null, 'JSS 1–3', 5, 'Ike works as a houseboy to pay for his schooling — a story of hard work and integrity.'],
    ['Sweet Sixteen', 'Bolaji Abdullahi', 'AFRICAN_LITERATURE', 'Literature in English', 'JSS 3–SS 1', 5, 'Aliya’s sixteenth birthday, and the frank conversations with her father that come with it.'],
    ['The Last Days at Forcados High School', 'A. H. Mohammed', 'AFRICAN_LITERATURE', 'Literature in English', 'SS 1–3', 4, 'Final-year students at a Delta boarding school face choices about love, friendship and the future.'],
    ['Faceless', 'Amma Darko', 'AFRICAN_LITERATURE', 'Literature in English', 'SS 2–3', 3, 'Fofo, a street girl in Accra, and the women who try to help her.'],
    ['Unexpected Joy at Dawn', 'Alex Agyei-Agyiri', 'AFRICAN_LITERATURE', 'Literature in English', 'SS 2–3', 3, 'A Ghanaian woman’s search for her brother in Nigeria during the expulsions of 1983.'],
    ['Animal Farm', 'George Orwell', 'FICTION', null, 'SS 1–3', 3, 'Farm animals overthrow their master — and their revolution goes wrong.'],
    ['Charlotte’s Web', 'E. B. White', 'FICTION', null, 'JSS 1', 3, 'A pig named Wilbur and the spider who saves him.'],
    ['The Old Man and the Sea', 'Ernest Hemingway', 'FICTION', null, 'SS 1–3', 2, 'An ageing fisherman’s long struggle with a giant marlin.'],
    ['Diary of a Wimpy Kid', 'Jeff Kinney', 'FICTION', null, 'JSS 1–2', 4, 'Greg Heffley’s comic diary of surviving middle school.'],
    ['Gifted Hands', 'Ben Carson', 'NON_FICTION', null, 'JSS 3–SS 3', 3, 'From struggling pupil in Detroit to pioneering neurosurgeon.'],
    ['Long Walk to Freedom (abridged)', 'Nelson Mandela', 'NON_FICTION', 'Government', 'SS 1–3', 2, 'Mandela’s own story of the struggle against apartheid.'],
    ['There Was a Country', 'Chinua Achebe', 'NON_FICTION', 'Government', 'SS 3', 1, 'Achebe’s memoir of the Biafran war.'],
    ['New General Mathematics for SS 1', 'M. F. Macrae et al.', 'TEXTBOOK', 'Mathematics', 'SS 1', 8, null as unknown as string],
    ['New General Mathematics for JSS 2', 'M. F. Macrae et al.', 'TEXTBOOK', 'Mathematics', 'JSS 2', 8, null as unknown as string],
    ['Essential Mathematics for Senior Secondary Schools', 'A. J. S. Oluwasanmi', 'TEXTBOOK', 'Mathematics', 'SS 1–3', 6, null as unknown as string],
    ['New School Chemistry for Senior Secondary Schools', 'Osei Yaw Ababio', 'TEXTBOOK', 'Chemistry', 'SS 1–3', 6, null as unknown as string],
    ['Modern Biology for Senior Secondary Schools', 'Sarojini T. Ramalingam', 'TEXTBOOK', 'Biology', 'SS 1–3', 6, null as unknown as string],
    ['New School Physics for Senior Secondary Schools', 'M. W. Anyakoha', 'TEXTBOOK', 'Physics', 'SS 1–3', 5, null as unknown as string],
    ['Basic Science for Junior Secondary Schools 1', 'STAN', 'TEXTBOOK', 'Basic Science', 'JSS 1', 6, null as unknown as string],
    ['Intensive English for Junior Secondary Schools 2', 'Evans', 'TEXTBOOK', 'English Language', 'JSS 2', 6, null as unknown as string],
    ['Comprehensive Economics for Senior Secondary Schools', 'J. U. Anyaele', 'TEXTBOOK', 'Economics', 'SS 1–3', 4, null as unknown as string],
    ['Brighter Grammar', 'C. E. Eckersley', 'REFERENCE', 'English Language', 'JSS 1–SS 3', 4, null as unknown as string],
    ['Oxford Advanced Learner’s Dictionary', 'Oxford University Press', 'REFERENCE', 'English Language', null, 5, null as unknown as string],
    ['Macmillan Secondary School Atlas', 'Macmillan', 'REFERENCE', 'Geography', null, 4, null as unknown as string],
    ['A Brief History of Time', 'Stephen Hawking', 'SCIENCE', 'Physics', 'SS 2–3', 2, 'Black holes, the Big Bang and the nature of time, explained for everyone.'],
    ['The Story of Nigeria', 'Michael Crowder', 'NON_FICTION', 'Civic Education', 'SS 1–3', 2, 'Nigeria’s history from early kingdoms to independence.'],
    ['National Geographic Kids (bound volume)', 'National Geographic', 'MAGAZINE', null, 'JSS 1–3', 2, null as unknown as string],
  ];
  const books = [];
  for (const [i, [title, author, category, subject, level, copies, summary]] of BOOKS.entries()) {
    books.push(
      await prisma.libraryBook.create({
        data: {
          tenantId: g.id,
          title,
          author,
          category,
          subject,
          level,
          copies,
          summary,
          shelf: `${category === 'TEXTBOOK' ? 'T' : category === 'REFERENCE' ? 'R' : 'F'}${1 + (i % 6)}`,
          publishedYear: 1958 + Math.floor(rand() * 60),
        },
      }),
    );
  }
  const loanRows: { tenantId: string; bookId: string; studentId?: string; staffId?: string; issuedOn: Date; dueOn: Date; returnedOn: Date | null; fineKobo: number; finePaid: boolean; issuedById: string }[] = [];
  const out = new Map<string, number>();
  for (let i = 0; i < 90; i++) {
    const book = pick(books);
    const issued = ago(5 + Math.floor(rand() * 110));
    const due = new Date(Date.parse(`${issued}T00:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);
    const stillOut = issued >= ago(30) && chance(0.55);
    if (stillOut && (out.get(book.id) ?? 0) >= book.copies) continue;
    const late = Math.max(0, Math.round((rand() - 0.6) * 12));
    const returned = stillOut ? null : new Date(Date.parse(`${due}T00:00:00Z`) + (late - 4) * 86_400_000).toISOString().slice(0, 10);
    if (returned && returned > today) continue;
    if (stillOut) out.set(book.id, (out.get(book.id) ?? 0) + 1);
    const byStaff = chance(0.12);
    const fine = returned && returned > due ? Math.round((Date.parse(returned) - Date.parse(due)) / 86_400_000) * 2_000 : 0;
    loanRows.push({
      tenantId: g.id,
      bookId: book.id,
      ...(byStaff ? { staffId: pick(staff).id } : { studentId: pick(active).id }),
      issuedOn: day(issued),
      dueOn: day(due),
      returnedOn: returned ? day(returned) : null,
      fineKobo: fine,
      finePaid: fine > 0 && chance(0.6),
      issuedById: admin.id,
    });
  }
  await prisma.libraryLoan.createMany({ data: loanRows });

  // Inventory: consumables with eight weeks of use, and assets.
  const ITEMS: [string, string, string, number, number, number, number, boolean, string | null][] = [
    // name, category, unit, quantity now (before use), reorder level, unit cost (₦), weekly use, asset, condition
    ['White chalk (box of 100)', 'STATIONERY', 'boxes', 140, 30, 1_200, 9, false, null],
    ['Whiteboard markers', 'STATIONERY', 'pcs', 260, 60, 450, 22, false, null],
    ['A4 paper', 'STATIONERY', 'reams', 90, 40, 6_500, 9, false, null],
    ['Exercise books (40 leaves)', 'STATIONERY', 'pcs', 1_400, 300, 250, 55, false, null],
    ['Printer toner (HP 85A)', 'ICT', 'cartridges', 9, 4, 38_000, 0.7, false, null],
    ['Liquid detergent (5 L)', 'CLEANING', 'jerrycans', 30, 10, 7_800, 2.6, false, null],
    ['Toilet rolls (pack of 12)', 'CLEANING', 'packs', 70, 25, 4_200, 6, false, null],
    ['Disinfectant (4 L)', 'CLEANING', 'bottles', 12, 8, 6_900, 1.4, false, null],
    ['Hydrochloric acid (2.5 L)', 'LAB', 'bottles', 6, 3, 15_500, 0.3, false, null],
    ['Test tubes', 'LAB', 'pcs', 220, 80, 180, 6, false, null],
    ['Filter paper (pack)', 'LAB', 'packs', 14, 6, 3_200, 1, false, null],
    ['Paracetamol 500 mg (pack)', 'MEDICAL', 'packs', 40, 15, 650, 3.5, false, null],
    ['First-aid kit refills', 'MEDICAL', 'kits', 5, 4, 12_000, 0.3, false, null],
    ['Footballs (size 5)', 'SPORTS', 'pcs', 12, 4, 9_500, 0.2, false, null],
    ['Projectors (Epson)', 'ICT', 'units', 6, 0, 420_000, 0, true, 'GOOD'],
    ['Projector — Library', 'ICT', 'units', 1, 0, 380_000, 0, true, 'BROKEN'],
    ['Laptops (ICT lab)', 'ICT', 'units', 24, 0, 450_000, 0, true, 'GOOD'],
    ['Student desks and chairs', 'FURNITURE', 'sets', 410, 0, 38_000, 0, true, 'GOOD'],
    ['Staffroom chairs', 'FURNITURE', 'pcs', 8, 0, 25_000, 0, true, 'POOR'],
    ['Microscopes', 'LAB', 'units', 10, 0, 95_000, 0, true, 'FAIR'],
  ];
  const ISSUED_TO = ['JSS 1 A', 'JSS 2 B', 'SS 1 A', 'SS 2 A', 'Staffroom', 'Science lab', 'Sick bay', 'Cleaners', 'Admin office', 'Sports department'];
  for (const [name, category, unit, start, reorder, cost, weekly, isAsset, condition] of ITEMS) {
    const movements: { kind: string; change: number; date: string; issuedTo?: string; reason?: string; supplier?: string }[] = [
      { kind: 'IN', change: start, date: ago(60), reason: 'Opening stock', supplier: isAsset ? null! : 'Lekki Stationers & Supplies' },
    ];
    let qty = start;
    if (!isAsset) {
      for (let w = 8; w >= 1; w--) {
        const n = Math.max(0, Math.round(weekly * (0.7 + rand() * 0.6)));
        if (!n || n > qty) continue;
        qty -= n;
        movements.push({ kind: 'OUT', change: -n, date: ago(w * 7 - 2), issuedTo: pick(ISSUED_TO) });
      }
    }
    // Restock what ran low last month, leaving a few items below their reorder level to act on.
    if (!isAsset && qty <= reorder && !['Printer toner (HP 85A)', 'Disinfectant (4 L)', 'First-aid kit refills', 'A4 paper'].includes(name)) {
      const n = reorder * 3;
      qty += n;
      movements.push({ kind: 'IN', change: n, date: ago(12), supplier: 'Lekki Stationers & Supplies', reason: 'Restock' });
    }
    const item = await prisma.inventoryItem.create({
      data: { tenantId: g.id, name, category, unit, quantity: qty, reorderLevel: reorder, unitCostKobo: naira(cost), isAsset, condition, location: isAsset ? (category === 'ICT' ? 'ICT lab' : category === 'LAB' ? 'Science lab' : 'Classrooms') : 'Main store' },
    });
    let balance = 0;
    await prisma.stockMovement.createMany({
      data: movements
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((m) => {
          balance += m.change;
          return {
            tenantId: g.id,
            itemId: item.id,
            kind: m.kind,
            change: m.change,
            balanceAfter: balance,
            unitCostKobo: naira(cost),
            reason: m.reason ?? null,
            issuedTo: m.issuedTo ?? null,
            supplier: m.supplier ?? null,
            movedOn: day(m.date),
            recordedById: admin.id,
          };
        }),
    });
  }

  // Transport: three buses on three routes, riders from the bus fee list.
  const coaster1 = await prisma.vehicle.create({ data: { tenantId: g.id, name: 'Bus 1 (Toyota Coaster)', plateNumber: 'LND 482 KJ', capacity: 30, driverName: 'Mr Sunday Okon', driverPhone: '+2348033120044', assistantName: 'Mrs Bose Ade' } });
  const coaster2 = await prisma.vehicle.create({ data: { tenantId: g.id, name: 'Bus 2 (Toyota Coaster)', plateNumber: 'EPE 219 XA', capacity: 30, driverName: 'Mr Ibrahim Garba', driverPhone: '+2348051877310', assistantName: 'Miss Joy Etim' } });
  const hiace = await prisma.vehicle.create({ data: { tenantId: g.id, name: 'Bus 3 (Toyota Hiace)', plateNumber: 'KJA 731 LG', capacity: 14, driverName: 'Mr Felix Obi', driverPhone: '+2348090334187' } });
  await prisma.vehicle.create({ data: { tenantId: g.id, name: 'Spare bus (Mazda)', plateNumber: 'LSD 904 FE', capacity: 18, status: 'MAINTENANCE', notes: 'Gearbox repair at Lekki Auto — expected back mid-October' } });
  const ROUTES: [string, string, [string, string, string][]][] = [
    ['Lekki Phase 1', coaster1.id, [['Admiralty Way (Mega Plaza)', '06:30', '15:55'], ['Lekki Phase 1 Gate', '06:40', '15:45'], ['Chevron Roundabout', '06:55', '15:30'], ['Ikota Shopping Complex', '07:05', '15:20']]],
    ['Ajah & Sangotedo', coaster2.id, [['Sangotedo (Shoprite)', '06:15', '16:10'], ['Abraham Adesanya', '06:30', '15:55'], ['Ajah Under-bridge', '06:45', '15:40'], ['Thomas Estate', '06:55', '15:30']]],
    ['Ikoyi & Victoria Island', hiace.id, [['Falomo Roundabout', '06:10', '16:20'], ['Adeola Odeku (VI)', '06:25', '16:05'], ['Lekki Toll Gate', '06:45', '15:45']]],
  ];
  const routes: TransportRoute[] = [];
  for (const [name, vehicleId, stops] of ROUTES) {
    routes.push(await prisma.transportRoute.create({ data: { tenantId: g.id, name, vehicleId, stops: stops.map(([n, pickup, dropoff]) => ({ name: n, pickup, dropoff })) } }));
  }
  const busLines = await prisma.invoiceLine.findMany({ where: { tenantId: g.id, feeItem: { category: 'TRANSPORT' } }, select: { invoice: { select: { studentId: true } } } });
  const riders = [...new Set(busLines.map((l) => l.invoice.studentId))];
  // Three billed riders still waiting for a seat; two riders on the bus with no bus fee — both show as checks.
  const placed = riders.slice(3);
  const unbilled = active.filter((st) => !riders.includes(st.id)).slice(0, 2).map((st) => st.id);
  const routeFor = (i: number) => (i < 16 ? routes[2]! : i % 2 ? routes[0]! : routes[1]!);
  await prisma.transportAssignment.createMany({
    data: [...placed, ...unbilled].map((studentId, i) => {
      const r = routeFor(i);
      const stops = r.stops as { name: string }[];
      return { tenantId: g.id, studentId, routeId: r.id, stop: stops[i % stops.length]!.name };
    }),
  });

  // Hostel: senior boarders in two houses.
  const warden = (gender: 'MALE' | 'FEMALE') => staff.find((s) => s.gender === gender && s.type === 'NON_TEACHING') ?? staff.find((s) => s.gender === gender)!;
  const houses = [
    { name: 'Amina House', gender: 'FEMALE' as const, notes: 'Girls’ boarding, SS 1–3' },
    { name: 'Obafemi House', gender: 'MALE' as const, notes: 'Boys’ boarding, SS 1–3' },
  ];
  for (const hdef of houses) {
    const hostel = await prisma.hostel.create({ data: { tenantId: g.id, name: hdef.name, gender: hdef.gender, notes: hdef.notes, wardenStaffId: warden(hdef.gender).id } });
    const rooms: HostelRoom[] = [];
    for (let r = 1; r <= 5; r++) rooms.push(await prisma.hostelRoom.create({ data: { tenantId: g.id, hostelId: hostel.id, name: `Room ${r}`, beds: 8 } }));
    const boarders = active.filter((st) => st.gender === hdef.gender && String(levelOf.get(st.classArmId!)).startsWith('SS') && chance(0.45)).slice(0, 34);
    await prisma.hostelAllocation.createMany({
      data: boarders.map((st, i) => ({ tenantId: g.id, studentId: st.id, roomId: rooms[Math.floor(i / 8)]!.id, bed: (i % 8) + 1, fromDate: day('2026-09-06') })),
    });
    // Exeats: a couple out now (one late back), and some already returned.
    for (const [i, st] of boarders.slice(0, 5).entries()) {
      const leave = i < 2 ? ago(1) : ago(10 + i * 3);
      const back = i === 0 ? ago(0) : i === 1 ? ago(-2) : ago(8 + i * 3);
      await prisma.exeat.create({
        data: {
          tenantId: g.id,
          studentId: st.id,
          leaveAt: lagos(leave, '15:30'),
          expectedReturnAt: lagos(back, i === 0 ? '08:00' : '17:00'),
          returnedAt: i < 2 ? null : lagos(back, '16:40'),
          reason: pick(['Family wedding', 'Dental appointment', 'Grandmother’s 80th birthday', 'Medical check-up', 'Sibling’s graduation']),
          collectedBy: `${pick(hdef.gender === 'FEMALE' ? FEMALE : MALE)} ${st.lastName} (parent)`,
          approvedById: admin.id,
        },
      });
    }
  }

  // Reception: today's visitor book, the past fortnight, enquiries and early pick-ups.
  const VISITORS: [string, string | null, string, string | null][] = [
    ['Engr. Tope Alabi', 'Eko Electricity', 'Meter inspection', 'Bursar'],
    ['Mrs Funke Adebayo', null, 'Meeting about her son’s results', null],
    ['Mr Chidi Okeke', 'Lekki Stationers & Supplies', 'Delivering exercise books', 'Bursar'],
    ['Dr Amaka Obi', 'Lagos State Ministry of Education', 'Quality assurance visit', null],
    ['Mr Yusuf Bello', null, 'Admissions enquiry and school tour', null],
    ['Ms Kemi Ojo', 'PowerTech Nigeria', 'Generator servicing', null],
  ];
  const visitorRows = [];
  for (let d = 13; d >= 0; d--) {
    const date = ago(d);
    if ([0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())) continue;
    const n = d === 0 ? 4 : 1 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const [name, org, purpose, hostName] = pick(VISITORS);
      const inAt = lagos(date, `${String(8 + i * 2).padStart(2, '0')}:${String(5 + Math.floor(rand() * 50)).padStart(2, '0')}`);
      const stillHere = d === 0 && i >= 2;
      visitorRows.push({
        tenantId: g.id,
        name,
        organisation: org,
        purpose,
        hostName,
        hostStaffId: hostName ? null : pick(staff).id,
        phone: `+23480${Math.floor(10000000 + rand() * 89999999)}`,
        badgeNumber: `V${String(1 + i).padStart(2, '0')}`,
        checkInAt: inAt,
        checkOutAt: stillHere ? null : new Date(inAt.getTime() + (30 + Math.floor(rand() * 90)) * 60_000),
        recordedById: admin.id,
      });
    }
  }
  await prisma.visitor.createMany({ data: visitorRows.filter((v) => v.checkInAt.getTime() <= Date.now()) });
  const ENQUIRIES: [string, string, string, string, string, string | null, number, number | null][] = [
    // parent, child, class, source, status, question, days ago, follow-up in days
    ['Mrs Adaora Nnamdi', 'Chisom', 'JSS 1', 'WEBSITE', 'NEW', 'What are your fees for JSS 1 and do you run a school bus to Ajah?', 1, 1],
    ['Mr Babatunde Afolabi', 'Tolu', 'SS 1', 'PHONE', 'CONTACTED', 'Do you offer boarding for SS 1, and what subjects can science students take?', 4, 0],
    ['Mrs Hauwa Sani', 'Aisha', 'JSS 2', 'WHATSAPP', 'VISIT_BOOKED', 'Can we visit on a Saturday? We are relocating from Abuja in January.', 6, 3],
    ['Mr Kelechi Uzo', 'Daniel', 'JSS 1', 'REFERRAL', 'APPLIED', 'My friend’s daughter is in JSS 2 here. When is the entrance exam?', 15, null],
    ['Mrs Grace Etim', 'Blessing', 'SS 2', 'WALK_IN', 'ENROLLED', 'Is mid-session transfer into SS 2 possible?', 30, null],
    ['Mr Olumide Ajayi', 'Feyi and Femi (twins)', 'JSS 1', 'SOCIAL', 'NEW', 'Is there a discount for twins?', 0, 2],
    ['Mrs Ifeoma Chukwu', 'Kosi', 'JSS 3', 'PHONE', 'CLOSED', 'Do you prepare students for BECE?', 40, null],
    ['Dr Segun Adeleke', 'Moyo', 'SS 1', 'WEBSITE', 'CONTACTED', 'What ICT and coding opportunities do you have?', 9, -2],
    ['Mrs Ngozi Okafor', 'Ebube', 'JSS 1', 'WALK_IN', 'VISIT_BOOKED', 'We would like a tour and to meet the principal.', 3, 2],
    ['Mr Musa Danladi', 'Abdul', 'SS 1', 'REFERRAL', 'NEW', 'Do you accept students coming from a different curriculum (British)?', 2, 0],
  ];
  for (const [parentName, childName, classOfInterest, source, status, question, daysAgo, follow] of ENQUIRIES) {
    await prisma.enquiry.create({
      data: {
        tenantId: g.id,
        parentName,
        phone: `+23480${Math.floor(10000000 + rand() * 89999999)}`,
        childName,
        classOfInterest,
        entryTerm: 'Second Term 2026/2027',
        source,
        status,
        question,
        followUpOn: follow === null ? null : day(ago(-follow)),
        createdById: admin.id,
        createdAt: lagos(ago(daysAgo), '10:15'),
      },
    });
  }
  const pickupKids = active.slice(40, 44);
  for (const [i, kid] of pickupKids.entries()) {
    const link = await prisma.studentGuardian.findFirst({ where: { studentId: kid.id }, include: { guardian: true } });
    const known = i !== 3 && link;
    await prisma.studentPickup.create({
      data: {
        tenantId: g.id,
        studentId: kid.id,
        collectedBy: known ? `${link.guardian.firstName} ${link.guardian.lastName}` : 'Mr Peter Okon',
        relationship: known ? link.guardian.relationship : 'Driver',
        phone: known ? link.guardian.phone : '+2348077001122',
        reason: pick(['Hospital appointment', 'Family emergency', 'Feeling unwell (sick bay)', 'Visa interview']),
        onRecord: !!known,
        at: lagos(ago([0, 2, 5, 8][i]!), '12:40'),
        recordedById: admin.id,
      },
    });
  }

  // Certificates: a merit certificate, a staff service certificate and a transfer.
  const certStudent = active.find((st) => levelOf.get(st.classArmId!) === 'SS3')!;
  const leaver = active.find((st) => levelOf.get(st.classArmId!) === 'JSS2')!;
  const longest = [...staff].sort((a, b) => (a.employedOn?.getTime() ?? 0) - (b.employedOn?.getTime() ?? 0))[0]!;
  const CERTS = [
    { kind: 'MERIT', student: certStudent, title: 'Certificate of Merit — Mathematics', body: `This is to certify that ${certStudent.firstName} ${certStudent.lastName} achieved the highest mark in Mathematics in SS 3 in the Third Term of the 2025/2026 session, through consistent effort and careful work. We congratulate ${certStudent.firstName} on this achievement.`, issuedOn: '2026-07-17' },
    { kind: 'SERVICE', staff: longest, title: 'Certificate of Long Service', body: `In grateful recognition of ${longest.firstName} ${longest.lastName}'s loyal and dedicated service to Greenfield International School as ${longest.jobTitle} since ${longest.employedOn?.getUTCFullYear()}. Your commitment has shaped generations of our students.`, issuedOn: '2026-09-07' },
    { kind: 'TRANSFER', student: leaver, title: 'Transfer Certificate', body: `This is to certify that ${leaver.firstName} ${leaver.lastName} (admission number ${leaver.admissionNumber}) was a student of Greenfield International School and is in JSS 2 at the date of this certificate. ${leaver.firstName} leaves owing to the family's relocation to Abuja and is in good standing.`, issuedOn: ago(3) },
  ];
  for (const [i, c] of CERTS.entries()) {
    await prisma.certificate.create({
      data: {
        tenantId: g.id,
        serial: `GIS/${c.issuedOn.slice(0, 4)}/${String(i + 1).padStart(4, '0')}`,
        code: `DEMO${String(i + 1).padStart(2, '0')}${digits(4)}`,
        kind: c.kind,
        studentId: c.student?.id ?? null,
        staffId: c.staff?.id ?? null,
        recipientName: c.student ? `${c.student.firstName} ${c.student.lastName}` : `${c.staff!.firstName} ${c.staff!.lastName}`,
        recipientInfo: c.student ? (c.kind === 'MERIT' ? 'SS 3' : 'JSS 2') : c.staff!.jobTitle,
        title: c.title,
        body: c.body,
        issuedOn: day(c.issuedOn),
        issuedById: admin.id,
      },
    });
  }

  // ------------------------------------------------------------ communication
  // The term calendar, a noticeboard, a short history of messages sent home
  // and a few bell notifications.
  const jss1 = arms.filter(({ level }) => level.code === 'JSS1').map(({ arm }) => arm.id);
  const ss3 = arms.filter(({ level }) => level.code === 'SS3').map(({ arm }) => arm.id);
  const EVENTS: { title: string; category: string; start: string; end?: string; time?: string; endTime?: string; location?: string; audience?: string; classArmIds?: string[]; remind?: number; description?: string }[] = [
    { title: 'Independence Day — school closed', category: 'HOLIDAY', start: '2026-10-01' },
    { title: 'PTA general meeting', category: 'PTA', start: '2026-10-10', time: '10:00', endTime: '12:30', location: 'School hall', remind: 2, description: 'Agenda: first-term report from the principal, the new school bus routes, and the end-of-year party. All parents are welcome.' },
    { title: 'Inter-house sports', category: 'SPORTS', start: '2026-10-16', time: '09:00', endTime: '15:00', location: 'Sports field', remind: 3, description: 'Children should wear their house T-shirts and bring water. Parents are welcome to cheer from the stands.' },
    { title: 'Mid-term break', category: 'HOLIDAY', start: '2026-10-22', end: '2026-10-23' },
    { title: 'JSS 1 excursion to the National Museum, Onikan', category: 'TRIP', start: '2026-11-06', time: '08:30', endTime: '14:00', location: 'National Museum, Onikan', classArmIds: jss1, remind: 5, description: 'Signed consent forms and ₦5,000 for transport and lunch are due by 30 October.' },
    { title: 'SS 3 mock examinations', category: 'EXAM', start: '2026-11-16', end: '2026-11-27', classArmIds: ss3 },
    { title: 'Staff professional development day', category: 'MEETING', start: '2026-11-13', time: '13:00', endTime: '16:00', location: 'Staffroom', audience: 'STAFF', description: 'Using the AI lesson planner well, and assessment for learning.' },
    { title: 'First-term examinations', category: 'EXAM', start: '2026-12-01', end: '2026-12-11' },
    { title: 'Carol service and prize-giving', category: 'CULTURAL', start: '2026-12-17', time: '11:00', location: 'School hall', remind: 4 },
    { title: 'Last day of first term', category: 'ACADEMIC', start: '2026-12-18' },
  ];
  for (const e of EVENTS) {
    await prisma.schoolEvent.create({
      data: {
        tenantId: g.id,
        title: e.title,
        category: e.category,
        allDay: !e.time,
        startDate: day(e.start),
        startTime: e.time ?? null,
        endDate: e.end ? day(e.end) : null,
        endTime: e.endTime ?? null,
        location: e.location ?? null,
        audience: e.audience ?? 'EVERYONE',
        classArmIds: e.classArmIds ?? [],
        remindDaysBefore: e.remind ?? null,
        description: e.description ?? null,
        createdById: admin.id,
      },
    });
  }
  await prisma.announcement.createMany({
    data: [
      { tenantId: g.id, title: 'New school bus routes from Monday', body: 'We have added a third route for Ikoyi and Victoria Island. Parents who opted for the school bus will receive the pick-up time for their stop from the Transport Office this week.', audience: 'PARENTS', pinned: true, publishAt: new Date(`${ago(6)}T08:00:00Z`), createdById: admin.id },
      { tenantId: g.id, title: 'Inter-house sports: house T-shirts', body: 'House T-shirts are available at the bursary for ₦4,500. Please make sure your child has theirs before 16 October.', audience: 'EVERYONE', publishAt: new Date(`${ago(3)}T08:00:00Z`), createdById: admin.id },
      { tenantId: g.id, title: 'Staff briefing moved to Thursday', body: 'This week’s staff briefing is on Thursday at 7:30 in the staffroom instead of Monday.', audience: 'STAFF', publishAt: new Date(`${ago(2)}T07:00:00Z`), createdById: principal.id },
      { tenantId: g.id, title: 'JSS 1 excursion consent forms', body: 'Consent forms for the National Museum trip went home in book bags today. Please return them signed by 30 October.', audience: 'PARENTS', classArmIds: jss1, publishAt: new Date(`${ago(1)}T12:00:00Z`), createdById: admin.id },
    ],
  });
  // Messages sent before this demo: a fee reminder and a welcome-back note.
  const history: { title: string; daysAgo: number; channels: string[]; summary: string; audience: object; subject: string; body: string; sms: string; source: string; recipients: number }[] = [
    {
      title: 'Welcome back to first term',
      daysAgo: 24,
      channels: ['EMAIL', 'SMS'],
      summary: 'All parents (main contact per child)',
      audience: { type: 'ALL_PARENTS', primaryOnly: true },
      subject: 'Welcome back to the 2026/2027 session',
      body: 'Dear {{first_name}},\n\nWelcome back! First term begins on Monday 7 September. Classes start at 7:45 and the gates open at 7:00.\n\nWarm regards,\nGreenfield International School',
      sms: 'Welcome back! First term starts Mon 7 Sept. Classes begin 7:45am, gates open 7:00am. - Greenfield Int\'l School',
      source: 'MANUAL',
      recipients: 60,
    },
    {
      title: 'First-term fees reminder',
      daysAgo: 9,
      channels: ['SMS'],
      summary: 'Parents with fees outstanding past the due date (First Term)',
      audience: { type: 'FEE_DEBTORS', minBalanceKobo: 0, overdueOnly: true, primaryOnly: true },
      subject: 'First-term fees',
      body: 'Dear {{first_name}}, a reminder that {{balance}} is outstanding on {{children}}\'s first-term fees. Pay online with the link on your invoice, or at the bursary. Thank you.',
      sms: 'Dear {{first_name}}, {{balance}} is outstanding on {{children}}\'s first-term fees. Pay with the link on your invoice or at the bursary. Thank you.',
      source: 'FEES',
      recipients: 40,
    },
  ];
  const sampleGuardians = await prisma.guardian.findMany({ where: { tenantId: g.id }, take: 60, orderBy: { lastName: 'asc' } });
  for (const h of history) {
    const at = new Date(`${ago(h.daysAgo)}T09:00:00Z`);
    const b = await prisma.broadcast.create({
      data: { tenantId: g.id, title: h.title, channels: h.channels, audience: h.audience, audienceSummary: h.summary, subject: h.subject, body: h.body, smsBody: h.sms, source: h.source, status: 'SENT', sentAt: at, createdAt: at, createdById: admin.id },
    });
    const rows = [];
    for (const [i, gd] of sampleGuardians.slice(0, h.recipients).entries()) {
      for (const channel of h.channels) {
        const hasEmail = channel === 'EMAIL' && !!gd.email;
        const failed = channel === 'SMS' && i % 23 === 7;
        rows.push({
          tenantId: g.id,
          broadcastId: b.id,
          channel,
          recipientName: `${gd.firstName} ${gd.lastName}`,
          address: channel === 'EMAIL' ? gd.email : gd.phone.replace(/^\+/, ''),
          guardianId: gd.id,
          subject: channel === 'EMAIL' ? h.subject : null,
          text: (channel === 'SMS' ? h.sms : h.body).replace('{{first_name}}', gd.firstName).replace('{{children}}', 'your child').replace('{{balance}}', 'N150,000'),
          status: channel === 'EMAIL' && !hasEmail ? 'SKIPPED' : failed ? 'FAILED' : 'SENT',
          error: channel === 'EMAIL' && !hasEmail ? 'No email address on record' : failed ? 'Termii: DND number — use the DND route' : null,
          units: channel === 'SMS' && !failed ? 1 : 0,
          attempts: 1,
          sentAt: (channel === 'EMAIL' && !hasEmail) || failed ? null : at,
          createdAt: at,
        });
      }
    }
    await prisma.delivery.createMany({ data: rows });
  }
  await prisma.tenant.update({
    where: { id: g.id },
    data: {
      commsSettings: {
        smsPricePerUnitKobo: 400,
        senderName: 'Greenfield International School',
        birthdays: {
          students: { enabled: false, channels: ['SMS'], template: 'Dear {{first_name}}, everyone at {{school}} wishes {{children}} a very happy birthday today! Have a wonderful day.' },
          staff: { enabled: true, channels: ['IN_APP'], template: 'Happy birthday, {{first_name}}! Thank you for all you do at {{school}}. Enjoy your day.' },
          sendAt: '07:00',
        },
        eventReminders: { enabled: true, channels: ['IN_APP', 'SMS'] },
      },
    },
  });
  await prisma.notification.createMany({
    data: [
      { tenantId: g.id, userId: admin.id, title: '2 leave requests are waiting for a decision', body: 'Annual leave and compassionate leave — see HR → Leave.', link: '/hr/leave', createdAt: new Date(`${ago(1)}T08:10:00Z`) },
      { tenantId: g.id, userId: admin.id, title: 'Three items are low in stores', body: 'Disinfectant, printer toner and A4 paper are at or below their reorder level.', link: '/inventory', createdAt: new Date(`${ago(0)}T07:05:00Z`) },
      { tenantId: g.id, userId: teacherUser.id, title: 'Staff briefing moved to Thursday', body: 'This week’s staff briefing is on Thursday at 7:30 in the staffroom.', link: '/noticeboard', createdAt: new Date(`${ago(2)}T07:00:00Z`) },
      { tenantId: g.id, userId: parentUser.id, title: 'New school bus routes from Monday', body: 'We have added a third route for Ikoyi and Victoria Island.', link: '/noticeboard', createdAt: new Date(`${ago(6)}T08:00:00Z`) },
    ],
  });

  // ------------------------------------------------------------ live learning
  // Ngozi Eze's English classes: yesterday's live lesson with a transcript, the
  // AI summary pack and homework set from it; a class with notes only (ready
  // to summarise); and the week ahead. Meeting links are plain links, since no
  // Meet/Zoom account is connected in the demo.
  const ngoziStaff = staff.find((m) => m.userId === teacherUser.id)!;
  const english = subjects.find((sj) => sj.name === 'English Language')!;
  const ngoziArms = await prisma.classSubject.findMany({ where: { tenantId: g.id, teacherId: ngoziStaff.id, subjectId: english.id }, include: { classArm: { include: { classLevel: true } } } });
  const liveArm = ngoziArms[0]?.classArm ?? arms[0]!.arm;
  const liveArmStudents = active.filter((st) => st.classArmId === liveArm.id);
  const yesterday = ago(1);
  const lastSchoolDay = [0, 6].includes(new Date(`${yesterday}T12:00:00Z`).getUTCDay()) ? ago(3) : yesterday;
  const transcriptText = [
    'Mrs Eze: Good morning everyone. Today we are looking at reported speech, also called indirect speech.',
    'Mrs Eze: When we report what someone said, we usually move the tense one step back. "I am tired" becomes: she said she was tired.',
    'Tolu: Ma, what about "I will come tomorrow"?',
    'Mrs Eze: Good question, Tolu. Will becomes would, and tomorrow becomes the next day. So: he said he would come the next day.',
    'Mrs Eze: Pronouns change too. "I love my school" becomes: Ada said she loved her school.',
    'Chinedu: Do we always need "that"?',
    'Mrs Eze: "That" is optional. "She said that she was tired" and "She said she was tired" are both correct.',
    'Mrs Eze: Questions are different. "Where do you live?" becomes: he asked me where I lived. No question mark, and the word order is like a statement.',
    'Aisha: So for yes or no questions we use "if"?',
    'Mrs Eze: Exactly — "Are you ready?" becomes: she asked if I was ready. You can also use "whether".',
    'Mrs Eze: Some of you wrote "he asked where did I live". That is the common mistake: keep statement order after the question word.',
    'Mrs Eze: Time and place words change: today becomes that day, yesterday becomes the day before, here becomes there.',
    'Mrs Eze: Commands use "told" or "asked" with "to": "Close the door" becomes: she told me to close the door.',
    'Mrs Eze: For homework, rewrite the ten sentences in your workbook on page 54 in reported speech. We will mark them on Friday.',
  ].join('\n');
  const intelligence = {
    topic: 'Reported (indirect) speech',
    summary:
      'The class learnt how to report what someone has said. In reported speech the tense usually moves one step back (am → was, will → would), pronouns change to fit the speaker, and words of time and place shift (today → that day, here → there). Questions are reported with "asked" and keep statement word order, using "if" or "whether" for yes/no questions. Commands are reported with "told" or "asked" plus "to".',
    keyConcepts: ['Backshifting tenses (am → was, will → would)', 'Changing pronouns and possessives', 'Time and place words (today → that day)', 'Reporting questions with statement word order', 'Reporting commands with told/asked + to'],
    homework: {
      title: 'Reported speech practice',
      instructions: 'Rewrite each sentence in reported speech in your exercise book. Underline the words that changed.',
      questions: [
        'Ada said, "I am hungry."',
        'Musa said, "I will visit my grandmother tomorrow."',
        'The teacher asked, "Have you finished your work?"',
        'My mother said, "Close the windows."',
        'Tunde asked me, "Where do you live?"',
        'Grace said, "We are going to the market today."',
      ],
    },
    quiz: [
      { question: 'Which is the correct reported form of: She said, "I am tired."', options: ['She said she is tired.', 'She said she was tired.', 'She said I was tired.', 'She says she was tired.'], answerIndex: 1, explanation: 'The present tense "am" moves back to "was", and "I" becomes "she".' },
      { question: '"I will come tomorrow," he said. In reported speech "will" becomes…', options: ['shall', 'can', 'would', 'will'], answerIndex: 2, explanation: '"Will" backshifts to "would".' },
      { question: 'Which word introduces a reported yes/no question?', options: ['that', 'if', 'what', 'to'], answerIndex: 1, explanation: 'Yes/no questions are reported with "if" or "whether".' },
      { question: 'Report the command: "Open your books."', options: ['She said open your books.', 'She told us that we open our books.', 'She told us to open our books.', 'She asked did we open our books.'], answerIndex: 2, explanation: 'Commands use told/asked + to + verb.' },
      { question: '"Where do you live?" he asked. The correct reported question is…', options: ['He asked me where I lived.', 'He asked me where did I live.', 'He asked me where do I live?', 'He asked where I live?'], answerIndex: 0, explanation: 'Reported questions keep statement word order and lose the question mark.' },
    ],
    revisionNotes:
      'Reported speech tells someone what another person said, without quotation marks.\n\n1. Tenses move back: am/is → was; are → were; will → would; can → could; have → had.\n2. Pronouns change to fit who is speaking: "I love my school" → she said she loved her school.\n3. Time and place words change: today → that day; tomorrow → the next day; yesterday → the day before; here → there.\n4. "That" is optional after said.\n5. Questions: use asked; keep statement word order; no question mark. Wh-questions keep the question word; yes/no questions use if or whether.\n6. Commands: told/asked + object + to + verb ("She told me to close the door").',
    followUp: 'Several students still put the verb before the subject in reported questions ("where did I live"). Start Friday with a quick drill on statement word order before marking the homework.',
  };
  const startY = lagos(lastSchoolDay, '10:20');
  const yClass = await prisma.liveClass.create({
    data: {
      tenantId: g.id,
      title: 'English Language',
      classArmId: liveArm.id,
      subjectId: english.id,
      teacherId: ngoziStaff.id,
      provider: 'EXTERNAL',
      startsAt: startY,
      endsAt: new Date(startY.getTime() + 40 * 60_000),
      agenda: 'Reported speech: statements, questions and commands.',
      joinUrl: 'https://meet.google.com/xqe-ruwp-kdn',
      transcript: transcriptText,
      transcriptSource: 'UPLOAD',
      intelligence,
      summarySharedAt: new Date(startY.getTime() + 2 * 3_600_000),
      createdById: teacherUser.id,
    },
  });
  await prisma.liveAttendance.createMany({
    data: liveArmStudents.map((st, i) => ({
      tenantId: g.id,
      liveClassId: yClass.id,
      studentId: st.id,
      status: i % 11 === 4 ? 'ABSENT' : i % 7 === 2 ? 'LATE' : 'PRESENT',
      joinedAt: i % 11 === 4 ? null : new Date(startY.getTime() + (i % 7 === 2 ? 14 : 1) * 60_000),
      minutes: i % 11 === 4 ? null : i % 7 === 2 ? 26 : 39,
      source: 'MANUAL',
    })),
  });
  const hw = await prisma.homework.create({
    data: {
      tenantId: g.id,
      classArmId: liveArm.id,
      subjectId: english.id,
      teacherId: ngoziStaff.id,
      liveClassId: yClass.id,
      title: intelligence.homework.title,
      instructions: intelligence.homework.instructions,
      questions: intelligence.homework.questions,
      dueDate: day(ago(-3)),
      status: 'PUBLISHED',
      source: 'AI',
      publishedAt: new Date(startY.getTime() + 2 * 3_600_000),
      createdById: teacherUser.id,
    },
  });
  await prisma.liveClass.update({ where: { id: yClass.id }, data: { homeworkId: hw.id } });
  // A class with the teacher's notes only — ready for "Generate summary".
  const notesArm = ngoziArms[1]?.classArm ?? liveArm;
  const startN = lagos(ago(2), '08:40');
  await prisma.liveClass.create({
    data: {
      tenantId: g.id,
      title: 'English Language',
      classArmId: notesArm.id,
      subjectId: english.id,
      teacherId: ngoziStaff.id,
      provider: 'EXTERNAL',
      startsAt: startN,
      endsAt: new Date(startN.getTime() + 40 * 60_000),
      agenda: 'Summary writing',
      joinUrl: 'https://meet.google.com/pwa-nxte-jfo',
      teacherNotes:
        'Summary writing for WAEC-style passages. Read the passage twice; underline the key point in each paragraph; write each point as one sentence in your own words; avoid examples and repetition. Practised on "The Dangers of Drug Abuse" passage — most students copied whole sentences instead of rephrasing. Homework idea: summarise paragraph 3 of the comprehension passage on page 61 in three sentences.',
      createdById: teacherUser.id,
    },
  });
  // The week ahead.
  for (const [i, d] of [0, 1, 2, 4].entries()) {
    const date = ago(-d);
    if ([0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())) continue;
    const arm = ngoziArms[i % Math.max(1, ngoziArms.length)]?.classArm ?? liveArm;
    const at = lagos(date, i === 0 ? '16:00' : '11:00');
    await prisma.liveClass.create({
      data: {
        tenantId: g.id,
        title: i === 0 ? 'English Language — revision clinic' : 'English Language',
        classArmId: arm.id,
        subjectId: english.id,
        teacherId: ngoziStaff.id,
        provider: 'EXTERNAL',
        startsAt: at,
        endsAt: new Date(at.getTime() + 40 * 60_000),
        agenda: i === 0 ? 'Questions on reported speech before Friday’s marking.' : null,
        joinUrl: `https://meet.google.com/${['dkr-mavq-xpe', 'hjt-weub-qoa', 'zpe-kcyu-rnd', 'mvq-arpl-tse'][i]}`,
        createdById: teacherUser.id,
      },
    });
  }
  // The demo parent's child gets the same shared summary, homework and an upcoming class, so "My learning" has content.
  const parentChild = await prisma.studentGuardian.findFirst({ where: { tenantId: g.id, guardian: { userId: parentUser.id } }, include: { student: true } });
  const childArmId = parentChild?.student.classArmId;
  if (childArmId && childArmId !== liveArm.id) {
    const cs = await prisma.classSubject.findFirst({ where: { tenantId: g.id, classArmId: childArmId, subjectId: english.id } });
    const startC = lagos(lastSchoolDay, '13:00');
    const childClass = await prisma.liveClass.create({
      data: {
        tenantId: g.id,
        title: 'English Language',
        classArmId: childArmId,
        subjectId: english.id,
        teacherId: cs?.teacherId ?? ngoziStaff.id,
        provider: 'EXTERNAL',
        startsAt: startC,
        endsAt: new Date(startC.getTime() + 40 * 60_000),
        joinUrl: 'https://meet.google.com/kfo-zrst-wqa',
        transcript: transcriptText,
        transcriptSource: 'UPLOAD',
        intelligence,
        summarySharedAt: new Date(startC.getTime() + 3_600_000),
        createdById: admin.id,
      },
    });
    const childHw = await prisma.homework.create({
      data: {
        tenantId: g.id,
        classArmId: childArmId,
        subjectId: english.id,
        teacherId: cs?.teacherId ?? null,
        liveClassId: childClass.id,
        title: intelligence.homework.title,
        instructions: intelligence.homework.instructions,
        questions: intelligence.homework.questions,
        dueDate: day(ago(-3)),
        status: 'PUBLISHED',
        source: 'AI',
        publishedAt: new Date(startC.getTime() + 3_600_000),
        createdById: admin.id,
      },
    });
    await prisma.liveClass.update({ where: { id: childClass.id }, data: { homeworkId: childHw.id } });
    const nextC = lagos(ago(-1), '15:00');
    await prisma.liveClass.create({
      data: { tenantId: g.id, title: 'Mathematics — revision', classArmId: childArmId, subjectId: subjects.find((sj) => sj.name === 'Mathematics')!.id, provider: 'EXTERNAL', startsAt: nextC, endsAt: new Date(nextC.getTime() + 45 * 60_000), joinUrl: 'https://meet.google.com/qmz-tabc-uvo', createdById: admin.id },
    });
  }
  const maths = subjects.find((sj) => sj.name === 'Mathematics')!;
  const mathsArm = await prisma.classSubject.findFirst({ where: { tenantId: g.id, subjectId: maths.id, classArmId: liveArm.id } });
  await prisma.homework.create({
    data: {
      tenantId: g.id,
      classArmId: liveArm.id,
      subjectId: maths.id,
      teacherId: mathsArm?.teacherId ?? null,
      title: 'Simple equations',
      instructions: 'Solve each equation, showing every step. Check your answer by substituting it back.',
      questions: ['3x + 5 = 20', '7 − 2y = 1', '4(a − 3) = 2a + 6', 'x/5 + 2 = 6'],
      dueDate: day(ago(-5)),
      status: 'PUBLISHED',
      source: 'MANUAL',
      publishedAt: new Date(`${ago(1)}T14:00:00Z`),
      createdById: admin.id,
    },
  });

  // ------------------------------------------------------------ website
  // A published school website: page copy, news, the public calendar,
  // teacher profiles, a gallery album, and mid-term results for one class
  // that parents can check with the codes the school prints.
  const W = DEFAULT_WEBSITE_SETTINGS;
  await prisma.tenant.update({
    where: { id: g.id },
    data: {
      websiteSettings: {
        ...W,
        published: true,
        theme: { primaryColor: '#0f5132', accentColor: '#d97706', style: 'MODERN' },
        hero: {
          ...W.hero,
          title: 'Where curious children become confident young leaders',
          subtitle: 'A caring nursery, primary and secondary school in Lekki and Ikeja, with small classes, strong teaching and a warm community.',
        },
        about: {
          ...W.about,
          founded: '2009',
          story:
            'Greenfield International School opened in 2009 with 46 pupils in a converted house in Lekki. Today we teach nursery, primary and secondary pupils across two campuses.\n\nWe believe every child can do well when they are known, stretched and cared for. Our teachers plan together, track each child’s progress closely and keep parents informed every week.\n\nBeyond the classroom, our pupils debate, code, play football and basketball, sing in the choir and serve the community through our outreach club.',
          mission: 'To give every child a rigorous education and the character to use it well.',
          vision: 'Confident, kind young people ready for any university and any future.',
          values: [
            { title: 'Knowledge', description: 'We read widely, think carefully and never stop asking why.' },
            { title: 'Character', description: 'Honesty, respect and kindness in everything we do.' },
            { title: 'Excellence', description: 'We aim high and help one another get there.' },
            { title: 'Community', description: 'Parents, pupils and staff working as one team.' },
          ],
          leaderName: 'Mr Babatunde Adeyemi',
          leaderTitle: 'Principal',
          leaderMessage: 'Welcome to Greenfield. We are proud of our pupils, our teachers and the partnership we share with parents. Come and visit — you will feel the difference the moment you walk in.',
        },
        academics: {
          intro: 'We follow the Nigerian national curriculum, enriched with extra reading, project work and technology. Pupils sit the BECE in JSS 3 and WAEC and NECO in SS 3.',
          programmes: [
            { title: 'Nursery', description: 'Play-based learning for ages 2–5, building early literacy, numeracy and social skills.' },
            { title: 'Primary', description: 'Primary 1–6, with a strong focus on reading, mathematics, science and the creative arts.' },
            { title: 'Junior secondary', description: 'JSS 1–3: a broad curriculum with ICT, French and Basic Technology, leading to the BECE.' },
            { title: 'Senior secondary', description: 'SS 1–3 in science, commercial and arts tracks, preparing for WAEC, NECO and JAMB.' },
          ],
          highlights: ['Average class size of 25', 'Weekly progress updates for parents', 'Coding and robotics club', 'A library of over 6,000 books'],
        },
        admissions: {
          open: true,
          intro: 'We welcome applications all year round, subject to space. Start online and our admissions team will call you within two working days.',
          steps: [
            { title: 'Apply online', description: 'Fill in the short form on this page.' },
            { title: 'Visit the school', description: 'Tour the campus and meet the admissions team.' },
            { title: 'Entrance assessment', description: 'English, mathematics and a short interview.' },
            { title: 'Offer and acceptance', description: 'Pay the acceptance fee to secure a place.' },
          ],
          requirements: ['Birth certificate', 'Last two school reports', 'Two passport photographs', 'Transfer letter (from JSS 2 upwards)'],
          entryTerms: ['First Term', 'Second Term', 'Third Term'],
        },
        contact: {
          ...W.contact,
          address: '12 Admiralty Way, Lekki Phase 1, Lagos',
          phone: '+234 803 000 1234',
          whatsapp: '+234 803 000 1234',
          email: 'admissions@greenfield.demo',
          hours: 'Monday–Friday, 7:30am–4:00pm',
        },
        social: { ...W.social, instagram: 'https://instagram.com/greenfield.demo', facebook: 'https://facebook.com/greenfield.demo' },
        faq: [
          { question: 'What ages do you admit?', answer: 'From age 2 in our nursery up to SS 2. Entry into SS 3 is not usually possible.' },
          { question: 'Do you run a school bus?', answer: 'Yes. Buses cover Lekki, Ajah, Victoria Island and Ikeja. Ask the office for routes and termly fees.' },
          { question: 'What are the school hours?', answer: 'Lessons run from 7:45am to 2:30pm; clubs run until 4:00pm.' },
          { question: 'How do I check my child’s result?', answer: 'Use the Results page with your child’s admission number and the code on the slip from the school.' },
          { question: 'Can I pay fees in instalments?', answer: 'Yes, by arrangement with the bursar. Contact the school office to agree a plan.' },
        ],
        sections: { ...W.sections, fees: true },
        seo: { title: null, description: 'Greenfield International School: nursery, primary and secondary education in Lekki and Ikeja, Lagos.' },
      } as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.tenantDomain.create({ data: { tenantId: g.id, hostname: 'greenfield-site.localhost', kind: 'WEBSITE' } });

  const POSTS: { slug: string; title: string; category: string; daysAgo: number; excerpt: string; body: string; draft?: boolean }[] = [
    {
      slug: 'a-strong-start-to-the-new-session',
      title: 'A strong start to the 2026/2027 session',
      category: 'NEWS',
      daysAgo: 22,
      excerpt: 'We welcomed 64 new pupils and three new teachers as the first term began.',
      body: 'The new session began on 7 September with a full assembly and a warm welcome for 64 new pupils across both campuses.\n\nThree new teachers joined us this term, in mathematics, French and computer studies. Our refurbished science laboratory also opened, with new equipment for physics and chemistry practicals.\n\nThank you to every parent who helped make the first weeks so smooth.',
    },
    {
      slug: 'debaters-reach-the-state-finals',
      title: 'Greenfield debaters reach the Lagos State finals',
      category: 'ACHIEVEMENT',
      daysAgo: 9,
      excerpt: 'Our senior debate team won four rounds in a row to reach the state finals.',
      body: 'Our senior debate team won four rounds in a row at the Lagos State Secondary Schools Debate Championship and will compete in the finals next month.\n\nThe team argued on topics from renewable energy to the role of social media in elections. Well done to them and to their coach.',
    },
    {
      slug: 'inter-house-sports-what-parents-need-to-know',
      title: 'Inter-house sports: what parents need to know',
      category: 'ANNOUNCEMENT',
      daysAgo: 3,
      excerpt: 'Times, house colours and what to bring on 16 October.',
      body: 'Our inter-house sports competition takes place on Friday 16 October from 9:00am on the school field.\n\n- Pupils should wear their house T-shirts and trainers.\n- Bring a water bottle and a hat.\n- Parents are welcome; seating opens at 8:30am.\n\nThe day ends with the march past and prize-giving at about 3:00pm.',
    },
    { slug: 'science-fair-2026', title: 'Science fair 2026', category: 'NEWS', daysAgo: 1, excerpt: 'Projects on display in November.', body: 'Draft: details to follow once the date is confirmed.', draft: true },
  ];
  for (const p of POSTS) {
    await prisma.websitePost.create({
      data: {
        tenantId: g.id,
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt,
        body: p.body,
        category: p.category,
        status: p.draft ? 'DRAFT' : 'PUBLISHED',
        publishedAt: p.draft ? null : new Date(`${ago(p.daysAgo)}T09:00:00Z`),
        createdById: admin.id,
      },
    });
  }
  // School-wide events go on the public calendar; class and staff events stay inside.
  await prisma.schoolEvent.updateMany({ where: { tenantId: g.id, audience: 'EVERYONE', classArmIds: { isEmpty: true } }, data: { showOnWebsite: true } });

  const BIOS = [
    'Leads our mathematics department and runs the Olympiad club.',
    'Teaches English language and literature, and coaches the debate team.',
    'A physics graduate who loves practical science and robotics.',
    'Teaches French and organises our annual cultural day.',
    'Brings history to life through projects and trips.',
    'Teaches computer studies and runs the coding club.',
  ];
  for (const [i, st] of staff.filter((x) => x.type === 'TEACHING').slice(0, 8).entries()) {
    await prisma.staff.update({ where: { id: st.id }, data: { showOnWebsite: true, websiteBio: BIOS[i % BIOS.length] } });
  }

  await prisma.websiteAlbum.create({ data: { tenantId: g.id, title: 'First day of the new session', description: 'Smiles, new uniforms and new friends.', date: day('2026-09-07'), published: true } });

  // Mid-term results for one class, released to parents, with result-checker codes.
  const resultArm = arms[0]!.arm;
  for (const st of students.filter((x) => x.classArmId === resultArm.id && x.status === 'ACTIVE')) {
    await prisma.reportCard.create({
      data: {
        tenantId: g.id,
        studentId: st.id,
        termId: currentTerm.id,
        classArmId: resultArm.id,
        teacherRemark: pick(['A good start to the term. Keep it up.', 'Works hard and takes part well in class.', 'Capable; more care with homework will help.']),
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    await prisma.resultAccessCode.create({ data: { tenantId: g.id, studentId: st.id, termId: currentTerm.id, code: `DEMO${digits(6)}`, maxUses: 5 } });
  }

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

  const platform = await seedPlatform(prisma, { plans, greenfieldId: g.id, sunriseId: s.id, greenfieldAdminId: admin.id, demoStaff: demoOwner });
  const finance = await prisma.user.findUnique({ where: { email: 'finance@aischool.os' }, select: { id: true } });
  const learning = await seedLearning(prisma, { greenfieldId: g.id, sunriseId: s.id, parentUserId: parentUser.id, financeUserId: finance?.id ?? null });

  return `${owner ? `owner ${owner.email}; ` : ''}Greenfield (${students.length} students, ${staff.length} staff, ${arms.length} classes); Sunrise Academy; ${platform}; ${learning}`;
}
