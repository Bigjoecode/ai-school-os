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
