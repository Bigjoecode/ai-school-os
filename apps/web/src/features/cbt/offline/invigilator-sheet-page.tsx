import { formatStartCode } from '@aischool/shared';
import { ArrowLeft, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { useInvigilatorSheet } from './api';

/** Printable: the start code and instructions for the invigilator, then cut-out PIN slips for exam devices. */
export default function InvigilatorSheetPage() {
  const { id = '' } = useParams();
  const q = useInvigilatorSheet(id);
  useDocumentTitle(q.data ? `Invigilator sheet · ${q.data.exam.title}` : 'Invigilator sheet');
  if (q.error && !q.data) {
    return (
      <Page>
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      </Page>
    );
  }
  if (!q.data) {
    return (
      <Page>
        <Skeleton className="h-96 rounded-2xl" />
      </Page>
    );
  }
  const s = q.data;
  return (
    <Page className="max-w-4xl print:max-w-none print:p-0">
      <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
        <Link to={`/online-exams/${id}?tab=offline`} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back to the exam
        </Link>
        <Button onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </div>
      <p className="mb-4 rounded-xl bg-warning-soft px-4 py-3 text-[13px] text-warning print:hidden">Keep this sheet with the invigilator. Anyone with the code and a PIN slip can open the exam on a downloaded device.</p>
      <article className="rounded-2xl border border-border bg-white p-6 text-[#1b2440] sm:p-10 print:rounded-none print:border-0 print:p-0">
        <p className="text-[12px] uppercase tracking-wider text-[#4b556b]">{s.schoolName} · Offline exam · Invigilator sheet</p>
        <h1 className="mt-1 text-2xl font-semibold">{s.exam.title}</h1>
        <p className="mt-1 text-[14px] text-[#4b556b]">
          {s.exam.subject} · {s.exam.classLevel} · {s.exam.questionCount} questions · {s.exam.totalMarks} marks · {s.exam.durationMinutes} minutes
        </p>
        <div className="mt-6 rounded-xl border-2 border-[#1b2440] p-5 text-center">
          <p className="text-[12px] uppercase tracking-wider">Start code (version {s.version})</p>
          <p className="mt-1 font-mono text-4xl font-bold tracking-[0.2em]">{formatStartCode(s.code)}</p>
        </div>
        <h2 className="mt-6 text-[15px] font-semibold">Before exam day</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13.5px]">
          <li>On the day before, while online: students open Exams and tap “Download for offline” (own phone or laptop), or a teacher opens this exam › Offline › “Prepare this device” on each shared school device.</li>
          <li>Check each device lists the exam under “Offline exams”. Charge every device fully and bring chargers or power banks.</li>
          <li>If the start code is changed, every device must download the exam again.</li>
        </ol>
        <h2 className="mt-5 text-[15px] font-semibold">In the exam hall (no internet needed)</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13.5px]">
          <li>Each student opens the app › Offline exams › the exam. The app opens without internet once it has been used on that device.</li>
          <li>When the exam starts, type the start code above on each device (or read it out). Don’t write it on the board before the start.</li>
          <li>On a shared exam device each student then signs in with their admission number and the exam PIN from their slip below.</li>
          <li>The timer runs on the device. Answers save on the device after every change and are handed in automatically at zero. Don’t let anyone change the device’s date or time — it is recorded.</li>
          <li>On a shared device, after a student hands in, tap “Next student”.</li>
        </ol>
        <h2 className="mt-5 text-[15px] font-semibold">After the exam</h2>
        <p className="mt-2 text-[13.5px]">
          Connect each device to the internet and open the app (staff devices: sign in) — answers send automatically, or tap “Sync now” in Offline exams. Do it before {s.syncBy ? formatDateTime(s.syncBy) : 'the sync-by time'}. Don’t clear the browser’s data or uninstall the app until every device shows “Sent”. Check the exam’s Offline tab: every student should show “Synced”.
        </p>

        <h2 className="mt-8 text-[15px] font-semibold print:break-before-page">Exam PIN slips (for shared exam devices)</h2>
        <p className="mt-1 text-[12.5px] text-[#4b556b]">Cut along the lines and give each student their own slip at the start. Students on their own signed-in device don’t need one.</p>
        <div className="mt-3 grid grid-cols-2 gap-0 sm:grid-cols-3 print:grid-cols-3">
          {s.seats.map((x) => (
            <div key={x.admissionNumber} className="break-inside-avoid border border-dashed border-[#9aa3b5] p-3 text-[12.5px]">
              <p className="font-semibold">{x.name}</p>
              <p className="text-[#4b556b]">
                {x.admissionNumber}
                {x.classArm ? ` · ${x.classArm}` : ''}
              </p>
              <p className="mt-1 font-mono text-lg font-bold tracking-[0.25em]">{x.pin}</p>
              <p className="text-[10.5px] text-[#4b556b]">{s.exam.title}</p>
            </div>
          ))}
        </div>
      </article>
    </Page>
  );
}
