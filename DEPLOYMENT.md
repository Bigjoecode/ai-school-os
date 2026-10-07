# Deploying AI School OS

Production today: **https://ai-schoolportal.mejortechworld.com** on Namecheap
Stellar Plus (cPanel, SFTP only — no shell).

```
Browser ──► ai-schoolportal.mejortechworld.com/         static React app (Apache)
        └─► ai-schoolportal.mejortechworld.com/api/...  NestJS API (cPanel Node.js app, Passenger)
                                                         └─► PostgreSQL on the same server
```

Every push to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml):
install → typecheck/build → upload the API bundle and the web build over SFTP
→ restart the API → check both are answering.

## One-time server setup (cPanel)

The deploy uploads files, but it cannot create the database or the Node.js
app. Do these once in cPanel.

### 1. Create the PostgreSQL database

cPanel → **PostgreSQL Databases**

1. Create a database, e.g. `aischool` (cPanel prefixes it: `martcqpk_aischool`).
2. Create a user, e.g. `aischool` → `martcqpk_aischool`, with a strong password.
3. **Add the user to the database** with all privileges.

The connection string is then:

```
postgresql://martcqpk_aischool:<password>@localhost:5432/martcqpk_aischool
```

(URL-encode special characters in the password, e.g. `@` → `%40`, `#` → `%23`.)

> If **PostgreSQL Databases** is missing from your cPanel, the plan doesn't
> include it on this server — stop here and ask; the app would need a MySQL
> variant of the schema.

### 2. Create the Node.js app

cPanel → **Setup Node.js App** → **Create Application**

| Field | Value |
|---|---|
| Node.js version | the highest offered (22 or newer) |
| Application mode | Production |
| Application root | `ai-school-api` |
| Application URL | `ai-schoolportal.mejortechworld.com` / `api` |
| Application startup file | `main.js` |

Then add these **environment variables** and click **Create**:

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the connection string from step 1 |
| `JWT_SECRET` | a long random string (generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`) |
| `RUN_MIGRATIONS_ON_BOOT` | `true` |
| `APP_ENCRYPTION_KEY` | another long random string (same command as `JWT_SECRET`). Encrypts each school's saved Paystack key — **never change it** once schools have connected Paystack |
| `BOOTSTRAP_OWNER_EMAIL` | your email — becomes the platform super admin |
| `BOOTSTRAP_OWNER_PASSWORD` | a strong password (12+ characters) |
| `SEED_DEMO_ON_BOOT` | `true` to load the Greenfield demo school, otherwise `false` |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | AI providers: set one or both (see *AI providers* below) |
| `CRON_SECRET` | another long random string — lets the cron job below send scheduled messages and automations |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | optional — browser push notifications. Generate once on your computer with `npx web-push generate-vapid-keys`; **never change them** afterwards |
| `VAPID_SUBJECT` | `mailto:` + your email, if you set the VAPID keys |

Do **not** click "Run NPM Install": the API ships as a single bundled file
with no dependencies to install.

### 3. Deploy

GitHub → **Actions → Deploy → Run workflow** (or push to `main`). The API
creates its tables, your owner account and (optionally) the demo school on
first start. Check **https://ai-schoolportal.mejortechworld.com/api/health**
returns `{"status":"ok",...}`.

Then **remove `BOOTSTRAP_OWNER_PASSWORD`** from the app's environment variables
(the account stays; the variable is only read when no owner exists).

## Online fee payments (Paystack)

Each school connects its own Paystack account, so fees are paid straight to
the school. In the app: **Fees → Settings → Paystack**, paste the school's
public and secret keys (test keys first), then copy the **webhook URL** shown
there into Paystack → Settings → API Keys & Webhooks. Paystack signs every
webhook; the API rejects any that don't verify, and re-checks each payment
with Paystack before marking an invoice paid.

## Scheduled messages and automations (cron)

Shared hosting puts an idle Node.js app to sleep, so a cron job wakes the API
every five minutes to send scheduled messages, event reminders and birthday
messages. cPanel → **Cron Jobs** → Common settings "Once per five minutes",
command:

```
curl -s -X POST -H "x-cron-key: <your CRON_SECRET>" https://ai-schoolportal.mejortechworld.com/api/cron/tick > /dev/null
```

## Email, SMS and WhatsApp

Each school connects its own accounts in the app: **Messages → Settings**.

- **Email** — any SMTP mailbox. The simplest is a cPanel email account on the
  school's domain (host `mail.<domain>`, port 465, SSL). Zoho and Google
  Workspace (with an app password) also work.
- **SMS** — a [Termii](https://termii.com) account: API key and an approved
  sender ID. Many Nigerian numbers are on DND; ask Termii to enable the DND
  route for the school, then tick "DND route".
- **WhatsApp** — the WhatsApp Cloud API (Meta Business). Create and get
  approved a *utility* template with two body variables, e.g.
  `Message from {{1}}: {{2}}`, then enter the phone number ID, a permanent
  access token and the template name.

Every message is recorded per recipient, with the reason for anything skipped
(no email on record, channel not set up) or failed.

## WhatsApp parent assistant

Parents message the school's WhatsApp number and the Parent AI answers about
their own children (attendance, results, fees, homework, events). Urgent
messages and anything it can't answer go to staff under **Messages → WhatsApp
assistant**, where staff can also reply. Each school uses its own Meta app and
number; all of them point at the same webhook.

1. **Meta app.** At [developers.facebook.com](https://developers.facebook.com)
   create an app of type *Business* and add the **WhatsApp** product. Link it to
   the school's Meta Business account (verify the business to lift the limits
   on new numbers).
2. **Business number.** Under WhatsApp → API Setup, add the school's phone
   number (it can't be in use on the ordinary WhatsApp or WhatsApp Business
   app at the same time) and verify it by SMS or call. Copy the **phone number
   ID** (not the phone number itself).
3. **Permanent token.** In Business settings → Users → System users, create a
   system user, give it the app and the WhatsApp account with *full control*,
   and generate a token with `whatsapp_business_messaging` and
   `whatsapp_business_management`. Temporary tokens from API Setup expire in a
   day — don't use them.
4. **Connect WhatsApp** in the app: Messages → Settings → WhatsApp (phone
   number ID, token, template — the template is for messages the school starts,
   such as broadcasts).
5. **App Secret.** In the Meta app: App settings → Basic → App secret → Show.
   Paste it in Messages → WhatsApp assistant → Set-up. It is stored encrypted
   and used to check the `X-Hub-Signature-256` signature on every webhook, so
   nobody else can post fake messages. Saving the settings also creates the
   school's **verify token**.
6. **Webhook.** In the Meta app: WhatsApp → Configuration → Webhook → Edit.
   - Callback URL: `https://ai-schoolportal.mejortechworld.com/api/whatsapp/webhook`
   - Verify token: copy it from the Set-up tab.
   Click *Verify and save*, then under Webhook fields **subscribe to
   `messages`**.
7. **Switch it on** in the Set-up tab and send `HELP` from a parent's phone to
   the school's number. The checklist ticks "Test it" once a message arrives.

How parents are recognised: the sender's number (0803…, +234803…, 234803…)
must match a parent record of that school with a parent portal login and an
active account. Unknown numbers get a polite reply with the school's contact
details and how to get a portal login — no student information. Parents can
send `STOP` (and `START`) to turn replies off and on, and `HELP`.

Costs and limits:

- **Meta charges.** Replies to a parent who wrote in the last 24 hours (the
  *customer service window*) are free-form messages; Meta does not charge for
  service conversations. Messages the school starts outside the window must
  use an approved template and are charged per message at Meta's Nigeria
  rates (utility/marketing). Staff replies from the inbox are only allowed
  inside the 24-hour window; after that, send a template message from Messages
  → New message.
- **AI spend.** Answers use the school's normal AI allowance and are recorded
  in AI usage. Each parent can send at most 20 messages an hour, and each
  school sets a cap on AI answers per day (default 300, in the Set-up tab).
  When the cap or the monthly AI budget is reached, or AI is unavailable,
  parents get a friendly holding reply and staff are notified in the app.
- **Hand-over.** Messages mentioning illness, emergencies, accidents,
  injuries, bullying or fights are never answered by the AI: the parent gets an
  acknowledgement (with the school's phone number) and staff are notified.
- **Read-only.** The assistant runs as the parent with parent-only access and
  can't change any record. Only text messages are answered; voice notes and
  images get a "please type your question" reply.
- **New numbers** start with Meta's messaging limits (business-initiated
  conversations per day) until the business is verified and quality is good;
  replies to parents' own messages are not limited this way.

## Live classes (Google Meet, Zoom, BigBlueButton)

Schools connect their own accounts in **Live classes → Settings**. Zoom and
BigBlueButton need nothing on the server. Google Meet needs one OAuth client
for the whole platform, created once:

1. [Google Cloud console](https://console.cloud.google.com) → new project →
   enable the **Google Calendar API** and the **Google Meet REST API**.
2. **OAuth consent screen**: External, add the scopes `calendar.events` and
   `meetings.space.readonly`, then publish it (Google reviews apps that use
   these scopes before strangers can connect).
3. **Credentials → Create OAuth client ID → Web application**, authorised
   redirect URI `https://ai-schoolportal.mejortechworld.com/api/live/google/callback`.
4. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to the Node.js app's
   environment variables and restart it.

Each school then clicks **Connect Google Meet** and signs in with a Google
Workspace account; Meet links are created on that account's calendar.
Attendance, recordings and transcripts come from the Meet REST API and depend
on the school's Workspace edition. Zoom attendance needs a Pro plan or higher
and a Server-to-Server OAuth app with the `meeting:write`, `meeting:read`,
`recording:read` and `report:read` scopes. BigBlueButton keeps no attendance
after a meeting, so attendance comes from students joining through the portal.

## School websites and uploads

Each school's website is at `https://ai-schoolportal.mejortechworld.com/s/<slug>`
once it is published in **Website → Overview**.

**Own domain.** To serve a school's website at the root of its own domain
(for example `www.greenfieldschool.ng`):

1. Point the domain at this hosting account (an A record, or add it in
   cPanel as an **Alias**/parked domain of the portal's subdomain so it
   serves the same web root).
2. Issue SSL for it in cPanel (**SSL/TLS Status → Run AutoSSL**).
3. In the console, **Platform → Domains → Add domain**: pick the school,
   enter the hostname and choose **Website** (or **Portal** for a school's
   own sign-in address), then **Verify DNS**. Any hostname not listed keeps
   showing the portal.

**Uploads.** Images and documents uploaded for websites, assignment
hand-ins (photos, videos, voice notes), uploaded curricula and sample report
cards are stored on disk,
in `UPLOAD_DIR` (default: `uploads/` inside the Node.js app root, e.g.
`/home/martcqpk/ai-school-api/uploads`). The deploy never touches that
folder. Include it in your backups. `UPLOAD_MAX_MB` (default 10) caps each
document or image; `UPLOAD_MEDIA_MAX_MB` (default 50) caps each video or audio
file. Raise the limit on the web server too if you go above ~20 MB, and watch
the account's disk quota: videos add up quickly.

## Running the platform (operator console)

Platform staff sign in like everyone else and get the **Platform** menu.
There are three platform roles: **super admin** (everything), **support**
(schools, support tickets, domains, system health and the audit log, but no
billing) and **finance** (subscriptions, invoices, payments and plans). The
first super admin comes from `BOOTSTRAP_OWNER_EMAIL` / `BOOTSTRAP_OWNER_PASSWORD`.
For now, give other staff their role in the database
(`UPDATE users SET "platformRole" = 'SUPPORT_ADMIN' WHERE email = '…'`).

**Plans decide which modules a school gets.** Each plan lists its modules
(AI, website, live classes, messages, online payments, payroll, timetable,
library, inventory, transport, hostel). A plan that lists none includes
them all. When a module isn't in a school's plan, its menus are hidden and
its API answers 403. You can switch a module on or off for one school as an
override, or switch it off for every school with the flag's master switch
in **Platform → Feature flags**. Beta flags roll out to a percentage of schools.

**Subscription billing.** Schools are billed per student per period: the
larger of the seats they committed to and their active students, at the
plan price or a negotiated one, less any discount. An hourly cycle rolls
finished periods into the next and invoices them. A subscription with an
overdue invoice becomes past due. Nothing is suspended automatically;
suspending a school is always a person's decision, with a reason recorded
in the audit log. These environment variables control billing:

| Variable | Purpose |
|---|---|
| `PLATFORM_PAYSTACK_SECRET_KEY` | Your own Paystack secret key, so schools can pay their subscription online. Without it, schools see bank details instead. |
| `PLATFORM_BANK_DETAILS` | Bank transfer instructions shown on invoices; use `\n` for new lines. |
| `PLATFORM_INVOICE_DUE_DAYS` | Days to pay an invoice (default 14). |
| `PLATFORM_DOMAIN_TARGET` | The hostname schools' own domains must point to (CNAME), e.g. `ai-schoolportal.mejortechworld.com`. |

In your Paystack dashboard, set the webhook URL to
`https://ai-schoolportal.mejortechworld.com/api/billing/paystack/webhook`
so payments settle even if the school closes the tab. Payments the finance
team receives by transfer are recorded against the invoice in
**Platform → Billing**.

**Usage and health.** API requests are counted per school per day.
AI spend is metered on every call, including the console's own AI
briefing and support drafts. **Platform → System health** checks the
database, AI providers, encryption key, cron job, error rate and queues.

## AI providers

Every AI feature asks for a tier, never a model: **Standard** (tutoring,
assistants, drafts) or **Advanced** (deeper explanations, AI Pro,
briefings). **Platform → AI models** decides which model each tier uses for
each provider, which provider is tried first, and the prices used for cost
tracking, budgets and unit economics. Changes apply within seconds; no
redeploy.

1. Add the API keys to the Node.js app (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
   optionally `GEMINI_API_KEY`) and restart. Keys are never stored in the
   database or shown in the console.
2. In **Platform → AI models**, set the order (e.g. OpenAI first, Anthropic
   as backup), check the model names and prices against the providers'
   pricing pages, and press **Test** on each provider and tier.

If the first provider fails (outage, rate limit, wrong key or model name),
the next one answers and you get an email alert. Conversations use prompt
caching (Anthropic explicitly; OpenAI automatically), so repeated
instructions and history are billed at a fraction of the price. A model
used without a price is costed at $0 and triggers an alert: add its price.

**Tutor voice.** Students can talk to the AI tutor and hear its replies.
Speech in and out uses OpenAI's audio models, so it needs `OPENAI_API_KEY`
even if another provider answers the chat. Optional settings:
`OPENAI_TRANSCRIBE_MODEL` (default `gpt-4o-mini-transcribe`),
`OPENAI_TTS_MODEL` (default `gpt-4o-mini-tts`) and `OPENAI_TTS_VOICE`
(default `coral`). Without the key, the app falls back to the phone's own
speech features where the browser has them. Voice costs roughly $0.003 per
minute listened and $0.015 per minute spoken; it shows as "Tutor voice" in
AI usage and doesn't use up a student's daily message allowance (the chat
message itself does).

**Nigerian languages.** Students can choose the language their AI tutor and
careers counsellor explain in (English, Naijá/Pidgin, Yorùbá, Igbo or Hausa)
from the tutor page; parents can set it for a child on the child's progress
page. Parents choose their own language on *My family*; the Parent AI (in the
app and on WhatsApp) and the weekly learning update use it, or the school's
default for parents (Messages → Settings). Subject and exam terms, topic
names, scores and amounts always stay in English/digits, because WAEC, NECO
and JAMB are in English. **Yoruba, Igbo and Hausa quality depends on the AI
model in use**: have a native speaker review tutor replies, Parent AI replies
and learning updates in each language during the pilot before promoting it.
Spoken replies use OpenAI's English-trained voices, so Yoruba, Igbo and Hausa
may sound accented (the app says so); speech-to-text gets the language as a
hint. Weekly updates without AI stay in English with one fixed opening line
in the parent's language; SMS in Yoruba, Igbo or Hausa uses Unicode (tone
marks), which costs more SMS pages.

## Email alerts and the demo accounts

**Alerts.** Get an email when something breaks: unexpected server errors,
the app failing to start (for example a wrong database password), and
failing health checks every 15 minutes (database, AI failures, stuck jobs,
messages not sending). The same problem is sent at most once an hour.
Create a mailbox in cPanel (**Email Accounts**, e.g. `alerts@mejortechworld.com`)
and add to the Node.js app:

| Variable | Value |
|---|---|
| `ALERT_EMAIL` | where alerts go (comma-separate several) |
| `SMTP_HOST` | `mail.mejortechworld.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | the mailbox, e.g. `alerts@mejortechworld.com` |
| `SMTP_PASSWORD` | its password |

Save, Restart, then **Platform → System health → Send test alert**.

**Demo accounts.** The login page lists the demo logins while the demo
school is loaded. Before real schools join, set `SHOW_DEMO_ACCOUNTS=false`
(and `SEED_DEMO_ON_BOOT=false`), restart, and archive the demo schools in
**Platform → Schools**.

## Onboarding a school

1. **Platform → Schools → New school** creates the school and its first admin.
2. The admin signs in and opens **Setup**: one form each for the academic
   year and terms, classes (Nursery, Primary, JSS, SS templates with your arm
   names) and subjects (the Nigerian curriculum, ticked per stage).
3. **Import data** takes CSV files (in Excel: File → Save as → CSV UTF-8):
   students with their parents, staff, and past results. Download the
   template, upload, check the preview (errors are shown per line and left
   out), then import. Parents are matched by phone, so siblings share one
   parent; re-uploading a corrected file skips students already imported.
   Ticking "give logins" returns a one-time file of emails and passwords to
   hand out privately; passwords are not stored in plain text and can't be
   shown again.

## Parent payments, sponsorships and the knowledge base

Parents pay for AI Student Plus/Family/Pro and Exam Prep from the **Family**
page with your platform Paystack account (`PLATFORM_PAYSTACK_SECRET_KEY`).
The same webhook URL handles school invoices, parent orders and refunds:
`https://ai-schoolportal.mejortechworld.com/api/billing/paystack/webhook`.
In Paystack, enable the `charge.success` and `refund.*` events.

- **Renewals** charge the card saved at checkout at the end of each period
  (up to three daily attempts), then fall back to a reminder and a
  week's grace. `APP_ENCRYPTION_KEY` must be set, or cards can't be saved
  and parents renew by hand.
- **Products and prices** (and coupons) are edited in **Platform → Products**.
  The catalogue, syllabus topics and a starter bank of original exam
  questions are installed automatically on first start; edits in the
  console are never overwritten.
- **Sponsorships**: a school pays for AI or exam prep for whole classes from
  **Sponsorships**; access starts at once and the school is invoiced on its
  AI School OS account.
- **Knowledge base**: schools upload PDF or Word documents (or paste text).
  Documents are split into passages and searched with PostgreSQL full-text
  search inside the school; no extension or vector database is needed.
  Scanned PDFs have no text layer: paste the text instead.
- **Unit economics** converts AI costs (in dollars) with `NAIRA_PER_USD`
  (default 1600). Update it as the rate moves.

## Backups

The app does not back up the server itself; use the hosting account's own
tools, which run outside the app and can restore everything.

- **Database, daily.** In cPanel open **JetBackup** (where the plan includes
  it) and check that daily database backups are on and kept for at least
  7–14 days. Before any risky change (a large import, an upgrade with
  migrations) take one by hand: **JetBackup → Database Backups**, or
  **cPanel → Backup** (database backups section), or **phpPgAdmin** →
  select the database → **Export** (SQL). Keep a copy off the server.
- **Uploads.** Uploaded files live in `UPLOAD_DIR` (default
  `/home/martcqpk/ai-school-api/uploads`), outside the web root. JetBackup's
  home-directory backups include it. For an extra copy, open **File Manager**,
  right-click the `uploads` folder, choose **Compress** (Zip), then download
  the archive and delete it from the server afterwards.
- **Test a restore** once a term: restore last night's database into a
  spare database in cPanel and point a local copy of the API at it.
- **Schools' own copies.** School admins (with *school.manage*) can download
  their school's records as a ZIP of CSV files from **Settings → Backup &
  export**. It holds only that school's data, never passwords, two-step
  secrets, tokens or payment keys, and every download is in the audit log.
  It is for the school's records and moving elsewhere, not a substitute for
  the database backups above (it can't be restored into the app directly).

## Two-step sign-in

Anyone can turn on two-step sign-in (an authenticator app such as Google or
Microsoft Authenticator) in **Settings → Security**. Each user gets 10
one-time recovery codes. Notes for operators:

- It needs `APP_ENCRYPTION_KEY` (the same key that protects payment and SMS
  keys): each user's authenticator secret is stored encrypted with it. Never
  change the key once people have set up two-step sign-in, or they will all
  need a reset.
- A school can **require** it for powerful roles (school admin, principal,
  accountant, and anyone who can manage users, roles, settings or money) in
  **Settings → Security**. Those staff are then sent to a set-up screen after
  signing in, and the API refuses everything else until it is done.
- Platform staff are shown a strong reminder. To **enforce** it for all
  platform staff, set `REQUIRE_PLATFORM_2FA=true` in the Node.js app's
  environment and restart (turn it on for yourself first).
- **Lost phone and recovery codes:** a school admin with *users.manage* can
  reset a member's two-step sign-in in **Settings → Security** (not platform
  staff). Platform super and support admins can reset anyone with
  `POST /api/auth/2fa/platform-reset` and `{ "email": "..." }`. Resets sign
  the person out everywhere and are written to the audit log. Check the
  person's identity before resetting.
- Server clocks must be right (cPanel servers use NTP); codes allow about
  30 seconds of drift either way.

## Offline CBT (exam packs)

For schools with poor internet or power: an online exam can be sat with **no
connection at all** during the exam. Nothing extra to configure on the server;
the site must be served over **https** (browsers only allow the encryption
used here on secure pages) and the app installed or opened once on each
device while online.

How a school runs it:

1. **Teacher / exam officer** (exam › **Offline** tab): turn on *Available
   offline*, set *Can start from* and *Must sync by*. A 10-character
   **invigilator start code** is made; keep it secret until the exam starts.
   Print the **invigilator sheet** (code, instructions and per-student
   **exam PIN** slips). *Change code* if it leaks — every device must then
   download again.
2. **The day before (online):** each student opens **Exams › Download for
   offline** on their own phone or laptop, *or* a teacher signs in on a shared
   school laptop/tablet and taps **Prepare this device** (one encrypted copy for
   the whole class). Charge every device; bring power banks.
3. **Exam day (offline):** open **Offline exams** (it opens with no internet),
   pick the exam, the invigilator types the start code. On a shared device each
   student then enters their admission number and the exam PIN from their slip.
   The device keeps the time, saves every answer on the device and hands in at
   zero. After a hand-in on a shared device, tap *Next student*.
4. **After (online):** open the app on each device (staff sign in on shared
   devices). Answers upload by themselves, or tap **Sync now**. Don't clear
   browser data until every hand-in shows *Sent*. The Offline tab shows each
   student as downloaded / started / synced, and lists anything flagged.

Security, briefly: the pack is AES-256-GCM encrypted with a key derived from
the start code (PBKDF2-SHA256, 600 000 rounds, per-pack salt); answer keys and
model answers never leave the server. Each student's seat is wrapped again
with the code + their exam PIN on shared devices. Hand-ins are signed with a
per-student HMAC key; a payload that fails the check, or a student who also
sat online, is **held** for the teacher (Accept / Reject). Over-time, device
clock changes, starting outside the window, late syncs and stale packs are
flagged but still marked. The same hand-in uploaded twice counts once.

## GitHub secrets

| Secret | Value |
|---|---|
| `SSH_HOST`, `SSH_PORT`, `SSH_USER` | Namecheap SSH/SFTP details |
| `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS` | deploy key and the pinned host key |
| `DEPLOY_PATH` | `/home/martcqpk/ai-schoolportal.mejortechworld.com` (web root) |
| `API_DEPLOY_PATH` | `/home/martcqpk/ai-school-api` (Node.js app root) |

Setting a path secret from Git Bash on Windows rewrites `/home/...` into a
Windows path. Prefix the command: `MSYS_NO_PATHCONV=1 gh secret set ...`.

## How it works on shared hosting

- **No `npm install` on the server.** `apps/api/scripts/bundle.mjs` inlines
  every dependency into `bundle/main.js`. Prisma 7 needs no native query
  engine, and passwords use Node's built-in `scrypt`, so nothing needs compiling.
- **Migrations run at boot** (`RUN_MIGRATIONS_ON_BOOT=true`) because the
  database only accepts local connections. The runner writes Prisma's own
  `_prisma_migrations` table, so it's interchangeable with `prisma migrate`.
- **Restart** = the deploy uploads `tmp/restart.txt`; Passenger reloads the
  app on the next request.
- **`.htaccess`** — cPanel keeps its own rules in the web root's `.htaccess`.
  The deploy only replaces the block between `# BEGIN AI School OS` and
  `# END AI School OS`, so those survive.

## Moving off shared hosting later

Nothing is tied to cPanel. On a VPS or container host: run `node main.js` from
the bundle (or `npm start` in `apps/api`) behind any reverse proxy that sends
`/api` to it, serve `apps/web/dist` as static files with an SPA fallback, and
point `DATABASE_URL` at the new database.
