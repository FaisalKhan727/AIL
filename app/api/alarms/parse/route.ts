import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { detectAndParse } from "@/lib/alarm-parsers";
import { geocodeAddress } from "@/lib/geocode";

const bodySchema = z.object({
  text: z.string().min(1).max(20000),
});

/**
 * Server-side parse pipeline for the New Alarm dialog's paste tab.
 *
 * Steps:
 *  1. detectAndParse(text) — pure parser dispatch
 *  2. geocodeAddress(siteAddress) — Nominatim + GeocodedAddress cache,
 *     null on failure (never blocks)
 *  3. matchExistingSite(siteName + siteAddress) — exact site-name match
 *     within the admin's company; null if no exact match
 *
 * Returns everything the dialog needs to populate the preview panel.
 * Does NOT mutate any data — no AlarmJob is created here; that's the
 * separate POST /api/alarms endpoint.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("validation", 400, parsed.error.flatten());
  }
  const { text } = parsed.data;

  // 1. Detect + parse
  const parseResult = detectAndParse(text);
  const fields = parseResult.fields;

  // 2. Geocode (best-effort; never fails the request)
  let geocode: { latitude: number; longitude: number } | null = null;
  if (fields.siteAddress) {
    const fullAddress = [fields.siteName, fields.siteAddress]
      .filter(Boolean)
      .join(", ");
    const g = await geocodeAddress(fullAddress);
    if (g) {
      geocode = { latitude: g.latitude, longitude: g.longitude };
    }
  }

  // 3. Site matching — exact name match within company
  let siteMatch: { id: string; name: string; address: string; contactName: string | null; contactPhone: string | null } | null = null;
  if (fields.siteName) {
    const found = await prisma.site.findFirst({
      where: {
        companyId: auth.companyId,
        active: true,
        // Case-insensitive exact name match.
        name: { equals: fields.siteName.trim(), mode: "insensitive" },
      },
      select: {
        id: true,
        name: true,
        address: true,
        contactName: true,
        contactPhone: true,
      },
    });
    if (found) siteMatch = found;
  }

  return NextResponse.json({
    parser: parseResult.parser,
    confidence: parseResult.confidence,
    fields,
    geocode,
    siteMatch,
  });
}
