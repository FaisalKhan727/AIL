export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let payload: unknown = null;
    try { payload = await res.json(); } catch { /* ignore */ }
    const msg =
      (typeof payload === "object" && payload && "error" in payload && typeof (payload as { error?: unknown }).error === "string")
        ? (payload as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}
