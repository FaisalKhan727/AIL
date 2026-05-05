# Vigilo Roster

Production-grade rostering web app for security services. Publish shifts, get
guards to confirm via SMS, generate timesheets for payroll.

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

## Deploy (Vercel)

1. Push to GitHub, import to Vercel.
2. Add the subdomain in Vercel's Domains tab.
3. Set all env vars in Vercel Project Settings (including `PUBLIC_BASE_URL`
   pointing at the live HTTPS URL).
4. Run `prisma migrate deploy` on first deploy.

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
  /(dashboard)/...         — protected admin app
  /api/...                 — REST routes, including /api/sms/webhook + /api/sms/status
/components
  /ui                      — Button, Card, Dialog, Table, Toast, etc.
  /shell                   — Sidebar, PageHeader
  /guards /sites /rosters  — feature components
  /shared                  — StatusBadge
/lib
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
