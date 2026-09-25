import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

/** Phase 6: class registers, staff attendance with QR check-in, reports and AI help. */
@Module({
  imports: [AiModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
