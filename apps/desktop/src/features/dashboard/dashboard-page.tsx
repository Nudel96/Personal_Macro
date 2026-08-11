import { useQuery } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CircleHelp,
  Filter,
  Info,
  Plus,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { EChartsOption } from "echarts";
import {
  BaseChart,
  axisLabel,
  axisLine,
  chartGrid,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { PageHeader } from "../../components/ui/page-header";
import { OnboardingChecklist } from "../../components/ui/onboarding-checklist";
import {
  dateTime,
  formatMoneyMinor,
  formatR,
  number,
  percent,
} from "../../lib/utils";
import { api } from "../../services/commands";
import { useUiStore } from "../../stores/ui-store";
import type {
  CalendarDay,
  DashboardMetrics,
  MetricValue,
  TradeFilter,
} from "../../types/domain";

type DatePreset = ReturnType<typeof useUiStore.getState>["globalDatePreset"];
function presetFilter(
  preset: DatePreset,
  customFrom?: string,
  customTo?: string,
): TradeFilter {
  if (preset === "all") return {};
  const now = new Date();
  const start = new Date(now);
  if (preset === "today") start.setHours(0, 0, 0, 0);
  if (preset === "week") {
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    start.setHours(0, 0, 0, 0);
  }
  if (preset === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  if (preset === "quarter") {
    start.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
    start.setHours(0, 0, 0, 0);
  }
  if (preset === "year") start.setMonth(0, 1);
  if (preset === "30d") start.setDate(now.getDate() - 30);
  if (preset === "90d") start.setDate(now.getDate() - 90);
  if (preset === "ytd") start.setMonth(0, 1);
  if (preset === "custom")
    return {
      dateFrom: customFrom
        ? new Date(`${customFrom}T00:00:00`).toISOString()
        : undefined,
      dateTo: customTo
        ? new Date(`${customTo}T23:59:59`).toISOString()
        : undefined,
    };
  return { dateFrom: start.toISOString(), dateTo: now.toISOString() };
}

export function DashboardPage() {
  const {
    globalDatePreset,
    setGlobalDatePreset,
    setQuickTradeOpen,
    setGuidedTradeOpen,
    onboardingCollapsed,
    onboardingDismissed,
    setOnboardingCollapsed,
    setOnboardingDismissed,
    globalAccountIds,
    globalSetupIds,
    globalDirection,
    globalDateFrom,
    globalDateTo,
  } = useUiStore();
  const [filterOpen, setFilterOpen] = useState(false);
  const [kpiOrder, setKpiOrder] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("personal-macro:dashboard-kpi-order:v1") ?? "null",
      ) as string[] | null;
      return saved?.length === 6
        ? saved
        : ["net", "pf", "win", "r", "process", "expectancy"];
    } catch {
      return ["net", "pf", "win", "r", "process", "expectancy"];
    }
  });
  const [dashboardView, setDashboardView] = useState("balanced");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const filter = useMemo(
    () => ({
      ...presetFilter(globalDatePreset, globalDateFrom, globalDateTo),
      accountIds: globalAccountIds.length ? globalAccountIds : undefined,
      setupIds: globalSetupIds.length ? globalSetupIds : undefined,
      directions: globalDirection === "all" ? undefined : [globalDirection],
    }),
    [
      globalDatePreset,
      globalAccountIds,
      globalSetupIds,
      globalDirection,
      globalDateFrom,
      globalDateTo,
    ],
  );
  const dashboard = useQuery({
    queryKey: ["dashboard", filter],
    queryFn: () => api.dashboard(filter),
  });
  const trades = useQuery({
    queryKey: ["trades", "recent"],
    queryFn: () => api.listTrades({ pageSize: 5 }),
  });
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: api.bootstrap,
  });
  const reviews = useQuery({
    queryKey: ["reviews"],
    queryFn: api.reviews,
  });

  if (dashboard.isLoading)
    return (
      <div className="page">
        <PageLoading />
      </div>
    );
  if (dashboard.isError || !dashboard.data)
    return (
      <div className="page">
        <ErrorState
          message={
            (dashboard.error as Error)?.message ??
            "Dashboard konnte nicht geladen werden."
          }
        />
      </div>
    );
  const {
    metrics,
    calendar,
    setupPerformance,
    weekdayPerformance,
    generatedAt,
  } = dashboard.data;
  const onboardingSteps = [
    {
      id: "account",
      title: "Konto prüfen",
      description:
        "Kontowährung, Startkapital und Risikolimit bilden die Basis deiner Auswertung.",
      complete: (bootstrap.data?.accounts.length ?? 0) > 0,
      action: (
        <Link className="button primary sm" to="/settings">
          Konten öffnen
        </Link>
      ),
    },
    {
      id: "trade",
      title: "Ersten Trade erfassen",
      description:
        "Erfasse mindestens einen geschlossenen Trade für belastbare Kennzahlen.",
      complete: metrics.totalTrades > 0,
      action: (
        <Button
          size="sm"
          variant="primary"
          onClick={() => setGuidedTradeOpen(true)}
        >
          <Plus size={13} /> Trade erfassen
        </Button>
      ),
    },
    {
      id: "setup",
      title: "Setup dokumentieren",
      description:
        "Lege Regeln und Checklisten für wiederholbare Entscheidungen fest.",
      complete: (bootstrap.data?.setups.length ?? 0) > 0,
      action: (
        <Link className="button primary sm" to="/playbook">
          Setup anlegen
        </Link>
      ),
    },
    {
      id: "review",
      title: "Erstes Review durchführen",
      description: "Verbinde Kennzahlen mit qualitativen Erkenntnissen.",
      complete: (reviews.data?.length ?? 0) > 0,
      action: (
        <Link className="button primary sm" to="/reviews">
          Review starten
        </Link>
      ),
    },
  ];
  const onboardingIncomplete = onboardingSteps.some((step) => !step.complete);
  const kpis: Record<string, React.ReactNode> = {
    net: (
      <KpiCard
        label="Netto-P&L"
        value={formatMoneyMinor(metrics.netPnlMinor)}
        tone={
          metrics.netPnlMinor > 0
            ? "positive"
            : metrics.netPnlMinor < 0
              ? "negative"
              : "neutral"
        }
        meta={`${metrics.totalTrades} geschlossene Trades`}
        spark={metrics.equityCurve.map((point) => point.cumulativePnlMinor)}
      />
    ),
    pf: (
      <KpiCard
        label="Profit Factor"
        value={metricText(metrics.profitFactor, "ratio")}
        tone="primary"
        meta={`n = ${metrics.profitFactor.n}`}
        spark={metrics.equityCurve.map((point) => point.cumulativePnlMinor)}
      />
    ),
    win: (
      <KpiCard
        label="Win Rate"
        value={metricText(metrics.winRate, "percent")}
        tone="violet"
        meta={`${metrics.wins} Gewinne · ${metrics.losses} Verluste`}
      />
    ),
    r: (
      <KpiCard
        label="Ø R / Trade"
        value={metricText(metrics.averageR, "r")}
        tone="warning"
        meta={`n = ${metrics.averageR.n} mit gültigem Risiko`}
      />
    ),
    process: (
      <KpiCard
        label="Prozess-Score"
        value={metricText(metrics.averageProcessScore, "score")}
        tone="cyan"
        meta={`n = ${metrics.averageProcessScore.n} Bewertungen`}
      />
    ),
    expectancy: (
      <KpiCard
        label="Expectancy"
        value={
          metrics.expectancyMinor.value == null
            ? "—"
            : formatMoneyMinor(metrics.expectancyMinor.value)
        }
        tone="violet"
        meta={`pro geschlossenem Trade · n = ${metrics.expectancyMinor.n}`}
      />
    ),
  };
  const reorderKpis = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    setKpiOrder((current) => {
      const next = arrayMove(
        current,
        current.indexOf(String(event.active.id)),
        current.indexOf(String(event.over!.id)),
      );
      localStorage.setItem(
        "personal-macro:dashboard-kpi-order:v1",
        JSON.stringify(next),
      );
      return next;
    });
  };
  const applyDashboardView = (view: string) => {
    const layouts: Record<string, string[]> = {
      balanced: ["net", "pf", "win", "r", "process", "expectancy"],
      performance: ["net", "expectancy", "pf", "win", "r", "process"],
      process: ["process", "win", "r", "pf", "net", "expectancy"],
    };
    const next = layouts[view] ?? layouts.balanced;
    setDashboardView(view);
    setKpiOrder(next);
    localStorage.setItem(
      "personal-macro:dashboard-kpi-order:v1",
      JSON.stringify(next),
    );
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="Tradingjournal"
        title="Performance-Übersicht"
        description="Ergebnis, Risiko und Prozessqualität aus derselben gefilterten Trade-Population."
        actions={
          <>
            <select
              className="select"
              aria-label="Dashboard-Ansicht"
              value={dashboardView}
              onChange={(event) => applyDashboardView(event.target.value)}
              style={{ width: 145 }}
            >
              <option value="balanced">Ausgewogen</option>
              <option value="performance">Performance</option>
              <option value="process">Prozessfokus</option>
            </select>
            <div className="segmented">
              {(["all", "month", "quarter", "year"] as const).map((preset) => (
                <button
                  key={preset}
                  className={globalDatePreset === preset ? "active" : ""}
                  onClick={() => setGlobalDatePreset(preset)}
                >
                  {preset === "all"
                    ? "Gesamt"
                    : preset === "month"
                      ? "Monat"
                      : preset === "quarter"
                        ? "Quartal"
                        : "Jahr"}
                </button>
              ))}
            </div>
            <Button onClick={() => setFilterOpen(true)}>
              <Filter size={14} /> Filter
              {globalAccountIds.length +
              globalSetupIds.length +
              (globalDirection === "all" ? 0 : 1)
                ? ` (${globalAccountIds.length + globalSetupIds.length + (globalDirection === "all" ? 0 : 1)})`
                : ""}
            </Button>
          </>
        }
      />
      {onboardingIncomplete && !onboardingDismissed && (
        <OnboardingChecklist
          steps={onboardingSteps}
          collapsed={onboardingCollapsed}
          onCollapsedChange={setOnboardingCollapsed}
          onDismiss={() => setOnboardingDismissed(true)}
        />
      )}
      {onboardingIncomplete && onboardingDismissed && (
        <Button
          className="onboarding-restore"
          size="sm"
          variant="ghost"
          onClick={() => setOnboardingDismissed(false)}
        >
          Erste Schritte einblenden
        </Button>
      )}
      {metrics.totalTrades > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={reorderKpis}
        >
          <SortableContext
            items={kpiOrder.slice(0, 4)}
            strategy={rectSortingStrategy}
          >
            <div className="grid kpi-grid compact">
              {kpiOrder.slice(0, 4).map((id) => (
                <SortableKpi id={id} key={id}>
                  {kpis[id]}
                </SortableKpi>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="grid dashboard-main-grid" style={{ marginBottom: 14 }}>
        <Card>
          <CardHeader
            title="PnL-Kurve"
            subtitle="Kumuliertes Netto-P&L; ohne Startbalance keine Equity-Kurve"
            action={<Badge className="primary">Kumuliert</Badge>}
          />
          <CardContent>
            {metrics.equityCurve.length ? (
              <BaseChart option={equityOption(metrics)} height={295} />
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="Noch keine Performance-Kurve"
                description="Sobald du geschlossene Trades mit Ergebnis erfasst, erscheint hier dein kumulierter Verlauf."
                action={
                  <Button
                    variant="primary"
                    onClick={() => setQuickTradeOpen(true)}
                  >
                    <Plus size={14} /> Ersten Trade erfassen
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Performance-Kalender"
            subtitle="Netto-P&L pro Handelstag"
            action={
              <Badge>
                <CalendarDays size={11} />{" "}
                {new Date().toLocaleDateString("de-DE", {
                  month: "long",
                  year: "numeric",
                })}
              </Badge>
            }
          />
          <CardContent>
            <MonthHeatmap days={calendar} />
          </CardContent>
        </Card>
      </div>

      <div
        className="grid dashboard-secondary-grid"
        style={{ marginBottom: 14 }}
      >
        <Card>
          <CardHeader
            title="Statistik"
            subtitle={`Berechnung ${metrics.calculationVersion}`}
          />
          <CardContent>
            {metrics.totalTrades ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "220px 1fr",
                  alignItems: "center",
                }}
              >
                <BaseChart option={donutOption(metrics)} height={210} />
                <div
                  className="grid"
                  style={{ gridTemplateColumns: "1fr 1fr" }}
                >
                  <Stat
                    label="Gewonnen"
                    value={`${metrics.wins} (${percent.format(metrics.winRate.value ?? 0)})`}
                    tone="positive"
                  />
                  <Stat
                    label="Verloren"
                    value={`${metrics.losses}`}
                    tone="negative"
                  />
                  <Stat
                    label="Größter Gewinn"
                    value={formatMoneyMinor(metrics.largestWinnerMinor)}
                    tone="positive"
                  />
                  <Stat
                    label="Größter Verlust"
                    value={formatMoneyMinor(metrics.largestLoserMinor)}
                    tone="negative"
                  />
                  <Stat
                    label="Max. Gewinnserie"
                    value={number.format(metrics.maxWinStreak)}
                  />
                  <Stat
                    label="Max. Verlustserie"
                    value={number.format(metrics.maxLossStreak)}
                  />
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Target}
                title="Statistik wartet auf Trades"
                description="Gewinne, Verluste und Serien werden nur aus abgeschlossenen Trades berechnet."
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Letzte Trades"
            subtitle="Zuletzt aktualisierte Journal-Einträge"
            action={<Button size="sm">Alle anzeigen</Button>}
          />
          <CardContent style={{ padding: 0 }}>
            {trades.data?.items.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Setup</th>
                      <th>Richtung</th>
                      <th>Datum</th>
                      <th>R</th>
                      <th>P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.data.items.map((trade) => (
                      <tr key={trade.id}>
                        <td>
                          <div className="asset-cell">
                            <span className="asset-icon">
                              {trade.instrument.slice(0, 2)}
                            </span>
                            <strong>{trade.instrument}</strong>
                          </div>
                        </td>
                        <td>{trade.setupName ?? "—"}</td>
                        <td>
                          <Badge
                            className={
                              trade.direction === "long"
                                ? "positive"
                                : "negative"
                            }
                          >
                            {trade.direction.toUpperCase()}
                          </Badge>
                        </td>
                        <td>{dateTime(trade.closedAt ?? trade.openedAt)}</td>
                        <td
                          className={
                            (Number(trade.calculatedR) || 0) >= 0
                              ? "positive-text"
                              : "negative-text"
                          }
                        >
                          {formatR(trade.calculatedR)}
                        </td>
                        <td
                          className={
                            (trade.netPnlMinor ?? 0) >= 0
                              ? "positive-text"
                              : "negative-text"
                          }
                        >
                          {formatMoneyMinor(trade.netPnlMinor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={CircleHelp}
                title="Noch keine Trades"
                description="Deine letzten Journal-Einträge erscheinen hier automatisch."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid dashboard-tertiary-grid">
        <Card>
          <CardHeader
            title="P&L-Verteilung"
            subtitle="Häufigkeit nach Ergebnisbereich"
          />
          <CardContent>
            {metrics.totalTrades ? (
              <BaseChart option={distributionOption(metrics)} height={215} />
            ) : (
              <EmptyState
                icon={BarChart3}
                title="Keine Verteilung"
                description="Für diese Grafik fehlen geschlossene Trades."
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Performance nach Wochentag"
            subtitle="Netto-P&L je Ausstiegstag"
          />
          <CardContent>
            {weekdayPerformance.length ? (
              <BaseChart
                option={barOption(
                  weekdayPerformance.map((item) => item.label),
                  weekdayPerformance.map((item) => item.netPnlMinor / 100),
                )}
                height={215}
              />
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="Keine Wochentagsdaten"
                description="Erfasse geschlossene Trades mit Datum, um Zeitmuster zu sehen."
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Setup Performance"
            subtitle="Ranking ab mindestens 10 Trades je Setup"
            action={<Info size={14} className="muted" />}
          />
          <CardContent>
            {setupPerformance.length ? (
              <div>
                {setupPerformance.map((item) => (
                  <div key={item.key} style={{ marginBottom: 15 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 10,
                        marginBottom: 7,
                      }}
                    >
                      <span>{item.label}</span>
                      <span className="muted">
                        {item.trades >= 10
                          ? `${percent.format(item.winRate ?? 0)} · ${formatR(item.averageR)}`
                          : `n=${item.trades} · noch kein Ranking`}
                      </span>
                    </div>
                    <div className="factor-track">
                      <div
                        className={`factor-bar${item.netPnlMinor < 0 ? " negative" : ""}`}
                        style={{
                          width: `${Math.min(100, Math.max(8, (Math.abs(item.netPnlMinor) / Math.max(...setupPerformance.map((row) => Math.abs(row.netPnlMinor)), 1)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Target}
                title="Keine Setup-Daten"
                description="Ordne Trades einem Setup zu, damit du robuste Stärken und Schwächen erkennst."
              />
            )}
          </CardContent>
        </Card>
      </div>
      <div
        className="muted"
        style={{ marginTop: 13, fontSize: 9, textAlign: "right" }}
      >
        Zuletzt berechnet: {dateTime(generatedAt)} · Alle Karten verwenden
        denselben Zeitraum.
      </div>
      <DashboardFilterDialog open={filterOpen} onOpenChange={setFilterOpen} />
    </div>
  );
}

function DashboardFilterDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: api.bootstrap,
  });
  const state = useUiStore();
  const toggle = (key: "globalAccountIds" | "globalSetupIds", id: string) => {
    const values = state[key];
    state.setGlobalFilters({
      [key]: values.includes(id)
        ? values.filter((value) => value !== id)
        : [...values, id],
    });
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content wide"
          aria-describedby="dashboard-filter-description"
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">
                Globale Dashboard-Filter
              </Dialog.Title>
              <Dialog.Description
                id="dashboard-filter-description"
                className="dialog-description"
              >
                Alle Kennzahlen, Charts und Kalenderkarten verwenden dieselbe
                Trade-Population.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Schließen">
                <X size={16} />
              </Button>
            </Dialog.Close>
          </header>
          <div className="dialog-body">
            <section className="form-section">
              <h3 className="form-section-title">Zeitraum</h3>
              <div
                className="segmented"
                style={{ width: "fit-content", flexWrap: "wrap" }}
              >
                {(
                  [
                    "today",
                    "week",
                    "month",
                    "quarter",
                    "year",
                    "30d",
                    "90d",
                    "all",
                    "custom",
                  ] as DatePreset[]
                ).map((preset) => (
                  <button
                    key={preset}
                    className={
                      state.globalDatePreset === preset ? "active" : ""
                    }
                    onClick={() => state.setGlobalDatePreset(preset)}
                  >
                    {
                      (
                        {
                          today: "Heute",
                          week: "Woche",
                          month: "Monat",
                          quarter: "Quartal",
                          year: "Jahr",
                          "30d": "30 Tage",
                          "90d": "90 Tage",
                          all: "Gesamt",
                          custom: "Individuell",
                          ytd: "YTD",
                        } as Record<DatePreset, string>
                      )[preset]
                    }
                  </button>
                ))}
              </div>
              {state.globalDatePreset === "custom" && (
                <div className="form-grid cols-3" style={{ marginTop: 13 }}>
                  <label className="field">
                    <span>Von</span>
                    <input
                      type="date"
                      className="input"
                      value={state.globalDateFrom ?? ""}
                      onChange={(event) =>
                        state.setGlobalFilters({
                          globalDateFrom: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Bis</span>
                    <input
                      type="date"
                      className="input"
                      value={state.globalDateTo ?? ""}
                      onChange={(event) =>
                        state.setGlobalFilters({
                          globalDateTo: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
              )}
            </section>
            <section className="form-section">
              <h3 className="form-section-title">Konten</h3>
              <div className="chip-list">
                {bootstrap.data?.accounts.map((account) => (
                  <button
                    type="button"
                    className={`tag-toggle${state.globalAccountIds.includes(account.id) ? " selected" : ""}`}
                    key={account.id}
                    onClick={() => toggle("globalAccountIds", account.id)}
                  >
                    {account.name}
                  </button>
                ))}
              </div>
            </section>
            <section className="form-section">
              <h3 className="form-section-title">Setups</h3>
              <div className="chip-list">
                {bootstrap.data?.setups.map((setup) => (
                  <button
                    type="button"
                    className={`tag-toggle${state.globalSetupIds.includes(setup.id) ? " selected" : ""}`}
                    key={setup.id}
                    onClick={() => toggle("globalSetupIds", setup.id)}
                  >
                    <span style={{ background: setup.color }} />
                    {setup.name}
                  </button>
                ))}
              </div>
            </section>
            <section className="form-section">
              <h3 className="form-section-title">Richtung</h3>
              <select
                className="select"
                value={state.globalDirection}
                onChange={(event) =>
                  state.setGlobalFilters({
                    globalDirection: event.target.value as
                      "all" | "long" | "short",
                  })
                }
                style={{ width: 180 }}
              >
                <option value="all">Long & Short</option>
                <option value="long">Nur Long</option>
                <option value="short">Nur Short</option>
              </select>
            </section>
          </div>
          <footer className="dialog-footer">
            <Button
              onClick={() => {
                state.setGlobalDatePreset("all");
                state.setGlobalFilters({
                  globalAccountIds: [],
                  globalSetupIds: [],
                  globalDirection: "all",
                  globalDateFrom: undefined,
                  globalDateTo: undefined,
                });
              }}
            >
              Zurücksetzen
            </Button>
            <Dialog.Close asChild>
              <Button variant="primary">Filter anwenden</Button>
            </Dialog.Close>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function metricText(
  metric: MetricValue,
  format: "ratio" | "percent" | "r" | "score",
) {
  if (metric.formattedSpecial) return metric.formattedSpecial;
  if (metric.value == null) return "—";
  if (format === "percent") return percent.format(metric.value);
  if (format === "r") return formatR(metric.value);
  if (format === "score") return `${number.format(metric.value)} / 10`;
  return number.format(metric.value);
}

function SortableKpi({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`sortable-kpi${isDragging ? " dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  meta,
  tone,
  spark = [],
}: {
  label: string;
  value: string;
  meta: string;
  tone:
    | "positive"
    | "negative"
    | "neutral"
    | "primary"
    | "violet"
    | "warning"
    | "cyan";
  spark?: number[];
}) {
  const colors = {
    positive: "#37d481",
    negative: "#ff5e6c",
    neutral: "#71829a",
    primary: "#5d83ff",
    violet: "#9b67ff",
    warning: "#f7b84b",
    cyan: "#37c7e8",
  };
  return (
    <Card
      className="kpi-card"
      style={{ "--kpi-glow": `${colors[tone]}17` } as React.CSSProperties}
    >
      <div className="kpi-label">
        <span>{label}</span>
        <CircleHelp size={12} className="muted" />
      </div>
      <div
        className="kpi-value"
        style={{ color: tone === "neutral" ? undefined : colors[tone] }}
      >
        {value}
      </div>
      <div
        className={`kpi-meta${tone === "positive" ? " positive" : tone === "negative" ? " negative" : ""}`}
      >
        {tone === "negative" ? (
          <ArrowDownRight size={11} />
        ) : (
          <ArrowUpRight size={11} />
        )}
        {meta}
      </div>
      {spark.length > 1 && <Sparkline values={spark} color={colors[tone]} />}
    </Card>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map(
      (value, index) =>
        `${(index / Math.max(values.length - 1, 1)) * 100},${27 - ((value - min) / span) * 23}`,
    )
    .join(" ");
  return (
    <svg
      className="kpi-spark"
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MonthHeatmap({ days }: { days: CalendarDay[] }) {
  const dayMap = new Map(days.map((day) => [day.date, day]));
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const cells: (Date | null)[] = Array.from(
    { length: (start.getDay() + 6) % 7 },
    () => null,
  );
  for (let day = 1; day <= end.getDate(); day += 1)
    cells.push(new Date(now.getFullYear(), now.getMonth(), day));
  return (
    <div
      className="calendar-grid calendar-grid--compact"
      aria-label="Performance-Kalender des aktuellen Monats"
    >
      {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => (
        <div className="calendar-weekday" key={day}>
          {day}
        </div>
      ))}
      {cells.map((date, index) => {
        if (!date)
          return (
            <div
              aria-hidden="true"
              className="calendar-cell is-empty"
              key={`blank-${index}`}
            />
          );
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        const value = dayMap.get(key);
        return (
          <div
            className={`calendar-cell${value ? (value.netPnlMinor > 0 ? " positive" : value.netPnlMinor < 0 ? " negative" : "") : ""}`}
            key={key}
          >
            <div className="calendar-day">{date.getDate()}</div>
            {value && (
              <>
                <div
                  className={`calendar-value ${value.netPnlMinor >= 0 ? "positive-text" : "negative-text"}`}
                >
                  {formatMoneyMinor(value.netPnlMinor)}
                </div>
                <div className="calendar-meta">
                  {formatR(value.totalR)} · {value.trades} T
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 9 }}>
        {label}
      </div>
      <div
        className={tone ? `${tone}-text` : ""}
        style={{ fontSize: 13, fontWeight: 720, marginTop: 5 }}
      >
        {value}
      </div>
    </div>
  );
}

function equityOption(metrics: DashboardMetrics): EChartsOption {
  return {
    tooltip: { ...tooltip, trigger: "axis" },
    grid: chartGrid,
    xAxis: {
      type: "category",
      data: metrics.equityCurve.map((point) =>
        new Date(point.date).toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "2-digit",
        }),
      ),
      axisLabel,
      axisLine,
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        ...axisLabel,
        formatter: (value: number) => `${number.format(value / 100)} €`,
      },
      splitLine,
      axisLine: { show: false },
    },
    series: [
      {
        type: "line",
        data: metrics.equityCurve.map((point) => point.cumulativePnlMinor),
        smooth: 0.28,
        showSymbol: false,
        lineStyle: { color: "#5b68ff", width: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(84,91,255,.48)" },
              { offset: 1, color: "rgba(84,91,255,.015)" },
            ],
          },
        },
      },
    ],
  };
}
function donutOption(metrics: DashboardMetrics): EChartsOption {
  return {
    tooltip,
    series: [
      {
        type: "pie",
        radius: ["68%", "84%"],
        center: ["44%", "50%"],
        avoidLabelOverlap: true,
        label: {
          show: true,
          position: "center",
          formatter: `{value|${metrics.totalTrades}}\n{label|Trades}`,
          rich: {
            value: { color: "#fff", fontSize: 27, fontWeight: 700 },
            label: { color: "#71829a", fontSize: 10, lineHeight: 18 },
          },
        },
        data: [
          {
            value: metrics.wins,
            name: "Gewonnen",
            itemStyle: { color: "#37d481" },
          },
          {
            value: metrics.losses,
            name: "Verloren",
            itemStyle: { color: "#ff5e6c" },
          },
          {
            value: metrics.breakEven,
            name: "Break-even",
            itemStyle: { color: "#64748b" },
          },
        ],
      },
    ],
  };
}
function distributionOption(metrics: DashboardMetrics): EChartsOption {
  const values = metrics.equityCurve.map(
    (point, index) =>
      (point.cumulativePnlMinor -
        (metrics.equityCurve[index - 1]?.cumulativePnlMinor ?? 0)) /
      100,
  );
  const buckets = [
    values.filter((value) => value < -500).length,
    values.filter((value) => value >= -500 && value < 0).length,
    values.filter((value) => value === 0).length,
    values.filter((value) => value > 0 && value <= 500).length,
    values.filter((value) => value > 500).length,
  ];
  return barOption(
    ["< -500 €", "-500–0 €", "0 €", "0–500 €", "> 500 €"],
    buckets,
    true,
  );
}
function barOption(
  labels: string[],
  values: number[],
  count = false,
): EChartsOption {
  return {
    tooltip: { ...tooltip, trigger: "axis" },
    grid: { left: 42, right: 12, top: 16, bottom: 35 },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel,
      axisLine,
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { ...axisLabel, formatter: count ? "{value}" : "{value} €" },
      splitLine,
      axisLine: { show: false },
    },
    series: [
      {
        type: "bar",
        data: values.map((value) => ({
          value,
          itemStyle: {
            color: value >= 0 ? "#35c875" : "#ef5062",
            borderRadius: [3, 3, 0, 0],
          },
        })),
        barMaxWidth: 32,
      },
    ],
  };
}
