import { Module } from '@nestjs/common';
import { AssessmentModule } from '../assessment/assessment.module';
import { FinanceModule } from '../finance/finance.module';
import { PromotionController } from './promotion.controller';
import { PromotionService } from './promotion.service';

/** End-of-session promotion and new-session rollover. */
@Module({
  imports: [AssessmentModule, FinanceModule],
  controllers: [PromotionController],
  providers: [PromotionService],
})
export class PromotionModule {}
