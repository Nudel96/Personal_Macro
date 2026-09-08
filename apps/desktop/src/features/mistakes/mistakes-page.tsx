import { Target as PageIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { EChartsOption } from "echarts";
import {
  BaseChart,
  axisLabel,
  axisLine,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { JournalPageHeader } from "../../components/ui/journal-page-header";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { formatMoneyMinor, number } from "../../lib/utils";
import { api } from "../../services/commands";
import type { MistakeAnalytics } from "../../types/domain";
import { JournalAccountGate } from "../accounts/journal-account-gate";
import { useJournalAccount } from "../accounts/journal-account-context";

export function MistakesPage() {
  const { selectedAccountId, status } = useJournalAccount();
  const ready = status === "ready" && selectedAccountId !== null;
  const query = useQuery({
    queryKey: ["mistakes", selectedAccountId],
    queryFn: () => api.mistakeAnalytics(selectedAccountId!),
    enabled: ready,
  });
  const header = (
    <JournalPageHeader
      icon={PageIcon}
      eyebrow="Prozess"
      title="Fehleranalyse"
      description="Häufigkeit, geschätzte Kosten und Gegenmaßnahmen deiner wiederkehrenden Fehler."
    />
  );
  if (!ready)
    return (
      <div className="page mistakes-page">
        {header}
        <JournalAccountGate>
          <div />
        </JournalAccountGate>
      </div>
    );
  if (query.isLoading)
    return (
      <div className="page mistakes-page">
        {header}
        <PageLoading />
      </div>
    );
  if (query.isError || !query.data)
    return (
      <div className="page mistakes-page">
        {header}
        <ErrorState message="Fehleranalyse konnte nicht geladen werden." />
      </div>
    );
  const rows = query.data;
  const total = rows.reduce((sum, row) => sum + row.occurrences, 0);
  const cost = rows.reduce((sum, row) => sum + row.estimatedCostMinor, 0);
  const active = rows.filter((row) => row.occurrences > 0);
  return (
    <div className="page mistakes-page">
      {header}
      <div className="grid summary-grid" style={{ marginBottom: 16 }}>
        <MistakeKpi label="Fehlerereignisse" value={String(total)} />
        <MistakeKpi
          label="Geschätzte Kosten"
          value={formatMoneyMinor(cost)}
          tone="negative"
        />
        <MistakeKpi label="Aktive Fehlerarten" value={String(active.length)} />
        <MistakeKpi label="Höchste Priorität" value={active[0]?.name ?? "—"} />
      </div>
      <div className="grid dashboard-main-grid">
        <Card>
          <CardHeader
            title="Kosten nach Fehlerart"
            subtitle="Geschätzter vermiedener P&L-Verlust"
          />
          <CardContent>
            {active.length ? (
              <BaseChart option={mistakeOption(active)} height={340} />
            ) : (
              <EmptyState
                icon={ShieldAlert}
                title="Noch keine Fehler zugeordnet"
                description="Ordne im Trade-Review explizite Fehler zu. Unbewertete Trades werden nicht automatisch als fehlerhaft markiert."
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Fehlerkatalog"
            subtitle="Schweregrad, Häufigkeit und Gegenmaßnahme"
          />
          <CardContent>
            {rows.map((row) => (
              <div className="settings-row" key={row.id}>
                <div className="settings-row-copy">
                  <strong>{row.name}</strong>
                  <span>
                    {row.countermeasure ?? `Kategorie: ${row.category}`}
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Badge className={row.occurrences ? "negative" : "neutral"}>
                    {row.occurrences}×
                  </Badge>
                  <div className="muted" style={{ fontSize: 9, marginTop: 5 }}>
                    {row.averageSeverity
                      ? `Ø Schwere ${number.format(row.averageSeverity)}`
                      : "noch unbewertet"}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="notice" style={{ marginTop: 14 }}>
        <AlertTriangle
          size={13}
          style={{ verticalAlign: -2, marginRight: 7 }}
        />
        Kosten sind manuelle Schätzwerte und werden getrennt vom realisierten
        Netto-P&L gespeichert. Sie sollen Verbesserungsprioritäten sichtbar
        machen, nicht Scheingenauigkeit erzeugen.
      </div>
    </div>
  );
}
function MistakeKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "negative";
}) {
  return (
    <Card className="kpi-card" style={{ minHeight: 96 }}>
      <div className="kpi-label">{label}</div>
      <div
        className={`kpi-value${tone ? ` ${tone}-text` : ""}`}
        style={{ fontSize: value.length > 15 ? 15 : 21 }}
      >
        {value}
      </div>
    </Card>
  );
}
function mistakeOption(rows: MistakeAnalytics[]): EChartsOption {
  return {
    tooltip: { ...tooltip, trigger: "axis" },
    grid: { left: 115, right: 25, top: 15, bottom: 25 },
    xAxis: {
      type: "value",
      axisLabel: { ...axisLabel, formatter: "{value} €" },
      splitLine,
    },
    yAxis: {
      type: "category",
      data: rows.map((row) => row.name),
      axisLabel,
      axisLine,
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        data: rows.map((row) => ({
          value: row.estimatedCostMinor / 100,
          itemStyle: { color: "#ff5e6c", borderRadius: 3 },
        })),
        barMaxWidth: 24,
      },
    ],
  };
}
