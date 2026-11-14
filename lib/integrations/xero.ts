// Xero connection: OAuth 2.0 (authorization code), Accounting API for
// contacts, invoices and payments, and AU Payroll (v1.0) for employees, pay
// items and timesheets.
//
// Endpoints and scopes follow Xero's developer docs as of November 2026.
// Apps created after 2 March 2026 only get granular scopes, which is what
// XERO_SCOPES defaults to. Payroll AU v1.0 timesheets are deprecated and
// retire on 1 November 2027; moving to the v2.0 timesheets endpoint before
// then is a known follow-up. Every base URL can be overridden by env for
// testing against a mock server.
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { logSync } from "@/lib/server/accounting";

const env = (k: string, d: string) => (process.env[k] || d).replace(/\/+$/, "");
const AUTH_URL = () => env("XERO_AUTH_URL", "https://login.xero.com/identity/connect/authorize");
const TOKEN_URL = () => env("XERO_TOKEN_URL", "https://identity.xero.com/connect/token");
const API = () => env("XERO_API_URL", "https://api.xero.com");
export const DEFAULT_SCOPES =
  "openid profile email offline_access accounting.invoices accounting.contacts accounting.payments.read payroll.employees payroll.timesheets payroll.settings";

export function xeroConfigured(): boolean {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
}

export function redirectUri(): string {
  const base = (process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");
  return `${base}/api/integrations/xero/callback`;
}

export function authorizeUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.XERO_CLIENT_ID as string,
    redirect_uri: redirectUri(),
    scope: process.env.XERO_SCOPES || DEFAULT_SCOPES,
    state,
  });
  return `${AUTH_URL()}?${p}`;
}

interface TokenResponse { access_token: string; refresh_token: string; expires_in: number }

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const basic = Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL(), {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string };
  if (!res.ok || !json.access_token || !json.refresh_token) throw new XeroError(`Xero sign-in failed (${json.error || res.status})`, res.status);
  return json as TokenResponse;
}

export class XeroError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

/** Finish the OAuth flow: swap the code for tokens and store them against the company. */
export async function completeConnection(companyId: string, code: string, connectedBy: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  const res = await fetch(`${API()}/connections`, { headers: { Authorization: `Bearer ${t.access_token}`, Accept: "application/json" }, cache: "no-store" });
  const conns = (await res.json().catch(() => [])) as { tenantId: string; tenantName: string; tenantType: string }[];
  const org = Array.isArray(conns) ? conns.find((c) => c.tenantType === "ORGANISATION") ?? conns[0] : undefined;
  if (!org) throw new XeroError("No Xero organisation was authorised. Try again and pick an organisation.");
  const data = {
    tenantId: org.tenantId,
    tenantName: org.tenantName,
    accessTokenEnc: encrypt(t.access_token),
    refreshTokenEnc: encrypt(t.refresh_token),
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    connectedBy,
    connectedAt: new Date(),
  };
  await prisma.integration.upsert({
    where: { companyId_provider: { companyId, provider: "XERO" } },
    update: data,
    create: { companyId, provider: "XERO", ...data },
  });
  await logSync(companyId, "XERO", "CONNECT", true, `Connected to ${org.tenantName}`);
  return org.tenantName;
}

export async function disconnect(companyId: string) {
  const row = await prisma.integration.findUnique({ where: { companyId_provider: { companyId, provider: "XERO" } } });
  if (!row) return;
  // Best effort: remove the connection on Xero's side too.
  try {
    const c = await client(companyId);
    const conns = (await c.get("/connections")) as { id: string; tenantId: string }[];
    const mine = conns.find((x) => x.tenantId === row.tenantId);
    if (mine) await c.raw("DELETE", `/connections/${mine.id}`);
  } catch { /* already revoked or unreachable */ }
  await prisma.integration.delete({ where: { id: row.id } });
  await logSync(companyId, "XERO", "CONNECT", true, "Disconnected");
}

/** An authenticated API client for a company, refreshing the access token when needed. */
export async function client(companyId: string) {
  let row = await prisma.integration.findUnique({ where: { companyId_provider: { companyId, provider: "XERO" } } });
  if (!row?.accessTokenEnc || !row.refreshTokenEnc || !row.tenantId) throw new XeroError("Xero isn't connected.");

  async function refresh() {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(row!.refreshTokenEnc!) });
    // Xero rotates refresh tokens: the new one must be saved or the next refresh fails.
    row = await prisma.integration.update({
      where: { id: row!.id },
      data: { accessTokenEnc: encrypt(t.access_token), refreshTokenEnc: encrypt(t.refresh_token), expiresAt: new Date(Date.now() + t.expires_in * 1000) },
    });
  }
  if (!row.expiresAt || row.expiresAt.getTime() < Date.now() + 120_000) await refresh();

  async function raw(method: string, path: string, body?: unknown, retried = false): Promise<unknown> {
    const res = await fetch(`${API()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${decrypt(row!.accessTokenEnc!)}`,
        "xero-tenant-id": row!.tenantId!,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (res.status === 401 && !retried) { await refresh(); return raw(method, path, body, true); }
    if (res.status === 429) throw new XeroError("Xero's rate limit was hit. Wait a minute and try again.", 429);
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) throw new XeroError(xeroMessage(json) || `Xero returned ${res.status}`, res.status);
    return json;
  }
  return {
    tenantName: row.tenantName,
    raw,
    get: (path: string) => raw("GET", path),
    post: (path: string, body: unknown) => raw("POST", path, body),
  };
}

/** Pull the most useful validation message out of a Xero error body. */
export function xeroMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const elements = (j.Elements as { ValidationErrors?: { Message?: string }[] }[] | undefined) ?? [];
  const v = elements.flatMap((e) => e.ValidationErrors ?? []).map((e) => e.Message).filter(Boolean);
  if (v.length) return v.join("; ");
  if (typeof j.Message === "string") return j.Message;
  if (typeof j.Detail === "string") return j.Detail;
  if (typeof j.title === "string") return j.title;
  return null;
}

/** Xero wants .NET-style dates in payroll v1 JSON but accepts ISO "yyyy-MM-ddT00:00:00". */
export const xeroDate = (d: Date) => `${d.toISOString().slice(0, 10)}T00:00:00`;
