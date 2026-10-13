import { ClassTimetableView } from '../timetable/class-timetable';
import { PortalShell } from './ui';

/** "Timetable" in My school: the class's published week, with today and what's on now. */
export default function PortalTimetablePage() {
  return (
    <PortalShell
      section="timetable"
      title={({ isParent, child }) => (isParent ? `${child.firstName}’s timetable` : 'My timetable')}
      description={({ isParent, child }) => (isParent ? `${child.firstName}’s class lessons this term, with what’s on now.` : 'Your class lessons this term, with what’s on now and next.')}
    >
      {({ child, isParent, who }) => <ClassTimetableView childId={child.id} who={who} isParent={isParent} />}
    </PortalShell>
  );
}
