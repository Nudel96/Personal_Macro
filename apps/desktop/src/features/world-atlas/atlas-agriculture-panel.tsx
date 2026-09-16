import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { atlasCatalog } from "./atlas-catalog";
import {
  useAtlasDisplayChoice,
  useAtlasDisplayText,
} from "./atlas-display-state";
import {
  agricultureSegments,
  agricultureView,
  atlasAgricultureCatalog as config,
  type AgricultureMode,
} from "./atlas-agriculture";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";
import "./atlas-agriculture.css";

const errorText = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Die Agrarbilder konnten nicht geladen werden.";
const format = (value: number) =>
  value.toLocaleString("de", { maximumFractionDigits: 2 });
export function AgricultureChart({
  view,
  title,
  showNumbers,
}: {
  view: NonNullable<ReturnType<typeof agricultureView>>;
  title: string;
  showNumbers: boolean;
}) {
  const width = 480,
    height = 240,
    left = showNumbers ? 58 : 24,
    right = 22,
    top = 54,
    bottom = 32;
  const x = (i: number) =>
    left + (i / Math.max(1, view.years.length - 1)) * (width - left - right);
  const y = (v: number) =>
    height - bottom - (v / view.max) * (height - top - bottom);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title}
      className="atlas-agriculture-chart"
    >
      <title>
        {title} · Produktionsindex, eigene Basis 2014–2016. FAO-Schätzwerte.
      </title>
      <line
        x1={left}
        x2={width - right}
        y1={y(100)}
        y2={y(100)}
        className="atlas-agriculture-reference"
      />
      <text x={left} y={16} className="atlas-agriculture-axis">
        Eigene Basis 2014–2016
      </text>
      {view.series.map((s, i) => (
        <g key={s.name} className={`atlas-agriculture-line-${i}`}>
          <line
            x1={left + i * 220}
            x2={left + 18 + i * 220}
            y1={34}
            y2={34}
            strokeWidth={2}
            strokeDasharray={i ? "5 3" : undefined}
          />
          <text x={left + 23 + i * 220} y={38} fontSize={12} stroke="none">
            {s.name.length > 25 ? `${s.name.slice(0, 24)}…` : s.name}
          </text>
        </g>
      ))}
      {showNumbers &&
        [0, 100, Math.round(view.max)].map((v) => (
          <text
            key={v}
            x={left - 8}
            y={y(v) + 4}
            textAnchor="end"
            className="atlas-agriculture-axis"
          >
            {format(v)}
          </text>
        ))}
      {view.series.flatMap((s, i) =>
        agricultureSegments(s.values).map((part, j) => (
          <g
            key={`${i}-${j}`}
            className={`atlas-agriculture-line atlas-agriculture-line-${i}`}
          >
            {part.length > 1 && (
              <polyline
                fill="none"
                strokeWidth="2.7"
                strokeDasharray={i ? "7 4" : undefined}
                points={part
                  .map((p) => `${x(p.index)},${y(p.value)}`)
                  .join(" ")}
              />
            )}
            {part.map((p) => (
              <circle
                key={p.index}
                cx={x(p.index)}
                cy={y(p.value)}
                r={part.length === 1 ? 4 : 2.3}
                stroke="none"
              >
                {showNumbers && (
                  <title>
                    {s.name} · {view.years[p.index]}: {format(p.value)} ·
                    FAO-Schätzwert
                  </title>
                )}
              </circle>
            ))}
          </g>
        )),
      )}
      <text x={left} y={height - 8} className="atlas-agriculture-axis">
        {view.years[0]}
      </text>
      {view.years.length > 1 && (
        <text
          x={width - right}
          y={height - 8}
          textAnchor="end"
          className="atlas-agriculture-axis"
        >
          {view.years[view.years.length - 1]}
        </text>
      )}
    </svg>
  );
}
export function AtlasAgriculturePanel({
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
  onAreaChange: (g: AtlasGeography) => void;
}) {
  const [mode, setMode] = useAtlasDisplayChoice<AgricultureMode>(
    "agriMode",
    "total",
    ["total", "perCapita"],
  );
  const [since, setSince] = useAtlasDisplayChoice<number>(
    "agriSince",
    1961,
    [1961, 1980, 2000],
  );
  const [group, setGroup] = useAtlasDisplayChoice<string>(
    "agriGroup",
    "overview",
    config.groups.map((g) => g.id),
  );
  const [item, setItem] = useAtlasDisplayChoice<string>("agriItem", "all", [
    "all",
    ...config.items.map((i) => i.code),
  ]);
  const [search, setSearch] = useAtlasDisplayText("agriSearch");
  const [page, setPage] = useAtlasDisplayChoice<number>(
    "agriPage",
    0,
    Array.from({ length: 40 }, (_, i) => i),
  );
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["atlas", "agriculture", geography.id],
    queryFn: () => api.atlasAgriculture(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "agriculture", compareId],
    queryFn: () => api.atlasAgriculture(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasAgriculture(),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const selected = config.items.find((i) => i.code === item);
  const candidates = selected
    ? [selected]
    : config.items
        .filter((i) =>
          search
            ? `${i.title} ${i.providerLabel}`
                .toLocaleLowerCase("de")
                .includes(search.toLocaleLowerCase("de"))
            : i.group === group,
        )
        .sort((a, b) => a.title.localeCompare(b.title, "de"));
  const lastPage = Math.max(0, Math.ceil(candidates.length / 6) - 1),
    activePage = Math.min(page, lastPage);
  const visible = candidates.slice(activePage * 6, activePage * 6 + 6);
  const data = query.data;
  const currentJob = job?.seriesId === config.datasetId ? job : null;
  const fresh =
    data?.provenance &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86_400_000;
  const rowView = (code: string) => {
    const main = data ? agricultureView([data], code, mode, since) : null;
    const compared =
      data && compareId && comparison.data
        ? agricultureView([data, comparison.data], code, mode, since)
        : null;
    return { main, compared, view: compared ?? main };
  };
  const regionChoices = config.regions.filter(
    (g) =>
      g.regionId === geography.regionId ||
      g.geographyId === "fao:5000" ||
      geography.id === "world",
  );
  return (
    <section className="atlas-agriculture" aria-label="Agrarbilder · FAO">
      <p className="atlas-explanation">
        Wie verändert sich die landwirtschaftliche Produktion? Jedes Bild zeigt
        die Entwicklung gegenüber der eigenen Basis 2014–2016. Es zeigt weder
        die Größe eines Landesmarktes noch Preise, Gewinne oder eine
        Unter-/Überbewertung.
      </p>
      <div className="atlas-history-controls">
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="Produktionsbasis"
        >
          {(
            [
              ["total", "Produktion insgesamt"],
              ["perCapita", "Je Einwohner"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={mode === v}
              onClick={() => setMode(v)}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="Agrarzeitraum"
        >
          {[1961, 1980, 2000].map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={since === v}
              onClick={() => setSince(v)}
            >
              Seit {v}
            </button>
          ))}
        </div>
      </div>
      <div className="atlas-agriculture-controls">
        <label>
          Themengruppe
          <select
            aria-label="Agrargruppe"
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setItem("all");
              setPage(0);
              setSearch("");
            }}
          >
            {config.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Markt oder Erzeugnis suchen
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setItem("all");
              setPage(0);
            }}
            placeholder="Zum Beispiel Kaffee, Reis oder Milch"
          />
        </label>
        {selected && (
          <Button
            variant="ghost"
            onClick={() => {
              setItem("all");
              setPage(0);
            }}
          >
            Zur Bildübersicht
          </Button>
        )}
      </div>
      {query.isPending && (
        <p role="status">Lokale Agrarbilder werden gelesen …</p>
      )}
      {query.error && <p role="alert">{errorText(query.error)}</p>}
      {data?.status === "desktop_required" && (
        <p>Die kostenlose FAO-Grundlage lässt sich in der Desktop-App laden.</p>
      )}
      {data?.status === "not_downloaded" && (
        <p>Die weltweite FAO-Produktionsgrundlage wurde noch nicht geladen.</p>
      )}
      {data?.status === "unsupported_area" && (
        <p>
          Für {geography.label} gibt es in dieser Quelle kein eigenes Profil.
          Die ausdrücklich benannten FAO-Regionen sind separat wählbar.
        </p>
      )}
      {data?.status === "empty" && (
        <p>
          Das Gebiet ist zugeordnet, enthält aber in diesem Quellenstand keine
          Werte.
        </p>
      )}
      {compareId && comparison.error && (
        <p role="alert">Vergleich: {errorText(comparison.error)}</p>
      )}
      {data?.profile && (
        <>
          <div className="atlas-agriculture-legend">
            <span>{geography.label} · durchgezogen</span>
            {compareId && (
              <span>
                {
                  atlasCatalog.geographies.find((g) => g.id === compareId)
                    ?.label
                }{" "}
                · gestrichelt, soweit gemeinsam verfügbar
              </span>
            )}
          </div>
          <p className="atlas-muted">
            FAO-Schätzwerte. Gleiche Skala innerhalb eines Bildes; verschiedene
            Erzeugnisse haben eigene Skalen. Die Basislinie ist kein
            Gleichgewicht.{" "}
            {mode === "perCapita" &&
              "Je Einwohner ist ebenfalls ein Index, keine Menge pro Person und kein Ernährungsmaß."}
          </p>
          <div
            className={`atlas-agriculture-grid${selected ? " is-single" : ""}`}
          >
            {visible.map((def) => {
              const { view, compared } = rowView(def.code);
              return (
                <article key={def.code} className="atlas-agriculture-card">
                  <h3>{def.title}</h3>
                  {view ? (
                    <AgricultureChart
                      view={view}
                      title={`${def.title} · ${mode === "total" ? "Produktion insgesamt" : "Je Einwohner"} · ${view.series.map((s) => s.name).join(" / ")}`}
                      showNumbers={showNumbers}
                    />
                  ) : (
                    <div className="atlas-agriculture-empty">
                      Keine nutzbaren Werte im gewählten Zeitraum.
                    </div>
                  )}
                  {compareId && !compared && (
                    <p className="atlas-muted">
                      Für dieses Bild ist kein Vergleich mit gemeinsamem
                      Datenstand und Zeitraum verfügbar.
                    </p>
                  )}
                  {!selected && (
                    <button
                      className="atlas-agriculture-open"
                      type="button"
                      onClick={() => {
                        setItem(def.code);
                        setPage(0);
                      }}
                    >
                      Bild öffnen: {def.title}
                    </button>
                  )}
                  {selected && showNumbers && view && (
                    <AgricultureTable view={view} />
                  )}
                </article>
              );
            })}
          </div>
          {!candidates.length && <p>Kein Erzeugnis passt zu dieser Suche.</p>}
          {!selected && candidates.length > 6 && (
            <div
              className="atlas-wave-horizons"
              aria-label="Weitere Agrarbilder"
            >
              <button
                type="button"
                disabled={activePage === 0}
                onClick={() => setPage(activePage - 1)}
              >
                Vorherige Bilder
              </button>
              <button
                type="button"
                disabled={activePage === lastPage}
                onClick={() => setPage(activePage + 1)}
              >
                Weitere Bilder
              </button>
              {showNumbers && (
                <span>
                  Seite {activePage + 1} / {lastPage + 1}
                </span>
              )}
            </div>
          )}
        </>
      )}
      <div className="atlas-actions">
        <Button
          disabled={
            !isTauri() ||
            sync.isPending ||
            job?.status === "running" ||
            Boolean(fresh)
          }
          onClick={() => sync.mutate()}
        >
          FAO-Produktionsdaten für alle Länder laden
        </Button>
      </div>
      {fresh && (
        <p className="atlas-muted">
          Der weltweite Quellenstand wurde innerhalb der letzten 24 Stunden
          geladen.
        </p>
      )}
      {sync.error && <p role="alert">{errorText(sync.error)}</p>}
      {currentJob && (
        <p role={currentJob.status === "failed" ? "alert" : "status"}>
          {currentJob.message}
        </p>
      )}
      <details className="atlas-method">
        <summary>Quelle, Bedeutung und Regionsauswahl</summary>
        <p>
          FAOSTAT Production Indices · CC BY 4.0. Die Quelle nennt diese Reihen
          Brutto-Produktionsindizes. Bezugsbasis: Durchschnitt 2014–2016 = 100.
          Alle übernommenen Einzelwerte tragen das Quellenkennzeichen E
          (geschätzt). Fehlende Werte werden nicht zu null; einzelne Werte
          bleiben Punkte.
        </p>
        <p>
          Nahrungsmittelproduktion bedeutet keine Ernährungssicherheit.
          Außenhandel, Verteilung und Kaufkraft sind hier nicht enthalten. Die
          FAO-Nahrungsmittelgruppe schließt beispielsweise Kaffee und Tee aus.
          Fleisch aus heimischen Tieren berücksichtigt laut FAO auch exportierte
          lebende Tiere und schließt importierte lebende Tiere aus.
        </p>
        <p>
          Die allgemeine FAO-Methodennotiz beschreibt auch Abzüge für Saat und
          Futter; die konkrete Datei bezeichnet beide Reihen ausdrücklich als
          „Gross“. Der Atlas übernimmt die veröffentlichten Indizes unverändert
          und berechnet keine eigenen Nettoindizes.
        </p>
        {data?.profile && (
          <p>
            Quellengebiet: {data.profile.providerLabel}. Chinas Festland und das
            umfassendere FAO-China-Gebiet bleiben getrennt; Regionen sind
            unveränderte FAO-Aggregate.
          </p>
        )}
        {data?.provenance && (
          <p>
            Veröffentlichungsstand: {data.provenance.release.slice(0, 10)} ·
            Lokal geladen:{" "}
            {new Date(data.provenance.retrievedAt).toLocaleDateString("de")}.{" "}
            {showNumbers &&
              `${data.provenance.areaCount} Profile · ${data.provenance.numericCellCount.toLocaleString("de")} Werte.`}
          </p>
        )}
        {selected && (
          <p>
            Originaldefinition: {selected.providerLabel} · CPC{" "}
            {selected.cpc.replace("'", "")}
          </p>
        )}
        <div className="atlas-actions">
          {[
            ["FAOSTAT öffnen", "https://www.fao.org/faostat/en/#data/QI"],
            ["Methodik öffnen", config.metadataUrl],
          ].map(([label, url]) => (
            <Button
              key={url}
              variant="ghost"
              onClick={() => {
                if (isTauri()) void openUrl(url);
                else window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <label>
          Ausdrücklich zu einer FAO-Region wechseln
          <select
            aria-label="FAO-Region"
            value=""
            onChange={(e) => {
              const g = atlasCatalog.geographies.find(
                (g) => g.id === e.target.value,
              );
              if (g) onAreaChange(g);
            }}
          >
            <option value="">Region auswählen …</option>
            {regionChoices.map((r) => (
              <option key={r.geographyId} value={r.geographyId}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
      </details>
    </section>
  );
}
function AgricultureTable({
  view,
}: {
  view: NonNullable<ReturnType<typeof agricultureView>>;
}) {
  return (
    <details>
      <summary>Werte und gemeinsame Jahre</summary>
      <div className="atlas-agriculture-table">
        <table>
          <thead>
            <tr>
              <th>Jahr</th>
              {view.series.map((s) => (
                <th key={s.name}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.years.map((year, i) => (
              <tr key={year}>
                <td>{year}</td>
                {view.series.map((s) => (
                  <td key={s.name}>
                    {s.values[i] != null
                      ? format(s.values[i]!)
                      : "Nicht verfügbar"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
