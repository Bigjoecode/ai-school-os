import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { RequestContextStore } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  action: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  /** Override the context (e.g. login, where the guard hasn't run). */
  tenantId?: string | null;
  actorUserId?: string | null;
}

/**
 * Append-only record of who did what. Called explicitly by services so each
 * entry carries a human-readable summary ("Admitted Ada Obi to JSS 1 A").
 * A failed write is logged, never allowed to break the request.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    const ctx = RequestContextStore.get();
    try {
      await this.prisma.root.auditLog.create({
        data: {
          tenantId: entry.tenantId !== undefined ? entry.tenantId : (ctx?.tenantId ?? null),
          actorUserId: entry.actorUserId !== undefined ? entry.actorUserId : (ctx?.userId ?? null),
          action: entry.action,
          summary: entry.summary,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadata: entry.metadata,
          ip: ctx?.ip,
          userAgent: ctx?.userAgent?.slice(0, 300),
        },
      });
    } catch (err) {
      this.logger.error(`Audit write failed for ${entry.action}: ${(err as Error).message}`);
    }
  }
}
