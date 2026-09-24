import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { env } from '../config/env';
import { currentContext, currentTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { costUsd } from './pricing';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { ProviderUnavailableError, type AiProvider, type AiRequest, type AiResult } from './providers/provider';

export interface GatewayResult extends AiResult {
  provider: string;
}

/**
 * The single door to every model. It
 *  - routes by tier (standard/advanced) across providers in AI_PROVIDER_ORDER,
 *    falling through to the next provider on outages and rate limits,
 *  - enforces each school's monthly AI budget before calling out,
 *  - writes one AiUsage row per call (tokens, cost, latency, success).
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  private readonly providers: AiProvider[];

  constructor(private readonly prisma: PrismaService) {
    const all: AiProvider[] = [new AnthropicProvider(), new OpenAiProvider(), new GeminiProvider()];
    const order = env()
      .AI_PROVIDER_ORDER.split(',')
      .map((s) => s.trim());
    this.providers = [...all].sort((a, b) => rank(order, a.name) - rank(order, b.name));
  }

  configuredProviders(): string[] {
    return this.providers.filter((p) => p.isConfigured()).map((p) => p.name);
  }

  async monthSpendUsd(): Promise<number> {
    const now = new Date();
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const agg = await this.prisma.db.aiUsage.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { costUsd: true },
    });
    return Number(agg._sum.costUsd ?? 0);
  }

  async monthBudgetUsd(): Promise<number | null> {
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({
      where: { id: currentTenantId() },
      select: { aiMonthlyBudgetUsd: true },
    });
    const budget = tenant.aiMonthlyBudgetUsd !== null ? Number(tenant.aiMonthlyBudgetUsd) : env().AI_DEFAULT_MONTHLY_BUDGET_USD;
    return budget > 0 ? budget : null;
  }

  async generate(req: AiRequest, agent: string): Promise<GatewayResult> {
    const candidates = this.providers.filter((p) => p.isConfigured());
    if (!candidates.length) {
      throw new ServiceUnavailableException("AI isn't connected yet — add an AI provider API key to the server");
    }

    const budget = await this.monthBudgetUsd();
    if (budget !== null && (await this.monthSpendUsd()) >= budget) {
      throw new HttpException(
        { statusCode: 429, message: "Your school has used this month's AI allowance. It resets on the 1st." },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let lastError: unknown;
    for (const provider of candidates) {
      const started = Date.now();
      try {
        const result = await provider.generate(req);
        await this.record(agent, provider.name, result, Date.now() - started);
        return { ...result, provider: provider.name };
      } catch (err) {
        lastError = err;
        await this.recordFailure(agent, provider.name, provider.modelFor(req.tier), err, Date.now() - started);
        if (err instanceof ProviderUnavailableError) {
          this.logger.warn(`${err.message}; trying the next provider`);
          continue;
        }
        this.logger.error(`${provider.name} request failed: ${(err as Error).message}`);
        throw new ServiceUnavailableException('The AI service could not complete that request. Please try again.');
      }
    }
    this.logger.error(`All AI providers failed: ${(lastError as Error)?.message}`);
    throw new ServiceUnavailableException('The AI service is busy right now. Please try again in a moment.');
  }

  private async record(agent: string, provider: string, r: AiResult, latencyMs: number) {
    const { cost, known } = costUsd(r.model, r.inputTokens, r.outputTokens);
    if (!known) this.logger.warn(`No price for model ${r.model}; set AI_PRICES so budgets count it`);
    await this.prisma.db.aiUsage.create({
      data: {
        tenantId: currentTenantId(),
        userId: currentContext().userId,
        agent,
        provider,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costUsd: cost,
        latencyMs,
      },
    });
  }

  private async recordFailure(agent: string, provider: string, model: string, err: unknown, latencyMs: number) {
    await this.prisma.db.aiUsage
      .create({
        data: {
          tenantId: currentTenantId(),
          userId: currentContext().userId,
          agent,
          provider,
          model,
          latencyMs,
          success: false,
          error: (err as Error)?.message?.slice(0, 500),
        },
      })
      .catch(() => undefined);
  }
}

function rank(order: string[], name: string) {
  const i = order.indexOf(name);
  return i === -1 ? order.length : i;
}
