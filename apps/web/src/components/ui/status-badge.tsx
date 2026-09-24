import { titleCase } from '@/lib/utils';
import { Badge, type BadgeProps } from './badge';

const MAP: Record<string, BadgeProps['variant']> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  WITHDRAWN: 'secondary',
  GRADUATED: 'info',
  DISABLED: 'danger',
  INVITED: 'info',
  PENDING: 'warning',
  INACTIVE: 'secondary',
  TRIAL: 'brand',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={MAP[status.toUpperCase()] ?? 'secondary'} dot>
      {titleCase(status)}
    </Badge>
  );
}
