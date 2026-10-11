# Google Play — quick start (you already have a Play Console account)

The Android app is already built and signed:
`C:\Users\user\ai-school-android-builds\1.0.0-code1\app-release-bundle.aab` (package `com.mejortechworld.aischool`,
version 1.0.0, code 1). Details are in `android/README.md` and `README.md` in this folder; this is the short path.

1. **Create the app.** https://play.google.com/console → *Create app* → name **AI School OS**, default language
   **English (United Kingdom)**, *App*, *Free*, tick the declarations → *Create app*.
2. **Start an internal test.** *Test and release → Testing → Internal testing → Create new release*.
3. **Accept Play App Signing** when asked (*Choose signing key* → *Use Google-generated key*). Google keeps the
   app-signing key; your upload key (in `C:\Users\user\ai-school-android-keys\`) only signs uploads.
4. **Upload** `app-release-bundle.aab`, release name `1.0.0 (1)`, notes e.g. "First test release" →
   *Next → Save and publish* (internal tests go out within minutes, no full review).
5. **Add testers.** *Internal testing → Testers* → create an email list with your own Google account (and up to
   100 colleagues) → save → copy the **opt-in link**, open it on an Android phone, accept, install from Play.
6. **Copy Play's signing fingerprint.** *Test and release → App integrity → App signing* → **App signing key
   certificate → SHA-256 certificate fingerprint** (looks like `AB:CD:…`).
7. **Set two GitHub variables** (not secrets — fingerprints are public). GitHub → the repository → *Settings →
   Secrets and variables → Actions → Variables → New repository variable*:
   - `ANDROID_PACKAGE_NAME` = `com.mejortechworld.aischool`
   - `ANDROID_SHA256_FINGERPRINTS` = the upload key's fingerprint **and** Play's from step 6, comma-separated:
     `AF:FC:E3:03:E8:77:03:33:F0:5F:92:40:48:FF:B5:46:DB:B8:01:3B:CA:21:0B:F9:5A:8E:DA:67:14:80:35:BC,<Play's SHA-256>`
8. **Re-run the deploy.** *Actions → Deploy → Run workflow* (branch `main`). Its last step should print
   `Android app links: 200 application/json`.
9. **Check the file** in a browser or terminal:
   `https://ai-schoolportal.mejortechworld.com/.well-known/assetlinks.json` — it must list the package name and
   both fingerprints. (`curl -i …` should show `HTTP/… 200` and `content-type: application/json`.)
10. **Check the app.** On the test phone: *Settings → Apps → AI School OS → Storage → Clear storage*, then open it.
    There should be **no address bar** at the top. If there is, a fingerprint or the file is wrong — fix the
    variable and repeat steps 8–10.
11. **Fill in the store listing and policies** (needed before closed/production testing, not for internal):
    - *Grow users → Store presence → Main store listing*: texts and graphics from `listing.md`, `app-icon-512.png`,
      `feature-graphic-1024x500.png`, `screenshots/`.
    - *Policy and programs → App content*: privacy policy `https://ai-schoolportal.mejortechworld.com/legal/privacy`;
      App access (demo logins); Ads **No**; Content rating (`listing.md`); Target audience
      (`audience-and-families.md` — recommended Option A); Data safety (`data-safety.md`); **Data deletion URL**
      `https://ai-schoolportal.mejortechworld.com/legal/privacy` (section 8 now explains "Deleting your AI School OS
      account"; in-app: account menu → Security & account → Request account deletion).
    - Digital purchases: decide per `README.md` item 4 (the iPhone app already hides them; the same switch could
      be applied to Android — ask if you want that).
12. **Closed test, then production.** New *personal* developer accounts must run a closed test (at the time of
    writing 12+ testers for 14 days) before production; organisation accounts may skip it. Then
    *Production → Create new release* → promote the same bundle → choose countries (Nigeria first) → roll out.
