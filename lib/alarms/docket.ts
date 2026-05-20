import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Reserve the next per-company alarm docket number atomically.
 *
 * Locks the Setting row (alarm.nextDocket) via SELECT ... FOR UPDATE
 * inside a transaction, reads the current value, writes back the
 * incremented value, returns the reserved docket. Two concurrent
 * dispatches against the same company can never get the same docket
 * because the row lock serialises them.
 *
 * Throws if the setting hasn't been seeded — the per-company seed
 * (alarm.nextDocket) must exist before this is callable. See
 * scripts/seed-alarm-docket.ts.
 *
 * Pass the outer `tx` from a calling transaction if you want the
 * docket reservation to be rolled back when the calling code fails
 * (recommended — couples docket consumption to AlarmJob creation).
 * Otherwise this function spawns its own short transaction.
 */
export async function reserveNextDocket(
  db: PrismaClient | Prisma.TransactionClient,
  companyId: string,
): Promise<string> {
  // If `db` is already a TransactionClient, $transaction is not callable on it.
  // Detect by feature: TransactionClient lacks $transaction.
  const hasTxFn = typeof (db as PrismaClient).$transaction === "function";
  if (hasTxFn) {
    return (db as PrismaClient).$transaction((tx) => reserveWithin(tx, companyId));
  }
  return reserveWithin(db as Prisma.TransactionClient, companyId);
}

async function reserveWithin(
  tx: Prisma.TransactionClient,
  companyId: string,
): Promise<string> {
  // Lock the Setting row to serialise concurrent dispatches.
  const rows = await tx.$queryRaw<Array<{ value: string }>>`
    SELECT value FROM "Setting"
    WHERE "companyId" = ${companyId} AND key = 'alarm.nextDocket'
    FOR UPDATE
  `;
  if (rows.length === 0) {
    throw new Error(
      `alarm.nextDocket not seeded for company ${companyId} — run scripts/seed-alarm-docket.ts`,
    );
  }
  const current = rows[0].value;
  const n = Number.parseInt(current, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`alarm.nextDocket for company ${companyId} is not an integer: "${current}"`);
  }
  await tx.$executeRaw`
    UPDATE "Setting" SET value = ${String(n + 1)}
    WHERE "companyId" = ${companyId} AND key = 'alarm.nextDocket'
  `;
  return current;
}
