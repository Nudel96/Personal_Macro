import { useContext, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { AtlasDisplayContext } from "./atlas-display-state";
import {
  atlasFindexCatalog as cfg,
  atlasFindexDataset,
  findexSelection,
  findexView,
  type FindexMetric,
  type FindexView,
} from "./atlas-findex";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";
import "./atlas-fiscal.css";
import "./atlas-innovation.css";

const fmt = (n: number) =>
  new Intl.NumberFormat("de", { maximumFractionDigits: 1 }).format(n);
const message = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Die Findex-Daten konnten nicht gelesen werden.";
export function FindexChart({
  view,
  metric,
  numbers = false,
  large = false,
}: {
  view: FindexView;
  metric: FindexMetric;
  numbers?: boolean;
  large?: boolean;
}) {
  const w = large ? 680 : 340,
    h = large ? 320 : 155;
  const left = numbers ? 62 : 18,
    right = w - 18,
    top = 15,
    bottom = h - 30;
  const x = (year: number) =>
    left +
    ((year - view.first) / Math.max(1, view.last - view.first)) *
      (right - left);
  const y = (n: number) => top + ((view.max - n) / view.max) * (bottom - top);
  const years = Array.from(
    { length: view.last - view.first + 1 },
    (_, i) => view.first + i,
  ).filter(
    (n) =>
      n === view.first ||
      n === view.last ||
      (n % 10 === 0 && x(n) - left > 48 && right - x(n) > 48),
  );
  const label = `${metric.label}. ${view.series.map((s) => s.name).join(" und ")}. ${view.first} bis ${view.last}. ${view.populationLabel}. Gleiche Skala: niemand bis alle. Findex-Befragungen. Kreise: Hauptland; Rauten: Vergleich. Einzelne Erhebungen ohne Verbindungslinien.`;
  return (
    <svg
      className="atlas-innovation-chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {[0, view.max / 2, view.max].map((n, i) => (
        <g key={i}>
          <line
            x1={left}
            x2={right}
            y1={y(n)}
            y2={y(n)}
            stroke="var(--border)"
          />
          {numbers && (
            <text x={left - 6} y={y(n) + 4} textAnchor="end">
              {fmt(n)} %
            </text>
          )}
        </g>
      ))}
      {years.map((n) => (
        <text
          key={n}
          x={x(n)}
          y={h - 6}
          textAnchor={
            n === view.first ? "start" : n === view.last ? "end" : "middle"
          }
        >
          {n}
        </text>
      ))}
      {view.series.map((s, i) => (
        <g
          key={s.id}
          style={{ color: i ? "var(--violet)" : "var(--primary-bright)" }}
        >
          {s.points.map((p) => {
            const size = large ? 3.7 : 2.5;
            const props = {
              fill: "currentColor",
              stroke: "currentColor",
              strokeWidth: 1.3,
            };
            const title = (
              <title>
                {s.name} · {p.year}
                {numbers
                  ? `: ${fmt(p.value)} Prozent der ausgewählten Gruppe`
                  : ""}
                {` · Befragung · ${view.populationLabel}`}
              </title>
            );
            return i ? (
              <path
                key={p.year}
                d={`M${x(p.year)},${y(p.value) - size}l${size},${size}l-${size},${size}l-${size},-${size}Z`}
                {...props}
              >
                {title}
              </path>
            ) : (
              <circle
                key={p.year}
                cx={x(p.year)}
                cy={y(p.value)}
                r={size}
                {...props}
              >
                {title}
              </circle>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
export function AtlasFindexPanel({
  geography,
  compareId,
  showNumbers,
  job,
  topicId,
}: {
  geography: AtlasGeography;
  compareId?: string;
  showNumbers: boolean;
  job: AtlasSyncJob | null | undefined;
  topicId: string;
}) {
  const context = useContext(AtlasDisplayContext);
  const [linkError, setLinkError] = useState(false);
  const [local, setLocal] = useState(new URLSearchParams());
  const selection = findexSelection(context?.params ?? local, topicId);
  const navigate = (values: Record<string, string>) => {
    if (context) context.navigate(values);
    else
      setLocal((previous) => {
        const p = new URLSearchParams(previous);
        Object.entries(values).forEach(([k, v]) => p.set(k, v));
        return p;
      });
  };
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["atlas", "findex", geography.id],
    queryFn: () => api.atlasFindex(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "findex", compareId],
    queryFn: () => api.atlasFindex(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasFindex(),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const data = query.data;
  const compare =
    compareId &&
    comparison.data?.geography.id === compareId &&
    comparison.data.status === "available"
      ? comparison.data
      : null;
  const rows =
    data?.status === "available" ? [data, ...(compare ? [compare] : [])] : [];
  const metrics = cfg.metrics.filter((m) => m.group === selection.group);
  const selected = metrics.find((m) => m.id === selection.metric);
  const fresh =
    data?.provenance &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86400000;
  const render = (m: FindexMetric, large = false) => {
    const combined = findexView(rows, m, selection.since, selection.population);
    const view =
      combined ??
      findexView(rows.slice(0, 1), m, selection.since, selection.population);
    return (
      <>
        {view ? (
          <FindexChart
            view={view}
            metric={m}
            numbers={showNumbers}
            large={large}
          />
        ) : (
          <p>Keine eigenen Werte im gewählten Zeitraum.</p>
        )}
        {view && <small>{view.series.map((s) => s.name).join(" und ")}</small>}
        {compare && !combined && (
          <p className="atlas-comparison-note">
            Für {compare.geography.label} fehlen gemeinsame Werte im gleichen
            Quellenstand. {view ? "Das Hauptland bleibt sichtbar." : ""}
          </p>
        )}
        {view && showNumbers && (
          <p className="atlas-comparison-note">
            {view.series.length > 1 ? "Gemeinsames Jahr" : "Letzter Wert"}{" "}
            {view.lastCommonYear}:{" "}
            {view.series
              .map(
                (s) =>
                  `${s.name} ${fmt(s.points.find((p) => p.year === view.lastCommonYear)!.value)} %`,
              )
              .join(" · ")}
          </p>
        )}
      </>
    );
  };
  return (
    <>
      <p className="atlas-explanation">
        Wie Menschen Konten, Zahlungen und finanzielle Reserven nutzen. Einzelne
        Befragungen zeigen die Verbreitung über die Jahre. Alle Bilder teilen
        denselben Maßstab von niemandem bis zur gesamten ausgewählten Gruppe.
        Die Punkte sind keine Marktpreise oder Bewertungssignale.
      </p>
      {query.isPending && (
        <p role="status">Lokale Findex-Erhebungen werden gelesen …</p>
      )}
      {query.error && (
        <div className="atlas-notice" role="alert">
          {message(query.error)}{" "}
          <Button size="sm" onClick={() => void query.refetch()}>
            Erneut prüfen
          </Button>
        </div>
      )}
      {(data?.status === "not_downloaded" ||
        data?.status === "desktop_required") && (
        <div className="atlas-empty">
          <h3>Finanzielle Teilhabe in der Desktop-App laden</h3>
          <p>
            Ein kostenloser Weltbank-Download erschließt 42 Perspektiven für 162
            Länder und Gebiete sowie zwölf veröffentlichte Aggregate
            einschließlich Welt. Verfügbare Erhebungen reichen von 2011 bis
            2024. Danach sind die Bilder offline verfügbar.
          </p>
        </div>
      )}
      {data?.status === "unsupported_area" && (
        <div className="atlas-empty">
          <h3>Kein eigenes Findex-Profil für dieses Gebiet</h3>
          <p>
            Die Quelle besitzt eigene Regionen und Einkommensgruppen. Sie werden
            nicht als vollständige Kontinente ausgegeben oder aus Länderwerten
            nachgebildet. Passende Findex-Gruppen sind in der Gebietsliste
            benannt.
          </p>
        </div>
      )}
      {compareId &&
        data?.status === "available" &&
        (comparison.isPending || comparison.error || !compare) && (
          <p className="atlas-notice">
            {comparison.isPending
              ? "Das Vergleichsland wird gelesen …"
              : comparison.error
                ? `Vergleich: ${message(comparison.error)}`
                : "Das Vergleichsgebiet besitzt kein eigenes Findex-Profil. Das Hauptland bleibt sichtbar."}
          </p>
        )}
      <div className="atlas-fiscal-controls">
        <label>
          Findex-Bilder ordnen{" "}
          <select
            className="input"
            value={selection.group}
            onChange={(e) =>
              navigate({
                findexGroup: e.target.value,
                findexMetric: "overview",
              })
            }
          >
            {cfg.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Bevölkerungsgruppe
          <select
            className="input"
            value={selection.population}
            onChange={(e) => navigate({ findexPopulation: e.target.value })}
          >
            {cfg.populations.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="Findex-Zeitraum"
        >
          {[2011, 2017, 2021].map((y) => (
            <button
              type="button"
              key={y}
              aria-pressed={selection.since === y}
              onClick={() => navigate({ findexSince: String(y) })}
            >
              Seit {y}
            </button>
          ))}
        </div>
      </div>
      {rows.length > 0 && (
        <>
          <p className="atlas-fiscal-legend">
            {rows.map((r, i) => (
              <span
                key={r.geography.id}
                style={{ color: i ? "var(--violet)" : "var(--primary-bright)" }}
              >
                {i ? "◆" : "●"} {r.geography.label}
              </span>
            ))}
          </p>
          <p className="atlas-comparison-note">
            {cfg.populations.find((p) => p.id === selection.population)?.label}{" "}
            · gleicher Maßstab in allen Karten · Befragungen, keine Jahreskurven
          </p>
          {selected ? (
            <>
              <Button
                size="sm"
                onClick={() => navigate({ findexMetric: "overview" })}
              >
                Zur Themenübersicht
              </Button>
              <h3>{selected.label}</h3>
              {render(selected, true)}
              <p className="atlas-comparison-note">{selected.note}</p>
            </>
          ) : (
            <div className="atlas-fiscal-grid">
              {metrics.map((m) => (
                <button
                  type="button"
                  className="atlas-fiscal-card"
                  key={m.id}
                  onClick={() => navigate({ findexMetric: m.id })}
                >
                  <strong>{m.label}</strong>
                  <small>Anteil der ausgewählten Bevölkerungsgruppe</small>
                  {render(m)}
                </button>
              ))}
            </div>
          )}
          <p className="atlas-comparison-note">
            Fehlende Erhebungen bleiben offen. Die nachgeholte Runde einzelner
            Länder steht im tatsächlichen Quellenjahr 2022. Für neuere Fragen
            kann nur ein einziger Erhebungspunkt vorliegen. Mehrfachnennungen
            überlappen; die Karten werden nicht zu einer Gesamtsumme addiert.
          </p>
        </>
      )}
      <details className="atlas-source-details">
        <summary>Quelle und Grenzen der Findex-Bilder</summary>
        <p>
          {cfg.release}. Gewichtete Befragungen von Erwachsenen ab 15 Jahren.
          Die jährliche Grundgesamtheit ist keine Stichprobengröße. Die App
          berechnet weder neue Ländergewichte noch Mittelwerte der
          Quellenregionen.
        </p>
        <p>
          Der Datenstand enthält 2011, 2014, 2017, 2021, 2022 und 2024. In 16
          Ländern wurde die Runde 2021 erst 2022 durchgeführt. Ein Jahr
          bezeichnet die Quellenzuordnung; Interviews können über den
          Jahreswechsel reichen.
        </p>
        <p>
          Fragen, Erhebungsarten, geografische Ausschlüsse und Stichproben
          unterscheiden sich. Kleine Abstände belegen keine statistisch
          gesicherten Unterschiede. Es werden keine erfundenen
          Konfidenzintervalle oder Trends gezeichnet.
        </p>
        <p>
          Frauen, Männer und Einkommensgruppen verwenden die jeweils
          veröffentlichte Teilgruppe als Nenner. Die ärmeren 40 % und
          wohlhabenderen 60 % beziehen sich auf die relative
          Einkommensverteilung innerhalb des Landes, nicht auf dieselbe
          weltweite Einkommensgrenze. Fehlende Untergruppen bleiben leer.
        </p>
        <p>
          Notgeldfragen betreffen einen im jeweiligen Fragebogen festgelegten
          Betrag. „Nicht als möglich angegeben“ enthält auch unbekannte oder
          verweigerte Antworten. Einzelne Zugangshürden sind Mehrfachnennungen.
          Alle Karten verwenden die gesamte ausgewählte Erwachsenengruppe als
          Nenner.
        </p>
        <p>
          Welt und Findex-Regionen sind veröffentlichte Befragungsaggregate. Die
          regionalen Gruppen schließen überwiegend Länder mit hohen Einkommen
          aus; die jeweilige Definition steht im Gebietsnamen. Sie sind keine
          vollständigen Kontinentalstatistiken oder administrativen
          Vollerhebungen.
        </p>
        {data?.provenance && (
          <p>
            Lokal geladen:{" "}
            {new Date(data.provenance.retrievedAt).toLocaleString("de-DE")}.
            Quellenstand und Dateiprüfsumme bleiben in gemerkten Ansichten
            erhalten.
          </p>
        )}
        <div className="atlas-fiscal-links">
          {[
            [cfg.sourceUrl, "Weltbank · Global Findex"],
            [cfg.glossaryUrl, "Definitionen der Messgrößen"],
            [cfg.delayedSurveyUrl, "Nachgeholte Erhebungen 2022"],
          ].map(([url, label]) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                if (isTauri()) {
                  event.preventDefault();
                  void openUrl(url).catch(() => setLinkError(true));
                }
              }}
            >
              {label}
            </a>
          ))}
        </div>
        {linkError && (
          <p role="alert">Die Quellenseite konnte nicht geöffnet werden.</p>
        )}
      </details>
      <Button
        size="sm"
        disabled={
          !isTauri() ||
          sync.isPending ||
          job?.status === "running" ||
          Boolean(fresh)
        }
        onClick={() => sync.mutate()}
      >
        {fresh
          ? "Daten heute bereits geladen"
          : "Findex-Erhebungen kostenlos laden"}
      </Button>
      {sync.error && <p role="alert">{message(sync.error)}</p>}
      {job?.seriesId === atlasFindexDataset && (
        <p role="status">{job.message}</p>
      )}
    </>
  );
}
