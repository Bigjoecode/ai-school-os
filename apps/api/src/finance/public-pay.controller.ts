import { BadRequestException, Body, Controller, Get, HttpCode, Logger, NotFoundException, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  startOnlinePaymentSchema,
  verifyOnlinePaymentSchema,
  type OnlinePaymentResult,
  type OnlinePaymentStart,
  type PublicInvoice,
} from '@aischool/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { Public } from '../common/decorators';
import { dateOnly } from '../common/format';
import { RequestContextStore } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { siteOrigin } from './finance.controller';
import { FinanceService } from './finance.service';
import { PaystackService } from './paystack.service';

interface PayToken {
  typ: 'pay';
  tid: string;
  inv: string;
}

/**
 * The parent-facing side of fees, with no sign-in: a signed link opens one
 * invoice, lets the parent pay any amount up to the balance through Paystack,
 * and confirms the payment on return. Paystack's webhook confirms it too;
 * whichever arrives first settles it, exactly once.
 */
@Controller()
export class PublicPayController {
  private readonly logger = new Logger(PublicPayController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly finance: FinanceService,
    private readonly paystack: PaystackService,
    private readonly audit: AuditService,
  ) {}

  /** Verifies a payment link and scopes this request to its school. */
  private async open(token: string): Promise<PayToken> {
    let payload: PayToken;
    try {
      payload = await this.jwt.verifyAsync<PayToken>(token);
    } catch {
      throw new UnauthorizedException('This payment link has expired. Ask the school for a new one.');
    }
    if (payload.typ !== 'pay' || !payload.tid || !payload.inv) throw new UnauthorizedException('This payment link is not valid');
    const ctx = RequestContextStore.get()!;
    ctx.tenantId = payload.tid;
    return payload;
  }

  @Public()
  @Get('pay/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async invoice(@Param('token') token: string): Promise<PublicInvoice> {
    const { tid, inv } = await this.open(token);
    const [invoice, tenant, online] = await Promise.all([
      this.prisma.db.invoice.findUnique({
        where: { id: inv },
        include: {
          term: true,
          lines: { orderBy: { id: 'asc' } },
          student: {
            include: {
              classArm: { include: { classLevel: true } },
              guardians: { orderBy: { isPrimary: 'desc' }, include: { guardian: true } },
            },
          },
        },
      }),
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tid }, select: { name: true, logoUrl: true, currency: true } }),
      this.paystack.connected(tid),
    ]);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return {
      school: { name: tenant.name, logoUrl: tenant.logoUrl },
      currency: tenant.currency,
      invoice: {
        number: invoice.number,
        term: invoice.term.name,
        totalKobo: invoice.totalKobo,
        paidKobo: invoice.paidKobo,
        balanceKobo: Math.max(0, invoice.totalKobo - invoice.paidKobo),
        dueDate: dateOnly(invoice.dueDate)!,
        status: invoice.status,
      },
      // First name only: the link may be forwarded around a family.
      student: {
        firstName: invoice.student.firstName,
        classArm: invoice.student.classArm ? `${invoice.student.classArm.classLevel.name} ${invoice.student.classArm.name}` : null,
      },
      lines: invoice.lines.map((l) => ({ description: l.description, amountKobo: l.amountKobo })),
      onlinePaymentsEnabled: online,
      guardianEmail: invoice.student.guardians.find((g) => g.guardian.email)?.guardian.email ?? null,
    };
  }

  @Public()
  @Post('pay/start')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async start(@Body(new ZodPipe(startOnlinePaymentSchema)) body: z.infer<typeof startOnlinePaymentSchema>, @Req() req: Request): Promise<OnlinePaymentStart> {
    const { tid, inv } = await this.open(body.token);
    const invoice = await this.prisma.db.invoice.findUniqueOrThrow({ where: { id: inv } });
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tid }, select: { currency: true } });
    const balance = invoice.totalKobo - invoice.paidKobo;
    if (invoice.status === 'CANCELLED') throw new BadRequestException('This invoice was cancelled');
    if (balance <= 0) throw new BadRequestException('This invoice is already paid in full');
    if (body.amountKobo > balance) {
      throw new BadRequestException({ statusCode: 400, message: 'That is more than the balance', errors: [{ path: 'amountKobo', message: 'More than the balance' }] });
    }

    const reference = this.paystack.newReference();
    // Record the attempt first so the webhook can always match it.
    await this.prisma.db.payment.create({
      data: {
        tenantId: tid,
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        amountKobo: body.amountKobo,
        method: 'PAYSTACK',
        status: 'PENDING',
        reference,
        payerName: body.payerName,
        payerEmail: body.email,
      },
    });
    const { authorizationUrl } = await this.paystack.initialize(tid, {
      email: body.email,
      amountKobo: body.amountKobo,
      reference,
      currency: tenant.currency,
      callbackUrl: `${siteOrigin(req)}/pay/${encodeURIComponent(body.token)}/done`,
      metadata: { invoiceNumber: invoice.number, tenantId: tid },
    });
    return { authorizationUrl, reference };
  }

  /** Called when the parent returns from Paystack. */
  @Public()
  @Get('pay/:token/verify')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async verify(@Param('token') token: string, @Query(new ZodPipe(verifyOnlinePaymentSchema)) q: { reference: string }): Promise<OnlinePaymentResult> {
    const { tid, inv } = await this.open(token);
    const pending = await this.prisma.db.payment.findFirst({ where: { reference: q.reference, method: 'PAYSTACK', invoiceId: inv } });
    if (!pending) throw new NotFoundException('We could not find that payment');
    if (pending.status === 'PENDING') await this.confirm(tid, q.reference, 'callback');

    const [payment, invoice] = await Promise.all([
      this.prisma.db.payment.findUniqueOrThrow({ where: { id: pending.id } }),
      this.prisma.db.invoice.findUniqueOrThrow({ where: { id: inv } }),
    ]);
    const balance = Math.max(0, invoice.totalKobo - invoice.paidKobo);
    const status = payment.status === 'SUCCESS' ? 'SUCCESS' : payment.status === 'PENDING' ? 'PENDING' : 'FAILED';
    return {
      status,
      amountKobo: payment.amountKobo,
      receiptNumber: payment.receiptNumber,
      receiptPath: null,
      balanceKobo: balance,
      message:
        status === 'SUCCESS'
          ? balance > 0
            ? 'Payment received. Thank you — a balance remains on this invoice.'
            : 'Payment received. This invoice is now fully paid. Thank you!'
          : status === 'PENDING'
            ? 'Your bank has not confirmed the payment yet. This page will update, or the school will confirm it shortly.'
            : 'The payment did not go through. You have not been charged; please try again.',
    };
  }

  /**
   * Paystack → school. The body is trusted only after its HMAC signature
   * checks out against that school's secret key, and the transaction is then
   * re-verified with Paystack before anything is settled.
   */
  @Public()
  @Post('payments/paystack/webhook/:slug')
  @HttpCode(200)
  async webhook(@Param('slug') slug: string, @Req() req: Request & { rawBody?: Buffer }) {
    const tenant = await this.prisma.root.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant || !req.rawBody) return { ok: true };
    const signature = req.headers['x-paystack-signature'] as string | undefined;
    if (!(await this.paystack.validSignature(tenant.id, req.rawBody, signature))) {
      this.logger.warn(`Rejected a Paystack webhook with a bad signature for ${slug}`);
      throw new UnauthorizedException('Bad signature');
    }
    const event = req.body as { event?: string; data?: { reference?: string } };
    if (event.event === 'charge.success' && event.data?.reference) {
      RequestContextStore.get()!.tenantId = tenant.id;
      await this.confirm(tenant.id, event.data.reference, 'webhook');
    }
    return { ok: true };
  }

  private async confirm(tenantId: string, reference: string, via: 'webhook' | 'callback') {
    const tx = await this.paystack.verify(tenantId, reference);
    if (tx.status !== 'success') {
      if (tx.status === 'failed' || tx.status === 'abandoned' || tx.status === 'reversed') {
        await this.prisma.root.payment.updateMany({ where: { tenantId, reference, method: 'PAYSTACK', status: 'PENDING' }, data: { status: 'FAILED' } });
      }
      return;
    }
    const result = await this.finance.settleOnline(tenantId, reference, {
      amountKobo: tx.amount,
      paidAt: tx.paid_at ? new Date(tx.paid_at) : new Date(),
      email: tx.customer?.email,
    });
    if (result.settled && result.payment) {
      await this.audit.log({
        action: 'finance.online_payment',
        entityType: 'Payment',
        entityId: result.payment.id,
        tenantId,
        actorUserId: null,
        summary: `Online payment of ${tx.amount / 100} received via Paystack (${via}) — receipt ${result.payment.receiptNumber}`,
      });
    } else if (result.reason === 'amount mismatch') {
      this.logger.error(`Paystack amount mismatch for ${reference}`);
    }
  }
}
