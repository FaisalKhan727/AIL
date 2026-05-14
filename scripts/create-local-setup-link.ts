/**
 * scripts/create-local-setup-link.ts
 *
 * Generate a SetupToken for one Guard and print the local-dev URL.
 * Used to test the /g/setup/[token] flow without going through SMS.
 *
 * Usage:
 *   npx tsx scripts/create-local-setup-link.ts                # picks the first multi-company guard
 *   npx tsx scripts/create-local-setup-link.ts <guardId>      # picks a specific Guard row
 *   npx tsx scripts/create-local-setup-link.ts +61478835774   # picks by phone (across companies)
 */

import { PrismaClient } from "@prisma/client";
import { generateSessionToken } from "../lib/guard-auth";

const TTL_DAYS = 7;
const arg = process.argv[2];

async function main() {
  const prisma = new PrismaClient();
  try {
    let guard;
    if (!arg) {
      guard = await prisma.guard.findFirst({
        where: {
          guardIdentityId: { not: null },
          guardIdentity: { employments: { some: { active: true } } },
        },
        include: { company: { select: { name: true } }, guardIdentity: { include: { account: true } } },
        orderBy: { createdAt: "desc" },
      });
    } else if (arg.startsWith("+")) {
      const identity = await prisma.guardIdentity.findUnique({
        where: { phone: arg },
        include: {
          employments: {
            include: { company: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          account: true,
        },
      });
      if (identity && identity.employments[0]) {
        const e = identity.employments[0];
        guard = {
          ...e,
          guardIdentity: { id: identity.id, account: identity.account },
        };
      }
    } else {
      guard = await prisma.guard.findUnique({
        where: { id: arg },
        include: { company: { select: { name: true } }, guardIdentity: { include: { account: true } } },
      });
    }

    if (!guard) {
      console.error("No guard matched. Try omitting the arg, or pass a guardId or +E164 phone.");
      process.exit(1);
    }
    if (!guard.guardIdentityId) {
      console.error("Guard has no GuardIdentity — run the backfill first.");
      process.exit(1);
    }

    const { token, tokenHash } = generateSessionToken();
    const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

    await prisma.setupToken.create({
      data: {
        guardId: guard.id,
        guardIdentityId: guard.guardIdentityId,
        tokenHash,
        expiresAt,
      },
    });

    const localUrl = `http://localhost:3000/g/setup/${token}`;
    const prodUrl = `${process.env.PUBLIC_BASE_URL ?? ""}/g/setup/${token}`;

    console.log("");
    console.log("=== Setup token created (no SMS sent) ===");
    console.log(`Guard:    ${guard.firstName} ${guard.lastName}  (${guard.phone})`);
    console.log(`Company:  ${guard.company?.name ?? "?"}`);
    console.log(`Existing app account: ${guard.guardIdentity?.account ? "YES (returning sign-in)" : "no (first-time setup)"}`);
    console.log(`Expires:  ${expiresAt.toISOString()}`);
    console.log("");
    console.log(`Open this on your laptop:`);
    console.log(`  ${localUrl}`);
    console.log("");
    console.log(`Or on your phone (after deploy):`);
    console.log(`  ${prodUrl}`);
    console.log("");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
