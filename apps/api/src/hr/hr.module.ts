import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

/** Phase 8: departments, employee records, leave, awards, salaries and monthly payroll. */
@Module({
  imports: [AiModule],
  controllers: [HrController, PayrollController],
  providers: [HrService, PayrollService],
  exports: [HrService],
})
export class HrModule {}
