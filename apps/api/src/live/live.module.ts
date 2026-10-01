import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CommsModule } from '../comms/comms.module';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';
import { LiveProvidersService } from './providers.service';

/** Phase 11: live classes on Meet, Zoom and BigBlueButton; attendance, recordings, AI class summaries; homework. */
@Module({
  imports: [AiModule, CommsModule],
  controllers: [LiveController],
  providers: [LiveService, LiveProvidersService],
})
export class LiveModule {}
