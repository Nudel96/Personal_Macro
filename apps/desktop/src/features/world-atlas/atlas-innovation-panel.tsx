import { useContext, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { AtlasDisplayContext } from "./atlas-display-state";
import {
  atlasInnovationCatalog as cfg,
  atlasInnovationDataset,
  innovationSelection,
  innovationView,
  innovationSegments,
  type InnovationMetric,
  type InnovationView,
} from "./atlas-innovation";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";
import "./atlas-fiscal.css";
import "./atlas-innovation.css";

const fmt = (n: number) =>
  new Intl.NumberFormat("de", { maximumFractionDigits: 0 }).format(n);
const message = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Die WIPO-Daten konnten nicht gelesen werden.";
export function InnovationChart({
  view,
  metric,
  numbers = false,
  large = false,
}: {
  view: InnovationView;
  metric: InnovationMetric;
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
      (n % 10 === 0 && n - view.first > 3 && view.last - n > 3),
  );
  const label = `${metric.label}. ${view.series.map((s) => s.name).join(" und ")}. ${view.first} bis ${view.last}. Patentveröffentlichungen nach Herkunft. WIPO-Quellenjahre. Kreise: Hauptland; Rauten: Vergleich. Lücken bleiben offen; 2024 ist ein unverbundenes Randjahr.`;
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
              {fmt(n)}
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
          {innovationSegments(s.points).map(([a, b]) => (
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
                {numbers ? `: ${fmt(p.value)} Patentveröffentlichungen` : ""}
                {p.boundary ? " · Randjahr, Nachmeldungen möglich" : ""}
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
export function AtlasInnovationPanel({
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
  const selection = innovationSelection(context?.params ?? local, topicId);
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
    queryKey: ["atlas", "innovation", geography.id],
    queryFn: () => api.atlasInnovation(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "innovation", compareId],
    queryFn: () => api.atlasInnovation(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasInnovation(),
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
  const render = (m: InnovationMetric, large = false) => {
    const combined = innovationView(
      rows,
      m,
      selection.since,
      selection.through,
    );
    const view =
      combined ??
      innovationView(rows.slice(0, 1), m, selection.since, selection.through);
    return (
      <>
        {view ? (
          <InnovationChart
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
                  `${s.name} ${fmt(s.points.find((p) => p.year === view.lastCommonYear)!.value)}`,
              )
              .join(" · ")}
            {view.lastCommonYear === 2024 ? " · Randjahr" : ""}
          </p>
        )}
      </>
    );
  };
  return (
    <>
      <p className="atlas-explanation">
        Wo technische Ideen zum Patentschutz angemeldet werden: langfristige
        Technologiegeschichte nach Herkunft der Anmeldenden. Patentaktivität
        zeigt weder faire Börsenwerte noch die Qualität oder den
        wirtschaftlichen Erfolg einer Erfindung.
      </p>
      {topicId === "innovation:advanced_materials" && (
        <p className="atlas-notice">
          Ergänzende Teilperspektive: WIPO-Patentveröffentlichungen zur
          Mikrostruktur- und Nanotechnologie. Dieses Technologiefeld deckt
          fortschrittliche Materialien nur teilweise ab und misst keine
          Materialproduktion. Der separate EU-Bericht verwendet eine andere
          Patentabgrenzung.
        </p>
      )}
      {query.isPending && (
        <p role="status">Lokale Technologiedaten werden gelesen …</p>
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
          <h3>Technologiebilder in der Desktop-App laden</h3>
          <p>
            Ein kostenloser WIPO-Abruf erschließt 35 Technologiefelder und nicht
            zugeordnete Veröffentlichungen für 199 heutige Länder und Gebiete.
            Die Bilder bleiben danach offline verfügbar.
          </p>
        </div>
      )}
      {data?.status === "unsupported_area" && (
        <div className="atlas-empty">
          <h3>Kein eigenes WIPO-Profil für dieses Gebiet</h3>
          <p>
            Der geprüfte Export enthält Herkunftsländer. Welt- und
            Kontinentmittel werden hier nicht gebildet. Historische Staaten
            werden keinem heutigen Nachfolger zugeschlagen.
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
                : "Das Vergleichsgebiet besitzt kein eigenes WIPO-Profil. Das Hauptland bleibt sichtbar."}
          </p>
        )}
      <div className="atlas-fiscal-controls">
        <label>
          Technologiebilder ordnen{" "}
          <select
            className="input"
            value={selection.group}
            onChange={(e) =>
              navigate({
                innovationGroup: e.target.value,
                innovationMetric: "overview",
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
          aria-label="WIPO-Zeitraum"
        >
          {[1980, 2000, 2010].map((y) => (
            <button
              type="button"
              key={y}
              aria-pressed={selection.since === y}
              onClick={() => navigate({ innovationSince: String(y) })}
            >
              Seit {y}
            </button>
          ))}
        </div>
        <label className="atlas-innovation-boundary">
          <input
            type="checkbox"
            checked={selection.through === 2024}
            onChange={(e) =>
              navigate({
                innovationThrough: e.target.checked ? "2024" : "2023",
              })
            }
          />
          Randjahr 2024 ergänzen
        </label>
      </div>
      {selection.through === 2024 && (
        <p className="atlas-notice">
          2024 ist zeitlich noch empfindlich: Veröffentlichung und Erfassung
          können verzögert sein. Hohle, unverbundene Zeichen verhindern, dass
          ein möglicher Melderückstand wie ein gesicherter Einbruch aussieht.
        </p>
      )}
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
            Patentveröffentlichungen · pro Fachgebiet eine eigene Skala ab Null
            · beide Länder im selben Kalender und Maßstab
          </p>
          {selected ? (
            <>
              <Button
                size="sm"
                onClick={() => navigate({ innovationMetric: "overview" })}
              >
                Zur Themenübersicht
              </Button>
              <h3>{selected.label}</h3>
              {render(selected, true)}
              <p className="atlas-comparison-note">
                WIPO-Fachgebiet: {selected.sourceLabel}. Die Zuordnung folgt
                Patentklassen; sie bildet keinen vollständigen Wirtschaftssektor
                ab.
              </p>
            </>
          ) : (
            <div className="atlas-fiscal-grid">
              {metrics.map((m) => (
                <button
                  type="button"
                  className="atlas-fiscal-card"
                  key={m.id}
                  onClick={() => navigate({ innovationMetric: m.id })}
                >
                  <strong>{m.label}</strong>
                  <small>Patentveröffentlichungen nach Herkunft</small>
                  {render(m)}
                </button>
              ))}
            </div>
          )}
          <p className="atlas-comparison-note">
            Leere Jahre bleiben offen. Linien verbinden nur benachbarte
            Quellenjahre; Meldelücken und Methodenänderungen können die Form
            beeinflussen. Die Höhe zwischen verschiedenen Fachgebieten ist wegen
            eigener Skalen nicht direkt vergleichbar.
          </p>
        </>
      )}
      <details className="atlas-source-details">
        <summary>Quelle und Grenzen der Technologiebilder</summary>
        <p>
          {cfg.release}. Die Standardansicht reicht bis 2023. Der
          WIPO-Jahresbericht 2025 verwendet für Technikfelder ebenfalls 2023 und
          erläutert den Veröffentlichungsverzug. 2024 wird hier vorsichtig als
          Randjahr markiert; die Quelle liefert kein vorläufiges Kennzeichen je
          Einzelwert.
        </p>
        <p>
          Herkunft bedeutet Wohnsitz der zuerst genannten anmeldenden Person
          oder Organisation, nicht Patentamt oder Absatzmarkt. Erfasst werden
          veröffentlichte Patentanmeldungen, keine erteilten Patente und keine
          eindeutige Zahl neuer Erfindungen. Anmeldungen in mehreren
          Rechtsräumen können mehrfach vorkommen.
        </p>
        <p>
          Übernommen wird die WIPO-Auswahl „Total count by applicant’s origin“.
          Technologieübergreifende Zuordnungen verwendet WIPO anteilig; der
          Export veröffentlicht gerundete Werte. Seine Summen werden unverändert
          übernommen. Leere Felder lassen offen, ob Meldungen fehlen oder keine
          Aktivität vorlag.
        </p>
        <p>
          Die sieben Gruppen dienen der Übersicht. „Nicht zugeordnet“ ist ein
          eigener Quellenbereich. Historische Staaten bleiben ausgeschlossen;
          fehlende Gebiete und Kontinente werden nicht geschätzt. Die Werte sind
          weder je Einwohner noch um wirtschaftliche Größe bereinigt.
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
            [cfg.sourceUrl, "WIPO Statistics Database"],
            [cfg.methodologyUrl, "WIPO-Methodik"],
            [cfg.reportUrl, "WIPO-Jahresbericht"],
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
          : "WIPO-Technologiedaten kostenlos laden"}
      </Button>
      {sync.error && <p role="alert">{message(sync.error)}</p>}
      {job?.seriesId === atlasInnovationDataset && (
        <p role="status">{job.message}</p>
      )}
    </>
  );
}
