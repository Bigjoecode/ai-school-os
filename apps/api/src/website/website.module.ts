import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { FilesModule } from '../files/files.module';
import { PublicSiteController } from './public-site.controller';
import { WebsiteController } from './website.controller';
import { WebsiteService } from './website.service';

/** Phase 13: every school's public website, its builder, the results checker and the AI website assistant. */
@Module({
  imports: [AiModule, AssessmentModule, FilesModule],
  controllers: [WebsiteController, PublicSiteController],
  providers: [WebsiteService],
})
export class WebsiteModule {}
