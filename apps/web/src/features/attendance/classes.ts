import { useMemo } from 'react';
import { useMe } from '@/lib/auth-store';
import { useStructure } from '../academics/api';
import { useAttendanceToday } from './api';

export interface ClassOption {
  id: string;
  label: string;
  teacher: string | null;
}

/**
 * Class arms for pickers, plus the one the signed-in user leads (if any).
 * Uses the academic structure when readable, else today's attendance summary
 * (which every attendance reader can see).
 */
export function useClassOptions(): { options: ClassOption[]; mine: string | undefined; loading: boolean } {
  const me = useMe();
  const structure = useStructure();
  const today = useAttendanceToday(undefined, !structure.data && !structure.isLoading);

  return useMemo(() => {
    // The class teacher's sign-in account is matched by id, never by name.
    const userId = me?.user.id;

    if (structure.data) {
      const options: ClassOption[] = [...structure.data.classLevels]
        .sort((a, b) => a.order - b.order)
        .flatMap((l) =>
          l.arms.map((a) => ({
            id: a.id,
            label: `${l.name} ${a.name}`,
            teacher: a.classTeacher ? `${a.classTeacher.firstName} ${a.classTeacher.lastName}` : null,
          })),
        );
      const mine = structure.data.classLevels
        .flatMap((l) => l.arms)
        .find((a) => userId && a.classTeacher?.userId === userId)?.id;
      return { options, mine, loading: false };
    }
    const options: ClassOption[] = (today.data?.classes ?? []).map((c) => ({
      id: c.classArm.id,
      label: `${c.classArm.levelName} ${c.classArm.name}`,
      teacher: c.classTeacher,
    }));
    const mine = (today.data?.classes ?? []).find((c) => userId && c.classTeacherUserId === userId)?.classArm.id;
    return { options, mine, loading: structure.isLoading || today.isLoading };
  }, [me, structure.data, structure.isLoading, today.data, today.isLoading]);
}
