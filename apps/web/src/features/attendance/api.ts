import type {
  AbsenceMessage,
  AttendanceSettings,
  CheckInResult,
  ClassAttendanceReport,
  KioskToken,
  MyAttendanceToday,
  RegisterView,
  SaveRegisterInput,
  SaveStaffAttendanceInput,
  SchoolAttendanceReport,
  StaffAttendanceDay,
  StudentAttendanceView,
  TodayAttendance,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, errorMessage, refreshSession, request } from '@/lib/api';
import { useAuthStore, useCan } from '@/lib/auth-store';
import { qk, queryClient } from '@/lib/query-client';

/** Friendly copy for AI failures — a 503 means no provider is configured. */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 503) return 'AI isn’t connected yet — add an API key on the server to use this.';
  return errorMessage(err);
}

export interface AiText {
  text: string;
  provider: string;
  model: string;
}

/** Everything that depends on registers — refreshed after any save. */
function invalidateAttendance() {
  void queryClient.invalidateQueries({ queryKey: qk.attendance });
  void queryClient.invalidateQueries({ queryKey: qk.overview });
}

// ------------------------------------------------------------------ settings

export function useAttendanceSettings(enabled = true) {
  const can = useCan('attendance.read');
  return useQuery({
    queryKey: qk.attendanceSettings,
    queryFn: ({ signal }) => api.get<AttendanceSettings>('/attendance/settings', undefined, signal),
    enabled: enabled && can,
    staleTime: 5 * 60_000,
  });
}

export function useSaveAttendanceSettings() {
  return useMutation({
    mutationFn: (input: AttendanceSettings) => api.put<AttendanceSettings>('/attendance/settings', input),
    onSuccess: (s) => {
      queryClient.setQueryData(qk.attendanceSettings, s);
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'staff'] });
      toast.success('Attendance settings saved');
    },
  });
}

// ------------------------------------------------------------------ students

export function useAttendanceToday(date?: string, enabled = true) {
  const can = useCan('attendance.read');
  return useQuery({
    queryKey: qk.attendanceToday(date),
    queryFn: ({ signal }) => api.get<TodayAttendance>('/attendance/today', { date }, signal),
    enabled: enabled && can,
    placeholderData: keepPreviousData,
    refetchInterval: date ? false : 2 * 60_000,
  });
}

export function useRegister(classArmId: string | undefined, date?: string) {
  return useQuery({
    queryKey: qk.attendanceRegister(classArmId ?? '', date),
    queryFn: ({ signal }) => api.get<RegisterView>('/attendance/register', { classArmId, date }, signal),
    enabled: !!classArmId,
    staleTime: 10_000,
  });
}

export function useSaveRegister() {
  return useMutation({
    mutationFn: (input: SaveRegisterInput) => api.put<RegisterView>('/attendance/register', input),
    meta: { silent: true },
    onSuccess: (view, input) => {
      // The open register may be keyed by "today" (no date) — update whichever query shows this day.
      queryClient.setQueriesData<RegisterView>({ queryKey: ['attendance', 'register', input.classArmId] }, (old) =>
        old && old.date === view.date ? view : old,
      );
      queryClient.setQueryData(qk.attendanceRegister(input.classArmId, input.date), view);
      invalidateAttendance();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useStudentAttendance(id: string | undefined | null, termId?: string, enabled = true) {
  const can = useCan('attendance.read');
  return useQuery({
    queryKey: qk.attendanceStudent(id ?? '', termId),
    queryFn: ({ signal }) => api.get<StudentAttendanceView>(`/attendance/students/${id}`, { termId }, signal),
    enabled: enabled && can && !!id,
  });
}

export function useClassReport(classArmId: string | undefined, termId?: string) {
  return useQuery({
    queryKey: qk.attendanceClassReport(classArmId ?? '', termId),
    queryFn: ({ signal }) => api.get<ClassAttendanceReport>('/attendance/reports/class', { classArmId, termId }, signal),
    enabled: !!classArmId,
    placeholderData: keepPreviousData,
  });
}

export function useSchoolReport(termId?: string, enabled = true) {
  return useQuery({
    queryKey: qk.attendanceSchoolReport(termId),
    queryFn: ({ signal }) => api.get<SchoolAttendanceReport>('/attendance/reports/school', { termId }, signal),
    enabled,
    placeholderData: keepPreviousData,
  });
}

// ------------------------------------------------------------------ staff

export function useStaffAttendance(date?: string, enabled = true) {
  const can = useCan('attendance.manage');
  return useQuery({
    queryKey: qk.attendanceStaff(date),
    queryFn: ({ signal }) => api.get<StaffAttendanceDay>('/attendance/staff', { date }, signal),
    enabled: enabled && can,
    placeholderData: keepPreviousData,
  });
}

export function useSaveStaffAttendance() {
  return useMutation({
    mutationFn: (input: SaveStaffAttendanceInput) => api.put<StaffAttendanceDay>('/attendance/staff', input),
    onSuccess: (day, input) => {
      queryClient.setQueriesData<StaffAttendanceDay>({ queryKey: ['attendance', 'staff'] }, (old) => (old && old.date === day.date ? day : old));
      invalidateAttendance();
      toast.success(`Saved ${input.marks.length} ${input.marks.length === 1 ? 'change' : 'changes'}`);
    },
  });
}

// ------------------------------------------------------------------ kiosk & check-in

export function useKiosk() {
  return useQuery({
    queryKey: qk.attendanceKiosk,
    queryFn: ({ signal }) => api.get<KioskToken>('/attendance/kiosk', undefined, signal),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: 3,
  });
}

export function useMyAttendance(enabled = true) {
  return useQuery({
    queryKey: qk.attendanceMe,
    queryFn: ({ signal }) => api.get<MyAttendanceToday>('/attendance/me', undefined, signal),
    enabled,
    staleTime: 15_000,
  });
}

/**
 * Check in with a kiosk code. A 401 here usually means the *code* expired, so
 * we skip the client's refresh-then-sign-out dance: refresh once ourselves,
 * retry, and only then treat a 401 as an expired code.
 */
export async function checkIn(token: string): Promise<CheckInResult> {
  const send = () => request<CheckInResult>('/attendance/check-in', { method: 'POST', body: { token }, noRefresh: true });
  try {
    return await send();
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    const session = await refreshSession();
    if (!session) {
      useAuthStore.getState().clear();
      throw err;
    }
    return send();
  }
}

// ------------------------------------------------------------------ AI

export function useAttendanceInsight() {
  return useMutation({
    mutationFn: (termId?: string) => api.post<AiText>('/attendance/insight', { termId }),
    meta: { silent: true },
    onError: (err) => toast.error(aiErrorMessage(err)),
  });
}

export function useAbsenceMessage() {
  return useMutation({
    mutationFn: (input: { studentId: string; termId?: string }) => api.post<AbsenceMessage>('/attendance/absence-message', input),
    meta: { silent: true },
    onError: (err) => toast.error(aiErrorMessage(err)),
  });
}
