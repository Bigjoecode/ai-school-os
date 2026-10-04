import { Body, Controller, Get, HttpCode, Module, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { aiBudgetSchema, aiChatSchema, type AgentInfo, type AiChatInput, type AiChatResponse, type AiUsageReport, type AtRiskReport } from '@aischool/shared';
import { z } from 'zod';
import { AiModule } from '../ai/ai.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { AuditService } from '../audit/audit.service';
import { CommsModule } from '../comms/comms.module';
import { RequirePermissions } from '../common/decorators';
import { currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { DashboardModule } from '../dashboard/dashboard.module';
import { HrModule } from '../hr/hr.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { PrismaService } from '../prisma/prisma.service';
import { AgentsService } from './agents.service';
import { InsightsService } from './insights.service';
import { AgentToolsService } from './tools.service';

@Controller('ai')
export class AgentsController {
  constructor(
    private readonly agents: AgentsService,
    private readonly insights: InsightsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('agents')
  @RequirePermissions('ai.use')
  list(): AgentInfo[] {
    return this.agents.list();
  }

  @Post('chat')
  @HttpCode(200)
  @RequirePermissions('ai.use')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  chat(@Body(new ZodPipe(aiChatSchema)) body: AiChatInput): Promise<AiChatResponse> {
    return this.agents.chat(body);
  }

  @Get('usage')
  @RequirePermissions('ai.admin')
  usage(@Query(new ZodPipe(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }))) q: { month?: string }): Promise<AiUsageReport> {
    return this.insights.usage(q.month ?? new Date().toISOString().slice(0, 7));
  }

  /** A school may cap its own monthly AI spend (null = the platform default). */
  @Put('budget')
  @RequirePermissions('ai.admin', 'school.manage')
  async budget(@Body(new ZodPipe(aiBudgetSchema)) body: z.infer<typeof aiBudgetSchema>) {
    await this.prisma.root.tenant.update({ where: { id: currentTenantId() }, data: { aiMonthlyBudgetUsd: body.monthlyBudgetUsd } });
    await this.audit.log({ action: 'ai.budget', summary: body.monthlyBudgetUsd === null ? 'Reset the monthly AI budget to the plan default' : `Set the monthly AI budget to $${body.monthlyBudgetUsd}` });
    return { monthlyBudgetUsd: body.monthlyBudgetUsd };
  }

  @Get('insights/at-risk')
  @RequirePermissions('students.read', 'attendance.read')
  atRisk(@Query(new ZodPipe(z.object({ classArmId: z.string().optional() }))) q: { classArmId?: string }): Promise<AtRiskReport> {
    return this.insights.atRisk({ classArmId: q.classArmId });
  }

  @Post('briefing')
  @HttpCode(200)
  @RequirePermissions('ai.use')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  briefing() {
    return this.agents.briefing();
  }
}

/** Phase 12: tool-using assistants, AI analytics, early warnings and the principal's briefing. */
@Module({
  imports: [AiModule, AssessmentModule, DashboardModule, HrModule, CommsModule, KnowledgeModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentToolsService, InsightsService],
  exports: [AgentsService],
})
export class AgentsModule {}
