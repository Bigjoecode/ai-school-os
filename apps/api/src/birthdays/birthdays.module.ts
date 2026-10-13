import { Body, Controller, Get, Header, HttpCode, Module, Post, Query } from '@nestjs/common';
import {
  classWishesSchema,
  upcomingBirthdaysQuerySchema,
  type ClassBirthdays,
  type ClassWishesInput,
  type ClassWishesResult,
  type MyBirthday,
  type UpcomingBirthdays,
} from '@aischool/shared';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { BirthdaysService } from './birthdays.service';

const mineQuery = z.object({ preview: z.enum(['1', 'true']).optional() });
type UpcomingQuery = z.output<typeof upcomingBirthdaysQuerySchema>;

/**
 * Birthdays: the student's own card (GET /birthdays/me), class teachers'
 * "birthdays in my class" with one-click class wishes, and the admin list
 * with CSV export. The morning messages themselves are sent by
 * SchedulerService (comms). Day and month only, everywhere.
 */
@Controller('birthdays')
export class BirthdaysController {
  constructor(private readonly birthdays: BirthdaysService) {}

  @Get('me')
  @RequirePermissions('learning.use')
  mine(@Query(new ZodPipe(mineQuery)) q: z.infer<typeof mineQuery>): Promise<MyBirthday> {
    return this.birthdays.mine(!!q.preview);
  }

  @Get('my-classes')
  @RequirePermissions('school.read')
  myClasses(): Promise<ClassBirthdays> {
    return this.birthdays.myClasses();
  }

  @Post('class-wishes')
  @HttpCode(200)
  @RequirePermissions('school.read')
  classWishes(@Body(new ZodPipe(classWishesSchema)) body: ClassWishesInput): Promise<ClassWishesResult> {
    return this.birthdays.classWishes(body);
  }

  @Get('upcoming')
  @RequirePermissions('comms.manage')
  upcoming(@Query(new ZodPipe(upcomingBirthdaysQuerySchema)) q: UpcomingQuery): Promise<UpcomingBirthdays> {
    return this.birthdays.upcoming(q.days, q.classArmId || undefined);
  }

  @Get('upcoming.csv')
  @RequirePermissions('comms.manage')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="birthdays.csv"')
  upcomingCsv(@Query(new ZodPipe(upcomingBirthdaysQuerySchema)) q: UpcomingQuery): Promise<string> {
    return this.birthdays.upcomingCsv(q.days, q.classArmId || undefined);
  }
}

@Module({
  controllers: [BirthdaysController],
  providers: [BirthdaysService],
})
export class BirthdaysModule {}
