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
| `DATABASE_POOL_MAX` | optional, default `10`: database connections the API keeps open (see *Capacity and performance*) |
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

## Capacity and performance (shared hosting)

The API is **one Node process** with a pool of database connections; the
database is on the same host. What limits it is the Node process's CPU (every
request is checked, scoped to its school and serialised in that one process),
then the hosting account's CPU/entry-process limits (CloudLinux LVE).

**Settings that matter.**

| Name | Value |
|---|---|
| `DATABASE_POOL_MAX` | Database connections the API keeps open. Default **10**; use 8–10 on shared hosting. More does not help one Node process, and the account's PostgreSQL connection limit is shared with backups and phpPgAdmin (leave at least 5 spare). |

Connections stay open for 5 minutes when idle (opening one starts a Postgres
backend process), and a request that can't get a connection within 20 s fails
instead of hanging.

**Rate limits and school networks.** A whole school (or exam hall) usually
reaches the internet through one IP address. Signed-in requests are therefore
rate-limited **per user**, not per IP (e.g. CBT saves: 240 a minute per
student; everything else: 300 a minute per user). Sign-in is limited per IP
**and account** (10 a minute each) with a ceiling of 200 sign-ins a minute per
IP; token refresh per IP and session (60 a minute) with a ceiling of 600 a
minute per IP. Before this, 20 pupils behind one router could start a CBT and
the rest got "Too many requests" (measured: 40 of 60 starts refused).

**Housekeeping (daily, automatic).** Sign-in session records older than 400
days (all long expired), read notifications older than 400 days, and game
rounds started but never answered after 30 days are deleted once a day in
small batches (`apps/api/src/prisma/housekeeping.service.ts`). The audit log
is not touched. See `docs/legal/data-retention.md`.

**Measured (October 2026).** Load tests against the production bundle with
`--max-old-space-size=512`, the database on the same machine, on a 4-core
development PC that was already ~99% busy with other work, so absolute
latencies are pessimistic; the comparison before/after is what counts.
Students had their own IP addresses except in the shared-IP test.

| Scenario | Before | After |
|---|---|---|
| CBT, 200 students start within 1 min, save every ~10 s for 4 min | start p50 17.5 s, list p50 57 s (87 of 200 timed out), save p50 0.36 s / p95 15 s | start p50 0.9 s, list p50 0.5 s (0 failures), save p50 28 ms / p95 7 s, 18 req/s |
| CBT, 500 students, 10 min | collapsed: 460 of 500 starts failed (timeouts, then connections refused); ~1% of saves stored | all 500 started (p50 12 s), 96% of saves stored (p50 7.5 s, p95 32 s); 358 of 500 hand-ins answered, 142 got an error under the overload (answers were already saved; the attempt stays open and the per-minute sweep hands it in when time is up) |
| Morning rush, 300 sign-ins + 5 page loads each in 2 min | 178 of 300 sign-ins timed out, most page loads timed out | 299 of 300 sign-ins (p50 27 s: scrypt hashing on a busy CPU), 97–100% of page loads OK |
| Games, 200 concurrent Quiz Rush players, 3 min | 60% of answers timed out, every finish failed | 99% of answers stored (p50 4.4 s), 547 of 655 finishes OK (the rest hit the overload); hub p50 10 s |
| CBT, 60 students on **one IP**, 2 min | 40 of 60 starts refused (429) | 60 of 60 started, every save stored |

Memory: the process peaked at about 410 MB RSS (heap about 230 MB) with 500
students; it idles at about 210 MB. Database connections peaked at the pool
size (10) plus one for boot tasks.

**What the current host can take.** Normal school use for the 10-school
pilot (hundreds of daily users, homework, results, games, parents) and an
online CBT of **up to about 150–200 students at the same time** across the
platform. Above that, pages slow down for everyone while the exam runs,
because every school shares the one process.

**When to move to a VPS.** Move before any of these: a CBT with more than
about 200 students online at the same time (e.g. a whole school's mock exam
in one sitting), more than about 1,500 daily active users, `/api/health`
`dbLatencyMs` regularly above 200 ms, or the host's resource graphs showing
the CPU or entry-process limit being hit. Until then, large exams can run as
**offline exam packs** (see *Offline CBT*), which need the server only for the
download and the sync, or in staggered sittings (two halls an hour apart).

**VPS size.** 4 vCPU, 8 GB RAM, SSD (e.g. a 4 vCPU/8 GB VPS from Namecheap,
Hetzner CPX31 or DigitalOcean), PostgreSQL 16 on the same server with
`max_connections = 100` and `shared_buffers = 2GB`, the API as one Node
process at first with `DATABASE_POOL_MAX=20`. That gives the Node process a
whole uncontended core plus room for Postgres, which is enough for a 500-student
CBT. Running more than one API process needs care first: rate limits,
two-step sign-in replay protection and the short caches are kept in memory per
process.

## Monitoring, alerts and backups (runbook)

Three layers, from the outside in. Set up all three; each catches what the
others miss.

### 1. Uptime: is the site answering?

**GitHub (already in the repo).** [.github/workflows/uptime.yml](.github/workflows/uptime.yml)
runs every 15 minutes. It checks `/api/health` (HTTP 200, `"status":"ok"`,
`"db":"ok"`, answered within 15 s, three tries 20 s apart so a sleeping app can
wake) and the web root (HTTP 200 with the app page). On failure it opens an
issue labelled **outage**, assigned to and @mentioning the repository owner, so
GitHub emails you; while it stays down it comments at most once an hour (or
when the symptoms change), and the failed run itself also sends GitHub's
"workflow failed" email. When the site answers again it closes the issue
with how long it was down. It needs no secrets (the built-in `GITHUB_TOKEN`
with `issues: write`).

- Check once: **Actions → Uptime → Run workflow**; the run should be green.
- Make sure the emails reach you: on the repo, **Watch → All activity** (or at
  least *Issues*), and GitHub → **Settings → Notifications → Email** ticked for
  *Participating* and *Watching*.
- Limits: GitHub starts scheduled runs on a best-effort basis. They are often
  5–30 minutes late at busy times, sometimes skipped, and **switched off after
  60 days without a commit** to the repository (GitHub emails a warning;
  re-enable under Actions → Uptime). That is why you also want:

**An external monitor (free, every 5 minutes, the second line).**

*UptimeRobot* ([uptimerobot.com](https://uptimerobot.com), free plan):

1. Sign up, verify your email, then **+ New monitor**.
2. Monitor type **Keyword**. URL
   `https://ai-schoolportal.mejortechworld.com/api/health`, keyword `"db":"ok"`,
   alert when the keyword **does not exist**. Friendly name "AI School OS API".
   Interval 5 minutes. Under *How will we notify you?* tick your email (and
   install the UptimeRobot app for push alerts if you like). **Create monitor.**
3. **+ New monitor** again: type **HTTP(s)**, URL
   `https://ai-schoolportal.mejortechworld.com/`, name "AI School OS web",
   5 minutes, same email. **Create monitor.**

*Or Better Stack* ([betterstack.com/uptime](https://betterstack.com/uptime), free plan):
**Monitors → Create monitor** → *Alert us when* "URL doesn't contain keyword",
URL `https://ai-schoolportal.mejortechworld.com/api/health`, keyword
`"status":"ok"`, check every 3 minutes, on-call escalation: email. Add a
second "URL becomes unavailable" monitor for the web root.

Both also keep the API awake, like the cron job does.

**What `/api/health` returns** (public, nothing secret):

```json
{"status":"ok","db":"ok","dbLatencyMs":3,"version":"93fe8d1","uptimeSeconds":5120,
 "time":"…","lastMigration":"20261009120000_edugames","backup":"ok","lastBackupAt":"…"}
```

`version` is the deployed git commit (the build stamps it from `GITHUB_SHA`).
`backup` is `ok`, `failed`, `stale` (no good backup for 30 hours) or `none`
(the backup cron job isn't set up yet). When the database is down it answers
**HTTP 503** with `"status":"error","db":"down"`. The full picture, for
platform staff, is **Platform → System health**, which now also shows the
database backup.

### 2. Alerts: the API emails you when something breaks

**Set it up (cPanel, 5 minutes).**

1. cPanel → **Email Accounts → Create**: e.g. `alerts@mejortechworld.com`
   with a strong password (or use any SMTP mailbox you already have).
2. cPanel → **Setup Node.js App** → the `ai-school-api` app → **Edit** →
   *Environment variables* → **Add variable** for each:

   | Name | Value |
   |---|---|
   | `ALERT_EMAIL` | where alerts go, e.g. your Gmail (comma-separate several) |
   | `SMTP_HOST` | `mail.mejortechworld.com` (Email Accounts → Connect Devices shows it) |
   | `SMTP_PORT` | `465` |
   | `SMTP_USER` | `alerts@mejortechworld.com` |
   | `SMTP_PASSWORD` | that mailbox's password (typed in cPanel only, never in the repo or chat) |
   | `SMTP_FROM` | optional; defaults to `SMTP_USER` |

3. **Save**, then **Restart**.
4. Sign in as the super admin → **Platform → System health → Send test
   alert** (or `POST /api/platform/alerts/test`, super admin only). The
   email arrives within a minute; if the mail server refuses, the button
   shows its error. Check the spam folder the first time and mark it "not spam".

**What is emailed.** Unexpected server errors (500s, per route); a **burst**
of 20+ server errors of any kind (including 502/503) within 5 minutes; the API
**failing to start** (bad database password, a failed migration); the API
**crashing** (reported by the next process when Passenger restarts it);
unhandled promise rejections; **boot installs failing** (platform content,
built-in roles, exam syllabi, career library, JAMB brochure); **scheduled
jobs failing** (the scheduler tick, school automations, online-exam and other
tick tasks); **Paystack webhooks** that fail to process and payments whose
amount doesn't match; and, every 15 minutes, the health checks: database down
or slow, **uploads folder not writable** (disk quota full, permissions), the
**database backup failed or older than 30 hours**, AI providers failing,
AI jobs stuck and messages failing to send. Also AI provider fallbacks,
unpriced AI models and WhatsApp webhook problems.

**No email storms.** Problems are collected and sent as one digest every 5
minutes; the same problem is emailed at most **once an hour** (remembered in
the server's temp folder, so restarts don't reset it), with how many times it
happened. A failed start is emailed at most once an hour even though Passenger
retries on every request. Emails never contain request bodies, passwords or
personal data, only the route and the error.

### 3. Backups and restore

| What | Covers | Restorable? |
|---|---|---|
| Nightly `pg_dump` by `scripts/backup-db.sh` (cPanel cron, below) | the whole database, every school | Yes, full restore (tested) |
| JetBackup / cPanel Backup (the host's own) | database and home folder incl. `uploads/` | Yes, through cPanel |
| School export (**Settings → Backup & export**, ZIP of CSVs) | one school's records, no passwords or keys | **No**: there is no import for it |

**A. Daily automatic database backup (do this once).** Each deploy puts
`backup-db.sh` and `restore-db.sh` in `~/ai-school-api/scripts/`.

1. cPanel → **File Manager** → your home folder (`/home/martcqpk`) →
   *Settings* → tick **Show Hidden Files**. **+ File** named
   `.ai-school-backup.env`, **Edit**, one line (the same value as the Node.js
   app's `DATABASE_URL`):
   ```
   DATABASE_URL=postgresql://martcqpk_aischool:<password>@localhost:5432/martcqpk_aischool
   ```
   Save, then right-click → **Change Permissions** → `600`. This file holds
   the database password: it lives outside `public_html` and is never in the repo.
2. cPanel → **Cron Jobs** → *Cron Email*: your email. Cron emails you only
   when the script prints something, which it does only on failure.
3. *Add New Cron Job*: Minute `15`, Hour `2`, Day `*`, Month `*`, Weekday `*`
   (02:15 server time, daily), command:
   ```
   /bin/bash $HOME/ai-school-api/scripts/backup-db.sh
   ```
4. **Test it now**: add a second, temporary cron job with the same command
   and *Once Per Minute*; after two minutes open `backups/db/` in File
   Manager. You should see `aischool-<date>_<time>.sql.gz` and
   `last-backup.json` with `"status":"ok"`, and `/api/health` shows
   `"backup":"ok"`. **Delete the temporary job.** If you get an email
   saying `pg_dump was not found`, ask Namecheap support for the folder that
   holds `pg_dump` and add `PG_BIN=/that/folder` to `.ai-school-backup.env`.

The script keeps the last **7 daily** dumps in `~/backups/db/` and, every
Sunday, a copy in `~/backups/db/weekly/` kept for **4 weeks** (change with
`KEEP_DAILY` / `KEEP_WEEKLY` in the env file). Dumps are plain SQL, gzipped,
without owners or grants, so they restore under a different cPanel user. A
dump that is cut short is rejected (it must end with pg_dump's completion
line). If a run fails, or no run succeeds for 30 hours, you get an alert email
(from the API, via `last-backup.json`) as well as cron's own email.

**Weekly off-site copy (Sundays, 2 minutes).** File Manager →
`backups/db/weekly/` → right-click the newest file → **Download**; keep it on
your computer *and* in cloud storage (Google Drive etc.), and delete copies
older than a few months. The dump holds every school's personal data: store it
where only you can open it. Never commit it or put it on GitHub (not as an
Actions artifact either: on a public repo those are downloadable). Keep
JetBackup on as the host-level copy, and zip `ai-school-api/uploads` monthly
(see *Backups* above).

**Manual backup before a risky change** (a large import, an upgrade with
migrations): run the cron command once (a temporary *Once Per Minute* job,
then delete it), or **JetBackup → Database Backups**, or **cPanel → Backup** (the database
downloads, where your server lists PostgreSQL there). phpPgAdmin's Export also
works for a small database.

**B. Restore the whole database (tested end to end).** Restore into a **new,
empty** database and switch to it, so the broken one stays as it was until
you are sure:

1. cPanel → **PostgreSQL Databases**: create `aischool_restore` (it becomes
   `martcqpk_aischool_restore`) and **add the existing user**
   `martcqpk_aischool` to it with all privileges.
2. Pick the dump in File Manager (`~/backups/db/aischool-<date>.sql.gz`; for an
   off-site copy, upload it there first).
3. Add a line to `~/.ai-school-backup.env`:
   ```
   RESTORE_DATABASE_URL=postgresql://martcqpk_aischool:<password>@localhost:5432/martcqpk_aischool_restore
   ```
4. Cron Jobs → temporary job, *Once Per Minute*:
   ```
   /bin/bash $HOME/ai-school-api/scripts/restore-db.sh $HOME/backups/db/aischool-<date>.sql.gz >> $HOME/backups/restore.log 2>&1
   ```
   After a few minutes **delete the job** and open `backups/restore.log`. It
   must end with `Restored: N schools, N users, newest migration …` and
   `Done.` Only one restore runs at a time, it refuses a target that already
   has tables (so later cron runs just log that and stop), and it restores in
   one transaction (all or nothing).
5. **Setup Node.js App** → change `DATABASE_URL` to end in
   `/martcqpk_aischool_restore` → Save → **Restart**. Keep
   `RUN_MIGRATIONS_ON_BOOT=true`: migrations newer than the dump are applied
   on start.
6. Check: `/api/health` shows `"db":"ok"` and the expected `lastMigration`;
   sign in as the super admin and as a school admin; open the dashboard,
   Students and Fees. Put the new value in `.ai-school-backup.env`'s
   `DATABASE_URL` too, so the nightly backup follows the new database, and
   remove `RESTORE_DATABASE_URL`.
7. When you are happy (a few days later), delete the old database in cPanel.

Anything written after the dump was taken is not in the restored database (at
most a day, with daily backups). Payments made in that window are still in
Paystack: re-check them from Fees and Platform → Billing. `APP_ENCRYPTION_KEY`
must be the same as when the dump was taken, or saved Paystack/SMS keys and
two-step sign-in secrets can't be read. phpPgAdmin can't import these dumps
(they use psql commands such as `\restrict` and `COPY … FROM stdin`); use the
script.

*Tested:* a dump of the development database (18 schools, 582 users, 149
tables, 3.3 MB gzipped) was restored with `restore-db.sh` into a fresh
database; row counts matched; the API booted against it with
`RUN_MIGRATIONS_ON_BOOT=true` ("Database is up to date"); the super admin,
school admin, teacher and parent logins, the dashboard, students, fees,
invoices and Platform → System health all answered 200.

**C. Restore ONE school.** Not supported directly. The in-app school export
(the CSV ZIP) **cannot be imported back**, and restoring the whole database
would undo every other school's work since the backup. Instead:

- Some records lost in one school (e.g. a class's results deleted): restore
  last night's dump into a spare database (steps B1–B4, but **don't** switch
  `DATABASE_URL`), look the records up there (phpPgAdmin, or a local copy of
  the API pointed at it) and re-enter them. Students and parents, staff and
  past results can be re-imported with **Import data** after copying the
  columns into its CSV templates.
- A whole school damaged: a developer copies that school's rows
  (`"tenantId" = '<id>'`) from the spare database into production, table by
  table in dependency order. This is a manual job; rehearse it on a copy first.
- Treat the school export as the school's own record of its data, not as a backup.
