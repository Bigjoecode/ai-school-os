# App Privacy ("nutrition label") — draft answers

App Store Connect → the app → *App Privacy*. Drafted from the same facts as the Play Data safety form
(`docs/play-store/data-safety.md`), the privacy notice and sub-processors (`docs/legal/`) and the code. The iOS
shell itself collects nothing extra except, if the person allows notifications, the APNs device token.
Review with whoever signs off the privacy notice, and update this whenever a feature changes what is collected.

Apple's terms: **collect** = sent off the device and kept longer than needed to answer the request in real time.
Data processed only by **service providers acting for you** (hosting, AI providers, Paystack, SMS/email gateways)
still counts as collected *by you*, but is **not "tracking"**. **Tracking** = linking with other companies' data
for advertising, or sharing with data brokers — this app does neither.

## First questions

| Question | Answer |
|---|---|
| Do you or your third-party partners collect data from this app? | **Yes** |
| Is data used to track users? | **No** (for every type below). No ads, no advertising ID, no analytics/attribution SDKs, no data brokers. You therefore need no App Tracking Transparency prompt. |
| Linked to the user's identity? | **Yes** for every type below (everything belongs to a school account) |

## Data types

Purposes Apple offers: Third-Party Advertising, Developer's Advertising or Marketing, Analytics, Product
Personalization, App Functionality, Other Purposes. **Only App Functionality applies** (plus noted exceptions).

| Apple category → type | Collected? | Notes |
|---|---|---|
| **Contact Info → Name** | Yes | Students, parents, staff |
| **Contact Info → Email Address** | Yes | Sign-in, receipts, school messages |
| **Contact Info → Phone Number** | Yes | SMS/WhatsApp messages from the school; parent sign-in by phone where used |
| **Contact Info → Physical Address** | Yes | Student/guardian address in school records |
| **Contact Info → Other User Contact Info** | No | — |
| **Health & Fitness → Health** | Yes | Allergies, genotype, blood group, medical notes, sick-bay visits (school welfare records) |
| **Health & Fitness → Fitness** | No | — |
| **Financial Info → Payment Info** | **No** | Card details are entered on Paystack's page (opened in Safari) and never reach the app or the platform |
| **Financial Info → Other Financial Info** | Yes | Fee invoices and balances; staff payroll (salary, bank details, payslips) |
| **Financial Info → Credit Info** | No | — |
| **Location** (precise / coarse) | No | Never requested |
| **Sensitive Info** | Consider **Yes** | Apple lists e.g. religious beliefs, ethnic data, health is separate. If your schools record religion or state of origin/ethnicity in student records, tick it; otherwise No |
| **Contacts** | No | The device's address book is never read |
| **User Content → Emails or Text Messages** | Yes | Messages between school and parents; WhatsApp assistant messages |
| **User Content → Photos or Videos** | Yes | Homework hand-ins, student photo, AI tutor photo questions |
| **User Content → Audio Data** | Yes | Voice-note hand-ins and the AI tutor's talk mode (sent to the AI provider for transcription) |
| **User Content → Gameplay Content** | Yes | Learning-game scores and leaderboards |
| **User Content → Customer Support** | Yes | Support tickets from schools |
| **User Content → Other User Content** | Yes | Homework and exam answers, practice attempts, AI tutor questions and answers, careers quiz, uploaded files |
| **Browsing History / Search History** | No | Searches inside the app aren't kept as history |
| **Identifiers → User ID** | Yes | Account ID, admission/staff numbers |
| **Identifiers → Device ID** | Yes | The push-notification token, only if the person allows notifications. (Apple counts device-level identifiers here.) |
| **Purchases → Purchase History** | Yes | School-fee payments and receipts (and, from the web, parent extras) |
| **Usage Data → Product Interaction** | Yes | Audit log of important actions; AI usage counts for fair-use limits. Purpose: App Functionality (and *Other Purposes* — security — if you want to be explicit) |
| **Usage Data → Advertising Data / Other Usage Data** | No | — |
| **Diagnostics** (crash, performance, other) | No | No crash-reporting or analytics SDK. Server error logs aren't tied to analytics. Re-check if you add one |
| **Surroundings / Body** | No | — |
| **Other Data** | Yes | Date of birth, gender, class, relationship to child, occupation, staff HR data |

## Children

The App Privacy form has no separate children's section, but the privacy policy must explain children's data —
the privacy notice does ("For children: the short version" and the school-as-controller model). If you choose the
Kids Category (not recommended, see `age-rating-and-audience.md`), stricter rules apply.

## Account deletion

App Store Connect doesn't ask for a URL, but App Review checks the in-app path: account menu → **Security &
account → Request account deletion** (see `README.md`, decision 2).
