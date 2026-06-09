/**
 * Backfill: encrypt any TFN / BSB / account-number values stored as
 * cleartext in OnboardingData. Captures rows submitted between the
 * step-2 deploy (where the columns were named *_Encrypted but stored
 * cleartext) and the step-3 deploy (where the encryption path lands).
 *
 * Safe to re-run: rows already in `enc:v1:` envelope format are
 * skipped. Wraps each row in its own try/catch so a single bad row
 * does not abort the batch.
 *
 * Usage:
 *   tsx scripts/encrypt-existing-onboarding.ts          # dry run, prints what it would do
 *   tsx scripts/encrypt-existing-onboarding.ts --apply  # actually writes the encrypted values
 *
 * Requires ENCRYPTION_KEY env var to be set to the same value the
 * production app uses, otherwise encrypted rows will be unreadable.
 */
import { PrismaClient } from "@prisma/client";
import { encrypt, isEncrypted } from "../lib/crypto";

const apply = process.argv.includes("--apply");

async function main() {
  if (!process.env.ENCRYPTION_KEY) {
    console.error("ENCRYPTION_KEY is not set. Aborting — would corrupt the dataset.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.onboardingData.findMany({
      select: {
        id: true,
        guardId: true,
        tfnEncrypted: true,
        bankBsbEncrypted: true,
        bankAccountNumberEncrypted: true,
      },
    });

    let scanned = 0;
    let alreadyEncrypted = 0;
    let toEncrypt = 0;
    let written = 0;
    let failed = 0;

    for (const row of rows) {
      scanned += 1;
      const updates: Record<string, string> = {};
      let touched = false;

      for (const field of ["tfnEncrypted", "bankBsbEncrypted", "bankAccountNumberEncrypted"] as const) {
        const v = row[field];
        if (!v) continue;
        if (isEncrypted(v)) {
          alreadyEncrypted += 1;
          continue;
        }
        toEncrypt += 1;
        touched = true;
        try {
          updates[field] = encrypt(v);
        } catch (e) {
          failed += 1;
          console.warn(`[fail] row ${row.id} field ${field}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (!touched || Object.keys(updates).length === 0) continue;

      if (!apply) {
        console.log(
          `[dry] would update row ${row.id} (guard ${row.guardId}) — fields: ${Object.keys(updates).join(", ")}`,
        );
        continue;
      }

      try {
        await prisma.onboardingData.update({
          where: { id: row.id },
          data: updates,
        });
        written += 1;
        console.log(`[ok] encrypted row ${row.id} (${Object.keys(updates).length} fields)`);
      } catch (e) {
        failed += 1;
        console.warn(`[fail] db update for row ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    console.log("\n=== summary ===");
    console.log(`rows scanned:           ${scanned}`);
    console.log(`fields already encrypted: ${alreadyEncrypted}`);
    console.log(`fields to encrypt:      ${toEncrypt}`);
    console.log(`rows written:           ${written}${apply ? "" : " (dry run, none written)"}`);
    console.log(`failures:               ${failed}`);
    if (!apply) {
      console.log("\nNothing was written. Re-run with --apply to commit.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
