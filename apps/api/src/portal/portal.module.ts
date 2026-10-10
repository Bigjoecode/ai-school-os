import { Module } from '@nestjs/common';
import { AssessmentModule } from '../assessment/assessment.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { FilesModule } from '../files/files.module';
import { FinanceModule } from '../finance/finance.module';
import { ResultPinsModule } from '../result-pins/result-pins.module';
import { PortalController } from './portal.controller';

/** What parents and students see about school life: attendance, results, calendar and downloads. */
@Module({
  imports: [AssessmentModule, AttendanceModule, FilesModule, FinanceModule, ResultPinsModule],
  controllers: [PortalController],
})
export class PortalModule {}
