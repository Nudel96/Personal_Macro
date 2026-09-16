import { useContext, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { AtlasDisplayContext } from "./atlas-display-state";
import {
  atlasCommodityCatalog as cfg,
  atlasCommodityDataset,
  commoditySelection,
  commoditySeries,
  commoditySegments,
  commodityScale,
  validCommodityResponse,
  type CommodityBasis,
  type CommoditySeries,
} from "./atlas-commodities";
import type { AtlasSyncJob } from "./atlas-types";
import "./atlas-fiscal.css";
import "./atlas-innovation.css";

const fmt = (n: number) =>
  new Intl.NumberFormat("de", { maximumFractionDigits: 2 }).format(n);
const message = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Die Rohstoffpreise konnten nicht gelesen werden.";
export function CommodityChart({
  series,
  since,
  max,
  basis,
  numbers = false,
  large = false,
}: {
  series: CommoditySeries[];
  since: number;
  max: number;
  basis: CommodityBasis;
  numbers?: boolean;
  large?: boolean;
}) {
  const w = large ? 680 : 340,
    h = large ? 320 : 170,
    left = numbers ? 55 : 18,
    right = w - 18,
    top = 16,
    bottom = h - 33;
  const x = (year: number) =>
    left + ((year - since) / (cfg.lastYear - since)) * (right - left);
  const y = (n: number) => top + ((max - n) / max) * (bottom - top);
  const label = `${series.map((s) => s.metric.label).join(" und ")}. Internationale Referenzpreise. ${since} bis ${cfg.lastYear}. ${basis === "real" ? "Mit dem MUV-Index preisbereinigt" : "Nominal"}. Bezugsjahr 2010, gleicher Kalender und Maßstab. Quellenstatistik mit Schätzungen.`;
  return (
    <svg
      className="atlas-innovation-chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {[0, max / 2, max].map((n, i) => (
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
      <line
        x1={left}
        x2={right}
        y1={y(100)}
        y2={y(100)}
        stroke="var(--text-2)"
        strokeDasharray="4 5"
      />
      {[
        since,
        ...[1980, 2000, 2020].filter((n) => n > since && right - x(n) > 48),
        cfg.lastYear,
      ].map((n) => (
        <text
          key={n}
          x={x(n)}
          y={h - 8}
          textAnchor={
            n === since ? "start" : n === cfg.lastYear ? "end" : "middle"
          }
        >
          {n}
        </text>
      ))}
      {series.map((s, i) => (
        <g
          key={s.metric.id}
          style={{ color: i ? "var(--violet)" : "var(--primary-bright)" }}
        >
          {commoditySegments(s.points).map(([a, b]) => (
            <line
              key={b.year}
              x1={x(a.year)}
              x2={x(b.year)}
              y1={y(a.value)}
              y2={y(b.value)}
              stroke="currentColor"
              strokeWidth={1.8}
              strokeDasharray={i ? "5 3" : undefined}
            />
          ))}
          {s.points.map((p) => {
            const size = large ? 3.5 : 2.4;
            const props = {
              fill:
                p.boundary || p.discrepancy ? "var(--surface)" : "currentColor",
              stroke: "currentColor",
              strokeWidth: 1.3,
            };
            const title = (
              <title>
                {s.metric.label} · {p.year}
                {numbers
                  ? `: ${fmt(p.value)} (2010 = 100); Quellwert ${fmt(p.raw)} ${s.metric.unit}`
                  : ""}
                {p.boundary ? " · Quellen-/Definitionswechsel" : ""}
                {p.discrepancy ? ` · ${p.discrepancy}` : ""}
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
export function AtlasCommoditiesPanel({
  showNumbers,
  job,
  topicId,
}: {
  showNumbers: boolean;
  job: AtlasSyncJob | null | undefined;
  topicId: string;
}) {
  const context = useContext(AtlasDisplayContext);
  const [local, setLocal] = useState(new URLSearchParams());
  const selection = commoditySelection(context?.params ?? local, topicId);
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
    queryKey: ["atlas", "commodities"],
    queryFn: () => api.atlasCommodities(),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasCommodities(),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const data = query.data,
    usable = data && validCommodityResponse(data);
  const metrics = selection.metric
    ? [selection.metric, ...(selection.compare ? [selection.compare] : [])]
    : selection.visible;
  const series = metrics.map((m) =>
    usable ? commoditySeries(data, m, selection.basis, selection.since) : null,
  );
  const max = commodityScale(series);
  const fresh =
    data?.provenance &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86400000;
  return (
    <>
      <p className="atlas-explanation">
        Langsame Hochs und Tiefs internationaler Rohstoffpreise. Diese
        Referenzen gelten unabhängig vom ausgewählten Land. Das Bezugsjahr hilft
        beim Vergleich der Verläufe; es bestimmt keinen fairen Preis und keine
        Über- oder Unterbewertung.
      </p>
      <p className="atlas-notice">
        Internationale Referenzpreise · Jahresmittel · Quellenstatistik mit
        Schätzungen. Eine Landes- oder Vergleichsauswahl verändert diese Bilder
        nicht.
      </p>
      {query.isPending && (
        <p role="status">Lokale Rohstoffpreise werden gelesen …</p>
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
          <h3>Rohstoffbilder in der Desktop-App laden</h3>
          <p>
            Ein kostenloser Download der Weltbank erschließt 85 Preis- und
            Indexreihen in elf Gruppen. Die geprüften Jahreswerte reichen von
            1960 bis 2025 und bleiben danach offline verfügbar.
          </p>
        </div>
      )}
      {data?.status === "available" && !usable && (
        <p role="alert">
          Dieser gespeicherte Quellenstand passt nicht zum geprüften
          Rohstoffkatalog.
        </p>
      )}
      <div className="atlas-fiscal-controls">
        <label>
          Rohstoffgruppe{" "}
          <select
            className="input"
            value={selection.group}
            onChange={(e) =>
              navigate({
                commodityGroup: e.target.value,
                commodityMetric: "",
                commodityCompare: "",
                commoditySearch: "",
                commodityPage: "1",
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
          Preisbasis{" "}
          <select
            className="input"
            value={selection.basis}
            onChange={(e) => navigate({ commodityBasis: e.target.value })}
          >
            <option value="real">Preisbereinigt · MUV</option>
            <option value="nominal">Nominal · laufende Dollar</option>
          </select>
        </label>
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="Rohstoffzeitraum"
        >
          {[1960, 1980, 2000].map((y) => (
            <button
              type="button"
              key={y}
              aria-pressed={selection.since === y}
              onClick={() => navigate({ commoditySince: String(y) })}
            >
              Seit {y}
            </button>
          ))}
        </div>
      </div>
      {usable && (
        <>
          <p className="atlas-comparison-note">
            Alle sichtbaren Bilder teilen Kalender und Maßstab. Bezugsjahr: 2010
            {showNumbers ? " = 100" : ""} · gestrichelte Linie: damaliger
            Preisstand ·{" "}
            {selection.basis === "real"
              ? "mit dem MUV-Index auf die Preisbasis von 2010 bereinigt"
              : "nominale Preisentwicklung"}
            .
          </p>
          {selection.metric ? (
            <>
              <Button
                size="sm"
                onClick={() =>
                  navigate({ commodityMetric: "", commodityCompare: "" })
                }
              >
                Zur Rohstoffübersicht
              </Button>
              <h3>{selection.metric.label}</h3>
              <label>
                Weiteren Rohstoff vergleichen{" "}
                <select
                  className="input"
                  value={selection.compare?.id ?? ""}
                  onChange={(e) =>
                    navigate({ commodityCompare: e.target.value })
                  }
                >
                  <option value="">Ohne Vergleich</option>
                  {cfg.metrics
                    .filter((m) => m.id !== selection.metric!.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                </select>
              </label>
              <p className="atlas-fiscal-legend">
                {series.map(
                  (s, i) =>
                    s && (
                      <span
                        key={s.metric.id}
                        style={{
                          color: i ? "var(--violet)" : "var(--primary-bright)",
                        }}
                      >
                        {i ? "◆" : "●"} {s.metric.label}
                      </span>
                    ),
                )}
              </p>
              {series[0] ? (
                <CommodityChart
                  series={series.filter(
                    (s): s is CommoditySeries => s !== null,
                  )}
                  since={selection.since}
                  max={max}
                  basis={selection.basis}
                  numbers={showNumbers}
                  large
                />
              ) : (
                <p>
                  Keine vergleichbaren Werte für diesen Rohstoff im gewählten
                  Zeitraum.
                </p>
              )}
              {selection.compare && !series[1] && (
                <p>
                  Für den Vergleich fehlen geeignete Werte oder der Preis im
                  Bezugsjahr.
                </p>
              )}
              {metrics.some((m) => m.firstComparableYear > selection.since) && (
                <p className="atlas-notice">
                  Eisenerz wird erst ab 2009 eingezeichnet. Frühere
                  Quellenabschnitte verwenden abweichende Preis- und
                  Vertragsgrundlagen, deren historische Einheiten nicht
                  eindeutig vergleichbar sind.
                </p>
              )}
              {series.some((s) => s?.points.some((p) => p.discrepancy)) && (
                <p className="atlas-notice">
                  Der reale Öle-/Fetteindex 2014 weicht vom Abgleich mit
                  Nominalindex und MUV ab. Der veröffentlichte Wert bleibt als
                  unverbundener hohler Punkt erhalten.
                </p>
              )}
              <details className="atlas-source-details">
                <summary>Definition und Originalquelle dieser Reihen</summary>
                {metrics.map((m) => (
                  <div key={m.id}>
                    <h4>{m.label}</h4>
                    <p>{m.description}</p>
                    <p>
                      Originaleinheit: {m.unit}. {m.source}
                    </p>
                    {m.boundaryYears.length > 0 && (
                      <p>
                        Markierte Übergangsjahre: {m.boundaryYears.join(", ")}.
                        Das Übergangsjahr wird vorsichtig von beiden
                        Nachbarjahren getrennt.
                      </p>
                    )}
                  </div>
                ))}
              </details>
            </>
          ) : (
            <>
              <label>
                In dieser Gruppe suchen{" "}
                <input
                  className="input"
                  value={selection.search}
                  onChange={(e) =>
                    navigate({
                      commoditySearch: e.target.value,
                      commodityPage: "1",
                    })
                  }
                />
              </label>
              <div className="atlas-fiscal-grid">
                {selection.visible.map((m, i) => (
                  <button
                    type="button"
                    className="atlas-fiscal-card"
                    key={m.id}
                    aria-label={`${m.label} öffnen`}
                    onClick={() =>
                      navigate({ commodityMetric: m.id, commodityCompare: "" })
                    }
                  >
                    <strong>{m.label}</strong>
                    <small>Internationale Preisentwicklung · Bezug 2010</small>
                    {series[i] ? (
                      <CommodityChart
                        series={[series[i]!]}
                        since={selection.since}
                        max={max}
                        basis={selection.basis}
                        numbers={showNumbers}
                      />
                    ) : (
                      <p>Keine vergleichbaren Werte.</p>
                    )}
                    {m.firstComparableYear > selection.since && (
                      <small>
                        Eingezeichnet ab {m.firstComparableYear} · frühere
                        Einheiten ungeklärt
                      </small>
                    )}
                  </button>
                ))}
              </div>
              {!selection.visible.length && (
                <p>Keine passende Reihe in dieser Gruppe.</p>
              )}
              {selection.pages > 1 && (
                <div className="atlas-fiscal-controls">
                  <Button
                    size="sm"
                    disabled={selection.page <= 1}
                    onClick={() =>
                      navigate({ commodityPage: String(selection.page - 1) })
                    }
                  >
                    Vorherige Bilder
                  </Button>
                  <span>
                    Seite {selection.page} von {selection.pages}
                  </span>
                  <Button
                    size="sm"
                    disabled={selection.page >= selection.pages}
                    onClick={() =>
                      navigate({ commodityPage: String(selection.page + 1) })
                    }
                  >
                    Weitere Bilder
                  </Button>
                </div>
              )}
            </>
          )}
          <p className="atlas-comparison-note">
            Hohle Punkte markieren geprüfte Quellen- und Definitionsübergänge
            oder eine Quellenabweichung. Linien verbinden nur benachbarte
            verfügbare Jahre außerhalb dieser Grenzen. Jahresmittel können
            Bewegungen innerhalb des Jahres verdecken.
          </p>
        </>
      )}
      <details className="atlas-source-details">
        <summary>Quelle und Grenzen der Rohstoffbilder</summary>
        <p>
          World Bank · Pink Sheet · September 2026 · historische Jahresmittel
          1960–2025. Diese internationale Auswahl enthält spezielle Sorten,
          Handelsplätze und Referenzmärkte. Sie ist keine vollständige
          Länderstatistik.
        </p>
        <p>
          Der MUV-Index misst Exportpreise verarbeiteter Güter. Die reale
          Darstellung verwendet die von der Weltbank veröffentlichten, damit
          bereinigten Preise in Dollar von 2010. Sie entspricht keiner
          nationalen Verbraucherpreisinflation oder persönlichen Kaufkraft.
        </p>
        <p>
          Für den Bildvergleich wird jede Reihe durch ihren eigenen
          veröffentlichten Wert von 2010 geteilt. Unterschiedliche Preisniveaus
          und Einheiten werden dadurch vergleichbar skaliert. Ein höherer
          Bildpunkt bedeutet einen höheren Preis relativ zu diesem Bezugsjahr.
        </p>
        <p>
          Die breiten Weltbank-Indizes verwenden feste Exportgewichte.
          Übergeordnete Gruppen und Teilindizes überlappen und werden im Atlas
          nicht zusammengerechnet. Die Quelle enthält Schätzungen und
          historische Spezifikationswechsel, jedoch keinen Messstatus je Zelle.
          Fehlwerte bleiben leer.
        </p>
        {data?.provenance && (
          <p>
            Lokal geladen:{" "}
            {new Date(data.provenance.retrievedAt).toLocaleString("de-DE")}.
            Ausgabe und Dateiprüfsumme bleiben in gemerkten Ansichten erhalten.
          </p>
        )}
        <Button size="sm" onClick={() => void openUrl(cfg.sourceUrl)}>
          Weltbank · Rohstoffquellen
        </Button>
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
          : "Rohstoffpreise kostenlos laden"}
      </Button>
      {sync.error && <p role="alert">{message(sync.error)}</p>}
      {job?.seriesId === atlasCommodityDataset && (
        <p role="status">{job.message}</p>
      )}
    </>
  );
}
