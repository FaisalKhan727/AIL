"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Shield, FileText, Phone, Mail, MapPin, User, Camera, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface StartResponse {
  session: {
    id: string;
    currentStep: number;
    status: string;
    tokenExpiresAt: string;
  };
  guard: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    licenceNumber: string | null;
    licenceExpiry: string | null;
  };
  company: { id: string; name: string };
  data: {
    legalName: string | null;
    dateOfBirth: string | null;
    residentialAddress: string | null;
    email: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    workingRightsStatus: string | null;
    visaSubclass: string | null;
    visaExpiry: string | null;
    visaHoursPerFortnight: number | null;
    taxFreeThreshold: boolean | null;
    bankAccountName: string | null;
    licenceNumber: string | null;
    licenceClass: string | null;
    licenceExpiry: string | null;
    licenceFrontPhotoUrl: string | null;
    licenceBackPhotoUrl: string | null;
    sopAcknowledgedAt: string | null;
    contractSignatureName: string | null;
    contractSignedAt: string | null;
  } | null;
  sop: { id: string; version: number; title: string; body: string } | null;
  contract: { id: string; version: number; name: string; templateContent: string } | null;
}

// -----------------------------------------------------------------------------
// Page controller
// -----------------------------------------------------------------------------

export default function OnboardingPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "completed" }
    | { kind: "ready"; data: StartResponse; step: number }
  >({ kind: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/onboarding/${token}/start`);
        const json = await res.json();
        if (cancelled) return;
        if (res.status === 410 && json.status === "COMPLETED") {
          setState({ kind: "completed" });
          return;
        }
        if (!res.ok) {
          setState({ kind: "error", message: json.error ?? "Unable to load" });
          return;
        }
        setState({ kind: "ready", data: json as StartResponse, step: json.session.currentStep });
      } catch {
        if (!cancelled) setState({ kind: "error", message: "Network error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.kind === "loading") {
    return <CenteredPanel><p className="text-slate-500">Loading…</p></CenteredPanel>;
  }
  if (state.kind === "error") {
    return (
      <CenteredPanel>
        <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
        <h1 className="text-base font-semibold text-slate-900">{state.message}</h1>
        <p className="mt-1 text-sm text-slate-500">If this is unexpected, contact your roster manager.</p>
      </CenteredPanel>
    );
  }
  if (state.kind === "completed") {
    return (
      <CenteredPanel>
        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
        <h1 className="text-lg font-semibold text-slate-900">All done</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your onboarding has already been submitted. We&apos;ll be in touch about shifts soon.
        </p>
      </CenteredPanel>
    );
  }

  const { data } = state;
  const step = state.step;

  function advance(next: number) {
    setState((s) => (s.kind === "ready" ? { ...s, step: next } : s));
  }
  function back() {
    if (step > 1) advance(step - 1);
  }

  async function submitFinal() {
    try {
      const res = await fetch(`/api/onboarding/${token}/submit`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? "Submission failed");
        return;
      }
      setState({ kind: "completed" });
    } catch {
      alert("Network error");
    }
  }

  return (
    <div className="mx-auto max-w-md min-h-screen flex flex-col">
      <Header companyName={data.company.name} step={step} />
      <div className="flex-1 px-4 py-4">
        {step === 1 && <WelcomeStep guard={data.guard} company={data.company} onStart={() => advance(2)} />}
        {step === 2 && <PersonalStep token={token} guard={data.guard} initial={data.data} onDone={() => advance(3)} onBack={back} />}
        {step === 3 && <WorkingRightsStep token={token} initial={data.data} onDone={() => advance(4)} onBack={back} />}
        {step === 4 && <TaxBankStep token={token} initial={data.data} onDone={() => advance(5)} onBack={back} />}
        {step === 5 && <LicenceStep token={token} initial={data.data} onDone={() => advance(6)} onBack={back} />}
        {step === 6 && data.sop && <SopStep token={token} sop={data.sop} onDone={() => advance(7)} onBack={back} />}
        {step === 7 && data.contract && (
          <ContractStep token={token} contract={data.contract} guard={data.guard} initial={data.data} onSubmit={submitFinal} onBack={back} />
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Header (sticky)
// -----------------------------------------------------------------------------

function Header({ companyName, step }: { companyName: string; step: number }) {
  const totalSteps = 7;
  const pct = Math.round((step / totalSteps) * 100);
  return (
    <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="h-4 w-4 text-brand-navy shrink-0" />
          <span className="text-sm font-semibold text-slate-900 truncate">{companyName}</span>
        </div>
        <span className="text-xs text-slate-500">Step {step} of {totalSteps}</span>
      </div>
      <div className="mt-2 h-1 bg-slate-200 rounded-full overflow-hidden">
        <div className="h-full bg-brand-navy transition-all" style={{ width: `${pct}%` }} />
      </div>
    </header>
  );
}

function CenteredPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-md p-6 text-center">{children}</div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Step components
// -----------------------------------------------------------------------------

function WelcomeStep({ guard, company, onStart }: { guard: StartResponse["guard"]; company: StartResponse["company"]; onStart: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white border border-slate-200 p-5 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Welcome, {guard.firstName}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Let&apos;s get you set up to work for {company.name}.
        </p>
      </div>
      <div className="rounded-2xl bg-white border border-slate-200 p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-2">What you&apos;ll need</p>
        <ul className="space-y-2 text-sm">
          <ChecklistItem icon={User}>Your legal name, address, emergency contact</ChecklistItem>
          <ChecklistItem icon={FileText}>TFN, bank account, and security licence details</ChecklistItem>
          <ChecklistItem icon={Camera}>Photos of front + back of your licence card</ChecklistItem>
          <ChecklistItem icon={CheckCircle2}>About 5 minutes</ChecklistItem>
        </ul>
      </div>
      <Primary onClick={onStart}>Start onboarding <ArrowRight className="h-4 w-4" /></Primary>
      <p className="text-center text-[11px] text-slate-400">
        Your data is securely stored. Tax + bank details are encrypted; only OWNER admins can view them.
      </p>
    </div>
  );
}

function ChecklistItem({ icon: Icon, children }: { icon: typeof Shield; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
      <span className="text-slate-700">{children}</span>
    </li>
  );
}

function PersonalStep({
  token,
  guard,
  initial,
  onDone,
  onBack,
}: {
  token: string;
  guard: StartResponse["guard"];
  initial: StartResponse["data"];
  onDone: () => void;
  onBack: () => void;
}) {
  const [legalName, setLegalName] = React.useState(initial?.legalName ?? `${guard.firstName} ${guard.lastName}`);
  const [dob, setDob] = React.useState(initial?.dateOfBirth?.slice(0, 10) ?? "");
  const [address, setAddress] = React.useState(initial?.residentialAddress ?? "");
  const [email, setEmail] = React.useState(initial?.email ?? guard.email ?? "");
  const [ecName, setEcName] = React.useState(initial?.emergencyContactName ?? "");
  const [ecPhone, setEcPhone] = React.useState(initial?.emergencyContactPhone ?? "");
  const [busy, setBusy] = React.useState(false);

  const ready =
    legalName.trim().length >= 2 &&
    /^\d{4}-\d{2}-\d{2}$/.test(dob) &&
    address.trim().length >= 10 &&
    /\S+@\S+\.\S+/.test(email) &&
    ecName.trim().length >= 2 &&
    ecPhone.trim().length >= 8;

  async function next() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/onboarding/${token}/step/2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName,
          dateOfBirth: dob,
          residentialAddress: address,
          email,
          emergencyContactName: ecName,
          emergencyContactPhone: ecPhone,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "save failed");
      onDone();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Personal details" description="So we can identify you and reach you in an emergency.">
      <Field label="Legal name" icon={User}>
        <input className={inputCls} value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="As shown on your ID" />
      </Field>
      <Field label="Date of birth">
        <input type="date" className={inputCls} value={dob} onChange={(e) => setDob(e.target.value)} />
      </Field>
      <Field label="Residential address" icon={MapPin}>
        <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Suburb VIC 3000" />
      </Field>
      <Field label="Mobile" icon={Phone}>
        <input className={cn(inputCls, "bg-slate-50 text-slate-500")} value={guard.phone} readOnly />
      </Field>
      <Field label="Email" icon={Mail}>
        <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </Field>
      <div className="border-t border-slate-200 pt-3">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-2">Emergency contact</p>
        <Field label="Name">
          <input className={inputCls} value={ecName} onChange={(e) => setEcName(e.target.value)} />
        </Field>
        <Field label="Phone">
          <input type="tel" className={inputCls} value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} placeholder="+61412345678" />
        </Field>
      </div>
      <Nav onBack={onBack} onNext={next} disabled={!ready} busy={busy} />
    </Card>
  );
}

function WorkingRightsStep({
  token,
  initial,
  onDone,
  onBack,
}: {
  token: string;
  initial: StartResponse["data"];
  onDone: () => void;
  onBack: () => void;
}) {
  const [status, setStatus] = React.useState<string>(initial?.workingRightsStatus ?? "");
  const [subclass, setSubclass] = React.useState(initial?.visaSubclass ?? "");
  const [expiry, setExpiry] = React.useState(initial?.visaExpiry?.slice(0, 10) ?? "");
  const [hoursPerFortnight, setHours] = React.useState(initial?.visaHoursPerFortnight?.toString() ?? "");
  const [busy, setBusy] = React.useState(false);

  const isVisa = status === "WORKING_VISA";
  const ready =
    status === "CITIZEN" ||
    status === "PERMANENT_RESIDENT" ||
    (isVisa && subclass.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(expiry));

  async function next() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { workingRightsStatus: status };
      if (isVisa) {
        body.visaSubclass = subclass;
        body.visaExpiry = expiry;
        if (hoursPerFortnight) body.visaHoursPerFortnight = Number.parseInt(hoursPerFortnight, 10);
      }
      const res = await fetch(`/api/onboarding/${token}/step/3`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "save failed");
      onDone();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Working rights" description="We need to confirm you can legally work in Australia.">
      <div className="space-y-2">
        {[
          { v: "CITIZEN", label: "Australian citizen" },
          { v: "PERMANENT_RESIDENT", label: "Australian permanent resident" },
          { v: "WORKING_VISA", label: "Working visa" },
        ].map((opt) => (
          <label
            key={opt.v}
            className={cn(
              "flex items-center gap-2 rounded-xl border p-3 cursor-pointer",
              status === opt.v ? "border-brand-navy bg-blue-50" : "border-slate-200",
            )}
          >
            <input type="radio" name="rights" value={opt.v} checked={status === opt.v} onChange={() => setStatus(opt.v)} />
            <span className="text-sm font-medium text-slate-800">{opt.label}</span>
          </label>
        ))}
      </div>
      {isVisa && (
        <div className="space-y-2 rounded-xl bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs font-medium text-amber-900">Visa details required</p>
          <Field label="Visa subclass (e.g. 482, 500)">
            <input className={inputCls} value={subclass} onChange={(e) => setSubclass(e.target.value)} />
          </Field>
          <Field label="Visa expiry date">
            <input type="date" className={inputCls} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
          <Field label="Working hours cap per fortnight (optional)">
            <input type="number" min={0} max={168} className={inputCls} value={hoursPerFortnight} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 48" />
          </Field>
        </div>
      )}
      <Nav onBack={onBack} onNext={next} disabled={!ready} busy={busy} />
    </Card>
  );
}

function TaxBankStep({
  token,
  initial,
  onDone,
  onBack,
}: {
  token: string;
  initial: StartResponse["data"];
  onDone: () => void;
  onBack: () => void;
}) {
  const [tfn, setTfn] = React.useState("");
  const [threshold, setThreshold] = React.useState<boolean>(initial?.taxFreeThreshold ?? true);
  const [bankName, setBankName] = React.useState(initial?.bankAccountName ?? "");
  const [bsb, setBsb] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const ready =
    /^\d{8,9}$/.test(tfn.replace(/\s/g, "")) &&
    bankName.trim().length >= 2 &&
    /^\d{3}-?\d{3}$/.test(bsb.replace(/\s/g, "")) &&
    /^\d{6,10}$/.test(accountNumber.replace(/\s/g, ""));

  async function next() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/onboarding/${token}/step/4`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tfn: tfn.replace(/\s/g, ""),
          taxFreeThreshold: threshold,
          bankAccountName: bankName,
          bankBsb: bsb.replace(/\s/g, ""),
          bankAccountNumber: accountNumber.replace(/\s/g, ""),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "save failed");
      onDone();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Tax + bank details" description="Required for payroll.">
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900">
        <strong className="font-semibold">Secure storage.</strong> Your TFN, BSB and account number are encrypted at rest. Only the company OWNER can view them, and every view is audit-logged.
      </div>
      <Field label="Tax File Number">
        <input type="text" inputMode="numeric" className={inputCls} value={tfn} onChange={(e) => setTfn(e.target.value)} placeholder="9 digits" />
      </Field>
      <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3">
        <input type="checkbox" checked={threshold} onChange={(e) => setThreshold(e.target.checked)} className="mt-1" />
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-800">Claim the tax-free threshold</p>
          <p className="text-xs text-slate-500 mt-0.5">Tick yes only if this is your primary job — most people answer yes.</p>
        </div>
      </label>
      <div className="border-t border-slate-200 pt-3">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-2">Bank account</p>
        <Field label="Account name">
          <input className={inputCls} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="As shown on your statements" />
        </Field>
        <Field label="BSB">
          <input type="text" inputMode="numeric" className={inputCls} value={bsb} onChange={(e) => setBsb(e.target.value)} placeholder="123-456" />
        </Field>
        <Field label="Account number">
          <input type="text" inputMode="numeric" className={inputCls} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="6-10 digits" />
        </Field>
      </div>
      <Nav onBack={onBack} onNext={next} disabled={!ready} busy={busy} />
    </Card>
  );
}

/**
 * Resize + recompress the picked image client-side before uploading.
 * Phones take ~12MP photos (3-5MB JPEGs); we cap the longest edge at
 * 1600px and re-encode at q=0.85 which lands at ~300-600KB — well
 * under the serverless body limit and faster on slow connections.
 */
async function compressImage(file: File, maxEdge = 1600, quality = 0.85): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode image"));
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas encode failed"))),
      "image/jpeg",
      quality,
    ),
  );
}

function LicenceStep({
  token,
  initial,
  onDone,
  onBack,
}: {
  token: string;
  initial: StartResponse["data"];
  onDone: () => void;
  onBack: () => void;
}) {
  const [number, setNumber] = React.useState(initial?.licenceNumber ?? "");
  const [cls, setCls] = React.useState<string>(initial?.licenceClass ?? "");
  const [expiry, setExpiry] = React.useState(initial?.licenceExpiry?.slice(0, 10) ?? "");
  const [frontUrl, setFrontUrl] = React.useState<string | null>(initial?.licenceFrontPhotoUrl ?? null);
  const [backUrl, setBackUrl] = React.useState<string | null>(initial?.licenceBackPhotoUrl ?? null);
  const [uploading, setUploading] = React.useState<"front" | "back" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const frontInputRef = React.useRef<HTMLInputElement>(null);
  const backInputRef = React.useRef<HTMLInputElement>(null);

  const ready =
    number.trim().length >= 4 &&
    (cls === "A" || cls === "B" || cls === "BOTH") &&
    /^\d{4}-\d{2}-\d{2}$/.test(expiry);

  async function handleUpload(which: "front" | "back", file: File) {
    if (uploading) return;
    setUploading(which);
    try {
      const compressed = await compressImage(file);
      const form = new FormData();
      form.append("which", which);
      form.append("file", compressed, `licence-${which}.jpg`);
      const res = await fetch(`/api/onboarding/${token}/licence-upload`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      if (which === "front") setFrontUrl(json.url);
      else setBackUrl(json.url);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function next() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/onboarding/${token}/step/5`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenceNumber: number,
          licenceClass: cls,
          licenceExpiry: expiry,
          licenceFrontPhotoUrl: frontUrl,
          licenceBackPhotoUrl: backUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "save failed");
      onDone();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Security licence" description="The licence you use to work as a security officer.">
      <Field label="Licence number">
        <input className={inputCls} value={number} onChange={(e) => setNumber(e.target.value)} />
      </Field>
      <Field label="Licence class">
        <div className="flex gap-2">
          {[
            { v: "A", label: "Class A" },
            { v: "B", label: "Class B" },
            { v: "BOTH", label: "Both" },
          ].map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setCls(opt.v)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm font-medium",
                cls === opt.v ? "bg-brand-navy text-white border-brand-navy" : "bg-white text-slate-700 border-slate-300",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Expiry date">
        <input type="date" className={inputCls} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {[
          { side: "front" as const, label: "Front", url: frontUrl, ref: frontInputRef },
          { side: "back" as const, label: "Back", url: backUrl, ref: backInputRef },
        ].map(({ side, label, url, ref }) => (
          <div
            key={side}
            className={cn(
              "rounded-xl border-2 border-dashed p-3 text-center",
              url ? "border-emerald-400 bg-emerald-50" : "border-slate-300",
            )}
          >
            <input
              ref={ref}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(side, f);
                e.target.value = "";
              }}
            />
            {url ? (
              // Preview the uploaded photo. Tapping it re-opens the file
              // picker so the guard can replace a blurry shot.
              <button
                type="button"
                onClick={() => ref.current?.click()}
                disabled={uploading === side}
                className="block w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`${label} of licence`} className="rounded-lg mx-auto max-h-32 object-contain" />
                <p className="text-[10px] font-medium text-emerald-700 mt-1">
                  {uploading === side ? "Uploading…" : "Tap to retake"}
                </p>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => ref.current?.click()}
                disabled={uploading === side}
                className="block w-full py-2"
              >
                <Camera className="h-6 w-6 mx-auto text-slate-400 mb-1" />
                <p className="text-xs font-medium text-slate-600">{label} of licence</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {uploading === side ? "Uploading…" : "Tap to take photo (optional)"}
                </p>
              </button>
            )}
          </div>
        ))}
      </div>
      <Nav onBack={onBack} onNext={next} disabled={!ready} busy={busy} />
    </Card>
  );
}

function SopStep({ token, sop, onDone, onBack }: { token: string; sop: NonNullable<StartResponse["sop"]>; onDone: () => void; onBack: () => void }) {
  const [acked, setAcked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function next() {
    if (!acked || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/onboarding/${token}/step/6`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sopAcknowledged: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "save failed");
      onDone();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={sop.title} description={`Standard Operating Procedure v${sop.version}. Read it through, then tick the box.`}>
      <div className="max-h-[40vh] overflow-y-auto rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm whitespace-pre-wrap font-sans leading-relaxed">
        {sop.body}
      </div>
      <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 cursor-pointer">
        <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} className="mt-1" />
        <span className="text-sm text-slate-800">I have read and understood the SOP and will comply with it.</span>
      </label>
      <Nav onBack={onBack} onNext={next} disabled={!acked} busy={busy} />
    </Card>
  );
}

function ContractStep({
  token,
  contract,
  guard,
  initial,
  onSubmit,
  onBack,
}: {
  token: string;
  contract: NonNullable<StartResponse["contract"]>;
  guard: StartResponse["guard"];
  initial: StartResponse["data"];
  onSubmit: () => void;
  onBack: () => void;
}) {
  const expected = (initial?.legalName ?? `${guard.firstName} ${guard.lastName}`).trim().toLowerCase();
  const [signature, setSignature] = React.useState(initial?.contractSignatureName ?? "");
  const [acked, setAcked] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const matches = signature.trim().toLowerCase() === expected;
  const ready = matches && acked;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      // Save the contract step first, then call /submit
      const stepRes = await fetch(`/api/onboarding/${token}/step/7`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractSignatureName: signature.trim(),
          contractAcknowledged: true,
        }),
      });
      if (!stepRes.ok) {
        const j = await stepRes.json();
        throw new Error(j.error ?? "save failed");
      }
      // Final submit
      onSubmit();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "submission failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Employment contract" description="Casual employment. Sign to confirm you agree.">
      <div className="rounded-xl border border-slate-200 p-4 bg-white text-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">Parties</p>
        <p><strong>Employer:</strong> The company</p>
        <p><strong>Employee:</strong> {initial?.legalName ?? `${guard.firstName} ${guard.lastName}`}</p>
        <p className="mt-3 text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">Key terms</p>
        <ul className="space-y-1 text-slate-700">
          <li>• Casual employment — no minimum hours guaranteed</li>
          <li>• Award rates apply</li>
          <li>• Valid security licence required at all times</li>
          <li>• Either party may terminate consistent with Fair Work Act</li>
        </ul>
        <button onClick={() => setPreviewOpen(true)} className="mt-3 text-sm text-brand-navy underline">
          Read full contract
        </button>
      </div>
      <Field label="Type your full legal name to sign">
        <input
          className={cn(inputCls, "font-[cursive] text-lg")}
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder={initial?.legalName ?? "Your full legal name"}
        />
        {signature && !matches && (
          <p className="text-xs text-amber-600 mt-1">Must match the legal name from step 2 exactly.</p>
        )}
      </Field>
      <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 cursor-pointer">
        <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} className="mt-1" />
        <span className="text-sm text-slate-800">I agree to the terms above and have read the full contract.</span>
      </label>
      <Nav onBack={onBack} onNext={submit} disabled={!ready} busy={busy} nextLabel="Submit onboarding" />

      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setPreviewOpen(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{contract.name}</h2>
              <button onClick={() => setPreviewOpen(false)} className="text-sm text-slate-500">Close</button>
            </div>
            <div className="overflow-y-auto p-4 text-xs whitespace-pre-wrap text-slate-700">{contract.templateContent}</div>
          </div>
        </div>
      )}
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Shared bits
// -----------------------------------------------------------------------------

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy/30 focus:border-brand-navy";

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon?: typeof Shield; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3 text-slate-400" />}
        {label}
      </label>
      {children}
    </div>
  );
}

function Nav({
  onBack,
  onNext,
  disabled,
  busy,
  nextLabel = "Continue",
}: {
  onBack?: () => void;
  onNext: () => void;
  disabled?: boolean;
  busy?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2 pt-1">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4 inline" />
        </button>
      )}
      <Primary onClick={onNext} disabled={disabled || busy}>
        {busy ? "Saving…" : (
          <>
            {nextLabel} <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Primary>
    </div>
  );
}

function Primary({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-navy text-white px-4 py-3 text-sm font-medium hover:bg-brand-navy/90 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
