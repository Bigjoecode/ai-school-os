import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { FinanceModule } from '../finance/finance.module';
import { PlatformBillingService } from './billing.service';
import { ConsoleBillingController } from './console-billing.controller';
import { ConsoleOpsController } from './console-ops.controller';
import { ConsoleController } from './console.controller';
import { SchoolBillingController, SchoolSupportController } from './school-account.controller';
import { SupportService } from './support.service';

/**
 * Phase 14: the SaaS operator console (schools, plans, subscriptions,
 * payments, usage, domains, support, health, feature flags, audit) and each
 * school's own billing and support pages.
 */
@Module({
  imports: [AiModule, FinanceModule],
  controllers: [ConsoleController, ConsoleBillingController, ConsoleOpsController, SchoolBillingController, SchoolSupportController],
  providers: [PlatformBillingService, SupportService],
})
export class ConsoleModule {}
