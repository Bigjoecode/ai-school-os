import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PaystackStatus } from '@aischool/shared';
import { decryptSecret, encryptSecret } from '../common/crypto-box';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

export interface PaystackTransaction {
  status: 'success' | 'failed' | 'abandoned' | 'ongoing' | 'pending' | 'processing' | 'queued' | 'reversed';
  reference: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  /** Paystack's charge on this transaction, in kobo. */
  fees?: number | null;
  channel?: string;
  customer?: { email?: string };
  authorization?: { authorization_code?: string; reusable?: boolean; card_type?: string; last4?: string; brand?: string; exp_month?: string; exp_year?: string };
}

/**
 * Paystack, per school: each school connects its own Paystack account, so
 * fees go straight to the school. The secret key is stored encrypted and
 * only decrypted to call Paystack or check a webhook signature.
 */
@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);

  constructor(private readonly prisma: PrismaService) {}

  async status(tenantId: string, slug: string): Promise<PaystackStatus> {
    const i = await this.prisma.root.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'paystack' } } });
    return {
      connected: Boolean(i),
      publicKey: i?.publicKey ?? null,
      secretHint: i ? `••••${i.secretHint}` : null,
      isLive: i?.isLive ?? false,
      webhookPath: `/api/payments/paystack/webhook/${slug}`,
    };
  }

  async connected(tenantId: string): Promise<boolean> {
    return (await this.prisma.root.tenantIntegration.count({ where: { tenantId, provider: 'paystack' } })) > 0;
  }

  /** Saves the keys after checking them against Paystack. */
  async connect(tenantId: string, publicKey: string, secretKey: string) {
    if (publicKey.startsWith('pk_live_') !== secretKey.startsWith('sk_live_')) {
      throw new BadRequestException('Use a matching pair: both test keys or both live keys');
    }
    // A cheap authenticated call proves the secret key works before it is stored.
    await this.call(secretKey, 'GET', '/transaction?perPage=1');
    const data = {
      publicKey,
      secretEncrypted: encryptSecret(secretKey),
      secretHint: secretKey.slice(-4),
      isLive: secretKey.startsWith('sk_live_'),
    };
    await this.prisma.root.tenantIntegration.upsert({
      where: { tenantId_provider: { tenantId, provider: 'paystack' } },
      update: data,
      create: { tenantId, provider: 'paystack', ...data },
    });
  }

  async disconnect(tenantId: string) {
    await this.prisma.root.tenantIntegration.deleteMany({ where: { tenantId, provider: 'paystack' } });
  }

  private async secret(tenantId: string): Promise<string> {
    const i = await this.prisma.root.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'paystack' } } });
    if (!i) throw new BadRequestException('Online payments are not set up for this school');
    return decryptSecret(i.secretEncrypted);
  }

  newReference(): string {
    return `AIS-${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`.toUpperCase();
  }

  async initialize(
    tenantId: string,
    args: { email: string; amountKobo: number; reference: string; callbackUrl: string; currency: string; metadata: Record<string, unknown> },
  ): Promise<{ authorizationUrl: string; reference: string }> {
    const res = await this.call<{ authorization_url: string; reference: string }>(await this.secret(tenantId), 'POST', '/transaction/initialize', {
      email: args.email,
      amount: args.amountKobo,
      currency: args.currency,
      reference: args.reference,
      callback_url: args.callbackUrl,
      metadata: args.metadata,
    });
    return { authorizationUrl: res.authorization_url, reference: res.reference };
  }

  async verify(tenantId: string, reference: string): Promise<PaystackTransaction> {
    return this.call<PaystackTransaction>(await this.secret(tenantId), 'GET', `/transaction/verify/${encodeURIComponent(reference)}`);
  }

  /** Paystack signs webhook bodies with HMAC-SHA512 of the raw body, keyed by the secret key. */
  async validSignature(tenantId: string, rawBody: Buffer, signature: string | undefined): Promise<boolean> {
    if (!signature) return false;
    let secret: string;
    try {
      secret = await this.secret(tenantId);
    } catch {
      return false;
    }
    return PaystackService.signatureMatches(secret, rawBody, signature);
  }

  static signatureMatches(secret: string, rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** A raw Paystack call with a given secret key (the platform's own key for subscriptions). */
  async call<T>(secret: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${env().PAYSTACK_BASE_URL}${path}`, {
        method,
        headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      this.logger.error(`Paystack unreachable: ${(err as Error).message}`);
      throw new BadGatewayException("Couldn't reach Paystack. Please try again.");
    }
    const json = (await res.json().catch(() => null)) as PaystackEnvelope<T> | null;
    if (res.status === 401) throw new BadRequestException('Paystack rejected the secret key');
    if (!res.ok || !json?.status) {
      throw new BadGatewayException(`Paystack: ${json?.message ?? `HTTP ${res.status}`}`);
    }
    return json.data;
  }
}
