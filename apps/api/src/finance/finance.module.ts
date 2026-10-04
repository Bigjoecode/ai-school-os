import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DiscountsController } from './discounts.controller';
import { DiscountsService } from './discounts.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { PaystackService } from './paystack.service';
import { PublicPayController } from './public-pay.controller';

/** Phase 7: fee schedules, invoices, payments (manual and Paystack), expenses and reports. */
@Module({
  imports: [AiModule],
  controllers: [FinanceController, DiscountsController, PublicPayController],
  providers: [FinanceService, PaystackService, DiscountsService],
  exports: [FinanceService, PaystackService],
})
export class FinanceModule {}
