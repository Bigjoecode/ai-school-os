import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { FilesModule } from '../files/files.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { AssessmentSettingsService } from './assessment-settings.service';
import { PapersController } from './papers.controller';
import { QuestionsController } from './questions.controller';
import { ReportCardsController } from './report-cards.controller';
import { ReportTemplatesController } from './report-templates.controller';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';

/** Phase 4: question bank, exam papers, scores, results, report cards and analysis. */
@Module({
  imports: [AiModule, AttendanceModule, FilesModule],
  controllers: [QuestionsController, PapersController, ResultsController, ReportCardsController, ReportTemplatesController],
  providers: [AssessmentSettingsService, ResultsService],
  exports: [ResultsService, AssessmentSettingsService],
})
export class AssessmentModule {}
