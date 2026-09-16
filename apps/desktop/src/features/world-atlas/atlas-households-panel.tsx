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
import {
  useAtlasDisplayChoice,
  useAtlasDisplayText,
} from "./atlas-display-state";
import {
  atlasHouseholdsCatalog as cfg,
  atlasHouseholdsDataset,
  householdSelection,
  householdSourceLabel,
  householdUnit,
  householdValue,
  householdView,
  validHouseholdResponse,
  type AtlasHouseholdsResponse,
  type HouseholdMetric,
  type HouseholdObservation,
  type HouseholdView,
} from "./atlas-households";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";
import "./atlas-households.css";

const errorMessage = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Die Haushaltsdaten konnten nicht gelesen werden.";
const fmt = (n: number) =>
  new Intl.NumberFormat("de", { maximumFractionDigits: 2 }).format(n);
function HouseholdsChart({
  view,
  metric,
  numbers,
}: {
  view: HouseholdView;
  metric: HouseholdMetric;
  numbers: boolean;
}) {
  const styles = getComputedStyle(document.documentElement);
  const colors = ["--primary-bright", "--violet"].map((c) =>
    styles.getPropertyValue(c).trim(),
  );
  const option: EChartsOption = {
    animation: false,
    grid: { left: numbers ? 65 : 30, right: 25, top: 22, bottom: 40 },
    tooltip: {
      ...tooltip,
      trigger: "item",
      renderMode: "richText",
      formatter: (input) => {
        const p = Array.isArray(input) ? input[0] : input;
        const data = p.data as {
          observation?: HouseholdObservation;
          value?: number[];
        };
        if (!data.observation) return "";
        return `${p.seriesName}\n${householdSourceLabel(data.observation)}${numbers ? `\n${fmt(householdValue(data.observation, metric)!)} ${householdUnit(metric)}` : ""}`;
      },
    },
    xAxis: {
      type: "value",
      min: view.first - 0.5,
      max: view.last + 0.5,
      minInterval: 1,
      axisLine,
      axisTick: { show: false },
      axisLabel: {
        color: "#93a5bf",
        hideOverlap: true,
        formatter: (v: number) => (Number.isInteger(v) ? String(v) : ""),
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: view.max,
      axisLabel: { show: numbers, color: "#93a5bf", formatter: fmt },
      splitLine,
      axisLine: { show: false },
    },
    series: view.sets.map((s) => ({
      name: s.name,
      type: "scatter",
      symbolSize: 10,
      data: s.points.map((p) => ({
        value: [p.year, householdValue(p, metric)!],
        observation: p,
        symbol: p.unweighted ? "emptyDiamond" : s.index ? "rect" : "circle",
      })),
      itemStyle: { color: colors[s.index], opacity: 0.82 },
    })),
  };
  return (
    <>
      <div className="atlas-chart-label">
        <span>{householdUnit(metric)} · oben mehr, unten weniger</span>
        <span>
          {view.first}–{view.last}
        </span>
      </div>
      <div className="atlas-household-history">
        <BaseChart
          option={option}
          height={320}
          ariaLabel={`${metric.label}: einzelne Erhebungen für ${view.sets.map((s) => s.name).join(" und ")}, ${view.first} bis ${view.last}. ${householdUnit(metric)}. Gemeinsame Skala; keine Verbindung oder Ergänzung zwischen Erhebungen.`}
        />
      </div>
    </>
  );
}
function ObservationCard({
  row,
  point,
  metric,
  requested,
  onChange,
  numbers,
  index,
  max,
}: {
  row: AtlasHouseholdsResponse;
  point: HouseholdObservation | null;
  metric: HouseholdMetric;
  requested: string;
  onChange: (v: string) => void;
  numbers: boolean;
  index: number;
  max: number;
}) {
  const points = row.profile!.observations;
  const value = point ? householdValue(point, metric) : null;
  const latestYear = Math.max(
    ...points
      .filter((p) => householdValue(p, metric) !== null)
      .map((p) => p.year),
  );
  const tied =
    points.filter(
      (p) => p.year === latestYear && householdValue(p, metric) !== null,
    ).length > 1;
  const color = index ? "var(--violet)" : "var(--primary-bright)";
  return (
    <article className="atlas-household-card">
      <strong style={{ color }}>
        {row.geography.label} · {index ? "Quadrate" : "Kreise"}
      </strong>
      <label>
        Erhebung für {row.geography.label}
        <select
          className="input"
          value={point?.recordId ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          {!point && <option value="">Keine Erhebung mit diesem Wert</option>}
          {points
            .slice()
            .sort((a, b) => b.year - a.year || a.sourceRow - b.sourceRow)
            .map((p) => (
              <option key={p.recordId} value={p.recordId}>
                {householdSourceLabel(p)}
              </option>
            ))}
        </select>
      </label>
      {point && (
        <>
          <p className="atlas-household-source">{point.sourceName}</p>
          {point.unweighted && (
            <p className="atlas-notice">
              Ungewichtete Stichprobe: Für diese MICS-Erhebung lagen keine
              Stichprobengewichte vor.
            </p>
          )}
          <svg
            viewBox={`0 0 320 ${metric.group === "size" ? 255 : 60}`}
            role="img"
            aria-label={`${metric.label} in ${row.geography.label}, ${point.year}: ${value === null ? "nicht verfügbar" : numbers ? `${fmt(value)} ${householdUnit(metric)}` : "Balken auf gemeinsamer Skala"}. ${householdSourceLabel(point)}${point.unweighted ? ". Ungewichtete Stichprobe" : ""}`}
          >
            <text x="0" y="13" fill="var(--text-2)" fontSize="11">
              {householdUnit(metric)}
              {numbers && value !== null ? ` · ${fmt(value)}` : ""}
            </text>
            <rect
              x="0"
              y="24"
              width="320"
              height="20"
              rx="4"
              fill="var(--surface-2)"
              stroke="var(--border)"
            />
            {value !== null ? (
              <rect
                x="0"
                y="24"
                width={(value / max) * 320}
                height="20"
                rx="4"
                fill={color}
              />
            ) : (
              <text x="8" y="38" fill="var(--text-2)" fontSize="11">
                Nicht verfügbar
              </text>
            )}
            {value === 0 && !numbers && (
              <text x="0" y="59" fill="var(--text-2)" fontSize="11">
                Gerundeter Nullwert
              </text>
            )}
            {metric.group === "size" &&
              cfg.metrics
                .filter((m) =>
                  ["size1", "size2to3", "size4to5", "size6plus"].includes(m.id),
                )
                .map((m, i) => {
                  const n = householdValue(point, m);
                  const y = 78 + i * 44;
                  return (
                    <g key={m.id}>
                      <text x="0" y={y} fill="var(--text-2)" fontSize="11">
                        {m.label}
                        {numbers && n !== null ? ` · ${fmt(n)} %` : ""}
                      </text>
                      <rect
                        x="0"
                        y={y + 8}
                        width="320"
                        height="12"
                        rx="3"
                        fill="var(--surface-2)"
                        stroke="var(--border)"
                      />
                      {n !== null ? (
                        <rect
                          x="0"
                          y={y + 8}
                          width={n * 3.2}
                          height="12"
                          rx="3"
                          fill={color}
                        />
                      ) : (
                        <text
                          x="8"
                          y={y + 19}
                          fill="var(--text-2)"
                          fontSize="10"
                        >
                          Nicht verfügbar
                        </text>
                      )}
                    </g>
                  );
                })}
          </svg>
          {metric.group === "size" && (
            <small>
              Vier Größenklassen, jeweils auf derselben vollständigen
              Anteilsskala. Fehlende Klassen bleiben leer.
            </small>
          )}
          {tied && (
            <small>
              Im jüngsten Datenjahr liegen mehrere Quellen vor. Die erste
              UN-Tabellenzeile ist die Vorauswahl; oben kannst du die Quelle
              wechseln.
            </small>
          )}
          {requested && point.recordId !== requested && (
            <small>
              Die zuvor gewählte Erhebung gehört nicht zu diesem Land. Die
              jüngste verfügbare Quelle ist ausgewählt.
            </small>
          )}
        </>
      )}
    </article>
  );
}
export function AtlasHouseholdsPanel({
  geography,
  compareId,
  showNumbers,
  job,
  onAreaChange,
}: {
  geography: AtlasGeography;
  compareId?: string;
  showNumbers: boolean;
  job: AtlasSyncJob | null | undefined;
  onAreaChange: (id: string) => void;
}) {
  const client = useQueryClient();
  const [group, setGroup] = useAtlasDisplayChoice(
    "hhGroup",
    "size",
    cfg.groups.map((g) => g.id),
  );
  const metrics = cfg.metrics.filter((m) => m.group === group);
  const [selected, setSelected] = useAtlasDisplayChoice(
    "hhMetric",
    metrics[0].id,
    metrics.map((m) => m.id),
  );
  const metric = metrics.find((m) => m.id === selected) ?? metrics[0];
  const [since, setSince] = useAtlasDisplayChoice<number>(
    "hhSince",
    1959,
    [1959, 1980, 2000],
  );
  const [record, setRecord] = useAtlasDisplayText("hhRecord");
  const [compareRecord, setCompareRecord] =
    useAtlasDisplayText("hhCompareRecord");
  const query = useQuery({
    queryKey: ["atlas", "households", geography.id],
    queryFn: () => api.atlasHouseholds(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "households", compareId],
    queryFn: () => api.atlasHouseholds(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasHouseholds(),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const data = query.data;
  const main = validHouseholdResponse(data) ? data : null;
  const candidate =
    compareId && validHouseholdResponse(comparison.data)
      ? comparison.data
      : null;
  const compare =
    main && candidate?.provenance?.retrievedAt === main.provenance?.retrievedAt
      ? candidate
      : null;
  const rows = main ? [main, ...(compare ? [compare] : [])] : [];
  const first = householdSelection(data, metric, record);
  const second = householdSelection(
    compare ?? undefined,
    metric,
    compareRecord,
  );
  const view = householdView(rows, metric, since);
  const max =
    metric.unit === "percent"
      ? 100
      : Math.max(
          1,
          ...[first, second].map((p) =>
            p ? (householdValue(p, metric) ?? 0) : 0,
          ),
          view?.max ?? 0,
        );
  const fresh =
    data?.provenance &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86400000;
  const changeMetric = (id: string) => {
    setSelected(id);
    setRecord("");
    setCompareRecord("");
  };
  return (
    <>
      <p className="atlas-explanation">
        Wie Menschen zusammenleben: kleine und große Haushalte, Familien und
        Generationen. Die UN sammelt Erhebungen von 1959 bis 2025; die
        verfügbaren Jahre unterscheiden sich je Land.
      </p>
      {query.isPending && (
        <p role="status">Lokale Haushaltsdaten werden geladen …</p>
      )}
      {query.error && (
        <p className="atlas-notice" role="alert">
          {errorMessage(query.error)}{" "}
          <Button size="sm" onClick={() => void query.refetch()}>
            Erneut prüfen
          </Button>
        </p>
      )}
      {(data?.status === "not_downloaded" ||
        data?.status === "desktop_required") && (
        <div className="atlas-empty">
          <h3>Haushaltsbilder in der Desktop-App laden</h3>
          <p>
            Ein kostenloser UN-Download enthält alle 200 Länder und Gebiete.
            Danach bleiben die Bilder lokal verfügbar.
          </p>
        </div>
      )}
      {data?.status === "unsupported_area" && (
        <div className="atlas-empty">
          <h3>Für dieses Gebiet fehlt ein eigenes Haushaltsprofil</h3>
          <p>
            Die UN-Datei enthält Ländererhebungen, aber keinen Welt- oder
            Kontinentdurchschnitt. Wähle ein Land.
          </p>
          <div className="atlas-household-links">
            {[
              ["m49:276", "Deutschland"],
              ["m49:840", "USA"],
              ["m49:356", "Indien"],
              ["m49:156", "China"],
            ].map(([id, name]) => (
              <Button key={id} size="sm" onClick={() => onAreaChange(id)}>
                {name} öffnen
              </Button>
            ))}
          </div>
        </div>
      )}
      {data?.status === "available" && !main && (
        <p role="alert">
          Das Haushaltsprofil passt nicht zum geprüften Quellenstand. Bitte den
          lokalen Datenstand erneut laden.
        </p>
      )}
      {compareId && main && !compare && (
        <p className="atlas-notice">
          {comparison.isPending
            ? "Das Vergleichsland wird gelesen …"
            : comparison.error
              ? `Vergleich: ${errorMessage(comparison.error)}`
              : candidate
                ? "Die Länder haben unterschiedliche Quellenstände. Bitte den Abruf abschließen und erneut wählen."
                : "Für das Vergleichsgebiet fehlt ein eigenes Haushaltsprofil. Das Hauptland bleibt sichtbar."}
        </p>
      )}
      <div className="atlas-household-controls">
        <label>
          Haushaltsbilder ordnen
          <select
            className="input"
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setSelected(
                cfg.metrics.find((m) => m.group === e.target.value)!.id,
              );
              setRecord("");
              setCompareRecord("");
            }}
          >
            {cfg.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Haushaltsperspektive
          <select
            className="input"
            value={metric.id}
            onChange={(e) => changeMetric(e.target.value)}
          >
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {main && (
        <>
          <h3>{metric.label}</h3>
          <p className="atlas-explanation">{metric.explanation}</p>
          {group !== "size" && (
            <p className="atlas-comparison-note">
              Die Perspektiven dieser Gruppe können sich überschneiden oder
              unterschiedliche Bezugsgruppen haben. Ihre Anteile werden nicht
              zusammengezählt.
            </p>
          )}
          <div
            className="atlas-wave-horizons"
            role="group"
            aria-label="Haushaltszeitraum"
          >
            {[1959, 1980, 2000].map((y) => (
              <button
                key={y}
                type="button"
                aria-pressed={since === y}
                onClick={() => setSince(y)}
              >
                {y === 1959 ? "Gesamte Geschichte" : `Seit ${y}`}
              </button>
            ))}
          </div>
          <p className="atlas-household-legend">
            {rows.map((r, i) => (
              <span
                key={r.geography.id}
                style={{ color: i ? "var(--violet)" : "var(--primary-bright)" }}
              >
                {r.geography.label} · {i ? "Quadrate" : "Kreise"}
              </span>
            ))}
            {view?.sets.some((s) => s.points.some((p) => p.unweighted)) && (
              <span style={{ color: "var(--warning)" }}>
                Offene Raute · ungewichtet
              </span>
            )}
          </p>
          {view ? (
            <HouseholdsChart
              view={view}
              metric={metric}
              numbers={showNumbers}
            />
          ) : (
            <p className="atlas-notice">
              Für diese Perspektive fehlen Erhebungswerte im gewählten Zeitraum.
            </p>
          )}
          <p className="atlas-comparison-note">
            Jeder Punkt ist eine Erhebung. Lücken werden nicht verbunden;
            gleiche Punkte können sich überdecken. Beide Länder teilen die
            Skala. Mehr oder weniger bedeutet hier weder gut oder schlecht noch
            günstig oder teuer.
          </p>
          {view?.sets.some((s) => s.points.some((p) => p.unweighted)) && (
            <p className="atlas-notice">
              Offene Rauten kennzeichnen ungewichtete MICS-Stichproben.
            </p>
          )}
          {view?.sets
            .filter((s) => !s.points.length)
            .map((s) => (
              <p className="atlas-notice" key={s.id}>
                {s.name}: Für diese Perspektive fehlen Erhebungswerte im
                gewählten Zeitraum.
              </p>
            ))}
          <h3>Erhebungen gegenüberstellen</h3>
          <p className="atlas-comparison-note">
            Jahr und Quelle stehen an jedem Bild. Die Vorauswahl nimmt je Land
            die jüngste verfügbare Erhebung dieser Perspektive; ein Vergleich
            kann deshalb unterschiedliche Jahre zeigen.
          </p>
          <div className="atlas-household-grid">
            <ObservationCard
              row={main}
              point={first}
              metric={metric}
              requested={record}
              onChange={setRecord}
              numbers={showNumbers}
              index={0}
              max={max}
            />
            {compare && (
              <ObservationCard
                row={compare}
                point={second}
                metric={metric}
                requested={compareRecord}
                onChange={setCompareRecord}
                numbers={showNumbers}
                index={1}
                max={max}
              />
            )}
          </div>
          <details className="atlas-source-details">
            <summary>Alle Erhebungen und Quellen dieser Perspektive</summary>
            <p>
              Die Erhebung bleibt auswählbar, auch wenn ihr Wert fehlt. Zahlen
              erscheinen mit „Zahlen anzeigen“.
            </p>
            {rows.map((r) => (
              <div key={r.geography.id}>
                <h4>{r.geography.label}</h4>
                <div className="atlas-household-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Jahr</th>
                        <th>Quelle</th>
                        {showNumbers && <th>{householdUnit(metric)}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {r
                        .profile!.observations.filter((p) => p.year >= since)
                        .map((p) => (
                          <tr key={p.recordId}>
                            <td>{p.year}</td>
                            <td>
                              {p.sourceCategory} · {p.sourceCatalogId}
                              {p.unweighted ? " · ungewichtet" : ""}
                              <small>{p.sourceName}</small>
                            </td>
                            {showNumbers && (
                              <td>
                                {householdValue(p, metric) === null
                                  ? "Nicht verfügbar"
                                  : fmt(householdValue(p, metric)!)}
                              </td>
                            )}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </details>
        </>
      )}
      <details className="atlas-source-details">
        <summary>Quelle und Bedeutung der Haushaltsbilder</summary>
        <p>
          UN DESA · Database on Household Size and Composition 2026. 1.129
          Erhebungen aus 200 Ländern und Gebieten; verarbeitet bis 30. Juni
          2026. Volkszählungen und Haushaltsbefragungen werden nach einem
          gemeinsamen Verfahren ausgewertet. Abstände, Ausgangsquellen und
          Definitionen der Haushalte können sich unterscheiden.
        </p>
        <p>
          Übliche Bewohner zählen zum Haushalt, Besucher nicht.
          Gemeinschaftsunterkünfte sind in den IPUMS-Auswertungen
          ausgeschlossen. „Kinder“ in Familienformen können erwachsen sein.
          Verwandtschaft, Altersgruppen und Haushaltsbezugsperson sind
          verschiedene Merkmale.
        </p>
        <p>
          Manche Quellen bieten keine ausreichenden Verwandtschaftsangaben.
          Fehlende Werte werden nicht aus anderen Spalten oder Quellen ergänzt.
          Bei acht MICS-Erhebungen fehlen Stichprobengewichte; ihre Werte
          bleiben entsprechend markiert.
        </p>
        <p>
          Die Definitionen folgen dem Methodenbericht vom August 2026. Zwei
          Beschreibungen im Excel-Definitionsblatt beziehen sich irrtümlich auf
          ältere Personen; der Bericht definiert Haushaltsgröße und weibliche
          Bezugsperson für alle Haushalte.
        </p>
        {data?.provenance && (
          <p>
            Quellenstand: {data.provenance.release}. Lokal geladen:{" "}
            {new Date(data.provenance.retrievedAt).toLocaleString("de-DE")}.
          </p>
        )}
        <div className="atlas-household-links">
          {[
            [cfg.sourcePage, "UN-Datensatz"],
            [cfg.documentationUrl, "UN-Methodik"],
            [cfg.licenseUrl, "CC BY 3.0 IGO"],
          ].map(([url, label]) => (
            <a
              key={url}
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
          ))}
        </div>
        <p>
          © United Nations 2026 · CC BY 3.0 IGO. Deutsche Beschriftungen und
          Diagramme: Personal Macro. Die UN-Daten werden unverändert
          dargestellt; keine Unterstützung oder Empfehlung durch die UN ist
          damit verbunden.
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
          : "UN-Haushaltsdaten kostenlos laden"}
      </Button>
      {sync.error && <p role="alert">{errorMessage(sync.error)}</p>}
      {job?.seriesId === atlasHouseholdsDataset && (
        <p role="status">{job.message}</p>
      )}
    </>
  );
}
