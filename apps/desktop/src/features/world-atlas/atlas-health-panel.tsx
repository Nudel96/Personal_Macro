import { useContext, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { AtlasDisplayContext } from "./atlas-display-state";
import {
  atlasHealthCatalog as cfg,
  atlasHealthDataset,
  healthSelection,
  healthView,
  healthUnits,
  healthCountryNote,
  type AtlasHealthResponse,
  type HealthMetric,
  type HealthView,
} from "./atlas-health";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";
import "./atlas-fiscal.css";
import "./atlas-health.css";

const fmt = (n: number) =>
  new Intl.NumberFormat("de", { maximumFractionDigits: 2 }).format(n);
const message = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Die WHO-Daten konnten nicht gelesen werden.";
export function HealthChart({
  view,
  metric,
  numbers = false,
  large = false,
}: {
  view: HealthView;
  metric: HealthMetric;
  numbers?: boolean;
  large?: boolean;
}) {
  const w = large ? 680 : 340,
    h = large ? 330 : 145;
  const left = numbers ? 52 : 18,
    right = w - 18,
    top = 15,
    bottom = h - 29;
  const x = (year: number) =>
    view.last === view.first
      ? (left + right) / 2
      : left +
        ((year - view.first) / (view.last - view.first)) * (right - left);
  const y = (n: number) =>
    top + ((view.max - n) / (view.max - view.min)) * (bottom - top);
  const years = Array.from(
    { length: view.last - view.first + 1 },
    (_, i) => view.first + i,
  ).filter(
    (n) =>
      n === view.first ||
      n === view.last ||
      (n % 5 === 0 && n - view.first > 1 && view.last - n > 1),
  );
  const label = `${metric.label}. ${view.series.map((s) => s.name).join(" und ")}. ${view.first} bis ${view.last}. ${healthUnits[metric.unit]}. WHO-Statistik mit Schätzungen. Kreise: Hauptland; Rauten: Vergleich. Hohle Zeichen: vorläufig ab 2024. Jahreswerte werden nicht verbunden.`;
  return (
    <svg
      className="atlas-health-chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {[view.min, (view.min + view.max) / 2, view.max].map((n, i) => (
        <g key={i}>
          <line
            x1={left}
            x2={right}
            y1={y(n)}
            y2={y(n)}
            stroke="var(--border)"
          />
          {numbers && (
            <text x={left - 7} y={y(n) + 4} textAnchor="end">
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
            n === view.first && view.first !== view.last
              ? "start"
              : n === view.last && view.first !== view.last
                ? "end"
                : "middle"
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
            const size = large ? 4.5 : 3.2;
            const props = {
              fill: p.preliminary ? "var(--surface)" : "currentColor",
              stroke: "currentColor",
              strokeWidth: 1.7,
            };
            const title = numbers ? (
              <title>
                {s.name} · {p.year}: {fmt(p.value)} {healthUnits[metric.unit]}
                {p.preliminary ? " · vorläufig" : ""}
              </title>
            ) : null;
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
function SourceNotes({ rows }: { rows: AtlasHealthResponse[] }) {
  const [field, setField] = useState("fs");
  const fields = [
    ...new Map(
      rows
        .flatMap((r) => r.profile?.metadata ?? [])
        .map((m) => [m.field, m.label]),
    ).entries(),
  ].sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <details className="atlas-source-details atlas-health-notes">
      <summary>Länderhinweise und ursprüngliche Erhebungsquellen</summary>
      <p>
        Die WHO dokumentiert Quellen und Schätzungen für Ausgangsgrößen und
        Zeiträume. Daraus ergibt sich kein zuverlässiges Kennzeichen je
        einzelner Zahl. Fehlende Methodenzeilen bedeuten keine bestätigte
        Messung. Die englischen Originaltexte bleiben vollständig erhalten.
      </p>
      {rows.map(
        (r) =>
          r.profile && (
            <section key={r.geography.id}>
              <h4>{r.geography.label}</h4>
              <p>
                {r.profile.notes.footnote ??
                  "Kein allgemeiner Länderhinweis veröffentlicht."}
              </p>
              <p>
                {r.profile.notes.releaseNote ??
                  "Kein zusätzlicher Hinweis zur Ausgabe veröffentlicht."}
              </p>
            </section>
          ),
      )}
      <label>
        Ausgangsgröße der WHO{" "}
        <select
          className="input"
          value={fields.some(([id]) => id === field) ? field : ""}
          onChange={(e) => setField(e.target.value)}
        >
          <option value="" disabled>
            Ausgangsgröße wählen
          </option>
          {fields.map(([id, label]) => (
            <option key={id} value={id}>
              {id} · {label}
            </option>
          ))}
        </select>
      </label>
      {rows.map((r) => {
        const m = r.profile?.metadata.find((entry) => entry.field === field);
        return (
          <section key={r.geography.id}>
            <h4>{r.geography.label}</h4>
            {m ? (
              <>
                <p>
                  {m.longCode} · {m.label}
                </p>
                {[
                  ["Quelle", m.sources],
                  ["Datenart", m.dataType],
                  ["Schätzmethode", m.methods],
                  ["Kommentar", m.comments],
                  ["Hinweis", m.footnote],
                ].map(
                  ([label, text]) =>
                    text && (
                      <p key={label}>
                        <strong>{label}:</strong> {text}
                      </p>
                    ),
                )}
              </>
            ) : (
              <p>Für diese Ausgangsgröße fehlt eine eigene Methodenzeile.</p>
            )}
          </section>
        );
      })}
    </details>
  );
}
export function AtlasHealthPanel({
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
  const selection = healthSelection(context?.params ?? local, topicId);
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
    queryKey: ["atlas", "health", geography.id],
    queryFn: () => api.atlasHealth(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "health", compareId],
    queryFn: () => api.atlasHealth(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasHealth(),
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
  const render = (m: HealthMetric, large = false) => {
    const combined = healthView(rows, m, selection.since);
    const view = combined ?? healthView(rows.slice(0, 1), m, selection.since);
    return (
      <>
        {view ? (
          <HealthChart
            view={view}
            metric={m}
            numbers={showNumbers}
            large={large}
          />
        ) : (
          <p>Keine eigenen Werte im gewählten Zeitraum.</p>
        )}
        {view && (
          <small>
            {view.first}–{view.last} ·{" "}
            {view.series.map((s) => s.name).join(" und ")}
          </small>
        )}
        {compare && !combined && (
          <p className="atlas-comparison-note">
            Für {compare.geography.label} fehlen gemeinsame Werte dieser
            Messgröße im gleichen Quellenstand.{" "}
            {view ? "Das Hauptland bleibt sichtbar." : ""}
          </p>
        )}
        {view && showNumbers && (
          <p className="atlas-comparison-note">
            {view.series.length > 1 ? "Gemeinsames Jahr" : "Letztes Jahr"}{" "}
            {view.lastCommonYear}:{" "}
            {view.series
              .map(
                (s) =>
                  `${s.name} ${fmt(s.points.find((p) => p.year === view.lastCommonYear)!.value)}`,
              )
              .join(" · ")}
            {view.lastCommonYear >= 2024 ? " · vorläufig" : ""}
          </p>
        )}
      </>
    );
  };
  return (
    <>
      <p className="atlas-explanation">
        Wie Länder Gesundheit finanzieren und welche Versorgung sie bezahlen.
        WHO-Statistik mit Schätzungen seit frühestens 2000. Die Ausgaben zeigen
        wirtschaftliche Strukturen, keine faire Börsenbewertung.
      </p>
      {query.isPending && (
        <p role="status">Lokale Gesundheitsdaten werden gelesen …</p>
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
          <h3>Gesundheitsbilder in der Desktop-App laden</h3>
          <p>
            Ein kostenloser Abruf der WHO-Dateien versorgt alle 195 enthaltenen
            Länder und Gebiete. Danach bleiben die Bilder offline verfügbar.
          </p>
        </div>
      )}
      {data?.status === "unsupported_area" && (
        <div className="atlas-empty">
          <h3>Kein eigenes WHO-Profil für dieses Gebiet</h3>
          <p>
            Die geprüfte Datei liefert Länderwerte. Welt- und Kontinentmittel
            werden hier nicht berechnet.
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
                : "Das Vergleichsgebiet besitzt kein eigenes WHO-Profil. Das Hauptland bleibt sichtbar."}
          </p>
        )}
      <div className="atlas-fiscal-controls">
        <label>
          Gesundheitsbilder ordnen{" "}
          <select
            className="input"
            value={selection.group}
            onChange={(e) =>
              navigate({
                healthGroup: e.target.value,
                healthMetric: "overview",
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
          aria-label="WHO-Zeitraum"
        >
          {[2000, 2010, 2015, 2020].map((y) => (
            <button
              type="button"
              key={y}
              aria-pressed={selection.since === y}
              onClick={() => navigate({ healthSince: String(y) })}
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
            <span>Hohle Zeichen: vorläufige Werte ab 2024</span>
          </p>
          <p className="atlas-comparison-note">
            Jahreswerte · pro Messgröße eine eigene Skala · im Ländervergleich
            derselbe Kalender und Maßstab
          </p>
          {selected ? (
            <>
              <Button
                size="sm"
                onClick={() => navigate({ healthMetric: "overview" })}
              >
                Zur Themenübersicht
              </Button>
              <h3>{selected.label}</h3>
              <p>{selected.scopeNote}</p>
              <p className="atlas-chart-label">{healthUnits[selected.unit]}</p>
              {render(selected, true)}
              <details className="atlas-source-details">
                <summary>Definition dieser Messgröße</summary>
                <p>{selected.definition[1]}</p>
                <p>{selected.definition[7]}</p>
                <p>WHO-Kennung: {selected.field}</p>
              </details>
            </>
          ) : (
            <div className="atlas-fiscal-grid">
              {metrics.map((m) => (
                <button
                  type="button"
                  className="atlas-fiscal-card"
                  key={m.id}
                  onClick={() => navigate({ healthMetric: m.id })}
                >
                  <strong>{m.label}</strong>
                  <small>{healthUnits[m.unit]}</small>
                  {render(m)}
                  <small>{m.scopeNote}</small>
                </button>
              ))}
            </div>
          )}
          <p className="atlas-comparison-note">
            Methodenwechsel können Sprünge verursachen; die Jahrespunkte werden
            deshalb nicht verbunden. Untergruppen können sich überschneiden.
          </p>
          {rows.map(
            (r) =>
              healthCountryNote(r.profile!.providerCode) && (
                <p key={r.geography.id} className="atlas-comparison-note">
                  {healthCountryNote(r.profile!.providerCode)}
                </p>
              ),
          )}
          <SourceNotes rows={rows} />
        </>
      )}
      <details className="atlas-source-details">
        <summary>Quelle und Grenzen der Gesundheitsbilder</summary>
        <p>
          {cfg.release}. Der Download heißt weiterhin „März 2026“, enthält aber
          die Korrektur vom 1. April. Daten bis 2023 umfassen Meldungen und
          WHO-Schätzungen. Vorläufige Werte für 2024 sind unvollständig und
          können sich ändern.
        </p>
        <p>
          Dollarwerte sind laufende US-Dollar: Inflation und Wechselkurse wirken
          mit. Anteile haben unterschiedliche Nenner und sind keine Messung von
          Versorgungsqualität oder Behandlungserfolg. Veröffentlichte Werte über
          hundert werden nicht gekürzt.
        </p>
        <p>
          Die WHO-Grundversorgung enthält unter anderem ambulante Leistungen,
          Prävention sowie fest zugeteilte Anteile von Gütern und Verwaltung.
          Pflege erfasst den gesundheitlichen Teil. Arzneimittel insgesamt sind
          ein zusätzlicher Merkposten. Investitionen stehen getrennt von
          laufenden Ausgaben; fehlende Kapitaldaten ergänzt die WHO nicht durch
          Schätzungen.
        </p>
        {data?.provenance && (
          <p>
            Lokal geladen:{" "}
            {new Date(data.provenance.retrievedAt).toLocaleString("de-DE")}.
            Beide WHO-Dateien und ihre Herkunft bleiben in gemerkten Ansichten
            erhalten.
          </p>
        )}
        <div className="atlas-fiscal-links">
          {[
            [cfg.sourceUrl, "WHO-Daten und Dokumentation"],
            [cfg.methodologyUrl, "WHO-Methodik"],
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
          : "WHO-Gesundheitsdaten kostenlos laden"}
      </Button>
      {sync.error && <p role="alert">{message(sync.error)}</p>}
      {job?.seriesId === atlasHealthDataset && (
        <p role="status">{job.message}</p>
      )}
    </>
  );
}
