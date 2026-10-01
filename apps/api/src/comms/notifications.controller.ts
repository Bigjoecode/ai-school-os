import { Body, Controller, Get, Headers, HttpCode, NotFoundException, Param, Post, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { pushSubscriptionSchema, type NotificationsResponse } from '@aischool/shared';
import { z } from 'zod';
import { AllowNoTenant, Public } from '../common/decorators';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelsService } from './channels.service';
import { SchedulerService, type TickResult } from './scheduler.service';

@Controller()
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly scheduler: SchedulerService,
  ) {}

  // ---------------------------------------------------------- in-app (the bell)

  @Get('notifications')
  async list(): Promise<NotificationsResponse> {
    const where = { userId: currentContext().userId! };
    const [items, unread] = await Promise.all([
      this.prisma.db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.db.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return {
      items: items.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() })),
      unread,
    };
  }

  @Post('notifications/:id/read')
  @HttpCode(204)
  async read(@Param('id') id: string) {
    const r = await this.prisma.db.notification.updateMany({ where: { id, userId: currentContext().userId!, readAt: null }, data: { readAt: new Date() } });
    if (!r.count && !(await this.prisma.db.notification.count({ where: { id, userId: currentContext().userId! } }))) throw new NotFoundException();
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  async readAll() {
    await this.prisma.db.notification.updateMany({ where: { userId: currentContext().userId!, readAt: null, tenantId: currentTenantId() }, data: { readAt: new Date() } });
  }

  // ---------------------------------------------------------- web push (per browser, any school)

  @Get('push/key')
  @AllowNoTenant()
  key(): { publicKey: string | null } {
    return { publicKey: this.channels.pushPublicKey() };
  }

  @Post('push/subscribe')
  @HttpCode(204)
  @AllowNoTenant()
  async subscribe(@Body(new ZodPipe(pushSubscriptionSchema)) body: z.infer<typeof pushSubscriptionSchema>, @Headers('user-agent') ua?: string) {
    const userId = currentContext().userId!;
    await this.prisma.root.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: { userId, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent: ua?.slice(0, 300) },
      create: { userId, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent: ua?.slice(0, 300) },
    });
  }

  @Post('push/unsubscribe')
  @HttpCode(204)
  @AllowNoTenant()
  async unsubscribe(@Body(new ZodPipe(z.object({ endpoint: z.url() }))) body: { endpoint: string }) {
    await this.prisma.root.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: currentContext().userId! } });
  }

  // ---------------------------------------------------------- cron

  /**
   * For a cPanel cron job, every 5 minutes:
   *   curl -s -X POST -H "x-cron-key: $CRON_SECRET" https://your-site/api/cron/tick
   */
  @Post('cron/tick')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async tick(@Headers('x-cron-key') key?: string): Promise<TickResult> {
    const secret = env().CRON_SECRET;
    const ok = !!secret && !!key && key.length === secret.length && timingSafeEqual(Buffer.from(key), Buffer.from(secret));
    if (!ok) throw new UnauthorizedException();
    return this.scheduler.tick();
  }
}
