"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { auDate } from "@/components/ops/kit";

interface Job {
  date: string; guardName: string | null; companyName: string;
  run: { code: string; name: string; client: { name: string } | null; vehicle: { code: string; rego: string } | null; stops: { id: string; name: string; address: string | null; instructions: string | null }[] };
}

// A paper runsheet for the vehicle: black on white, sized for A4.
export default function RunsheetPage() {
  const { id } = useParams<{ id: string }>();
  const { data: job, isLoading } = useQuery<Job>({ queryKey: ["patrol-job", id], queryFn: () => api(`/api/patrol-jobs/${id}`) });
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!job) return <p className="text-muted-foreground">Runsheet not found.</p>;
  return (
    <>
      <div className="no-print mb-4 flex justify-end"><Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Print or save as PDF</Button></div>
      <div className="print-sheet mx-auto max-w-3xl rounded-md p-10 text-sm">
        <div className="flex items-start justify-between border-b-2 border-black pb-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-neutral-500">{job.companyName} · Patrol runsheet</div>
            <div className="mt-1 text-2xl font-bold">{job.run.code} — {job.run.name}</div>
          </div>
          <div className="text-right text-xs leading-relaxed">
            <div><strong>Date:</strong> {auDate(job.date)}</div>
            <div><strong>Vehicle:</strong> {job.run.vehicle ? `${job.run.vehicle.code} (${job.run.vehicle.rego})` : "—"}</div>
            <div><strong>Officer:</strong> {job.guardName ?? "________________"}</div>
            <div><strong>Client:</strong> {job.run.client?.name ?? "—"}</div>
          </div>
        </div>
        <table className="mt-5 w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-black text-left text-[11px] uppercase tracking-wider">
              <th className="w-8 py-1.5">#</th><th className="py-1.5">Stop</th><th className="py-1.5">Instructions</th><th className="w-20 py-1.5">Time</th><th className="w-16 py-1.5">Initial</th>
            </tr>
          </thead>
          <tbody>
            {job.run.stops.map((s, i) => (
              <tr key={s.id} className="border-b border-neutral-300 align-top">
                <td className="py-2.5">{i + 1}</td>
                <td className="py-2.5"><strong>{s.name}</strong>{s.address && <div className="text-neutral-600">{s.address}</div>}</td>
                <td className="py-2.5 text-neutral-700">{s.instructions}</td>
                <td className="py-2.5"><span className="block h-5 border-b border-neutral-400" /></td>
                <td className="py-2.5"><span className="block h-5 border-b border-neutral-400" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-10 grid grid-cols-2 gap-10 text-xs">
          <div><div className="h-10 border-b border-black" />Officer signature</div>
          <div><div className="h-10 border-b border-black" />Supervisor sign-off</div>
        </div>
        <p className="mt-6 text-[11px] text-neutral-500">Scan each stop in the Vigilo guard app as you attend it. Record a reason for any stop you cannot reach.</p>
      </div>
    </>
  );
}
