/**
 * Manual smoke test for the Nominatim geocoder + cache.
 *
 * Usage:
 *   npx tsx scripts/test-geocode.ts "41B Access Way, Carrum Downs VIC 3201"
 *   npx tsx scripts/test-geocode.ts        # uses the canonical Guardian sample address
 *
 * First run for a new address hits Nominatim and writes the cache.
 * Re-running with the same address should return instantly from cache.
 */

import { geocodeAddress } from "../lib/geocode";
import { PrismaClient } from "@prisma/client";

const DEFAULT_ADDR = "41B Access Way, Carrum Downs, Victoria, 3201";

async function main() {
  const address = process.argv[2] || DEFAULT_ADDR;
  console.log(`\nGeocoding: ${address}\n`);

  const prisma = new PrismaClient();
  const cacheBefore = await prisma.geocodedAddress.count();
  console.log(`Cache size before: ${cacheBefore}`);

  const t0 = performance.now();
  const result = await geocodeAddress(address);
  const elapsed = performance.now() - t0;

  if (!result) {
    console.log(`\n✗ Failed to geocode (${elapsed.toFixed(0)}ms).`);
    console.log(`  Possible reasons: Nominatim rate-limit, no result, network down.`);
    process.exit(1);
  }

  console.log(`\n✓ Geocoded in ${elapsed.toFixed(0)}ms via ${result.provider}`);
  console.log(`  latitude:  ${result.latitude}`);
  console.log(`  longitude: ${result.longitude}`);

  const cacheAfter = await prisma.geocodedAddress.count();
  console.log(`\nCache size after:  ${cacheAfter}`);
  console.log(
    cacheAfter > cacheBefore
      ? `(new entry written — second run will be instant from cache)`
      : `(cache hit — no network call)`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
