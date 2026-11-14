# Vigilo

Workforce operations for security companies: publish rosters and collect
confirmations by SMS, verify and track every guard's licences, and turn
clock-ins into timesheets. Two front ends share one deployment:

- **Console** (`/`) — the admin web app.
- **Guard app** (`/m`) — an installable mobile web app for guards.

Live SMS runs through Twilio. Database is Postgres via Prisma.

---

## Quick start

```bash
npm install
# Set DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, PUBLIC_BASE_URL,
# TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER in .env
npm run db:setup
npm run dev
```

Open the app and log in with the seed admin printed to the console
(default: `admin@vigilo.local` / `admin123` — **change before production**).

```bash
npm test            # parser + hours unit tests
npm run db:reset    # wipe DB and reseed
```

---

## Feature status

| Feature                                   | Status |
|-------------------------------------------|--------|
| Database (Postgres + Prisma)              | ✅ |
| Auth (NextAuth credentials)               | ✅ |
| Guards / Sites / Rosters / Shifts CRUD    | ✅ |
| Roster builder + week grid                | ✅ |
| Conflict detection                        | ✅ |
| Outbound SMS (Twilio)                     | ✅ |
| Inbound SMS webhook (signature validated) | ✅ |
| Status callback (delivery receipts)       | ✅ |
| Inbound reply parser                      | ✅ |
| Timesheets + CSV/PDF export               | ✅ |
| SMS Log viewer                            | ✅ |
| Settings + admin user management          | ✅ |
| Licence registry + verification workflow  | ✅ |
| Licence gate on rostering (warn or block) | ✅ |
| Expiry reminder SMS (daily job)           | ✅ |
| Guard app: SMS-code sign-in               | ✅ |
| Guard app: confirm shifts, clock in/out   | ✅ |
| Guard app: upload licences for checking   | ✅ |
| NSW register lookup (API NSW)             | ⚠️ needs credentials, untested live |
| Alarm response & dispatch console         | ✅ (alarms are logged by an operator) |
| Incident reports (console + guard app)    | ✅ |
| Patrol runs, jobs, runsheets              | ✅ |
| Vehicles, vehicle checks, equipment       | ✅ |
| Client invoicing from patrol jobs         | ✅ |
| Training courses, quizzes, certificates   | ✅ |
| Clients and SLA terms                     | ✅ |
| Subcontractors, job requests, invoices    | ✅ |
| Analytics                                 | ✅ |
| Billing (plan + usage)                    | ✅ read-only, no payment processing |

---

## Twilio setup

1. Buy a long-code number that supports two-way SMS (Australian numbers via
   Twilio).
2. Set environment variables:
   ```
   TWILIO_ACCOUNT_SID=ACxxxx
   TWILIO_AUTH_TOKEN=xxxx
   TWILIO_FROM_NUMBER=+61xxx
   PUBLIC_BASE_URL=https://your-subdomain.example.com
   ```
3. In Twilio Console, configure your number's messaging:
   - **A MESSAGE COMES IN** → `https://<your-domain>/api/sms/webhook` (HTTP POST)
   - **STATUS CALLBACK URL** → `https://<your-domain>/api/sms/status` (HTTP POST)
4. Both webhooks verify the `X-Twilio-Signature` header. Requests without a
   valid signature are rejected with HTTP 403.

---

## Workflow

1. **Log in** at `/login`.
2. **Dashboard** shows KPIs and today's shifts.
3. **Guards / Sites / Rosters** — full CRUD.
4. **Publish** a roster — every guard with PENDING shifts gets a numbered SMS
   from your Twilio number. Delivery status updates appear in `/sms-log`.
5. Guards reply with `1 YES, 2 NO, 3 YES` or `ALL YES` etc. The webhook parses
   the reply, applies decisions, and texts back a confirmation summary.
6. **Timesheets** — current week defaults; only CONFIRMED/WORKED shifts
   contribute to hours and pay. **Mark all worked** promotes CONFIRMED →
   WORKED. **Export CSV** or per-row **PDF** (browser print).
7. **Settings** — edit company name, timezone, default pay rate, and SMS
   templates with placeholders. Add more admin users (OWNER only).

---

## Licences & compliance

Each guard can hold any number of credentials (security licence classes,
first aid, CPR, RSA, WWCC, police check, white card, driver's, firearms, site
inductions). A credential is only **Valid** once someone has verified it, and
it moves through *Expiring soon* (≤ 60 days), *Urgent* (≤ 14 days) and
*Expired* on its own.

**Verifying.** Open a licence from *Licences & Compliance → Verification
queue*. The panel shows the uploaded document, runs the checks it can do by
itself (number format for the state, expiry, same number held by another
guard), then asks the operator to confirm the licence with the regulator:

| State | How it is checked |
|-------|-------------------|
| NSW   | Automatically through the API NSW *Security* register when `NSW_API_KEY` / `NSW_API_SECRET` are set; otherwise the operator is linked to the Service NSW public register. |
| QLD   | Operator is linked to the Office of Fair Trading licence check. |
| Other | Operator confirms with the state regulator and records the outcome. |

Nothing is marked verified unless a register API confirmed it or an operator
attests that they checked. Who verified, when, how, and any note are kept in
the licence's history. Rejecting a licence texts the guard the reason.

> The NSW adapter follows API NSW's documented OAuth + `verify` pattern but has
> not been exercised against the live service. Confirm the endpoint with your
> API NSW subscription (`NSW_API_SECURITY_URL` and `NSW_API_TOKEN_URL`
> override the defaults in `lib/licence-register.ts`) before relying on it.

**Rostering.** The shift dialog warns when the chosen guard has no current,
verified security licence on the shift date. Turn on *Settings → Licence
compliance → Block shifts…* to make that a hard stop; an override reason can
still be given and is written onto the shift.

**Reminders.** `/api/cron/licence-alerts` texts guards at 60, 30, 14 and 7
days before expiry, on the day, and a week after if no renewal is on file.
`vercel.json` schedules it daily; it needs `CRON_SECRET` set. On other hosts,
call it once a day with `Authorization: Bearer $CRON_SECRET`.

---

## Operations modules

All of these are scoped to the signed-in admin's company, and every foreign
key in a request is checked to belong to that company before it is written.

**Alarm Response & Dispatch** (`/alarms`). An operator logs an alarm (site,
zone, type, priority). The queue sorts critical-first with a live response
clock against the target for the priority (5 / 8 / 15 / 30 minutes). From an
alarm you can dispatch a guard (nearest first: on shift at that site, then on
shift elsewhere), text third parties from a saved contact list, tick the
procedure for that alarm type, add notes, escalate, mark it a false alarm or
resolve it. The dispatched guard gets an SMS and a prompt in their app, and
their "en route" / "on scene" taps update the console. Everything lands in
the alarm's timeline; resolved alarms are in History with response-time,
false-alarm and SLA figures and a CSV export. There is no alarm-panel or
monitoring-centre integration: alarms are entered by hand.

**Incident Reports** (`/incidents`). Guards file reports with an optional
photo from the app; the office can also create them. Each incident has a
status, an investigator, a link to an alarm and a timeline that records every
change.

**Patrol Runs** (`/patrols`). A run is a reusable route (ordered stops, a
vehicle, the client it is billed to and a rate per completed run). A job is
one execution of a run on a date by a guard. The guard does the vehicle
check, starts the job, checks in at each stop (location recorded) or marks it
missed with a reason, then finishes. Jobs close as COMPLETED, PARTIAL or
MISSED. Runsheets print from the job. Patrol jobs never touch timesheets.

**Vehicles & Equipment** (`/vehicles`). Fleet register with service and
insurance dates, the pre-patrol checks guards submit, and issued equipment.

**Patrol Invoicing** (`/invoicing`). Pick a client and period; finished,
unbilled patrol jobs are pulled in at the full rate (completed) or pro-rata
(partial). Add extra charges or credits, save a draft, mark it sent (due date
from the client's payment terms), then paid. Voiding releases the jobs to be
billed again. Invoices print as a tax invoice. Amounts are computed on the
server from the jobs. There is no accounting-system export yet.

**Training** (`/training`). Write a course (text material, optional
multiple-choice quiz, pass mark, renewal period), assign it to guards with an
optional due date and SMS. Guards read it and take the quiz in the app;
answers are marked on the server and correct answers are never sent to the
device. Passing records a completion with an expiry.

**Clients** (`/clients`) hold contacts, contract dates, payment terms, SLA
targets and their sites. **Subcontractors** (`/subcontractors`) hold partner
companies, which of your guard records they supply, job requests sent to them
and the invoices they send you. **Analytics** (`/analytics`) summarises
incidents, alarms, patrol completion and revenue, guard hours, compliance and
training over 7–365 days. **Billing** (`/billing`) shows the company's plan
and usage against it; the plan is a column on `Company` set by you, and no
payment is taken in the app.

---

## Guard app (`/m`)

Guards open `https://<your-domain>/m` and add it to their home screen.

- **Sign in** with the mobile number on their guard record; a 6-digit code is
  sent by SMS (10-minute expiry, 5 attempts, 5 codes per hour).
- **Today** — next shift, clock in (from 30 minutes before start) and clock
  out. The device location is stored with each clock event when permitted.
- **Shifts** — confirm or decline published shifts (same effect as replying
  to the roster SMS), plus five weeks of history.
- **Tasks** — acknowledge an alarm dispatch and report arrival, run a patrol
  job stop by stop, report an incident with a photo, and complete assigned
  training.
- **Licences** — photograph and submit a new or renewed licence. It lands in
  the console's verification queue.

Clock-in sets the shift's worked start (never earlier than the rostered
start), clock-out sets the worked end and marks the shift WORKED, so it flows
straight into Timesheets. Admins can still correct times on the shift.

Guard sessions cannot call any admin API, and a guard deactivated in the
console loses access immediately.

---

## Deploy (Vercel)

1. Push to GitHub, import to Vercel.
2. Add the subdomain in Vercel's Domains tab.
3. Set all env vars in Vercel Project Settings (including `PUBLIC_BASE_URL`
   pointing at the live HTTPS URL).
4. `npm run build` runs `prisma migrate deploy`, so new migrations (including
   the licence registry, which backfills from existing guard licence numbers)
   apply on deploy.
5. Set `CRON_SECRET` to enable the daily licence reminder job.
6. Fonts (Syne, DM Sans, DM Mono) are fetched from Google Fonts at build time
   and self-hosted, so the build needs outbound access to
   `fonts.googleapis.com`.

---

## Tech stack

Next.js 14 App Router · TypeScript · Tailwind CSS · Prisma + Postgres ·
NextAuth.js (credentials) · Zod · TanStack Query · TanStack Table ·
React Hook Form · date-fns + date-fns-tz · Twilio Node SDK · Vitest.

---

## Project layout

```
/app
  /(auth)/login            — sign-in page
  /(dashboard)/...         — protected admin app (incl. /compliance)
  /m/...                   — guard mobile app
  /api/...                 — REST routes, including /api/sms/webhook + /api/sms/status
/components
  /ui                      — Button, Card, Dialog, Table, Toast, etc.
  /shell                   — Sidebar, PageHeader
  /guards /sites /rosters  — feature components
  /shared                  — StatusBadge
/lib
  licences.ts              — licence status + rostering rules (pure, unit-tested)
  licence-register.ts      — regulator register lookups
  guard-otp.ts             — SMS sign-in codes for the guard app
  prisma.ts auth.ts api.ts utils.ts date.ts validators.ts hours.ts codes.ts fetcher.ts
  /sms
    types.ts               — SmsAdapter interface
    twilio-adapter.ts      — Twilio client (sendSms + signature verification)
    index.ts               — factory
    templates.ts           — outbound message builders
    parser.ts              — inbound reply parser
    dispatch.ts            — roster → SMS fan-out
/prisma
  schema.prisma  seed.ts
/tests
  parser.test.ts  hours.test.ts
```

---

## Clickable demo

`docs/vigilo-demo.html` is a self-contained, no-backend demo of the console and
the guard app side by side, using sample data held in the page. It is for
showing the product; it does not talk to the API. Rebuild it from the
sources it was generated from if the screens change substantially.
