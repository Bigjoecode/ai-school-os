import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { JambModule } from '../jamb/jamb.module';
import { CareerContentService } from './career-content.service';
import { CareersContentController, CareersController, CareersPortalController, CareersStaffController } from './careers.controller';
import { CareersService } from './careers.service';
import { CounsellorService } from './counsellor.service';

/** Phase 23: careers guidance for students, parents, staff and the console. */
@Module({
  imports: [AiModule, AssessmentModule, JambModule],
  controllers: [CareersController, CareersPortalController, CareersStaffController, CareersContentController],
  providers: [CareersService, CareerContentService, CounsellorService],
})
export class CareersModule {}
