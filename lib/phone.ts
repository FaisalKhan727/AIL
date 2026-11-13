/** Accepts 04xx xxx xxx, 614…, +614… and returns E.164, or null. */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  if (/^0[2-478]\d{8}$/.test(digits)) return `+61${digits.slice(1)}`;
  if (/^61\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}
