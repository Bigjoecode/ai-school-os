import { Module } from '@nestjs/common';
import { CommsModule } from '../comms/comms.module';
import { BehaviourController } from './behaviour.controller';
import { PortalWelfareController } from './portal-welfare.controller';
import { SickBayController } from './sick-bay.controller';
import { WelfareService } from './welfare.service';

/** Student welfare: the behaviour log, the sick bay and medical profiles (and their family-portal view). */
@Module({
  imports: [CommsModule],
  controllers: [BehaviourController, SickBayController, PortalWelfareController],
  providers: [WelfareService],
})
export class WelfareModule {}
