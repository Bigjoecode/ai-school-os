# Publishing AI School OS on the App Store

The iPhone/iPad app is the portal in a native Capacitor shell — see **`ios/README.md`** for what the shell does,
its limits, and how it's built. Builds run on GitHub Actions (`.github/workflows/ios.yml`) because building for
iOS needs a Mac. This folder is the App Store Connect pack:

| File | What it's for |
|---|---|
| `listing.md` | Name, subtitle, promotional text, description, keywords, URLs, category, screenshot order |
| `app-privacy.md` | Draft App Privacy ("nutrition label") answers |
| `age-rating-and-audience.md` | Age rating questionnaire guidance, and why the Kids Category is not recommended |
| `review-notes.md` | Notes and demo sign-in for App Review (fill in the placeholders) |
| `screenshots/` | iPhone 6.7", 6.5", 5.5" and iPad 12.9" screenshots (demo data only) |

Apple's rules change; the guideline numbers below are from the App Review Guidelines as they stood when this was
written. Read the current text at https://developer.apple.com/app-store/review/guidelines/ before submitting.

## Decisions for you before the first review

1. **Payments (recommended setting is already built in — confirm it).** Apple requires **In-App Purchase** for
   digital goods and subscriptions bought inside an iOS app (guideline 3.1.1), and doesn't allow buttons or links
   in the app that send people to another way of paying for them. Payment for real-world services used outside the
   app, such as **school fees**, must *not* use In-App Purchase and is paid with ordinary methods like Paystack
   (3.1.3(e), "Goods and Services Outside of the App"). For this platform that means:

   | In the web portal | In the iPhone app (as built) |
   |---|---|
   | School fees, invoices, receipts through Paystack | **Kept** — a real-world service; Paystack opens in Safari |
   | Parents' AI learning / exam-prep extras (*My family*) | **Hidden** — digital, sold to consumers. A neutral note replaces the shop; renew / resume / auto-renew are hidden; cancelling still works |
   | A school's platform plan and invoices (*Settings → Billing*) | **Hidden** — the plan and usage are shown, checkout and invoice payment are not (3.1.3(c) lets organisations use what they bought elsewhere, but selling it in the app would need IAP) |
   | Result-checker PIN purchase (school results page) | **Hidden** — only "buy a card from the school office" shows |
   | "See plans / start a free trial" on the sign-in page | **Hidden** — the app is for people whose school already uses AI School OS |

   The note reads: *"This isn't available in the iPhone app. Your account works the same in the app and on the
   web."* — no link, price, or hint to pay elsewhere (that wording is what Apple's anti-steering rule forbids
   outside the US storefront; Apple relaxed it for the **US storefront only** in 2025, which doesn't help a
   Nigerian-first app). Anything someone already bought on the web works in the app (3.1.3(b)/(c)).
   The switch is one function, `allowDigitalPurchases()` in `apps/web/src/pwa/ios-app.ts`. The alternative — selling
   the parent extras through In-App Purchase — needs StoreKit, App Store Connect products, server receipt
   checks and Apple's 15–30% commission; only worth it if those sales from iPhone users matter.
2. **Account deletion (done).** Apple requires apps that let people create an account to let them start deleting
   it inside the app (5.1.1(v)). The iOS app doesn't offer sign-up, but schools can create accounts and Apple
   checks for this anyway, so every signed-in user now has **account menu → Security & account → Request account
   deletion**. It files a *Deletion* request in the school's *Settings → Data protection → Requests* list (with the
   person's record linked) and notifies the school's administrators; the school, as data controller, carries it out
   and closes it. Apple accepts this kind of flow for regulated/organisation-managed accounts as long as the app
   explains what happens and how long it takes — the card does, and the privacy notice (section 8) now has the same
   steps, which also serves as the public deletion page Google Play asks for. Fill the `[PLACEHOLDER: DPO email]`
   and response time in `docs/legal/privacy-notice.md`.
3. **Audience / age rating** — read `age-rating-and-audience.md`. Recommendation: not in the Kids Category.
4. **Reviewer access** — create dedicated demo logins (parent and student) in the demo school with demo data
   only, keep them working, and put them in `review-notes.md` / App Store Connect (*App Review Information*).
5. **Privacy notice** — `/legal/privacy` still has `[PLACEHOLDER]`s (operator, DPO contact). Complete it; the
   privacy policy URL is required and reviewers open it.

## Step by step

### A. Apple Developer account (once)

1. Sign in at https://developer.apple.com/account with the account that has the paid membership. Note your
   **Team ID** (*Membership details*) — 10 characters, e.g. `AB12CD34EF`.
2. **Register the bundle ID:** *Certificates, Identifiers & Profiles → Identifiers → +* → *App IDs* → *App* →
   Description `AI School OS`, **Explicit** Bundle ID `com.mejortechworld.aischool` → under *Capabilities* tick
   **Push Notifications** → *Continue → Register*.
3. **Distribution certificate** (one per team, valid 1 year; you can have up to 3). On Windows, with OpenSSL (Git
   for Windows includes it — run in Git Bash), in a folder **outside the repository**, e.g. `C:\Users\user\ai-school-ios-keys\`:
   ```
   openssl genrsa -out dist.key 2048
   openssl req -new -key dist.key -out dist.csr -subj "/emailAddress=you@example.com/CN=AI School OS Distribution/C=NG"
   ```
   *Certificates → +* → **Apple Distribution** → upload `dist.csr` → download `distribution.cer`. Then make the
   .p12 (choose a strong export password when asked — that's `IOS_DIST_CERT_PASSWORD`):
   ```
   openssl x509 -inform DER -in distribution.cer -out dist.pem
   openssl pkcs12 -export -legacy -inkey dist.key -in dist.pem -out dist.p12 -name "AI School OS Distribution"
   ```
   (If your OpenSSL says `-legacy` is unknown, run it without `-legacy`.) Back up `dist.key` and `dist.p12` with
   the password in your password manager — like the Android upload key, never in the repo or in chat.
4. **Provisioning profile:** *Profiles → +* → **App Store Connect** (under Distribution) → App ID
   `com.mejortechworld.aischool` → the certificate from step 3 → name it `AI School OS App Store` → download
   `AI_School_OS_App_Store.mobileprovision`. (If you change capabilities later, regenerate it and update the secret.)
5. **App Store Connect API key** (for uploading): https://appstoreconnect.apple.com → *Users and Access →
   Integrations → App Store Connect API → Team Keys → +* → name `GitHub upload`, access **App Manager** →
   download `AuthKey_XXXXXXXXXX.p8` (only downloadable once). Note the **Key ID** and the **Issuer ID** shown at
   the top of the page.
6. **APNs key** (for push notifications from the API): developer.apple.com → *Keys → +* → name `AI School OS push`,
   tick **Apple Push Notifications service (APNs)** → *Configure* → environment **Sandbox & Production** → download
   `AuthKey_YYYYYYYYYY.p8` and note its **Key ID**. (This is a different key from step 5.)

### B. GitHub secrets (once)

GitHub → the repository → *Settings → Secrets and variables → Actions → Secrets → New repository secret*.
Make the base64 strings in Git Bash with `base64 -w0 <file>` (copy the whole output) or in PowerShell with
`[Convert]::ToBase64String([IO.File]::ReadAllBytes("<file>"))`:

| Secret | Value |
|---|---|
| `APPLE_TEAM_ID` | your Team ID (A.1) |
| `ASC_KEY_ID` | the API key's Key ID (A.5) |
| `ASC_ISSUER_ID` | the Issuer ID (A.5) |
| `ASC_KEY_P8` | base64 of `AuthKey_XXXXXXXXXX.p8` (A.5) |
| `IOS_DIST_CERT_P12` | base64 of `dist.p12` (A.3) |
| `IOS_DIST_CERT_PASSWORD` | the .p12 export password (A.3) |
| `IOS_PROFILE` | base64 of the `.mobileprovision` (A.4) |

### C. Push notifications on the server (once)

On the cPanel Node.js app (where the other API environment variables are, see `DEPLOYMENT.md`), add
`APNS_KEY_ID` (A.6 Key ID), `APNS_TEAM_ID` (Team ID) and `APNS_KEY_P8` (base64 of the A.6 `.p8`), then restart the
app. *Messages → Settings → Push notifications* then says "… and the iPhone app on this server". Without these the
app works, it just doesn't offer notifications — but **App Review will see fewer native features** (see *Risks*).

### D. Create the app in App Store Connect (once)

1. *Apps → + → New App*: platform **iOS**, name **AI School OS** (if taken, `AI School OS: School Portal`),
   primary language **English (U.K.)**, bundle ID `com.mejortechworld.aischool`, SKU `aischoolos-ios`,
   user access *Full Access*.
2. *App Information*: subtitle, category **Education** (secondary: Productivity), content rights (No third-party
   content you don't have rights to — the syllabus material is used under the schools' own rights; answer
   truthfully), age rating (see `age-rating-and-audience.md`).
3. *Pricing and Availability*: **Free**; countries — start with Nigeria (add others when schools there use it).
4. *App Privacy*: privacy policy URL `https://ai-schoolportal.mejortechworld.com/legal/privacy`, then the data
   types from `app-privacy.md`.

### E. Build, TestFlight, submit

1. *Actions → "iOS app (TestFlight)" → Run workflow* (leave version empty for 1.0.0). It takes ~10–20 minutes.
   If the first step fails, it lists the missing secrets.
2. App Store Connect → the app → **TestFlight**: the build appears after processing. Answer *Export Compliance*
   if asked (the app sets `ITSAppUsesNonExemptEncryption = NO`: HTTPS and the system's crypto only).
3. *Internal Testing* → add yourself (and colleagues with App Store Connect roles) → install **TestFlight** from
   the App Store on an iPhone → install AI School OS. Test with `review-notes.md`'s checklist, including push,
   offline exams (Airplane Mode) and account deletion.
4. *External Testing* (optional, up to 10,000 testers by email or public link, e.g. a pilot school's parents) —
   the first external build gets a short Beta App Review.
5. *Distribution → iOS App → 1.0 Prepare for Submission*: paste the texts from `listing.md`, upload the screenshots
   (6.7" set into the 6.9"/6.7" slot — App Store Connect scales the others; 6.5", 5.5" optional; **iPad 13"/12.9"
   required** because the app runs on iPad), choose the build, fill *App Review Information* from
   `review-notes.md`, *Version Release* (manual is safest for a first release) → **Add for Review → Submit**.
6. Reviews usually take 1–3 days. If rejected, reply in *App Review* messages (Resolution Center) — often a
   clarification (e.g. that school fees are a real-world service) is enough.

### F. Updates

Website changes reach the app with no App Store release. For shell changes (or Apple's yearly SDK requirement,
usually each April), bump `version` in `ios/package.json` (or type it when running the workflow, or push tag
`ios-v1.0.1`), run the workflow, and submit the new version.

## Risks for App Review

| Risk | What reduces it |
|---|---|
| **4.2 Minimum functionality / "a repackaged website"** — the biggest risk for any web-based app | Native push (needs the APNs keys on the server — set them before review), haptics, native status bar/launch screen, offline mode and offline exams, camera/microphone use. Say so in the review notes. If rejected anyway, reply explaining these, and that the app is a portal for enrolled school users with offline exam delivery; further native additions (e.g. a native tab bar, home-screen quick actions) are the fallback. |
| **2.1 Can't sign in** | Working demo logins in the review notes; keep the demo school seeded and the passwords unchanged |
| **3.1.1 Digital purchases** | Already hidden in the app (above). Don't re-add links or prices for the hidden items in the iOS app |
| **5.1.1(v) Account deletion** | Built (Security & account → Request account deletion). Mention it in the review notes |
| **5.1.1 / 5.1.2 Privacy** | Accurate App Privacy answers; complete privacy notice; usage descriptions explain each permission (`Info.plist`) |
| **1.3 / 5.1.4 Kids** | Not in the Kids Category (see `age-rating-and-audience.md`); content is school material |
| **AI content (generative AI)** | Tutor answers are filtered to school use, with a "can make mistakes" notice; answer the age-rating AI questions honestly |
| **External links** | Paystack, WhatsApp, YouTube and school websites open outside the app; that's allowed (no digital purchase is linked) |

## Costs

- Apple Developer Program: US$99/year (you have it).
- GitHub Actions macOS minutes: on private repositories macOS runners count 10× against the free minutes (a build
  is ~15 minutes ≈ 150 included minutes); public repositories are free.
