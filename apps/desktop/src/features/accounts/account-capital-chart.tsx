import { useState } from "react";
import type { EChartsOption } from "echarts";
import {
  BaseChart,
  axisLabel,
  axisLine,
  chartGrid,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { dateTime } from "../../lib/utils";
import { accountMoney, useAccountJournal } from "./use-account-journal";

export function AccountCapitalChart({ accountId }: { accountId: string }) {
  const query = useAccountJournal(accountId);
  const [view, setView] = useState<"capital" | "pnl">("capital");
  const data = query.data;
  const points = data?.capitalCurve ?? [];
  const option: EChartsOption = {
    grid: { ...chartGrid, left: 84, right: 20, bottom: 34 },
    tooltip: {
      ...tooltip,
      trigger: "axis",
      renderMode: "richText",
      formatter: (params: unknown) => {
        const item = (Array.isArray(params) ? params[0] : params) as {
          dataIndex?: number;
        };
        const point = points[item?.dataIndex ?? -1];
        if (!point || !data) return "";
        return `${point.label}${point.occurredAt ? " · " + dateTime(point.occurredAt) : " · vor dem ersten Eintrag"}\nKontokapital: ${accountMoney(point.balanceMinor, data.currency)}\nTrading-P&L: ${accountMoney(point.cumulativePnlMinor, data.currency)}\nBetrag: ${accountMoney(point.changeMinor, data.currency)}`;
      },
    },
    xAxis: {
      type: "category",
      boundaryGap: true,
      data: points.map((point) =>
        point.occurredAt
          ? new Date(point.occurredAt).toLocaleDateString("de-DE", {
              day: "2-digit",
              month: "2-digit",
            })
          : "Start",
      ),
      axisLabel,
      axisLine,
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: {
        ...axisLabel,
        formatter: (value: number) =>
          accountMoney(value * 100, data?.currency ?? "EUR"),
      },
      splitLine,
    },
    series: [
      {
        name: view === "capital" ? "Kontokapital" : "Trading-P&L",
        type: "line",
        smooth: false,
        showSymbol: points.length <= 30,
        symbolSize: 7,
        data: points.map(
          (point) =>
            (view === "capital"
              ? point.balanceMinor
              : point.cumulativePnlMinor) / 100,
        ),
        lineStyle: { color: "#7b87ff", width: 2.5 },
        itemStyle: { color: "#9ba4ff" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(111,127,255,.22)" },
              { offset: 1, color: "rgba(111,127,255,.01)" },
            ],
          },
        },
      },
    ],
  };
  return (
    <Card className="account-capital-chart">
      <CardHeader
        title="Deine Kapitalentwicklung"
        subtitle="Gesamtes Konto · unabhängig vom Zeitraumfilter"
        action={
          <div className="segmented" aria-label="Kapitalverlauf">
            <button
              type="button"
              className={view === "capital" ? "active" : ""}
              aria-pressed={view === "capital"}
              onClick={() => setView("capital")}
            >
              Kontokapital
            </button>
            <button
              type="button"
              className={view === "pnl" ? "active" : ""}
              aria-pressed={view === "pnl"}
              onClick={() => setView("pnl")}
            >
              Trading-P&L
            </button>
          </div>
        }
      />
      <CardContent>
        {query.isPending ? (
          <PageLoading />
        ) : query.isError ? (
          <ErrorState message="Der Kapitalverlauf konnte nicht geladen werden." />
        ) : (
          <>
            <div className="capital-chart-value">
              <strong>
                {accountMoney(
                  view === "capital"
                    ? data?.journalBalanceMinor
                    : data?.netPnlMinor,
                  data?.currency ?? "EUR",
                )}
              </strong>
              <span>
                {view === "capital"
                  ? "inklusive Startkapital und Geldbewegungen"
                  : "nur realisierte Trade-Ergebnisse nach Kosten"}
              </span>
            </div>
            <BaseChart option={option} height={250} />
            <p className="capital-chart-note">
              {points.length === 1
                ? "Dein Startkapital ist bereits erfasst. Der erste Trade setzt die Kurve von hier aus fort."
                : "Ein- und Auszahlungen verändern das Kapital. Sie zählen nicht als Trading-Gewinn oder -Verlust."}
              {data?.missingPnlTrades
                ? ` ${data.missingPnlTrades} Trades ohne Ergebnis sind noch nicht im P&L enthalten.`
                : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
