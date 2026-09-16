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
  atlasFiscalCatalog as cfg,
  atlasFiscalDataset,
  fiscalView,
  fiscalSegments,
  fiscalScopeLabel,
  type FiscalMetric,
  type FiscalView,
} from "./atlas-fiscal";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";
import "./atlas-fiscal.css";

const message = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Die Staatsfinanzen konnten nicht gelesen werden.";
const fmt = (v: number) =>
  new Intl.NumberFormat("de", { maximumFractionDigits: 2 }).format(v);
export function FiscalMini({
  view,
  label,
}: {
  view: FiscalView;
  label: string;
}) {
  const x = (i: number) => 12 + (i / Math.max(1, view.years.length - 1)) * 316;
  const y = (v: number) => 12 + ((view.max - v) / (view.max - view.min)) * 100;
  return (
    <svg viewBox="0 0 340 126" role="img" aria-label={label}>
      <line
        x1="12"
        x2="328"
        y1={y(0)}
        y2={y(0)}
        stroke="var(--text-2)"
        strokeDasharray="4 5"
        opacity="0.5"
      />
      {view.lines.map((l, i) => (
        <g key={l.id}>
          {fiscalSegments(view, l).map((s, j) =>
            s.length === 1 ? (
              <circle
                key={j}
                cx={x(s[0].index)}
                cy={y(s[0].value)}
                r="3"
                fill={i ? "var(--violet)" : "var(--primary-bright)"}
              />
            ) : (
              <path
                key={j}
                d={s
                  .map((p, k) => `${k ? "L" : "M"}${x(p.index)},${y(p.value)}`)
                  .join(" ")}
                fill="none"
                stroke={i ? "var(--violet)" : "var(--primary-bright)"}
                strokeWidth="2.5"
                strokeDasharray={i ? "6 4" : undefined}
              />
            ),
          )}
        </g>
      ))}
    </svg>
  );
}
function LargeChart({
  view,
  metric,
  numbers,
}: {
  view: FiscalView;
  metric: FiscalMetric;
  numbers: boolean;
}) {
  const styles = getComputedStyle(document.documentElement);
  const colors = ["--primary-bright", "--violet"].map((k) =>
    styles.getPropertyValue(k).trim(),
  );
  const zeroLabel =
    metric.field === "pb"
      ? "Ausgeglichen"
      : metric.field === "rgc"
        ? "Ohne Wachstum"
        : metric.field === "rltir"
          ? "Realzins null"
          : null;
  const option: EChartsOption = {
    animation: false,
    grid: { left: numbers ? 60 : 25, right: 25, top: 25, bottom: 38 },
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
        interval: (_, y) =>
          Number(y) % 25 === 0 ||
          Number(y) === view.first ||
          Number(y) === view.last,
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
    series: view.lines.flatMap((l, i) =>
      fiscalSegments(view, l).map((segment, segmentIndex) => {
        const values = new Map(segment.map((p) => [p.index, p.value]));
        return {
          name: `${l.name} · ${fiscalScopeLabel(segment[0].scope)}`,
          type: "line" as const,
          data: view.years.map((_, j) => values.get(j) ?? null),
          smooth: false,
          connectNulls: false,
          showSymbol: true,
          showAllSymbol: true,
          symbolSize: segment.length === 1 ? 6 : 0,
          itemStyle: { color: colors[i] },
          markLine:
            zeroLabel && i === 0 && segmentIndex === 0
              ? {
                  silent: true,
                  symbol: ["none", "none"],
                  lineStyle: {
                    color: styles.getPropertyValue("--text-2").trim(),
                    type: "dashed" as const,
                    width: 1,
                    opacity: 0.7,
                  },
                  label: {
                    formatter: zeroLabel,
                    position: "insideEndTop" as const,
                    color: styles.getPropertyValue("--text-2").trim(),
                    fontSize: 11,
                  },
                  data: [{ yAxis: 0 }],
                }
              : undefined,
          lineStyle: {
            color: colors[i],
            width: 2.5,
            type: i ? ("dashed" as const) : ("solid" as const),
          },
        };
      }),
    ),
  };
  return (
    <>
      <div className="atlas-chart-label">
        <span>{metric.unit}</span>
        <span>
          {view.first}–{view.last}
        </span>
      </div>
      <BaseChart
        option={option}
        height={360}
        ariaLabel={`${metric.label}: ${view.lines.map((l) => l.name).join(" und ")}, ${view.first} bis ${view.last}. ${metric.unit}. Datenlücken und Abgrenzungswechsel trennen die Linien.`}
      />
    </>
  );
}
export function AtlasFiscalPanel({
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
  const client = useQueryClient();
  const [group, setGroup] = useAtlasDisplayChoice<string>(
    "fiscalGroup",
    topicId === "finance:public_debt" ? "debt" : "budget",
    cfg.groups.map((g) => g.id),
  );
  const [selected, setSelected] = useAtlasDisplayChoice<string>(
    "fiscalMetric",
    "",
    ["", ...cfg.metrics.map((m) => m.id)],
  );
  const [since, setSince] = useAtlasDisplayChoice<number>(
    "fiscalSince",
    1800,
    [1800, 1900, 1950, 1980, 2000],
  );
  const query = useQuery({
    queryKey: ["atlas", "fiscal", geography.id],
    queryFn: () => api.atlasFiscal(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "fiscal", compareId],
    queryFn: () => api.atlasFiscal(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasFiscal(),
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
  const scopedView = metric
    ? Boolean(metric.scopeField)
    : metrics.some((m) => Boolean(m.scopeField));
  const view = metric ? fiscalView(rows, metric, since) : null;
  const fresh =
    data?.provenance &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86400000;
  return (
    <>
      <p className="atlas-explanation">
        Wie sich Staatshaushalte, Schulden und ihr wirtschaftlicher Kontext über
        Generationen verändern. Die IMF-Rekonstruktionen reichen je nach Land
        bis 1800 zurück und enden spätestens 2024.
      </p>
      {query.isPending && (
        <p role="status">Lokale Staatsfinanzen werden geladen …</p>
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
          <h3>Staatsfinanzen in der Desktop-App laden</h3>
          <p>
            Ein kostenloser Abruf lädt die geprüfte IMF-Arbeitsmappe aus dem
            öffentlichen OWID-Archiv für alle 151 enthaltenen Länder und
            Gebiete. Danach bleiben die Bilder offline verfügbar.
          </p>
        </div>
      )}
      {data?.status === "unsupported_area" && (
        <div className="atlas-empty">
          <h3>Keine eigene IMF-Reihe für dieses Gebiet</h3>
          <p>
            Die geprüfte Datei enthält dieses Gebiet nicht. Sie liefert auch
            keine Welt- oder Kontinentaggregate.
          </p>
        </div>
      )}
      {compareId &&
        data?.status === "available" &&
        (comparison.isPending ||
          comparison.error ||
          comparison.data?.status !== "available") && (
          <p className="atlas-notice">
            {comparison.isPending
              ? "Das Vergleichsland wird gelesen …"
              : comparison.error
                ? `Vergleich: ${message(comparison.error)}`
                : "Das Vergleichsgebiet besitzt hier keine eigene Reihe. Das Hauptland bleibt sichtbar."}
          </p>
        )}
      <div className="atlas-fiscal-controls">
        <label>
          Staatsfinanzen ordnen{" "}
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
          aria-label="IMF-Zeitraum"
        >
          {[1800, 1900, 1950, 1980, 2000].map((y) => (
            <button
              key={y}
              type="button"
              aria-pressed={since === y}
              onClick={() => setSince(y)}
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
                {r.geography.label}
                {i ? " · gestrichelt" : " · durchgezogen"}
              </span>
            ))}
          </p>
          <p className="atlas-comparison-note">
            Jede Messgröße hat ihren eigenen Maßstab. Zwei Länder desselben
            Bildes teilen Zeitraum und Skala. Höhe oder Tiefpunkt bedeuten keine
            günstige oder teure Bewertung.
          </p>
          {compare && scopedView && (
            <p className="atlas-comparison-note">
              Liegen für beide Länder Werte vor, muss ihre staatliche Abgrenzung
              übereinstimmen: Zentralregierung mit Zentralregierung, Gesamtstaat
              mit Gesamtstaat. Unterschiedlich erfasste Jahre bleiben als Lücke
              sichtbar.
            </p>
          )}
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
                <LargeChart view={view} metric={metric} numbers={showNumbers} />
              ) : (
                <p className="atlas-notice">
                  Für diese Messgröße fehlen vergleichbare gemeinsame Werte im
                  gewählten Zeitraum und Quellenstand.
                </p>
              )}
              {view && showNumbers && (
                <p className="atlas-comparison-note">
                  {compare ? "Gemeinsames Jahr" : "Letztes verfügbares Jahr"}{" "}
                  {view.years[view.lastCommonIndex]}:{" "}
                  {view.lines
                    .map(
                      (l) =>
                        `${l.name} ${fmt(l.values[view.lastCommonIndex]!)} ${metric.unit}`,
                    )
                    .join(" · ")}
                </p>
              )}
              {view && metric.scopeField && (
                <details className="atlas-source-details">
                  <summary>Staatliche Abgrenzung und Linienabschnitte</summary>
                  <p>
                    Gesamtstaat umfasst die Regierungsebenen und
                    Sozialversicherung. Zentralregierung erfasst einen engeren
                    Teil. Die Angaben folgen den Originalkennzeichen; weitere
                    historische Definitions- und Gebietswechsel sind nicht
                    vollständig datiert.
                  </p>
                  {view.lines.map((l) => (
                    <p key={l.id}>
                      <strong>{l.name}:</strong>{" "}
                      {fiscalSegments(view, l)
                        .map(
                          (s) =>
                            `${s[0].year}–${s[s.length - 1].year}: ${fiscalScopeLabel(s[0].scope)}`,
                        )
                        .join("; ")}
                    </p>
                  ))}
                  {view.excludedScopeYears > 0 && (
                    <p>
                      Jahre mit unterschiedlicher staatlicher Abgrenzung wurden
                      im Vergleich ausgelassen.
                    </p>
                  )}
                  {view.lines.some((line) => line.breaks.some(Boolean)) && (
                    <p>
                      Frankreich: Die dokumentierte Definitionsänderung 1978
                      unterbricht diese Reihe zusätzlich.
                    </p>
                  )}
                </details>
              )}
            </>
          ) : (
            <div className="atlas-fiscal-grid">
              {metrics.map((m) => {
                const v = fiscalView(rows, m, since);
                return (
                  <button
                    type="button"
                    className="atlas-fiscal-card"
                    key={m.id}
                    onClick={() => setSelected(m.id)}
                  >
                    <strong>{m.label}</strong>
                    <small>{m.unit}</small>
                    {v ? (
                      <FiscalMini
                        view={v}
                        label={`${m.label}: ${v.lines.map((l) => l.name).join(" und ")}, ${v.first} bis ${v.last}.`}
                      />
                    ) : (
                      <span>
                        Keine vergleichbaren Werte im gewählten Zeitraum
                      </span>
                    )}
                    {v && (
                      <small>
                        {v.first}–{v.last} ·{" "}
                        {compare
                          ? "gemeinsamer Zeitraum"
                          : "veröffentlichte Geschichte"}
                      </small>
                    )}
                    <small>{m.explanation}</small>
                    {v && showNumbers && (
                      <small>
                        {v.years[v.lastCommonIndex]}:{" "}
                        {v.lines
                          .map(
                            (l) =>
                              `${l.name} ${fmt(l.values[v.lastCommonIndex]!)} ${m.unit}`,
                          )
                          .join(" · ")}
                      </small>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      <details className="atlas-source-details">
        <summary>Quelle und historische Grenzen</summary>
        <p>
          IMF · Public Finances in Modern History, Ausgabe Dezember 2025.
          Originaldatei im öffentlichen Archiv von Our World in Data, dort am
          12. Juni 2026 gesichert. Alle Werte und beide staatlichen
          Abgrenzungskennzeichen werden unverändert übernommen.
        </p>
        <p>
          Historische Rekonstruktionen verbinden unterschiedliche
          Ausgangsquellen. Die Länderreihen können frühere Staatsgebiete und
          andere Haushaltsjahre umfassen. Die Kennzeichen erfassen staatliche
          Ebenen, nicht sämtliche Methoden- oder Gebietswechsel. Keine feste
          Sinusperiode, automatische Bewertung oder Fortschreibung.
        </p>
        <p>
          Die ältere IMF-Dokumentation vom Februar 2025 nennt einen anderen
          Umfang. Maßgeblich für diese Ansicht ist ausschließlich die geprüfte
          Dezember-Datei mit 151 Ländern und Gebieten. Die Rohdatei enthält auch
          vollständig leere Jahreszeilen; diese erzeugen keine Werte.
        </p>
        {data?.provenance && (
          <p>
            Quellenstand: {data.provenance.release}. Lokal geladen:{" "}
            {new Date(data.provenance.retrievedAt).toLocaleString("de-DE")}.
          </p>
        )}
        <div className="atlas-fiscal-links">
          {[
            [cfg.sourcePage, "IMF-Datensatz"],
            [cfg.archivePage, "Öffentlicher Dateinachweis"],
            [cfg.documentationUrl, "IMF-Methodik"],
            [cfg.licenseUrl, "IMF-Nutzungsbedingungen"],
          ].map(([url, label]) => (
            <Button size="sm" key={url} onClick={() => void openUrl(url)}>
              {label}
            </Button>
          ))}
        </div>
        <p>
          © International Monetary Fund. Herkunft und Datenstand bleiben auch in
          gemerkten Ansichten erhalten.
        </p>
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
          : "IMF-Staatsfinanzen kostenlos laden"}
      </Button>
      {sync.error && <p role="alert">{message(sync.error)}</p>}
      {job?.seriesId === atlasFiscalDataset && (
        <p role="status">{job.message}</p>
      )}
    </>
  );
}
