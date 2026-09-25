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
npm run db                                  # terminal 1: PostgreSQL on :5433
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
6. Attendance · 7. Finance · 8. HR · 9. Operations · 10. Communication
11. Live learning · 12. AI school · 13. School website · 14. SaaS billing
