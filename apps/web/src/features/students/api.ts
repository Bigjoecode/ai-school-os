import type { Paginated, StudentInput, StudentRow } from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk, queryClient } from '@/lib/query-client';

export type StudentDetail = StudentRow & { address: string | null; medicalNotes: string | null; middleName: string | null };

export interface StudentListParams {
  q?: string;
  page: number;
  pageSize: number;
  classArmId?: string;
  status?: string;
}

export function useStudents(params: StudentListParams, enabled = true) {
  return useQuery({
    queryKey: qk.students(params),
    queryFn: ({ signal }) => api.get<Paginated<StudentRow>>('/students', { ...params }, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useStudent(id: string | null) {
  return useQuery({
    queryKey: qk.student(id ?? ''),
    queryFn: ({ signal }) => api.get<StudentDetail>(`/students/${id}`, undefined, signal),
    enabled: !!id,
  });
}

const invalidate = (id?: string) => {
  void queryClient.invalidateQueries({ queryKey: qk.students() });
  void queryClient.invalidateQueries({ queryKey: qk.overview });
  void queryClient.invalidateQueries({ queryKey: qk.structure });
  if (id) void queryClient.invalidateQueries({ queryKey: qk.student(id) });
};

export function useCreateStudent() {
  return useMutation({
    mutationFn: (input: StudentInput) => api.post<StudentRow>('/students', input),
    meta: { silent: true },
    onSuccess: () => invalidate(),
  });
}

export function useUpdateStudent(id: string) {
  return useMutation({
    mutationFn: (input: Partial<StudentInput>) => api.patch<StudentRow>(`/students/${id}`, input),
    meta: { silent: true },
    onSuccess: () => invalidate(id),
  });
}
