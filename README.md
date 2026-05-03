# Vigilo Roster

Production-grade rostering web app for security services. Publish shifts, get
guards to confirm via SMS, generate timesheets for payroll.

**Build mode:** local SQLite + mock SMS adapter so you can use the full
workflow today. Wiring up Twilio and Postgres later only changes config.

---

## Quick start

```bash
npm install
npm run db:setup
npm run dev
```

Open http://localhost:3000 and log in with the seed admin printed to the
console (default: `admin@vigilo.local` / `admin123` — **change before
production**).

The seed creates 5 sample guards, 3 sites, and 1 published roster for the
current week with 8 PENDING shifts so you can test the SMS flow immediately.

```bash
npm test            # run parser + hours unit tests
npm run db:reset    # wipe DB and reseed
```

---

## What's stubbed vs real

| Feature                          | Status |
|----------------------------------|--------|
| Database (SQLite, dev)           | ✅ real |
| Auth (NextAuth credentials)      | ✅ real |
| Guards / Sites / Rosters / Shifts CRUD | ✅ real |
| Roster builder + week grid       | ✅ real |
| Conflict detection               | ✅ real |
| Outbound SMS message builder     | ✅ real |
| **SMS sending (Twilio)**         | ⚠️ stubbed (`MockSmsAdapter` writes to `SmsLog` + console) |
| **Inbound SMS webhook**          | ✅ real route, exercised by the SMS Simulator UI |
| Inbound reply parser             | ✅ real (24 unit tests cover ALL YES, numbered pairs, codes, synonyms, garbage) |
| Timesheets + CSV/PDF export      | ✅ real |
| SMS Log viewer                   | ✅ real |
| Settings + admin user management | ✅ real |

---

## Try the workflow

1. **Log in** at `/login`.
2. **Dashboard** shows KPIs and today's shifts.
3. **Guards / Sites / Rosters** — full CRUD.
4. Open the seeded roster in **Rosters** → click into it. The week grid shows
   all shifts. Click a shift to edit, or click **+ add** in any cell.
5. **Publish** a roster — every guard with PENDING shifts in it gets a
   numbered SMS via the mock adapter. Watch the server console for the
   formatted block, and check `/sms-log` for the entries marked `MOCK`.
6. **SMS Simulator** (`/sms-simulator`) — pick a guard, see their published
   shifts with their indices and confirm codes, type or quick-fill a reply
   like `1 YES, 2 NO, 3 YES` or `ALL YES`. The simulator POSTs to
   `/api/sms/webhook` exactly the way Twilio will. Shift statuses update
   live; an auto-reply is logged.
7. **Timesheets** — current week defaults; only CONFIRMED/WORKED shifts
   contribute to hours and pay. **Mark all worked** promotes CONFIRMED →
   WORKED. **Export CSV** or per-row **PDF** (browser print).
8. **Settings** — edit company name, timezone, default pay rate, and SMS
   templates with placeholders. Add more admin users (OWNER only).

---

## Wiring up later

### Switch from mock to live SMS (Twilio)

1. Sign up for Twilio, buy an Australian long-code number that supports
   two-way SMS.
2. In `.env`, set:
   ```
   SMS_MODE=twilio
   TWILIO_ACCOUNT_SID=ACxxxx
   TWILIO_AUTH_TOKEN=xxxx
   TWILIO_FROM_NUMBER=+61xxx
   ```
3. Implement the TODOs in `lib/sms/twilio-adapter.ts` — the class skeleton,
   imports, and constructor are already in place. You only need to fill in
   the `messages.create` call and signature verification.
4. Restart the server. The Settings page badge will switch from
   `MOCK MODE` to `LIVE — Twilio`.
5. In Twilio Console, set the messaging webhook for your number to:
   - `https://<your-subdomain>/api/sms/webhook` (HTTP POST)
   - `https://<your-subdomain>/api/sms/status` (status callback)

### Switch from SQLite to Postgres

1. Provision a Postgres DB (Neon, Supabase, Railway).
2. In `prisma/schema.prisma`, change `provider = "sqlite"` to
   `provider = "postgresql"`.
3. Update `DATABASE_URL` in `.env`.
4. Delete the existing `prisma/migrations` folder (SQLite-specific) and run
   `npx prisma migrate dev --name init` against the new DB.

### Deploy to a subdomain (Vercel)

1. Push to GitHub, import to Vercel.
2. Add the subdomain in Vercel's Domains tab.
3. Set all env vars in Vercel Project Settings.
4. Run `prisma migrate deploy` on first deploy.

---

## Tech stack

Next.js 14 App Router · TypeScript · Tailwind CSS · Prisma + SQLite ·
NextAuth.js (credentials) · Zod · TanStack Query · TanStack Table ·
React Hook Form · date-fns + date-fns-tz · Twilio Node SDK (installed,
unwired) · Vitest.

---

## Project layout

```
/app
  /(auth)/login            — sign-in page
  /(dashboard)/...         — protected admin app
  /api/...                 — REST routes
/components
  /ui                      — Button, Card, Dialog, Table, Toast, etc.
  /shell                   — Sidebar, PageHeader
  /guards /sites /rosters  — feature components
  /shared                  — StatusBadge
/lib
  prisma.ts auth.ts api.ts utils.ts date.ts validators.ts hours.ts codes.ts fetcher.ts
  /sms
    types.ts               — SmsAdapter interface
    mock-adapter.ts        — default in dev
    twilio-adapter.ts      — STUB; flip SMS_MODE=twilio + fill TODOs
    index.ts               — factory
    templates.ts           — outbound message builders
    parser.ts              — inbound reply parser
    dispatch.ts            — roster → SMS fan-out
/prisma
  schema.prisma  seed.ts
/tests
  parser.test.ts  hours.test.ts
```
