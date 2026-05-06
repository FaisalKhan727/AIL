"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { planCopy, calendarDayDiff, shiftDateInTz } from "@/lib/copy-roster";
import { APP_TZ, fmtDate, fmtIso } from "@/lib/date";

interface RosterRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  shiftCount: number;
  status: string;
}

interface SourceShiftJson {
  id: string;
  guardId: string | null;
  siteId: string;
  templateId: string | null;
  startAt: string;
  endAt: string;
  role: string | null;
  notes: string | null;
}

interface SourceRoster {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  shifts: SourceShiftJson[];
}

interface GuardJson {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  licenceExpiry: string | null;
}

interface SiteJson {
  id: string;
  name: string;
  active: boolean;
}

function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-select a specific source roster (e.g. when invoked from a roster
   *  detail page's "Copy this roster forward" action). When omitted the
   *  dialog defaults to the most recent past roster. */
  initialSourceId?: string;
}

export function CopyRosterDialog({ open, onOpenChange, initialSourceId }: Props) {
  const { toast } = useToast();

  const [sourceId, setSourceId] = React.useState<string>("");
  const [newName, setNewName] = React.useState<string>("");
  const [newStartDate, setNewStartDate] = React.useState<string>(""); // yyyy-MM-dd
  const [newEndDate, setNewEndDate] = React.useState<string>("");

  const [keepGuards, setKeepGuards] = React.useState(true);
  const [keepNotes, setKeepNotes] = React.useState(true);
  const [skipInactiveGuards, setSkipInactiveGuards] = React.useState(true);
  const [skipInactiveSites, setSkipInactiveSites] = React.useState(true);

  // Reset state every time the dialog opens so a previous interaction
  // doesn't bleed into the next copy.
  React.useEffect(() => {
    if (!open) return;
    setSourceId(initialSourceId ?? "");
    setKeepGuards(true);
    setKeepNotes(true);
    setSkipInactiveGuards(true);
    setSkipInactiveSites(true);
  }, [open, initialSourceId]);

  const { data: allRosters = [] } = useQuery<RosterRow[]>({
    queryKey: ["rosters"],
    queryFn: () => api(`/api/rosters`),
    enabled: open,
  });

  const sortedRosters = React.useMemo(() => {
    return [...allRosters]
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .slice(0, 12);
  }, [allRosters]);

  // If the caller didn't pin a source, default to the most recent roster
  // whose endDate is in the past. Falls back to the latest roster overall.
  React.useEffect(() => {
    if (!open || sourceId || sortedRosters.length === 0) return;
    if (initialSourceId) return;
    const now = Date.now();
    const past = sortedRosters.find((r) => new Date(r.endDate).getTime() < now);
    setSourceId((past ?? sortedRosters[0]).id);
  }, [open, sortedRosters, sourceId, initialSourceId]);

  const { data: source } = useQuery<SourceRoster>({
    queryKey: ["roster", sourceId, "for-copy"],
    queryFn: () => api(`/api/rosters/${sourceId}`),
    enabled: open && Boolean(sourceId),
  });

  const { data: guards = [] } = useQuery<GuardJson[]>({
    queryKey: ["guards", "all-for-copy"],
    queryFn: () => api(`/api/guards`),
    enabled: open,
  });
  const { data: sites = [] } = useQuery<SiteJson[]>({
    queryKey: ["sites", "all-for-copy"],
    queryFn: () => api(`/api/sites`),
    enabled: open,
  });

  // When the source loads, default the new dates to source + 7 days and the
  // name to "Week of <new start>". The user can override either.
  const lastSeededFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!source) return;
    if (lastSeededFor.current === source.id) return;
    // Use the same tz-aware shift the planner uses so the defaults always
    // match what would actually be created.
    const newStart = shiftDateInTz(new Date(source.startDate), 7, APP_TZ);
    const newEnd = shiftDateInTz(new Date(source.endDate), 7, APP_TZ);
    setNewStartDate(fmtIso(newStart));
    setNewEndDate(fmtIso(newEnd));
    setNewName(`Week of ${fmtIso(newStart)}`);
    lastSeededFor.current = source.id;
  }, [source]);

  const plan = React.useMemo(() => {
    if (!source || !newStartDate) return null;
    const sourceStart = new Date(source.startDate);
    const newStart = ymdToLocalDate(newStartDate);
    const daysOffset = calendarDayDiff(sourceStart, newStart, APP_TZ);

    const guardMap = new Map(
      guards.map((g) => [
        g.id,
        {
          id: g.id,
          active: g.active,
          licenceExpiry: g.licenceExpiry ? new Date(g.licenceExpiry) : null,
        },
      ]),
    );
    const siteMap = new Map(sites.map((s) => [s.id, { id: s.id, active: s.active }]));

    return planCopy({
      shifts: source.shifts.map((s) => ({
        id: s.id,
        guardId: s.guardId,
        siteId: s.siteId,
        templateId: s.templateId,
        startAt: new Date(s.startAt),
        endAt: new Date(s.endAt),
        role: s.role,
        notes: s.notes,
      })),
      guards: guardMap,
      sites: siteMap,
      daysOffset,
      timezone: APP_TZ,
      options: { keepGuards, keepNotes, skipInactiveGuards, skipInactiveSites },
    });
  }, [source, guards, sites, newStartDate, keepGuards, keepNotes, skipInactiveGuards, skipInactiveSites]);

  const sourceSummary = React.useMemo(() => {
    if (!source) return null;
    const guardSet = new Set<string>();
    const siteSet = new Set<string>();
    for (const s of source.shifts) {
      if (s.guardId) guardSet.add(s.guardId);
      siteSet.add(s.siteId);
    }
    return {
      shiftCount: source.shifts.length,
      guardCount: guardSet.size,
      siteCount: siteSet.size,
    };
  }, [source]);

  // Map shift id -> short label so the warnings panel can name shifts.
  const shiftLabel = React.useMemo(() => {
    const m = new Map<string, string>();
    if (!source) return m;
    const guardName = new Map(guards.map((g) => [g.id, `${g.firstName} ${g.lastName}`]));
    const siteName = new Map(sites.map((s) => [s.id, s.name]));
    for (const s of source.shifts) {
      const who = s.guardId ? guardName.get(s.guardId) ?? "?" : "Unassigned";
      m.set(s.id, `${who} · ${siteName.get(s.siteId) ?? "?"} · ${fmtDate(s.startAt)}`);
    }
    return m;
  }, [source, guards, sites]);

  const emptySource = source && source.shifts.length === 0;
  const canPreview = Boolean(source && plan && plan.plannedCount > 0);

  function handlePreview() {
    if (!plan) return;
    // Step 3 will replace this with an actual preview screen + confirm flow.
    toast({
      title: `Plan ready: ${plan.plannedCount} to create, ${plan.skippedCount} skipped, ${plan.unassignedCount} unassigned`,
      description: "Preview & confirm screen coming in step 3.",
      variant: "success",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy roster from previous week</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Copy from</Label>
            <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">Select source roster…</option>
              {sortedRosters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — {r.shiftCount} shift{r.shiftCount === 1 ? "" : "s"}
                </option>
              ))}
            </Select>
          </div>

          {source && sourceSummary && (
            <div className="text-xs text-muted-foreground border rounded p-2">
              <strong>Source:</strong> {fmtDate(source.startDate)} – {fmtDate(source.endDate)}
              {" · "}
              {sourceSummary.shiftCount} shifts · {sourceSummary.guardCount} guards · {sourceSummary.siteCount} sites
            </div>
          )}

          {emptySource && (
            <div className="rounded border bg-amber-50 p-2 text-xs text-amber-800">
              The selected roster has no shifts to copy. Pick a different source.
            </div>
          )}

          <div className="space-y-1">
            <Label>New roster name</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>New start date</Label>
              <Input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>New end date</Label>
              <Input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} />
            </div>
          </div>

          <fieldset className="space-y-1.5 border rounded p-3">
            <legend className="text-sm font-medium px-1">Options</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={keepGuards} onChange={(e) => setKeepGuards(e.target.checked)} />
              Keep guard assignments
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={keepNotes} onChange={(e) => setKeepNotes(e.target.checked)} />
              Keep notes from each shift
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={skipInactiveGuards} onChange={(e) => setSkipInactiveGuards(e.target.checked)} />
              Skip shifts whose guard is now inactive
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={skipInactiveSites} onChange={(e) => setSkipInactiveSites(e.target.checked)} />
              Skip shifts at inactive sites
            </label>
          </fieldset>

          {plan && plan.sourceShiftCount > 0 && (
            <div className="space-y-2 text-sm">
              <div className="rounded border bg-muted/40 p-2 text-xs">
                <strong>Plan:</strong> {plan.plannedCount} to create
                {plan.skippedCount > 0 && <> · {plan.skippedCount} skipped</>}
                {plan.unassignedCount > 0 && <> · {plan.unassignedCount} unassigned</>}
              </div>

              {plan.skipped.length > 0 && (
                <div className="rounded border bg-amber-50 p-2 text-xs">
                  <div className="font-medium text-amber-900 mb-1">Skipped ({plan.skipped.length})</div>
                  <ul className="list-disc pl-4 text-amber-900/90 space-y-0.5">
                    {plan.skipped.map((s) => (
                      <li key={s.sourceShiftId}>
                        {shiftLabel.get(s.sourceShiftId) ?? s.sourceShiftId} — {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {plan.planned.some((p) => p.warnings.length > 0) && (
                <div className="rounded border bg-amber-50 p-2 text-xs">
                  <div className="font-medium text-amber-900 mb-1">Warnings</div>
                  <ul className="list-disc pl-4 text-amber-900/90 space-y-0.5">
                    {plan.planned
                      .filter((p) => p.warnings.length > 0)
                      .map((p) => (
                        <li key={p.sourceShiftId}>
                          {shiftLabel.get(p.sourceShiftId) ?? p.sourceShiftId} — {p.warnings.join("; ")}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePreview} disabled={!canPreview}>
            Preview &amp; confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
