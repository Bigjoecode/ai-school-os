import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ClassInsightsModule } from '../class-insights/class-insights.module';
import { LearningModule } from '../learning/learning.module';
import { PracticalsController, PracticalsTeachingController } from './practicals.controller';
import { PracticalsTeacherService } from './practicals-teacher.service';
import { PracticalsService } from './practicals.service';

/** WAEC Practical Academy: practical lessons, virtual labs with rubric marking, and teachers' review. */
@Module({
  imports: [AiModule, LearningModule, ClassInsightsModule],
  controllers: [PracticalsController, PracticalsTeachingController],
  providers: [PracticalsService, PracticalsTeacherService],
})
export class PracticalsModule {}
