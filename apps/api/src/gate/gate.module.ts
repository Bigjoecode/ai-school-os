import { Module } from '@nestjs/common';
import { CommsModule } from '../comms/comms.module';
import { FilesModule } from '../files/files.module';
import { GateController, GateFamilyController } from './gate.controller';
import { GateService } from './gate.service';

/** Students' gate check-in/out, parent arrival alerts and secure pick-up. */
@Module({
  imports: [CommsModule, FilesModule],
  controllers: [GateController, GateFamilyController],
  providers: [GateService],
  exports: [GateService],
})
export class GateModule {}
