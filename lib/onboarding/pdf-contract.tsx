import * as React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

/**
 * Signed contract PDF. Generated at submit time so the typed signature
 * + signed-at timestamp + IP/UA are locked into the document as an
 * immutable artefact. The guard receives a URL to this PDF via SMS as
 * their copy; the admin can re-download from the view panel.
 *
 * Template placeholders supported (case-insensitive, surrounded by
 * curly braces). Any placeholder not in this list is left as-is.
 *
 *   {COMPANY_NAME}        - issuing company
 *   {GUARD_NAME}          - guard's legal name from onboarding
 *   {GUARD_DOB}           - DOB, ISO date
 *   {GUARD_ADDRESS}       - residential address
 *   {GUARD_EMAIL}         - email
 *   {GUARD_PHONE}         - mobile
 *   {LICENCE_NUMBER}      - security licence #
 *   {LICENCE_CLASS}       - A | B | BOTH
 *   {LICENCE_EXPIRY}      - ISO date
 *   {CONTRACT_DATE}       - the signed-at date as e.g. "9 June 2026"
 *   {EMPLOYEE_SIGNATURE}  - typed signature (printed in italic)
 */

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 10,
    lineHeight: 1.5,
    fontFamily: "Helvetica",
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
  },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24, borderBottomWidth: 1, borderBottomColor: "#0B1E3F", paddingBottom: 10 },
  brand: { fontSize: 16, fontWeight: "bold", color: "#0B1E3F" },
  brandSub: { fontSize: 8, color: "#64748B", marginTop: 2 },
  docMeta: { fontSize: 8, color: "#64748B", textAlign: "right" },
  title: { fontSize: 18, fontWeight: "bold", color: "#0B1E3F", marginBottom: 4, textAlign: "center", marginTop: 8 },
  subtitle: { fontSize: 9, color: "#64748B", marginBottom: 18, textAlign: "center" },
  body: { fontSize: 10, marginBottom: 8, textAlign: "justify" },
  signatureBlock: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#CBD5E1",
    paddingTop: 14,
  },
  signatureLabel: { fontSize: 8, color: "#475569", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  signatureValue: { fontSize: 14, fontFamily: "Helvetica-Oblique", color: "#0B1E3F" },
  signatureMeta: { fontSize: 8, color: "#64748B", marginTop: 4 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 7, color: "#94A3B8", textAlign: "center" },
});

export interface ContractPdfData {
  companyName: string;
  templateName: string;
  templateVersion: number;
  templateContent: string;
  legalName: string;
  dateOfBirth: Date | null;
  residentialAddress: string | null;
  email: string | null;
  phone: string | null;
  licenceNumber: string | null;
  licenceClass: string | null;
  licenceExpiry: Date | null;
  signatureName: string;
  signedAt: Date;
  signerIp: string | null;
  sessionId: string;
}

function isoDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function longDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

function applyPlaceholders(template: string, data: ContractPdfData): string {
  const map: Record<string, string> = {
    COMPANY_NAME: data.companyName,
    GUARD_NAME: data.legalName,
    GUARD_DOB: isoDate(data.dateOfBirth),
    GUARD_ADDRESS: data.residentialAddress ?? "",
    GUARD_EMAIL: data.email ?? "",
    GUARD_PHONE: data.phone ?? "",
    LICENCE_NUMBER: data.licenceNumber ?? "",
    LICENCE_CLASS: data.licenceClass ?? "",
    LICENCE_EXPIRY: isoDate(data.licenceExpiry),
    CONTRACT_DATE: longDate(data.signedAt),
    EMPLOYEE_SIGNATURE: data.signatureName,
  };
  return template.replace(/\{([A-Z_]+)\}/g, (full, key: string) => {
    return key in map ? map[key] : full;
  });
}

function ContractDocument({ data }: { data: ContractPdfData }) {
  const body = applyPlaceholders(data.templateContent, data);
  // Render template as paragraphs separated by blank lines so the layout
  // engine wraps text properly within each block.
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <Document title={`Contract - ${data.legalName}`} author={data.companyName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{data.companyName}</Text>
            <Text style={styles.brandSub}>Casual Employment Contract</Text>
          </View>
          <View>
            <Text style={styles.docMeta}>Document ID: {data.sessionId}</Text>
            <Text style={styles.docMeta}>Template: {data.templateName} v{data.templateVersion}</Text>
          </View>
        </View>

        <Text style={styles.title}>{data.templateName}</Text>
        <Text style={styles.subtitle}>Between {data.companyName} and {data.legalName}</Text>

        {paragraphs.map((p, i) => (
          <Text key={i} style={styles.body}>{p}</Text>
        ))}

        <View style={styles.signatureBlock}>
          <Text style={styles.signatureLabel}>Signed by employee</Text>
          <Text style={styles.signatureValue}>{data.signatureName}</Text>
          <Text style={styles.signatureMeta}>
            Date: {longDate(data.signedAt)}
            {data.signerIp ? `   ·   IP: ${data.signerIp}` : ""}
          </Text>
        </View>

        <Text style={styles.footer} fixed>
          Generated electronically by Vigilo onboarding. Typed signature in this document constitutes the
          employee&apos;s agreement to the terms above, captured with timestamp and IP address as proof of acceptance.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderContractPdf(data: ContractPdfData): Promise<Buffer> {
  return renderToBuffer(<ContractDocument data={data} />);
}
