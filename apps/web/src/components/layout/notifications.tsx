import { Bell, BellOff } from 'lucide-react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

export function Notifications() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-[13.5px] font-semibold">Notifications</p>
          <span className="text-[11.5px] text-muted-foreground">All caught up</span>
        </div>
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <div className="grid size-11 place-items-center rounded-xl border border-border bg-muted/50">
            <BellOff className="size-5 text-muted-foreground" />
          </div>
          <p className="text-[13.5px] font-medium">No notifications yet</p>
          <p className="text-[12.5px] text-muted-foreground">
            Approvals, AI alerts and parent messages will show up here as modules come online.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
