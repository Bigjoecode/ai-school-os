import { Controller, Get, Module, Param } from '@nestjs/common';
import type { AiJobView, AiStatus } from '@aischool/shared';
import { RequirePermissions } from '../common/decorators';
import { DashboardModule } from '../dashboard/dashboard.module';
import { AiGatewayService } from './ai-gateway.service';
import { AiJobsService } from './ai-jobs.service';
import { AiService } from './ai.service';
import { AiSettingsController } from './ai-settings.controller';
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

  /** Progress of a background AI job (question batches, report remarks…). */
  @Get('jobs/:id')
  @RequirePermissions('ai.use')
  job(@Param('id') id: string): Promise<AiJobView> {
    return this.jobs.get(id);
  }
}

@Module({
  imports: [DashboardModule],
  controllers: [AiController, AiSettingsController],
  providers: [AiGatewayService, AiService, GenerationQueue, AiJobsService],
  exports: [AiGatewayService, GenerationQueue, AiJobsService, AiService],
})
export class AiModule {}
