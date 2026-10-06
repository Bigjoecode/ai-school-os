import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CommsModule } from '../comms/comms.module';
import { LearningUpdatesController } from './learning-updates.controller';
import { LearningUpdatesService } from './learning-updates.service';

/** The weekly "How <child> is learning" update for parents (and students' own, in the app). */
@Module({
  imports: [AiModule, CommsModule],
  controllers: [LearningUpdatesController],
  providers: [LearningUpdatesService],
})
export class LearningUpdatesModule {}
