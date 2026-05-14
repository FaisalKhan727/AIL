"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

interface VerifyResponse {
  invitingCompany: { id: string; name: string; brandColour: string | null };
  identity: {
    firstName: string;
    lastName: string;
    phone: string;
    hasAccount: boolean;
    appActivated: boolean;
  };
}

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: VerifyResponse };

export default function SetupForm({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<Status>({ kind: "loading" });
  const [pin, setPin] = React.useState("");
  const [confirmPin, setConfirmPin] = React.useState("");
  const [backupEmail, setBackupEmail] = React.useState("");
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/g/setup/verify-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatus({ kind: "error", message: json.error ?? "Invalid setup link" });
        } else {
          setStatus({ kind: "ready", data: json as VerifyResponse });
        }
      } catch {
        if (!cancelled) {
          setStatus({ kind: "error", message: "Could not reach server. Check your connection." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (status.kind !== "ready") return;

    if (!/^\d{6}$/.test(pin)) {
      setSubmitError("PIN must be exactly 6 digits");
      return;
    }
    if (!status.data.identity.hasAccount) {
      if (pin !== confirmPin) {
        setSubmitError("PINs do not match");
        return;
      }
      if (!termsAccepted) {
        setSubmitError("You must accept the Terms & Privacy to continue");
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/g/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          pin,
          termsAccepted: termsAccepted || status.data.identity.hasAccount,
          backupEmail: backupEmail.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error ?? "Setup failed");
        return;
      }
      router.push("/g");
    } catch {
      setSubmitError("Network error — try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (status.kind === "loading") {
    return <CenteredCard>Verifying invite…</CenteredCard>;
  }
  if (status.kind === "error") {
    return (
      <CenteredCard>
        <h1 className="text-xl font-semibold text-red-600 mb-2">Setup link unavailable</h1>
        <p className="text-sm text-slate-600">{status.message}</p>
        <p className="text-xs text-slate-500 mt-4">
          Ask your roster manager to send a new app invite.
        </p>
      </CenteredCard>
    );
  }

  const { invitingCompany, identity } = status.data;
  const isReturning = identity.hasAccount;

  return (
    <CenteredCard>
      <div
        className="h-2 -mx-6 -mt-6 mb-4 rounded-t-lg"
        style={{ backgroundColor: invitingCompany.brandColour ?? "#0B1E3F" }}
      />
      <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
        Invited by
      </p>
      <h1 className="text-2xl font-semibold mb-1">{invitingCompany.name}</h1>
      <p className="text-sm text-slate-600 mb-6">
        {isReturning
          ? `Welcome back, ${identity.firstName}. Enter your existing PIN to add ${invitingCompany.name}'s shifts to your app.`
          : `Hi ${identity.firstName}, set up your app to receive shift notifications.`}
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
          <input
            type="tel"
            value={identity.phone}
            disabled
            className="w-full rounded border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isReturning ? "Your PIN (6 digits)" : "Set a 6-digit PIN"}
          </label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full rounded border border-slate-300 px-3 py-2 text-lg tracking-widest text-center"
            placeholder="• • • • • •"
            required
          />
        </div>

        {!isReturning && (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Confirm PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full rounded border border-slate-300 px-3 py-2 text-lg tracking-widest text-center"
                placeholder="• • • • • •"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Backup email (optional)
              </label>
              <input
                type="email"
                value={backupEmail}
                onChange={(e) => setBackupEmail(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="you@example.com"
              />
            </div>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1"
              />
              <span>
                I accept the Terms of Service and Privacy Policy.
              </span>
            </label>
          </>
        )}

        {submitError && (
          <p className="text-sm text-red-600">{submitError}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-900 text-white py-3 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting
            ? "Setting up…"
            : isReturning
              ? "Add this company"
              : "Activate app"}
        </button>
      </form>

      <p className="text-xs text-slate-500 mt-6">
        After this, add the app to your home screen:
      </p>
      <ul className="text-xs text-slate-500 list-disc list-inside mt-1 space-y-1">
        <li>iPhone (Safari): Share menu → Add to Home Screen</li>
        <li>Android (Chrome): tap the install banner or menu → Install app</li>
      </ul>
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg bg-white shadow-md p-6">{children}</div>
    </div>
  );
}
