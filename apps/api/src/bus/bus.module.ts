import { Module } from '@nestjs/common';
import { CommsModule } from '../comms/comms.module';
import { BusController } from './bus.controller';
import { BusService } from './bus.service';
import { MapTilesController } from './map-tiles.controller';

/** Live school bus tracking: driver trips, location pings, boarding and parent notifications. */
@Module({
  imports: [CommsModule],
  controllers: [BusController, MapTilesController],
  providers: [BusService],
})
export class BusModule {}
