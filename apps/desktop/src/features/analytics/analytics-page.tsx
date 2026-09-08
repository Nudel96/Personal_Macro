import { ChartNoAxesCombined as PageIcon } from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Brain, ShieldAlert, Timer, TrendingUp } from "lucide-react";
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
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { JournalPageHeader } from "../../components/ui/journal-page-header";
import { formatMoneyMinor, formatR, number, percent } from "../../lib/utils";
import { api } from "../../services/commands";
import { JournalAccountGate } from "../accounts/journal-account-gate";
import { useJournalAccount } from "../accounts/journal-account-context";
import type {
  Account,
  DashboardResponse,
  GroupPerformance,
} from "../../types/domain";

export function AnalyticsPage() {
  const { status, selectedAccountId, selectedAccount } = useJournalAccount();
  const ready = status === "ready" && selectedAccountId !== null;
  const query = useQuery({
    queryKey: ["dashboard", selectedAccountId, "analytics"],
    queryFn: () => api.dashboard(selectedAccountId!, {}),
    enabled: ready,
  });
  const header = (
    <JournalPageHeader
      icon={PageIcon}
      eyebrow="Tradingjournal"
      title="Analytics"
      description="Robuste Auswertung von Performance, Setups, Zeit, Risiko und Prozess."
      actions={
        <Badge className="primary">Performance · Risiko · Prozess</Badge>
      }
    />
  );
  if (!ready)
    return (
      <div className="page analytics-page">
        {header}
        <JournalAccountGate>
          <div />
        </JournalAccountGate>
      </div>
    );
  if (query.isLoading)
    return (
      <div className="page analytics-page">
        {header}
        <PageLoading />
      </div>
    );
  if (query.isError || !query.data)
    return (
      <div className="page analytics-page">
        {header}
        <ErrorState message="Analytics konnten nicht geladen werden." />
      </div>
    );
  return (
    <div className="page analytics-page">
      {header}
      <AccountCapitalOverview
        accounts={selectedAccount ? [selectedAccount] : []}
      />
      <Tabs.Root defaultValue="performance">
        <Tabs.List
          className="segmented"
          style={{ width: "fit-content", marginBottom: 15 }}
        >
          <Tabs.Trigger value="performance" asChild>
            <button>Performance</button>
          </Tabs.Trigger>
          <Tabs.Trigger value="setups" asChild>
            <button>Setups</button>
          </Tabs.Trigger>
          <Tabs.Trigger value="markets" asChild>
            <button>Märkte</button>
          </Tabs.Trigger>
          <Tabs.Trigger value="time" asChild>
            <button>Zeit</button>
          </Tabs.Trigger>
          <Tabs.Trigger value="risk" asChild>
            <button>Risiko</button>
          </Tabs.Trigger>
          <Tabs.Trigger value="psychology" asChild>
            <button>Psychologie</button>
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="performance">
          <PerformanceTab data={query.data} />
        </Tabs.Content>
        <Tabs.Content value="setups">
          <GroupTab
            icon={BarChart3}
            title="Setup-Vergleich"
            groups={query.data.setupPerformance}
          />
        </Tabs.Content>
        <Tabs.Content value="markets">
          <GroupCollection
            groups={[
              ["Instrumente", query.data.instrumentPerformance],
              ["Assetklassen", query.data.assetClassPerformance],
              ["Richtung", query.data.directionPerformance],
            ]}
          />
        </Tabs.Content>
        <Tabs.Content value="time">
          <GroupCollection
            groups={[
              ["Wochentage", query.data.weekdayPerformance],
              ["Sessions", query.data.sessionPerformance],
              ["Timeframes", query.data.timeframePerformance],
            ]}
          />
        </Tabs.Content>
        <Tabs.Content value="risk">
          <RiskTab data={query.data} />
        </Tabs.Content>
        <Tabs.Content value="psychology">
          <PsychologyTab data={query.data} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

export function AccountCapitalOverview({
  accounts,
  isLoading = false,
  isError = false,
}: {
  accounts: Account[];
  isLoading?: boolean;
  isError?: boolean;
}) {
  if (isLoading)
    return (
      <Card style={{ marginBottom: 14 }}>
        <CardContent>
          <span className="muted">Kontokapital wird geladen …</span>
        </CardContent>
      </Card>
    );
  if (isError)
    return (
      <Card style={{ marginBottom: 14 }}>
        <CardContent>
          <span className="muted">
            Kontokapital konnte nicht geladen werden.
          </span>
        </CardContent>
      </Card>
    );
  if (!accounts.length)
    return (
      <Card style={{ marginBottom: 14 }}>
        <CardContent>
          <span className="muted">
            Lege unter Einstellungen ein Tradingkonto an, um das aktuelle
            Kapital zu sehen.
          </span>
        </CardContent>
      </Card>
    );
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        marginBottom: 14,
      }}
    >
      {accounts.map((account) => (
        <AnalyticKpi
          key={account.id}
          label={`Aktuelles Kapital · ${account.name}`}
          value={formatAccountBalance(account)}
        />
      ))}
    </div>
  );
}

function formatAccountBalance(account: Account) {
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: account.baseCurrency,
      minimumFractionDigits: 2,
    }).format(account.currentBalanceMinor / 100);
  } catch {
    return `${(account.currentBalanceMinor / 100).toFixed(2)} ${account.baseCurrency}`;
  }
}

function PerformanceTab({ data }: { data: DashboardResponse }) {
  const metrics = data.metrics;
  const hasTradeData = metrics.totalTrades > 0;
  return (
    <>
      <div className="grid summary-grid" style={{ marginBottom: 16 }}>
        <AnalyticKpi
          label="Netto-P&L"
          value={hasTradeData ? formatMoneyMinor(metrics.netPnlMinor) : "—"}
        />
        <AnalyticKpi
          label="Total R"
          value={hasTradeData ? formatR(metrics.totalR.value) : "—"}
        />
        <AnalyticKpi
          label="Expectancy"
          value={
            !hasTradeData || metrics.expectancyMinor.value == null
              ? "—"
              : formatMoneyMinor(metrics.expectancyMinor.value)
          }
        />
        <AnalyticKpi
          label="Max. Drawdown"
          value={
            hasTradeData ? formatMoneyMinor(-metrics.maxDrawdownMinor) : "—"
          }
        />
        <AnalyticKpi
          label="Payoff Ratio"
          value={metricNumber(metrics.payoffRatio.value)}
        />
        <AnalyticKpi label="Median R" value={formatR(metrics.medianR.value)} />
        <AnalyticKpi
          label="Recovery Factor"
          value={metricNumber(metrics.recoveryFactor.value)}
        />
        <AnalyticKpi
          label="SQN (ab n=30)"
          value={metricNumber(metrics.systemQualityNumber.value)}
        />
      </div>
      <div className="grid dashboard-main-grid">
        <Card>
          <CardHeader
            title="PnL und Drawdown"
            subtitle="Drawdown relativ zum bisherigen Hochpunkt der PnL-Kurve"
          />
          <CardContent>
            {metrics.equityCurve.length ? (
              <BaseChart option={performanceOption(data)} height={330} />
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="Keine Performance-Daten"
                description="Geschlossene Trades erzeugen hier PnL- und Drawdown-Verlauf."
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Qualitätsübersicht"
            subtitle="Prozesswerte nur aus explizit bewerteten Trades"
          />
          <CardContent>
            <QualityRow
              label="Win Rate"
              value={metrics.winRate.value}
              n={metrics.winRate.n}
            />
            <QualityRow
              label="Plan eingehalten"
              value={metrics.planAdherence.value}
              n={metrics.planAdherence.n}
            />
            <QualityRow
              label="Risikoregeln"
              value={metrics.riskAdherence.value}
              n={metrics.riskAdherence.n}
            />
            <QualityRow
              label="Review-Quote"
              value={metrics.reviewCompletion.value}
              n={metrics.reviewCompletion.n}
            />
            <QualityRow
              label="Prozess-Score"
              value={
                metrics.averageProcessScore.value == null
                  ? undefined
                  : metrics.averageProcessScore.value / 10
              }
              n={metrics.averageProcessScore.n}
            />
            <div className="notice" style={{ marginTop: 18 }}>
              Finanzielles Ergebnis und Prozessqualität werden getrennt gezeigt.
              Ein Gewinn macht einen Regelverstoß nicht zu einem guten Prozess.
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function GroupTab({
  icon,
  title,
  groups,
}: {
  icon: typeof BarChart3;
  title: string;
  groups: GroupPerformance[];
}) {
  if (!groups.length)
    return (
      <Card>
        <EmptyState
          icon={icon}
          title="Noch keine Gruppendaten"
          description="Erfasse und kategorisiere Trades, um dieses Muster belastbar auszuwerten."
        />
      </Card>
    );
  return (
    <div className="grid dashboard-main-grid">
      <Card>
        <CardHeader
          title={title}
          subtitle="Netto-P&L und durchschnittliches R"
        />
        <CardContent>
          <BaseChart option={groupOption(groups)} height={350} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          title="Stichprobenqualität"
          subtitle="Rankings werden erst ab n ≥ 10 freigegeben"
        />
        <CardContent>
          {groups.map((group) => (
            <div key={group.key} className="settings-row">
              <div className="settings-row-copy">
                <strong>{group.label}</strong>
                <span>
                  {formatMoneyMinor(group.netPnlMinor)} ·{" "}
                  {formatR(group.averageR)}
                </span>
              </div>
              <Badge className={group.trades >= 10 ? "positive" : "warning"}>
                n = {group.trades}
                {group.trades < 10 ? " · vorläufig" : ""}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function GroupCollection({
  groups,
}: {
  groups: Array<[string, GroupPerformance[]]>;
}) {
  return (
    <div className="grid dashboard-main-grid">
      {groups.map(([title, rows]) => (
        <Card key={title}>
          <CardHeader
            title={title}
            subtitle="Netto-P&L · belastbares Ranking ab n ≥ 10"
          />
          <CardContent>
            {rows.length ? (
              <BaseChart option={groupOption(rows.slice(0, 12))} height={285} />
            ) : (
              <EmptyState
                icon={Timer}
                title="Noch keine Daten"
                description="Diese Gruppierung wird nach den ersten kategorisierten Trades sichtbar."
              />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RiskTab({ data }: { data: DashboardResponse }) {
  const { metrics } = data;
  return (
    <div className="grid dashboard-main-grid">
      <Card>
        <CardHeader
          title="Drawdown-Verlauf"
          subtitle="Abstand zum bisherigen PnL-Hoch"
        />
        <CardContent>
          {metrics.drawdownCurve.length ? (
            <BaseChart option={drawdownOption(data)} height={330} />
          ) : (
            <EmptyState
              icon={ShieldAlert}
              title="Kein Drawdown-Verlauf"
              description="Für die Risikoanalyse fehlen geschlossene Trades."
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Risiko-Guardrails" />
        <CardContent>
          <RiskValue
            label="Maximaler Drawdown"
            value={formatMoneyMinor(metrics.maxDrawdownMinor)}
          />
          <RiskValue
            label="Aktueller Drawdown"
            value={formatMoneyMinor(metrics.currentDrawdownMinor)}
          />
          <RiskValue
            label="Ø Drawdown"
            value={
              metrics.averageDrawdownMinor.value == null
                ? "—"
                : formatMoneyMinor(metrics.averageDrawdownMinor.value)
            }
          />
          <RiskValue
            label="Maximale Verlustserie"
            value={`${metrics.maxLossStreak} Trades`}
          />
          <RiskValue
            label="Ø geplantes Risiko"
            value={
              metrics.averagePlannedRiskMinor.value == null
                ? "—"
                : formatMoneyMinor(metrics.averagePlannedRiskMinor.value)
            }
          />
          <RiskValue
            label="Max. geplantes Risiko"
            value={formatMoneyMinor(metrics.maxPlannedRiskMinor)}
          />
          <RiskValue
            label="Tradingkosten"
            value={formatMoneyMinor(metrics.totalCostsMinor)}
          />
          <RiskValue
            label="Ø Haltedauer"
            value={
              metrics.averageHoldingMinutes.value == null
                ? "—"
                : `${number.format(metrics.averageHoldingMinutes.value)} Min.`
            }
          />
          <RiskValue
            label="Profit Factor"
            value={
              metrics.profitFactor.formattedSpecial ??
              metricNumber(metrics.profitFactor.value)
            }
          />
          <div className="notice" style={{ marginTop: 18 }}>
            Eine echte Equity-Kurve benötigt Startbalance und Cashflows. Bis
            dahin wird bewusst eine PnL-Kurve angezeigt.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PsychologyTab({ data }: { data: DashboardResponse }) {
  const sample = data.metrics.averageProcessScore.n;
  return (
    <div className="grid dashboard-main-grid">
      <Card>
        <EmptyState
          icon={Brain}
          title={
            sample < 20
              ? "Noch keine belastbare Psychologie-Auswertung"
              : "Psychologie-Stichprobe ist bereit"
          }
          description={`Korrelationen werden ab 20 bewerteten Trades freigegeben. Aktuelle bewertete Stichprobe: n=${sample}. Hinweise beschreiben Zusammenhänge, keine Ursachen.`}
        />
      </Card>
      <Card>
        <CardHeader title="Prozess-Snapshot" />
        <CardContent>
          <QualityRow
            label="Ø Prozess-Score"
            value={
              data.metrics.averageProcessScore.value == null
                ? undefined
                : data.metrics.averageProcessScore.value / 10
            }
            n={data.metrics.averageProcessScore.n}
          />
          <QualityRow
            label="Ø Ausführung"
            value={
              data.metrics.averageExecutionScore.value == null
                ? undefined
                : data.metrics.averageExecutionScore.value / 10
            }
            n={data.metrics.averageExecutionScore.n}
          />
          <QualityRow
            label="Ø Setup-Qualität"
            value={
              data.metrics.averageSetupQuality.value == null
                ? undefined
                : data.metrics.averageSetupQuality.value / 10
            }
            n={data.metrics.averageSetupQuality.n}
          />
          <QualityRow
            label="Plan eingehalten"
            value={data.metrics.planAdherence.value ?? undefined}
            n={data.metrics.planAdherence.n}
          />
          <QualityRow
            label="Entry-Regeln"
            value={data.metrics.entryAdherence.value ?? undefined}
            n={data.metrics.entryAdherence.n}
          />
          <QualityRow
            label="Exit-Regeln"
            value={data.metrics.exitAdherence.value ?? undefined}
            n={data.metrics.exitAdherence.n}
          />
          <div className="notice" style={{ marginTop: 18 }}>
            Missing-Werte bleiben unbekannt. Ein nicht ausgefülltes Feld wird
            nicht als Fehler oder Regelverstoß behandelt.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function metricNumber(value?: number | null) {
  return value == null ? "—" : number.format(value);
}

function AnalyticKpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="kpi-card" style={{ minHeight: 100 }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 21 }}>
        {value}
      </div>
    </Card>
  );
}
function QualityRow({
  label,
  value,
  n,
}: {
  label: string;
  value?: number | null;
  n: number;
}) {
  const available = value != null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
        }}
      >
        <span>{label}</span>
        <span>
          {available ? percent.format(value) : "—"}{" "}
          <span className="muted">· n={n}</span>
        </span>
      </div>
      <div className="factor-track" style={{ marginTop: 8 }}>
        <div
          className="factor-bar"
          style={{
            width: `${Math.max(0, Math.min(100, (value ?? 0) * 100))}%`,
          }}
        />
      </div>
    </div>
  );
}
function RiskValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <strong>{label}</strong>
      </div>
      <strong className="tabular">{value}</strong>
    </div>
  );
}

function performanceOption(data: DashboardResponse): EChartsOption {
  const { metrics } = data;
  return {
    tooltip: { ...tooltip, trigger: "axis" },
    legend: {
      data: ["Kumuliertes P&L", "Drawdown"],
      textStyle: axisLabel,
      top: 0,
    },
    grid: { left: 52, right: 50, top: 38, bottom: 35 },
    xAxis: {
      type: "category",
      data: metrics.equityCurve.map((point) =>
        new Date(point.date).toLocaleDateString("de-DE"),
      ),
      axisLabel,
      axisLine,
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: "value",
        axisLabel: { ...axisLabel, formatter: "{value} €" },
        splitLine,
      },
      {
        type: "value",
        axisLabel: { ...axisLabel, formatter: "{value} €" },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "Kumuliertes P&L",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: metrics.equityCurve.map(
          (point) => point.cumulativePnlMinor / 100,
        ),
        lineStyle: { color: "#5d6dff", width: 2 },
        itemStyle: { color: "#5d6dff" },
        areaStyle: { color: "rgba(82,93,255,.18)" },
      },
      {
        name: "Drawdown",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        data: metrics.drawdownCurve.map((point) => -point.drawdownMinor / 100),
        lineStyle: { color: "#ff5e6c", width: 1.5 },
        itemStyle: { color: "#ff5e6c" },
        areaStyle: { color: "rgba(255,94,108,.11)" },
      },
    ],
  };
}
function groupOption(groups: GroupPerformance[]): EChartsOption {
  return {
    tooltip: { ...tooltip, trigger: "axis" },
    grid: { left: 100, right: 45, top: 20, bottom: 30 },
    xAxis: {
      type: "value",
      axisLabel: { ...axisLabel, formatter: "{value} €" },
      splitLine,
    },
    yAxis: {
      type: "category",
      data: groups.map((group) => group.label),
      axisLabel,
      axisLine,
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        data: groups.map((group) => ({
          value: group.netPnlMinor / 100,
          itemStyle: {
            color: group.netPnlMinor >= 0 ? "#37d481" : "#ff5e6c",
            borderRadius: 3,
          },
        })),
        barMaxWidth: 25,
      },
    ],
  };
}
function drawdownOption(data: DashboardResponse): EChartsOption {
  return {
    tooltip: { ...tooltip, trigger: "axis" },
    grid: { left: 52, right: 15, top: 20, bottom: 35 },
    xAxis: {
      type: "category",
      data: data.metrics.drawdownCurve.map((point) =>
        new Date(point.date).toLocaleDateString("de-DE"),
      ),
      axisLabel,
      axisLine,
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      inverse: true,
      axisLabel: { ...axisLabel, formatter: "-{value} €" },
      splitLine,
    },
    series: [
      {
        type: "line",
        data: data.metrics.drawdownCurve.map(
          (point) => point.drawdownMinor / 100,
        ),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: "#ff5e6c", width: 2 },
        areaStyle: { color: "rgba(255,94,108,.18)" },
      },
    ],
  };
}
