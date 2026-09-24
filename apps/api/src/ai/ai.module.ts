import { Body, Controller, Get, HttpCode, Module, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { aiChatSchema, type AiChatInput, type AiChatResponse, type AiJobView, type AiStatus } from '@aischool/shared';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { DashboardModule } from '../dashboard/dashboard.module';
import { AiGatewayService } from './ai-gateway.service';
import { AiJobsService } from './ai-jobs.service';
import { AiService } from './ai.service';
import { GenerationQueue } from './generation-queue';

@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly jobs: AiJobsService,
  ) {}

  @Get('status')
  @RequirePermissions('ai.use')
  status(): Promise<AiStatus> {
    return this.ai.status();
  }

  @Post('chat')
  @HttpCode(200)
  @RequirePermissions('ai.use')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  chat(@Body(new ZodPipe(aiChatSchema)) body: AiChatInput): Promise<AiChatResponse> {
    return this.ai.chat(body);
  }

  /** Progress of a background AI job (question batches, report remarks…). */
  @Get('jobs/:id')
  @RequirePermissions('ai.use')
  job(@Param('id') id: string): Promise<AiJobView> {
    return this.jobs.get(id);
  }
}

@Module({
  imports: [DashboardModule],
  controllers: [AiController],
  providers: [AiGatewayService, AiService, GenerationQueue, AiJobsService],
  exports: [AiGatewayService, GenerationQueue, AiJobsService],
})
export class AiModule {}
