import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { LedgerAccount, RevenueDomain } from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface LedgerLine {
  account: LedgerAccount;
  debitKobo?: number;
  creditKobo?: number;
}

export const REVENUE_ACCOUNT: Record<RevenueDomain, LedgerAccount> = {
  SCHOOL: 'REVENUE_SCHOOL',
  STUDENT_AI: 'REVENUE_STUDENT_AI',
  EXAM: 'REVENUE_EXAM',
};

/**
 * The platform's double-entry ledger. Every money event (an invoice issued
 * to a school, a payment received, a parent's order, a fee, a refund) posts
 * balanced lines under one transaction id. Posting is idempotent per source
 * and event, so retried webhooks never double-count.
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async post(
    entry: { event: string; domain: RevenueDomain; sourceType: string; sourceId: string; tenantId?: string | null; userId?: string | null; memo: string; at?: Date },
    lines: LedgerLine[],
    tx?: Prisma.TransactionClient,
  ): Promise<string | null> {
    const rows = lines.filter((l) => (l.debitKobo ?? 0) > 0 || (l.creditKobo ?? 0) > 0);
    const debit = rows.reduce((t, l) => t + (l.debitKobo ?? 0), 0);
    const credit = rows.reduce((t, l) => t + (l.creditKobo ?? 0), 0);
    if (debit !== credit) throw new Error(`Unbalanced ledger posting for ${entry.sourceType} ${entry.sourceId}: ${debit} ≠ ${credit}`);
    if (!rows.length) return null;
    const client = tx ?? this.prisma.root;
    // One posting per source and event: the memo carries the event marker.
    const marker = `[${entry.event}]`;
    const exists = await client.ledgerEntry.findFirst({ where: { sourceType: entry.sourceType, sourceId: entry.sourceId, memo: { startsWith: marker } }, select: { id: true } });
    if (exists) return null;
    const txnId = randomUUID();
    await client.ledgerEntry.createMany({
      data: rows.map((l) => ({
        txnId,
        account: l.account,
        debitKobo: l.debitKobo ?? 0,
        creditKobo: l.creditKobo ?? 0,
        domain: entry.domain,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        tenantId: entry.tenantId ?? null,
        userId: entry.userId ?? null,
        memo: `${marker} ${entry.memo}`,
        ...(entry.at ? { createdAt: entry.at } : {}),
      })),
    });
    return txnId;
  }

  /** Never lets a ledger failure break a payment that already happened; it is logged loudly instead. */
  async safePost(...args: Parameters<LedgerService['post']>) {
    try {
      return await this.post(...args);
    } catch (err) {
      this.logger.error(`Ledger posting failed: ${(err as Error).message}`);
      return null;
    }
  }
}

@Global()
@Module({ providers: [LedgerService], exports: [LedgerService] })
export class LedgerModule {}
