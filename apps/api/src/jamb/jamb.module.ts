import { Module } from '@nestjs/common';
import { JambConsoleController, JambController } from './jamb.controller';
import { JambService } from './jamb.service';

/** Phase 24: JAMB & universities (JAMB's IBASS brochure, the eligibility helper, e-syllabus and FAQ). */
@Module({
  controllers: [JambController, JambConsoleController],
  providers: [JambService],
  exports: [JambService],
})
export class JambModule {}
