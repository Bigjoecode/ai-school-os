import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/components/layout/app-shell';
import { BootLoader } from '@/components/layout/boot-loader';
import { RedirectIfAuthed, RequireAuth, RequirePermission, RequireSuperAdmin } from './guards';
import { UPCOMING_MODULES } from './modules';

const LoginPage = lazy(() => import('@/features/auth/login-page'));
const OverviewPage = lazy(() => import('@/features/overview/overview-page'));
const AiPage = lazy(() => import('@/features/ai/ai-page'));
const InsightsPage = lazy(() => import('@/features/ai/insights-page'));
const UsagePage = lazy(() => import('@/features/ai/usage-page'));
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
const FeesPage = lazy(() => import('@/features/finance/fees-page'));
const InvoicePage = lazy(() => import('@/features/finance/invoice-page'));
const ReceiptPage = lazy(() => import('@/features/finance/receipt-page'));
const PaymentsPage = lazy(() => import('@/features/finance/payments-page'));
const ExpensesPage = lazy(() => import('@/features/finance/expenses-page'));
const AccountingPage = lazy(() => import('@/features/finance/accounting-page'));
const PayPage = lazy(() => import('@/features/finance/pay-page'));
const PayDonePage = lazy(() => import('@/features/finance/pay-done-page'));
const HrOverviewPage = lazy(() => import('@/features/hr/hr-overview-page'));
const EmployeesPage = lazy(() => import('@/features/hr/employees-page'));
const EmployeePage = lazy(() => import('@/features/hr/employee-page'));
const LeavePage = lazy(() => import('@/features/hr/leave-page'));
const AwardsPage = lazy(() => import('@/features/hr/awards-page'));
const PayrollPage = lazy(() => import('@/features/hr/payroll-page'));
const PayrollRunPage = lazy(() => import('@/features/hr/payroll-run-page'));
const PayslipPage = lazy(() => import('@/features/hr/payslip-page'));
const MyHrPage = lazy(() => import('@/features/hr/my-hr-page'));
const LibraryPage = lazy(() => import('@/features/operations/library-page'));
const InventoryPage = lazy(() => import('@/features/operations/inventory-page'));
const TransportPage = lazy(() => import('@/features/operations/transport-page'));
const RoutePage = lazy(() => import('@/features/operations/route-page'));
const HostelPage = lazy(() => import('@/features/operations/hostel-page'));
const ReceptionPage = lazy(() => import('@/features/operations/reception-page'));
const CertificatesPage = lazy(() => import('@/features/operations/certificates-page'));
const CertificatePage = lazy(() => import('@/features/operations/certificate-page'));
const IdCardsPage = lazy(() => import('@/features/operations/id-cards-page'));
const VerifyPage = lazy(() => import('@/features/operations/verify-page'));
const LivePage = lazy(() => import('@/features/live/live-page'));
const LiveClassPage = lazy(() => import('@/features/live/class-page'));
const LiveSettingsPage = lazy(() => import('@/features/live/settings-page'));
const HomeworkPage = lazy(() => import('@/features/live/homework-page'));
const LearningPage = lazy(() => import('@/features/live/learning-page'));
const MessagesPage = lazy(() => import('@/features/comms/messages-page'));
const ComposePage = lazy(() => import('@/features/comms/compose-page'));
const BroadcastPage = lazy(() => import('@/features/comms/broadcast-page'));
const CommsSettingsPage = lazy(() => import('@/features/comms/settings-page'));
const NoticeboardPage = lazy(() => import('@/features/comms/noticeboard-page'));
const CalendarPage = lazy(() => import('@/features/comms/calendar-page'));
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
  // Public parent payment pages: no sign-in, no app chrome.
  { path: '/pay/:token', element: withSuspense(<PayPage />) },
  { path: '/pay/:token/done', element: withSuspense(<PayDonePage />) },
  // Public QR verification for certificates and ID cards: no sign-in, no app chrome.
  { path: '/verify/certificate/:code', element: withSuspense(<VerifyPage kind="certificate" />) },
  { path: '/verify/id/:code', element: withSuspense(<VerifyPage kind="id" />) },
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
        path: 'ai/insights',
        element: (
          <RequirePermission permission="students.read">
            <RequirePermission permission="attendance.read">
              <InsightsPage />
            </RequirePermission>
          </RequirePermission>
        ),
      },
      {
        path: 'ai/usage',
        element: (
          <RequirePermission permission="ai.admin">
            <UsagePage />
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
      ...(
        [
          ['fees', <FeesPage key="fees" />],
          ['fees/invoices/:id', <InvoicePage key="invoice" />],
          ['fees/receipts/:id', <ReceiptPage key="receipt" />],
          ['payments', <PaymentsPage key="payments" />],
          ['expenses', <ExpensesPage key="expenses" />],
          ['accounting', <AccountingPage key="accounting" />],
        ] as const
      ).map(([path, page]) => ({
        path,
        element: <RequirePermission permission="finance.read">{page}</RequirePermission>,
      })),
      ...(
        [
          ['hr', <HrOverviewPage key="hr" />],
          ['hr/employees', <EmployeesPage key="employees" />],
          ['hr/leave', <LeavePage key="leave" />],
          ['hr/awards', <AwardsPage key="awards" />],
        ] as const
      ).map(([path, page]) => ({
        path,
        element: <RequirePermission permission="hr.read">{page}</RequirePermission>,
      })),
      // Payroll staff open an employee's record to set their pay, without needing hr.read.
      {
        path: 'hr/employees/:id',
        element: <RequirePermission permission={['hr.read', 'payroll.read']}><EmployeePage key="employee" /></RequirePermission>,
      },
      ...(
        [
          ['payroll', <PayrollPage key="payroll" />],
          ['payroll/runs/:id', <PayrollRunPage key="payroll-run" />],
          ['payroll/payslips/:id', <PayslipPage key="payslip" />],
        ] as const
      ).map(([path, page]) => ({
        path,
        element: <RequirePermission permission="payroll.read">{page}</RequirePermission>,
      })),
      {
        path: 'me/hr',
        element: (
          <RequirePermission permission="hr.self">
            <MyHrPage />
          </RequirePermission>
        ),
      },
      {
        path: 'me/payslips/:id',
        element: (
          <RequirePermission permission="hr.self">
            <PayslipPage self />
          </RequirePermission>
        ),
      },
      ...(
        [
          ['library', 'library.read', <LibraryPage key="library" />],
          ['inventory', 'inventory.read', <InventoryPage key="inventory" />],
          ['transport', 'transport.read', <TransportPage key="transport" />],
          ['transport/routes/:id', 'transport.read', <RoutePage key="route" />],
          ['hostel', 'hostel.read', <HostelPage key="hostel" />],
          ['reception', 'reception.read', <ReceptionPage key="reception" />],
          ['certificates', 'documents.issue', <CertificatesPage key="certificates" />],
          ['certificates/:id', 'documents.issue', <CertificatePage key="certificate" />],
          ['id-cards', 'documents.issue', <IdCardsPage key="id-cards" />],
        ] as const
      ).map(([path, permission, page]) => ({
        path,
        element: <RequirePermission permission={permission}>{page}</RequirePermission>,
      })),
      ...(
        [
          ['messages', 'comms.read', <MessagesPage key="messages" />],
          ['messages/new', 'comms.send', <ComposePage key="compose" />],
          ['messages/settings', 'comms.read', <CommsSettingsPage key="comms-settings" />],
          ['messages/:id', 'comms.read', <BroadcastPage key="broadcast" />],
          ['messages/:id/edit', 'comms.send', <ComposePage key="compose-edit" />],
        ] as const
      ).map(([path, permission, page]) => ({
        path,
        element: <RequirePermission permission={permission}>{page}</RequirePermission>,
      })),
      ...(
        [
          ['live', 'live.read', <LivePage key="live" />],
          ['live/settings', 'live.read', <LiveSettingsPage key="live-settings" />],
          ['live/:id', 'live.read', <LiveClassPage key="live-class" />],
          ['homework', 'homework.manage', <HomeworkPage key="homework" />],
        ] as const
      ).map(([path, permission, page]) => ({
        path,
        element: <RequirePermission permission={permission}>{page}</RequirePermission>,
      })),
      // Everyone in the school: staff, parents and students.
      { path: 'learning', element: <LearningPage /> },
      { path: 'noticeboard', element: <NoticeboardPage /> },
      { path: 'calendar', element: <CalendarPage /> },
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
