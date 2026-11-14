"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { formatPhoneAU } from "@/lib/utils";

interface Me {
  guard: { id: string; firstName: string; lastName: string; phone: string; email: string | null };
  companyName: string;
  otherCompanies: { guardId: string; companyName: string }[];
}

export default function GuardProfile() {
  const qc = useQueryClient();
  const router = useRouter();
  const { update } = useSession();
  const { data } = useQuery<Me>({ queryKey: ["m-me"], queryFn: () => api(`/api/m/me`) });
  const [switching, setSwitching] = React.useState<string | null>(null);

  async function switchTo(guardId: string) {
    setSwitching(guardId);
    // The server re-checks that the target record has this same mobile number.
    await update({ guardId });
    qc.clear();
    router.replace("/m");
    router.refresh();
  }

  if (!data) return <p className="text-muted-foreground">Loading…</p>;
  const g = data.guard;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold">Profile</h1>

      <section className="rounded-[10px] border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/20 font-semibold ring-1 ring-primary/40">
            {g.firstName[0]}{g.lastName[0]}
          </span>
          <div>
            <div className="text-base font-semibold">{g.firstName} {g.lastName}</div>
            <div className="text-sm text-muted-foreground">{data.companyName}</div>
          </div>
        </div>
        <dl className="mt-4 space-y-2 border-t pt-3 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Mobile</dt><dd className="font-mono">{formatPhoneAU(g.phone)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Email</dt><dd className="truncate">{g.email || "—"}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">Wrong details? Ask the office to update them.</p>
      </section>

      {data.otherCompanies.length > 0 && (
        <section>
          <div className="eyebrow mb-2">You also work for</div>
          <ul className="divide-y rounded-[10px] border bg-card">
            {data.otherCompanies.map((c) => (
              <li key={c.guardId} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span>{c.companyName}</span>
                <Button size="sm" variant="outline" disabled={Boolean(switching)} onClick={() => switchTo(c.guardId)}>
                  {switching === c.guardId ? "Switching…" : "Switch"}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-[10px] border bg-card p-4 text-sm">
        <div className="eyebrow mb-1.5">Add to your home screen</div>
        <p className="text-muted-foreground">
          iPhone: tap Share, then “Add to Home Screen”. Android: open the browser menu and choose “Install app”.
        </p>
      </section>

      <Button variant="outline" className="h-11 w-full text-red-700" onClick={() => signOut({ callbackUrl: "/m/login" })}>
        <LogOut className="h-4 w-4" /> Sign out
      </Button>
    </div>
  );
}
