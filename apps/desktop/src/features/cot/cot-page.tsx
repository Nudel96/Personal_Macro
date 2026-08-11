import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EChartsOption } from "echarts";
import { DatabaseZap, ExternalLink, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import {
  BaseChart,
  axisLabel,
  axisLine,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { PageHeader } from "../../components/ui/page-header";
import { DataStatusStrip } from "../../components/ui/data-status-strip";
import { number, percent } from "../../lib/utils";
import { api } from "../../services/commands";
import type { CotAssetDetail } from "../../types/domain";
import { CotOverview, CotPairDetail, CotPairHeatmap } from "./cot-components";

const lookbacks = [
  { label: "1 Jahr", value: 52 },
  { label: "3 Jahre", value: 156 },
  { label: "5 Jahre", value: 260 },
  { label: "10 Jahre", value: 520 },
  { label: "15 Jahre", value: 780 },
  { label: "Gesamt", value: 0 },
];

export function CotPage() {
  const client = useQueryClient();
  const [assetClass, setAssetClass] = useState("Alle");
  const [symbol, setSymbol] = useState<string>();
  const [lookback, setLookback] = useState(156);
  const [pair, setPair] = useState<[string, string]>(["EUR", "USD"]);
  const dashboard = useQuery({
    queryKey: ["cot"],
    queryFn: api.cotDashboard,
    refetchInterval: 60_000,
  });
  const seasonality = useQuery({
    queryKey: ["seasonality"],
    queryFn: api.seasonality,
  });
  const sync = useMutation({
    mutationFn: api.syncCot,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["cot"] });
      client.invalidateQueries({ queryKey: ["macro"] });
    },
  });
  const contracts = useMemo(
    () =>
      dashboard.data?.contracts.filter(
        (item) => assetClass === "Alle" || item.assetClass === assetClass,
      ) ?? [],
    [dashboard.data, assetClass],
  );
  const activeSymbol = symbol ?? contracts[0]?.symbol;
  const detail = useQuery({
    queryKey: ["cot", "asset", activeSymbol, lookback],
    queryFn: () =>
      api.cotAssetDetail({
        symbol: activeSymbol!,
        participantGroup: "Non-Commercial",
        lookbackWeeks: lookback,
      }),
    enabled: Boolean(activeSymbol),
    retry: false,
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
        <ErrorState message="COT-Daten konnten nicht geladen werden." />
      </div>
    );

  const classes = [
    "Alle",
    ...new Set(dashboard.data.contracts.map((item) => item.assetClass)),
  ];
  const selectedPair = dashboard.data.pairs.find(
    (item) => item.base === pair[0] && item.quote === pair[1],
  );
  const hasObservations = dashboard.data.contracts.some(
    (item) => item.reportDate != null,
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="Marktkontext"
        title="COT-Positionierungs-Kontext"
        description="Offizieller CFTC Legacy Futures Only Report, Teilnehmergruppe Non-Commercial. Die Dienstag-Daten werden in der Regel am Freitag veröffentlicht und dienen als Kontext und Bestätigung, nicht als Handelsaufforderung."
        actions={
          <>
            <Badge
              className={dashboard.data.lastSyncedAt ? "positive" : "warning"}
            >
              {dashboard.data.lastSyncedAt
                ? "CFTC synchronisiert"
                : "Noch nicht synchronisiert"}
            </Badge>
            <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw size={14} />{" "}
              {sync.isPending ? "CFTC wird geladen …" : "COT aktualisieren"}
            </Button>
          </>
        }
      />
      {sync.isError && (
        <div className="notice negative" role="alert">
          Die CFTC-Daten konnten nicht aktualisiert werden. Bereits vorhandene,
          unveränderte COT-Daten bleiben erhalten.
        </div>
      )}
      <DataStatusStrip
        status={
          dashboard.data.lastSyncedAt
            ? "CFTC-Daten verfügbar"
            : "Noch keine CFTC-Daten"
        }
        quality={hasObservations ? "Historie vorhanden" : "Nicht verfügbar"}
        detail={
          hasObservations
            ? "Kontrakt und Zeitraum wählen"
            : "Offizielle CFTC-Historie laden"
        }
        action={
          <Button
            size="sm"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
          >
            {sync.isPending ? "Lädt …" : "Jetzt laden"}
          </Button>
        }
      />
      <div className="cot-deep-toolbar card">
        <div className="segmented">
          {classes.map((value) => (
            <button
              key={value}
              className={assetClass === value ? "active" : ""}
              onClick={() => {
                setAssetClass(value);
                setSymbol(undefined);
              }}
            >
              {value}
            </button>
          ))}
        </div>
        <select
          aria-label="CFTC-Kontrakt"
          value={activeSymbol ?? ""}
          onChange={(event) => {
            setSymbol(event.target.value);
          }}
        >
          {contracts.map((item) => (
            <option value={item.symbol} key={item.symbol}>
              {item.displayName}
            </option>
          ))}
        </select>
        <div className="toolbar-spacer" />
        <div className="segmented">
          {lookbacks.map((item) => (
            <button
              key={item.value}
              className={lookback === item.value ? "active" : ""}
              onClick={() => setLookback(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {!hasObservations ? (
        <EmptyState
          icon={DatabaseZap}
          title="COT-Historie noch nicht vorhanden"
          description="Lade die offiziellen CFTC-Reports. Die App speichert ausschließlich CFTC-Futuresdaten und zeigt fehlende Historie nicht als Nullwert."
          action={
            <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
              CFTC-Daten laden
            </Button>
          }
        />
      ) : detail.isLoading ? (
        <PageLoading />
      ) : detail.data ? (
        <CotDetail
          detail={detail.data}
          brokerSymbols={
            seasonality.data?.assets.map((item) => item.symbol) ?? []
          }
          onLinked={() =>
            client.invalidateQueries({ queryKey: ["cot", "asset"] })
          }
        />
      ) : (
        <EmptyState
          icon={DatabaseZap}
          title="COT-Detaildaten nicht verfügbar"
          description="Für diesen CFTC-Kontrakt liegt noch keine auswertbare Historie vor."
        />
      )}
      <div className="grid macro-layout" style={{ marginTop: 14 }}>
        <Card>
          <CardHeader
            title="COT-Währungsmatrix"
            subtitle="Der Macro-Faktor nutzt für alle Märkte Legacy Futures Only · Non-Commercial."
          />
          <CardContent>
            <div className="macro-heatmap-wrap">
              <CotPairHeatmap
                pairs={dashboard.data.pairs}
                selected={pair}
                onSelect={setPair}
              />
            </div>
          </CardContent>
        </Card>
        <CotPairDetail pair={selectedPair} selected={pair} />
      </div>
      <CotOverview dashboard={dashboard.data} />
      <Card>
        <CardHeader
          title="Datenherkunft"
          subtitle="CFTC Commitments of Traders: offizielle Futures-Positionierung, kein CFD-Orderflow."
        />
        <CardContent>
          <a
            className="button button-ghost"
            href={dashboard.data.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={14} /> Offizielle CFTC-Quelle öffnen
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

function CotDetail({
  detail,
  brokerSymbols,
  onLinked,
}: {
  detail: CotAssetDetail;
  brokerSymbols: string[];
  onLinked: () => void;
}) {
  const [brokerSymbol, setBrokerSymbol] = useState("");
  const link = useMutation({
    mutationFn: api.linkCotBrokerSymbol,
    onSuccess: onLinked,
  });
  const positioning = detail.assessment.components.find(
    (item) => item.key === "positioning",
  );
  const flow = detail.assessment.components.find(
    (item) => item.key === "flow_4w",
  );
  return (
    <>
      <div className="cot-group-selector">
        {detail.groups.map((item) => (
          <button
            key={item.participantGroup}
            className={
              detail.participantGroup === item.participantGroup ? "active" : ""
            }
            type="button"
          >
            <strong>{item.participantGroup}</strong>
            <span>
              Long-Anteil {fmtPct(item.longShare)} · Z {fmt(item.zScore)}
            </span>
          </button>
        ))}
      </div>
      <div className="grid stats-grid" style={{ margin: "14px 0" }}>
        <Metric
          label="COT-Bias"
          value={detail.assessment.biasLabel}
          detail={`${detail.assessment.status} · ${detail.assessment.quality}`}
          tone={
            detail.assessment.biasSignal === 1
              ? "positive"
              : detail.assessment.biasSignal === -1
                ? "negative"
                : undefined
          }
        />
        <Metric
          label="Non-Commercial-Long-Anteil"
          value={fmtPct(detail.longShare)}
          detail={`Wochen-Δ ${fmtPp(detail.weeklyLongShareChange)}`}
          tone={
            (detail.weeklyLongShareChange ?? 0) > 0
              ? "positive"
              : (detail.weeklyLongShareChange ?? 0) < 0
                ? "negative"
                : undefined
          }
        />
        <Metric
          label="Positionierung"
          value={
            positioning?.percentile == null
              ? "—"
              : `P${Math.round(positioning.percentile * 100)}`
          }
          detail="Non-Commercial-Long-Anteil im rollierenden Fenster (max. 5 Jahre)"
          tone={
            positioning?.signal === 1
              ? "positive"
              : positioning?.signal === -1
                ? "negative"
                : undefined
          }
        />
        <Metric
          label="Kapitalfluss"
          value={
            flow?.percentile == null
              ? "—"
              : `P${Math.round(flow.percentile * 100)}`
          }
          detail="4-Wochen-Veränderung des Non-Commercial-Long-Anteils"
          tone={
            flow?.signal === 1
              ? "positive"
              : flow?.signal === -1
                ? "negative"
                : undefined
          }
        />
        <Metric
          label="Crowding-Risiko"
          value={detail.assessment.crowdingStatus}
          detail="Extrem ist eine Warnung, kein Gegensignal"
        />
      </div>
      <div className="notice" style={{ marginBottom: 14 }}>
        <strong>Warum diese Einordnung:</strong>
        <ul>
          {detail.assessment.why.slice(0, 3).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <small>
          Stand: Dienstag-Open-Interest; CFTC veröffentlicht die Daten
          gewöhnlich am Freitag. COT ist Positionierungs-Kontext, keine
          Handelsaufforderung.
        </small>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card>
          <CardHeader
            title="Non-Commercial-Long-Anteil"
            subtitle={`${detail.displayName} · Legacy Futures Only · ${detail.participantGroup}`}
          />
          <CardContent>
            <BaseChart option={netOption(detail)} height={280} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Z-Score und COT-Index"
            subtitle="Z-Score ab 52 Wochen; COT-Index im gewählten Lookback"
          />
          <CardContent>
            <BaseChart option={zOption(detail)} height={280} />
          </CardContent>
        </Card>
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}
      >
        <Card>
          <CardHeader
            title="Long und Short"
            subtitle="Absolute Kontraktpositionen"
          />
          <CardContent>
            <BaseChart option={longShortOption(detail)} height={260} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Aktive Teilnehmergruppe"
            subtitle="Aktueller Long-Anteil aus Long und Short"
          />
          <CardContent>
            <BaseChart option={groupOption(detail)} height={260} />
          </CardContent>
        </Card>
      </div>
      <div className="notice" style={{ marginTop: 14 }}>
        <strong>Interpretation:</strong> Der Z-Score vergleicht die aktuelle
        Non-Commercial-Long-Quote mit der gewählten Historie.{" "}
        {detail.brokerSymbol
          ? ` Preisvergleich ist mit ${detail.brokerSymbol} verknüpft.`
          : " Ein Preisvergleich erscheint erst nach einer expliziten BlackBull–CFTC-Zuordnung."}
      </div>
      <Card style={{ marginTop: 14 }}>
        <CardHeader
          title="Historische ähnliche COT-Zustände"
          subtitle={detail.historicalOutcomes.reason}
        />
        <CardContent>
          {detail.historicalOutcomes.windows.length ? (
            <div className="grid stats-grid">
              {detail.historicalOutcomes.windows.map((item) => (
                <Metric
                  key={item.weeks}
                  label={`${item.weeks}-Wochen-Outcome`}
                  value={
                    item.medianReturn == null
                      ? "—"
                      : percent.format(item.medianReturn)
                  }
                  detail={
                    item.hitRate == null
                      ? `${item.sampleSize} Fälle (mind. 30 erforderlich)`
                      : `${item.sampleSize} Fälle · Trefferquote ${percent.format(item.hitRate)}`
                  }
                />
              ))}
            </div>
          ) : (
            <div className="empty-copy">
              Keine Preisreihe oder kein bestätigter COT-Bias verfügbar.
            </div>
          )}
        </CardContent>
      </Card>
      {!detail.brokerSymbol && brokerSymbols.length > 0 && (
        <div className="cot-link-row">
          <select
            aria-label="Broker-Asset zuordnen"
            value={brokerSymbol}
            onChange={(event) => setBrokerSymbol(event.target.value)}
          >
            <option value="">BlackBull-Asset zuordnen …</option>
            {brokerSymbols.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <Button
            disabled={!brokerSymbol || link.isPending}
            onClick={() => link.mutate({ symbol: detail.symbol, brokerSymbol })}
          >
            Zuordnung speichern
          </Button>
        </div>
      )}
    </>
  );
}

function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "positive" | "negative";
}) {
  return (
    <Card className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${tone ? `${tone}-text` : ""}`}>{value}</div>
      <div className="kpi-meta">{detail}</div>
    </Card>
  );
}
function fmt(value?: number | null) {
  return value == null ? "—" : number.format(value);
}
function fmtPct(value?: number | null) {
  return value == null ? "—" : percent.format(value);
}
function fmtPp(value?: number | null) {
  if (value == null) return "—";
  const formatted = (value * 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value > 0 ? "+" : ""}${formatted} PP`;
}
function dates(detail: CotAssetDetail) {
  return detail.series.map((item) => item.reportDate.slice(2));
}
function netOption(detail: CotAssetDetail): EChartsOption {
  const hasPrice = detail.series.some((item) => item.brokerPrice != null);
  return {
    tooltip: { ...tooltip, trigger: "axis" },
    grid: { left: 58, right: hasPrice ? 58 : 14, top: 18, bottom: 30 },
    xAxis: {
      type: "category",
      data: dates(detail),
      axisLabel,
      axisLine,
      axisTick: { show: false },
    },
    yAxis: hasPrice
      ? [
          {
            type: "value",
            axisLabel: {
              ...axisLabel,
              formatter: (value: number) => `${(value * 100).toFixed(0)}%`,
            },
            splitLine,
          },
          { type: "value", axisLabel, splitLine: { show: false } },
        ]
      : {
          type: "value",
          axisLabel: {
            ...axisLabel,
            formatter: (value: number) => `${(value * 100).toFixed(0)}%`,
          },
          splitLine,
        },
    series: [
      {
        name: "Long-Anteil",
        type: "line",
        data: detail.series.map((item) => item.longShare),
        symbol: "none",
        smooth: true,
        lineStyle: { color: "#52c5ff", width: 2 },
        areaStyle: { color: "rgba(82,197,255,.12)" },
        markLine: { silent: true, data: [{ yAxis: 0.5 }] },
      },
      ...(hasPrice
        ? [
            {
              name: "BlackBull Preis",
              type: "line" as const,
              yAxisIndex: 1,
              data: detail.series.map((item) => item.brokerPrice),
              symbol: "none",
              lineStyle: { color: "#f7b84b", width: 1.5 },
            },
          ]
        : []),
    ],
  };
}
function zOption(detail: CotAssetDetail): EChartsOption {
  return {
    tooltip: { ...tooltip, trigger: "axis" },
    grid: { left: 44, right: 44, top: 18, bottom: 30 },
    xAxis: {
      type: "category",
      data: dates(detail),
      axisLabel,
      axisLine,
      axisTick: { show: false },
    },
    yAxis: [
      { type: "value", axisLabel, splitLine },
      { type: "value", min: 0, max: 100, axisLabel },
    ],
    series: [
      {
        name: "Z-Score",
        type: "line",
        data: detail.series.map((item) => item.zScore),
        symbol: "none",
        lineStyle: { color: "#b084ff", width: 2 },
        markLine: {
          silent: true,
          data: [{ yAxis: 0 }, { yAxis: 2 }, { yAxis: -2 }],
        },
      },
      {
        name: "COT-Index",
        type: "line",
        yAxisIndex: 1,
        data: detail.series.map((item) => item.cotIndex),
        symbol: "none",
        lineStyle: { color: "#f7b84b", width: 1.5 },
      },
    ],
  };
}
function longShortOption(detail: CotAssetDetail): EChartsOption {
  return {
    tooltip: { ...tooltip, trigger: "axis" },
    grid: { left: 58, right: 14, top: 18, bottom: 30 },
    xAxis: {
      type: "category",
      data: dates(detail),
      axisLabel,
      axisLine,
      axisTick: { show: false },
    },
    yAxis: { type: "value", axisLabel, splitLine },
    series: [
      {
        name: "Long",
        type: "line",
        data: detail.series.map((item) => item.longPositions),
        symbol: "none",
        lineStyle: { color: "#37d481" },
      },
      {
        name: "Short",
        type: "line",
        data: detail.series.map((item) => item.shortPositions),
        symbol: "none",
        lineStyle: { color: "#ff5e6c" },
      },
    ],
  };
}
function groupOption(detail: CotAssetDetail): EChartsOption {
  return {
    tooltip: { ...tooltip },
    grid: { left: 110, right: 20, top: 12, bottom: 20 },
    xAxis: {
      type: "value",
      axisLabel: {
        ...axisLabel,
        formatter: (value: number) => `${(value * 100).toFixed(0)}%`,
      },
      splitLine,
    },
    yAxis: {
      type: "category",
      data: detail.groups.map((item) => item.participantGroup),
      axisLabel,
      axisLine,
    },
    series: [
      {
        type: "bar",
        data: detail.groups.map((item) => ({
          value: item.longShare,
          itemStyle: {
            color: (item.longShare ?? 0) >= 0.5 ? "#37d481" : "#ff5e6c",
          },
        })),
      },
    ],
  };
}
