# App Store listing — AI School OS

Paste these into App Store Connect. Adapted from the Play listing (`docs/play-store/listing.md`) for Apple's limits.
Everything here describes what the **iPhone app** does — note that parents' AI/exam-prep purchases and the
school plan checkout are not in the iPhone app, so the description doesn't mention buying them.

## Name (max 30) — *App Information*

```
AI School OS
```
(12.) If taken: `AI School OS: School Portal` (27).

## Subtitle (max 30) — *App Information*

```
School portal and AI tutor
```
(26.) Alternative: `Homework, results, fees, AI` (27).

## Promotional text (max 170) — *version page; can be changed any time without review*

```
Homework, results, attendance and school fees for every child in one place, plus a step-by-step AI tutor for students. Works on a weak connection.
```
(146.)

## Keywords (max 100, comma-separated, no spaces needed) — *version page*

```
school,portal,parent,student,teacher,homework,results,attendance,fees,report card,tutor,exam prep
```
(97.) Don't repeat words already in the name/subtitle (Apple indexes those anyway), and don't use other
companies' or exam boards' trademarks (e.g. WAEC, JAMB) as keywords — that can get a rejection (2.3.7).

## Description (max 4,000) — *version page*

```
AI School OS is the school portal used by schools on the AI School OS platform. Parents, students and staff sign in with the account their school gives them.

You need a school account to use this app. If your child's school uses AI School OS, ask the school office for your sign-in details.

FOR PARENTS AND GUARDIANS
• See each child's attendance, homework, results and report cards in one place.
• Check school fees, invoices and receipts, and pay school fees online through Paystack where your school accepts it.
• Get notifications for announcements and reminders from the school.
• Follow each of your children from one account if more than one attends the school.
• Choose what the school may do with your child's information on the privacy and consent screen, and change your choice later in Settings.

FOR STUDENTS
• Homework and assignments: see what is due, hand work in (including photos and voice notes) and read your teacher's feedback.
• An AI tutor that explains step by step, in the subjects your school has switched on. Ask by typing, with a photo of the question, or by talking. The tutor can make mistakes, so check important answers with your teacher.
• Practice questions, exam preparation and learning games for your class level.
• Online tests and exams set by your school, including exams your school runs without internet in the hall.
• Your timetable, results and report cards.

FOR TEACHERS AND SCHOOL STAFF
• Take attendance, set homework, enter scores and write remarks.
• Lesson plans, schemes of work and class insights.
• Messages to parents, and the school's day-to-day records, depending on your role.

WORKS ON A WEAK CONNECTION
The app keeps the screens you have opened on your phone, so you can still read your saved information when the network is poor, and exams your school has downloaded open without internet.

PRIVACY
Your school decides what information is kept and who can see it. Parents see their own children's records; students see only their own. Card payments are handled by Paystack, not stored in the app. The platform does not sell personal information or use it for advertising, and the app has no ads or tracking. You can ask for your account to be deleted from Settings → Security & account.

The features you see depend on what your school has switched on and on your role.
```
(About 2,300 characters.)

## URLs — *version page / App Information*

| Field | Value |
|---|---|
| Support URL (required) | `https://ai-schoolportal.mejortechworld.com/for-schools` or a support/contact page — **must show a way to contact you** (Apple checks). [PLACEHOLDER: confirm the page has your support email/phone] |
| Marketing URL (optional) | `https://ai-schoolportal.mejortechworld.com/for-schools` |
| Privacy Policy URL (required) | `https://ai-schoolportal.mejortechworld.com/legal/privacy` |
| Copyright | `2026 [PLACEHOLDER: operator's legal name]` |

## Category

Primary **Education**; secondary **Productivity** (optional).

## Screenshots (`screenshots/`, demo data only)

Taken in "iPhone app" mode (the web's `isIosApp()` is on, so there are no install prompts or digital purchases),
from the local app with the **Greenfield demo school** — every name, mark and amount is made-up demo data.
Retake after a redesign the same way (Playwright WebKit with the app's user agent marker `AISchoolOS-iOS/1`).

| Folder | Size (px) | App Store Connect slot |
|---|---|---|
| `iphone-6.7/` | 1290 × 2796 | iPhone 6.9" / 6.7" display (**required** — upload this set) |
| `iphone-6.5/` | 1242 × 2688 | iPhone 6.5" (optional; Apple scales the 6.9" set if missing) |
| `iphone-5.5/` | 1242 × 2208 | iPhone 5.5" (optional) |
| `ipad-12.9/` | 2048 × 2732 | iPad 13" / 12.9" (**required**, the app supports iPad) |

Suggested order (2–10 per size). For Option A in `age-rating-and-audience.md`, lead with the parent screens:

1. `01-parent-home.png` — "Every child's attendance, results and fees at a glance"
2. `02-parent-fees.png` — "School fees, invoices and receipts"
3. `03-parent-attendance.png` — "Attendance for each term"
4. `05-student-ai-tutor.png` — "An AI tutor that explains step by step"
5. `06-student-homework.png` — "Homework: what's due and teacher feedback"
6. `04-student-home.png` — "The student's school day"
7. `07-teacher-home.png` — "The school at a glance for staff"

App previews (videos) are optional.
