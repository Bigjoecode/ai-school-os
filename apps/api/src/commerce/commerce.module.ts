import { Module } from '@nestjs/common';
import { ConsoleModule } from '../console/console.module';
import { FinanceModule } from '../finance/finance.module';
import { ConsoleCommerceController, FamilyController, PlatformWebhookController, SponsorshipController } from './commerce.controller';
import { CommerceService } from './commerce.service';

/** Phase 15: parent subscriptions, school sponsorships, refunds, the ledger and unit economics. */
@Module({
  imports: [ConsoleModule, FinanceModule],
  controllers: [FamilyController, SponsorshipController, PlatformWebhookController, ConsoleCommerceController],
  providers: [CommerceService],
  exports: [CommerceService],
})
export class CommerceModule {}
