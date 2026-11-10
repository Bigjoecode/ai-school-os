import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  boardingSchema,
  busPingSchema,
  startTripSchema,
  stopLocationsSchema,
  type BoardingInput,
  type BusPingInput,
  type StartTripInput,
  type StopLocationsInput,
} from '@aischool/shared';
import { RequireFeature, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { BusService } from './bus.service';

/**
 * Live school bus tracking. Three audiences, each with its own routes:
 *  - drivers and bus assistants (transport.drive): their own trips only;
 *  - parents (family.manage): their own child's bus, only while a trip runs;
 *  - transport staff (transport.read / transport.manage): every bus on a trip.
 * Coordinates are only ever in bodies, never in URLs or query strings.
 */
@Controller('bus')
@RequireFeature('transport')
export class BusController {
  constructor(private readonly bus: BusService) {}

  // ---------------------------------------------------------- driver

  @Get('driver/home')
  @RequirePermissions('transport.drive')
  home() {
    return this.bus.driverHome();
  }

  @Post('trips')
  @RequirePermissions('transport.drive')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  start(@Body(new ZodPipe(startTripSchema)) body: StartTripInput) {
    return this.bus.startTrip(body);
  }

  @Get('trips/:id/driver')
  @RequirePermissions('transport.drive')
  driverTrip(@Param('id') id: string) {
    return this.bus.driverTrip(id);
  }

  /** About one upload every 12 s while a trip runs, plus catch-up after a dead spot. */
  @Post('trips/:id/pings')
  @HttpCode(200)
  @RequirePermissions('transport.drive')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  ping(@Param('id') id: string, @Body(new ZodPipe(busPingSchema)) body: BusPingInput) {
    return this.bus.ping(id, body.fixes);
  }

  @Post('trips/:id/boarding')
  @HttpCode(200)
  @RequirePermissions('transport.drive')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  board(@Param('id') id: string, @Body(new ZodPipe(boardingSchema)) body: BoardingInput) {
    return this.bus.board(id, body);
  }

  @Post('trips/:id/end')
  @HttpCode(200)
  @RequirePermissions('transport.drive')
  end(@Param('id') id: string) {
    return this.bus.endTrip(id, 'DRIVER');
  }

  // ---------------------------------------------------------- parents

  @Get('family/:studentId')
  @RequirePermissions('family.manage')
  family(@Param('studentId') studentId: string) {
    return this.bus.familyBus(studentId);
  }

  // ---------------------------------------------------------- transport office

  @Get('live')
  @RequirePermissions('transport.read')
  live() {
    return this.bus.live();
  }

  @Get('trips')
  @RequirePermissions('transport.read')
  trips(@Query('date') date?: string) {
    return this.bus.trips(date || undefined);
  }

  /** For a trip the driver couldn't end (phone died). */
  @Post('trips/:id/stop')
  @HttpCode(200)
  @RequirePermissions('transport.manage')
  stop(@Param('id') id: string) {
    return this.bus.endTrip(id, 'STAFF');
  }

  @Get('drivers')
  @RequirePermissions('transport.manage')
  drivers() {
    return this.bus.drivers();
  }

  @Put('routes/:id/stops')
  @RequirePermissions('transport.manage')
  stopLocations(@Param('id') id: string, @Body(new ZodPipe(stopLocationsSchema)) body: StopLocationsInput) {
    return this.bus.setStopLocations(id, body);
  }
}
