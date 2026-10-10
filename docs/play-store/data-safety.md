# Data safety form — draft answers

Play Console → *Policy and programs → App content → Data safety*. Drafted from what the platform actually
handles (`docs/legal/privacy-notice.md`, `docs/legal/subprocessors.md` and the code). The Android app is a
Trusted Web Activity: the app shell itself collects nothing, but **data handled by the website inside the
app counts**, so the answers below describe the portal. Review with whoever signs off the privacy notice,
and update this form whenever a feature changes what is collected.

Definitions Play uses: **collected** = sent off the device (to our server or a provider); **shared** = given
to a *third party*. Transfers to **service providers processing on our behalf** (hosting, AI providers,
Paystack, SMS/email gateways) are **not "sharing"** under Play's definition, and neither are transfers the
user initiates (e.g. a parent paying through Paystack) or legally required disclosures.

## Overview questions

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS only) |
| Do you provide a way for users to request that their data is deleted? | **Yes** — on request through the school (the controller), see *Account deletion* below. Make sure the deletion URL exists before answering yes. |
| Has the app been independently security-reviewed (MASA)? | No (optional) |
| Is the app designed for children / Families policy? | Depends on your audience choice — see `audience-and-families.md` |

## Data types

For every type below: **Shared: No** (only service providers acting for us), **Processed ephemerally: No**
unless stated, **Collection is required** unless marked optional (users can't use the portal without it).

| Data type (Play's names) | Collected? | Optional? | Purposes (Play's list) | Notes |
|---|---|---|---|---|
| **Personal info → Name** | Yes | Required | App functionality; Account management | Students, parents, staff |
| **Personal info → Email address** | Yes | Required for parents/staff | App functionality; Account management; Developer communications | Sign-in, receipts, school messages |
| **Personal info → User IDs** | Yes | Required | App functionality; Account management; Fraud prevention, security | Account ID, admission/staff numbers |
| **Personal info → Address** | Yes | Optional | App functionality | Student/guardian address in school records |
| **Personal info → Phone number** | Yes | Optional | App functionality; Developer communications | SMS/WhatsApp messages from the school |
| **Personal info → Other info** | Yes | Required | App functionality | Date of birth, gender, class, relationship to child, occupation, staff HR data |
| **Financial info → Purchase history** | Yes | Optional | App functionality | Fees invoices, payments, receipts. Card numbers are entered on Paystack's page and **not** collected by the app — do *not* tick "credit card info". |
| **Financial info → Other financial info** | Yes | Optional (staff only) | App functionality | Payroll: salary, bank details, payslips for staff |
| **Health and fitness → Health info** | Yes | Optional | App functionality | Allergies, genotype, blood group, medical notes, sick-bay visits |
| **Messages → Other in-app messages** | Yes | Optional | App functionality | Messages to parents; WhatsApp assistant messages; AI tutor questions and answers |
| **Photos and videos → Photos / Videos** | Yes | Optional | App functionality | Homework hand-ins, student photo, AI tutor photo questions |
| **Audio → Voice or sound recordings** | Yes | Optional | App functionality | Voice-note hand-ins and the AI tutor's "Talk" mode (sent to the AI provider for transcription) |
| **Files and docs** | Yes | Optional | App functionality | Uploaded files, lesson materials, documents |
| **App activity → App interactions** | Yes | Required | App functionality; Fraud prevention, security | Audit log of important actions, AI usage counts (fair use) |
| **App activity → Other user-generated content** | Yes | Required for students | App functionality | Homework answers, exam answers, practice attempts, careers quiz |
| **App info and performance → Crash logs / Diagnostics** | No | — | — | No crash-reporting or analytics SDK is used (re-check if you add one) |
| **Device or other IDs** | Yes | Optional | App functionality | A browser push-notification address, only if the user turns notifications on. IP address and browser are kept in the security audit log — tick this if your reviewer considers IP a device identifier. |
| **Location** | No | — | — | The app never asks for location. (An address typed into a record is "Address" above.) |
| **Contacts, Calendar, Web browsing, SMS/call logs** | No | — | — | Not read from the device |

**Advertising or marketing:** not a purpose for any data type. **Analytics:** not used.
**Sold:** never.

## Security practices section

- Data encrypted in transit: **Yes**.
- Users can request deletion: **Yes** (via the school; see below).
- Committed to the Families policy: only if you choose Option B in `audience-and-families.md`.

## Account deletion (required by Play for apps with accounts)

Play requires (a) a way to start deletion from inside the app **or** a clear explanation, and (b) a **web
link** where anyone can request deletion of their account and data without reinstalling the app. Play
Console → *App content → Data deletion* asks for that URL.

Today, the privacy notice (section 8, *Your rights*) tells people to send requests to their school, and
schools log and handle them under *Data protection → Data subject requests*. That is the right process
legally (the school is the controller), but **Play expects a page that names the app and gives the steps**.
Before submitting, publish one (for example a short section in the privacy notice titled
"Deleting your AI School OS account", or a dedicated page) that says:

1. Ask your school office to delete your account (the school controls school records); or
2. email the operator's privacy contact **[PLACEHOLDER: DPO email]** with your name, school and the
   account's email/phone, and we will pass it to the school and confirm;
3. what is deleted (the sign-in account and personal data the school no longer needs), what may be kept and
   for how long (records schools must keep by law — see `/legal/retention`), and how long it takes.

Then give that page's URL in the Data deletion section. (Drafting the page needs your DPO contact and
counsel's retention periods, so it isn't written here.)
