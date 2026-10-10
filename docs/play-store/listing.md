# Play Store listing — AI School OS

Copy these into Play Console → *Grow users → Store presence → Main store listing*. Everything here
describes what the app actually does today; nothing is claimed that the platform doesn't do. Re-read it
before each release and remove anything a feature change has made untrue.

## App name (max 30 characters)

```
AI School OS
```

(12 characters.) Alternative if you want the purpose in the name: `AI School OS: School Portal` (27).

## Short description (max 80 characters)

```
Your school in your pocket: homework, results, attendance, fees and an AI tutor.
```

(80 characters — check the counter in Play Console; if your editor counts the colon differently, use
`Homework, results, attendance, school fees and an AI tutor for your school.` — 75.)

## Full description (max 4,000 characters)

```
AI School OS is the school portal used by schools on the AI School OS platform. Parents, students and staff sign in with the account their school gives them.

You need a school account to use this app. If your child's school uses AI School OS, ask the school office for your sign-in details.

FOR PARENTS AND GUARDIANS
• See each child's attendance, homework, results and report cards in one place.
• Check school fees, invoices and receipts, and pay online through Paystack where your school accepts it.
• Receive announcements and reminders from the school.
• Follow each of your children from one account if more than one attends the school.
• Choose what the school may do with your child's information on the privacy and consent screen, and change your choice later in Settings.

FOR STUDENTS
• Homework and assignments: see what is due, hand work in and read your teacher's feedback.
• An AI tutor that explains step by step, in the subjects your school has switched on. The tutor can make mistakes, so check important answers with your teacher.
• Practice questions, exam preparation and educational games for your class level.
• Online tests and exams set by your school, including exams your school runs without internet in the hall.
• Your timetable, results and report cards.

FOR TEACHERS AND SCHOOL STAFF
• Take attendance, set homework, enter scores and write remarks.
• Lesson plans, schemes of work and class insights.
• Messages to parents, and the school's day-to-day records, depending on your role.

WORKS ON A WEAK CONNECTION
The app keeps the screens you have opened on your phone, so you can still read your saved information when the network is poor, and it starts quickly on later visits.

PRIVACY
Your school decides what information is kept and who can see it. Parents see their own children's records; students see only their own. Card payments are handled by Paystack, not stored in the app. The platform does not sell personal information or use it for advertising. Read the privacy notice at https://ai-schoolportal.mejortechworld.com/legal/privacy

The features you see depend on what your school has switched on and on your role.
```

(About 2,100 characters, well under the limit.)

## Category and tags

- **App or game:** App
- **Category:** Education
- **Tags (pick up to 5 in Play Console):** choose the closest offered, e.g. *Education*, *Learning*,
  *School management* (Play offers a fixed list — pick what it shows).
- **Contact details:** an email you read (required), website `https://ai-schoolportal.mejortechworld.com`,
  phone optional.
- **Privacy policy URL:** `https://ai-schoolportal.mejortechworld.com/legal/privacy`
  (the notice is marked *Draft for legal review* with placeholders — complete it before the public release;
  Play reviewers do read it).

## Graphics (files in this folder)

| Asset | Requirement | File |
|---|---|---|
| App icon | 512×512 PNG, 32-bit, full square (Play rounds the corners) | `app-icon-512.png` (from the maskable icon) |
| Feature graphic | 1024×500 PNG/JPEG | `feature-graphic-1024x500.png` |
| Phone screenshots | 2–8, 16:9 or 9:16, each side 320–3,840 px | `screenshots/01…07-*.png` (1080×1920) |

Screenshots were taken from the local app with the **Greenfield demo school** — every name, mark and
amount in them is made-up demo data, no real person. Suggested order and captions:

1. `01-parent-home.png` — "Every child's attendance, results and fees at a glance"
2. `02-parent-fees.png` — "School fees, invoices and receipts"
3. `03-parent-attendance.png` — "Attendance for each term"
4. `04-student-home.png` — "Daily challenges and the student's school day"
5. `06-student-ai-tutor.png` — "An AI tutor that explains step by step"
6. `05-student-homework.png` — "Homework: what's due and teacher feedback"
7. `07-teacher-home.png` — "The school at a glance for staff"

To retake them (e.g. after a redesign): run the API and web app locally with the demo school, sign in as
`parent@` / `student@` / `teacher@greenfield.demo`, and capture at 360×640 CSS px with device scale 3
(1080×1920). Tablet screenshots (7" and 10") are optional; without them the app is still offered on tablets.

## Content rating (IARC questionnaire) — notes

Play Console → *Policy and programs → App content → Content rating*. Answer truthfully; for this app:

- **Category:** "Reference, News, or Educational".
- **Violence, sexuality, language, controlled substances, gambling:** none in the app's own content. The
  games are quizzes and learning games with no simulated gambling. (Literature/history set texts are
  school syllabus material, not depictions for entertainment.)
- **User interaction / users can communicate:** **Yes** — staff message parents, students hand in work
  and get feedback, and the AI tutor answers free-text questions. Communication is within a school,
  not with strangers; there is no public chat or friend-finding.
- **Shares user's location:** No.
- **Digital purchases:** **Yes, through Paystack on the web page** (school fees, and paid AI/exam-prep
  extras where enabled) — Play Billing is not used. See the payments note in `README.md`.
- **Generative AI:** the AI tutor and staff AI tools produce text. Answer the AI questions as asked by the
  current questionnaire; outputs are filtered to the school context, and staff review AI suggestions about
  students before they count.

Expect a rating around "Everyone" / PEGI 3 with the "Users Interact" and "In-App Purchases" notices;
the rating is decided by the questionnaire, not by us.
