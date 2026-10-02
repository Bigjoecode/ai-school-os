# AI School OS

The intelligent operating system for modern schools: ERP, academic platform,
administration, parent/student portals and AI assistants in one multi-tenant
SaaS.

```
apps/
  web/        React 19 + Vite + Tailwind 4 — the product UI (SPA)
  api/        NestJS 11 + Prisma 7 + PostgreSQL — the modular monolith
packages/
  shared/     permissions, roles, zod schemas and API types used by both
infrastructure/
  deploy/     deploy helpers
scripts/
  dev-db.mjs  local PostgreSQL with no install (embedded-postgres)
```

## Run it locally

Requires Node 22+.

```bash
npm install
cp apps/api/.env.example apps/api/.env      # then set JWT_SECRET
npm run db                                  # terminal 1: PostgreSQL on :5433 (UTF-8)
npm run build -w @aischool/shared
npm run db:migrate                          # create tables
npm run db:seed                             # demo schools
npm run dev:api                             # terminal 2: API on :3000
npm run dev:web                             # terminal 3: app on :5173
```

Demo sign-ins (local seed):

| Who | Email | Password |
|---|---|---|
| School admin, Greenfield | `admin@greenfield.demo` | `Greenfield#2026` |
| Principal | `principal@greenfield.demo` | `Greenfield#2026` |
| Teacher | `teacher@greenfield.demo` | `Greenfield#2026` |
| Parent (children in two schools) | `parent@greenfield.demo` | `Greenfield#2026` |
| Sunrise Academy admin | `admin@sunrise.demo` | `Sunrise#2026` |
| Platform owner (local only) | `owner@aischool.os` | `AiSchoolOS#2026` |

## Architecture notes

**Multi-tenancy.** Every school is a `Tenant`; every school-owned row has a
`tenantId`. The API's tenant-scoped Prisma client
([tenant-scope.ts](apps/api/src/prisma/tenant-scope.ts)) adds the current
school to every query, so another school's record is a 404 even when its ID
is known. Schools can be reached by custom hostname (`TenantDomain`) or by
school ID at sign-in.

**Auth.** 15-minute JWT access tokens kept in memory by the web app, plus
rotating refresh tokens in an httpOnly cookie. Replaying a used refresh token
revokes the whole session.

**RBAC.** Permissions are strings (`students.manage`) from one catalog in
[packages/shared](packages/shared/src/permissions.ts). Roles are named sets of
them; each school gets editable copies of the built-in roles and can add its
own. Access is resolved on every request, so role changes apply immediately.
Platform staff (`SUPER_ADMIN`…) are a separate layer.

**Audit.** Every change writes a readable entry ("Admitted Ada Obi
(GIS/2026/0042) to JSS 1 A") to `audit_logs`.

**AI Gateway.** [apps/api/src/ai](apps/api/src/ai) routes each request by
tier (standard/advanced) across Anthropic, OpenAI and Gemini, falls through
to the next provider on outages, enforces each school's monthly budget, and
records tokens and cost per call. Assistants answer from the school's live
data, and what each role can see is limited (a parent can't open the School AI).

**Academic engine.** [apps/api/src/academic-engine](apps/api/src/academic-engine)
generates a year's curriculum (term by term, each term aware of the last), a
term's scheme of work laid out on the real term calendar, and lesson plans
with timed steps and support/core/stretch differentiation. The model must
answer in a fixed schema (structured outputs), every result is validated
before it is saved, and generation runs as a background job the page polls,
since it takes longer than shared hosting allows a request to stay open.

**Assessment.** [apps/api/src/assessment](apps/api/src/assessment) keeps one
results engine behind the score sheet, broadsheet, report cards and analysis,
so they always agree. Scores are graded on the percentage of what has been
assessed so far (mid-term, a 1st CA of 12.5/20 is 62.5%), with the school's
own components (default 1st CA 20 + 2nd CA 20 + Exam 60) and grading scale
(default WAEC A1–F9). Teachers enter marks only for subjects they teach.

**Timetable.** [apps/api/src/timetable/solver.ts](apps/api/src/timetable/solver.ts)
is a plain TypeScript constraint solver, not an LLM: it never double-books a
class, teacher or room, respects teacher availability, room kinds (labs, ICT)
and double periods, and keeps locked lessons; then it improves spread and
teacher balance. For Greenfield it places all 381 weekly lessons in a few
seconds, yielding to the event loop so the API stays responsive.
`node -r ts-node/register/transpile-only scripts/solver-check.ts` (in
`apps/api`) stress-tests it and independently verifies every hard constraint.

**Attendance.** Rates count only registers actually taken (a forgotten
register is flagged, never counted as absence); excused absences don't count
against a learner. Class teachers mark their own class within an edit window;
managers can correct any register. Staff check in by scanning a QR code that
rotates every 90 seconds on a reception screen; the code only works for
signed-in staff of that school.

**Finance.** Amounts are integers in kobo. Each school connects its own
Paystack account (keys encrypted at rest with `APP_ENCRYPTION_KEY`). A parent
pays through a signed link without an account; the payment is recorded as
pending first, then settled exactly once — by Paystack's signed webhook or the
parent's return, whichever comes first — after re-verifying the amount with
Paystack. A mismatched amount is never counted.

**HR & payroll.** Leave balances are working days per calendar year; approved
leave shows on the staff register as "on leave". Payroll is prepared once a
month, checked, approved by someone with `payroll.approve`, then marked paid,
which records the net salaries and the statutory remittances as expenses.
Payslips copy each person's pay when prepared, so a later salary change never
alters an approved month. PAYE follows the Nigeria Tax Act 2025 bands (from
January 2026, with rent relief); pension is 8% employee + 10% employer on
basic, housing and transport; NHF 2.5% of basic where it applies. The maths
is one function, `computePayslip` in
[packages/shared/src/hr.ts](packages/shared/src/hr.ts), shared by the API, the
seed and the live preview in the browser. Have the school's accountant confirm
the rates before the first live payroll.

**Operations.** Library loans check copies, limits and overdue books before
lending (two desks can't lend the last copy twice), and fines accrue daily
until a book comes back. Stores keep every receipt, issue and count as a
movement with the running balance; receiving stock can also record the
purchase under Expenses. Transport cross-checks riders against bus fees billed
this term, both ways. Early pick-ups are checked against the parents and
guardians on record. Certificates get a serial number and a public code; the
QR code on a certificate or ID card opens `/verify/...`, which shows only the
name, school and whether it is still valid. ID card codes are signed, and a
card stops verifying when the student leaves or the card's validity date
passes.

**Communication.** A broadcast resolves its audience once (parents are
de-duplicated, so a mother of two gets one message naming both children),
then becomes one delivery per person per channel. Deliveries are claimed with
a conditional update, retried up to three times, and keep the provider's
reference or error. SMS text is made GSM-safe ("₦" → "N", plain quotes) so a
message stays a single cheap page where possible. Scheduled sends and
automations run from an in-process timer and from `POST /api/cron/tick`; both
are idempotent.

**AI agents.** Assistants call tools rather than reading a pasted snapshot:
each tool runs inside the user's request, so the school-scoped database and
the user's own permissions apply — an assistant can never see more than the
person using it, and a parent's assistant only ever sees their own children.
Write tools only create drafts. The loop is provider-neutral (Anthropic and
OpenAI tool use; providers without it answer from data fetched up front), and
every model request is metered against the school's monthly AI budget.

**School website.** Public pages only ever read published content: draft
posts, staff-only and class events, unpublished albums and private files stay
inside. Uploads are checked by their bytes, not their name (JPG, PNG, WebP,
GIF, PDF and Office files only — no SVG or HTML) and are served with
`nosniff` and a sandboxing CSP. The results checker needs the admission number
and that term's code from the slip the school prints, shows only a published
report card, and gives the same answer for a wrong code or a wrong admission
number; each code has a limited number of uses. The website assistant is
rate-limited and answers only from the facts the site already publishes.

Local development without an AI key: set `AI_FAKE_PROVIDER=true` in
`apps/api/.env` to get schema-valid placeholder output (refused in production).

Deployment: see [DEPLOYMENT.md](DEPLOYMENT.md).

## Build phases

1. **Foundation** — monorepo, auth, multi-tenancy, RBAC, audit, design system ✅
2. **School core** — branches, sessions/terms, classes, subjects, students,
   parents, staff ✅ (admissions workflow next)
3. **Academic engine** — curriculum → scheme of work → lesson plan, each with an AI
   generator that returns validated, structured data ✅ (homework, materials next)
4. **Assessment** — question bank with AI question writer, exam paper builder,
   score entry, broadsheets, report cards with AI-drafted remarks, and class
   analysis with an AI briefing ✅ (online exams arrive with the student portal)
5. **Smart timetable** — bell schedule, rooms, teaching loads and teacher
   availability; a constraint solver builds a clash-free timetable; drag to
   edit with clash checks; AI explains the result and turns plain-English
   requests into constraints ✅
6. **Attendance** — daily class registers, staff check-in by rotating QR code
   at a reception kiosk, school/class/student reports, persistent-absence
   flags, attendance on report cards and the dashboard, AI briefings and
   drafted notes to parents ✅
7. **Finance** — fee schedules, bulk invoicing with sibling discounts,
   payments and receipts, online payment by Paystack through a parent link,
   expenses, income & expenditure, collection reports, AI briefings and fee
   reminders ✅
8. **HR & payroll** — departments, employee records, leave requests and
   approvals with balances, staff awards with AI-drafted citations, salary
   grades, monthly payroll with PAYE, pension and NHF, pre-approval checks, an
   AI payroll review, payslips, bank schedule export, and self-service "My HR"
   for every staff member ✅
9. **Operations** — library (catalogue, loans, fines, AI reading lists from
   the school's own books), inventory and assets (receipts, issues, counts,
   reorder alerts, AI reorder briefing), transport (vehicles, routes, riders,
   manifests, fee cross-checks, AI notices to parents), hostel (rooms, beds,
   exeats), reception (visitor book, admissions enquiries with AI replies,
   early pick-ups), certificates with AI drafts and public verification, and
   printable ID cards with QR codes ✅
10. **Communication** — messages to parents and staff by email, SMS
    (Termii), WhatsApp (Cloud API), browser push and in-app notifications,
    with audiences (classes, fee debtors, bus routes, boarders, departments),
    personalisation, SMS page and cost estimates, scheduling and per-recipient
    delivery reports; AI drafting and translation into Yoruba, Igbo, Hausa and
    Pidgin; noticeboard, school calendar with a phone calendar feed, event
    reminders and birthday messages ✅
11. **Live learning** — live classes on Google Meet, Zoom, BigBlueButton or
    any meeting link, scheduled one by one or for every timetabled lesson in
    a date range; join links per person; attendance from the meeting service
    or the portal; recordings and transcripts; the AI class pack (summary,
    key concepts, homework, a five-question quiz, revision notes) from the
    transcript, the teacher's notes or the lesson plan; homework set straight
    from it, the quiz saved to the question bank, and a "My learning" page for
    students and parents ✅
12. **AI school** — ten assistants (School, Principal, Academic, Teacher,
    Parent, Student, Finance, HR, Admissions, Communication) that look things
    up live with tools — students, classes, attendance, results, fees, staff,
    timetables, the calendar, operations — within each user's own
    permissions, and prepare drafts (messages, homework) that a person reviews
    before anything is sent; an explainable "students who need attention"
    list, the principal's AI weekly briefing, and AI usage and budget
    analytics ✅
13. **School website** — every school gets a public website at `/s/<school>`
    (or at the root of its own domain): Home, About, Academics, Admissions
    with online applications into Reception's enquiries, Teachers, News,
    Events from the school calendar, Gallery, Contact with an inbox, FAQ, a
    results checker with printed access codes, Downloads and fees; a builder
    with uploads and AI-written pages and posts; and an AI website assistant
    that answers visitors from the school's own published facts ✅
14. **SaaS superadmin** — the operator console: an overview with MRR,
    collections, usage and an AI briefing on at-risk schools; schools (detail,
    plan changes, suspension with a reason, "open school" for support);
    branches; plans that decide which modules each school gets; subscriptions
    billed per student with invoices, online and bank payments and an hourly
    billing cycle; student, AI and API usage; custom domains with DNS checks;
    a support desk with AI triage and draft replies; system health; feature
    flags with percentage rollouts and per-school overrides; and a
    platform-wide audit log. Schools get Billing and Help & support pages ✅
