import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  gradeFor,
  rank,
  round1,
  type AssessmentComponent,
  type Broadsheet,
  type ClassAnalysis,
  type GradeBand,
  type SubjectAnalysis,
} from '@aischool/shared';
import { fullName } from '../common/format';
import { currentContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentSettingsService } from './assessment-settings.service';

interface StudentRef {
  id: string;
  name: string;
  firstName: string;
  admissionNumber: string;
  gender: 'MALE' | 'FEMALE';
}

interface SubjectRef {
  id: string;
  name: string;
  code: string;
}

export interface SubjectResult {
  scores: Record<string, number | null>;
  /**
   * Raw marks over the components this class has been assessed on in the
   * subject so far; a missing mark in an assessed component counts as 0.
   */
  total: number | null;
  /** The maximum those assessed components add up to. */
  outOf: number;
  /** total / outOf as a percentage. Grades, positions and statistics use this. */
  percent: number | null;
  /** Every component assessed, and this student marked in all of them. */
  complete: boolean;
}

/**
 * Everything a class scored in a term, computed once and shared by the score
 * sheet, broadsheet, report cards and analysis so they can never disagree.
 */
export interface ClassResults {
  classArm: { id: string; name: string; levelName: string; classTeacher: string | null; classTeacherUserId: string | null };
  term: { id: string; name: string; sessionName: string; startsOn: Date; endsOn: Date };
  components: AssessmentComponent[];
  gradingScale: GradeBand[];
  students: StudentRef[];
  subjects: SubjectRef[];
  /** results[studentId][subjectId] */
  results: Map<string, Map<string, SubjectResult>>;
  /** Per-subject position of each student, by total. */
  subjectPositions: Map<string, Map<string, number | null>>;
  averages: Map<string, number | null>;
  positions: Map<string, number | null>;
}

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AssessmentSettingsService,
  ) {}

  async classResults(classArmId: string, termId: string): Promise<ClassResults> {
    const db = this.prisma.db;
    const [arm, term, settings, scores, enrolled] = await Promise.all([
      db.classArm.findUniqueOrThrow({
        where: { id: classArmId },
        include: { classLevel: true, classTeacher: true },
      }),
      db.term.findUniqueOrThrow({ where: { id: termId }, include: { session: true } }),
      this.settings.get(),
      db.score.findMany({
        where: { classArmId, termId },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, gender: true } },
          subject: { select: { id: true, name: true, code: true } },
        },
      }),
      db.student.findMany({
        where: { classArmId, status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true, admissionNumber: true, gender: true },
      }),
    ]);

    // The class list: everyone currently in the class, plus anyone who was
    // marked here this term and has since moved.
    const students = new Map<string, StudentRef>();
    for (const s of [...enrolled, ...scores.map((x) => x.student)]) {
      students.set(s.id, { id: s.id, name: fullName(s), firstName: s.firstName, admissionNumber: s.admissionNumber, gender: s.gender });
    }
    const subjects = new Map<string, SubjectRef>();
    for (const s of scores) subjects.set(s.subject.id, s.subject);

    const results = new Map<string, Map<string, SubjectResult>>();
    for (const s of scores) {
      const bySubject = results.get(s.studentId) ?? new Map<string, SubjectResult>();
      const r = bySubject.get(s.subjectId) ?? emptyResult(settings.components);
      r.scores[s.componentKey] = Number(s.score);
      bySubject.set(s.subjectId, r);
      results.set(s.studentId, bySubject);
    }
    // A component counts as assessed for a subject once anyone in the class
    // has a mark for it; mid-term that may be just the 1st CA.
    const assessed = new Map<string, AssessmentComponent[]>();
    for (const subjectId of subjects.keys()) {
      const keys = new Set(scores.filter((s) => s.subjectId === subjectId).map((s) => s.componentKey));
      assessed.set(subjectId, settings.components.filter((c) => keys.has(c.key)));
    }
    for (const bySubject of results.values()) {
      for (const [subjectId, r] of bySubject) {
        const comps = assessed.get(subjectId)!;
        r.outOf = comps.reduce((n, c) => n + c.maxScore, 0);
        r.total = round1(comps.reduce((n, c) => n + (r.scores[c.key] ?? 0), 0));
        r.percent = r.outOf ? round1((r.total / r.outOf) * 100) : null;
        r.complete =
          comps.length === settings.components.length && settings.components.every((c) => r.scores[c.key] != null);
      }
    }

    const studentList = [...students.values()].sort((a, b) => a.name.localeCompare(b.name));
    const subjectList = [...subjects.values()].sort((a, b) => a.name.localeCompare(b.name));

    const subjectPositions = new Map<string, Map<string, number | null>>();
    for (const subject of subjectList) {
      const percents = studentList.map((s) => results.get(s.id)?.get(subject.id)?.percent ?? null);
      const positions = rank(percents);
      subjectPositions.set(subject.id, new Map(studentList.map((s, i) => [s.id, positions[i] ?? null])));
    }

    const averages = new Map<string, number | null>();
    for (const s of studentList) {
      const percents = [...(results.get(s.id)?.values() ?? [])].map((r) => r.percent).filter((v): v is number => v !== null);
      averages.set(s.id, percents.length ? round1(percents.reduce((a, b) => a + b, 0) / percents.length) : null);
    }
    const overall = rank(studentList.map((s) => averages.get(s.id) ?? null));
    const positions = new Map(studentList.map((s, i) => [s.id, overall[i] ?? null]));

    return {
      classArm: {
        id: arm.id,
        name: arm.name,
        levelName: arm.classLevel.name,
        classTeacher: arm.classTeacher ? fullName(arm.classTeacher) : null,
        classTeacherUserId: arm.classTeacher?.userId ?? null,
      },
      term: { id: term.id, name: term.name, sessionName: term.session.name, startsOn: term.startsOn, endsOn: term.endsOn },
      components: settings.components,
      gradingScale: settings.gradingScale,
      students: studentList,
      subjects: subjectList,
      results,
      subjectPositions,
      averages,
      positions,
    };
  }

  broadsheet(r: ClassResults): Broadsheet {
    const subjectAverages: Record<string, number | null> = {};
    for (const s of r.subjects) subjectAverages[s.id] = mean(r.students.map((st) => r.results.get(st.id)?.get(s.id)?.percent ?? null));
    return {
      classArm: { id: r.classArm.id, name: r.classArm.name, levelName: r.classArm.levelName },
      term: { id: r.term.id, name: r.term.name, sessionName: r.term.sessionName },
      subjects: r.subjects,
      rows: r.students
        .map((st) => {
          const totals: Record<string, number | null> = {};
          for (const s of r.subjects) totals[s.id] = r.results.get(st.id)?.get(s.id)?.percent ?? null;
          return {
            student: { id: st.id, name: st.name, admissionNumber: st.admissionNumber },
            totals,
            subjectsTaken: Object.values(totals).filter((v) => v !== null).length,
            average: r.averages.get(st.id) ?? null,
            position: r.positions.get(st.id) ?? null,
          };
        })
        .sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9) || a.student.name.localeCompare(b.student.name)),
      subjectAverages,
      classAverage: mean(r.students.map((st) => r.averages.get(st.id) ?? null)),
    };
  }

  analysis(r: ClassResults): ClassAnalysis {
    const pass = (total: number) => gradeFor(total, r.gradingScale).pass;
    const subjects: SubjectAnalysis[] = r.subjects.map((s) => {
      const rows = r.students.map((st) => r.results.get(st.id)?.get(s.id)).filter((x): x is SubjectResult => !!x);
      const totals = rows.map((x) => x.percent).filter((v): v is number => v !== null).sort((a, b) => a - b);
      const distribution: Record<string, number> = Object.fromEntries(r.gradingScale.map((b) => [b.grade, 0]));
      for (const t of totals) distribution[gradeFor(t, r.gradingScale).grade]!++;
      const componentMeans: Record<string, number | null> = {};
      for (const c of r.components) componentMeans[c.key] = mean(rows.map((x) => x.scores[c.key] ?? null));
      return {
        subject: s,
        entered: totals.length,
        mean: mean(totals),
        median: totals.length ? round1(totals[Math.floor((totals.length - 1) / 2)]! / 2 + totals[Math.ceil((totals.length - 1) / 2)]! / 2) : null,
        highest: totals.length ? totals[totals.length - 1]! : null,
        lowest: totals.length ? totals[0]! : null,
        passRate: totals.length ? round1((totals.filter(pass).length / totals.length) * 100) : null,
        distribution,
        componentMeans,
      };
    });

    const averages = r.students.map((st) => ({ st, avg: r.averages.get(st.id) ?? null }));
    const withAvg = averages.filter((x): x is { st: StudentRef; avg: number } => x.avg !== null);
    const allTotals = r.students.flatMap((st) => [...(r.results.get(st.id)?.values() ?? [])].map((x) => x.percent).filter((v): v is number => v !== null));
    const expectedCells = r.students.length * r.subjects.length * r.components.length;
    const enteredCells = [...r.results.values()].flatMap((m) => [...m.values()]).reduce(
      (n, x) => n + Object.values(x.scores).filter((v) => v != null).length,
      0,
    );

    return {
      classArm: { id: r.classArm.id, name: r.classArm.name, levelName: r.classArm.levelName },
      term: { id: r.term.id, name: r.term.name, sessionName: r.term.sessionName },
      students: r.students.length,
      overall: {
        mean: mean(allTotals),
        passRate: allTotals.length ? round1((allTotals.filter(pass).length / allTotals.length) * 100) : null,
        completeness: expectedCells ? round1((enteredCells / expectedCells) * 100) : 0,
      },
      subjects,
      topStudents: [...withAvg].sort((a, b) => b.avg - a.avg).slice(0, 5).map((x) => ({ id: x.st.id, name: x.st.name, average: x.avg })),
      atRisk: averages
        .map(({ st, avg }) => ({
          id: st.id,
          name: st.name,
          average: avg,
          failedSubjects: r.subjects
            .filter((s) => {
              const t = r.results.get(st.id)?.get(s.id)?.percent;
              return t != null && !pass(t);
            })
            .map((s) => s.name),
        }))
        .filter((x) => x.failedSubjects.length >= 2 || (x.average !== null && !pass(x.average)))
        .sort((a, b) => (a.average ?? 0) - (b.average ?? 0))
        .slice(0, 15),
    };
  }

  /**
   * Who may enter marks for a subject in a class: anyone with results.publish,
   * or, with results.enter, the teacher of that subject in that class or the
   * class teacher.
   */
  async canEnterScores(classArmId: string, subjectId: string): Promise<boolean> {
    const ctx = currentContext();
    if (ctx.permissions.has('results.publish')) return true;
    if (!ctx.permissions.has('results.enter')) return false;
    const staff = await this.prisma.db.staff.findFirst({ where: { userId: ctx.userId }, select: { id: true } });
    if (!staff) return false;
    const [teaches, leads] = await Promise.all([
      this.prisma.db.classSubject.count({ where: { classArmId, subjectId, teacherId: staff.id } }),
      this.prisma.db.classArm.count({ where: { id: classArmId, classTeacherId: staff.id } }),
    ]);
    return teaches + leads > 0;
  }

  async assertCanEnterScores(classArmId: string, subjectId: string) {
    if (!(await this.canEnterScores(classArmId, subjectId))) {
      throw new ForbiddenException('You can enter marks only for subjects you teach in this class');
    }
  }
}

function emptyResult(components: AssessmentComponent[]): SubjectResult {
  return { scores: Object.fromEntries(components.map((c) => [c.key, null])), total: null, outOf: 0, percent: null, complete: false };
}

export function mean(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x != null);
  return v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : null;
}
