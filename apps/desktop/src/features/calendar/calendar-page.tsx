import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
} from "date-fns";
import { de } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { PageHeader } from "../../components/ui/page-header";
import { formatMoneyMinor, formatR } from "../../lib/utils";
import { api } from "../../services/commands";
import { useUiStore } from "../../stores/ui-store";
import type { CalendarDay } from "../../types/domain";

export function CalendarPage() {
  const [month, setMonth] = useState(() => new Date());
  const setQuickTradeOpen = useUiStore((state) => state.setQuickTradeOpen);
  const filter = useMemo(
    () => ({
      dateFrom: startOfMonth(month).toISOString(),
      dateTo: endOfMonth(month).toISOString(),
    }),
    [month],
  );
  const dashboard = useQuery({
    queryKey: ["dashboard", "calendar", filter],
    queryFn: () => api.dashboard(filter),
  });
  const year = month.getFullYear();
  const annual = useQuery({
    queryKey: ["dashboard", "calendar-year", year],
    queryFn: () =>
      api.dashboard({
        dateFrom: new Date(year, 0, 1).toISOString(),
        dateTo: new Date(year, 11, 31, 23, 59, 59).toISOString(),
      }),
  });
  const data = new Map(
    dashboard.data?.calendar.map((day) => [day.date, day]) ?? [],
  );
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const cells: (Date | null)[] = Array.from(
    { length: (start.getDay() + 6) % 7 },
    () => null,
  );
  for (let day = 1; day <= end.getDate(); day += 1)
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));

  return (
    <div className="page">
      <PageHeader
        eyebrow="Tradingjournal"
        title="Performance-Kalender"
        description="Tägliche Ergebnisse, R-Multiples und Trade-Aktivität im Monatskontext."
        actions={
          <>
            <Button onClick={() => setMonth(new Date())}>Heute</Button>
            <Button variant="primary" onClick={() => setQuickTradeOpen(true)}>
              <Plus size={15} /> Trade hinzufügen
            </Button>
          </>
        }
      />
      <Card>
        <CardHeader
          title={format(month, "MMMM yyyy", { locale: de })}
          subtitle="Zellen basieren auf dem gespeicherten Ausstiegsdatum"
          action={
            <div className="page-actions">
              <Button
                size="icon"
                onClick={() => setMonth((value) => subMonths(value, 1))}
              >
                <ChevronLeft size={15} />
              </Button>
              <Button
                size="icon"
                onClick={() => setMonth((value) => addMonths(value, 1))}
              >
                <ChevronRight size={15} />
              </Button>
            </div>
          }
        />
        <CardContent>
          {dashboard.isLoading ? (
            <PageLoading />
          ) : dashboard.isError ? (
            <ErrorState message="Kalender konnte nicht geladen werden." />
          ) : !dashboard.data?.calendar.length ? (
            <EmptyState
              icon={CalendarDays}
              title="Dieser Monat ist noch leer"
              description="Geschlossene Trades erscheinen am Tag ihres Ausstiegs. Es werden keine fehlenden Tage künstlich aufgefüllt."
              action={
                <Button
                  variant="primary"
                  onClick={() => setQuickTradeOpen(true)}
                >
                  <Plus size={14} /> Trade erfassen
                </Button>
              }
            />
          ) : (
            <div
              className="calendar-grid calendar-grid--month"
              aria-label={`Performance-Kalender ${format(month, "MMMM yyyy", { locale: de })}`}
            >
              {[
                "Montag",
                "Dienstag",
                "Mittwoch",
                "Donnerstag",
                "Freitag",
                "Samstag",
                "Sonntag",
              ].map((day) => (
                <div className="calendar-weekday" key={day}>
                  {day}
                </div>
              ))}
              {cells.map((date, index) => {
                if (!date)
                  return (
                    <div
                      key={`empty-${index}`}
                      aria-hidden="true"
                      className="calendar-cell is-empty"
                    />
                  );
                const key = format(date, "yyyy-MM-dd");
                const day = data.get(key);
                return (
                  <div
                    key={key}
                    className={`calendar-cell${day ? (day.netPnlMinor > 0 ? " positive" : day.netPnlMinor < 0 ? " negative" : "") : ""}`}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span className="calendar-day">{date.getDate()}</span>
                      {day && (
                        <Badge
                          className={
                            day.netPnlMinor >= 0 ? "positive" : "negative"
                          }
                        >
                          {day.trades} {day.trades === 1 ? "Trade" : "Trades"}
                        </Badge>
                      )}
                    </div>
                    {day && (
                      <>
                        <div
                          className={`calendar-value ${day.netPnlMinor >= 0 ? "positive-text" : "negative-text"}`}
                          style={{ fontSize: 15 }}
                        >
                          {formatMoneyMinor(day.netPnlMinor)}
                        </div>
                        <div className="calendar-meta">
                          {formatR(day.totalR)} · {day.wins} W / {day.losses} L
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <Card style={{ marginTop: 14 }}>
        <CardHeader
          title={`Jahres-Heatmap ${year}`}
          subtitle="Jeder Tag zeigt das aggregierte Netto-P&L; grün positiv, rot negativ."
        />
        <CardContent>
          {annual.isLoading ? (
            <PageLoading />
          ) : (
            <YearHeatmap year={year} days={annual.data?.calendar ?? []} />
          )}
        </CardContent>
      </Card>
      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(4, 1fr)", marginTop: 14 }}
      >
        <Summary
          label="Monats-P&L"
          value={formatMoneyMinor(dashboard.data?.metrics.netPnlMinor)}
          tone={
            (dashboard.data?.metrics.netPnlMinor ?? 0) >= 0
              ? "positive"
              : "negative"
          }
        />
        <Summary
          label="Total R"
          value={formatR(dashboard.data?.metrics.totalR.value)}
          tone={
            (dashboard.data?.metrics.totalR.value ?? 0) >= 0
              ? "positive"
              : "negative"
          }
        />
        <Summary
          label="Handelstage"
          value={String(dashboard.data?.calendar.length ?? 0)}
        />
        <Summary
          label="Trades"
          value={String(dashboard.data?.metrics.totalTrades ?? 0)}
        />
      </div>
    </div>
  );
}

function YearHeatmap({ year, days }: { year: number; days: CalendarDay[] }) {
  const values = new Map(days.map((day) => [day.date, day]));
  const maximum = Math.max(1, ...days.map((day) => Math.abs(day.netPnlMinor)));
  const months = Array.from(
    { length: 12 },
    (_, month) => new Date(year, month, 1),
  );
  return (
    <div className="year-heatmap">
      <div className="year-heatmap-head">
        <span />
        <>
          {Array.from({ length: 31 }, (_, day) => (
            <span key={day}>{String(day + 1).padStart(2, "0")}</span>
          ))}
        </>
      </div>
      {months.map((month) => (
        <div className="year-heatmap-row" key={month.getMonth()}>
          <strong>{format(month, "MMM", { locale: de })}</strong>
          {Array.from({ length: 31 }, (_, index) => {
            const date = new Date(year, month.getMonth(), index + 1);
            if (date.getMonth() !== month.getMonth())
              return <span key={index} className="year-day missing" />;
            const key = format(date, "yyyy-MM-dd");
            const day = values.get(key);
            const opacity = day
              ? 0.18 + Math.min(1, Math.abs(day.netPnlMinor) / maximum) * 0.82
              : 0;
            return (
              <span
                key={index}
                className="year-day"
                title={
                  day
                    ? `${key}: ${formatMoneyMinor(day.netPnlMinor)} · ${day.trades} Trades`
                    : `${key}: kein Trade`
                }
                style={{
                  background: day
                    ? day.netPnlMinor > 0
                      ? `rgba(49,211,139,${opacity})`
                      : day.netPnlMinor < 0
                        ? `rgba(255,83,107,${opacity})`
                        : "rgba(113,130,154,.35)"
                    : undefined,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <Card className="kpi-card" style={{ minHeight: 95 }}>
      <div className="kpi-label">{label}</div>
      <div
        className={`kpi-value${tone ? ` ${tone}-text` : ""}`}
        style={{ fontSize: 21 }}
      >
        {value}
      </div>
    </Card>
  );
}
