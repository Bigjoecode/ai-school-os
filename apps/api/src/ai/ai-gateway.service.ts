import { HttpException, HttpStatus, Injectable, Logger, OnApplicationShutdown, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import type { AiSettings } from '@aischool/shared';
import { AlertService } from '../alerts/alerts.service';
import { aiSettings, mergeAiSettings, setAiSettings } from './ai-settings';
import { env } from '../config/env';
import { RequestContextStore, currentContext, currentTenantId } from '../common/request-context';
import { FeatureService } from '../features/features.service';
import { PrismaService } from '../prisma/prisma.service';
import { costUsd } from './pricing';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import type { ZodType } from 'zod';
import { FakeProvider } from './providers/fake.provider';
import { OpenAiProvider } from './providers/openai.provider';
import {
  ProviderOutputError,
  ProviderUnavailableError,
  type AiProvider,
  type AiRequest,
  type AiResult,
  type AiToolSpec,
  type ToolRunner,
} from './providers/provider';

export interface GatewayResult extends AiResult {
  provider: string;
}

/**
 * The single door to every model. It
 *  - routes by tier (standard/advanced) across providers in AI_PROVIDER_ORDER,
 *    falling through to the next provider on outages and rate limits,
 *  - checks the school's plan includes AI and enforces its monthly AI
 *    budget before calling out (console calls have no school and no budget),
 *  - writes one AiUsage row per call (tokens, cache, cost, latency, success).
 * Which models each tier uses, the provider order and prices come from
 * Platform → AI models (refreshed every 30 seconds), over the environment.
 */
@Injectable()
export class AiGatewayService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AiGatewayService.name);
  private readonly all: AiProvider[] = [new AnthropicProvider(), new OpenAiProvider(), new GeminiProvider()];
  private readonly fake = env().AI_FAKE_PROVIDER ? new FakeProvider() : null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly features: FeatureService,
    private readonly alerts: AlertService,
  ) {}

  async onModuleInit() {
    await this.reloadSettings();
    if (env().NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.reloadSettings(), 30_000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Reads Platform → AI models into memory; keeps the last good settings if the read fails. */
  async reloadSettings(): Promise<AiSettings> {
    try {
      const row = await this.prisma.root.platformSetting.findUnique({ where: { key: 'ai' } });
      setAiSettings(mergeAiSettings(row?.value));
    } catch (err) {
      this.logger.warn(`AI settings not refreshed: ${(err as Error).message}`);
    }
    return aiSettings();
  }

  /** Providers in the configured order; the development placeholder goes first so it never spends real credit. */
  private get providers(): AiProvider[] {
    const order = aiSettings().order;
    const sorted = [...this.all].sort((a, b) => rank(order, a.name) - rank(order, b.name));
    return this.fake ? [this.fake, ...sorted] : sorted;
  }

  /** One provider directly (the console's "Test" button), bypassing the order and fallbacks. */
  provider(name: string): AiProvider | undefined {
    return this.all.find((p) => p.name === name);
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

  generate(req: AiRequest, agent: string): Promise<GatewayResult> {
    return this.run(req, agent, (p) => p.generate(req));
  }

  /**
   * Structured output: the result is validated against `schema` whichever
   * provider produced it, so callers can save it without further checks.
   */
  generateJson<T>(req: AiRequest, schema: ZodType<T>, agent: string): Promise<GatewayResult & { data: T }> {
    return this.run(req, agent, async (p) => {
      const result = await p.generateJson(req, schema);
      const checked = schema.safeParse(result.data);
      if (!checked.success) {
        throw new ProviderOutputError(`The AI returned content in an unexpected shape (${checked.error.issues[0]?.message})`);
      }
      return { ...result, data: checked.data };
    });
  }

  /**
   * Lets the model call tools (live lookups) before answering. Providers
   * without tool use get `fallbackSystem` instead: the same question
   * answered from data fetched up front.
   */
  generateWithTools(
    req: AiRequest,
    tools: AiToolSpec[],
    run: ToolRunner,
    agent: string,
    opts: { maxSteps?: number; fallbackSystem: () => Promise<string> },
  ): Promise<GatewayResult & { steps: number }> {
    return this.run(req, agent, async (p) => {
      if (p.generateWithTools && tools.length) return p.generateWithTools(req, tools, run, opts.maxSteps ?? 8);
      const r = await p.generate({ ...req, system: await opts.fallbackSystem() });
      return { ...r, steps: 1 };
    });
  }

  private async run<R extends AiResult>(
    req: AiRequest,
    agent: string,
    call: (provider: AiProvider) => Promise<R>,
  ): Promise<R & { provider: string }> {
    const candidates = this.providers.filter((p) => p.isConfigured());
    if (!candidates.length) {
      throw new ServiceUnavailableException("AI isn't connected yet — add an AI provider API key to the server");
    }

    const tenantId = RequestContextStore.get()?.tenantId ?? null;
    if (tenantId) await this.features.assert(tenantId, 'ai');
    const budget = tenantId ? await this.monthBudgetUsd() : null;
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
        const result = await call(provider);
        await this.record(agent, provider.name, result, Date.now() - started);
        return { ...result, provider: provider.name };
      } catch (err) {
        lastError = err;
        await this.recordFailure(agent, provider.name, provider.modelFor(req.tier), err, Date.now() - started);
        if (err instanceof ProviderUnavailableError) {
          this.logger.warn(`${err.message}; trying the next provider`);
          this.alerts.raise('ai', `unavailable:${provider.name}`, `${provider.name} AI requests are failing`, `${err.message}\n\nRequests fell back to the next provider in Platform → AI models. Check the API key, credit and model names.`);
          continue;
        }
        if (err instanceof ProviderOutputError) {
          throw new ServiceUnavailableException(`${err.message}. Please try again.`);
        }
        this.logger.error(`${provider.name} request failed: ${(err as Error).message}`);
        throw new ServiceUnavailableException('The AI service could not complete that request. Please try again.');
      }
    }
    this.logger.error(`All AI providers failed: ${(lastError as Error)?.message}`);
    throw new ServiceUnavailableException('The AI service is busy right now. Please try again in a moment.');
  }

  private async record(agent: string, provider: string, r: AiResult, latencyMs: number) {
    const { cost, known } = costUsd(r.model, r.inputTokens, r.outputTokens, { read: r.cacheReadTokens, write: r.cacheWriteTokens });
    if (!known && provider !== 'fake') {
      this.logger.warn(`No price for model ${r.model}; add it in Platform → AI models so budgets count it`);
      this.alerts.raise('ai', `unpriced:${r.model}`, `No price set for ${r.model}`, `AI calls to ${r.model} are recorded at $0, so school budgets and unit economics can't see their cost. Add its price in Platform → AI models.`);
    }
    await this.prisma.root.aiUsage.create({
      data: {
        tenantId: RequestContextStore.get()?.tenantId ?? null,
        userId: currentContext().userId,
        studentId: RequestContextStore.get()?.aiStudent?.studentId ?? null,
        aiTier: RequestContextStore.get()?.aiStudent?.tier ?? null,
        agent,
        provider,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cacheReadTokens: r.cacheReadTokens ?? 0,
        cacheWriteTokens: r.cacheWriteTokens ?? 0,
        costUsd: cost,
        latencyMs,
      },
    });
  }

  private async recordFailure(agent: string, provider: string, model: string, err: unknown, latencyMs: number) {
    await this.prisma.root.aiUsage
      .create({
        data: {
          tenantId: RequestContextStore.get()?.tenantId ?? null,
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
