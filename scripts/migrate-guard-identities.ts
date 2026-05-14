/**
 * scripts/migrate-guard-identities.ts
 *
 * Backfills Guard.guardIdentityId by grouping existing Guard rows by phone
 * (E.164) and creating one GuardIdentity per unique phone across all companies.
 *
 * DEFAULT MODE IS DRY RUN. Nothing is written to the database unless `--apply`
 * is passed. The dry run prints a dedupe report so the operator can review
 * groupings, name conflicts, and malformed-phone rows before any write.
 *
 * Run against a Neon branch first; never run against prod without showing
 * the dry-run output to the owner for sign-off.
 *
 * Usage:
 *   npx tsx scripts/migrate-guard-identities.ts            # dry run
 *   npx tsx scripts/migrate-guard-identities.ts --csv=./report.csv
 *   npx tsx scripts/migrate-guard-identities.ts --apply    # WRITES
 *
 * Exit codes:
 *   0  success
 *   1  unexpected error
 *   2  malformed-phone rows present (--apply refused until hand-fixed)
 */

import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const CSV_FLAG = process.argv.find((a) => a.startsWith("--csv="));
const CSV_PATH = CSV_FLAG ? CSV_FLAG.slice("--csv=".length) : null;

// Matches the same regex used at write time (lib/validators.ts).
const E164 = /^\+\d{8,15}$/;

type GuardRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  companyId: string;
  guardIdentityId: string | null;
  createdAt: Date;
  companyName: string;
};

type Group = {
  phone: string;
  rows: GuardRow[];
  winner: GuardRow; // most recent createdAt; donates firstName/lastName/email
  nameMismatches: Array<{
    guardId: string;
    companyName: string;
    firstName: string;
    lastName: string;
  }>;
};

async function main() {
  const prisma = new PrismaClient();
  try {
    const guards = await prisma.guard.findMany({
      orderBy: { createdAt: "desc" },
      include: { company: { select: { name: true } } },
    });

    const rows: GuardRow[] = guards.map((g) => ({
      id: g.id,
      firstName: g.firstName,
      lastName: g.lastName,
      phone: (g.phone ?? "").trim(),
      email: g.email,
      companyId: g.companyId,
      guardIdentityId: g.guardIdentityId,
      createdAt: g.createdAt,
      companyName: g.company.name,
    }));

    const malformed = rows.filter((r) => !E164.test(r.phone));
    const valid = rows.filter((r) => E164.test(r.phone));

    // Group by phone.
    const byPhone = new Map<string, GuardRow[]>();
    for (const r of valid) {
      const existing = byPhone.get(r.phone);
      if (existing) existing.push(r);
      else byPhone.set(r.phone, [r]);
    }

    const groups: Group[] = [];
    for (const [phone, groupRows] of byPhone) {
      // findMany was already ordered by createdAt desc → first row is most recent.
      const winner = groupRows[0];
      const nameMismatches = groupRows
        .filter(
          (r) =>
            r.firstName !== winner.firstName || r.lastName !== winner.lastName,
        )
        .map((r) => ({
          guardId: r.id,
          companyName: r.companyName,
          firstName: r.firstName,
          lastName: r.lastName,
        }));
      groups.push({ phone, rows: groupRows, winner, nameMismatches });
    }

    // ---------- REPORT ----------
    const sizeBuckets = { one: 0, two: 0, threePlus: 0 };
    for (const g of groups) {
      if (g.rows.length === 1) sizeBuckets.one++;
      else if (g.rows.length === 2) sizeBuckets.two++;
      else sizeBuckets.threePlus++;
    }
    const conflicts = groups.filter((g) => g.nameMismatches.length > 0);
    const alreadyLinked = rows.filter((r) => r.guardIdentityId !== null).length;

    console.log("");
    console.log("=== GuardIdentity backfill — dedupe report ===");
    console.log(`mode:                  ${APPLY ? "APPLY (will write)" : "DRY RUN (no writes)"}`);
    console.log(`Guard rows scanned:    ${rows.length}`);
    console.log(`  already linked:      ${alreadyLinked}`);
    console.log(`  malformed phone:     ${malformed.length}  (skipped — hand-fix first)`);
    console.log(`  valid phone:         ${valid.length}`);
    console.log(`Distinct phones:       ${groups.length}`);
    console.log(`  → 1 company only:    ${sizeBuckets.one}`);
    console.log(`  → 2 companies:       ${sizeBuckets.two}`);
    console.log(`  → 3+ companies:      ${sizeBuckets.threePlus}`);
    console.log(`Name mismatches:       ${conflicts.length}  (winner = most recent record)`);
    console.log("");

    if (malformed.length > 0) {
      console.log("--- Malformed phones (must be hand-fixed) ---");
      for (const r of malformed) {
        console.log(
          `  ${r.id}  company="${r.companyName}"  phone="${r.phone}"  name="${r.firstName} ${r.lastName}"`,
        );
      }
      console.log("");
    }

    if (conflicts.length > 0) {
      console.log("--- Name mismatches across companies ---");
      for (const g of conflicts) {
        console.log(
          `  ${g.phone}  →  winner="${g.winner.firstName} ${g.winner.lastName}" (${g.winner.companyName})`,
        );
        for (const m of g.nameMismatches) {
          console.log(
            `      also: "${m.firstName} ${m.lastName}" at ${m.companyName} (guardId=${m.guardId})`,
          );
        }
      }
      console.log("");
    }

    if (CSV_PATH) {
      const csvLines = ["phone,company,firstName,lastName,guardId,chosenFirstName,chosenLastName"];
      for (const g of conflicts) {
        for (const r of g.rows) {
          csvLines.push(
            [
              g.phone,
              JSON.stringify(r.companyName),
              JSON.stringify(r.firstName),
              JSON.stringify(r.lastName),
              r.id,
              JSON.stringify(g.winner.firstName),
              JSON.stringify(g.winner.lastName),
            ].join(","),
          );
        }
      }
      const abs = path.resolve(CSV_PATH);
      fs.writeFileSync(abs, csvLines.join("\n"), "utf8");
      console.log(`Name-mismatch CSV written: ${abs}`);
      console.log("");
    }

    if (!APPLY) {
      console.log("Dry run complete. Re-run with --apply to write GuardIdentity rows.");
      return;
    }

    // ---------- APPLY ----------
    if (malformed.length > 0) {
      console.error(
        `Refusing to --apply: ${malformed.length} malformed-phone rows present. ` +
          `Fix those phones in the admin app first, then re-run.`,
      );
      process.exit(2);
    }

    console.log("Applying… (will create GuardIdentity rows and link Guards)");

    // Pre-fetch any GuardIdentity rows that already exist for these phones
    // (in case the script was partially run before — idempotent).
    const existingIdentities = await prisma.guardIdentity.findMany({
      where: { phone: { in: groups.map((g) => g.phone) } },
      select: { id: true, phone: true },
    });
    const identityByPhone = new Map(existingIdentities.map((i) => [i.phone, i.id]));

    let createdIdentities = 0;
    let linkedGuards = 0;

    for (const g of groups) {
      await prisma.$transaction(async (tx) => {
        let identityId = identityByPhone.get(g.phone);
        if (!identityId) {
          const identity = await tx.guardIdentity.create({
            data: {
              firstName: g.winner.firstName,
              lastName: g.winner.lastName,
              phone: g.phone,
              // email is per-company (admin sets it); leave identity.email null at backfill.
              // Admin can populate later via the GuardAccount / profile page.
            },
            select: { id: true },
          });
          identityId = identity.id;
          createdIdentities++;
        }

        for (const r of g.rows) {
          if (r.guardIdentityId === identityId) continue;
          await tx.guard.update({
            where: { id: r.id },
            data: { guardIdentityId: identityId },
          });
          linkedGuards++;
        }
      });
    }

    console.log("");
    console.log(`Done. GuardIdentities created: ${createdIdentities}`);
    console.log(`      Guard rows linked:      ${linkedGuards}`);
    console.log(`      Guard rows untouched:   ${rows.length - linkedGuards - malformed.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
