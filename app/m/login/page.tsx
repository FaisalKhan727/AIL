"use client";
import * as React from "react";
import { Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { VigiloMark, VigiloWordmark } from "@/components/shell/logo";

export default function GuardLoginPage() {
  return (
    <Suspense fallback={null}>
      <GuardLogin />
    </Suspense>
  );
}

function GuardLogin() {
  const router = useRouter();
  const ended = useSearchParams().get("ended");
  const [step, setStep] = React.useState<"phone" | "code">("phone");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(ended ? "Your access has ended. Contact the office if this is a mistake." : null);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/m/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not send a code");
      }
      setCode("");
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn("guard-otp", { phone, code, redirect: false });
    if (res?.error) {
      setBusy(false);
      setError("That code is wrong or has expired.");
      return;
    }
    router.replace("/m");
    router.refresh();
  }

  return (
    <div className="flex min-h-[100dvh] flex-col px-6 pb-8 pt-safe">
      <div className="flex items-center gap-2.5 pt-10">
        <VigiloMark className="h-8 w-8" />
        <VigiloWordmark className="text-2xl" />
      </div>

      <div className="mt-14">
        <h1 className="font-display text-[26px] font-bold leading-tight">
          {step === "phone" ? "Sign in with your mobile" : "Enter your code"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {step === "phone"
            ? "Use the number your company has on file. We'll text you a 6-digit code."
            : <>If <span className="font-mono text-foreground">{phone}</span> is registered, a code is on its way. It lasts 10 minutes.</>}
        </p>
      </div>

      {step === "phone" ? (
        <form onSubmit={sendCode} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Mobile number</Label>
            <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0412 345 678" className="h-12 text-base"
              value={phone} onChange={(e) => setPhone(e.target.value)} required autoFocus />
          </div>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <Button type="submit" className="h-12 w-full text-base" disabled={busy}>{busy ? "Sending…" : "Text me a code"}</Button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">6-digit code</Label>
            <Input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}
              className="h-14 text-center font-mono text-2xl tracking-[0.4em]"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required autoFocus />
          </div>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <Button type="submit" className="h-12 w-full text-base" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Sign in"}</Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => { setStep("phone"); setError(null); }}>Change number</button>
            <button type="button" className="text-cyan hover:underline disabled:opacity-50" disabled={busy} onClick={() => sendCode()}>Send again</button>
          </div>
        </form>
      )}

      <p className="mt-auto pt-10 text-xs text-muted-foreground">
        Not getting a code? Your number may not match the one on file. Contact your supervisor.
      </p>
    </div>
  );
}
