import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { atlasCatalog } from "./atlas-catalog";
import { useAtlasDisplayChoice } from "./atlas-display-state";
import {
  relativeBenchmark,
  relativePicture,
  relativeProxies,
  relativeProxiesFor,
  relativeRecipe,
  type RelativePicture,
} from "./atlas-relative";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";

const format = (n: number) =>
  n.toLocaleString("de", { maximumFractionDigits: 2 });
export function AtlasRelativeChart({
  picture,
  showNumbers,
}: {
  picture: RelativePicture;
  showNumbers: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(900);
  useLayoutEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const resize = () => {
      const measured = node.getBoundingClientRect().width;
      if (measured >= 260) setWidth(Math.round(measured));
    };
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const values = picture.rows.flatMap((r) =>
    r.points.flatMap((p) => (p.value === null ? [] : [p.value])),
  );
  const low = Math.min(100, ...values),
    high = Math.max(100, ...values);
  const pad = Math.max(5, (high - low) * 0.12),
    min = Math.max(0, low - pad),
    max = high + pad;
  const x = (i: number) =>
    55 + (i / (picture.rows[0].points.length - 1)) * (width - 110);
  const y = (v: number) => 275 - ((v - min) / (max - min)) * 245;
  return (
    <>
      <div className="atlas-chart-label">
        <span>
          Oben: stärker als die Referenz seit Beginn · unten: schwächer
        </span>
        <span>
          {picture.first}–{picture.last}
        </span>
      </div>
      <svg
        ref={svgRef}
        className="atlas-relative-chart"
        viewBox={`0 0 ${width} 320`}
        role="img"
        aria-label={`Relative Marktstärke von ${picture.first} bis ${picture.last}. Gemeinsamer Beginn als Basis. Datenlücken bleiben offen.`}
        style={{ width: "100%", display: "block" }}
      >
        <line
          x1="55"
          x2={width - 55}
          y1={y(100)}
          y2={y(100)}
          stroke="var(--text-2)"
          strokeDasharray="5 5"
        />
        {showNumbers &&
          [min, 100, max].map((v) => (
            <text
              key={v}
              x="48"
              y={y(v) + 4}
              textAnchor="end"
              fill="var(--text-2)"
              fontSize="12"
            >
              {format(v)}
            </text>
          ))}
        {[
          0,
          Math.floor((picture.rows[0].points.length - 1) / 2),
          picture.rows[0].points.length - 1,
        ].map((i) => (
          <text
            key={i}
            x={x(i)}
            y="305"
            textAnchor="middle"
            fill="var(--text-2)"
            fontSize="12"
          >
            {picture.rows[0].points[i].month}
          </text>
        ))}
        {picture.rows.map((row, ri) => {
          let pen = false;
          const d = row.points
            .map((p, i) => {
              if (p.value === null) {
                pen = false;
                return "";
              }
              const part = `${pen ? "L" : "M"}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`;
              pen = true;
              return part;
            })
            .join(" ");
          const color = ri === 0 ? "var(--primary-bright)" : "var(--violet)";
          return (
            <g key={row.id} data-relative-proxy={row.id}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeDasharray={ri ? "7 4" : undefined}
              />
              {row.points.map(
                (p, i) =>
                  p.value !== null && (
                    <circle
                      key={p.month}
                      cx={x(i)}
                      cy={y(p.value)}
                      r="2.4"
                      fill={color}
                    >
                      <title>{`${row.label} · ${p.month} · ${showNumbers ? `${format(p.value)} · Basis 100` : p.value > 100 ? "Stärker als die Referenz seit Beginn" : p.value < 100 ? "Schwächer als die Referenz seit Beginn" : "Gemeinsamer Beginn"}`}</title>
                    </circle>
                  ),
              )}
            </g>
          );
        })}
      </svg>
      <div className="atlas-chart-label">
        {picture.rows.map((r, i) => (
          <span key={r.id}>
            {i ? "Gestrichelt" : "Durchgezogen"}: {r.label} / {r.benchmark}
          </span>
        ))}
      </div>
      {showNumbers && (
        <details className="atlas-details">
          <summary>Relative Monatswerte als Tabelle</summary>
          <div className="atlas-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Monat</th>
                  {picture.rows.map((r) => (
                    <th key={r.id}>
                      {r.label} / {r.benchmark} · Basis 100
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {picture.rows[0].points.map((p, i) => (
                  <tr key={p.month}>
                    <td>{p.month}</td>
                    {picture.rows.map((r) => (
                      <td key={r.id}>
                        {r.points[i].value === null
                          ? "Nicht verfügbar"
                          : format(r.points[i].value!)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}

export function AtlasRelativePanel({
  geography,
  compareId,
  proxyId,
  showNumbers,
  job,
  onProxyChange,
  onAreaChange,
}: {
  geography: AtlasGeography;
  compareId?: string;
  proxyId?: string;
  showNumbers: boolean;
  job: AtlasSyncJob | null | undefined;
  onProxyChange: (id: string) => void;
  onAreaChange: (area: AtlasGeography) => void;
}) {
  const [horizon, setHorizon] = useAtlasDisplayChoice<number | null>(
    "relativeHorizon",
    20,
    [10, 20, null],
  );
  const choices = relativeProxiesFor(geography.id);
  const proxy = choices.find((p) => p.id === proxyId) ?? choices[0];
  const benchmark = proxy ? relativeBenchmark(proxy) : undefined;
  const other =
    compareId && compareId !== geography.id
      ? relativeProxiesFor(compareId)[0]
      : undefined;
  const comparable =
    other && benchmark && relativeBenchmark(other).id === benchmark.id
      ? other
      : undefined;
  const selected =
    proxy && benchmark
      ? [proxy, benchmark, ...(comparable ? [comparable] : [])]
      : [];
  const queries = useQueries({
    queries: selected.map((p) => ({
      queryKey: ["atlas", "market", p.id],
      queryFn: () => api.atlasMarket(p.id),
    })),
  });
  const client = useQueryClient();
  const sync = useMutation({
    mutationFn: (id: string) => api.syncAtlasMarket(id),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const data = queries[0]?.data,
    base = queries[1]?.data,
    comparison = queries[2]?.data;
  const ownPicture =
    data && base
      ? relativePicture([{ market: data, benchmark: base }], horizon)
      : null;
  const comparisonPicture =
    data && base && comparison?.status === "available"
      ? relativePicture(
          [
            { market: data, benchmark: base },
            { market: comparison, benchmark: base },
          ],
          horizon,
        )
      : null;
  const picture = comparisonPicture ?? ownPicture;
  const busy = sync.isPending || job?.status === "running";
  if (!proxy || !benchmark)
    return (
      <div className="atlas-empty">
        <h3>Für {geography.label} fehlt ein eigener Marktvergleich</h3>
        <p>
          Die vorhandenen Fonds decken ausgewählte Aktienmärkte und globale
          Themen ab. Ein globaler Fonds wird nicht als Landeswert eingesetzt.
        </p>
        <label>
          Verfügbares Marktgebiet
          <select
            className="input"
            aria-label="Verfügbares Marktgebiet"
            value=""
            onChange={(e) => {
              const area = atlasCatalog.geographies.find(
                (g) => g.id === e.target.value,
              );
              if (area) onAreaChange(area);
            }}
          >
            <option value="">Gebiet auswählen</option>
            {[...new Set(relativeProxies.map((p) => p.geographyId))].map(
              (id) => (
                <option key={id} value={id}>
                  {atlasCatalog.geographies.find((g) => g.id === id)?.label}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
    );
  return (
    <div className="atlas-relative-panel">
      <p className="atlas-explanation">
        Monatlicher Fondsvergleich in USD. Eine steigende Linie bedeutet eine
        stärkere Entwicklung gegenüber der Referenz; auch bei fallenden Kursen
        ist das möglich. Die Mittellinie ist der gemeinsame Beginn, kein fairer
        Wert.
      </p>
      <label className="atlas-market-picker">
        Markt auswählen
        <select
          className="input"
          value={proxy.id}
          onChange={(e) => onProxyChange(e.target.value)}
        >
          {choices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <div className="atlas-market-scope">
        <div>
          <strong>Referenz: {benchmark.label}</strong>
          <span>{proxy.scope} · Fonds als Marktstellvertreter</span>
        </div>
      </div>
      <div
        className="atlas-wave-horizons"
        role="group"
        aria-label="Zeitraum der relativen Stärke"
      >
        {([10, 20, null] as const).map((h) => (
          <button
            key={String(h)}
            type="button"
            aria-pressed={horizon === h}
            onClick={() => setHorizon(h)}
          >
            {h ? `${h} Jahre` : "Gesamte gemeinsame Geschichte"}
          </button>
        ))}
      </div>
      {queries.some((q) => q.isPending) && (
        <p role="status">Lokale Monatskurse werden gelesen …</p>
      )}
      {queries.some((q) => q.error) && (
        <p role="alert">
          Mindestens eine Marktgeschichte konnte nicht gelesen werden.{" "}
          <Button
            size="sm"
            onClick={() => queries.forEach((q) => void q.refetch())}
          >
            Erneut prüfen
          </Button>
        </p>
      )}
      {picture ? (
        <>
          <AtlasRelativeChart picture={picture} showNumbers={showNumbers} />
          {picture.breakAfter && (
            <p className="atlas-notice">
              Die vergleichbare Geschichte beginnt nach dem letzten Katalogbruch
              ({picture.breakAfter}). Frühere Sektorzusammensetzungen werden
              nicht verbunden.
            </p>
          )}
          {picture.missingMonths > 0 && (
            <p className="atlas-notice">
              Fehlende Monatskurse bleiben als Lücken sichtbar.
            </p>
          )}
          {picture.stale && (
            <p className="atlas-notice">
              Ältere oder unvollständige Marktgeschichte · die aktuelle relative
              Lage bleibt offen.
            </p>
          )}
          {picture.differentSourceDates && (
            <p className="atlas-notice">
              Die Fondshistorien wurden an unterschiedlichen Tagen abgerufen.
              Rückwirkende Kursbereinigungen können sich zwischen Quellenständen
              unterscheiden.
            </p>
          )}
        </>
      ) : (
        !queries.some((q) => q.isPending || q.error) && (
          <div className="atlas-empty">
            <h3>Noch kein gemeinsames Monatsbild verfügbar</h3>
            <p>
              Beide bereinigten Fondshistorien und mindestens zwei gemeinsame
              Beobachtungen werden benötigt. Im Browser werden keine Kurse
              erfunden.
            </p>
          </div>
        )
      )}
      {compareId && compareId !== geography.id && !comparable && (
        <p className="atlas-notice">
          Für das gewählte Vergleichsgebiet fehlt ein Marktbild mit derselben
          Referenz. Die eigene Auswahl bleibt erhalten.
        </p>
      )}
      {comparable && !comparisonPicture && !queries[2]?.isPending && (
        <p className="atlas-notice">
          Für beide Länder fehlen gemeinsame nutzbare Monatskurse. Das
          vorhandene eigene Bild bleibt mit seiner eigenen Basis sichtbar.
        </p>
      )}
      <div className="atlas-download">
        {selected.map((p, i) => (
          <Button
            key={p.id}
            size="sm"
            disabled={
              !isTauri() ||
              busy ||
              Boolean(
                queries[i].data?.provenance &&
                Date.now() -
                  Date.parse(queries[i].data!.provenance!.retrievedAt) <
                  86_400_000,
              )
            }
            onClick={() => sync.mutate(p.id)}
          >
            {p.symbol.replace(".US", "")} aktualisieren
          </Button>
        ))}
      </div>
      {sync.error && (
        <p role="alert">
          {String(
            sync.error instanceof Error
              ? sync.error.message
              : "Die Aktualisierung konnte nicht gestartet werden.",
          )}
        </p>
      )}
      <details className="atlas-details">
        <summary>Quelle und Bedeutung</summary>
        <p>
          Berechnung: (Monatskurs / Referenzkurs), relativ zum ersten
          gemeinsamen gültigen Monat im gewählten Zeitraum. Bei einem
          Ländervergleich verwenden beide Linien denselben Startmonat. Mit
          Zahlen ist dieser Beginn 100. Ein Wechsel des Zeitfensters ändert die
          Basis.
        </p>
        <p>
          Je Fonds wird der letzte gelieferte Handelstagskurs des
          abgeschlossenen Monats verwendet. Der lokale Monatscache enthält keine
          taggenauen Zeitstempel je Beobachtung; ein identischer Handelstag wird
          daher nicht behauptet. EODHD adjusted_close berücksichtigt Splits und
          Ausschüttungen. Es werden keine Rohkurse, Wellenwerte oder Schätzungen
          eingesetzt.
        </p>
        <p>
          US-Sektoren werden mit SPY verglichen; Länder und globale Themen mit
          ACWI. Zusammensetzung, Gewichtung, Fondskosten und
          USD-Wechselkurseinflüsse gehören zum Bild. Der Vergleich ist keine
          fundamentale Bewertung und kein RSI.
        </p>
        {selected.map((p, i) => (
          <p key={p.id}>
            <strong>{p.label}</strong>
            <br />
            {p.limits}
            <br />
            Quellenstand:{" "}
            {queries[i].data?.provenance?.retrievedAt.slice(0, 10) ??
              "noch nicht lokal"}{" "}
            · Beobachtungen bis{" "}
            {queries[i].data?.analysis.lastObservation ?? "nicht verfügbar"}
            <br />
            <Button size="sm" onClick={() => void openUrl(p.issuerUrl)}>
              Fondsbeschreibung öffnen
            </Button>
          </p>
        ))}
        <p>
          Berechnung: {relativeRecipe}. Vorhandener lokaler EODHD-Cache;
          zusätzliche Abrufe erfolgen nur über die Aktualisierungsschaltflächen.
        </p>
      </details>
    </div>
  );
}
