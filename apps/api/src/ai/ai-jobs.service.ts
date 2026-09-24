import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { AiJobView } from '@aischool/shared';
import { Prisma, type AiJob } from '../generated/prisma/client';
import { currentContext, currentTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { GenerationQueue } from './generation-queue';

/**
 * Tracks AI work that produces many records at once — a batch of questions,
 * a class's report-card remarks. The request creates the job and returns it;
 * the work runs on the generation queue; the page polls GET /ai/jobs/:id.
 */
@Injectable()
export class AiJobsService implements OnModuleInit {
  private readonly logger = new Logger(AiJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: GenerationQueue,
  ) {}

  /** Jobs don't survive a restart: mark any left mid-flight as failed. */
  async onModuleInit() {
    const { count } = await this.prisma.root.aiJob.updateMany({
      where: { state: { in: ['QUEUED', 'RUNNING'] } },
      data: { state: 'FAILED', error: 'Interrupted by a server restart. Please try again.', finishedAt: new Date() },
    });
    if (count) this.logger.warn(`Marked ${count} interrupted AI job(s) as failed`);
  }

  /** Creates the job and queues `work`; its return value becomes the job's result. */
  async start(
    kind: string,
    params: Prisma.InputJsonValue,
    work: (job: AiJob) => Promise<Record<string, unknown>>,
  ): Promise<AiJobView> {
    const job = await this.prisma.db.aiJob.create({
      data: { tenantId: currentTenantId(), kind, params, createdById: currentContext().userId },
    });
    this.queue.enqueue(`${kind} job ${job.id}`, async () => {
      await this.prisma.db.aiJob.update({ where: { id: job.id }, data: { state: 'RUNNING' } });
      try {
        const result = await work(job);
        await this.prisma.db.aiJob.update({
          where: { id: job.id },
          data: { state: 'DONE', result: result as Prisma.InputJsonValue, finishedAt: new Date() },
        });
      } catch (err) {
        const message = (err as { response?: { message?: string } }).response?.message ?? (err as Error).message;
        await this.prisma.db.aiJob
          .update({
            where: { id: job.id },
            data: { state: 'FAILED', error: String(message).slice(0, 500), finishedAt: new Date() },
          })
          .catch(() => undefined);
        throw err;
      }
    });
    return view(job);
  }

  async get(id: string): Promise<AiJobView> {
    return view(await this.prisma.db.aiJob.findUniqueOrThrow({ where: { id } }));
  }
}

function view(job: AiJob): AiJobView {
  return {
    id: job.id,
    kind: job.kind,
    state: job.state === 'NONE' ? 'QUEUED' : job.state,
    error: job.error,
    result: (job.result as Record<string, unknown> | null) ?? null,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}
