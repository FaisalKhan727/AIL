/**
 * Address geocoding with persistent caching.
 *
 * Today: Nominatim (OpenStreetMap, free, no API key). The `provider`
 * column on GeocodedAddress lets us swap to Google later without
 * invalidating the cache entries that were good enough at the time.
 *
 * Contract:
 * - Cache hits return immediately (no network call).
 * - Cache misses hit Nominatim with a 1.1-second throttle (Nominatim asks
 *   for max 1 req/sec per IP).
 * - All failures (network, throttling, no result, malformed response)
 *   return null — never throw. Callers store the alarm without lat/lng
 *   rather than blocking on geocoding.
 * - Cache writes ignore unique-constraint violations (concurrent inserts
 *   for the same address are fine; the row already exists).
 */

import { prisma } from "@/lib/prisma";

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  provider: string;
}

const USER_AGENT =
  "VigiloRoster/1.0 (contact: alarms@auswidesecurityexperts.com.au)";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1100; // be a good Nominatim citizen

let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const sinceLast = now - lastRequestAt;
  if (sinceLast < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - sinceLast));
  }
  lastRequestAt = Date.now();
}

/**
 * Canonical cache key for an address. Lowercases, collapses whitespace,
 * normalises comma spacing. NOT meant for display — just for cache lookup.
 */
export function normaliseAddress(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ");
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name?: string;
}

/**
 * Returns latitude/longitude for the given address, or null on any failure.
 * Caches successful lookups in GeocodedAddress.
 */
export async function geocodeAddress(
  address: string,
): Promise<GeocodeResult | null> {
  if (!address || !address.trim()) return null;
  const key = normaliseAddress(address);

  // 1. Cache hit
  const cached = await prisma.geocodedAddress.findUnique({
    where: { normalisedAddress: key },
  });
  if (cached) {
    return {
      latitude: Number(cached.latitude),
      longitude: Number(cached.longitude),
      provider: cached.provider,
    };
  }

  // 2. Throttle + fetch
  await throttle();
  let json: unknown;
  try {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", address);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "0");
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    json = await res.json();
  } catch {
    return null;
  }

  if (!Array.isArray(json) || json.length === 0) return null;
  const hit = json[0] as NominatimHit;
  const latitude = Number(hit.lat);
  const longitude = Number(hit.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  // 3. Cache the result. Ignore unique-violation races.
  await prisma.geocodedAddress
    .create({
      data: {
        normalisedAddress: key,
        latitude,
        longitude,
        provider: "nominatim",
      },
    })
    .catch(() => undefined);

  return { latitude, longitude, provider: "nominatim" };
}
