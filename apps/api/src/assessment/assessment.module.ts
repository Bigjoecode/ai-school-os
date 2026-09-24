import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AssessmentSettingsService } from './assessment-settings.service';
import { PapersController } from './papers.controller';
import { QuestionsController } from './questions.controller';
import { ReportCardsController } from './report-cards.controller';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';

/** Phase 4: question bank, exam papers, scores, results, report cards and analysis. */
@Module({
  imports: [AiModule],
  controllers: [QuestionsController, PapersController, ResultsController, ReportCardsController],
  providers: [AssessmentSettingsService, ResultsService],
})
export class AssessmentModule {}
