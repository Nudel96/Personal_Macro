import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { EChartsOption } from "echarts";
import {
  BaseChart,
  axisLine,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { useAtlasDisplayChoice } from "./atlas-display-state";
import {
  atlasMacrohistoryCatalog as cfg,
  atlasMacrohistoryDataset,
  macrohistoryUnit,
  macrohistoryView,
  macrohistoryPaths,
  type MacrohistoryMetric,
  type MacrohistoryView,
} from "./atlas-macrohistory";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";
import "./atlas-macrohistory.css";

const message = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Die Finanzgeschichte konnte nicht gelesen werden.";
const fmt = (n: number) =>
  new Intl.NumberFormat("de", {
    maximumFractionDigits: 2,
    notation: Math.abs(n) >= 100000 ? "compact" : "standard",
  }).format(n);

export function MacrohistoryMini({
  view,
  label,
  crises,
}: {
  view: MacrohistoryView;
  label: string;
  crises: boolean;
}) {
  return (
    <svg viewBox="0 0 340 134" role="img" aria-label={label}>
      <line
        x1="12"
        x2="328"
        y1={macrohistoryPaths(view, view.lines[0]).zero}
        y2={macrohistoryPaths(view, view.lines[0]).zero}
        stroke="var(--text-2)"
        strokeDasharray="4 5"
        opacity="0.5"
      />
      {view.lines.map((line, i) => {
        const shape = macrohistoryPaths(view, line);
        const color = i ? "var(--violet)" : "var(--primary-bright)";
        return (
          <g key={line.id}>
            <path
              d={shape.path}
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeDasharray={i ? "6 4" : undefined}
            />
            {shape.points.map((p, j) => (
              <circle
                key={j}
                cx={p.x}
                cy={p.y}
                r={p.interpolated ? 3.5 : 3}
                fill={p.interpolated ? "var(--surface)" : color}
                stroke={color}
                strokeWidth="1.5"
              />
            ))}
            {crises &&
              line.crises.map((year) => (
                <path
                  key={year}
                  d={`M${shape.x(year - view.first) - 3} 126 l3 -6 l3 6 z`}
                  fill={color}
                />
              ))}
          </g>
        );
      })}
    </svg>
  );
}

function LargeChart({
  view,
  metric,
  real,
  numbers,
  crises,
}: {
  view: MacrohistoryView;
  metric: MacrohistoryMetric;
  real: boolean;
  numbers: boolean;
  crises: boolean;
}) {
  const style = getComputedStyle(document.documentElement);
  const colors = ["--primary-bright", "--violet"].map((key) =>
    style.getPropertyValue(key).trim(),
  );
  const option: EChartsOption = {
    animation: false,
    color: colors,
    grid: { left: numbers ? 76 : 25, right: 25, top: 25, bottom: 38 },
    tooltip: {
      ...tooltip,
      show: numbers,
      trigger: "axis",
      renderMode: "richText",
      valueFormatter: (v) => (v == null ? "Nicht verfügbar" : fmt(Number(v))),
    },
    xAxis: {
      type: "category",
      data: view.years.map(String),
      boundaryGap: false,
      axisLine,
      axisTick: { show: false },
      axisLabel: {
        color: "#93a5bf",
        interval: (_, year) =>
          Number(year) % 25 === 0 ||
          Number(year) === view.first ||
          Number(year) === view.last,
        hideOverlap: true,
      },
    },
    yAxis: {
      type: "value",
      min: view.min,
      max: view.max,
      axisLabel: { show: numbers, color: "#93a5bf", formatter: fmt },
      splitLine,
      axisLine: { show: false },
    },
    series: view.lines.flatMap((line, index) => [
      {
        name: line.name,
        type: "line" as const,
        data: line.values.map((v, i) => (line.interpolated[i] ? null : v)),
        connectNulls: false,
        smooth: false,
        showSymbol: true,
        showAllSymbol: true,
        symbolSize: (_v: unknown, p: { dataIndex: number }) => {
          const i = p.dataIndex;
          return (i === 0 ||
            line.values[i - 1] === null ||
            line.interpolated[i - 1]) &&
            (i === line.values.length - 1 ||
              line.values[i + 1] === null ||
              line.interpolated[i + 1])
            ? 6
            : 0;
        },
        itemStyle: { color: colors[index] },
        lineStyle: {
          color: colors[index],
          width: 2.5,
          type: index ? ("dashed" as const) : ("solid" as const),
        },
        markLine: crises
          ? {
              silent: true,
              symbol: "none",
              label: { show: false },
              lineStyle: {
                color: colors[index],
                opacity: 0.3,
                type: "dotted" as const,
              },
              data: line.crises.map((year) => ({ xAxis: String(year) })),
            }
          : undefined,
      },
      {
        name: `${line.name} · JST-Interpolationshinweis`,
        type: "line" as const,
        data: line.values.map((v, i) => (line.interpolated[i] ? v : null)),
        connectNulls: false,
        lineStyle: { opacity: 0 },
        showAllSymbol: true,
        symbol: "emptyCircle",
        symbolSize: 7,
        itemStyle: { color: colors[index] },
      },
    ]),
  };
  return (
    <>
      <div className="atlas-chart-label">
        <span>{macrohistoryUnit(metric, real)}</span>
        <span>
          {view.first}–{view.last}
        </span>
      </div>
      <BaseChart
        option={option}
        height={360}
        ariaLabel={`${metric.label}: ${view.lines.map((l) => l.name).join(" und ")}, ${view.first} bis ${view.last}. ${macrohistoryUnit(metric, real)}. Lücken und Quelleninterpolation bleiben sichtbar.`}
      />
    </>
  );
}

export function AtlasMacrohistoryPanel({
  geography,
  compareId,
  showNumbers,
  job,
}: {
  geography: AtlasGeography;
  compareId?: string;
  showNumbers: boolean;
  job: AtlasSyncJob | null | undefined;
}) {
  const client = useQueryClient();
  const [group, setGroup] = useAtlasDisplayChoice<string>(
    "jstGroup",
    "credit",
    cfg.groups.map((g) => g.id),
  );
  const [selected, setSelected] = useAtlasDisplayChoice<string>(
    "jstMetric",
    "",
    ["", ...cfg.metrics.map((m) => m.id)],
  );
  const [since, setSince] = useAtlasDisplayChoice<number>(
    "jstSince",
    1870,
    [1870, 1900, 1950, 1980],
  );
  const [real, setReal] = useAtlasDisplayChoice("jstReal", true, [true, false]);
  const [crises, setCrises] = useAtlasDisplayChoice("jstCrises", false, [
    true,
    false,
  ]);
  const query = useQuery({
    queryKey: ["atlas", "macrohistory", geography.id],
    queryFn: () => api.atlasMacrohistory(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "macrohistory", compareId],
    queryFn: () => api.atlasMacrohistory(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasMacrohistory(),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const data = query.data;
  const compare =
    compareId && comparison.data?.status === "available"
      ? comparison.data
      : null;
  const rows =
    data?.status === "available" ? [data, ...(compare ? [compare] : [])] : [];
  const metrics = cfg.metrics.filter((m) => m.group === group);
  const metric = cfg.metrics.find((m) => m.id === selected);
  const view = metric ? macrohistoryView(rows, metric, since, real) : null;
  const busy = sync.isPending || job?.status === "running";
  const fresh =
    data?.provenance &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86400000;
  return (
    <>
      <p className="atlas-explanation">
        Wirtschaft, Kredit, Banken und Märkte über viele Generationen. Die
        Bilder verwenden historische Rekonstruktionen von Jordà, Schularick und
        Taylor. Die Quelle umfasst 18 Länder und endet 2020.
      </p>
      {query.isPending && (
        <p role="status">Lokale Finanzgeschichte wird geladen …</p>
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
          <h3>
            {data.status === "desktop_required"
              ? "Finanzgeschichte in der Desktop-App laden"
              : "Die historische Finanzgrundlage ist noch nicht lokal gespeichert"}
          </h3>
          <p>
            Ein kostenloser Abruf lädt die geprüfte JST-Datei für alle 18
            enthaltenen Länder. Danach sind die Bilder offline verfügbar.
          </p>
        </div>
      )}
      {data?.status === "unsupported_area" && (
        <div className="atlas-empty">
          <h3>Keine eigene JST-Finanzgeschichte für dieses Gebiet</h3>
          <p>
            Die Datei enthält dieses Gebiet nicht. Indien, China und Welt
            erhalten keine Ersatzwerte aus anderen Ländern. Weitere historische
            und statistische Bilder bleiben im Atlas erreichbar.
          </p>
        </div>
      )}
      {compareId &&
        (comparison.isPending ||
          comparison.error ||
          comparison.data?.status !== "available") && (
          <p className="atlas-notice">
            {comparison.isPending
              ? "Das Vergleichsland wird gelesen …"
              : comparison.error
                ? `Vergleich: ${message(comparison.error)}`
                : "Für das Vergleichsgebiet liegt hier keine eigene JST-Reihe vor. Das Hauptland bleibt sichtbar."}
          </p>
        )}
      <div className="atlas-jst-controls">
        <label>
          Geschichte ordnen{" "}
          <select
            className="input"
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setSelected("");
            }}
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
          aria-label="JST-Zeitraum"
        >
          {[1870, 1900, 1950, 1980].map((year) => (
            <button
              key={year}
              type="button"
              aria-pressed={since === year}
              onClick={() => setSince(year)}
            >
              Seit {year}
            </button>
          ))}
        </div>
        {(group === "returns" || metric?.method === "return") && (
          <label>
            <input
              type="checkbox"
              checked={real}
              onChange={(e) => setReal(e.target.checked)}
            />
            Renditen inflationsbereinigt
          </label>
        )}
        <label>
          <input
            type="checkbox"
            checked={crises}
            onChange={(e) => setCrises(e.target.checked)}
          />
          Krisenanfänge laut JST
        </label>
      </div>
      {rows.length > 0 && (
        <>
          <p className="atlas-jst-legend">
            {rows.map((r, i) => (
              <span
                key={r.geography.id}
                style={{ color: i ? "var(--violet)" : "var(--primary-bright)" }}
              >
                {r.geography.label}
                {i ? " · gestrichelt" : " · durchgezogen"}
              </span>
            ))}
          </p>
          <p className="atlas-comparison-note">
            Historischer Datenstand bis 2020. Jede Messgröße hat ihren eigenen
            Maßstab; zwei Länder desselben Bildes teilen Zeitraum und Skala. Die
            Höhe ist keine automatische Bewertung.
          </p>
          {metric ? (
            <>
              <Button
                size="sm"
                onClick={() => {
                  setGroup(metric.group);
                  setSelected("");
                }}
              >
                Zur Themenübersicht
              </Button>
              <h3>{metric.label}</h3>
              <p className="atlas-explanation">{metric.explanation}</p>
              {view ? (
                <LargeChart
                  view={view}
                  metric={metric}
                  real={real}
                  numbers={showNumbers}
                  crises={crises}
                />
              ) : (
                <p className="atlas-notice">
                  Für diese Messgröße fehlen gemeinsame Werte im gewählten
                  Zeitraum und Quellenstand.
                </p>
              )}
              {view?.interpolated && (
                <p className="atlas-notice">
                  Offene Kreise zeigen Interpolationshinweise der Quelle, etwa
                  bei Börsenschließungen.{" "}
                  {metric.id === "housePrices" &&
                    "Bei Hauspreisen bezieht sich der Hinweis auf die zugehörige Preisveränderung. "}
                  Ein fehlendes Kennzeichen garantiert keine direkte Messung;
                  die gesamte Quelle enthält historische Rekonstruktionen.
                </p>
              )}
              {metric.method === "return" && (
                <p className="atlas-comparison-note">
                  {real
                    ? "Kaufkraftbereinigung: nominale Jahresrendite mit der Veränderung des Verbraucherpreisindex derselben Quelle verrechnet. Ohne Vorjahrespreis entsteht kein Realwert."
                    : "Nominale Renditen enthalten Geldentwertung. Hyperinflation, etwa Deutschland 1923, kann den gesamten Bildmaßstab dominieren; Extremwerte werden nicht abgeschnitten."}{" "}
                  Null bedeutet keine Jahresrendite, nicht faire Bewertung.
                </p>
              )}
              {showNumbers && view && (
                <details className="atlas-details">
                  <summary>Jahreswerte und Quellenkennzeichen</summary>
                  <div className="atlas-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Jahr</th>
                          {view.lines.map((l) => (
                            <th key={l.id}>{l.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {view.years.map((year, i) => (
                          <tr key={year}>
                            <td>{year}</td>
                            {view.lines.map((l) => (
                              <td key={l.id}>
                                {l.values[i] === null
                                  ? "Nicht verfügbar"
                                  : `${fmt(l.values[i]!)}${l.interpolated[i] ? " · JST-Interpolationshinweis" : ""}`}
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
          ) : (
            <div className="atlas-jst-grid">
              {metrics.map((m) => {
                const v = macrohistoryView(rows, m, since, real);
                return (
                  <button
                    className="atlas-jst-card"
                    type="button"
                    key={m.id}
                    onClick={() => setSelected(m.id)}
                    aria-label={`${m.label} · großes Bild öffnen`}
                  >
                    <strong>{m.label}</strong>
                    <small>{macrohistoryUnit(m, real)}</small>
                    {v ? (
                      <>
                        <MacrohistoryMini
                          view={v}
                          label={`${m.label}: ${v.lines.map((l) => l.name).join(" und ")}, ${v.first} bis ${v.last}. ${macrohistoryUnit(m, real)}.`}
                          crises={crises}
                        />
                        <small>
                          Gemeinsames Bild: {v.first}–{v.last}
                          {v.interpolated
                            ? " · enthält JST-Interpolationshinweise"
                            : ""}
                        </small>
                        {showNumbers && (
                          <small>
                            {v.lines
                              .map((l) => {
                                const i = v.lastCommonIndex;
                                return `${l.name}: ${fmt(l.values[i]!)} (${v.years[i]})`;
                              })
                              .join(" · ")}
                          </small>
                        )}
                      </>
                    ) : (
                      <small>Keine gemeinsamen Werte in dieser Auswahl</small>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {crises && (
            <details className="atlas-details">
              <summary>Krisenanfänge in dieser Auswahl</summary>
              <p>
                Markiert sind die von JST kodierten Anfangsjahre systemischer
                Finanzkrisen. Das sind weder Krisendauer noch Wendepunkte aller
                gezeigten Messgrößen.
              </p>
              {rows.map((row) => (
                <p key={row.geography.id}>
                  <strong>{row.geography.label}:</strong>{" "}
                  {row
                    .profile!.points.filter(
                      (p) => p.year >= since && p.raw.crisisJST === 1,
                    )
                    .map((p) => p.year)
                    .join(", ") ||
                    "Kein markierter Beginn im gewählten Ausschnitt"}
                </p>
              ))}
            </details>
          )}
        </>
      )}
      {isTauri() && (
        <div className="atlas-actions">
          <Button
            disabled={Boolean(busy || fresh)}
            onClick={() => sync.mutate()}
          >
            {busy
              ? "Atlas-Abruf läuft …"
              : fresh
                ? "Historischer Stand lokal verfügbar"
                : "JST-Geschichte laden / aktualisieren"}
          </Button>
          <span>Eine Originaldatei · rund 1,4 MB · alle 18 Quellenländer</span>
        </div>
      )}
      {sync.error && (
        <div className="atlas-notice" role="alert">
          {message(sync.error)}
        </div>
      )}
      {job?.seriesId === atlasMacrohistoryDataset && (
        <p
          className="atlas-notice"
          role={job.status === "failed" ? "alert" : "status"}
        >
          {job.message}
        </p>
      )}
      <details className="atlas-details">
        <summary>Quelle, historische Grenzen und Bedeutung</summary>
        <p>
          Die veröffentlichten Länderreihen verbinden unterschiedliche
          historische Quellen und teilweise wechselnde Gebietsstände. Der Atlas
          hängt keine heutigen Weltbank- oder BIS-Werte an. Die Datei enthält
          keine vollständige Bruchliste je Messwert. Insbesondere Deutschlands
          frühe Kreditdaten umfassen historische Grenzen und teils
          Zwischenbankkredite. Frühere Arbeitslosenquoten können nur Versicherte
          oder Gewerkschaftsmitglieder betreffen.
        </p>
        <p>
          Renditen sind Jahresergebnisse einschließlich laufender Erträge.
          Aktien- und Mietverhältnisse sind veröffentlichte Quellenkennzahlen;
          eine niedrige oder hohe Position beweist keine faire Bewertung.
          Indexbilder vergleichen Entwicklung relativ zum jeweiligen Basisjahr,
          keine absoluten Preis- oder Wohlstandsniveaus zwischen Ländern.
        </p>
        <p>
          Alle Werte: JST R6, Quellenjahre 1870–2020. Der Datei-Zeitstempel ist
          kein Beobachtungsdatum. Offene Kreise kennzeichnen die speziellen
          Interpolationsmarker des Anbieters; auch andere Werte können
          rekonstruiert sein.
        </p>
        {cfg.citations.map((c) => (
          <p key={c}>{c}</p>
        ))}
        <p>
          {cfg.license} · Namensnennung, nicht kommerziell, Weitergabe unter
          gleichen Bedingungen. Eigene deutsche Erläuterungen sowie Verhältnis-
          und Kaufkraftberechnungen sind gekennzeichnet.
        </p>
        {[
          ["JST-Datenbank und Originaldownload", cfg.sourcePage],
          ["Quellen und Länderdefinitionen", cfg.documentationUrl],
          ["R6-Erweiterung und Renditen", cfg.returnsDocumentationUrl],
          ["Historische Krisenchronologie", cfg.crisisDocumentationUrl],
          ["Nutzungsbedingungen", cfg.licenseUrl],
        ].map(([label, url]) => (
          <p key={url}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                if (isTauri()) {
                  e.preventDefault();
                  void openUrl(url);
                }
              }}
            >
              {label}
            </a>
          </p>
        ))}
        {data?.provenance && (
          <p>
            Abruf:{" "}
            {new Date(data.provenance.retrievedAt).toLocaleString("de-DE")} ·
            Berechnung: {data.provenance.recipe} · SHA-256:{" "}
            {data.provenance.sha256}
          </p>
        )}
      </details>
    </>
  );
}
