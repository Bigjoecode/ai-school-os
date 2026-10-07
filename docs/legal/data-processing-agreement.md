# Data Processing Agreement

> **DRAFT FOR LEGAL REVIEW.** This document has not been approved by a lawyer. Items marked [PLACEHOLDER: …] must be completed or confirmed by counsel before it is relied on.

**Version:** 2026-10-draft-1 · **Effective date:** [PLACEHOLDER: effective date]

This Data Processing Agreement (**DPA**) is between:

- **the School** that uses AI School OS (the **Controller**), and
- **[PLACEHOLDER: legal entity name]**, RC [PLACEHOLDER: RC number], of [PLACEHOLDER: registered address] (the **Processor**), which operates AI School OS.

It forms part of the School Terms of Service. A school accepts it in **Settings → Data protection**; the platform records who accepted, their position, the date and the version.

## 1. Definitions

Words such as *personal data*, *sensitive personal data*, *data subject*, *controller*, *processor*, *processing* and *personal data breach* have the meaning given in the **Nigeria Data Protection Act 2023** (the **NDPA**). **Commission** means the Nigeria Data Protection Commission (NDPC).

## 2. Roles

2.1 The School is the controller of the personal data of its students, parents and guardians, staff and others it enters into the Service. The Processor processes that data on the School's behalf.

2.2 Where the Processor decides the purposes of processing itself (for example its own billing of the School, platform security and fraud prevention, and parents' direct purchases of AI products from the Processor), it acts as a controller for that processing. [PLACEHOLDER: counsel to confirm.]

## 3. Processor's obligations

The Processor will:

a) process personal data only on the School's documented instructions — these terms, the School's configuration of the Service, and its users' actions in it — unless the law requires otherwise (in which case it will tell the School first, unless the law forbids it);

b) ensure that its staff and contractors who can access personal data are bound by confidentiality and access only what they need;

c) apply the technical and organisational measures in **Schedule 2**;

d) use sub-processors only as set out in **section 5** and **Schedule 3**;

e) help the School respond to data subject requests (**Schedule 5**);

f) help the School meet its obligations on security, breach notification, data protection impact assessments and consultation with the Commission, taking into account the nature of the processing;

g) notify the School of personal data breaches (**Schedule 4**);

h) delete or return personal data at the end of the contract (**Schedule 6**);

i) make available the information needed to show compliance with this DPA and allow for and contribute to reasonable audits (**section 8**);

j) tell the School promptly if it believes an instruction breaks the NDPA.

## 4. School's obligations

The School will:

a) have a lawful basis for the processing, including the consent of a parent or guardian where the NDPA requires it for a child's data, and the conditions for processing sensitive personal data (such as health information);

b) give data subjects a privacy notice (the Service provides one at /legal/privacy and a parental consent step);

c) decide which features to enable — especially AI features, the WhatsApp assistant and live-class recording — and configure roles so staff see only what they need;

d) keep its users' credentials secure, and require two-step sign-in for powerful roles where appropriate;

e) handle data subject requests, using the tools in Settings → Data protection;

f) appoint a data protection contact and, where the NDPA requires, a Data Protection Officer, and meet any registration or audit-filing duty with the Commission that applies to it. [PLACEHOLDER: counsel to confirm which schools are "data controllers of major importance".]

## 5. Sub-processors

5.1 The School gives general authorisation for the Processor to use the sub-processors in Schedule 3.

5.2 The Processor will give the School at least [PLACEHOLDER: number] days' notice of a new or replacement sub-processor (by email to the School's admin contact and on /legal/subprocessors). The School may object on reasonable data protection grounds; the parties will discuss in good faith, and if they cannot agree the School may end the affected service. [PLACEHOLDER: counsel to finalise.]

5.3 The Processor will put data protection terms in place with each sub-processor that give protection at least equivalent to this DPA, and remains responsible for its sub-processors.

5.4 Services the School connects with its own accounts (Schedule 3, part B) are engaged by the School; the Processor transmits data to them on the School's instructions.

## 6. International transfers

6.1 Some sub-processors process personal data outside Nigeria, in particular the AI providers (United States) and possibly the hosting provider [PLACEHOLDER: confirm data-centre location].

6.2 The Processor will transfer personal data outside Nigeria only where the NDPA allows it — for example where the destination provides an adequate level of protection, or appropriate safeguards are in place (such as binding contractual terms), or another basis the NDPA recognises applies. [PLACEHOLDER: counsel to determine and document the legal basis for each transfer and any filing or record the Commission requires.]

6.3 The Processor will keep a record of the transfer basis for each sub-processor and provide it to the School on request.

## 7. Confidentiality

The Processor treats all personal data as confidential and does not disclose it except as this DPA allows or the law requires. If an authority asks the Processor for School data, the Processor will (unless legally forbidden) refer the request to the School and tell the School promptly.

## 8. Audits

8.1 The Processor will answer the School's reasonable written questions about its compliance, and provide summaries of its security measures.

8.2 [PLACEHOLDER: on-site / third-party audit rights, frequency, notice, cost, confidentiality.]

## 9. Liability

[PLACEHOLDER: counsel to align with the Terms of Service liability clause.]

## 10. Term

This DPA applies while the Processor processes personal data for the School, and continues until that data is deleted or returned.

## 11. Order of precedence and law

If this DPA conflicts with the Terms of Service on data protection, this DPA prevails. It is governed by the laws of the Federal Republic of Nigeria.

---

## Schedule 1 — Processing details

| Item | Details |
|---|---|
| Subject matter | Provision of the AI School OS school management and learning platform |
| Duration | The term of the School's subscription, plus the deletion/return period in Schedule 6 |
| Nature and purpose | Hosting, storing, organising, displaying, transmitting and analysing school records to run the school; parent and student portal; communications; fees; HR and payroll; AI-assisted teaching and learning; security and audit |
| Data subjects | Students (mostly children), parents and guardians, staff, applicants, alumni, visitors, and other users the School adds |
| Categories of personal data | **Students:** names, date of birth, gender, admission number, class, house, photo, address; attendance; homework and hand-ins (photos, video, voice); scores, report cards, remarks; behaviour records; online exam answers; learning progress; AI tutor conversations and learning notes; career interests; library, transport, hostel, exeat and pick-up details; certificates. **Parents/guardians:** names, relationship, phone, email, address, occupation; invoices and payments; messages; WhatsApp assistant conversations; consent records. **Staff:** names, contact details, date of birth, gender, qualifications, next of kin, job details; attendance; leave; pay, deductions, bank details and payslips. **All users:** sign-in accounts, roles, audit log entries (with IP address and browser), usage records. |
| Sensitive personal data | Students' health information: blood group, genotype, allergies, chronic conditions, medical notes, sick-bay visits. [PLACEHOLDER: counsel to confirm any other categories, e.g. religion if recorded by a school] |
| Frequency | Continuous |
| Location of processing | [PLACEHOLDER: hosting data-centre location]; AI providers in the United States; see Schedule 3 |

## Schedule 2 — Technical and organisational measures

These measures are in place in the Service today:

- **Tenant isolation.** Every school's records carry the school's identifier and every query is restricted to the signed-in school. Exports re-check that each row belongs to the school.
- **Role-based access control.** Fine-grained permissions per role; parents see only their own children and students only themselves; children cannot reach other children's data.
- **Authentication.** Passwords hashed with scrypt; short-lived access tokens with refresh tokens in httpOnly cookies; rate limiting of sign-in and sensitive endpoints.
- **Two-step sign-in** (authenticator app, with one-time recovery codes). Schools can require it for staff who manage the school, users or money; the platform can require it for its own staff.
- **Encryption.** HTTPS for all traffic. Secrets for third-party services (Paystack keys, SMS and WhatsApp credentials, two-step sign-in secrets, Meta app secrets) are encrypted at rest with an application key (`APP_ENCRYPTION_KEY`) kept outside the database. [PLACEHOLDER: confirm disk/database encryption at rest provided by the host.]
- **Audit log.** Important actions (data changes, exports, settings, consent, sign-in security events) are recorded with the person, time, IP address and browser.
- **Webhook verification.** Payment and WhatsApp webhooks are signature-checked; payments are re-verified with Paystack.
- **AI safeguards.** Data is sent to AI providers only to answer a request; not used to train models; staff review AI output about students; sensitive WhatsApp messages are handed to staff; per-student and per-school limits.
- **Backups.** Daily database backups by the hosting provider (JetBackup), with recommended retention of 7–14 days and periodic restore tests (see DEPLOYMENT.md). Schools can download their own data at any time.
- **Data minimisation in exports.** Exports never include passwords, two-step secrets, tokens or payment keys.
- **Monitoring.** Error and health alerts to the operator; AI spend and usage tracking.
- **Organisational.** [PLACEHOLDER: staff confidentiality agreements, access on a need-to-know basis for platform support staff, security training, incident response plan, vendor review.]

## Schedule 3 — Sub-processors

The current list, with purposes and locations, is published at **/legal/subprocessors** and forms part of this Schedule. Part A lists providers the Processor engages; Part B lists services the School connects with its own accounts.

## Schedule 4 — Personal data breach notification

1. The Processor will notify the School **without undue delay, and in any event within [PLACEHOLDER: number] hours**, after becoming aware of a personal data breach affecting the School's data.
2. The notice will describe, as far as known: what happened; the categories and approximate number of data subjects and records; the likely consequences; the measures taken or proposed; and a contact for more information. Information not available at first will be provided as it becomes available.
3. The Processor will take reasonable steps to contain the breach and reduce its effects, and will cooperate with the School's notification to the Commission and to data subjects, which the NDPA requires of controllers within set time limits. [PLACEHOLDER: counsel to state the controller's deadline to notify the Commission and when data subjects must be told.]
4. Notification is not an admission of fault.
5. Contact for breach notices: Processor [PLACEHOLDER: security/DPO email and phone]; School: its admin contact on record unless it names another.

## Schedule 5 — Assistance with data subject requests

1. If the Processor receives a request directly from a data subject about School data, it will pass it to the School without undue delay and not answer it itself unless the School asks.
2. The Service gives the School tools to answer requests itself, in **Settings → Data protection**:
   - find a student, parent or staff member and **export their data** as JSON or as a ZIP of CSV files;
   - **log requests** (access, correction, deletion, objection, portability) with dates and outcomes, kept in the audit log;
   - see and export **parental consent** records and withdrawals.
3. Corrections are made in the normal screens. Deletion requests are logged and handled manually: the School decides what must be kept (for example results and records the law requires) and can ask the Processor to delete records the Service cannot delete from its screens.
4. The Processor will provide further reasonable help on request. [PLACEHOLDER: response time; whether assistance beyond the tools is chargeable.]

## Schedule 6 — Deletion or return at the end of the contract

1. Before the contract ends, and for [PLACEHOLDER: number] days after, the School can download its data from **Settings → Backup & export** (a ZIP of CSV files). Uploaded files can be provided on request. [PLACEHOLDER: format/charges for file export.]
2. After that period, or earlier on the School's written instruction, the Processor will delete the School's personal data from the live systems. Copies in backups are deleted as the backup cycle expires ([PLACEHOLDER: backup retention period]) and are not restored except to recover from an incident.
3. The Processor may keep data only where the law requires it, and will keep it protected and use it for no other purpose.
4. On request, the Processor will confirm deletion in writing.
