import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { api, isTauri } from "../../services/commands";
import type {
  DashboardResponse,
  ReviewRecord,
  TradeDetail,
  TradeSummary,
} from "../../types/domain";
import { formatMoneyMinor, formatR, percent } from "../../lib/utils";

async function allTrades() {
  const first = await api.listTrades({ page: 1, pageSize: 250 });
  const pages = await Promise.all(
    Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) =>
      api.listTrades({ page: index + 2, pageSize: 250 }),
    ),
  );
  return [first, ...pages].flatMap((page) => page.items);
}

async function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime: string,
) {
  if (isTauri()) {
    const extension = filename.split(".").pop() ?? "bin";
    const target = await save({
      defaultPath: filename,
      filters: [
        {
          name: extension.toUpperCase(),
          extensions: [extension],
        },
      ],
    });
    if (!target) return false;
    await writeFile(target, bytes);
    return true;
  }
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
  return true;
}

export async function exportTradesExcel() {
  const XLSX = await import("xlsx");
  const trades = await allTrades();
  const rows = trades.map((trade) => ({
    Instrument: trade.instrument,
    Assetklasse: trade.assetClass,
    Richtung: trade.direction,
    Status: trade.status,
    Konto: trade.accountName ?? "",
    Setup: trade.setupName ?? "",
    Session: trade.session ?? "",
    Timeframe: trade.timeframe ?? "",
    Eröffnet: trade.openedAt ?? "",
    Geschlossen: trade.closedAt ?? "",
    Entry: trade.actualEntry ?? "",
    Exit: trade.actualExit ?? "",
    Größe: trade.quantity ?? "",
    "Netto-P&L": trade.netPnlMinor == null ? "" : trade.netPnlMinor / 100,
    "R-Multiple": trade.calculatedR ?? "",
    Prozess: trade.processScore ?? "",
    Review: trade.reviewedAt ? "Ja" : "Nein",
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = Object.keys(rows[0] ?? { Instrument: "" }).map((key) => ({
    wch: Math.max(12, key.length + 3),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Trades");
  const bytes = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;
  const saved = await downloadBytes(
    new Uint8Array(bytes),
    `personal-macro-trades-${new Date().toISOString().slice(0, 10)}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  return { saved, count: trades.length };
}

const styles = StyleSheet.create({
  page: { padding: 34, color: "#162033", fontFamily: "Helvetica", fontSize: 9 },
  title: { fontSize: 23, fontWeight: 700, marginBottom: 5 },
  subtitle: { color: "#65748b", marginBottom: 22 },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 22 },
  kpi: {
    width: "31.5%",
    padding: 10,
    border: "1 solid #dce4ef",
    borderRadius: 5,
  },
  label: {
    color: "#65748b",
    fontSize: 7,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  value: { fontSize: 15, fontWeight: 700 },
  heading: { fontSize: 12, fontWeight: 700, marginTop: 12, marginBottom: 8 },
  row: {
    flexDirection: "row",
    borderBottom: "1 solid #e9eef5",
    paddingVertical: 5,
  },
  cell: { width: "16.66%" },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 34,
    right: 34,
    color: "#8b98aa",
    fontSize: 7,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function PerformanceDocument({
  dashboard,
  trades,
}: {
  dashboard: DashboardResponse;
  trades: TradeSummary[];
}) {
  const metrics = dashboard.metrics;
  const kpis = [
    ["Netto-P&L", formatMoneyMinor(metrics.netPnlMinor)],
    [
      "Profit Factor",
      metrics.profitFactor.formattedSpecial ??
        String(metrics.profitFactor.value?.toFixed(2) ?? "—"),
    ],
    [
      "Win Rate",
      metrics.winRate.value == null
        ? "—"
        : percent.format(metrics.winRate.value),
    ],
    ["Ø R", formatR(metrics.averageR.value)],
    ["Max. Drawdown", formatMoneyMinor(-metrics.maxDrawdownMinor)],
    [
      "Prozess",
      metrics.averageProcessScore.value == null
        ? "—"
        : `${metrics.averageProcessScore.value.toFixed(1)} / 10`,
    ],
  ];
  return (
    <Document
      title="Personal Macro Performance-Bericht"
      author="Personal Macro"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Performance-Bericht</Text>
        <Text style={styles.subtitle}>
          Personal Macro · erzeugt am {new Date().toLocaleString("de-DE")}
        </Text>
        <View style={styles.kpis}>
          {kpis.map(([label, value]) => (
            <View key={label} style={styles.kpi}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.heading}>Letzte Trades</Text>
        <View style={styles.row}>
          <Text style={styles.cell}>Instrument</Text>
          <Text style={styles.cell}>Richtung</Text>
          <Text style={styles.cell}>Setup</Text>
          <Text style={styles.cell}>Datum</Text>
          <Text style={styles.cell}>R</Text>
          <Text style={styles.cell}>P&L</Text>
        </View>
        {trades.slice(0, 35).map((trade) => (
          <View key={trade.id} style={styles.row}>
            <Text style={styles.cell}>{trade.instrument}</Text>
            <Text style={styles.cell}>{trade.direction.toUpperCase()}</Text>
            <Text style={styles.cell}>{trade.setupName ?? "—"}</Text>
            <Text style={styles.cell}>
              {(trade.closedAt ?? trade.openedAt ?? "").slice(0, 10)}
            </Text>
            <Text style={styles.cell}>{formatR(trade.calculatedR)}</Text>
            <Text style={styles.cell}>
              {formatMoneyMinor(trade.netPnlMinor)}
            </Text>
          </View>
        ))}
        <View style={styles.footer} fixed>
          <Text>Local-first · Berechnung {metrics.calculationVersion}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Seite ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export async function exportPerformancePdf() {
  const [dashboard, trades] = await Promise.all([
    api.dashboard({}),
    allTrades(),
  ]);
  const blob = await pdf(
    <PerformanceDocument dashboard={dashboard} trades={trades} />,
  ).toBlob();
  const saved = await downloadBytes(
    new Uint8Array(await blob.arrayBuffer()),
    `personal-macro-report-${new Date().toISOString().slice(0, 10)}.pdf`,
    "application/pdf",
  );
  return { saved, count: trades.length };
}

function TradeDocument({ trade }: { trade: TradeDetail }) {
  return (
    <Document title={`${trade.instrument} Trade-Bericht`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          {trade.instrument} · {trade.direction.toUpperCase()}
        </Text>
        <Text style={styles.subtitle}>
          {trade.openedAt?.slice(0, 16) ?? "Ohne Einstiegszeit"} ·{" "}
          {trade.status}
        </Text>
        <View style={styles.kpis}>
          <View style={styles.kpi}>
            <Text style={styles.label}>Netto-P&L</Text>
            <Text style={styles.value}>
              {formatMoneyMinor(trade.netPnlMinor)}
            </Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.label}>R-Multiple</Text>
            <Text style={styles.value}>{formatR(trade.calculatedR)}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.label}>Prozess</Text>
            <Text style={styles.value}>
              {trade.processScore ? `${trade.processScore} / 10` : "—"}
            </Text>
          </View>
        </View>
        <Text style={styles.heading}>These</Text>
        <Text>{trade.thesisHtml ?? "—"}</Text>
        <Text style={styles.heading}>Ausführung</Text>
        <Text>{trade.executionNotesHtml ?? "—"}</Text>
        <Text style={styles.heading}>Review</Text>
        <Text>{trade.reviewNotesHtml ?? "—"}</Text>
        <Text style={styles.heading}>Erkenntnisse</Text>
        <Text>{trade.lessonsHtml ?? "—"}</Text>
      </Page>
    </Document>
  );
}

export async function exportSingleTradePdf(trade: TradeDetail) {
  const blob = await pdf(<TradeDocument trade={trade} />).toBlob();
  return downloadBytes(
    new Uint8Array(await blob.arrayBuffer()),
    `${trade.instrument}-${(trade.closedAt ?? trade.createdAt).slice(0, 10)}.pdf`,
    "application/pdf",
  );
}

function ReviewDocument({ review }: { review: ReviewRecord }) {
  const snapshot = (() => {
    try {
      return JSON.parse(review.metricSnapshotJson) as {
        netPnlMinor?: number;
        totalR?: { value?: number };
      };
    } catch {
      return {};
    }
  })();
  const sections = [
    ["Was lief gut?", review.winsHtml],
    ["Herausforderungen", review.challengesHtml],
    ["Erkenntnisse", review.lessonsHtml],
    ["Nächste Aktionen", review.actionsHtml],
  ] as const;
  return (
    <Document title={`${review.reviewType} Review`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          {review.reviewType === "daily"
            ? "Tagesreview"
            : review.reviewType === "weekly"
              ? "Wochenreview"
              : "Monatsreview"}
        </Text>
        <Text style={styles.subtitle}>
          {review.periodStart} bis {review.periodEnd} ·{" "}
          {review.status === "completed" ? "Abgeschlossen" : "Entwurf"}
        </Text>
        <View style={styles.kpis}>
          <View style={styles.kpi}>
            <Text style={styles.label}>Netto-P&L</Text>
            <Text style={styles.value}>
              {formatMoneyMinor(snapshot.netPnlMinor)}
            </Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.label}>Total R</Text>
            <Text style={styles.value}>{formatR(snapshot.totalR?.value)}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.label}>Prozess</Text>
            <Text style={styles.value}>
              {review.processRating ? `${review.processRating} / 10` : "—"}
            </Text>
          </View>
        </View>
        {sections.map(([title, content]) => (
          <View key={title}>
            <Text style={styles.heading}>{title}</Text>
            <Text>{content || "—"}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function exportReviewPdf(review: ReviewRecord) {
  const blob = await pdf(<ReviewDocument review={review} />).toBlob();
  return downloadBytes(
    new Uint8Array(await blob.arrayBuffer()),
    `${review.reviewType}-review-${review.periodStart}.pdf`,
    "application/pdf",
  );
}
