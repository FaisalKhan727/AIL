import * as React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

/**
 * Server-side PDF document for an alarm invoice. Rendered on demand by
 * the /api/invoices/[id]/pdf endpoint and streamed back to the admin.
 *
 * Styling kept conservative — single-page A4, professional but minimal,
 * uses no custom fonts (default Helvetica is fine).
 */

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  brand: { fontSize: 18, fontWeight: "bold", color: "#0B1E3F" },
  brandSub: { fontSize: 8, color: "#64748B", marginTop: 2 },
  invoiceTitleBlock: { textAlign: "right" },
  invoiceTitle: { fontSize: 16, fontWeight: "bold", color: "#0B1E3F" },
  invoiceMeta: { fontSize: 9, color: "#64748B", marginTop: 2 },
  sectionLabel: { fontSize: 8, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  billToBlock: { marginBottom: 16 },
  billToName: { fontSize: 12, fontWeight: "bold" },
  periodBlock: { marginBottom: 20 },
  table: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 2 },
  th: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    fontSize: 8,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tr: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F1F5F9",
  },
  trLast: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  colDocket: { width: 60 },
  colDate: { width: 100 },
  colSite: { flex: 1 },
  colType: { width: 70 },
  colMin: { width: 60, textAlign: "right" },
  colAmount: { width: 70, textAlign: "right" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 14,
  },
  totalsBox: { width: 260 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalLabel: { fontSize: 9, color: "#475569" },
  totalValue: { fontSize: 9 },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#0B1E3F",
  },
  grandTotalLabel: { fontSize: 11, fontWeight: "bold", color: "#0B1E3F" },
  grandTotalValue: { fontSize: 11, fontWeight: "bold", color: "#0B1E3F" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#94A3B8",
    textAlign: "center",
  },
});

export interface InvoiceLine {
  docket: string;
  receivedAt: Date;
  siteName: string;
  alarmType: string;
  timeOnSiteMin: number | null;
  amount: number;
}

export interface InvoicePdfData {
  companyName: string;
  invoiceId: string;
  source: string;
  periodYear: number;
  periodMonth: number; // 1-12
  generatedAt: Date;
  ratePerAlarm: number;
  alarmCount: number;
  totalAmount: number;
  lines: InvoiceLine[];
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(d: Date): string {
  return `${fmtDate(d)} ${d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

function monthName(month: number, year: number): string {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>{data.companyName}</Text>
            <Text style={styles.brandSub}>Alarm Response Services</Text>
          </View>
          <View style={styles.invoiceTitleBlock}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceMeta}>{data.invoiceId.slice(0, 12).toUpperCase()}</Text>
            <Text style={styles.invoiceMeta}>Generated {fmtDate(data.generatedAt)}</Text>
          </View>
        </View>

        <View style={styles.billToBlock}>
          <Text style={styles.sectionLabel}>Bill to</Text>
          <Text style={styles.billToName}>{data.source}</Text>
        </View>

        <View style={styles.periodBlock}>
          <Text style={styles.sectionLabel}>Period</Text>
          <Text>{monthName(data.periodMonth, data.periodYear)}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={styles.colDocket}>Docket</Text>
            <Text style={styles.colDate}>Received</Text>
            <Text style={styles.colSite}>Site</Text>
            <Text style={styles.colType}>Type</Text>
            <Text style={styles.colMin}>On site</Text>
            <Text style={styles.colAmount}>Amount</Text>
          </View>
          {data.lines.map((l, i) => (
            <View key={l.docket} style={i === data.lines.length - 1 ? styles.trLast : styles.tr}>
              <Text style={styles.colDocket}>#{l.docket}</Text>
              <Text style={styles.colDate}>{fmtDateTime(l.receivedAt)}</Text>
              <Text style={styles.colSite}>{l.siteName}</Text>
              <Text style={styles.colType}>{l.alarmType}</Text>
              <Text style={styles.colMin}>{l.timeOnSiteMin !== null ? `${l.timeOnSiteMin} min` : "—"}</Text>
              <Text style={styles.colAmount}>{fmtMoney(l.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsRow}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Alarms in period</Text>
              <Text style={styles.totalValue}>{data.alarmCount}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Rate per alarm</Text>
              <Text style={styles.totalValue}>{fmtMoney(data.ratePerAlarm)}</Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>{fmtMoney(data.totalAmount)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          Generated automatically by Vigilo · {data.companyName} · {fmtDate(data.generatedAt)}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument data={data} />);
}
