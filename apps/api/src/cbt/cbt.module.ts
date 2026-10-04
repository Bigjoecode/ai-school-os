import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { CbtService } from './cbt.service';
import { MyExamsController } from './my-exams.controller';
import { OnlineExamsController } from './online-exams.controller';

/** Online exams (CBT): scheduled from exam papers, sat in the browser, marked and sent to the score sheet. */
@Module({
  imports: [AiModule, AssessmentModule],
  controllers: [OnlineExamsController, MyExamsController],
  providers: [CbtService],
})
export class CbtModule {}
