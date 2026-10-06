import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownUp,
  Database,
  ExternalLink,
  Globe2,
  Landmark,
  RefreshCw,
  Search,
  Square,
  Waves,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { BaseChart } from "../../charts/base-chart";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { PageHeader } from "../../components/ui/page-header";
import { api, isTauri } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import type {
  BondCountry,
  BondQuote,
  GovernmentBondDetail,
  GovernmentBondsDashboard,
} from "./government-bonds-types";
import {
  bpsLabel,
  buildBondCurveOption,
  buildBondHistoryOption,
  dateLabel,
  maturityLabel,
  yieldLabel,
} from "./government-bonds-charts";
import "./government-bonds.css";

const regions: Record<string, string> = {
  Europe: "Europa",
  Americas: "Amerika",
  Asia: "Asien",
  Africa: "Afrika",
  Oceania: "Ozeanien",
  Unassigned: "Weitere Gebiete",
};
const columns = [24, 60, 120, 360];
const horizons = [
  { key: "6m", label: "6 M", months: 6 },
  { key: "1y", label: "1 J", months: 12 },
  { key: "5y", label: "5 J", months: 60 },
  { key: "10y", label: "10 J", months: 120 },
  { key: "all", label: "Gesamt", months: 0 },
];

function unavailable(quote: BondQuote | undefined) {
  if (!quote) return "Diese Laufzeit ist in der Quelle nicht angebunden.";
  if (!quote.active)
    return "Die Quelle hat diese Reihe oder ihre Metadaten geändert; bisherige Historie bleibt erhalten.";
  if (quote.lastError) return quote.lastError;
  if (quote.date && quote.yieldPct === null)
    return `Kein Renditewert am ${dateLabel(quote.date)}.`;
  return "Die Renditehistorie wurde noch nicht geladen.";
}

function QuoteCell({
  quote,
  selected,
}: {
  quote: BondQuote | undefined;
  selected: boolean;
}) {
  const hasValue = quote?.yieldPct != null;
  return (
    <td className={`bond-quote-cell${selected ? " selected-tenor" : ""}`}>
      {hasValue ? (
        <div
          title={`${quote.name} · ${quote.symbol}\n${quote.currency ?? "Quellwährung fehlt"}\n${dateLabel(quote.date)}${quote.stale ? " · älter als sieben Tage" : ""}${!quote.active ? " · nicht mehr bestätigt" : ""}`}
        >
          <strong className={quote.stale || !quote.active ? "bond-stale" : ""}>
            {yieldLabel(quote.yieldPct)}
          </strong>
          <small>
            {dateLabel(quote.date)}
            {quote.stale ? " · alt" : ""}
            {!quote.active ? " · Archiv" : ""}
          </small>
        </div>
      ) : (
        <span
          className="bond-missing"
          title={unavailable(quote)}
          aria-label={unavailable(quote)}
        >
          —
        </span>
      )}
    </td>
  );
}

function CountrySelect({
  label,
  value,
  onChange,
  countries,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  countries: BondCountry[];
  optional?: boolean;
}) {
  return (
    <label className="bond-field">
      <span>{label}</span>
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {optional && <option value="">Kein Vergleich</option>}
        {countries.map((country) => (
          <option key={country.id} value={country.id}>
            {country.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function BondDetailPanel({
  detail,
  data,
  country,
  comparison,
  tenor,
  horizon,
  setHorizon,
}: {
  detail: GovernmentBondDetail;
  data: GovernmentBondsDashboard;
  country: BondCountry;
  comparison: BondCountry | undefined;
  tenor: number;
  horizon: string;
  setHorizon: (horizon: string) => void;
}) {
  const names: [string, string] = [country.name, comparison?.name ?? ""];
  const selectedQuote = data.instruments.find(
    (i) => i.countryId === country.id && i.maturityMonths === tenor,
  );
  const months = horizons.find((h) => h.key === horizon)?.months ?? 60;
  const sinceDate = new Date(data.asOf);
  sinceDate.setUTCMonth(sinceDate.getUTCMonth() - months);
  const since = months ? sinceDate.getTime() : 0;
  const hasHistory = [detail.primary, detail.comparison].some((c) =>
    c?.history.some((p) => p.yieldPct !== null && Date.parse(p.date) >= since),
  );
  const hasCurve = [detail.primary, detail.comparison].some((c) =>
    c?.curve.some((p) => p.yieldPct !== null),
  );
  const staleCurve =
    detail.curveDate !== null &&
    Date.parse(data.asOf) - Date.parse(detail.curveDate) > 7 * 86_400_000;
  const sources = [detail.primary, detail.comparison].filter((c) => c !== null);
  return (
    <>
      <div className="bond-detail-kpis">
        <div>
          <span>
            {maturityLabel(tenor)} · {country.name}
          </span>
          <strong>{yieldLabel(selectedQuote?.yieldPct)}</strong>
          <small>
            {selectedQuote?.date
              ? `${dateLabel(selectedQuote.date)}${selectedQuote.stale ? " · älterer Stand" : ""}`
              : "Noch kein Tageswert"}
          </small>
        </div>
        <div>
          <span>Zum vorigen Quellenwert</span>
          <strong>{bpsLabel(selectedQuote?.changeBps)}</strong>
          <small>
            {selectedQuote?.previousDate
              ? `${dateLabel(selectedQuote.previousDate)} → ${dateLabel(selectedQuote.date)}`
              : "Keine vergleichbaren Werte"}
          </small>
        </div>
        <div>
          <span>
            {comparison
              ? `${maturityLabel(tenor)} · Länderabstand`
              : "Kurvenabstand 10 J − 2 J"}
          </span>
          <strong>
            {bpsLabel(
              comparison ? detail.spreadBps : detail.primary.curveSpreadBps,
            )}
          </strong>
          <small>
            {comparison
              ? `${country.id} − ${comparison.id} · ${dateLabel(detail.spreadDate)}`
              : dateLabel(detail.curveDate)}
          </small>
        </div>
      </div>
      {selectedQuote?.lastError && (
        <p className="bond-notice" role="status">
          {selectedQuote.lastError}
        </p>
      )}
      {selectedQuote && !selectedQuote.active && (
        <p className="bond-notice">
          Archivreihe: Der aktuelle Quellenkatalog bestätigt diese Metadaten
          nicht mehr.
        </p>
      )}
      <Card>
        <CardHeader
          title="Zinskurve"
          subtitle={
            detail.curveDate
              ? `Gemeinsamer Quellenstand · ${dateLabel(detail.curveDate)}${staleCurve ? " · älter als sieben Tage" : ""}`
              : "Rendite nach Laufzeit · gleicher Beobachtungstag"
          }
        />
        {hasCurve ? (
          <>
            <BaseChart
              option={buildBondCurveOption(detail, names)}
              height={260}
              ariaLabel={`Zinskurve ${country.name}${comparison ? ` und ${comparison.name}` : ""}, Prozent pro Jahr, ${dateLabel(detail.curveDate)}`}
            />
            <p className="bond-chart-note">
              Punkte sind veröffentlichte Laufzeiten. Verbindungslinien dienen
              der Orientierung; fehlende Werte bleiben offen.
            </p>
          </>
        ) : (
          <EmptyState
            compact
            icon={Waves}
            title="Keine gemeinsame Zinskurve"
            description={
              comparison
                ? "Für beide Länder fehlen Renditewerte mit gemeinsamem Beobachtungstag. Ihre eigenen Historien bleiben separat sichtbar."
                : "Lade die verfügbaren Laufzeiten dieses Landes. Die Zinskurve verwendet ausschließlich Werte vom selben Tag."
            }
          />
        )}
      </Card>
      <Card className="bond-history-card">
        <CardHeader
          title={`Renditehistorie · ${maturityLabel(tenor)}`}
          subtitle="Nominale Staatsanleihe-Rendite · % pro Jahr"
          action={
            <div className="bond-horizons" aria-label="Historischer Zeitraum">
              {horizons.map((h) => (
                <Button
                  key={h.key}
                  size="sm"
                  variant={h.key === horizon ? "primary" : "ghost"}
                  aria-pressed={h.key === horizon}
                  onClick={() => setHorizon(h.key)}
                >
                  {h.label}
                </Button>
              ))}
            </div>
          }
        />
        {hasHistory ? (
          <BaseChart
            option={buildBondHistoryOption(detail, names, since)}
            height={330}
            ariaLabel={`Renditehistorie ${maturityLabel(tenor)} für ${country.name}${comparison ? ` und ${comparison.name}` : ""}`}
          />
        ) : (
          <EmptyState
            icon={Landmark}
            title="Keine Renditewerte im gewählten Zeitraum"
            description={
              !detail.primary.instrument
                ? "Für dieses Land ist die gewählte Laufzeit nicht angebunden. Andere Laufzeiten bleiben in der Übersicht sichtbar."
                : "Lade die Renditen dieses Landes oder wähle einen längeren Zeitraum für bereits gespeicherte ältere Reihen."
            }
          />
        )}
        {comparison && (
          <p className="bond-chart-note">
            {country.name} minus {comparison.name}: Ein Länderabstand wird nur
            am selben Tag und für dieselbe Laufzeit berechnet. Bei
            unterschiedlichen Währungen ist er kein reiner
            Kreditrisikoaufschlag.
          </p>
        )}
        <CardContent>
          <details className="bond-source-details">
            <summary>Werte & Quellen nachvollziehen</summary>
            <div className="bond-source-grid">
              {sources.map((source, index) => (
                <div key={source.countryId}>
                  <strong>{names[index]}</strong>
                  <p>
                    {source.instrument?.name ?? "Laufzeit nicht angebunden"}
                  </p>
                  <small>
                    {source.instrument?.symbol ?? "—"} · Quellwährung:{" "}
                    {source.instrument?.currency ?? "nicht angegeben"}
                  </small>
                  {source.instrument?.countryId === "HRV" && (
                    <p>
                      Die Quelle führt HRK als Währungsmetadatum. Die Reihe
                      besitzt keine dokumentierte Währungssegmentierung;
                      historische Vergleichbarkeit ist eingeschränkt.
                    </p>
                  )}
                  {source.instrument && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void openUrl(
                          `https://eodhd.com/financial-summary/${source.instrument!.symbol}`,
                        ).catch(() =>
                          toast.error(
                            "Der Quellenlink konnte nicht geöffnet werden.",
                          ),
                        )
                      }
                    >
                      <ExternalLink size={12} /> Quelle öffnen
                    </Button>
                  )}
                  <table className="bond-values-table">
                    <caption>Letzte 20 Quellenbeobachtungen</caption>
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>Rendite</th>
                      </tr>
                    </thead>
                    <tbody>
                      {source.history
                        .slice(-20)
                        .reverse()
                        .map((p) => (
                          <tr key={p.date}>
                            <td>{dateLabel(p.date)}</td>
                            <td>{yieldLabel(p.yieldPct)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </details>
        </CardContent>
      </Card>
    </>
  );
}

export function GovernmentBondsPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("");
  const [coverage, setCoverage] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["government-bonds"],
    queryFn: api.governmentBonds,
  });
  const syncQuery = useQuery({
    queryKey: ["government-bond-sync"],
    queryFn: api.governmentBondSync,
    enabled: isTauri(),
    refetchInterval: 2000,
  });
  const job = syncQuery.data ?? query.data?.job;
  const running = job?.status === "running";
  useEffect(() => {
    if (job?.id)
      void queryClient.invalidateQueries({ queryKey: ["government-bonds"] });
  }, [
    queryClient,
    job?.id,
    job?.status,
    job?.completed,
    job?.skipped,
    job?.failed,
  ]);
  const sync = useMutation({
    mutationFn: api.syncGovernmentBonds,
    onSuccess: (result) => {
      queryClient.setQueryData(["government-bond-sync"], result);
      void queryClient.invalidateQueries({ queryKey: ["government-bonds"] });
    },
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "Die Renditen konnten nicht aktualisiert werden.",
      ),
  });
  const cancel = useMutation({
    mutationFn: api.cancelGovernmentBondSync,
    onSuccess: () => toast.info("Der Abruf stoppt nach der laufenden Reihe."),
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Der Abruf konnte nicht beendet werden."),
  });
  const data = query.data;
  const countries = useMemo(
    () =>
      [...(data?.countries ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, "de"),
      ),
    [data?.countries],
  );
  const country =
    countries.find((c) => c.id === params.get("country")) ??
    countries.find((c) => c.id === "USA");
  const comparison = countries.find(
    (c) => c.id === params.get("compare") && c.id !== country?.id,
  );
  const tenors = useMemo(
    () =>
      [...new Set(data?.instruments.map((i) => i.maturityMonths) ?? [])].sort(
        (a, b) => a - b,
      ),
    [data?.instruments],
  );
  const requestedTenor = Number(params.get("tenor") ?? 120);
  const tenor = tenors.includes(requestedTenor) ? requestedTenor : 120;
  const horizon = horizons.some((h) => h.key === params.get("range"))
    ? params.get("range")!
    : "5y";
  const input = {
    countryId: country?.id ?? "USA",
    comparisonId: comparison?.id ?? null,
    maturityMonths: tenor,
  };
  const detail = useQuery({
    queryKey: ["government-bonds", "detail", input],
    queryFn: () => api.governmentBondDetail(input),
    enabled: !!data,
  });
  const updateParam = (key: string, value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key === "country" && next.get("compare") === value)
        next.delete("compare");
      return next;
    });
  const countryQuotes = useMemo(() => {
    const map = new Map<string, BondQuote[]>();
    for (const item of data?.instruments ?? [])
      map.set(item.countryId, [...(map.get(item.countryId) ?? []), item]);
    return map;
  }, [data?.instruments]);
  const filtered = countries
    .filter((c) => {
      const quotes = countryQuotes.get(c.id) ?? [];
      return (
        (!region || c.region === region) &&
        (!search ||
          `${c.name} ${c.id} ${quotes.map((q) => q.currency ?? "").join(" ")}`
            .toLocaleLowerCase("de")
            .includes(search.toLocaleLowerCase("de"))) &&
        (coverage === "all" ||
          (coverage === "covered" && quotes.length > 0) ||
          (coverage === "loaded" && quotes.some((q) => q.yieldPct !== null)) ||
          (coverage === "missing" && quotes.length === 0))
      );
    })
    .sort((a, b) => {
      if (sortBy === "yield") {
        const x = countryQuotes
          .get(a.id)
          ?.find((q) => q.maturityMonths === tenor)?.yieldPct;
        const y = countryQuotes
          .get(b.id)
          ?.find((q) => q.maturityMonths === tenor)?.yieldPct;
        if (x != null && y != null)
          return Number(y) - Number(x) || a.name.localeCompare(b.name, "de");
        if (x != null) return -1;
        if (y != null) return 1;
      }
      // Keep covered countries first without hiding any country from the directory.
      return (
        Number(countryQuotes.has(b.id)) - Number(countryQuotes.has(a.id)) ||
        a.name.localeCompare(b.name, "de")
      );
    });
  if (query.isLoading)
    return (
      <div className="page">
        <PageLoading />
      </div>
    );
  if (!data || query.isError)
    return (
      <div className="page">
        <PageHeader title="Staatsanleihen & Yields" icon={Landmark} />
        <ErrorState
          message={
            (query.error as { message?: string })?.message ??
            "Der Anleihespeicher konnte nicht gelesen werden."
          }
        />
        <Button onClick={() => void query.refetch()}>Erneut versuchen</Button>
      </div>
    );
  const covered = new Set(
    data.instruments.filter((i) => i.active).map((i) => i.countryId),
  ).size;
  const loaded = new Set(
    data.instruments.filter((i) => i.yieldPct !== null).map((i) => i.countryId),
  ).size;
  const fresh = data.instruments.filter(
    (i) => i.yieldPct !== null && !i.stale && i.active,
  ).length;
  const canSync =
    data.desktop && data.configured && !running && !sync.isPending;
  const hasCountry = countryQuotes.has(country?.id ?? "");
  const visibleColumns = columns.includes(tenor)
    ? columns
    : [...columns, tenor].sort((a, b) => a - b);
  return (
    <div className="page government-bonds-page">
      <PageHeader
        icon={Landmark}
        eyebrow="Marktkontext · Fixed Income"
        title="Staatsanleihen & Yields"
        description="Renditen weltweit vergleichen, Laufzeiten einordnen und Zinskurven verfolgen."
        actions={
          <>
            <Badge>
              <Database size={12} /> EODHD · Tageswerte
            </Badge>
            <Button
              variant="primary"
              disabled={!canSync}
              onClick={() => sync.mutate(null)}
            >
              <RefreshCw size={14} className={running ? "bond-spin" : ""} />{" "}
              Alle Länder aktualisieren
            </Button>
          </>
        }
      />
      <div className="bond-overview-kpis">
        <div>
          <Globe2 size={18} />
          <span>
            <strong>{countries.length}</strong>
            <small>Länder & Gebiete im Verzeichnis</small>
          </span>
        </div>
        <div>
          <Landmark size={18} />
          <span>
            <strong>
              {covered} <em>/ {countries.length}</em>
            </strong>
            <small>mit geprüften Laufzeiten</small>
          </span>
        </div>
        <div>
          <Database size={18} />
          <span>
            <strong>{loaded}</strong>
            <small>Länder mit lokalen Renditewerten</small>
          </span>
        </div>
        <div>
          <Waves size={18} />
          <span>
            <strong>
              {fresh} <em>/ {data.instruments.length}</em>
            </strong>
            <small>Reihen mit Werten der letzten 7 Tage</small>
          </span>
        </div>
      </div>
      {isPrivateWeb() ? (
        <p className="bond-notice">
          Privater Quellenstand: Renditen, Historien, Zinskurven und
          Länderabstände lassen sich hier vergleichen. Neue Providerabrufe sind
          in dieser Ansicht noch nicht freigegeben.
        </p>
      ) : !data.desktop ? (
        <p className="bond-notice">
          Browser-Vorschau: Das weltweite Verzeichnis ist verfügbar. Echte
          Renditen werden in der Desktop-App geladen und lokal gespeichert.
        </p>
      ) : !data.configured ? (
        <p className="bond-notice">
          Für den ersten Abruf benötigt die App deinen lokal eingerichteten
          EODHD-Schlüssel mit Zugriff auf GBOND. Bereits gespeicherte Werte
          bleiben verfügbar.
        </p>
      ) : null}
      <div className="bond-coverage-note">
        <span>
          Die Datenquelle deckt {covered} Länder und Gebiete ab. Weitere Länder
          bleiben mit „Keine Quellenreihe“ sichtbar.
        </span>
        <span>Katalog geprüft: {dateLabel(data.catalogReviewedAt)}</span>
      </div>
      {job && (
        <div
          className={`bond-job ${["failed", "partial", "interrupted"].includes(job.status) ? "attention" : ""}`}
          role="status"
          aria-live="polite"
        >
          <div>
            <strong>
              {running
                ? "Renditen werden aktualisiert"
                : job.status === "completed"
                  ? "Aktualisierung abgeschlossen"
                  : "Abrufstatus"}
            </strong>
            <span>{job.message}</span>
          </div>
          {running && (
            <>
              <progress
                max={Math.max(1, job.total)}
                value={job.completed + job.skipped + job.failed}
                aria-label="Fortschritt der Renditeaktualisierung"
              />
              <small>
                {job.completed + job.skipped + job.failed} / {job.total}
              </small>
              <Button
                size="sm"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(job.id)}
              >
                <Square size={12} /> Stoppen
              </Button>
            </>
          )}
        </div>
      )}
      <div className="bond-workspace">
        <Card className="bond-country-card">
          <CardHeader
            title="Länderübersicht"
            subtitle={`${filtered.length} Länder & Gebiete · Renditen in % p. a.`}
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setSortBy((s) => (s === "yield" ? "name" : "yield"))
                }
                aria-pressed={sortBy === "yield"}
              >
                <ArrowDownUp size={13} />{" "}
                {sortBy === "yield"
                  ? `${maturityLabel(tenor)} absteigend`
                  : "Nach Rendite"}
              </Button>
            }
          />
          <div className="bond-table-filters">
            <label className="bond-search">
              <Search size={14} />
              <input
                className="input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Land oder Währung suchen"
                placeholder="Land oder Währung suchen …"
              />
            </label>
            <select
              className="input"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              aria-label="Region"
            >
              <option value="">Alle Regionen</option>
              {Object.entries(regions).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={coverage}
              onChange={(e) => setCoverage(e.target.value)}
              aria-label="Datenabdeckung"
            >
              <option value="all">Alle Länder</option>
              <option value="covered">Mit Quellenreihen</option>
              <option value="loaded">Mit lokalen Werten</option>
              <option value="missing">Ohne Quellenreihe</option>
            </select>
          </div>
          <div
            className="bond-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Staatsanleihe-Renditen nach Land und Laufzeit"
          >
            <table className="bond-country-table">
              <thead>
                <tr>
                  <th scope="col">Land / Quellwährung</th>
                  {visibleColumns.map((m) => (
                    <th scope="col" key={m}>
                      <button
                        className={m === tenor ? "active" : ""}
                        onClick={() => updateParam("tenor", String(m))}
                        aria-pressed={m === tenor}
                      >
                        {maturityLabel(m)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const quotes = countryQuotes.get(c.id) ?? [];
                  const currencies = [
                    ...new Set(quotes.map((q) => q.currency).filter(Boolean)),
                  ].join(" / ");
                  return (
                    <tr
                      key={c.id}
                      className={c.id === country?.id ? "selected-country" : ""}
                    >
                      <th scope="row">
                        <button
                          onClick={() => updateParam("country", c.id)}
                          aria-pressed={c.id === country?.id}
                          className="bond-country-button"
                        >
                          <span className="bond-country-code">{c.id}</span>
                          <span>
                            <strong>{c.name}</strong>
                            <small>
                              {quotes.length
                                ? `${currencies || "Währung nicht angegeben"} · ${quotes.length} Laufzeiten`
                                : "Keine Quellenreihe"}
                            </small>
                          </span>
                        </button>
                      </th>
                      {visibleColumns.map((m) => (
                        <QuoteCell
                          key={m}
                          quote={quotes.find((q) => q.maturityMonths === m)}
                          selected={m === tenor}
                        />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <EmptyState
                compact
                icon={Search}
                title="Keine passenden Länder"
                description="Passe Suche, Region oder Datenabdeckung an."
              />
            )}
          </div>
          <p className="bond-chart-note">
            Jede Zelle nennt ihren eigenen Quellenstand. „Alt“ bedeutet älter
            als sieben Kalendertage. Eine höhere Rendite ist keine automatische
            positive Bewertung.
          </p>
        </Card>
        <div className="bond-detail-column">
          <Card>
            <CardHeader
              title="Land & Vergleich"
              subtitle="Gleiche Laufzeit auswählen, gemeinsame Quellenstände prüfen"
            />
            <CardContent className="bond-detail-controls">
              <CountrySelect
                label="Land"
                value={country?.id ?? "USA"}
                onChange={(v) => updateParam("country", v)}
                countries={countries}
              />
              <CountrySelect
                label="Vergleichsland"
                value={comparison?.id ?? ""}
                onChange={(v) => updateParam("compare", v)}
                countries={countries.filter((c) => c.id !== country?.id)}
                optional
              />
              <label className="bond-field">
                <span>Historische Laufzeit</span>
                <select
                  className="input"
                  value={tenor}
                  onChange={(e) => updateParam("tenor", e.target.value)}
                >
                  {tenors.map((m) => (
                    <option key={m} value={m}>
                      {maturityLabel(m)}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={!canSync || !hasCountry}
                onClick={() => sync.mutate(country!.id)}
              >
                <RefreshCw size={13} /> Land aktualisieren
              </Button>
              {comparison && (
                <Button
                  disabled={!canSync || !countryQuotes.has(comparison.id)}
                  onClick={() => sync.mutate(comparison.id)}
                >
                  <RefreshCw size={13} /> Vergleich aktualisieren
                </Button>
              )}
            </CardContent>
          </Card>
          {!hasCountry && (
            <p className="bond-notice">
              Für {country?.name} ist derzeit keine geprüfte
              Staatsanleihe-Renditereihe angebunden. Das bedeutet keine Aussage
              darüber, ob das Land Anleihen ausgibt.
            </p>
          )}
          {detail.isLoading ? (
            <PageLoading />
          ) : detail.isError ? (
            <Card>
              <CardContent>
                <ErrorState
                  message={
                    (detail.error as { message?: string })?.message ??
                    "Die Renditehistorie konnte nicht geladen werden."
                  }
                />
                <Button onClick={() => void detail.refetch()}>
                  Erneut versuchen
                </Button>
              </CardContent>
            </Card>
          ) : (
            detail.data &&
            country && (
              <BondDetailPanel
                detail={detail.data}
                data={data}
                country={country}
                comparison={comparison}
                tenor={tenor}
                horizon={horizon}
                setHorizon={(h) => updateParam("range", h)}
              />
            )
          )}
        </div>
      </div>
      <details className="bond-methodology">
        <summary>Datengrundlage & Bedeutung der Renditen</summary>
        <p>
          Gezeigt werden nominale staatliche Benchmark-Renditen nach Land und
          Laufzeit, einschließlich kurzer staatlicher Geldmarktpapiere. Es
          handelt sich um Renditen in Prozent pro Jahr, nicht um Anleihekurse,
          Kupons, Gesamtrenditen oder ein Verzeichnis einzelner ISINs.
        </p>
        <p>
          1 Prozentpunkt entspricht 100 Basispunkten. Negative Renditen und
          echte Nullwerte bleiben erhalten. Fehlende Werte werden weder
          geschätzt noch auf null gesetzt. Aktuelle Leitzinsen sind im eigenen
          Bereich „Leitzinsen“ verfügbar.
        </p>
        <p>
          Die Historie verwendet den veröffentlichten täglichen Renditewert der
          Quelle. Der laufende Kalendertag bleibt ausgeschlossen. Ein
          erfolgreicher Abruf wird frühestens nach 24 Stunden wiederholt; die
          letzten 35 Kalendertage werden dabei auf Revisionen geprüft. Ältere
          Revisionen und länderspezifische Benchmarkwechsel sind nicht
          vollständig dokumentiert.
        </p>
        <p>
          Die Quelle liefert nicht für jedes Land und jede Laufzeit eine Reihe.
          Fehlende Quellwährungen bleiben unbekannt. Die Länderabdeckung wird
          aus einzeln geprüften Instrumenten ermittelt; ein Zinsswap wird nicht
          als Staatsanleihe übernommen.
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void openUrl(data.methodologyUrl).catch(() =>
              toast.error("Der Quellenlink konnte nicht geöffnet werden."),
            )
          }
        >
          <ExternalLink size={13} /> EODHD-Methodik öffnen
        </Button>
        <p>
          Katalog zuletzt abgeglichen:{" "}
          {data.catalogCheckedAt
            ? dateLabel(data.catalogCheckedAt)
            : "noch kein lokaler Quellenabruf"}{" "}
          · {data.excluded.length} ausgeschlossene oder ungeprüfte Instrumente.
        </p>
        {data.excluded.length > 0 && (
          <ul>
            {data.excluded.map((e) => (
              <li key={e.symbol}>
                {e.symbol}: {e.reason}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
