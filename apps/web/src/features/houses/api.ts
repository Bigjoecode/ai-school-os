import type {
  HouseAllocateInput,
  HouseAllocateResult,
  HouseDetail,
  HouseInput,
  HouseList,
  HousePeriod,
  HousePointInput,
  HousePointRow,
  HouseRow,
  HouseSettings,
  HouseStandings,
  Paginated,
  PortalHouse,
  StudentHouseView,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/query-client';

export const hk = {
  all: ['houses'] as const,
  list: ['houses', 'list'] as const,
  standings: (p: object) => ['houses', 'standings', p] as const,
  detail: (id: string, p: object) => ['houses', 'detail', id, p] as const,
  points: (p: object) => ['houses', 'points', p] as const,
  student: (id: string) => ['houses', 'student', id] as const,
  portal: (id: string) => ['houses', 'portal', id] as const,
};

const refresh = () => void queryClient.invalidateQueries({ queryKey: hk.all });

export interface PeriodParams {
  period: HousePeriod;
  from?: string;
  to?: string;
}

export function useHouses(enabled = true) {
  return useQuery({ queryKey: hk.list, queryFn: ({ signal }) => api.get<HouseList>('/houses', undefined, signal), enabled });
}

export function useStandings(p: PeriodParams, opts: { refetchInterval?: number; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: hk.standings(p),
    queryFn: ({ signal }) => api.get<HouseStandings>('/houses/standings', { ...p }, signal),
    placeholderData: keepPreviousData,
    refetchInterval: opts.refetchInterval,
    enabled: opts.enabled ?? true,
  });
}

export function useHouseDetail(id: string | null, p: PeriodParams) {
  return useQuery({ queryKey: hk.detail(id ?? '', p), queryFn: ({ signal }) => api.get<HouseDetail>(`/houses/${id}`, { ...p }, signal), enabled: !!id });
}

export function usePointsLog(p: { page: number; pageSize: number; houseId?: string; category?: string }) {
  return useQuery({
    queryKey: hk.points(p),
    queryFn: ({ signal }) => api.get<Paginated<HousePointRow>>('/houses/points', { ...p }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useSaveHouse(id?: string) {
  return useMutation({
    mutationFn: (input: HouseInput) => (id ? api.patch<HouseRow>(`/houses/${id}`, input) : api.post<HouseRow>('/houses', input)),
    meta: { silent: true },
    onSuccess: refresh,
  });
}

export function useDeleteHouse() {
  return useMutation({ mutationFn: (id: string) => api.delete<{ ok: true; released: number }>(`/houses/${id}`), onSuccess: refresh });
}

export function useHouseSettings() {
  return useMutation({ mutationFn: (s: HouseSettings) => api.put<HouseSettings>('/houses/settings', s), onSuccess: refresh });
}

export function useAllocate() {
  return useMutation({ mutationFn: (input: HouseAllocateInput) => api.post<HouseAllocateResult>('/houses/allocate', input), meta: { silent: true }, onSuccess: refresh });
}

export function useAwardPoints() {
  return useMutation({
    mutationFn: (input: HousePointInput) => api.post<{ entries: HousePointRow[]; notice: string | null }>('/houses/points', input),
    meta: { silent: true },
    onSuccess: refresh,
  });
}

export function useDeletePoints() {
  return useMutation({ mutationFn: (id: string) => api.delete<{ ok: true }>(`/houses/points/${id}`), onSuccess: refresh });
}

export function useStudentHouse(studentId: string | null) {
  return useQuery({ queryKey: hk.student(studentId ?? ''), queryFn: ({ signal }) => api.get<StudentHouseView>(`/houses/students/${studentId}`, undefined, signal), enabled: !!studentId });
}

export function useSetStudentHouse(studentId: string) {
  return useMutation({ mutationFn: (houseId: string | null) => api.put<StudentHouseView>(`/houses/students/${studentId}`, { houseId }), onSuccess: refresh });
}

export function usePortalHouse(studentId: string) {
  return useQuery({ queryKey: hk.portal(studentId), queryFn: ({ signal }) => api.get<PortalHouse>(`/portal/students/${studentId}/house`, undefined, signal) });
}
