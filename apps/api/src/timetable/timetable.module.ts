import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { TimetableController } from './timetable.controller';
import { TimetableService } from './timetable.service';

/** Phase 5: bell schedule, rooms, teaching loads, the solver and the AI timetable assistant. */
@Module({
  imports: [AiModule],
  controllers: [TimetableController],
  providers: [TimetableService],
})
export class TimetableModule {}
