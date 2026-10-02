import { PLATFORM_AREAS, type PlatformArea } from '@aischool/shared';
import { Users2 } from 'lucide-react';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { type Column, DataTable } from '@/components/ui/data-table';
import { formatRelative } from '@/lib/format';
import { cn, initialsFromName } from '@/lib/utils';
import { type TeamMember, useTeam } from './api';
import { PLATFORM_ROLE_LABEL, PlatformRoleBadge, Section } from './ui';

const AREA_LABEL: Record<PlatformArea, string> = {
  overview: 'Overview',
  schools: 'Schools',
  billing: 'Billing',
  plans: 'Plans',
  usage: 'Usage',
  domains: 'Domains',
  support: 'Support',
  health: 'Health',
  flags: 'Flags',
  audit: 'Audit',
  commerce: 'Commerce',
  content: 'Exam content',
};

export default function TeamPage() {
  const q = useTeam();
  const columns: Column<TeamMember>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (m) => (
        <div className="flex items-center gap-3">
          <Avatar name={m.name} initials={initialsFromName(m.name)} size="sm" />
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium">
              {m.name} {m.isYou && <Badge variant="outline">You</Badge>}
            </p>
            <a href={`mailto:${m.email}`} className="text-[12px] text-muted-foreground hover:text-foreground">
              {m.email}
            </a>
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', cell: (m) => <PlatformRoleBadge role={m.platformRole} /> },
    { key: 'status', header: 'Status', cell: (m) => <Badge variant={m.status === 'ACTIVE' ? 'success' : 'secondary'}>{m.status === 'ACTIVE' ? 'Active' : m.status.toLowerCase()}</Badge> },
    { key: 'login', header: 'Last sign-in', cell: (m) => <span className="text-muted-foreground">{m.lastLoginAt ? formatRelative(m.lastLoginAt) : 'Never'}</span> },
  ];
  const roles = Object.keys(PLATFORM_ROLE_LABEL) as (keyof typeof PLATFORM_ROLE_LABEL)[];
  const areas = Object.keys(PLATFORM_AREAS) as PlatformArea[];

  return (
    <Page>
      <PageHeader eyebrow="Platform" title="Team" description="The people who run AI School OS and what each role can open." />
      <div className="space-y-5">
        <Card className="overflow-hidden">
          <DataTable
            columns={columns}
            rows={q.data}
            rowKey={(m) => m.id}
            loading={q.isLoading}
            error={q.error}
            onRetry={() => void q.refetch()}
            renderMobile={(m) => (
              <div className="flex items-center gap-3">
                <Avatar name={m.name} initials={initialsFromName(m.name)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{m.name}</p>
                  <p className="truncate text-[12px] text-muted-foreground">{m.email}</p>
                </div>
                <PlatformRoleBadge role={m.platformRole} />
              </div>
            )}
            empty={{ icon: Users2, title: 'No platform staff', description: 'Platform roles are set on user accounts by a super admin.' }}
          />
        </Card>
        <Section title="Console access by role" description="Areas each platform role can open" flush>
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Role</th>
                  {areas.map((a) => (
                    <th key={a} className="px-2 py-2.5 text-center font-medium">
                      {AREA_LABEL[a]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5">
                      <PlatformRoleBadge role={r} />
                    </td>
                    {areas.map((a) => {
                      const ok = (PLATFORM_AREAS[a] as readonly string[]).includes(r);
                      return (
                        <td key={a} className="px-2 py-2.5 text-center">
                          <span className={cn('inline-block size-2 rounded-full', ok ? 'bg-success' : 'bg-border-strong')} aria-label={ok ? 'Yes' : 'No'} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </Page>
  );
}
