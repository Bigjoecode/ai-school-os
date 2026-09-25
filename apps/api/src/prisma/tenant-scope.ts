import { Prisma } from '../generated/prisma/client';
import { currentTenantId } from '../common/request-context';

/**
 * Models whose rows belong to exactly one school. Every query on these gets
 * the current request's tenantId added to its filter (reads, updates,
 * deletes) or data (creates), so cross-school access can't happen by
 * forgetting a `where`.
 *
 * Convention this relies on: tenant-model writes use scalar foreign keys
 * (`classArmId: x`), not relation `connect` objects, which Prisma won't mix
 * with the injected scalar `tenantId`. Nested creates on tenant models are
 * not scoped here; they fail on the NOT NULL tenantId instead, which is safe.
 */
export const TENANT_MODELS = new Set<string>([
  'Membership',
  'Role',
  'FileObject',
  'Notification',
  'Branch',
  'AcademicSession',
  'Term',
  'ClassLevel',
  'ClassArm',
  'Subject',
  'ClassSubject',
  'Student',
  'Guardian',
  'StudentGuardian',
  'Staff',
  'AiUsage',
  'AiConversation',
  'AiMessage',
  'Curriculum',
  'CurriculumUnit',
  'SchemeOfWork',
  'SchemeWeek',
  'LessonPlan',
  'AiJob',
  'Question',
  'ExamPaper',
  'ExamPaperItem',
  'Score',
  'ReportCard',
  'Room',
  'StaffUnavailability',
  'Timetable',
  'TimetableEntry',
]);

const WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

type AnyArgs = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
};

export const tenantScope = Prisma.defineExtension({
  name: 'tenant-scope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || !TENANT_MODELS.has(model)) return query(args);

        const tenantId = currentTenantId();
        const a = (args ?? {}) as AnyArgs;

        if (WHERE_OPS.has(operation)) {
          a.where = { ...(a.where ?? {}), tenantId };
        } else if (operation === 'create') {
          a.data = { ...(a.data as object), tenantId };
        } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
          const rows = Array.isArray(a.data) ? a.data : [a.data];
          a.data = rows.map((row) => ({ ...(row as object), tenantId }));
        } else if (operation === 'upsert') {
          a.where = { ...(a.where ?? {}), tenantId };
          a.create = { ...(a.create ?? {}), tenantId };
        }
        return query(a as typeof args);
      },
    },
  },
});
