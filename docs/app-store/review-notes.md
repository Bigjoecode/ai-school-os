# App Review information

App Store Connect → the version → *App Review Information*. Fill the placeholders, keep the accounts working
(don't change their passwords, don't let the demo data be wiped) for as long as reviews are running.

## Sign-in information (required — "Sign-in required" ticked)

Create **dedicated reviewer accounts** in the demo school (demo data only — never a real child's account) and give
one; mention the others in the notes.

| Field | Value |
|---|---|
| User name | `[PLACEHOLDER: reviewer parent login, e.g. appreview.parent@greenfield.demo]` |
| Password | `[PLACEHOLDER: its password — typed into App Store Connect, never committed]` |

## Contact information

`[PLACEHOLDER: first name, last name, phone (with +234), email]` — someone who can answer within a day.

## Notes (paste and adjust)

```
AI School OS is the portal for schools that use the AI School OS platform in Nigeria. Accounts are issued by each school (there is no public sign-up in the app). The demo accounts below belong to a demonstration school with made-up data.

Parent: [PLACEHOLDER parent email] / [PLACEHOLDER password]
Student: [PLACEHOLDER student email] / [PLACEHOLDER password]

Native features in this build:
- Push notifications (APNs): sign in → bell icon → "Allow". School announcements and reminders arrive as notifications; tapping one opens the related page.
- Offline use: the app keeps the screens you have opened and exams the school has downloaded (Offline exams), so they open without a connection.
- Haptic feedback in the learning games (turn game sound on), native launch screen and status bar, camera / photo / microphone for homework hand-ins and the AI tutor (photo and talk modes).

Payments: parents can pay SCHOOL FEES (tuition for a real-world school service, paid to the school) through Paystack; this opens in Safari. No digital content, subscriptions or features are sold in the app — digital extras offered on the web are not shown in the iOS app.

Account deletion: account menu (avatar, top right) → Security & account → Request account deletion. The request goes to the school, which is the data controller and must handle it under Nigeria's data protection law; the screen explains what is deleted and what schools must keep.

AI tutor: available to students; answers are limited to school subjects and show a notice that they can be wrong.
```

## Before each submission — test on a TestFlight build

- [ ] Sign in as parent and student; no "Install the app" prompt anywhere.
- [ ] *My family*: shows the "This isn't available in the iPhone app…" note, no shop, no prices to buy.
- [ ] *Settings → Billing* (admin): plan shown, no checkout or invoice "Pay" buttons.
- [ ] Sign-in page: no "See plans / free trial" link.
- [ ] Fees: "Pay now" opens Paystack in Safari (use Paystack test mode on a test school).
- [ ] Bell → Allow notifications → iOS permission prompt → send a test announcement → notification arrives;
      tapping it opens the page.
- [ ] Share button on the For-schools pages opens the iOS share sheet.
- [ ] A game with sound on: wrong answers give a haptic tap.
- [ ] AI tutor: camera/photo picker and talk mode ask permission with the texts from `Info.plist`.
- [ ] Offline exams: download one, Airplane Mode, force-quit, reopen → it opens. Turn the network back on.
- [ ] First launch in Airplane Mode (fresh install): the offline page shows; turning the network on reconnects.
- [ ] Security & account → Request account deletion → the request appears for the admin under
      Settings → Data protection → Requests (then close it).
- [ ] WhatsApp / YouTube links open their apps; a school's own website opens in Safari.
- [ ] Dark mode: status bar text stays readable.
