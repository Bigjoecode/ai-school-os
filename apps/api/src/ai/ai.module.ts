import { Body, Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { aiChatSchema, type AiChatInput, type AiChatResponse, type AiStatus } from '@aischool/shared';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { DashboardModule } from '../dashboard/dashboard.module';
import { AiGatewayService } from './ai-gateway.service';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

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
}

@Module({
  imports: [DashboardModule],
  controllers: [AiController],
  providers: [AiGatewayService, AiService],
  exports: [AiGatewayService],
})
export class AiModule {}
