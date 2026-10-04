import type { AcademicStructure, SubjectClasses, SubjectInput } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { qk, queryClient } from '@/lib/query-client';

export function useStructure(enabled = true) {
  const can = useCan('academics.read');
  return useQuery({
    queryKey: qk.structure,
    queryFn: ({ signal }) => api.get<AcademicStructure>('/academics/structure', undefined, signal),
    enabled: enabled && can,
    staleTime: 60_000,
  });
}

export type ArmOption = { id: string; label: string; levelName: string };

/** Flattened class arms, e.g. "JSS 1 A", for selects. */
export function armOptions(structure: AcademicStructure | undefined): ArmOption[] {
  if (!structure) return [];
  return [...structure.classLevels]
    .sort((a, b) => a.order - b.order)
    .flatMap((l) => l.arms.map((a) => ({ id: a.id, label: `${l.name} ${a.name}`, levelName: l.name })));
}

export type AcademicResource = 'sessions' | 'terms' | 'class-levels' | 'class-arms' | 'subjects' | 'branches';

const invalidate = () => {
  void queryClient.invalidateQueries({ queryKey: qk.structure });
  void queryClient.invalidateQueries({ queryKey: qk.overview });
};

export function useCreateAcademic<TInput>(resource: AcademicResource, successMessage: string) {
  return useMutation({
    mutationFn: (input: TInput) => api.post<unknown>(`/academics/${resource}`, input),
    meta: { silent: true },
    onSuccess: () => {
      invalidate();
      toast.success(successMessage);
    },
  });
}

export function useDeleteAcademic(resource: AcademicResource) {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/academics/${resource}/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success('Deleted');
    },
  });
}

export function useMakeCurrent(resource: 'sessions' | 'terms') {
  return useMutation({
    mutationFn: (id: string) => api.patch<unknown>(`/academics/${resource}/${id}/current`),
    onSuccess: () => {
      invalidate();
      toast.success(resource === 'sessions' ? 'Current session updated' : 'Current term updated');
    },
  });
}

// ------------------------------------------------------------------ subjects

export function useUpdateSubject() {
  return useMutation({
    mutationFn: ({ id, ...input }: Omit<Partial<SubjectInput>, 'category'> & { id: string; category?: string | null }) => api.patch<unknown>(`/academics/subjects/${id}`, input),
    meta: { silent: true },
    onSuccess: () => {
      invalidate();
      toast.success('Subject updated');
    },
  });
}

const subjectClassesKey = (id: string) => ['academics', 'subject-classes', id] as const;

/** Which classes take a subject, and who teaches it in each. */
export function useSubjectClasses(id: string | undefined) {
  const can = useCan('academics.read');
  return useQuery({
    queryKey: subjectClassesKey(id ?? ''),
    queryFn: ({ signal }) => api.get<SubjectClasses>(`/academics/subjects/${id}/classes`, undefined, signal),
    enabled: !!id && can,
  });
}

/** Sets the exact set of classes (unticked = unlinked) and their teachers. */
export function useSetSubjectClasses(id: string) {
  return useMutation({
    mutationFn: (assignments: { classArmId: string; teacherId: string | null }[]) =>
      api.put<SubjectClasses>(`/academics/subjects/${id}/classes`, { assignments }),
    meta: { silent: true },
    onSuccess: (data) => {
      queryClient.setQueryData(subjectClassesKey(id), data);
      invalidate();
      // Score sheets, timetables and staff workloads read these links.
      void queryClient.invalidateQueries({ queryKey: qk.timetableSetup });
    },
  });
}
