// Looking a licence up on the issuing regulator's register.
//
// NSW publishes a Security licence API through API NSW (api.nsw.gov.au,
// product "Security"). With NSW_API_KEY / NSW_API_SECRET set we call it and
// compare the register's answer with what we hold.
//
// No other state offers a machine-readable register that we know of, so for
// those the result is "MANUAL": the operator is pointed at the regulator's
// public register (where one exists online), looks the licence up, and
// records what they saw. Nothing here ever reports a licence as confirmed
// unless a register actually said so.

import { licenceType, registerFor } from "@/lib/licences";

export interface RegisterResult {
  outcome: "CONFIRMED" | "MISMATCH" | "NOT_FOUND" | "MANUAL" | "ERROR";
  source: string;
  summary: string;
  regulator: string;
  lookupUrl: string | null;
  registerStatus?: string;
  registerExpiry?: string;
  registerName?: string;
}

interface CheckInput {
  type: string;
  number: string;
  state: string;
  expiryDate: Date | null;
  guardFirstName: string;
  guardLastName: string;
}

const NSW_TOKEN_URL =
  process.env.NSW_API_TOKEN_URL ||
  "https://api.onegov.nsw.gov.au/oauth/client_credential/accesstoken?grant_type=client_credentials";
const NSW_SECURITY_BASE = (
  process.env.NSW_API_SECURITY_URL || "https://api.onegov.nsw.gov.au/securityregister/v1"
).replace(/\/+$/, "");

export function nswApiConfigured(): boolean {
  return Boolean(process.env.NSW_API_KEY && process.env.NSW_API_SECRET);
}

let nswToken: { value: string; expiresAt: number } | null = null;

async function getNswToken(): Promise<string> {
  if (nswToken && nswToken.expiresAt > Date.now() + 30_000) return nswToken.value;
  const key = process.env.NSW_API_KEY as string;
  const secret = process.env.NSW_API_SECRET as string;
  const res = await fetch(NSW_TOKEN_URL, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API NSW token request failed (${res.status})`);
  const json = (await res.json()) as { access_token?: string; expires_in?: string | number };
  if (!json.access_token) throw new Error("API NSW token response had no access_token");
  const ttl = Number(json.expires_in) || 3600;
  nswToken = { value: json.access_token, expiresAt: Date.now() + ttl * 1000 };
  return nswToken.value;
}

/** Case-insensitive field read; register payload casing isn't worth trusting. */
function pick(obj: Record<string, unknown>, ...names: string[]): string | undefined {
  const lower = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
  for (const n of names) {
    const v = lower.get(n.toLowerCase());
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

/** Register dates arrive as dd/MM/yyyy or ISO. Returns yyyy-MM-dd or undefined. */
export function normaliseRegisterDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const au = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (au) return `${au[3]}-${au[2].padStart(2, "0")}-${au[1].padStart(2, "0")}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : undefined;
}

/**
 * Compare a register record with what we hold. Exported for tests — this is
 * the part that decides whether a licence is reported as confirmed.
 */
export function compareWithRegister(
  input: CheckInput,
  record: { status?: string; expiry?: string; name?: string },
): Pick<RegisterResult, "outcome" | "summary"> {
  const status = (record.status || "").toLowerCase();
  const problems: string[] = [];

  if (!status) problems.push("register returned no status");
  else if (!/^(current|active|granted)/.test(status)) problems.push(`register status is "${record.status}"`);

  if (record.name) {
    const name = record.name.toLowerCase();
    if (!name.includes(input.guardLastName.trim().toLowerCase())) {
      problems.push(`register holder is "${record.name}"`);
    }
  }

  const ours = input.expiryDate ? input.expiryDate.toISOString().slice(0, 10) : undefined;
  if (record.expiry && ours && record.expiry !== ours) {
    problems.push(`register expiry is ${record.expiry}, we hold ${ours}`);
  }

  if (problems.length) return { outcome: "MISMATCH", summary: `Does not match the register: ${problems.join("; ")}.` };
  return {
    outcome: "CONFIRMED",
    summary: `Register shows this licence as ${record.status}${record.expiry ? `, expiring ${record.expiry}` : ""}.`,
  };
}

async function checkNsw(input: CheckInput): Promise<RegisterResult> {
  const reg = registerFor("NSW");
  const base = { source: "API NSW — Security register", regulator: reg.regulator, lookupUrl: reg.lookupUrl };
  try {
    const token = await getNswToken();
    const url = `${NSW_SECURITY_BASE}/verify?licenceNumber=${encodeURIComponent(input.number.trim())}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, apikey: process.env.NSW_API_KEY as string, Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 404) {
      return { ...base, outcome: "NOT_FOUND", summary: "No licence with this number is on the NSW register." };
    }
    if (!res.ok) throw new Error(`register request failed (${res.status})`);
    const body: unknown = await res.json();
    const first = Array.isArray(body) ? body[0] : body;
    if (!first || typeof first !== "object") {
      return { ...base, outcome: "NOT_FOUND", summary: "No licence with this number is on the NSW register." };
    }
    const rec = first as Record<string, unknown>;
    const record = {
      status: pick(rec, "status", "licenceStatus"),
      expiry: normaliseRegisterDate(pick(rec, "expiryDate", "expiry")),
      name: pick(rec, "licensee", "licenseeName", "licenceName", "name"),
    };
    return {
      ...base,
      ...compareWithRegister(input, record),
      registerStatus: record.status,
      registerExpiry: record.expiry,
      registerName: record.name,
    };
  } catch (e) {
    return {
      ...base,
      outcome: "ERROR",
      summary: `Could not reach the NSW register (${e instanceof Error ? e.message : "unknown error"}). Check it manually instead.`,
    };
  }
}

export async function checkRegister(input: CheckInput): Promise<RegisterResult> {
  const def = licenceType(input.type);
  const reg = registerFor(input.state);

  if (!def.security) {
    return {
      outcome: "MANUAL",
      source: "Document check",
      regulator: "Issuing training organisation or agency",
      lookupUrl: null,
      summary: `There is no public register for ${def.short}. Check the uploaded document against the original and confirm below.`,
    };
  }

  if (input.state === "NSW" && nswApiConfigured()) return checkNsw(input);

  return {
    outcome: "MANUAL",
    source: "Manual register check",
    regulator: reg.regulator,
    lookupUrl: reg.lookupUrl,
    summary: reg.lookupUrl
      ? `Look this licence up on the ${reg.state} public register, then record what it shows.`
      : `Confirm this licence with ${reg.regulator}, then record the outcome.`,
  };
}
