import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { CbtModule } from '../cbt/cbt.module';
import { ClassInsightsModule } from '../class-insights/class-insights.module';
import { LearningModule } from '../learning/learning.module';
import { MyPracticalTestsController, PracticalAssessmentsController } from './practical-assessments.controller';
import { PracticalAssessmentsService } from './practical-assessments.service';
import { PracticalHomeworkService } from './practical-homework.service';
import { PracticalsController, PracticalsTeachingController } from './practicals.controller';
import { PracticalsTeacherService } from './practicals-teacher.service';
import { PracticalsService } from './practicals.service';

/** WAEC Practical Academy: practical lessons, virtual labs with rubric marking, teachers' review, and practical tests teachers schedule for their classes. */
@Module({
  imports: [AiModule, AssessmentModule, CbtModule, LearningModule, ClassInsightsModule],
  controllers: [PracticalsController, PracticalsTeachingController, PracticalAssessmentsController, MyPracticalTestsController],
  providers: [PracticalsService, PracticalsTeacherService, PracticalHomeworkService, PracticalAssessmentsService],
  // Live homework hands a PRACTICAL assignment in for the class when it's published.
  exports: [PracticalHomeworkService],
})
export class PracticalsModule {}
