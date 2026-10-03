import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  AI_PROVIDERS,
  AI_PROVIDER_LABELS,
  aiSettingsSchema,
  aiTestSchema,
  type AiSettings,
  type AiSettingsView,
  type AiTestResult,
} from '@aischool/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { RequirePlatformRole } from '../common/decorators';
import { currentUserId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AiGatewayService } from './ai-gateway.service';
import { aiSettings } from './ai-settings';
import { costUsd } from './pricing';

const KEY_SET: Record<(typeof AI_PROVIDERS)[number], () => boolean> = {
  anthropic: () => !!env().ANTHROPIC_API_KEY,
  openai: () => !!env().OPENAI_API_KEY,
  gemini: () => !!env().GEMINI_API_KEY,
};

/** Platform → AI models: which model each tier uses per provider, the fallback order and prices. */
@Controller('platform/ai-settings')
@RequirePlatformRole('SUPER_ADMIN')
export class AiSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async view(): Promise<AiSettingsView> {
    const settings = await this.gateway.reloadSettings();
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [byProvider, models] = await Promise.all([
      this.prisma.root.aiUsage.groupBy({ by: ['provider', 'success'], where: { createdAt: { gte: since } }, _count: { _all: true }, _sum: { costUsd: true } }),
      this.prisma.root.aiUsage.groupBy({ by: ['model'], where: { createdAt: { gte: since }, success: true, provider: { not: 'fake' } } }),
    ]);
    return {
      settings,
      providers: AI_PROVIDERS.map((p) => {
        const rows = byProvider.filter((r) => r.provider === p);
        const m = settings.models[p];
        return {
          provider: p,
          label: AI_PROVIDER_LABELS[p],
          keySet: KEY_SET[p](),
          ready: KEY_SET[p]() && !!m.standard && !!m.advanced,
          models: { standard: m.standard, advanced: m.advanced },
          calls30d: rows.reduce((t, r) => t + r._count._all, 0),
          failures30d: rows.filter((r) => !r.success).reduce((t, r) => t + r._count._all, 0),
          costUsd30d: Math.round(rows.reduce((t, r) => t + Number(r._sum.costUsd ?? 0), 0) * 100) / 100,
        };
      }),
      unpricedModels: models.map((m) => m.model).filter((m) => !costUsd(m, 0, 0).known),
    };
  }

  @Put()
  async save(@Body(new ZodPipe(aiSettingsSchema)) body: AiSettings): Promise<AiSettingsView> {
    const before = aiSettings();
    await this.prisma.root.platformSetting.upsert({
      where: { key: 'ai' },
      update: { value: body as unknown as object, updatedBy: currentUserId() },
      create: { key: 'ai', value: body as unknown as object, updatedBy: currentUserId() },
    });
    await this.gateway.reloadSettings();
    const changes = [
      before.order.join('>') !== body.order.join('>') ? `order ${body.order.join(' → ')}` : '',
      ...AI_PROVIDERS.flatMap((p) => (['standard', 'advanced'] as const).filter((t) => before.models[p][t] !== body.models[p][t]).map((t) => `${p} ${t} ${before.models[p][t] || '—'} → ${body.models[p][t] || '—'}`)),
      before.promptCaching !== body.promptCaching ? `prompt caching ${body.promptCaching ? 'on' : 'off'}` : '',
      ...AI_PROVIDERS.flatMap((p) => (['standardEffort', 'advancedEffort'] as const).filter((t) => before.models[p][t] !== body.models[p][t]).map((t) => `${p} ${t === 'standardEffort' ? 'standard' : 'advanced'} effort ${body.models[p][t]}`)),
      ...[...new Set([...Object.keys(before.prices), ...Object.keys(body.prices)])]
        .filter((m) => JSON.stringify(before.prices[m] ?? null) !== JSON.stringify(body.prices[m] ?? null))
        .map((m) => (body.prices[m] ? `price ${m} $${body.prices[m]!.input}/$${body.prices[m]!.output}` : `price ${m} removed`)),
    ].filter(Boolean);
    if (changes.length) await this.audit.log({ tenantId: null, action: 'platform.ai_settings', summary: `Updated AI models: ${changes.join('; ')}`.slice(0, 900) });
    return this.view();
  }

  /** A tiny real request to one provider and tier, plus a structured-output check: is it set up right, and what does it cost? */
  @Post('test')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async test(@Body(new ZodPipe(aiTestSchema)) body: z.infer<typeof aiTestSchema>): Promise<AiTestResult> {
    const p = this.gateway.provider(body.provider);
    const model = p?.modelFor(body.tier) ?? '';
    const base = { provider: body.provider, model, reply: '', latencyMs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, structuredOk: null };
    if (!p || !KEY_SET[body.provider]()) return { ...base, ok: false, error: `No API key: set ${body.provider.toUpperCase()}_API_KEY in the server environment and restart` };
    if (!model) return { ...base, ok: false, error: `No ${body.tier} model set for ${body.provider}` };
    const started = Date.now();
    try {
      const r = await p.generate({ tier: body.tier, system: 'You are a helpful assistant for a Nigerian school.', messages: [{ role: 'user', content: 'In one short sentence, what is photosynthesis?' }], maxOutputTokens: 120 });
      let structuredOk: boolean | null = null;
      try {
        const j = await p.generateJson({ tier: body.tier, system: 'Answer with the requested fields.', messages: [{ role: 'user', content: 'Give a mathematics quiz question for JSS 1 with four options.' }], maxOutputTokens: 400 }, z.object({ question: z.string(), options: z.array(z.string()), answerIndex: z.number().int(), explanation: z.string().optional() }));
        structuredOk = typeof j.data.question === 'string' && Array.isArray(j.data.options);
      } catch {
        structuredOk = false;
      }
      const latencyMs = Date.now() - started;
      const { cost } = costUsd(r.model, r.inputTokens, r.outputTokens, { read: r.cacheReadTokens, write: r.cacheWriteTokens });
      return { ok: !!r.text, provider: body.provider, model: r.model, reply: r.text.slice(0, 300), latencyMs, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: Math.round(cost * 1e6) / 1e6, structuredOk, error: r.text ? null : 'Empty reply' };
    } catch (err) {
      return { ...base, ok: false, latencyMs: Date.now() - started, error: (err as Error).message.slice(0, 400) };
    }
  }
}
