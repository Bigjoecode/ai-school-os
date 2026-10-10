import { Module } from '@nestjs/common';
import { AssessmentModule } from '../assessment/assessment.module';
import { CommsModule } from '../comms/comms.module';
import { FinanceModule } from '../finance/finance.module';
import { PublicResultPinsController, ResultPinsController } from './result-pins.controller';
import { ResultPinsService } from './result-pins.service';

/** Result-checker PINs (scratch cards): a revenue line for schools, and an optional PIN gate on portal results. */
@Module({
  imports: [AssessmentModule, CommsModule, FinanceModule],
  controllers: [ResultPinsController, PublicResultPinsController],
  providers: [ResultPinsService],
  exports: [ResultPinsService],
})
export class ResultPinsModule {}
