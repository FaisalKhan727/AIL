// Victoria Police LARS (Licensing & Regulation) public register lookup.
//
// The register UI at /components/screens/psinfp03/psinfp03.asp is a legacy
// ASP app: loading the page issues a session cookie + a per-session
// g_strSecurityToken, and the Search button POSTs an XML packet carrying that
// token to PSINFP03.asp?Process=SEARCH. The response is an HTML fragment
// (the results grid), which we parse here.
//
// Pure helpers (normalise / build / parse / evaluate) are exported for tests;
// lookupLarsLicence() is the only function that touches the network.

const LARS_BASE = "https://www.lars.police.vic.gov.au/LARS/LARS.asp?File=";
const SEARCH_PAGE = `${LARS_BASE}/components/screens/psinfp03/psinfp03.asp`;
const SEARCH_ENDPOINT = `${LARS_BASE}/Components/Screens/PSINFP03/PSINFP03.asp?Process=SEARCH`;
const USER_AGENT = "Mozilla/5.0 (compatible; VigiloRoster licence verification)";
const TIMEOUT_MS = 15_000;

export interface LarsRecord {
  name: string; // "SURNAME, FIRST MIDDLE"
  type: string; // e.g. "Private Security Individual Licence"
  number: string; // e.g. "123-456-78A"
  expiry: Date | null; // UTC midnight
  activities: string[]; // e.g. ["Crowd Controller", "Security Guard"]
}

export interface LarsSearchResult {
  dataCurrentAs: string | null; // "21:05 on 29/09/2026"
  records: LarsRecord[];
}

export type LicenceCheckStatus = "VERIFIED" | "NOT_FOUND" | "NAME_MISMATCH" | "EXPIRED" | "ERROR";

export interface LicenceEvaluation {
  status: Exclude<LicenceCheckStatus, "ERROR">;
  message: string;
  record: LarsRecord | null;
}

export class LarsError extends Error {}

/**
 * Canonical LARS number format is "NNN-NNN-NNX" (11 chars, the field's
 * maxlength). Guards often type it without dashes, so rebuild them when the
 * shape matches; otherwise pass through upper-cased so LARS can decide.
 */
export function normaliseLicenceNumber(input: string): string {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = compact.match(/^(\d{3})(\d{3})(\d{2}[A-Z])$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return input.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function xmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/'/g, "&apos;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Mirrors fSearchFireForget() in PSINFP03.js for a licence-number search. */
export function buildSearchPacket(securityToken: string, licenceNumber: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return (
    `<XML><HEADER><PROCESS>SEARCH</PROCESS><TIMESTAMP>${ts}</TIMESTAMP>` +
    `<SECURITYTOKEN>${xmlEscape(securityToken)}</SECURITYTOKEN></HEADER>` +
    `<PAYLOAD><GNDTLE01 id='idSearchPane'>` +
    // "All" registers, as the page defaults to: searching by number with "L"
    // (Licence Holders) returns no results even for individual licences.
    `<CONTROL name='dropdownlist'>%</CONTROL>` +
    `<CONTROL name='searchtext'></CONTROL>` +
    `<CONTROL name='SearchCriteriadropdownlist'>X</CONTROL>` +
    `<CONTROL name='SearchAuthNb'>${xmlEscape(normaliseLicenceNumber(licenceNumber))}</CONTROL>` +
    `<CONTROL name='Index'></CONTROL><CONTROL name='Page'>1</CONTROL>` +
    `</GNDTLE01></PAYLOAD></XML>`
  );
}

export function extractSecurityToken(pageHtml: string): string | null {
  return pageHtml.match(/g_strSecurityToken\s*=\s*["']([^"']+)["']/)?.[1] ?? null;
}

function cellText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDmy(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

export function parseSearchResults(html: string): LarsSearchResult {
  const dataCurrentAs = html.match(/Data Current as at\s*([^<]+?)\s*(?:&nbsp;|<)/i)?.[1]?.trim() ?? null;
  if (/No Results Found/i.test(html)) return { dataCurrentAs, records: [] };

  // Data rows are the only <tr>s carrying a RecordKey attribute; the header
  // row and footer spacer row don't.
  const records: LarsRecord[] = [];
  const rowRe = /<tr\b[^>]*\bRecordKey\s*=\s*['"][^'"]*['"][^>]*>([\s\S]*?)<\/\s*tr>/gi;
  for (const row of html.matchAll(rowRe)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => cellText(c[1]));
    if (cells.length < 5) continue;
    const [name, type, number, expiry, activities] = cells;
    records.push({
      name,
      type,
      number,
      expiry: parseDmy(expiry),
      activities: activities.split(",").map((a) => a.trim()).filter(Boolean),
    });
  }

  if (records.length === 0) {
    // Neither "no results" nor a parseable row — the page layout has changed
    // (or we got an error page). Surface it rather than reporting NOT_FOUND.
    throw new LarsError("Unrecognised LARS response — the register page may have changed");
  }
  return { dataCurrentAs, records };
}

function nameTokens(s: string): string[] {
  return s.toUpperCase().replace(/[^A-Z\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
}

/** LARS lists "SURNAME, GIVEN NAMES". Match surname exactly and the first given name. */
export function namesMatch(larsName: string, firstName: string, lastName: string): boolean {
  const [larsSurname = "", larsGiven = ""] = larsName.split(",");
  const surnameOk = nameTokens(larsSurname).join(" ") === nameTokens(lastName).join(" ");
  const givenFirst = nameTokens(firstName)[0];
  const givenOk = !!givenFirst && nameTokens(larsGiven).includes(givenFirst);
  return surnameOk && givenOk;
}

export function evaluateLicence(
  result: LarsSearchResult,
  guard: { firstName: string; lastName: string; licenceNumber: string },
  now = new Date(),
): LicenceEvaluation {
  const wanted = normaliseLicenceNumber(guard.licenceNumber);
  const record = result.records.find((r) => normaliseLicenceNumber(r.number) === wanted) ?? null;
  if (!record) {
    return {
      status: "NOT_FOUND",
      message: "Not on the LARS public register — check the number, or the licence may be expired, suspended or cancelled",
      record: null,
    };
  }
  if (!namesMatch(record.name, guard.firstName, guard.lastName)) {
    return {
      status: "NAME_MISMATCH",
      message: `Licence is registered to ${record.name}, not ${guard.firstName} ${guard.lastName}`,
      record,
    };
  }
  if (record.expiry && record.expiry.getTime() < now.getTime()) {
    return { status: "EXPIRED", message: "Licence expiry date on LARS has passed", record };
  }
  return { status: "VERIFIED", message: `Verified on LARS: ${record.type}`, record };
}

function readCookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw = h.getSetCookie?.() ?? (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []);
  return raw.map((c) => c.split(";")[0]).join("; ");
}

/** Node's fetch reports network failures as a bare "fetch failed"; surface the cause. */
function describeNetworkError(e: unknown): string {
  if (!(e instanceof Error)) return "unknown error";
  if (e.name === "TimeoutError") return `timed out after ${TIMEOUT_MS / 1000}s`;
  const cause = e.cause as { code?: string; message?: string } | undefined;
  const detail = cause?.code ?? cause?.message;
  return detail ? `${e.message} (${detail})` : e.message;
}

export async function lookupLarsLicence(
  licenceNumber: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LarsSearchResult> {
  try {
    return await lookup(licenceNumber, fetchImpl);
  } catch (e: unknown) {
    if (e instanceof LarsError) throw e;
    throw new LarsError(`could not reach LARS: ${describeNetworkError(e)}`);
  }
}

async function lookup(licenceNumber: string, fetchImpl: typeof fetch): Promise<LarsSearchResult> {
  const page = await fetchImpl(SEARCH_PAGE, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!page.ok) throw new LarsError(`LARS search page returned HTTP ${page.status}`);
  const token = extractSecurityToken(await page.text());
  if (!token) throw new LarsError("LARS security token not found on search page");

  const res = await fetchImpl(SEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "text/xml",
      AUDIT_ACTION: "",
      Cookie: readCookies(page),
      Referer: SEARCH_PAGE,
    },
    body: buildSearchPacket(token, licenceNumber),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (res.headers.get("REAUTHENTICATE") === "NOW") throw new LarsError("LARS rejected the session");
  if (!res.ok) throw new LarsError(`LARS search returned HTTP ${res.status}`);
  return parseSearchResults(await res.text());
}
