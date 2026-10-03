import type { ImportKind } from '@aischool/shared';
import { Briefcase, GraduationCap, Trophy } from 'lucide-react';

export const KIND_META: Record<ImportKind, { tab: string; icon: typeof GraduationCap; noun: [string, string]; intro: string }> = {
  STUDENTS: {
    tab: 'Students & parents',
    icon: GraduationCap,
    noun: ['student', 'students'],
    intro: 'One row per student. Put the parent’s name and phone on the same row — brothers and sisters who share a parent phone number are linked to one parent record.',
  },
  STAFF: {
    tab: 'Staff',
    icon: Briefcase,
    noun: ['staff member', 'staff'],
    intro: 'One row per member of staff, teaching and non-teaching. Departments that don’t exist yet are created for you.',
  },
  RESULTS: {
    tab: 'Past results',
    icon: Trophy,
    noun: ['result row', 'result rows'],
    intro: 'One row per student per subject, with a column for each part of the score. Students are matched by admission number, so import students first.',
  },
};

export interface LoadedFile {
  name: string;
  size: number;
  text: string;
  rows: number;
}
