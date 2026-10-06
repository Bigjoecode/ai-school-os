import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CommsModule } from '../comms/comms.module';
import { FilesModule } from '../files/files.module';
import { LearningModule } from '../learning/learning.module';
import { AssignmentsController } from './assignments.controller';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';
import { LiveProvidersService } from './providers.service';

/** Phase 11: live classes on Meet, Zoom and BigBlueButton; attendance, recordings, AI class summaries; homework. */
@Module({
  imports: [AiModule, CommsModule, FilesModule, LearningModule],
  controllers: [LiveController, AssignmentsController],
  providers: [LiveService, LiveProvidersService],
})
export class LiveModule {}
