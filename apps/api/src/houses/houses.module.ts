import { Module } from '@nestjs/common';
import { HousesController } from './houses.controller';
import { HousesService } from './houses.service';
import { PortalHousesController } from './portal-houses.controller';

/** School houses, house points and the house leaderboard (and its family-portal view). */
@Module({
  controllers: [HousesController, PortalHousesController],
  providers: [HousesService],
})
export class HousesModule {}
