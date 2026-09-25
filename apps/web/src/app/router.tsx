import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/components/layout/app-shell';
import { BootLoader } from '@/components/layout/boot-loader';
import { RedirectIfAuthed, RequireAuth, RequirePermission, RequireSuperAdmin } from './guards';
import { UPCOMING_MODULES } from './modules';

const LoginPage = lazy(() => import('@/features/auth/login-page'));
const OverviewPage = lazy(() => import('@/features/overview/overview-page'));
const AiPage = lazy(() => import('@/features/ai/ai-page'));
const StudentsPage = lazy(() => import('@/features/students/students-page'));
const ParentsPage = lazy(() => import('@/features/guardians/parents-page'));
const StaffPage = lazy(() => import('@/features/staff/staff-page'));
const AcademicsPage = lazy(() => import('@/features/academics/academics-page'));
const CurriculumPage = lazy(() => import('@/features/curriculum/curriculum-page'));
const CurriculumDetailPage = lazy(() => import('@/features/curriculum/curriculum-detail-page'));
const SchemesPage = lazy(() => import('@/features/schemes/schemes-page'));
const SchemeDetailPage = lazy(() => import('@/features/schemes/scheme-detail-page'));
const LessonsPage = lazy(() => import('@/features/lessons/lessons-page'));
const LessonDetailPage = lazy(() => import('@/features/lessons/lesson-detail-page'));
const QuestionsPage = lazy(() => import('@/features/questions/questions-page'));
const ExamsPage = lazy(() => import('@/features/exams/exams-page'));
const PaperDetailPage = lazy(() => import('@/features/exams/paper-detail-page'));
const ResultsPage = lazy(() => import('@/features/results/results-page'));
const ReportCardsPage = lazy(() => import('@/features/report-cards/report-cards-page'));
const ReportCardPage = lazy(() => import('@/features/report-cards/report-card-page'));
const TimetablePage = lazy(() => import('@/features/timetable/timetable-page'));
const TimetableSetupPage = lazy(() => import('@/features/timetable/setup/setup-page'));
const AttendancePage = lazy(() => import('@/features/attendance/attendance-page'));
const StudentAttendancePage = lazy(() => import('@/features/attendance/student-attendance-page'));
const KioskPage = lazy(() => import('@/features/attendance/kiosk-page'));
const CheckInPage = lazy(() => import('@/features/attendance/check-in-page'));
const SettingsLayout = lazy(() => import('@/features/settings/settings-layout'));
const SchoolProfilePage = lazy(() => import('@/features/settings/school-profile-page'));
const UsersPage = lazy(() => import('@/features/settings/users-page'));
const RolesPage = lazy(() => import('@/features/settings/roles-page'));
const AuditPage = lazy(() => import('@/features/settings/audit-page'));
const TenantsPage = lazy(() => import('@/features/platform/tenants-page'));
const ComingSoonPage = lazy(() => import('@/features/coming-soon/coming-soon-page'));
const NotFoundPage = lazy(() => import('@/features/not-found/not-found-page'));

const withSuspense = (node: ReactNode) => <Suspense fallback={<BootLoader label="Loading…" />}>{node}</Suspense>;

export const router = createBrowserRouter([
  {
    path: '/login',
    element: withSuspense(
      <RedirectIfAuthed>
        <LoginPage />
      </RedirectIfAuthed>,
    ),
  },
  // Full-screen pages without the app chrome (reception display, phone check-in).
  {
    path: '/attendance/kiosk',
    element: (
      <RequireAuth>
        {withSuspense(
          <RequirePermission permission="attendance.manage">
            <KioskPage />
          </RequirePermission>,
        )}
      </RequireAuth>
    ),
  },
  {
    path: '/check-in',
    element: <RequireAuth>{withSuspense(<CheckInPage />)}</RequireAuth>,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <OverviewPage /> },
      {
        path: 'ai',
        element: (
          <RequirePermission permission="ai.use">
            <AiPage />
          </RequirePermission>
        ),
      },
      {
        path: 'students',
        element: (
          <RequirePermission permission="students.read">
            <StudentsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'parents',
        element: (
          <RequirePermission permission="guardians.read">
            <ParentsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'staff',
        element: (
          <RequirePermission permission="staff.read">
            <StaffPage />
          </RequirePermission>
        ),
      },
      {
        path: 'academics',
        element: (
          <RequirePermission permission="academics.read">
            <AcademicsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'curriculum',
        element: (
          <RequirePermission permission="curriculum.read">
            <CurriculumPage />
          </RequirePermission>
        ),
      },
      {
        path: 'curriculum/:id',
        element: (
          <RequirePermission permission="curriculum.read">
            <CurriculumDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'schemes',
        element: (
          <RequirePermission permission="curriculum.read">
            <SchemesPage />
          </RequirePermission>
        ),
      },
      {
        path: 'schemes/:id',
        element: (
          <RequirePermission permission="curriculum.read">
            <SchemeDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'lessons',
        element: (
          <RequirePermission permission="lessons.read">
            <LessonsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'lessons/:id',
        element: (
          <RequirePermission permission="lessons.read">
            <LessonDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'questions',
        element: (
          <RequirePermission permission="assessment.read">
            <QuestionsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'exams',
        element: (
          <RequirePermission permission="assessment.read">
            <ExamsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'exams/:id',
        element: (
          <RequirePermission permission="assessment.read">
            <PaperDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'results',
        element: (
          <RequirePermission permission="results.read">
            <ResultsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'report-cards',
        element: (
          <RequirePermission permission="results.read">
            <ReportCardsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'report-cards/:studentId',
        element: (
          <RequirePermission permission="results.read">
            <ReportCardPage />
          </RequirePermission>
        ),
      },
      {
        path: 'timetable',
        element: (
          <RequirePermission permission="timetable.read">
            <TimetablePage />
          </RequirePermission>
        ),
      },
      {
        path: 'timetable/setup',
        element: (
          <RequirePermission permission="timetable.read">
            <TimetableSetupPage />
          </RequirePermission>
        ),
      },
      {
        path: 'attendance',
        element: (
          <RequirePermission permission="attendance.read">
            <AttendancePage />
          </RequirePermission>
        ),
      },
      {
        path: 'attendance/students/:id',
        element: (
          <RequirePermission permission="attendance.read">
            <StudentAttendancePage />
          </RequirePermission>
        ),
      },
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          {
            index: true,
            element: (
              <RequirePermission permission="school.read">
                <SchoolProfilePage />
              </RequirePermission>
            ),
          },
          {
            path: 'users',
            element: (
              <RequirePermission permission="users.read">
                <UsersPage />
              </RequirePermission>
            ),
          },
          {
            path: 'roles',
            element: (
              <RequirePermission permission="roles.manage">
                <RolesPage />
              </RequirePermission>
            ),
          },
          {
            path: 'audit',
            element: (
              <RequirePermission permission="audit.read">
                <AuditPage />
              </RequirePermission>
            ),
          },
        ],
      },
      {
        path: 'platform/tenants',
        element: (
          <RequireSuperAdmin>
            <TenantsPage />
          </RequireSuperAdmin>
        ),
      },
      ...Object.keys(UPCOMING_MODULES).map((path) => ({
        path: path.slice(1),
        element: <ComingSoonPage path={path} />,
      })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
