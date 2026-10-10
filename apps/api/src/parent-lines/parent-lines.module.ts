import { Module } from '@nestjs/common';
import { AssessmentModule } from '../assessment/assessment.module';
import { CommsModule } from '../comms/comms.module';
import { ConsentEnforcementService } from '../data-protection/consent-enforcement.service';
import { FinanceModule } from '../finance/finance.module';
import { ParentLinesAdminService } from './parent-lines-admin.service';
import { ParentLinesController, ParentLinesPlatformController, ParentLinesWebhookController } from './parent-lines.controller';
import { ParentLinesService } from './parent-lines.service';

/** The parent SMS & USSD line for families without smartphones (Africa's Talking USSD and two-way SMS). */
@Module({
  imports: [CommsModule, AssessmentModule, FinanceModule],
  controllers: [ParentLinesWebhookController, ParentLinesController, ParentLinesPlatformController],
  providers: [ParentLinesService, ParentLinesAdminService, ConsentEnforcementService],
})
export class ParentLinesModule {}
