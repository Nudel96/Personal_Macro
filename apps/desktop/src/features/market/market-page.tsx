import {
  CandlestickSeries,
  ColorType,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";
import { RefreshCw, Search, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { PageHeader } from "../../components/ui/page-header";
import { dateTime } from "../../lib/utils";
import { api } from "../../services/commands";
import type { Candle, MarketTimeframe } from "../../types/domain";

const timeframes: MarketTimeframe[] = [
  "M1",
  "M5",
  "M15",
  "M30",
  "H1",
  "H4",
  "D1",
  "W1",
];

export function MarketPage() {
  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState<MarketTimeframe>("H1");
  const [search, setSearch] = useState("");
  const statusQuery = useQuery({
    queryKey: ["market", "status"],
    queryFn: api.marketStatus,
    refetchInterval: 15_000,
  });
  const symbolsQuery = useQuery({
    queryKey: ["market", "symbols"],
    queryFn: api.marketSymbols,
    enabled: statusQuery.data?.connected === true,
    staleTime: 60_000,
  });
  const candlesQuery = useQuery({
    queryKey: ["market", "candles", symbol, timeframe],
    queryFn: () => api.marketCandles(symbol, timeframe),
    enabled: Boolean(symbol && statusQuery.data?.connected),
    refetchInterval: 2_000,
  });
  const quoteQuery = useQuery({
    queryKey: ["market", "quote", symbol],
    queryFn: () => api.marketQuote(symbol),
    enabled: Boolean(symbol && statusQuery.data?.connected),
    refetchInterval: 2_000,
  });

  const symbols = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (symbolsQuery.data ?? []).filter(
      (item) =>
        !needle ||
        `${item.symbol} ${item.description ?? ""} ${item.path ?? ""}`
          .toLowerCase()
          .includes(needle),
    );
  }, [search, symbolsQuery.data]);
  const grouped = useMemo(
    () =>
      symbols.reduce<Record<string, typeof symbols>>((groups, item) => {
        (groups[item.category] ??= []).push(item);
        return groups;
      }, {}),
    [symbols],
  );
  useEffect(() => {
    if (!symbol && symbolsQuery.data?.length) {
      setSymbol(
        symbolsQuery.data.find((item) => item.category === "Forex")?.symbol ??
          symbolsQuery.data[0].symbol,
      );
    }
  }, [symbol, symbolsQuery.data]);

  const status = statusQuery.data;
  const currentCandle = candlesQuery.data?.[candlesQuery.data.length - 1];
  return (
    <div className="page market-page">
      <PageHeader
        title="Live Chart"
        description="Read-only BlackBull-MT5-Kurse aus deinem lokal angemeldeten Terminal."
        actions={
          <Button onClick={() => void statusQuery.refetch()}>
            <RefreshCw size={14} /> Verbindung prüfen
          </Button>
        }
      />
      <div className="market-status-row">
        <Badge className={status?.connected ? "positive" : "warning"}>
          {status?.connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          {status?.connected
            ? "BlackBull MT5 verbunden"
            : "MT5 nicht verbunden"}
        </Badge>
        {status?.accountServer && <span>Server: {status.accountServer}</span>}
        {status?.accountLogin && <span>Login: {status.accountLogin}</span>}
        {status?.accountCurrency && status.equity != null && (
          <span>
            Equity:{" "}
            {status.equity.toLocaleString("de-DE", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            {status.accountCurrency}
          </span>
        )}
        <span>
          Letzte Prüfung:{" "}
          {status?.lastUpdate ? dateTime(status.lastUpdate) : "—"}
        </span>
      </div>
      {!status?.connected ? (
        <SetupState message={status?.message} />
      ) : (
        <div className="market-layout">
          <Card className="market-symbol-card">
            <CardHeader
              title="BlackBull-Symbole"
              subtitle="Direkt aus deinem MT5 Market Watch"
            />
            <CardContent>
              <label className="market-search">
                <Search size={14} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Symbol suchen"
                />
              </label>
              <div className="market-symbols">
                {symbolsQuery.isLoading ? (
                  <p>Symbole werden geladen …</p>
                ) : (
                  Object.entries(grouped).map(([category, items]) => (
                    <section key={category}>
                      <h3>{category}</h3>
                      {items.map((item) => (
                        <button
                          key={item.symbol}
                          className={symbol === item.symbol ? "active" : ""}
                          onClick={() => setSymbol(item.symbol)}
                        >
                          <strong>{item.symbol}</strong>
                          <small>{item.description ?? item.path ?? ""}</small>
                        </button>
                      ))}
                    </section>
                  ))
                )}
                {!symbolsQuery.isLoading && !symbols.length && (
                  <p>Keine passenden BlackBull-Symbole gefunden.</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="market-chart-card">
            <CardHeader
              title={symbol ? `Trading HUD · ${symbol}` : "Wähle ein Symbol"}
              subtitle={
                symbol
                  ? `${timeframe} · Tick-Volumen, falls kein reales Volumen vorliegt`
                  : "Wähle links ein tatsächliches BlackBull-Symbol aus."
              }
            />
            <CardContent>
              <div className="market-toolbar">
                <div className="segmented">
                  {timeframes.map((item) => (
                    <button
                      key={item}
                      className={item === timeframe ? "active" : ""}
                      onClick={() => setTimeframe(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                {quoteQuery.data && (
                  <div className="market-quote">
                    <span>Bid {formatQuote(quoteQuery.data.bid)}</span>
                    <span>Ask {formatQuote(quoteQuery.data.ask)}</span>
                  </div>
                )}
              </div>
              {currentCandle && (
                <div
                  className="market-ohlc-hud"
                  aria-label="Aktuelle OHLC-Daten"
                >
                  <HudValue label="Open" value={currentCandle.open} />
                  <HudValue label="High" value={currentCandle.high} />
                  <HudValue label="Low" value={currentCandle.low} />
                  <HudValue label="Close" value={currentCandle.close} />
                  <HudValue
                    label={
                      currentCandle.volumeKind === "real"
                        ? "Volumen"
                        : "Tick-Volumen"
                    }
                    value={currentCandle.volume}
                    digits={0}
                  />
                  <span className="market-candle-time">
                    Laufende Kerze ·{" "}
                    {dateTime(
                      new Date(currentCandle.time * 1000).toISOString(),
                    )}
                  </span>
                </div>
              )}
              {candlesQuery.isError ? (
                <div className="market-empty negative-text">
                  {errorMessage(candlesQuery.error)}
                </div>
              ) : !symbol ? (
                <div className="market-empty">Noch kein Symbol ausgewählt.</div>
              ) : candlesQuery.isLoading ? (
                <div className="market-empty">Kerzen werden geladen …</div>
              ) : (
                <CandleChart candles={candlesQuery.data ?? []} />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function HudValue({
  label,
  value,
  digits = 5,
}: {
  label: string;
  value?: number | null;
  digits?: number;
}) {
  return (
    <span>
      <small>{label}</small>
      <strong>{formatQuote(value, digits)}</strong>
    </span>
  );
}

function SetupState({ message }: { message?: string | null }) {
  return (
    <Card className="market-setup">
      <CardHeader
        title="BlackBull MT5 einrichten"
        subtitle="Der Livechart verwendet ausschließlich dein lokal laufendes MetaTrader-5-Terminal."
      />
      <CardContent>
        <p>{message ?? "Keine Verbindung zum BlackBull-MT5-Terminal."}</p>
        <ol>
          <li>
            Installiere MetaTrader 5 für BlackBull Markets und melde dich
            manuell an.
          </li>
          <li>
            Installiere in Python: <code>pip install MetaTrader5</code>
          </li>
          <li>
            Starte danach Personal Macro erneut und wähle „Verbindung prüfen“.
          </li>
        </ol>
        <small>
          Es werden keine Passwörter gespeichert oder übertragen. Die
          Integration kann keine Orders ausführen.
        </small>
      </CardContent>
    </Card>
  );
}

function CandleChart({ candles }: { candles: Candle[] }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current || !candles.length) return;
    const chart = createChart(container.current, {
      width: container.current.clientWidth,
      height: 560,
      layout: {
        background: { type: ColorType.Solid, color: "#090909" },
        textColor: "#d7d7d7",
      },
      grid: {
        vertLines: { color: "#1e1e1e" },
        horzLines: { color: "#1e1e1e" },
      },
      crosshair: { vertLine: { color: "#777" }, horzLine: { color: "#777" } },
      timeScale: { borderColor: "#353535" },
      rightPriceScale: { borderColor: "#353535" },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#43f07c",
      downColor: "#ff4f61",
      borderVisible: false,
      wickUpColor: "#43f07c",
      wickDownColor: "#ff4f61",
    });
    series.setData(
      candles.map((item) => ({
        time: item.time as UTCTimestamp,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      })),
    );
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() =>
      chart.applyOptions({ width: container.current?.clientWidth ?? 0 }),
    );
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [candles]);
  return (
    <div
      ref={container}
      className="market-chart"
      aria-label="BlackBull Candlestick Chart"
    />
  );
}

function errorMessage(error: unknown) {
  return typeof error === "object" && error && "message" in error
    ? String(error.message)
    : "Die Marktdaten konnten nicht geladen werden.";
}

function formatQuote(value?: number | null, digits = 5) {
  return value == null
    ? "—"
    : new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(
        value,
      );
}
