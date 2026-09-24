import { LogOut, Moon, Settings, Sun, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useSignOut } from '@/features/auth/session';
import { useMe } from '@/lib/auth-store';
import { useThemeStore } from '@/lib/theme';
import { initials, titleCase } from '@/lib/utils';
import { Avatar } from '../ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export function UserMenu() {
  const me = useMe();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const resolved = useThemeStore((s) => s.resolved);
  const toggleTheme = useThemeStore((s) => s.toggle);
  if (!me) return null;
  const { user } = me;
  const name = `${user.firstName} ${user.lastName}`;
  const roleNames = me.roles.map((r) => r.name);
  if (user.platformRole) roleNames.unshift(titleCase(user.platformRole));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`Account menu for ${name}`}
      >
        <Avatar name={name} initials={initials(user.firstName, user.lastName)} src={user.avatarUrl} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="flex items-center gap-3 px-2.5 py-2">
          <Avatar name={name} initials={initials(user.firstName, user.lastName)} src={user.avatarUrl} size="md" />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold">{name}</p>
            <p className="truncate text-[12px] text-muted-foreground">{user.email}</p>
          </div>
        </div>
        {roleNames.length > 0 && (
          <div className="flex flex-wrap gap-1 px-2.5 pb-2">
            {roleNames.map((r) => (
              <span key={r} className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
                {r}
              </span>
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        {me.tenant && (
          <DropdownMenuItem onSelect={() => navigate('/settings')}>
            <Settings /> School settings
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => navigate('/settings/users')} disabled={!me.permissions.includes('users.read')}>
          <UserRound /> Users & roles
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            toggleTheme();
          }}
        >
          {resolved === 'dark' ? <Sun /> : <Moon />} {resolved === 'dark' ? 'Light theme' : 'Dark theme'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
