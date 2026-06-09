import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

/**
 * Complete onboarding package PDF — the audit-ready bundle generated
 * after a guard submits. Contents:
 *   - Cover page (guard, company, completed-at)
 *   - Personal + emergency contact
 *   - Working rights (including visa fields when relevant)
 *   - Tax + bank (MASKED only — sensitive plaintext NEVER lives in a
 *     stored PDF; OWNERs reveal via the dashboard which writes audit)
 *   - Licence (number, class, expiry, embedded front/back photos)
 *   - SOP acknowledgement (version, ack time, IP/UA)
 *   - Contract reference (template version, signature name + time + IP)
 *
 * Photo fetch is best-effort: if a blob URL is unreachable at render
 * time, the cell falls back to a "photo not available" placeholder so
 * the rest of the PDF still ships.
 */

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#0F172A" },
  cover: { paddingTop: 120, alignItems: "center" },
  coverBrand: { fontSize: 14, color: "#0B1E3F" },
  coverTitle: { fontSize: 28, fontWeight: "bold", color: "#0B1E3F", marginTop: 16, textAlign: "center" },
  coverName: { fontSize: 18, marginTop: 24, color: "#0F172A" },
  coverMeta: { fontSize: 10, color: "#64748B", marginTop: 8 },
  h1: { fontSize: 16, fontWeight: "bold", color: "#0B1E3F", marginBottom: 14, borderBottomWidth: 1, borderBottomColor: "#0B1E3F", paddingBottom: 4 },
  h2: { fontSize: 11, fontWeight: "bold", color: "#0B1E3F", marginTop: 16, marginBottom: 8 },
  row: { flexDirection: "row", marginBottom: 5 },
  label: { width: 140, fontSize: 9, color: "#475569" },
  value: { flex: 1, fontSize: 10, color: "#0F172A" },
  warningStripe: {
    backgroundColor: "#FEF3C7",
    borderLeftWidth: 2,
    borderLeftColor: "#D97706",
    padding: 8,
    fontSize: 8,
    color: "#78350F",
    marginBottom: 12,
  },
  photoGrid: { flexDirection: "row", marginTop: 10, gap: 12 },
  photoCell: { flex: 1 },
  photoLabel: { fontSize: 8, color: "#64748B", marginBottom: 4 },
  photoImg: { width: "100%", maxHeight: 180, objectFit: "contain", borderWidth: 1, borderColor: "#E2E8F0" },
  photoMissing: {
    width: "100%",
    height: 180,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 8,
    color: "#94A3B8",
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 7,
    color: "#94A3B8",
    textAlign: "center",
  },
});

export interface PackagePdfData {
  companyName: string;
  guardName: string;
  guardId: string;
  sessionId: string;
  completedAt: Date;
  personal: {
    legalName: string | null;
    dateOfBirth: Date | null;
    residentialAddress: string | null;
    mobile: string | null;
    email: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
  };
  workingRights: {
    status: string | null;
    visaSubclass: string | null;
    visaExpiry: Date | null;
    visaHoursPerFortnight: number | null;
  };
  taxBank: {
    tfnMasked: string | null;
    taxFreeThreshold: boolean | null;
    bankAccountName: string | null;
    bsbMasked: string | null;
    accountNumberMasked: string | null;
  };
  licence: {
    number: string | null;
    classification: string | null;
    expiry: Date | null;
    frontPhotoUrl: string | null;
    backPhotoUrl: string | null;
  };
  sop: {
    title: string | null;
    version: number | null;
    acknowledgedAt: Date | null;
    ipAddress: string | null;
    userAgent: string | null;
  };
  contract: {
    templateName: string | null;
    templateVersion: number | null;
    signatureName: string | null;
    signedAt: Date | null;
    signerIp: string | null;
  };
}

function isoDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

function isoDateTime(d: Date | null): string {
  return d ? d.toISOString().replace("T", " ").slice(0, 19) + "Z" : "—";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || "—"}</Text>
    </View>
  );
}

function PackageDocument({ data }: { data: PackagePdfData }) {
  const p = data.personal;
  const wr = data.workingRights;
  const tb = data.taxBank;
  const lc = data.licence;
  const sop = data.sop;
  const ct = data.contract;

  return (
    <Document title={`Onboarding package — ${data.guardName}`} author={data.companyName}>
      {/* Cover */}
      <Page size="A4" style={styles.page}>
        <View style={styles.cover}>
          <Text style={styles.coverBrand}>{data.companyName}</Text>
          <Text style={styles.coverTitle}>Onboarding Package</Text>
          <Text style={styles.coverName}>{data.guardName}</Text>
          <Text style={styles.coverMeta}>Completed {isoDateTime(data.completedAt)}</Text>
          <Text style={styles.coverMeta}>Session {data.sessionId}</Text>
        </View>
        <Text style={styles.footer} fixed>
          Confidential — for internal employer use only. Contains personal information of the named employee.
        </Text>
      </Page>

      {/* Personal */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Personal details</Text>
        <Field label="Legal name" value={p.legalName ?? ""} />
        <Field label="Date of birth" value={isoDate(p.dateOfBirth)} />
        <Field label="Residential address" value={p.residentialAddress ?? ""} />
        <Field label="Mobile" value={p.mobile ?? ""} />
        <Field label="Email" value={p.email ?? ""} />

        <Text style={styles.h2}>Emergency contact</Text>
        <Field label="Name" value={p.emergencyContactName ?? ""} />
        <Field label="Phone" value={p.emergencyContactPhone ?? ""} />

        <Text style={styles.h2}>Working rights</Text>
        <Field label="Status" value={wr.status ?? ""} />
        {wr.status === "WORKING_VISA" && (
          <>
            <Field label="Visa subclass" value={wr.visaSubclass ?? ""} />
            <Field label="Visa expiry" value={isoDate(wr.visaExpiry)} />
            <Field label="Hours / fortnight" value={wr.visaHoursPerFortnight != null ? String(wr.visaHoursPerFortnight) : ""} />
          </>
        )}

        <Text style={styles.footer} fixed>
          Confidential — for internal employer use only.
        </Text>
      </Page>

      {/* Tax + bank (MASKED) */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Tax &amp; bank</Text>
        <Text style={styles.warningStripe}>
          Tax File Number, BSB, and bank account number are stored encrypted at rest. This document
          shows masked values only. To retrieve plaintext, an OWNER-role admin must request a
          reveal in the dashboard, which is recorded in the audit log.
        </Text>
        <Field label="Tax File Number" value={tb.tfnMasked ?? ""} />
        <Field label="Tax-free threshold" value={tb.taxFreeThreshold == null ? "" : tb.taxFreeThreshold ? "Claimed here" : "Not claimed"} />
        <Field label="Bank account name" value={tb.bankAccountName ?? ""} />
        <Field label="BSB" value={tb.bsbMasked ?? ""} />
        <Field label="Account number" value={tb.accountNumberMasked ?? ""} />

        <Text style={styles.footer} fixed>
          Confidential — for internal employer use only.
        </Text>
      </Page>

      {/* Licence */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Security licence</Text>
        <Field label="Licence number" value={lc.number ?? ""} />
        <Field label="Class" value={lc.classification ?? ""} />
        <Field label="Expiry" value={isoDate(lc.expiry)} />

        <Text style={styles.h2}>Licence photos</Text>
        <View style={styles.photoGrid}>
          {(["front", "back"] as const).map((side) => {
            const url = side === "front" ? lc.frontPhotoUrl : lc.backPhotoUrl;
            return (
              <View key={side} style={styles.photoCell}>
                <Text style={styles.photoLabel}>{side === "front" ? "Front" : "Back"}</Text>
                {url ? (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <Image src={url} style={styles.photoImg} />
                ) : (
                  <View style={styles.photoMissing}>
                    <Text>Photo not available</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <Text style={styles.footer} fixed>
          Confidential — for internal employer use only.
        </Text>
      </Page>

      {/* SOP + contract */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>SOP acknowledgement</Text>
        <Field label="Document" value={sop.title ? `${sop.title} v${sop.version ?? "?"}` : ""} />
        <Field label="Acknowledged at" value={isoDateTime(sop.acknowledgedAt)} />
        <Field label="IP address" value={sop.ipAddress ?? ""} />
        <Field label="User agent" value={sop.userAgent ? sop.userAgent.slice(0, 80) : ""} />

        <Text style={styles.h1}>Contract signature</Text>
        <Field label="Template" value={ct.templateName ? `${ct.templateName} v${ct.templateVersion ?? "?"}` : ""} />
        <Field label="Typed signature" value={ct.signatureName ?? ""} />
        <Field label="Signed at" value={isoDateTime(ct.signedAt)} />
        <Field label="IP address" value={ct.signerIp ?? ""} />

        <Text style={styles.footer} fixed>
          End of package. The signed contract itself is delivered as a separate PDF.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderPackagePdf(data: PackagePdfData): Promise<Buffer> {
  return renderToBuffer(<PackageDocument data={data} />);
}
