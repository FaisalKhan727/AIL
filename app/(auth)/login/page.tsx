"use client";
import * as React from "react";
import { Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { VigiloMark, VigiloWordmark } from "@/components/shell/logo";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center bg-primary text-primary-foreground">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") || "/dashboard";
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false, callbackUrl });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background">
      {/* Brand panel — desktop only */}
      <div className="hidden lg:flex flex-col justify-between border-r bg-card p-12">
        <div className="flex items-center gap-2.5">
          <VigiloMark className="h-7 w-7" />
          <VigiloWordmark className="text-xl" />
        </div>
        <div className="max-w-md">
          <h1 className="font-display text-4xl font-bold leading-[1.1]">Every shift covered. Every licence current.</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Rostering, SMS confirmations, licence verification and timesheets for security teams, with a mobile app your guards actually use.
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-6 border-t pt-6 text-xs text-muted-foreground">
          <div><dt className="eyebrow">Roster</dt><dd className="mt-1">Publish by SMS, confirm by reply</dd></div>
          <div><dt className="eyebrow">Comply</dt><dd className="mt-1">Verify and track every credential</dd></div>
          <div><dt className="eyebrow">Pay</dt><dd className="mt-1">Clock-ins become timesheets</dd></div>
        </dl>
      </div>

      <div className="grid place-items-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <VigiloMark className="h-7 w-7" />
            <VigiloWordmark className="text-xl" />
          </div>
          <h2 className="font-display text-2xl font-bold">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Operations console for administrators.</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-8 border-t pt-4 text-xs text-muted-foreground">
            Guard? <Link href="/m" className="text-cyan hover:underline">Open the guard app</Link> and sign in with your mobile number.
          </p>
        </div>
      </div>
    </div>
  );
}
