import type { FirstWeekAction, FirstWeekPlan, ImportKind, ImportPreview, ImportRequest, ImportResult, ParentInviteInput, ParentInvitePreview, ParentInviteResult, Permission, SetupStatus, SetupYearInput, StageKey } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { hasPermission, useAuthStore, useCan } from '@/lib/auth-store';
import { qk, queryClient } from '@/lib/query-client';

// ------------------------------------------------------------------ setup

export function useSetupStatus(enabled = true) {
  const can = useCan('school.read');
  return useQuery({
    queryKey: qk.setup,
    queryFn: ({ signal }) => api.get<SetupStatus>('/setup', undefined, signal),
    enabled: enabled && can,
    staleTime: 60_000,
  });
}

/** Setup and imports change the structure, counts and dashboard; refresh them all. */
function refreshAfterSetup(status?: SetupStatus) {
  if (status) queryClient.setQueryData(qk.setup, status);
  else void queryClient.invalidateQueries({ queryKey: qk.setup });
  for (const key of [qk.structure, qk.overview, qk.students(), qk.staff(), qk.guardians()]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

export function useSetupYear() {
  return useMutation({
    mutationFn: (input: SetupYearInput) => api.post<SetupStatus>('/setup/year', input),
    meta: { silent: true },
    onSuccess: (status) => refreshAfterSetup(status),
  });
}

export interface SetupClassesResult {
  createdLevels: number;
  createdArms: number;
  status: SetupStatus;
}
export function useSetupClasses() {
  return useMutation({
    mutationFn: (input: { stages: StageKey[]; arms: string[]; capacity: number }) => api.post<SetupClassesResult>('/setup/classes', input),
    meta: { silent: true },
    onSuccess: (r) => refreshAfterSetup(r.status),
  });
}

export interface SetupSubjectsResult {
  createdSubjects: number;
  linked: number;
  status: SetupStatus;
}
export function useSetupSubjects() {
  return useMutation({
    mutationFn: (input: { selections: { stage: StageKey; codes: string[] }[] }) => api.post<SetupSubjectsResult>('/setup/subjects', input),
    meta: { silent: true },
    onSuccess: (r) => refreshAfterSetup(r.status),
  });
}

// ------------------------------------------------------------------ imports

/** Permissions each import needs (mirrors the API), plus users.manage to create logins. */
export const IMPORT_NEEDS: Record<ImportKind, Permission[]> = {
  STUDENTS: ['students.manage', 'guardians.manage'],
  STAFF: ['staff.manage'],
  // The API only asks for results.enter, but a whole-school results upload is an exam-office job,
  // so the screen is offered to people who can also publish results (not every subject teacher).
  RESULTS: ['results.enter', 'results.publish'],
};

export function useImportKinds(): ImportKind[] {
  const me = useAuthStore((s) => s.me);
  return useMemo(() => (['STUDENTS', 'STAFF', 'RESULTS'] as const).filter((k) => IMPORT_NEEDS[k].every((p) => hasPermission(me, p))), [me]);
}

export function usePreviewImport() {
  return useMutation({
    mutationFn: (req: ImportRequest) => api.post<ImportPreview>('/imports/preview', req),
    meta: { silent: true },
  });
}

export function useCommitImport() {
  return useMutation({
    mutationFn: (req: ImportRequest) => api.post<ImportResult>('/imports/commit', req),
    meta: { silent: true },
    onSuccess: () => refreshAfterSetup(),
  });
}

/** Saves text as a file in the browser. A BOM makes Excel read it as UTF-8. */
export function saveTextFile(text: string, filename: string, type = 'text/csv;charset=utf-8') {
  const body = type.startsWith('text/csv') && !text.startsWith('﻿') ? `﻿${text}` : text;
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const TEMPLATE_FILENAMES: Record<ImportKind, string> = {
  STUDENTS: 'students-and-parents-template.csv',
  STAFF: 'staff-template.csv',
  RESULTS: 'past-results-template.csv',
};

export async function downloadTemplate(kind: ImportKind) {
  const csv = await api.text(`/imports/templates/${kind}`);
  saveTextFile(csv, TEMPLATE_FILENAMES[kind]);
}

/** Turns API failures into sentences an office administrator can act on. */
export function importErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return `${error.message.replace(/\s*\(([a-z.,\s]+)\)$/, '')}. Ask the school's owner or an administrator to give your role the right permission, or switch off the login option.`;
    }
    if (error.status === 413) return 'This file is too large to send in one go. Split it into smaller files (for example, one per class) and import them one after another.';
    if (error.status === 429) return 'Too many tries in a short time. Wait a minute, then try again.';
    if (error.status === 400 && error.errors.length) return error.errors.map((e) => e.message).join('. ');
  }
  return errorMessage(error);
}

// ------------------------------------------------------------------ your first week

export const firstWeekKey = ['onboarding', 'first-week'] as const;

/** Principals and admins: school.manage or academics.manage (mirrors the API). */
export function useCanRunFirstWeek() {
  const me = useAuthStore((s) => s.me);
  return hasPermission(me, 'school.manage') || hasPermission(me, 'academics.manage');
}

export function useFirstWeek(enabled = true) {
  const can = useCanRunFirstWeek();
  return useQuery({
    queryKey: firstWeekKey,
    queryFn: ({ signal }) => api.get<FirstWeekPlan>('/onboarding/first-week', undefined, signal),
    enabled: enabled && can,
    staleTime: 60_000,
  });
}

export function useFirstWeekAction() {
  return useMutation({
    mutationFn: (body: FirstWeekAction) => api.post<FirstWeekPlan>('/onboarding/first-week', body),
    onSuccess: (plan) => queryClient.setQueryData(firstWeekKey, plan),
  });
}

export function useParentInvitePreview(enabled: boolean) {
  return useQuery({
    queryKey: ['onboarding', 'parent-invites'],
    queryFn: ({ signal }) => api.get<ParentInvitePreview>('/onboarding/parent-invites', undefined, signal),
    enabled,
  });
}

export function useSendParentInvites() {
  return useMutation({
    mutationFn: (body: ParentInviteInput) => api.post<ParentInviteResult>('/onboarding/parent-invites', body),
    meta: { silent: true },
    onSuccess: () => {
      for (const key of [firstWeekKey, ['onboarding', 'parent-invites'], qk.guardians()]) void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
