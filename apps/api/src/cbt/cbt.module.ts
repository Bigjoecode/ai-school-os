import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { LearningModule } from '../learning/learning.module';
import { CbtService } from './cbt.service';
import { MyExamsController } from './my-exams.controller';
import { OfflineExamsController, OfflineExamsStaffController } from './offline-exams.controller';
import { OfflineExamsService } from './offline-exams.service';
import { OnlineExamsController } from './online-exams.controller';

/** Online exams (CBT): scheduled from exam papers, sat in the browser, marked and sent to the score sheet. */
@Module({
  imports: [AiModule, AssessmentModule, LearningModule],
  controllers: [OfflineExamsStaffController, OnlineExamsController, MyExamsController, OfflineExamsController],
  providers: [CbtService, OfflineExamsService],
})
export class CbtModule {}
