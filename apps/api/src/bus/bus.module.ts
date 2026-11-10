import { Module } from '@nestjs/common';
import { CommsModule } from '../comms/comms.module';
import { BusController } from './bus.controller';
import { BusService } from './bus.service';

/** Live school bus tracking: driver trips, location pings, boarding and parent notifications. */
@Module({
  imports: [CommsModule],
  controllers: [BusController],
  providers: [BusService],
})
export class BusModule {}
