# Google Play listing: AI School OS

Everything to paste or upload in Play Console for the first release. The app itself is already built and
signed (see `../README.md`): `C:\Users\user\ai-school-android-builds\1.0.0-code1\app-release-bundle.aab`.

## Store listing (Grow users → Store presence → Main store listing)

**App name** (max 30): `AI School OS`

**Short description** (max 80):
`Your school in your pocket: homework, results, fees, attendance and an AI tutor.`

**Full description** (max 4000):

```
AI School OS is the school app for parents, students and teachers at schools that use the AI School OS
portal. Sign in with the account your school gave you.

FOR PARENTS
• See your child's homework, results and report cards
• Check attendance and gate check-in
• Pay school fees online and keep your receipts
• Get school announcements, events and messages
• Follow the school bus on the map while a trip is running (where the school uses it)

FOR STUDENTS
• Homework, lessons and class notes in one place
• An AI tutor that guides you to the answer step by step, instead of just handing it over
• Practice for tests and exams
• Lessons you have saved can be read on a weak connection or offline

FOR TEACHERS
• Lesson modules with check-in questions, ready to teach from a projector
• AI help to draft lessons and questions, always for you to check before students see them
• Attendance, results and remarks from your phone

BUILT FOR NIGERIAN SCHOOLS
• Works on everyday Android phones and slow networks
• Fees in naira through Paystack
• Your school controls who can see what

You need an account from a school that uses AI School OS. If your school doesn't use it yet, ask them to
visit ai-schoolportal.mejortechworld.com.
```

**Graphics** (files in this folder):

| Play asks for | File |
|---|---|
| App icon 512 × 512 | `../store_icon.png` |
| Feature graphic 1024 × 500 | `feature-graphic.png` |
| Phone screenshots (2 to 8) | `screenshot-student-home.png`, `screenshot-student-tutor.png`, `screenshot-parent-home.png` |

**Category:** Education. **Contact email:** the support address you want parents to see. **Website:**
`https://ai-schoolportal.mejortechworld.com`.

## Policy pages

- **Privacy policy URL:** `https://ai-schoolportal.mejortechworld.com/legal/privacy`
  (fill in every `[PLACEHOLDER: …]` in `docs/legal/` first: Play reviewers and parents read this page).
- **Account deletion URL** (Data safety asks for one): `https://ai-schoolportal.mejortechworld.com/legal/privacy`
  (section 8, "Deleting your AI School OS account", explains the in-app route and the email route).

## App content answers (Policy → App content)

These describe how the app works today; confirm each against your own legal advice before submitting.

- **Ads:** No ads.
- **App access:** Sign-in required. Give the reviewer a working test account with sample data (a parent or
  student in a test school, never a real child's account) and the steps to sign in.
- **Target audience:** the app is used by children through their school. Choose the age groups truthfully;
  if you include under-13s, the app falls under Google's Families policy (the AI tutor and any third-party
  services must meet it). Ask counsel before choosing.
- **Content rating:** complete the questionnaire (education app, user messaging between school and families,
  no gambling or violence). 
- **Data safety:** data collected: name, email, phone, school records (results, attendance), photos and
  files users upload, payment info is handled by Paystack (not stored by the app), approximate location only
  for bus drivers during a trip. Encrypted in transit: yes. Users can request deletion: yes (see above).
  Data is not sold. Shared with service providers only (hosting, email/SMS, Paystack, the AI provider) as
  listed at `/legal/subprocessors`.
- **Government apps / news / health:** No.

## Releasing

1. Play Console → **Create app** (AI School OS, App, Free, accept the declarations).
2. **Test and release → Internal testing → Create new release**, upload `app-release-bundle.aab`, keep
   **Google Play App Signing** on.
3. After the upload: **Test and release → App integrity → App signing**, copy the *App signing key
   certificate* SHA-256.
4. GitHub → repository → Settings → Secrets and variables → Actions → **Variables**:
   - `ANDROID_PACKAGE_NAME` = `com.mejortechworld.aischool`
   - `ANDROID_SHA256_FINGERPRINTS` = the upload key fingerprint from `../README.md`, a comma, then Play's
     fingerprint from step 3.
   Re-run the deploy, then check `https://ai-schoolportal.mejortechworld.com/.well-known/assetlinks.json`
   shows JSON (not the website). Without this the app shows a browser address bar at the top.
5. Install from the internal test link on a real phone: sign in, open homework, the tutor and a payment page.
6. Fill in the store listing and app content above, then promote the release to **Production** (new
   personal developer accounts must first run a closed test with testers for 14 days; organisation accounts
   don't).
