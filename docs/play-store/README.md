# Publishing AI School OS on Google Play

The Android app is the portal in a Trusted Web Activity — see **`android/README.md`** for how it's built,
signed and versioned. This folder is the Play Console pack:

| File | What it's for |
|---|---|
| `listing.md` | App name, short and full description, category, graphics list, content-rating notes |
| `audience-and-families.md` | Target audience options and Google Play's Families policy — **decide before submitting** |
| `data-safety.md` | Draft Data safety answers, and the account-deletion page Play requires |
| `app-icon-512.png`, `feature-graphic-1024x500.png`, `screenshots/` | Store graphics (demo data only) |

## Before you start — decisions and items to finish

1. **Target audience** — read `audience-and-families.md` and choose.
2. **Privacy notice** — `/legal/privacy` is a draft with `[PLACEHOLDER: …]` items (operator name, DPO
   contact). Complete it before a public release.
3. **Account-deletion page** — Play requires a public URL (see `data-safety.md`).
4. **Digital purchases (important).** Play Billing is off. School fees are payments for a real-world service
   (schooling) and may be paid outside Play Billing. But Google Play's Payments policy generally requires
   Play Billing for **digital goods and subscriptions used inside the app** — in this platform that could
   include the parent-bought AI / exam-prep extras on the family page, and a school paying its platform
   subscription from inside the app. Options: (a) don't offer those purchases inside the Android app (the
   web code can tell it is in the app: `isAndroidApp()` in `apps/web/src/pwa/android-app.ts`) and let people
   buy them on the website; (b) integrate Play Billing (Bubblewrap's `playBilling` feature + the Digital
   Goods API) — a larger job, and Google takes a service fee; (c) ask Google/your lawyer whether an
   exception applies. Read the current *Payments* policy in Play Console and decide before review — apps
   are rejected for this.
5. **Reviewer access** — the app needs a login. Create a dedicated reviewer account in the demo school
   (e.g. a parent and a student login with demo data only) and keep it working; Play asks for it under
   *App content → App access*.

## Step by step

1. **Create a Play Console developer account** — https://play.google.com/console — one-time registration fee
   of **US$25**. Choose *Organisation* if you have a registered company (needs a D-U-N-S number and
   takes longer to verify) or *Personal*. Identity verification can take a few days.
   *New personal accounts must run a closed test before production — see step 7.*
2. **Create the app** — *Create app*: name **AI School OS**, default language **English (United Kingdom)**,
   *App*, *Free*, accept the declarations.
3. **Build the bundle** — follow `android/README.md` (`bubblewrap build` → `app-release-bundle.aab`).
4. **Internal testing first** — *Test and release → Testing → Internal testing → Create new release*.
   Accept **Play App Signing** when asked (recommended: Google keeps the app-signing key, you keep the
   upload key). Upload `app-release-bundle.aab`, release notes e.g. "First test release". Add yourself and up
   to 100 testers by email list; open the opt-in link on an Android phone and install from Play.
5. **Link the site to the app (no address bar)** — Play Console → *Test and release → App integrity →
   App signing*: copy the **App signing key certificate SHA-256**. Add it, together with the upload-key
   fingerprint, to the GitHub variable `ANDROID_SHA256_FINGERPRINTS` (comma-separated) and re-run the deploy
   (details in `android/README.md`). Re-open the app on the phone (clear its storage once): the address bar
   should be gone. If it is still there, the fingerprint or the file is wrong.
6. **Fill in *App content*** (Policy and programs → App content): privacy policy URL
   (`https://ai-schoolportal.mejortechworld.com/legal/privacy`), App access (reviewer logins), Ads (**No ads**),
   Content rating (notes in `listing.md`), Target audience (`audience-and-families.md`), Data safety
   (`data-safety.md`), Data deletion URL, Government apps (No), Financial features (answer for fee
   payments via Paystack as asked), Health (the app stores school health records — answer the question as
   asked), News (No). Then the **Main store listing** from `listing.md` with the graphics in this folder.
7. **Closed testing** — required before production for **new personal developer accounts** (at the time of
   writing: at least **12 testers opted in for 14 continuous days** — check the current requirement shown in
   Play Console, it has changed before). *Testing → Closed testing → Create track*, upload the same or a newer
   bundle, add testers (a Google Group of parents/teachers at a pilot school works well), share the opt-in
   link, and keep them installed for the full period. Organisation accounts may skip this; Play Console shows
   what applies to you.
8. **Apply for production** — after the closed test, *Production → Create new release*, choose countries
   (e.g. Nigeria first), roll out. First reviews often take several days.
9. **Updates** — website changes need no Play release. For app-shell changes bump the version
   (`android/README.md`, *Versioning*) and upload to the same track, then promote.

## Costs

- Google Play developer registration: **US$25 one-time**.
- Nothing else is required: the app uses the existing hosting; Bubblewrap and the Android tools are free.
- Play Billing (only if you choose it for digital goods) carries Google's service fee.
