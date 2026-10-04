import { Module } from '@nestjs/common';
import { CommsModule } from '../comms/comms.module';
import { AlumniController } from './alumni.controller';
import { AlumniService } from './alumni.service';

/** Alumni records: graduates, website sign-ups, import/export and messages to old students. */
@Module({
  imports: [CommsModule],
  controllers: [AlumniController],
  providers: [AlumniService],
})
export class AlumniModule {}
