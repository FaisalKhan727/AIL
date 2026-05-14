"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const router = useRouter();
  const [phone, setPhone] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const remembered = localStorage.getItem("vg_last_phone");
    if (remembered) setPhone(remembered);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/g/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), pin }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Sign-in failed");
        return;
      }
      localStorage.setItem("vg_last_phone", phone.trim());
      router.push("/g");
    } catch {
      setError("Network error — try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg bg-white shadow-md p-6">
        <h1 className="text-2xl font-semibold mb-1">Vigilo Guards</h1>
        <p className="text-sm text-slate-600 mb-6">Sign in to see your shifts.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Phone (E.164, e.g. +61412345678)
            </label>
            <input
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="+61412345678"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              6-digit PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded border border-slate-300 px-3 py-2 text-lg tracking-widest text-center"
              placeholder="• • • • • •"
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-slate-900 text-white py-3 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-xs text-slate-500 mt-6">
          First time here? Your roster manager will send you a setup link via SMS.
        </p>
      </div>
    </div>
  );
}
