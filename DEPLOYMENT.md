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
| `ANTHROPIC_API_KEY` | optional — turns on the AI assistants |
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

**Uploads.** Images and documents uploaded for websites are stored on disk,
in `UPLOAD_DIR` (default: `uploads/` inside the Node.js app root, e.g.
`/home/martcqpk/ai-school-api/uploads`). The deploy never touches that
folder. Include it in your backups. `UPLOAD_MAX_MB` (default 10) caps each
file. Raise the limit on the web server too if you go above ~20 MB.

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
