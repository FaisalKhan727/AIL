"use client";
import * as React from "react";
import { fmtInTz } from "@/lib/date";
import { api } from "@/lib/fetcher";

export interface GuardShift {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  role: string | null;
  notes: string | null;
  site: { name: string; address: string; contactName: string | null; contactPhone: string | null };
  clockInAt: string | null;
  clockOutAt: string | null;
  onShift: boolean;
  canRespond: boolean;
  canClockIn: boolean;
  canClockOut: boolean;
}

export function shiftWhen(s: Pick<GuardShift, "startAt" | "endAt">): { day: string; time: string } {
  return { day: fmtInTz(s.startAt, "EEE d MMM"), time: `${fmtInTz(s.startAt, "HH:mm")} – ${fmtInTz(s.endAt, "HH:mm")}` };
}

export function hoursBetween(a: string, b: string): string {
  const h = (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
  return `${Math.round(h * 100) / 100} h`;
}

/** h:mm:ss since `from`, re-rendered every second. */
export function useElapsed(from: string | null): string {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!from) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [from]);
  if (!from) return "";
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** Best-effort location fix. Resolves to null if denied, unavailable or slow. */
function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const timer = setTimeout(() => resolve(null), 7000);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timer); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      () => { clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: true, timeout: 6500, maximumAge: 60_000 },
    );
  });
}

export type ShiftAction = "confirm" | "decline" | "clock-in" | "clock-out";

export async function shiftAction(id: string, action: ShiftAction, reason?: string): Promise<{ shift: GuardShift; located: boolean }> {
  const isClock = action === "clock-in" || action === "clock-out";
  const pos = isClock ? await getPosition() : null;
  const shift = await api<GuardShift>(`/api/m/shifts/${id}`, {
    method: "POST",
    body: JSON.stringify({ action, reason, ...(pos ?? {}) }),
  });
  return { shift, located: Boolean(pos) };
}
