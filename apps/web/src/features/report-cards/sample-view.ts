import type { AssessmentComponent, GradeBand, ReportCardView, ReportTemplateConfig } from '@aischool/shared';

/** Made-up results for the layout editor's live preview. */
const SUBJECTS: [string, number[]][] = [
  ['English Language', [16, 17, 52]],
  ['Mathematics', [18, 19, 58]],
  ['Basic Science', [14, 15, 44]],
  ['Social Studies', [12, 16, 40]],
  ['Civic Education', [17, 15, 49]],
  ['Computer Studies', [19, 18, 55]],
  ['Agricultural Science', [11, 13, 35]],
  ['Yoruba', [15, 14, 41]],
  ['Christian Religious Studies', [16, 18, 50]],
];

const round1 = (n: number) => Math.round(n * 10) / 10;

export function sampleReportView({
  config,
  components,
  gradingScale,
  school,
}: {
  config: ReportTemplateConfig;
  components: AssessmentComponent[];
  gradingScale: GradeBand[];
  school: { name: string; motto: string | null; logoUrl: string | null; address?: string | null };
}): ReportCardView {
  const outOf = components.reduce((n, c) => n + c.maxScore, 0) || 100;
  const bands = [...gradingScale].sort((a, b) => b.min - a.min);
  const termNames = ['First Term', 'Second Term', 'Third Term'];

  const subjects = SUBJECTS.map(([name, raw], i) => {
    // Spread the sample marks over the school's own components.
    const share = raw.reduce((a, b) => a + b, 0) / 100;
    const scores: Record<string, number | null> = {};
    let total = 0;
    components.forEach((c) => {
      const v = Math.round(c.maxScore * share * (0.92 + ((i + c.maxScore) % 3) * 0.05));
      const capped = Math.min(c.maxScore, v);
      scores[c.key] = capped;
      total += capped;
    });
    const percent = round1((total / outOf) * 100);
    const band = bands.find((b) => percent >= b.min) ?? bands[bands.length - 1];
    const first = Math.min(100, Math.max(30, Math.round(percent + ((i % 3) - 1) * 6)));
    return {
      subject: { id: `s${i}`, name, code: name.slice(0, 3).toUpperCase() },
      scores,
      total,
      outOf,
      percent,
      complete: true,
      grade: band?.grade ?? null,
      remark: band?.remark ?? null,
      position: (i * 7) % 12 + 1,
      classAverage: round1(percent - 8 + (i % 4) * 2),
      highest: Math.min(100, Math.round(percent + 10 + (i % 3) * 3)),
      lowest: Math.max(5, Math.round(percent - 35)),
      cumulative: { terms: [first, percent, null], average: round1((first + percent) / 2) },
    };
  });
  const totalScore = subjects.reduce((n, s) => n + s.total, 0);
  const average = round1(subjects.reduce((n, s) => n + s.percent, 0) / subjects.length);
  const rate = (traits: string[], seed: number) =>
    Object.fromEntries(traits.map((t, i) => [t, config.ratingScale[(i + seed) % Math.min(3, config.ratingScale.length)]?.value ?? null]));

  return {
    school: { name: school.name, motto: school.motto ?? 'Knowledge and character', address: school.address ?? '12 Allen Avenue, Ikeja, Lagos', logoUrl: school.logoUrl },
    student: { id: 'sample', name: 'Chiamaka Adebayo', admissionNumber: 'GIS/2023/014', gender: 'FEMALE' },
    classArm: { id: 'sample', name: 'A', levelName: 'JSS 2', classTeacher: 'Mrs. Folake Ojo' },
    term: { id: 'sample', name: 'Second Term', sessionName: '2025/2026', startsOn: '2026-01-06', endsOn: '2026-04-03' },
    components,
    gradingScale,
    subjects,
    summary: { subjectsTaken: subjects.length, totalScore, average, position: 4, classSize: 32, classAverage: round1(average - 7) },
    teacherRemark: 'Chiamaka is a hardworking and polite pupil. She should keep practising her Mathematics at home.',
    remarkSource: 'MANUAL',
    principalRemark: 'A good result. Keep it up.',
    attendance: { present: 54, absent: 3, late: 2, excused: 1, rate: 93.4, daysMarked: 60 },
    canEditTeacherRemark: false,
    canEditPrincipalRemark: false,
    status: 'DRAFT',
    publishedAt: null,
    template: config,
    traits: { affective: rate(config.affective.traits, 0), psychomotor: rate(config.psychomotor.traits, 1) },
    extra: { age: 12, nextTermBegins: '2026-04-27', feesOwed: 0, currency: 'NGN', termNames },
  };
}
