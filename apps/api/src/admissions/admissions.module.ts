import { Module } from '@nestjs/common';
import { CommsModule } from '../comms/comms.module';
import { FilesModule } from '../files/files.module';
import { FinanceModule } from '../finance/finance.module';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsService } from './admissions.service';

/** Admissions: applications, entrance exams and interviews, offers, enrolment and the website status check. */
@Module({
  imports: [CommsModule, FilesModule, FinanceModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService],
  exports: [AdmissionsService],
})
export class AdmissionsModule {}
