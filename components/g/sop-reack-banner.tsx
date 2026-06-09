"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ChevronRight } from "lucide-react";

/**
 * Non-dismissible banner that surfaces pending SOP re-acknowledgements
 * across the whole guard PWA. Polls /api/g/sop/pending on each
 * navigation and lazy-refresh; renders nothing when the list is empty,
 * which is the steady state.
 *
 * Intentionally NOT shown on:
 *   - /g/sign-in  - user isn't authenticated, the call would 401
 *   - /g/setup/*  - first-time setup, no session yet
 *   - /g/sop      - the re-ack screen itself (banner would obscure it)
 *
 * Tapping anywhere on the banner routes to /g/sop.
 */
interface PendingItem {
  companyName: string;
  sop: { id: string; title: string; version: number };
}

export function SopReackBanner() {
  const pathname = usePathname();
  const hideOn = pathname === "/g/sign-in" || pathname.startsWith("/g/setup") || pathname === "/g/sop";

  const { data } = useQuery<{ pending: PendingItem[] }>({
    queryKey: ["g-sop-pending"],
    queryFn: async () => {
      const r = await fetch("/api/g/sop/pending");
      if (r.status === 401) return { pending: [] };
      if (!r.ok) throw new Error("pending check failed");
      return r.json();
    },
    // Refetch when the window regains focus (e.g. after the admin
    // publishes a new SOP and the guard switches back to the tab).
    refetchOnWindowFocus: true,
    // Quiet failures — if the network drops we don't want a noisy
    // banner. The next focus event will retry.
    retry: 1,
    enabled: !hideOn,
  });

  if (hideOn) return null;
  const pending = data?.pending ?? [];
  if (pending.length === 0) return null;
  const head = pending[0];

  return (
    <Link
      href="/g/sop"
      className="block sticky top-0 z-40 bg-red-600 text-white shadow-md active:bg-red-700"
    >
      <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium opacity-90">
            {head.companyName} · SOP update
            {pending.length > 1 ? ` (+${pending.length - 1} more)` : ""}
          </div>
          <div className="text-sm font-semibold truncate">
            Tap to review and acknowledge {head.sop.title}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 flex-shrink-0 opacity-80" />
      </div>
    </Link>
  );
}
