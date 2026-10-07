import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { smsSafe, type Audience, type Channel, type ParentInviteInput, type ParentInvitePreview, type ParentInviteResult } from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { ChannelsService } from '../comms/channels.service';
import { SenderService } from '../comms/sender.service';
import { PrismaService } from '../prisma/prisma.service';
import { csvCell } from './csv';
import { FIRST_WEEK_KIND, FirstWeekService } from './first-week.service';
import { ImportService } from './import.service';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * "Invite parents to the portal" in one go. Parents without a login who have
 * an email get one (the same way the student import makes them: a one-time
 * password the school downloads once and hands over — passwords are never
 * sent by SMS or email). Then every invited parent, and optionally those who
 * have a login but have never signed in, gets a short invitation with the
 * sign-in address by the channels the school chooses.
 */
@Injectable()
export class ParentInvitesService {
  private readonly logger = new Logger(ParentInvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imports: ImportService,
    private readonly channels: ChannelsService,
    private readonly sender: SenderService,
    private readonly firstWeek: FirstWeekService,
    private readonly audit: AuditService,
  ) {}

  private guardians() {
    return this.prisma.db.guardian.findMany({ select: { id: true, firstName: true, lastName: true, email: true, userId: true, user: { select: { lastLoginAt: true } } } });
  }

  async preview(): Promise<ParentInvitePreview> {
    const tenantId = currentTenantId();
    const [rows, ch, last] = await Promise.all([
      this.guardians(),
      this.channels.load(tenantId),
      this.prisma.db.automationRun.findFirst({ where: { kind: FIRST_WEEK_KIND, subjectKey: 'invites' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);
    this.channels.close(ch);
    const without = rows.filter((g) => !g.userId);
    return {
      parents: rows.length,
      withLogin: rows.length - without.length,
      neverSignedIn: rows.filter((g) => g.userId && !g.user?.lastLoginAt).length,
      canCreate: without.filter((g) => g.email && EMAIL.test(g.email)).length,
      noEmail: without.filter((g) => !g.email || !EMAIL.test(g.email)).length,
      channels: { email: this.channels.configured(ch, 'EMAIL'), sms: this.channels.configured(ch, 'SMS') },
      lastSentAt: last?.createdAt.toISOString() ?? null,
    };
  }

  async send(input: ParentInviteInput): Promise<ParentInviteResult> {
    const tenantId = currentTenantId();
    const db = this.prisma.db;
    const role = await db.role.findFirst({ where: { key: 'parent' } });
    if (!role) throw new BadRequestException('This school has no Parent role');
    const ch = await this.channels.load(tenantId);
    this.channels.close(ch);
    const channels = input.channels.filter((c) => this.channels.configured(ch, c as Channel)) as Channel[];
    const off = input.channels.filter((c) => !channels.includes(c as Channel));
    if (off.length) throw new BadRequestException(`${off.map((c) => (c === 'EMAIL' ? 'Email' : 'SMS')).join(' and ')} ${off.length > 1 ? 'are' : 'is'} not set up yet. Set it up in Messages → Settings, or choose another way to send.`);

    const rows = await this.guardians();
    const todo = rows.filter((g) => !g.userId && g.email && EMAIL.test(g.email));
    const noEmail = rows.filter((g) => !g.userId && (!g.email || !EMAIL.test(g.email))).length;

    // Logins, exactly as the student import makes them.
    const credentials: string[][] = [];
    const linked: string[] = [];
    await this.imports.makeLogins(
      todo.map((g) => ({
        email: g.email!.toLowerCase(),
        firstName: g.firstName,
        lastName: g.lastName,
        roleId: role.id,
        roleName: 'Parent',
        link: async (userId: string) => {
          await db.guardian.update({ where: { id: g.id }, data: { userId } });
          linked.push(g.id);
        },
      })),
      credentials,
    );
    const loginsCreated = credentials.filter((c) => !c[2]!.startsWith('(existing')).length;
    const reminded = input.remindExisting ? rows.filter((g) => g.userId && !g.user?.lastLoginAt).map((g) => g.id) : [];
    const targets = [...new Set([...linked, ...reminded])];

    let broadcastId: string | null = null;
    if (targets.length) {
      const url = await this.firstWeek.baseUrl(tenantId);
      const where = url ? ` at ${url}` : '';
      const body = [
        'Dear {{first_name}},',
        `{{school}} now has an online parent portal. You can follow {{children}}’s homework, results, attendance and fees there, and get a short weekly note on how they are learning.`,
        `Sign in${where} with this email address and the password the school gives you. If you don’t have your password yet, please ask the school office — for your safety we never send passwords by message.`,
        'Thank you.',
      ].join('\n\n');
      const sms = smsSafe(`{{school}}: follow {{children}}'s homework, results and fees on our parent portal${where}. Sign in with your email; get your password from the school office.`);
      const audience: Audience = { type: 'PEOPLE', guardianIds: targets, staffIds: [] };
      const b = await db.broadcast.create({
        data: {
          tenantId,
          title: 'Parent portal invitation',
          channels,
          audience: audience as unknown as Prisma.InputJsonValue,
          audienceSummary: `${targets.length} parent${targets.length === 1 ? '' : 's'} invited to the portal`,
          subject: 'Your parent portal account at {{school}}',
          body,
          smsBody: sms,
          source: 'MANUAL',
          link: '/',
          createdById: currentContext().userId ?? null,
        },
      });
      broadcastId = b.id;
      try {
        await this.sender.start(tenantId, b.id);
      } catch (err) {
        await this.prisma.root.broadcast.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
        this.logger.warn(`Parent invitations not sent: ${(err as Error).message}`);
        throw new BadRequestException(`Logins were created, but the invitations couldn't be sent: ${(err as Error).message}`);
      } finally {
        const tz = (await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })).timezone;
        await this.prisma.root.automationRun.createMany({
          data: [{ tenantId, kind: FIRST_WEEK_KIND, subjectKey: 'invites', runDate: new Date(`${schoolNow(tz).date}T00:00:00Z`), broadcastId: b.id }],
          skipDuplicates: true,
        });
      }
    }

    await this.audit.log({
      action: 'parents.portal_invited',
      summary: `Invited ${targets.length} parent${targets.length === 1 ? '' : 's'} to the portal (${loginsCreated} new login${loginsCreated === 1 ? '' : 's'}${reminded.length ? `, ${reminded.length} reminded` : ''}) by ${channels.join(', ')}`,
      entityType: broadcastId ? 'Broadcast' : undefined,
      entityId: broadcastId ?? undefined,
    });
    return {
      loginsCreated,
      invited: linked.length,
      reminded: reminded.length,
      noEmail,
      broadcastId,
      credentialsCsv: credentials.length ? `Name,Email,Password,Role\r\n${credentials.map((c) => c.map(csvCell).join(',')).join('\r\n')}\r\n` : null,
    };
  }
}
