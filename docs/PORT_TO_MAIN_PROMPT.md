# Prompt: bring the Vigilo v2 work into `main` without breaking anything

Paste everything below the line into your AI coding agent in VS Code (Claude
Code, Copilot agent mode, or similar) with the repository open on `main`.

---

You are working in the Vigilo repository (Next.js 14 App Router, TypeScript,
Prisma + Postgres, NextAuth, Tailwind, Twilio, deployed on Vercel in `syd1`).

## Goal

Make the platform on `main` look and work like the branch
`origin/claude/build-vigilo-admin-qkH2K`, **without removing or changing any
behaviour that already exists on `main`.** `main` is the source of truth. The
branch is a reference implementation to port from, not something to merge.

The branch was cut from an older commit (`c44bb9c`, on top of `b785ec9`). Since
then `main` gained 63 commits it doesn't know about: the `/g` guard PWA with
its own auth and push notifications, alarm dispatch (`AlarmJob` and friends,
paste-and-parse intake, `/live`), alarm invoices (`AlarmInvoice`, `/invoices`,
PDF), payroll paid/pending with a financial statement (`Timesheet` model,
`/payroll`, `lib/payroll.ts`), per-shift `hoursOverride` / `payRateOverride`,
`ClockEvent`-based clock-ins, LARS licence verification (`lib/licence/*`,
`/api/cron/licence-check`), guard onboarding (Vercel Blob, contracts, SOPs),
the supervisor role, drag-and-drop rosters with licence conflict detection,
the rebuilt dashboard, reports, and a refreshed design system. **A plain
`git merge` would overwrite or conflict with most of that. Do not merge the
branch.**

## How to read the branch

```bash
git fetch origin claude/build-vigilo-admin-qkH2K
git log --oneline c44bb9c..origin/claude/build-vigilo-admin-qkH2K   # the commits to port
git diff --stat c44bb9c origin/claude/build-vigilo-admin-qkH2K      # every file the branch touched
git show origin/claude/build-vigilo-admin-qkH2K:<path>              # read any file from it
```

Useful references on the branch: `README.md` (feature docs), `docs/vigilo-demo.html`
(open it in a browser for the exact look), `lib/licences.ts`, `lib/ops.ts`,
`lib/payroll.ts` (award pay engine), `lib/exports.ts`,
`lib/integrations/xero*.ts`, and the tests in `tests/licences.test.ts`,
`tests/ops.test.ts`, `tests/payroll.test.ts` and `tests/exports.test.ts`.

## Rules (apply to every phase)

1. Work on a new branch from the latest `main`: `git switch -c feature/vigilo-v2-port origin/main`.
2. **Never delete, rename or change the behaviour of anything on `main`:** routes,
   API responses, models, columns, SMS wording, auth, crons or PWA flows. If a
   port seems to need that, stop and ask me first, explaining the trade-off.
3. **Database changes are additive only.** Add new tables, nullable columns or
   columns with defaults. Never edit an existing migration file, and never
   drop or rename anything. Create each migration with
   `npx prisma migrate dev --create-only --name <name>`, read the SQL, then apply it.
4. Where `main` already has a feature, **extend `main`'s version.** Don't add the
   branch's parallel version. The reconciliation table below says which is which.
5. Use `main`'s existing helpers: `requireAdmin` and the role checks, the
   guard auth in `lib/guard-auth.ts`, `lib/crypto.ts`, the SMS adapter,
   `lib/hours.ts` (including its rule that ignores worked windows under 15
   minutes), `lib/payroll.ts`, the Vercel Blob storage used by onboarding,
   and `lib/g/design.ts`.
6. Every query stays scoped to the signed-in company, and every foreign key in
   a request body is checked to belong to that company.
7. After each phase, run all of these and fix anything red before moving on:
   `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
   Then go through the regression checklist at the end and report the results.
8. Commit once per phase with a clear message. **Stop at the end of each phase
   and tell me what changed, what you skipped and anything you were unsure
   about.** Wait for my go-ahead before starting the next phase.

## Reconciliation table

| Area | On `main` (keep) | From the branch | What to do |
|---|---|---|---|
| Guard app | `/g/*`, `/api/g/*`, GuardAccount/GuardSession auth, push, service worker | `/m/*`, `/api/m/*`, NextAuth `guard-otp` provider, `GuardOtp` model | **Don't port `/m` or the OTP sign-in.** Add the branch's guard features to `/g` instead (Phase 8). |
| Clock-ins | `ClockEvent` rows (CLOCK_IN/OUT, BREAK_START/END, distance flags), `Shift.workedStart/workedEnd` | `Shift.clockInAt/clockOutAt/clockIn*Lat/Lng` | Don't add the branch's clock columns. Derive times and breaks from `ClockEvent` (and `workedStart/End` where `main` sets them). |
| Alarms | `AlarmJob`, `AlarmResponder`, `AlarmContact`, `AlarmReport`, parsers, `/alarms`, `/alarms/[id]`, `/live` | `Alarm`, `AlarmEvent`, `/alarms` console | Don't add `Alarm` or `AlarmEvent`. Port only what's missing onto `AlarmJob` (Phase 4). |
| Incidents | `IncidentReport` (filed by guards) | `Incident`, `IncidentUpdate`, `IncidentPhoto`, `/incidents` | Build the office workflow on `IncidentReport` with additive fields plus an updates table (Phase 4). |
| Licences | LARS checks stored on `Guard`, `/api/guards/[id]/verify-licence`, `licence-check` cron, `LicenceCheckBadge` | `Licence` registry (several credentials per guard), verification queue, expiry SMS, `/compliance` | Add the registry alongside. Make LARS the automatic register check for Victorian security licences (Phase 3). |
| Payroll | `Timesheet` (weekly PAID/PENDING snapshot), `/payroll` paid/pending + financial statement, `computeWeeklyGuardHours`, shift pay overrides | Timesheet approval on `Shift`, `PayRun`/`PayRunLine`, award engine, `PublicHoliday`, exports | Keep `main`'s flow untouched. Add approval and pay runs next to it (Phase 5). |
| Invoices | `AlarmInvoice`, `/invoices`, `lib/invoices/pdf.tsx`, `lib/invoices/rates.ts` | `Invoice`/`InvoiceLine`/`Payment` for hourly guarding and patrol runs, `/invoicing` | Keep alarm invoices. Add client invoicing alongside, and let the accounting exports handle both kinds (Phases 6–7). |
| Crypto | `lib/crypto.ts` (`encrypt`, `decrypt`, `isEncrypted`, `encryptIfPlain`) | `lib/crypto.ts` with the same names but a different format, plus `signState`/`verifyState` | Keep `main`'s file. Use its `encrypt`/`decrypt` for Xero tokens and add only `signState`/`verifyState`. |
| Dashboard / reports | Attention panel, live ops, SMS Centre, `/reports` | KPI tiles, `/analytics` | Keep both. Add tiles that aren't already there, and add Analytics as its own page or a tab in Reports. |
| Rosters | Drag-and-drop, licence conflict detection | Licence warning in the shift dialog, optional hard block with override reason | Keep `main`'s. Add the "block with override reason" setting into `main`'s existing conflict check, off by default. |
| Middleware / Vercel | Matcher allows `/g`, `/api/g`, `/onboarding`, `/api/cron`; `regions: ["syd1"]`; `licence-check` cron | Matcher for `/m`, `/api/m`; `licence-alerts` cron | Keep `main`'s matcher. Add only new public paths (none if `/m` isn't ported). Add the `licence-alerts` cron next to `licence-check` and keep `syd1`. |

New on the branch with no equivalent on `main` (port these largely as written,
adapted to `main`'s helpers): Clients, Patrol runs and jobs, Vehicles & equipment
(including vehicle checks), Training (courses, quizzes, enrolments), Subcontractors
(job requests, invoices received), Billing (plan and usage), Integrations (Xero
and file exports), Public holidays, and the shared UI kit in
`components/ops/kit.tsx` and `components/ops/prompt-dialog.tsx`.

Before Phase 1, check `main`'s `prisma/schema.prisma` for name clashes with these
branch models: `Client`, `Vehicle`, `VehicleCheck`, `Equipment`, `PatrolRun`,
`PatrolStop`, `PatrolJob`, `PatrolScan`, `Invoice`, `InvoiceLine`, `Payment`,
`Course`, `Enrollment`, `Subcontractor`, `JobRequest`, `SubInvoice`, `Licence`,
`LicenceDocument`, `LicenceEvent`, `PayRun`, `PayRunLine`, `PublicHoliday`,
`Integration` and `SyncLog`. Rename on our side if anything clashes.

## Phases

**Phase 0: plan only, no code changes.** Read both sides. Write
`docs/PORT_PLAN.md` listing every file the branch touched, the action for each
(*copy*, *adapt* or *skip*) and a one-line reason. List any conflicts you found
beyond the table above. Stop and wait for my approval.

**Phase 1: look and feel.** Apply the branch's light theme and IBM Plex type
(IBM Plex Sans for UI text, IBM Plex Sans Condensed for headings and big
numbers, IBM Plex Mono for references and times, all via `next/font/google`)
to the admin console and to `/g`. Change design tokens, fonts and component
styling only: no layout, copy or behaviour changes. Branch sources:
`app/globals.css`, `tailwind.config.ts`, `app/layout.tsx`, `components/ui/*`,
`components/shell/*`, `components/shell/logo.tsx`, and
`docs/vigilo-demo.html` for the target look. Update `/g`'s design tokens in
`lib/g/design.ts` the same way, and the PWA theme colours and icons. Check
contrast for every status colour on the light background.

**Phase 2: new standalone modules.** Clients, Vehicles & equipment,
Subcontractors, Training (admin side), Patrol runs and jobs (admin side), and
Billing, with their APIs, pages, `lib/ops.ts` and `lib/server/crud.ts`. Link
`Site` to `Client` with a nullable `clientId`. Add the new pages to the sidebar
and mobile "More" menu, grouped as the branch does, keeping every existing
nav item. Port `tests/ops.test.ts`.

**Phase 3: licence registry.** Add `Licence`, `LicenceDocument` and
`LicenceEvent`, plus `/compliance` with its verification queue, verify dialog,
CSV export and expiry-reminder cron. Integrate it with `main`:
- For Victorian security licences, the automatic register check calls
  `main`'s `lib/licence/verify.ts` (LARS) instead of the branch's manual step.
  Show its result in the verify dialog. Keep the NSW API adapter for NSW.
- Store uploaded licence photos with `main`'s Vercel Blob helper, not as bytes
  in Postgres, if that's a small change. Otherwise ask me.
- `main` resets `Guard.licenceCheckStatus` when `licenceNumber` changes. Only
  sync the legacy `Guard.licenceNumber`/`licenceExpiry` fields from the
  registry when the value actually differs, and trigger a LARS check when it does.
- Add the guard-clearance warning to `main`'s roster conflict detection as
  advisory, with the optional block-with-override setting off by default.
- Port `tests/licences.test.ts`.

**Phase 4: alarms and incidents.**
- On `AlarmJob`, add only what `main` lacks:
  - the per-alarm-type procedure checklist (`sopFor` in `lib/ops.ts`), stored as an additive JSON column;
  - the response-time clock coloured against the target for the priority;
  - the History tab KPIs (average response, false-alarm %, within target) with CSV export.
  Map statuses onto `main`'s values (`DISPATCHED`/`ACKNOWLEDGED`/`ONSITE`/`COMPLETED`/…). Don't change how `main` dispatches, parses or bills alarms.
- Build the incident office workflow on `IncidentReport`: status, investigator,
  client-notify flag and an `IncidentReportUpdate` timeline table, all additive.
  Add an `/incidents` admin page if `main` doesn't have one; if it does, add the
  workflow to it.

**Phase 5: timesheet approval and pay runs.**
- Add approval to `Shift` (`breakMins`, `tsStatus`, `tsNote`, `tsApprovedAt`,
  `tsApprovedBy`, `payRunId`, `invoiceId`, all additive with defaults).
  Backfill: shifts already inside a PAID `Timesheet` week become APPROVED.
- Worked times come from `main`'s `ClockEvent` rows. Unpaid break time is the
  total of BREAK_START→BREAK_END pairs, falling back to `breakMins`.
  `Shift.hoursOverride`, when set, replaces the calculated hours.
  `Shift.payRateOverride`, when set, replaces the guard's base rate for that
  shift. Keep `lib/hours.ts`'s sub-15-minute rule.
- Port the award engine to a new file, `lib/payroll/award.ts`. Don't overwrite
  `main`'s `lib/payroll.ts`. Also port `PayRun`, `PayRunLine`, `PublicHoliday`,
  `Guard.employmentType` (default `CASUAL`), `Guard.payrollRef` and
  `Guard.externalEmployeeId`, plus the pay-rules settings.
- Add "Pay runs", "Pay rules" and "Public holidays" as new tabs on `main`'s
  `/payroll` page. The existing paid/pending view and financial statement stay
  exactly as they are. Don't connect finalising a pay run to `main`'s
  PAID/PENDING `Timesheet` rows without asking me.
- Add the branch's timesheet approval UI to `main`'s `/timesheets` page as new
  controls and filters. Keep `main`'s existing columns, totals and exports.
- Port `tests/payroll.test.ts`, plus cases for the overrides and `ClockEvent` breaks.

**Phase 6: client invoicing.** Add `Invoice`, `InvoiceLine`, `Payment` and
`Site.billRate`, plus `/invoicing` (hourly lines from approved timesheets,
patrol-run lines, manual lines, part and full payments, void releasing billed
items). `main`'s alarm invoices and `/invoices` stay unchanged. In the nav,
show them as "Alarm invoices" and "Client invoices", or as tabs on one
Invoicing page, keeping every existing URL working.

**Phase 7: accounting integrations.** Port `/integrations`, `lib/exports.ts`,
`lib/integrations/xero.ts`, `lib/integrations/xero-sync.ts`, `Integration` and
`SyncLog`.
- Use `main`'s `lib/crypto.ts` for tokens (`encrypt`/`decrypt`), adding only `signState`/`verifyState`.
- The Xero, MYOB and QuickBooks invoice exports and the Xero push must accept
  **both** client invoices and `main`'s `AlarmInvoice`s, through one shared
  mapper (`toExportInvoice`).
- Pay-run exports: summary CSV, MYOB timesheets, Employment Hero, and the Xero
  Payroll AU push.
- Port `tests/exports.test.ts`.
- Add these to `.env.example`: `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, an
  optional `XERO_SCOPES`, `INTEGRATIONS_KEY`, `NSW_API_KEY`/`NSW_API_SECRET`.
  Don't duplicate `CRON_SECRET` if `main` already has it.

**Phase 8: guard app (`/g`) additions.** Using `main`'s guard auth, layout,
bottom nav and design, add whichever of these `/g` doesn't already have:
- a patrol run screen (vehicle check, check in at each stop with location, mark a stop missed with a reason, finish run);
- training (read a course, take the quiz, see the certificate; answers marked on the server and never sent to the phone);
- licence upload into the compliance queue;
- incident report with a photo, using Blob storage;
- the alarm-dispatch "en route" / "on scene" buttons, if `/g/alarms/[id]` lacks them.
Keep the existing 5-tab bottom nav. Put new items under an existing tab, or
ask me before changing the tab set. Don't touch the service worker's caching
rules except to add the new routes to the app shell if needed.

**Phase 9: analytics, docs and final check.** Add the Analytics page (or a
Reports tab). Update the README with the branch's feature docs, adapted to how
things actually work on `main`. Copy `docs/vigilo-demo.html`. Run the full
regression checklist and give me a summary, including anything you couldn't
test.

## Regression checklist (run after every phase)

- [ ] Admin login. Dashboard loads with the attention panel, live ops and SMS Centre.
- [ ] Rosters: create a shift, drag-and-drop reassign, licence conflict warning, publish by SMS, inbound YES/NO reply updates the shift.
- [ ] Guards: create and edit a guard, send the onboarding link, LARS verify-licence, send the app invite.
- [ ] Onboarding flow at `/onboarding/[token]` completes; licence photo upload works.
- [ ] `/g`: sign-in, shifts, accept/reject, clock in/out with distance flag, availability, notifications/push, SOP acknowledgement, timesheets, profile.
- [ ] Alarms: paste-and-parse intake, dispatch, responder SMS, manual complete, alarm report, `/live`.
- [ ] Alarm invoices: create and download the PDF from `/invoices`.
- [ ] Payroll: paid/pending, mark paid / mark unpaid, financial statement, per-shift hours and pay-rate overrides.
- [ ] Timesheets page totals match what they were before for the same week.
- [ ] Reports and the SMS log load; Settings saves.
- [ ] Crons: `/api/cron/licence-check` still runs with `CRON_SECRET`.
- [ ] Supervisor role sees only what it saw before.

Test each migration on a copy of the production database (a Neon branch, or
similar) before it is applied to production.
