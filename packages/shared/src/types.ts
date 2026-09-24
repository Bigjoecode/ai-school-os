import type { Permission } from './permissions';
import type { PlatformRole } from './roles';

/** Shapes returned by the API, used by the web app. */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
}

export interface MeResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    platformRole: PlatformRole | null;
  };
  tenant: (TenantSummary & { currency: string; timezone: string; motto: string | null }) | null;
  roles: { id: string; key: string; name: string }[];
  permissions: Permission[];
  memberships: TenantSummary[];
}

export interface AuthResponse extends MeResponse {
  accessToken: string;
  expiresIn: number;
}

export interface Insight {
  tone: 'good' | 'warning' | 'info';
  title: string;
  detail: string;
  href?: string;
}

export interface OverviewResponse {
  greetingName: string;
  school: { name: string; motto: string | null };
  currentSession: { id: string; name: string } | null;
  currentTerm: { id: string; name: string; endsOn: string; daysLeft: number } | null;
  kpis: {
    students: { total: number; addedThisMonth: number; changePct: number | null };
    staff: { total: number; teaching: number };
    guardians: { total: number; coveragePct: number };
    classes: { arms: number; levels: number; avgClassSize: number; utilisationPct: number | null };
  };
  enrolmentTrend: { month: string; admitted: number; total: number }[];
  byClassLevel: { level: string; students: number; capacity: number | null }[];
  gender: { male: number; female: number };
  insights: Insight[];
  recentActivity: { id: string; summary: string; actor: string | null; at: string }[];
}

export interface StudentRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: 'MALE' | 'FEMALE';
  dateOfBirth: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN' | 'GRADUATED';
  admittedOn: string;
  classArm: { id: string; name: string; classLevel: { id: string; name: string; code: string } } | null;
  guardians: { id: string; firstName: string; lastName: string; phone: string; relationship: string }[];
}

export interface GuardianRow {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phone: string;
  email: string | null;
  occupation: string | null;
  students: { id: string; firstName: string; lastName: string; admissionNumber: string }[];
}

export interface StaffRow {
  id: string;
  staffNumber: string;
  firstName: string;
  lastName: string;
  gender: 'MALE' | 'FEMALE';
  email: string | null;
  phone: string | null;
  jobTitle: string;
  type: 'TEACHING' | 'NON_TEACHING';
  status: string;
  employedOn: string | null;
  classesLed: { id: string; name: string }[];
}

export interface AcademicStructure {
  sessions: {
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
    isCurrent: boolean;
    terms: { id: string; name: string; order: number; startsOn: string; endsOn: string; isCurrent: boolean }[];
  }[];
  classLevels: {
    id: string;
    name: string;
    code: string;
    stage: string | null;
    order: number;
    arms: {
      id: string;
      name: string;
      capacity: number | null;
      studentCount: number;
      classTeacher: { id: string; firstName: string; lastName: string } | null;
    }[];
  }[];
  subjects: { id: string; name: string; code: string; category: string | null; isCore: boolean }[];
  branches: { id: string; name: string; code: string; isMain: boolean }[];
}

export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
}

export interface UserRow {
  membershipId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  lastLoginAt: string | null;
  roles: { id: string; name: string }[];
}

export interface AuditRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  actor: { id: string; name: string; email: string } | null;
  ip: string | null;
  createdAt: string;
}

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  createdAt: string;
  students: number;
  users: number;
  plan: string | null;
}

export interface AiStatus {
  configured: boolean;
  providers: string[];
  monthSpendUsd: number;
  monthBudgetUsd: number | null;
}

export interface AiChatResponse {
  conversationId: string;
  reply: string;
  provider: string;
  model: string;
}
