import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSearchPacket,
  evaluateLicence,
  extractSecurityToken,
  lookupLarsLicence,
  namesMatch,
  normaliseLicenceNumber,
  parseSearchResults,
} from "@/lib/licence/lars";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const FOUND = fixture("lars-search-found.html");
const NONE = fixture("lars-search-none.html");
const guard = { firstName: "Jane", lastName: "Citizen", licenceNumber: "123-456-78A" };
const NOW = new Date("2026-09-30T00:00:00Z");

describe("normaliseLicenceNumber", () => {
  it("adds dashes to a compact number", () => {
    expect(normaliseLicenceNumber("12345678a")).toBe("123-456-78A");
  });

  it("tolerates spaces and stray punctuation", () => {
    expect(normaliseLicenceNumber(" 123 456 78A ")).toBe("123-456-78A");
    expect(normaliseLicenceNumber("123.456.78a")).toBe("123-456-78A");
  });

  it("passes unknown shapes through upper-cased", () => {
    expect(normaliseLicenceNumber("ab-12")).toBe("AB-12");
  });
});

describe("buildSearchPacket", () => {
  it("searches all registers by number with the session token", () => {
    const xml = buildSearchPacket("TOKEN-1", "12345678a", new Date(2026, 8, 30, 11, 39, 12));
    expect(xml).toContain("<TIMESTAMP>20260930113912</TIMESTAMP>");
    expect(xml).toContain("<SECURITYTOKEN>TOKEN-1</SECURITYTOKEN>");
    expect(xml).toContain("<CONTROL name='dropdownlist'>%</CONTROL>");
    expect(xml).toContain("<CONTROL name='SearchAuthNb'>123-456-78A</CONTROL>");
    expect(xml).toContain("<CONTROL name='Page'>1</CONTROL>");
  });
});

describe("extractSecurityToken", () => {
  it("reads g_strSecurityToken from the search page", () => {
    const page = `<script>\ng_strSecurityToken = "4FB72925-4143-49B9-B795-7B5C9AFD6830";\n</script>`;
    expect(extractSecurityToken(page)).toBe("4FB72925-4143-49B9-B795-7B5C9AFD6830");
    expect(extractSecurityToken("<html></html>")).toBeNull();
  });
});

describe("parseSearchResults", () => {
  it("parses a result row", () => {
    const r = parseSearchResults(FOUND);
    expect(r.dataCurrentAs).toBe("21:05 on 29/09/2026");
    expect(r.records).toHaveLength(1);
    expect(r.records[0]).toEqual({
      name: "CITIZEN, JANE MARIE",
      type: "Private Security Individual Licence",
      number: "123-456-78A",
      expiry: new Date(Date.UTC(2029, 6, 16)),
      activities: ["Crowd Controller", "Security Guard"],
    });
  });

  it("returns no records for 'No Results Found'", () => {
    expect(parseSearchResults(NONE).records).toEqual([]);
  });

  it("throws on an unrecognised page rather than reporting not-found", () => {
    expect(() => parseSearchResults("<html><body>Service unavailable</body></html>")).toThrow(/Unrecognised/);
  });
});

describe("namesMatch", () => {
  it("matches surname and first given name, ignoring case and middle names", () => {
    expect(namesMatch("CITIZEN, JANE MARIE", "jane", "Citizen")).toBe(true);
  });

  it("handles hyphenated and multi-word surnames", () => {
    expect(namesMatch("SMITH-JONES, AMY", "Amy", "Smith Jones")).toBe(true);
    expect(namesMatch("VAN DER BERG, TOM", "Tom", "van der Berg")).toBe(true);
  });

  it("rejects a different person", () => {
    expect(namesMatch("CITIZEN, JOHN", "Jane", "Citizen")).toBe(false);
    expect(namesMatch("CITIZENS, JANE", "Jane", "Citizen")).toBe(false);
  });
});

describe("evaluateLicence", () => {
  it("verifies a current licence held by the guard", () => {
    const ev = evaluateLicence(parseSearchResults(FOUND), { ...guard, licenceNumber: "12345678a" }, NOW);
    expect(ev.status).toBe("VERIFIED");
    expect(ev.record?.number).toBe("123-456-78A");
  });

  it("flags a licence registered to someone else", () => {
    const ev = evaluateLicence(parseSearchResults(FOUND), { ...guard, firstName: "Bob" }, NOW);
    expect(ev.status).toBe("NAME_MISMATCH");
    expect(ev.message).toContain("CITIZEN, JANE MARIE");
  });

  it("flags an expired licence", () => {
    const ev = evaluateLicence(parseSearchResults(FOUND), guard, new Date("2029-07-17T00:00:00Z"));
    expect(ev.status).toBe("EXPIRED");
  });

  it("reports NOT_FOUND when LARS has no match", () => {
    expect(evaluateLicence(parseSearchResults(NONE), guard, NOW).status).toBe("NOT_FOUND");
  });
});

describe("lookupLarsLicence", () => {
  it("loads the page for a token + cookie, then POSTs the search", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (calls.length === 1) {
        return new Response(`g_strSecurityToken = "TOK";`, {
          headers: { "set-cookie": "ASPSESSIONIDX=abc; path=/" },
        });
      }
      return new Response(FOUND);
    }) as typeof fetch;

    const r = await lookupLarsLicence("12345678A", fakeFetch);
    expect(r.records[0].number).toBe("123-456-78A");
    expect(calls[1].url).toContain("PSINFP03.asp?Process=SEARCH");
    expect(calls[1].init?.method).toBe("POST");
    const headers = calls[1].init?.headers as Record<string, string>;
    expect(headers.Cookie).toBe("ASPSESSIONIDX=abc");
    expect(String(calls[1].init?.body)).toContain("<SECURITYTOKEN>TOK</SECURITYTOKEN>");
  });

  it("includes the network cause instead of a bare 'fetch failed'", async () => {
    const fakeFetch = (async () => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) });
    }) as unknown as typeof fetch;
    await expect(lookupLarsLicence("12345678A", fakeFetch)).rejects.toThrow("could not reach LARS: fetch failed (ECONNRESET)");
  });

  it("fails clearly when the token is missing", async () => {
    const fakeFetch = (async () => new Response("<html></html>")) as unknown as typeof fetch;
    await expect(lookupLarsLicence("12345678A", fakeFetch)).rejects.toThrow(/security token/);
  });
});
