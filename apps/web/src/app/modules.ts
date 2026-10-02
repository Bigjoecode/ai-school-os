/** Roadmap copy for modules that aren't live yet. Keyed by route path. */
export interface UpcomingModule {
  name: string;
  phase: number;
  summary: string;
  features: string[];
}

export const UPCOMING_MODULES: Record<string, UpcomingModule> = {
  '/admissions': {
    name: 'Admissions',
    phase: 2,
    summary: 'A modern admissions funnel from first enquiry to first day.',
    features: [
      'Online application forms with document uploads',
      'Pipeline board: enquiry → assessment → offer → enrolled',
      'Entrance test scheduling and scoring',
      'Admissions AI drafts offer letters and follow-ups for every applicant',
    ],
  },
  '/materials': {
    name: 'Study Materials',
    phase: 3,
    summary: 'A tidy library of notes, slides and videos per class.',
    features: [
      'Organised by class, subject and topic',
      'Share with students and parents securely',
      'Usage analytics per resource',
      'Student AI answers questions grounded in your materials',
    ],
  },
  '/online-exams': {
    name: 'Online Exams',
    phase: 4,
    summary: 'Secure computer-based tests with instant marking.',
    features: [
      'Timed CBT with randomised questions',
      'Auto-marking for objective questions',
      'Proctoring signals and attempt logs',
      'AI marks essay answers against a rubric for teacher review',
    ],
  },
};
