import type { ClassBirthdays, ClassWishesInput, ClassWishesResult, MyBirthday, UpcomingBirthdays } from '@aischool/shared';
import { useMutation, useQuery, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';
import { saveTextFile } from '../onboarding/api';

export const bk = {
  all: ['birthdays'] as const,
  mine: (preview: boolean) => ['birthdays', 'me', preview] as const,
  classes: ['birthdays', 'my-classes'] as const,
  upcoming: (p: object) => ['birthdays', 'upcoming', p] as const,
};

/** The signed-in student's birthday card (students only). */
export function useMyBirthday(preview = false, enabled = true) {
  const can = useCan('learning.use') && enabled;
  return useQuery({
    queryKey: bk.mine(preview),
    queryFn: ({ signal }) => api.get<MyBirthday>('/birthdays/me', preview ? { preview: '1' } : undefined, signal),
    enabled: can,
    staleTime: 5 * 60_000,
    retry: false,
    meta: { silent: true },
  });
}

/** Birthdays in the classes the signed-in teacher leads or teaches. */
export function useClassBirthdays() {
  const can = useCan('school.read');
  return useQuery({
    queryKey: bk.classes,
    queryFn: ({ signal }) => api.get<ClassBirthdays>('/birthdays/my-classes', undefined, signal),
    enabled: can,
    staleTime: 5 * 60_000,
    meta: { silent: true },
  });
}

export function useSendClassWishes() {
  return useMutation({
    mutationFn: (body: ClassWishesInput) => api.post<ClassWishesResult>('/birthdays/class-wishes', body),
    onSuccess: (r) => {
      toast.success('Class wishes posted', { description: `${r.title} is on the class noticeboard.` });
      void queryClient.invalidateQueries({ queryKey: bk.classes });
      void queryClient.invalidateQueries({ queryKey: ['community'] });
    },
  });
}

export function useUpcomingBirthdays(p: { days: number; classArmId?: string }) {
  const can = useCan('comms.manage');
  return useQuery({
    queryKey: bk.upcoming(p),
    queryFn: ({ signal }) => api.get<UpcomingBirthdays>('/birthdays/upcoming', { days: p.days, classArmId: p.classArmId }, signal),
    enabled: can,
    placeholderData: keepPreviousData,
  });
}

export async function downloadBirthdaysCsv(p: { days: number; classArmId?: string }) {
  const qs = new URLSearchParams({ days: String(p.days), ...(p.classArmId ? { classArmId: p.classArmId } : {}) }).toString();
  const csv = await api.text(`/birthdays/upcoming.csv?${qs}`);
  saveTextFile(csv, `birthdays-${new Date().toISOString().slice(0, 10)}.csv`);
}
