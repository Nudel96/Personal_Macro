import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type {
  CurrencySignal,
  HeatmapPayload,
  JournalTrade,
  PairPayload,
  PolicyRate,
  PolicyRatePayload,
  RateSignal,
  SeasonalityPayload
} from "./types";

type View = "overview" | "heatmap" | "seasonality" | "rates" | "journal";

const navigation: Array<{ id: View; label: string; icon: string }> = [
  { id: "overview", label: "Übersicht", icon: "◫" },
  { id: "heatmap", label: "Macro Heatmap", icon: "▦" },
  { id: "seasonality", label: "Saisonality", icon: "⌁" },
  { id: "rates", label: "Leitzinsen", icon: "%" },
  { id: "journal", label: "Tradingjournal", icon: "✎" }
];

const factorLabels: Record<string, string> = {
  cot: "COT",
  growth: "Growth",
  inflation: "Inflation",
  labour: "Labour",
  rates: "Zinsen",
  seasonality: "Saisonality"
};

const signalLabel: Record<Exclude<RateSignal, null>, string> = {
  "-1": "Bearish",
  "0": "Neutral",
  "1": "Bullish"
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Anfrage fehlgeschlagen (${response.status})`);
  return response.json() as Promise<T>;
}

function scoreClass(value: number | null): string {
  if (value === null) return "unavailable";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function scoreText(value: CurrencySignal): string {
  if (value === null) return "–";
  return value > 0 ? `+${value}` : String(value);
}

function biasLabel(score: number): string {
  if (score >= 5) return "Sehr bullish";
  if (score >= 2) return "Bullish";
  if (score <= -5) return "Sehr bearish";
  if (score <= -2) return "Bearish";
  return "Neutral";
}

function formatRate(value: number | null): string {
  return value === null ? "–" : `${value.toFixed(2)} %`;
}

function formatBps(value: number | null): string {
  if (value === null) return "–";
  return `${value > 0 ? "+" : ""}${value.toFixed(0)} bp`;
}

function formatNumber(value: number | null): string {
  if (value === null) return "–";
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(value);
}

function SignalBadge({ value, large = false }: { value: RateSignal; large?: boolean }) {
  return (
    <span className={`signal ${scoreClass(value)}${large ? " large" : ""}`}>
      {value === null ? "Nicht verfügbar" : signalLabel[value]}
    </span>
  );
}

function DemoNotice() {
  return (
    <div className="demo-notice" role="status">
      <span className="demo-dot" />
      <div>
        <strong>Vorschau mit Beispieldaten</strong>
        <span> Live-Makrodaten werden erst nach Anbindung eines freigegebenen Datenfeeds angezeigt.</span>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {detail ? <span className="status">{detail}</span> : null}
    </div>
  );
}

function Overview({
  heatmap,
  rates,
  journal,
  onNavigate
}: {
  heatmap: HeatmapPayload | null;
  rates: PolicyRatePayload | null;
  journal: JournalTrade[];
  onNavigate: (view: View) => void;
}) {
  const ranked = [...(heatmap?.currencies ?? [])].sort((a, b) => b.raw_score - a.raw_score);
  const closedTrades = journal.filter((trade) => trade.status === "closed" && trade.result_r !== null);
  const averageR = closedTrades.length
    ? closedTrades.reduce((total, trade) => total + Number(trade.result_r), 0) / closedTrades.length
    : null;

  return (
    <>
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Personal Macro Workspace</p>
          <h1>Marktübersicht</h1>
          <p className="subtitle">Macro-Bias, Saisonality, Zinsen und deine Trades an einem Ort.</p>
        </div>
        <div className="local-chip"><span /> Lokal gespeichert</div>
      </div>
      <DemoNotice />

      <section className="metric-grid four">
        <article className="card metric-card">
          <p className="metric-label">Stärkste Währung</p>
          <strong className="metric-value accent">{ranked[0]?.currency ?? "–"}</strong>
          <span className="metric-caption">Score {ranked[0]?.raw_score ?? "–"}</span>
        </article>
        <article className="card metric-card">
          <p className="metric-label">Schwächste Währung</p>
          <strong className="metric-value danger-text">{ranked.at(-1)?.currency ?? "–"}</strong>
          <span className="metric-caption">Score {ranked.at(-1)?.raw_score ?? "–"}</span>
        </article>
        <article className="card metric-card">
          <p className="metric-label">USD relativ</p>
          <strong className="metric-value">{formatBps(rates?.usd_relative.relative_stance_bps ?? null)}</strong>
          <span className="metric-caption">Fed vs. Auslandskorb</span>
        </article>
        <article className="card metric-card">
          <p className="metric-label">Journal Ø R</p>
          <strong className={`metric-value ${scoreClass(averageR)}`}>
            {averageR === null ? "–" : `${averageR > 0 ? "+" : ""}${averageR.toFixed(2)} R`}
          </strong>
          <span className="metric-caption">{closedTrades.length} ausgewertete Trades</span>
        </article>
      </section>

      <section className="content-grid">
        <article className="card span-two">
          <SectionHeading eyebrow="Currency Strength" title="Macro Heatmap" detail="6 Faktoren" />
          <div className="compact-heatmap">
            <div className="heatmap-head">
              <span>Währung</span>
              {(heatmap?.factors ?? []).map((factor) => <span key={factor}>{factorLabels[factor]}</span>)}
              <span>Score</span>
            </div>
            {(heatmap?.currencies ?? []).slice(0, 6).map((row) => (
              <div className="heatmap-line" key={row.currency}>
                <strong>{row.currency}</strong>
                {heatmap?.factors.map((factor) => (
                  <span className={`score-cell ${scoreClass(row.factors[factor])}`} key={factor}>
                    {scoreText(row.factors[factor])}
                  </span>
                ))}
                <strong className={scoreClass(row.raw_score)}>{row.raw_score > 0 ? "+" : ""}{row.raw_score}</strong>
              </div>
            ))}
          </div>
          <button className="text-button" onClick={() => onNavigate("heatmap")}>Vollständige Heatmap öffnen →</button>
        </article>

        <article className="card">
          <SectionHeading eyebrow="Tradingjournal" title="Letzte Einträge" detail={`${journal.length} Trades`} />
          {journal.length === 0 ? (
            <div className="empty-state compact">
              <strong>Noch keine Trades</strong>
              <p>Erfasse deinen ersten Trade inklusive Setup, These und Markt-Kontext.</p>
            </div>
          ) : (
            <div className="activity-list">
              {journal.slice(0, 4).map((trade) => (
                <div className="activity-item" key={trade.id}>
                  <span className={`direction-dot ${trade.direction}`} />
                  <div><strong>{trade.instrument}</strong><span>{trade.strategy || trade.setup || "Ohne Strategie"}</span></div>
                  <strong className={scoreClass(trade.result_r)}>{trade.result_r === null ? "offen" : `${trade.result_r > 0 ? "+" : ""}${trade.result_r} R`}</strong>
                </div>
              ))}
            </div>
          )}
          <button className="text-button" onClick={() => onNavigate("journal")}>Journal öffnen →</button>
        </article>
      </section>
    </>
  );
}

function HeatmapView({ heatmap, pair, base, quote, setBase, setQuote }: {
  heatmap: HeatmapPayload | null;
  pair: PairPayload | null;
  base: string;
  quote: string;
  setBase: (value: string) => void;
  setQuote: (value: string) => void;
}) {
  const currencies = heatmap?.currencies.map((row) => row.currency) ?? [];
  return (
    <>
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Base minus Quote</p>
          <h1>Macro Heatmap</h1>
          <p className="subtitle">Jeder Faktor wird je Währung bewertet und für das Paar von −2 bis +2 verglichen.</p>
        </div>
      </div>
      <DemoNotice />

      <section className="card pair-panel">
        <div className="pair-controls">
          <label>Base<select value={base} onChange={(event) => setBase(event.target.value)}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
          <span className="pair-slash">/</span>
          <label>Quote<select value={quote} onChange={(event) => setQuote(event.target.value)}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
          <div className="pair-result">
            <span>{pair?.symbol ?? `${base}/${quote}`}</span>
            <strong className={scoreClass(pair?.raw_score ?? null)}>{biasLabel(pair?.raw_score ?? 0)}</strong>
            <b>{pair?.raw_score && pair.raw_score > 0 ? "+" : ""}{pair?.raw_score ?? "–"}</b>
          </div>
        </div>
        <div className="pair-factor-grid">
          {(heatmap?.factors ?? []).map((factor) => {
            const score = pair?.cells[factor] ?? null;
            return <div key={factor}><span>{factorLabels[factor]}</span><strong className={`score-tile ${scoreClass(score)}`}>{score === null ? "–" : `${score > 0 ? "+" : ""}${score}`}</strong></div>;
          })}
        </div>
      </section>

      <section className="card table-card">
        <SectionHeading eyebrow="Einzelwährungen" title="Currency Strength" detail="−1 / 0 / +1" />
        <div className="table-scroll">
          <table className="heatmap-table">
            <thead><tr><th>Währung</th>{heatmap?.factors.map((factor) => <th key={factor}>{factorLabels[factor]}</th>)}<th>Score</th><th>Bias</th></tr></thead>
            <tbody>
              {heatmap?.currencies.map((row) => (
                <tr key={row.currency}>
                  <th>{row.currency}</th>
                  {heatmap.factors.map((factor) => <td key={factor}><span className={`score-cell ${scoreClass(row.factors[factor])}`}>{scoreText(row.factors[factor])}</span></td>)}
                  <td><strong className={scoreClass(row.raw_score)}>{row.raw_score > 0 ? "+" : ""}{row.raw_score}</strong></td>
                  <td><span className={`signal ${scoreClass(row.raw_score)}`}>{biasLabel(row.raw_score)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function SeasonalityView({ payload }: { payload: SeasonalityPayload | null }) {
  return (
    <>
      <div className="page-title-row"><div><p className="eyebrow">Historische Tendenzen</p><h1>Saisonality</h1><p className="subtitle">Vorschaufenster für Fiat, Edelmetalle und bekannte Kryptowährungen.</p></div></div>
      <DemoNotice />
      <section className="seasonal-grid">
        {payload?.items.map((item) => (
          <article className="card seasonal-card" key={item.symbol}>
            <div className="asset-heading"><div><span>{item.asset}</span><strong>{item.symbol}</strong></div><SignalBadge value={item.signal} /></div>
            <div className={`seasonal-chart ${scoreClass(item.signal)}`}><span style={{ height: `${Math.min(86, 35 + Math.abs(item.mean_return) * 14)}%` }} /><span style={{ height: "52%" }} /><span style={{ height: "68%" }} /><span style={{ height: "42%" }} /><span style={{ height: "76%" }} /><span style={{ height: "59%" }} /></div>
            <dl className="stat-list"><div><dt>Ø Return</dt><dd className={scoreClass(item.mean_return)}>{item.mean_return > 0 ? "+" : ""}{item.mean_return.toFixed(1)} %</dd></div><div><dt>Hit Rate</dt><dd>{item.hit_rate} %</dd></div><div><dt>Jahre</dt><dd>{item.samples}</dd></div></dl>
            <p className="muted small">{item.window}</p>
          </article>
        ))}
      </section>
      <section className="card method-card"><div className="method-icon">i</div><div><strong>Berechnung noch im Demo-Modus</strong><p>Für echte Ergebnisse fehlt noch der Import deiner gewünschten Preisreihen. Dann werden 5/10/15/20 Jahre, Mittelwert, Median, Hit Rate und Current-Year-Overlay berechnet.</p></div></section>
    </>
  );
}

function RateRow({ rate }: { rate: PolicyRate }) {
  return <tr><th>{rate.currency_code}</th><td>{formatRate(rate.current_target_rate)}</td><td>{formatRate(rate.expected_target_rate)}</td><td>{formatBps(rate.expected_delta_bps)}</td><td><SignalBadge value={rate.expected_stance} /></td><td><span className="status">{rate.availability_status}</span></td></tr>;
}

function RatesView({ payload }: { payload: PolicyRatePayload | null }) {
  const usd = payload?.usd_relative;
  return (
    <>
      <div className="page-title-row"><div><p className="eyebrow">Zentralbank-Divergenz</p><h1>Leitzinsen</h1><p className="subtitle">Aktueller Zielzins, nächste Erwartung und relative USD-Wirkung.</p></div></div>
      <DemoNotice />
      <section className="content-grid rates-grid">
        <article className="card span-two"><SectionHeading eyebrow="USD-Relativwirkung" title="Fed gegen Auslandskorb" /><div className="rate-hero"><SignalBadge value={usd?.relative_signal ?? null} large /><dl className="stat-list wide"><div><dt>Auslandskorb</dt><dd>{formatBps(usd?.foreign_pressure_bps ?? null)}</dd></div><div><dt>USD relativ</dt><dd>{formatBps(usd?.relative_stance_bps ?? null)}</dd></div><div><dt>Abdeckung</dt><dd>{usd ? `${usd.covered_central_banks} / ${usd.required_central_banks}` : "–"}</dd></div></dl></div><p className="muted">Hikes {usd?.hike_count ?? "–"} · Holds {usd?.hold_count ?? "–"} · Cuts {usd?.cut_count ?? "–"}</p></article>
        <article className="card"><SectionHeading eyebrow="Logik" title="Relative Aussagekraft" /><p>Erwartete Fed-Änderung minus erwarteter Durchschnitt des Auslandskorbs ergibt die relative USD-Stance.</p><p className="muted small">Fed +25 bp bei Ausland +25 bp ergibt relativ 0.</p></article>
      </section>
      <section className="card table-card"><SectionHeading eyebrow="Zins-Heatmap" title="Erwartete Entscheidungen" detail="Actual / Forecast" /><div className="table-scroll"><table><thead><tr><th>Währung</th><th>Aktueller Zins</th><th>Erwarteter Zins</th><th>Änderung</th><th>Stance</th><th>Status</th></tr></thead><tbody>{payload?.rates.map((rate) => <RateRow key={rate.currency_code} rate={rate} />)}</tbody></table></div></section>
    </>
  );
}

interface TradeDraft {
  instrument: string;
  direction: "long" | "short";
  status: "open" | "closed";
  trade_date: string;
  entry_price: string;
  exit_price: string;
  result_r: string;
  pnl_amount: string;
  strategy: string;
  setup: string;
  thesis: string;
  emotion: string;
  macro_context: string;
  seasonality_context: string;
  notes: string;
}

function emptyTrade(): TradeDraft {
  return { instrument: "", direction: "long", status: "closed", trade_date: new Date().toISOString().slice(0, 10), entry_price: "", exit_price: "", result_r: "", pnl_amount: "", strategy: "", setup: "", thesis: "", emotion: "", macro_context: "", seasonality_context: "", notes: "" };
}

function optionalNumber(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

function TradeForm({ onCreated }: { onCreated: (trade: JournalTrade) => void }) {
  const [draft, setDraft] = useState<TradeDraft>(emptyTrade);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = <K extends keyof TradeDraft>(key: K, value: TradeDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...draft,
        entry_price: optionalNumber(draft.entry_price), exit_price: optionalNumber(draft.exit_price), result_r: optionalNumber(draft.result_r), pnl_amount: optionalNumber(draft.pnl_amount),
        strategy: draft.strategy || null, setup: draft.setup || null, thesis: draft.thesis || null, emotion: draft.emotion || null, macro_context: draft.macro_context || null, seasonality_context: draft.seasonality_context || null, notes: draft.notes || null
      };
      const created = await fetchJson<JournalTrade>("/api/v1/journal/trades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      onCreated(created);
      setDraft(emptyTrade());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Trade konnte nicht gespeichert werden");
    } finally { setSaving(false); }
  }

  return (
    <form className="trade-form" onSubmit={submit}>
      <div className="form-grid three"><label>Instrument<input required placeholder="z. B. AUD/CHF" value={draft.instrument} onChange={(e) => update("instrument", e.target.value.toUpperCase())} /></label><label>Richtung<select value={draft.direction} onChange={(e) => update("direction", e.target.value as TradeDraft["direction"])}><option value="long">Long</option><option value="short">Short</option></select></label><label>Datum<input required type="date" value={draft.trade_date} onChange={(e) => update("trade_date", e.target.value)} /></label></div>
      <div className="form-grid four"><label>Status<select value={draft.status} onChange={(e) => update("status", e.target.value as TradeDraft["status"])}><option value="closed">Geschlossen</option><option value="open">Offen</option></select></label><label>Entry<input type="number" step="any" value={draft.entry_price} onChange={(e) => update("entry_price", e.target.value)} /></label><label>Exit<input type="number" step="any" value={draft.exit_price} onChange={(e) => update("exit_price", e.target.value)} /></label><label>Ergebnis in R<input type="number" step="0.01" value={draft.result_r} onChange={(e) => update("result_r", e.target.value)} /></label></div>
      <div className="form-grid three"><label>Strategie<input placeholder="Macro Swing" value={draft.strategy} onChange={(e) => update("strategy", e.target.value)} /></label><label>Setup<input placeholder="Growth Divergence" value={draft.setup} onChange={(e) => update("setup", e.target.value)} /></label><label>P&L Betrag<input type="number" step="0.01" value={draft.pnl_amount} onChange={(e) => update("pnl_amount", e.target.value)} /></label></div>
      <label>Trade-These<textarea rows={3} placeholder="Warum wurde der Trade eröffnet, wo ist er invalidiert?" value={draft.thesis} onChange={(e) => update("thesis", e.target.value)} /></label>
      <div className="form-grid two"><label>Macro-/COT-Kontext<textarea rows={2} value={draft.macro_context} onChange={(e) => update("macro_context", e.target.value)} /></label><label>Saisonality-Kontext<textarea rows={2} value={draft.seasonality_context} onChange={(e) => update("seasonality_context", e.target.value)} /></label></div>
      <div className="form-grid two"><label>Emotion<input placeholder="Ruhig, FOMO, unsicher …" value={draft.emotion} onChange={(e) => update("emotion", e.target.value)} /></label><label>Notizen<input placeholder="Fehler, Learnings, Regeln" value={draft.notes} onChange={(e) => update("notes", e.target.value)} /></label></div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="form-actions"><span>Wird nur in deiner lokalen SQLite-Datei gespeichert.</span><button className="primary-button" disabled={saving}>{saving ? "Speichert …" : "Trade speichern"}</button></div>
    </form>
  );
}

function JournalView({ trades, onCreated, onDelete }: { trades: JournalTrade[]; onCreated: (trade: JournalTrade) => void; onDelete: (id: number) => void }) {
  const analysed = trades.filter((trade) => trade.result_r !== null);
  const wins = analysed.filter((trade) => Number(trade.result_r) > 0);
  const totalR = analysed.reduce((total, trade) => total + Number(trade.result_r), 0);
  const avgR = analysed.length ? totalR / analysed.length : null;
  return (
    <>
      <div className="page-title-row"><div><p className="eyebrow">Planen · Ausführen · Lernen</p><h1>Tradingjournal</h1><p className="subtitle">Deine Trades, Entscheidungen und Markt-Kontexte bleiben lokal auf deinem Rechner.</p></div></div>
      <section className="metric-grid four"><article className="card metric-card"><p className="metric-label">Trades</p><strong className="metric-value">{trades.length}</strong><span className="metric-caption">gesamt</span></article><article className="card metric-card"><p className="metric-label">Win Rate</p><strong className="metric-value">{analysed.length ? `${Math.round((wins.length / analysed.length) * 100)} %` : "–"}</strong><span className="metric-caption">n = {analysed.length}</span></article><article className="card metric-card"><p className="metric-label">Ø R</p><strong className={`metric-value ${scoreClass(avgR)}`}>{avgR === null ? "–" : `${avgR > 0 ? "+" : ""}${avgR.toFixed(2)}`}</strong><span className="metric-caption">pro ausgewertetem Trade</span></article><article className="card metric-card"><p className="metric-label">Gesamt R</p><strong className={`metric-value ${scoreClass(totalR)}`}>{totalR > 0 ? "+" : ""}{totalR.toFixed(2)}</strong><span className="metric-caption">kumuliert</span></article></section>
      <section className="card journal-form-card"><SectionHeading eyebrow="Neuer Eintrag" title="Trade erfassen" detail="Lokal" /><TradeForm onCreated={onCreated} /></section>
      <section className="card table-card"><SectionHeading eyebrow="Historie" title="Deine Trades" detail={`${trades.length} Einträge`} />{trades.length === 0 ? <div className="empty-state"><strong>Dein Journal ist bereit</strong><p>Der erste gespeicherte Trade erscheint hier und bleibt auch nach einem Neustart erhalten.</p></div> : <div className="table-scroll"><table><thead><tr><th>Datum</th><th>Instrument</th><th>Richtung</th><th>Strategie / Setup</th><th>Ergebnis</th><th>P&L</th><th /></tr></thead><tbody>{trades.map((trade) => <tr key={trade.id}><td>{trade.trade_date}</td><th>{trade.instrument}</th><td><span className={`direction ${trade.direction}`}>{trade.direction.toUpperCase()}</span></td><td><strong>{trade.strategy || "–"}</strong><span className="sub-cell">{trade.setup || trade.status}</span></td><td><strong className={scoreClass(trade.result_r)}>{trade.result_r === null ? "offen" : `${trade.result_r > 0 ? "+" : ""}${formatNumber(trade.result_r)} R`}</strong></td><td>{formatNumber(trade.pnl_amount)}</td><td><button className="icon-button" title="Eintrag löschen" onClick={() => onDelete(trade.id)}>×</button></td></tr>)}</tbody></table></div>}</section>
    </>
  );
}

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [rates, setRates] = useState<PolicyRatePayload | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapPayload | null>(null);
  const [seasonality, setSeasonality] = useState<SeasonalityPayload | null>(null);
  const [pair, setPair] = useState<PairPayload | null>(null);
  const [base, setBase] = useState("AUD");
  const [quote, setQuote] = useState("CHF");
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchJson<PolicyRatePayload>("/api/v1/policy-rates/demo"),
      fetchJson<HeatmapPayload>("/api/v1/heatmap/demo"),
      fetchJson<SeasonalityPayload>("/api/v1/seasonality/demo"),
      fetchJson<JournalTrade[]>("/api/v1/journal/trades")
    ]).then(([rateData, heatmapData, seasonalityData, tradeData]) => { setRates(rateData); setHeatmap(heatmapData); setSeasonality(seasonalityData); setTrades(tradeData); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Lokale API nicht erreichbar"));
  }, []);

  useEffect(() => {
    if (base === quote) { setPair(null); return; }
    fetchJson<PairPayload>(`/api/v1/heatmap/demo/pair/${base}/${quote}`).then(setPair).catch(() => setPair(null));
  }, [base, quote]);

  const currentTitle = useMemo(() => navigation.find((item) => item.id === view)?.label ?? "Personal Macro", [view]);

  async function deleteTrade(id: number) {
    if (!window.confirm("Diesen Journal-Eintrag wirklich löschen?")) return;
    try { await fetch(`/api/v1/journal/trades/${id}`, { method: "DELETE" }).then((response) => { if (!response.ok) throw new Error("Löschen fehlgeschlagen"); }); setTrades((current) => current.filter((trade) => trade.id !== id)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Löschen fehlgeschlagen"); }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">PM</div><div><strong>Personal Macro</strong><span>Trading Workspace</span></div></div>
        <nav aria-label="Hauptnavigation">{navigation.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)} aria-current={view === item.id ? "page" : undefined}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}</nav>
        <div className="sidebar-footer"><span className="live-dot" /> API verbunden<strong>Nur lokal · Privat</strong></div>
      </aside>
      <main className="workspace">
        <header className="mobile-header"><div className="brand-mark">PM</div><strong>{currentTitle}</strong></header>
        <nav className="mobile-nav">{navigation.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>{item.label}</button>)}</nav>
        {error ? <section className="card error-banner"><strong>Verbindung zur lokalen API fehlgeschlagen.</strong><span>{error}</span></section> : null}
        {view === "overview" ? <Overview heatmap={heatmap} rates={rates} journal={trades} onNavigate={setView} /> : null}
        {view === "heatmap" ? <HeatmapView heatmap={heatmap} pair={pair} base={base} quote={quote} setBase={setBase} setQuote={setQuote} /> : null}
        {view === "seasonality" ? <SeasonalityView payload={seasonality} /> : null}
        {view === "rates" ? <RatesView payload={rates} /> : null}
        {view === "journal" ? <JournalView trades={trades} onCreated={(trade) => setTrades((current) => [trade, ...current])} onDelete={deleteTrade} /> : null}
      </main>
    </div>
  );
}
