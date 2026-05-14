import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const totalGuards = await prisma.guard.count();
    const linkedGuards = await prisma.guard.count({
      where: { guardIdentityId: { not: null } },
    });
    const identities = await prisma.guardIdentity.count();
    const multiCompanyIdentities = await prisma.guardIdentity.findMany({
      include: { _count: { select: { employments: true } } },
    });
    const multi = multiCompanyIdentities.filter((g) => g._count.employments > 1);

    console.log("=== Backfill verification ===");
    console.log(`Total Guard rows:                ${totalGuards}`);
    console.log(`Guards with guardIdentityId:     ${linkedGuards}`);
    console.log(`Guards still NULL:               ${totalGuards - linkedGuards}  (must be 0)`);
    console.log(`GuardIdentity rows:              ${identities}`);
    console.log(`Identities linked to 2+ guards:  ${multi.length}  (multi-company guards)`);
    console.log("");
    console.log("Multi-company identities:");
    for (const m of multi) {
      console.log(`  ${m.firstName} ${m.lastName}  ${m.phone}  → ${m._count.employments} companies`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
