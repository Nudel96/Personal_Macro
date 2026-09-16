import { useContext, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { AtlasDisplayContext } from "./atlas-display-state";
import {
  atlasLaborCatalog as cfg,
  atlasLaborDataset,
  laborSelection,
  laborView,
  laborSegments,
  type LaborMetric,
  type LaborView,
} from "./atlas-labor";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";
import "./atlas-fiscal.css";
import "./atlas-innovation.css";

const fmt = (n: number) =>
  new Intl.NumberFormat("de", { maximumFractionDigits: 1 }).format(n);
const message = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Die ILO-Daten konnten nicht gelesen werden.";
export function LaborChart({
  view,
  metric,
  numbers = false,
  large = false,
}: {
  view: LaborView;
  metric: LaborMetric;
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
  const label = `${metric.label}. ${view.series.map((s) => s.name).join(" und ")}. ${view.first} bis ${view.last}. Anteil an der Beschäftigung. ILO-Modellschätzungen. Kreise: Hauptland; Rauten: Vergleich. Lücken bleiben offen.`;
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
          {laborSegments(s.points).map(([a, b]) => (
            <line
              key={b.year}
              x1={x(a.year)}
              y1={y(a.value)}
              x2={x(b.year)}
              y2={y(b.value)}
              stroke="currentColor"
              strokeWidth={1.8}
              strokeDasharray={i ? "5 3" : undefined}
            />
          ))}
          {s.points.map((p) => {
            const size = large ? 3.7 : 2.5;
            const props = {
              fill: p.boundary ? "var(--surface)" : "currentColor",
              stroke: "currentColor",
              strokeWidth: 1.3,
            };
            const title = (
              <title>
                {s.name} · {p.year}
                {numbers ? `: ${fmt(p.value)} Prozent der Beschäftigung` : ""}
                {p.adjusted
                  ? " · ILO-Kennzeichen A: angepasst"
                  : " · Modellschätzung"}
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
export function AtlasLaborPanel({
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
  const [local, setLocal] = useState(new URLSearchParams());
  const selection = laborSelection(context?.params ?? local, topicId);
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
    queryKey: ["atlas", "labor", geography.id],
    queryFn: () => api.atlasLabor(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "labor", compareId],
    queryFn: () => api.atlasLabor(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasLabor(),
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
  const render = (m: LaborMetric, large = false) => {
    const combined = laborView(rows, m, selection.since, selection.through);
    const view =
      combined ??
      laborView(rows.slice(0, 1), m, selection.since, selection.through);
    return (
      <>
        {view ? (
          <LaborChart
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
        Wo Menschen arbeiten: Diese Bilder zeigen, welchen Anteil ein Bereich an
        der Beschäftigung hat und wie sich die wirtschaftliche Struktur
        verändert. Die ILO verbindet Erhebungen mit Modellschätzungen. Ein
        wachsender Anteil sagt nichts über günstige Preise, Gewinnchancen oder
        faire Bewertung aus.
      </p>
      {query.isPending && (
        <p role="status">Lokale Beschäftigungsdaten werden gelesen …</p>
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
          <h3>Beschäftigungsbilder in der Desktop-App laden</h3>
          <p>
            Ein kostenloser ILO-Abruf erschließt 14 Wirtschaftsbereiche für 188
            Länder und Gebiete, Welt und die ILO-Region Afrika. Die Bilder
            bleiben danach offline verfügbar.
          </p>
        </div>
      )}
      {data?.status === "unsupported_area" && (
        <div className="atlas-empty">
          <h3>Kein eigenes ILO-Profil für dieses Gebiet</h3>
          <p>
            Gebiete anderer Anbieter werden nicht mit ILO-Regionen
            gleichgesetzt. Für den Kontinent steht „Afrika · ILO-Modellregion“
            zur Verfügung. Die gemeinsame Quellenzeile der Kanalinseln wird
            weder Jersey noch Guernsey einzeln zugewiesen.
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
                : "Das Vergleichsgebiet besitzt kein eigenes ILO-Profil. Das Hauptland bleibt sichtbar."}
          </p>
        )}
      <div className="atlas-fiscal-controls">
        <label>
          Beschäftigungsbilder ordnen{" "}
          <select
            className="input"
            value={selection.group}
            onChange={(e) =>
              navigate({
                laborGroup: e.target.value,
                laborMetric: "overview",
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
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="ILO-Zeitraum"
        >
          {[1991, 2000, 2010].map((y) => (
            <button
              type="button"
              key={y}
              aria-pressed={selection.since === y}
              onClick={() => navigate({ laborSince: String(y) })}
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
            Anteil an allen Erwerbstätigen · je Bereich eine eigene Skala ab
            Null · beide Länder im selben Kalender und Maßstab ·
            ILO-Modellschätzungen bis 2024
          </p>
          {selected ? (
            <>
              <Button
                size="sm"
                onClick={() => navigate({ laborMetric: "overview" })}
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
                  onClick={() => navigate({ laborMetric: m.id })}
                >
                  <strong>{m.label}</strong>
                  <small>Anteil an der Beschäftigung</small>
                  {render(m)}
                </button>
              ))}
            </div>
          )}
          <p className="atlas-comparison-note">
            Die Kurven verbinden nur benachbarte vorhandene Jahre. Ein Anteil
            kann auch wachsen, wenn andere Bereiche schrumpfen. Wegen eigener
            Skalen sind die Höhen verschiedener Karten nicht direkt
            vergleichbar.
          </p>
        </>
      )}
      <details className="atlas-source-details">
        <summary>Quelle und Grenzen der Beschäftigungsbilder</summary>
        <p>
          {cfg.release}. Geschlechter zusammen, Beschäftigung im ILO-Modell für
          die Bevölkerung ab 15 Jahren. Der Atlas verwendet die geprüften Jahre
          1991–2024; das zusätzliche Quellenjahr 2025 ist nicht als beobachtete
          Geschichte freigegeben.
        </p>
        <p>
          Die ILO schätzt fehlende Länderjahre und gleicht Reihen,
          Bevölkerungsgrundlagen und Methodenbrüche ab. Diese Kurven sind keine
          lückenlose Folge gemessener Erhebungen. Die neuere
          Beschäftigungsdefinition der 19. ICLS ist im Modell noch nicht überall
          umgesetzt; separate ICLS19-Erhebungen werden nicht angefügt.
        </p>
        <p>
          Die 14 Bereiche folgen der ILO-Fassung von ISIC Rev.4. D/E, H/J, L/M/N
          und R/S/T/U bleiben Sammelbereiche. Bildung enthält öffentliche und
          private Anbieter; Gesundheit umfasst auch Sozialarbeit. Es gibt keine
          getrennten Arbeitsplatzreihen für Solar, Wasserstoff oder Kernenergie.
        </p>
        <p>
          Anteile werden aus dem veröffentlichten Bereich und der
          Gesamtbeschäftigung desselben Landesjahres berechnet. Quellenrundung
          bleibt erhalten, ohne die Bereiche auf eine künstlich exakte Summe
          umzugewichten. Das Quellenkennzeichen A bedeutet „angepasst“; ein
          leeres Kennzeichen beweist keine Messung. Beide bleiben am Datenpunkt
          erhalten.
        </p>
        <p>
          Welt und Afrika sind veröffentlichte ILO-Modelle. Die App berechnet
          keine eigenen regionalen Mittel. Fehlende neuere Werte, beispielsweise
          für die Ukraine, bleiben offen.
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
            [cfg.sourceUrl, "ILOSTAT · Beschäftigung"],
            [cfg.methodologyUrl, "ILO-Methodik"],
          ].map(([url, label]) => (
            <Button size="sm" key={url} onClick={() => void openUrl(url)}>
              {label}
            </Button>
          ))}
        </div>
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
          : "ILO-Beschäftigungsdaten kostenlos laden"}
      </Button>
      {sync.error && <p role="alert">{message(sync.error)}</p>}
      {job?.seriesId === atlasLaborDataset && (
        <p role="status">{job.message}</p>
      )}
    </>
  );
}
