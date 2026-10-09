# Data retention

> **DRAFT FOR LEGAL REVIEW.** This document has not been approved by a lawyer. Items marked [PLACEHOLDER: …] must be completed or confirmed by counsel before it is relied on.

**Version:** 2026-10-draft-1 · **Effective date:** [PLACEHOLDER: effective date]

This note says honestly what AI School OS keeps today and for how long, and lists the retention periods counsel and each school should set. Apart from the housekeeping rules marked *automatic* below, the platform does **not** delete records on a schedule: data stays until the school (or, on the school's instruction, the operator) removes it.

## What the platform keeps today

| Data | Current behaviour | Period to set |
|---|---|---|
| Student records (profile, health, attendance, results, report cards, behaviour, sick bay, homework) | Kept while the school uses the platform. Students who leave are marked withdrawn or graduated, not deleted, so transcripts and results can still be produced. | [PLACEHOLDER: e.g. results/transcripts permanently; health and welfare records N years after the child leaves] |
| Parent and guardian records | Kept while linked to a student. | [PLACEHOLDER: e.g. N years after the last child leaves] |
| Staff records, HR and payroll | Kept while the school uses the platform; staff who leave are marked exited. Staff records can be deleted by the school. | [PLACEHOLDER: e.g. payroll and tax records for the period required by tax law] |
| Fees, invoices and payments | Kept while the school uses the platform. | [PLACEHOLDER: e.g. the period required for accounting/tax records] |
| AI conversations (tutor, parent AI, staff assistants) and the tutor's learning notes | Kept in the school's account so the school can review them. | [PLACEHOLDER: e.g. N months, then deleted] |
| AI usage logs (who, which feature, model, tokens, cost — no content) | Kept for cost tracking and budgets. | [PLACEHOLDER] |
| WhatsApp assistant messages and message delivery records | Kept so staff can follow up and see what was sent. | [PLACEHOLDER] |
| Audit log (important actions, with IP address and browser) | Kept; append-only. The school's own export includes the last 12 months. | [PLACEHOLDER: e.g. N years] |
| Parental consent records | Current consent on the parent record; full history of consents and withdrawals in the audit log. | [PLACEHOLDER: keep for as long as the data it covers, plus N years] |
| Sign-in sessions (refresh-token records: user, school, time, IP address, browser) | Expire after 30 days. *Automatic:* records more than **400 days** old (expired or revoked) are deleted daily. Sign-ins also stay in the audit log. | 400 days (kept a little over a school year for the success dashboard's per-term activity) [PLACEHOLDER: confirm] |
| In-app notifications | Kept in the user's bell. *Automatic:* notifications created more than **400 days** ago and already read are deleted daily; unread ones are kept. | 400 days after creation, once read [PLACEHOLDER: confirm] |
| EduGames rounds started but never answered | No score or XP. *Automatic:* deleted after **30 days**. Rounds with answers are kept like other learning records. | 30 days |
| Uploaded files (photos, hand-ins, documents) | Stored on the server in the uploads folder; kept until removed. | [PLACEHOLDER] |
| Server backups (hosting provider) | Daily database backups, kept by the hosting provider for its configured period (recommended 7–14 days). | [PLACEHOLDER: confirm the configured period] |
| School data exports (ZIP files) | Created on demand and downloaded by the school; not kept on the server. | The school's responsibility once downloaded |

## When a school leaves

- A school that stops using the platform is **archived**, not deleted: nobody can sign in, and its data stays in the database.
- The school can download its records at any time from **Settings → Backup & export**.
- At the end of the contract the operator deletes or returns the school's data as set out in the Data Processing Agreement (Schedule 6). Deleting a school removes all of its records from the live database (every table is linked to the school and removed with it). Copies in server backups expire with the backup cycle.
- [PLACEHOLDER: period after which archived schools' data is deleted if the school gives no instruction, e.g. N days after notice.]

## Planned improvements

- Automatic housekeeping runs once a day (old sign-in session records, old read notifications, abandoned game rounds; periods above). The periods are set in `apps/api/src/prisma/housekeeping.service.ts` (`RETENTION`).
- [PLACEHOLDER/TODO: further automatic deletion jobs once periods are agreed — for example AI conversations and old delivery logs.]
