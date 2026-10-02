import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { FilesModule } from '../files/files.module';
import { ExamService } from './exam.service';
import { ChildProgressController, ContentController, LearningController } from './learning.controller';
import { MasteryService } from './mastery.service';
import { StudyService } from './study.service';
import { TutorService } from './tutor.service';

/** Phase 15: the student AI learning companion, mastery, study tools and Exam Academy. */
@Module({
  imports: [AiModule, AssessmentModule, FilesModule],
  controllers: [LearningController, ChildProgressController, ContentController],
  providers: [MasteryService, StudyService, TutorService, ExamService],
  exports: [MasteryService],
})
export class LearningModule {}
