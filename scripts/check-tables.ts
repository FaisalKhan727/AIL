import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    // List every table in the public schema and its row count.
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name;`,
    );

    console.log("=== All tables in public schema ===");
    for (const t of tables) {
      const r = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT COUNT(*)::bigint AS c FROM "${t.table_name}";`,
      );
      console.log(`  ${t.table_name.padEnd(28)} ${r[0]?.c ?? 0}`);
    }

    console.log("");
    console.log("=== Applied migrations ===");
    const migrations = await prisma.$queryRawUnsafe<
      Array<{ migration_name: string; finished_at: Date | null; applied_steps_count: number }>
    >(
      `SELECT migration_name, finished_at, applied_steps_count FROM "_prisma_migrations"
       ORDER BY started_at;`,
    );
    for (const m of migrations) {
      console.log(
        `  ${m.migration_name.padEnd(60)} finished=${m.finished_at ? "yes" : "NO"} steps=${m.applied_steps_count}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
