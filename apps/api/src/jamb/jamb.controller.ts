import { Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JAMB_LEVELS, PLATFORM_AREAS, jambCheckSchema, type JambCheckInput, type Permission } from '@aischool/shared';
import { z } from 'zod';
import { RequirePlatformRole } from '../common/decorators';
import { currentContext } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { JambService } from './jamb.service';

/** Students (learning.use), parents (family.manage) and school staff (school.read) can all browse JAMB's brochure. */
const READERS: Permission[] = ['learning.use', 'family.manage', 'school.read'];
function assertReader() {
  const p = currentContext().permissions;
  if (!READERS.some((x) => p.has(x))) throw new ForbiddenException('JAMB & universities is for students, parents and school staff');
}

const page = z.coerce.number().int().min(1).max(1000).optional();
const text = (n: number) => z.string().trim().max(n).optional().transform((v) => v || undefined);
const institutionQuery = z.object({ type: z.enum(JAMB_LEVELS).optional(), ownership: text(20), state: text(60), category: text(120), q: text(100), page });
const courseQuery = z.object({ faculty: text(60), level: z.enum(JAMB_LEVELS).optional(), q: text(100), page });
const courseFilters = z.object({ state: text(60), ownership: text(20), type: z.enum(JAMB_LEVELS).optional() });

/** JAMB & universities: JAMB's brochure (IBASS), read-only. */
@Controller('jamb')
export class JambController {
  constructor(private readonly jamb: JambService) {}

  @Get('overview')
  overview() {
    assertReader();
    return this.jamb.overview();
  }

  @Get('institutions')
  institutions(@Query(new ZodPipe(institutionQuery)) q: z.infer<typeof institutionQuery>) {
    assertReader();
    return this.jamb.institutions(q);
  }

  @Get('institutions/:id')
  institution(@Param('id', ParseIntPipe) id: number) {
    assertReader();
    return this.jamb.institution(id);
  }

  @Get('faculties')
  faculties() {
    assertReader();
    return this.jamb.faculties();
  }

  @Get('courses')
  courses(@Query(new ZodPipe(courseQuery)) q: z.infer<typeof courseQuery>) {
    assertReader();
    return this.jamb.courses(q);
  }

  @Get('courses/:id')
  course(@Param('id', ParseIntPipe) id: number, @Query(new ZodPipe(courseFilters)) f: z.infer<typeof courseFilters>) {
    assertReader();
    return this.jamb.course(id, f);
  }

  @Get('syllabus')
  syllabus() {
    assertReader();
    return this.jamb.syllabus();
  }

  @Get('syllabus/:subject')
  syllabusSubject(@Param('subject') subject: string) {
    assertReader();
    return this.jamb.syllabusSubject(decodeURIComponent(subject).slice(0, 80));
  }

  @Get('faq')
  faq() {
    assertReader();
    return this.jamb.faq();
  }

  /** The eligibility helper: a student's UTME subjects (and optional O'level grades) against a course or an institution. */
  @Post('check')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  check(@Body(new ZodPipe(jambCheckSchema)) body: JambCheckInput) {
    assertReader();
    return this.jamb.check(body);
  }
}

/** The console's view of the installed JAMB data (it is JAMB's, so there is nothing to edit). */
@Controller('platform/jamb')
@RequirePlatformRole(...PLATFORM_AREAS.content)
export class JambConsoleController {
  constructor(private readonly jamb: JambService) {}

  @Get('status')
  status() {
    return this.jamb.consoleStatus();
  }
}
