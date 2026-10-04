import { formatMoney, type AdmissionStatus } from '@aischool/shared';

export type NoticeKind = 'EXAM' | 'INTERVIEW' | 'OFFER' | 'WAITLISTED' | 'REJECTED' | 'ENROLLED';

export interface NoticeContext {
  school: { name: string; phone: string | null; timezone: string; currency: string };
  parentName: string;
  childFirstName: string;
  childName: string;
  number: string;
  classLevel: string | null;
  entryTerm: string | null;
  examAt: Date | null;
  examVenue: string | null;
  interviewAt: Date | null;
  examInstructions: string | null;
  offerExpiresOn: Date | null;
  offerNote: string | null;
  admissionNumber?: string;
  classArm?: string;
  invoice?: { number: string; totalKobo: number } | null;
}

/** "Tuesday 14 October 2026 at 9:00 am", in the school's time zone. */
export function whenText(at: Date, timezone: string): string {
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(at);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(at).replace(/\s?([ap])\.?m\.?$/i, ' $1m');
  return `${date} at ${time}`;
}

/** A DATE column ("2026-10-20") → "20 October 2026". */
export function dayText(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

const salutation = (parentName: string) => `Dear ${parentName.trim()},`;

/** The message a parent receives at a step of the process: a full version (email) and a short one (SMS). */
export function admissionNotice(kind: NoticeKind, c: NoticeContext): { title: string; subject: string; body: string; sms: string } {
  const s = c.school;
  const call = s.phone ? ` If you have any questions, please call ${s.phone}.` : '';
  const callShort = s.phone ? ` Enquiries: ${s.phone}.` : '';
  const forClass = c.classLevel ? ` for ${c.classLevel}` : '';
  switch (kind) {
    case 'EXAM': {
      const when = c.examAt ? whenText(c.examAt, s.timezone) : 'a date to be confirmed';
      const venue = c.examVenue ? ` at ${c.examVenue}` : '';
      const interview = c.interviewAt ? `\n\nAn interview with the parents is booked for ${whenText(c.interviewAt, s.timezone)}.` : '';
      return {
        title: `Entrance exam: ${c.childName}`,
        subject: `${c.childFirstName}'s entrance examination — ${s.name}`,
        body: `${salutation(c.parentName)}\n\nThank you for applying to ${s.name}${forClass}. ${c.childFirstName}'s entrance examination is scheduled for **${when}**${venue}.${interview}\n\n${c.examInstructions ? `${c.examInstructions} ` : ''}Please bring the application number ${c.number}.${call}\n\nAdmissions Office\n${s.name}`,
        sms: `${s.name}: ${c.childFirstName}'s entrance exam is on ${when}${venue}. ${c.examInstructions ? `${c.examInstructions} ` : ''}Application no. ${c.number}.${callShort}`,
      };
    }
    case 'INTERVIEW': {
      const when = c.interviewAt ? whenText(c.interviewAt, s.timezone) : 'a date to be confirmed';
      return {
        title: `Admission interview: ${c.childName}`,
        subject: `Admission interview for ${c.childFirstName} — ${s.name}`,
        body: `${salutation(c.parentName)}\n\nThank you for applying to ${s.name}${forClass}. We would like to meet you and ${c.childFirstName} for an admission interview on **${when}** at the school.\n\nPlease bring the application number ${c.number}.${call}\n\nAdmissions Office\n${s.name}`,
        sms: `${s.name}: admission interview for ${c.childFirstName} on ${when} at the school. Application no. ${c.number}.${callShort}`,
      };
    }
    case 'OFFER': {
      const by = c.offerExpiresOn ? dayText(c.offerExpiresOn) : null;
      const term = c.entryTerm ? ` from ${c.entryTerm}` : '';
      return {
        title: `Offer of admission: ${c.childName}`,
        subject: `Offer of admission for ${c.childFirstName} — ${s.name}`,
        body: `${salutation(c.parentName)}\n\nCongratulations! ${s.name} is pleased to offer ${c.childName} a place${forClass}${term}.\n\n${c.offerNote ? `${c.offerNote}\n\n` : ''}${by ? `Please accept this offer by **${by}** ` : 'Please accept this offer '}by visiting the school or calling the admissions office, so that we can complete ${c.childFirstName}'s enrolment. Your offer letter is available from the school.${call}\n\nAdmissions Office\n${s.name}`,
        sms: `Congratulations! ${s.name} offers ${c.childFirstName} a place${forClass}${term}. ${by ? `Please accept by ${by}` : 'Please accept'} by visiting or calling the school.${callShort}`,
      };
    }
    case 'WAITLISTED':
      return {
        title: `Waiting list: ${c.childName}`,
        subject: `${c.childFirstName}'s application — ${s.name}`,
        body: `${salutation(c.parentName)}\n\nThank you for applying to ${s.name}${forClass}. ${c.childFirstName} has done well, but the class is currently full, so we have placed ${c.childFirstName} on our waiting list. We will contact you as soon as a place becomes available.${call}\n\nAdmissions Office\n${s.name}`,
        sms: `${s.name}: thank you for applying. ${c.childFirstName} is on our waiting list${forClass}; we will contact you as soon as a place becomes available.${callShort}`,
      };
    case 'REJECTED':
      return {
        title: `Application outcome: ${c.childName}`,
        subject: `${c.childFirstName}'s application — ${s.name}`,
        body: `${salutation(c.parentName)}\n\nThank you for your interest in ${s.name} and for the time you and ${c.childFirstName} gave to the admissions process. After careful consideration, we are unable to offer ${c.childFirstName} a place${forClass} at this time.\n\nWe wish ${c.childFirstName} every success.${call}\n\nAdmissions Office\n${s.name}`,
        sms: `${s.name}: thank you for applying. We are sorry we cannot offer ${c.childFirstName} a place at this time. We wish ${c.childFirstName} every success.${callShort}`,
      };
    case 'ENROLLED': {
      const fees = c.invoice ? ` The first term's fees are ${formatMoney(c.invoice.totalKobo, s.currency)} (invoice ${c.invoice.number}).` : '';
      return {
        title: `Welcome: ${c.childName}`,
        subject: `Welcome to ${s.name}, ${c.childFirstName}!`,
        body: `${salutation(c.parentName)}\n\nWelcome to the ${s.name} family! ${c.childName} is now enrolled in **${c.classArm}** with admission number **${c.admissionNumber}**.${fees}\n\nPlease keep the admission number safe — you will need it for fees, results and the parent portal.${call}\n\nAdmissions Office\n${s.name}`,
        sms: `Welcome to ${s.name}! ${c.childFirstName} is enrolled in ${c.classArm}, admission no. ${c.admissionNumber}.${fees}${callShort}`,
      };
    }
  }
}

/** What the family sees when they check the application's status on the website. */
export function nextSteps(status: AdmissionStatus, c: { childFirstName: string; examAt: Date | null; examVenue: string | null; interviewAt: Date | null; offerExpiresOn: Date | null; timezone: string; feeDue: string | null; examInstructions: string | null }): string {
  const fee = c.feeDue ? ` The application fee of ${c.feeDue} is still due — please pay at the school and keep your receipt.` : '';
  switch (status) {
    case 'SUBMITTED':
      return `We have received the application. The admissions office will contact you to arrange the next step.${fee}`;
    case 'REVIEWING':
      return `The admissions team is reviewing the application and will contact you shortly.${fee}`;
    case 'EXAM_SCHEDULED':
      return `${c.childFirstName} is booked for the entrance examination${c.examAt ? ` on ${whenText(c.examAt, c.timezone)}` : ''}${c.examVenue ? ` at ${c.examVenue}` : ''}.${c.examInstructions ? ` ${c.examInstructions}` : ''}${fee}`;
    case 'INTERVIEW':
      return `An admission interview is booked${c.interviewAt ? ` for ${whenText(c.interviewAt, c.timezone)}` : ''}. Please come with ${c.childFirstName}.${fee}`;
    case 'OFFERED':
      return `Congratulations — ${c.childFirstName} has been offered a place. ${c.offerExpiresOn ? `Please accept by ${dayText(c.offerExpiresOn)}` : 'Please accept the offer'} by visiting or calling the school.`;
    case 'ACCEPTED':
      return `Thank you for accepting the offer. The school will complete ${c.childFirstName}'s enrolment and share the fees and resumption details.`;
    case 'ENROLLED':
      return `${c.childFirstName} is enrolled. Welcome to the school!`;
    case 'WAITLISTED':
      return `${c.childFirstName} is on the waiting list. We will contact you if a place becomes available.`;
    case 'REJECTED':
      return 'We are sorry — the school is unable to offer a place at this time. Please contact the school if you have any questions.';
    case 'WITHDRAWN':
      return 'This application has been withdrawn. Please contact the school if you would like to reopen it.';
  }
}
