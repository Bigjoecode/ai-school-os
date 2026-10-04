import { Smartphone } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { promptInstall, useCanInstall } from './store';

/** "Install the app" in the account menu — hidden once installed or where the browser can't. */
export function InstallMenuItem() {
  const canInstall = useCanInstall();
  if (!canInstall) return null;
  return (
    <DropdownMenuItem onSelect={() => void promptInstall()}>
      <Smartphone /> Install the app
    </DropdownMenuItem>
  );
}
