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
import { atlasCatalog } from "./atlas-catalog";
import {
  atlasCapacityCatalog,
  atlasCapacityDataset,
  capacityTechnologies,
  capacityView,
  type CapacityGrid,
} from "./atlas-capacity";
import { useAtlasDisplayChoice } from "./atlas-display-state";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";

const errorText = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Die Anlagendaten konnten nicht geladen werden.";
export function AtlasCapacityPanel({
  geography,
  compareId,
  topicId,
  showNumbers,
  job,
  onAreaChange,
}: {
  geography: AtlasGeography;
  compareId?: string;
  topicId: string;
  showNumbers: boolean;
  job: AtlasSyncJob | null | undefined;
  onAreaChange: (area: AtlasGeography) => void;
}) {
  const technologies = capacityTechnologies(topicId);
  const [technology, setTechnology] = useAtlasDisplayChoice(
    "capacityTech",
    technologies[0].id,
    technologies.map((t) => t.id),
  );
  const [grid, setGrid] = useAtlasDisplayChoice<CapacityGrid>(
    "capacityGrid",
    "ongrid",
    ["ongrid", "offgrid"],
  );
  const [since, setSince] = useAtlasDisplayChoice<number>(
    "capacitySince",
    2000,
    [2000, 2010],
  );
  const selected = technologies.find((t) => t.id === technology)!;
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["atlas", "capacity", geography.id],
    queryFn: () => api.atlasCapacity(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "capacity", compareId],
    queryFn: () => api.atlasCapacity(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasCapacity(),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const data = query.data;
  const rows = data
    ? [
        data,
        ...(compareId && comparison.data?.status === "available"
          ? [comparison.data]
          : []),
      ]
    : [];
  const view = capacityView(rows, technology, grid, since);
  const gridLabel =
    grid === "ongrid" ? "Mit Netzanschluss" : "Ohne Netzanschluss";
  const busy = sync.isPending || job?.status === "running";
  const fresh =
    data?.provenance &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86_400_000;
  const currentJob = job?.seriesId === atlasCapacityDataset ? job : null;
  const options = atlasCapacityCatalog.regions.filter(
    (area) => area.regionId === geography.regionId && area.id !== geography.id,
  );
  const style = getComputedStyle(document.documentElement);
  const colors = ["--primary-bright", "--violet"].map((key) =>
    style.getPropertyValue(key).trim(),
  );
  const textColor = style.getPropertyValue("--text-2").trim();
  const chart: EChartsOption = view
    ? {
        animation: false,
        color: colors,
        grid: { left: showNumbers ? 80 : 25, right: 25, top: 25, bottom: 35 },
        tooltip: {
          ...tooltip,
          show: showNumbers,
          trigger: "axis",
          renderMode: "richText",
          valueFormatter: (value) =>
            value == null
              ? "Ohne Zahlenwert"
              : `${Number(value).toLocaleString("de", { maximumFractionDigits: 2 })} MW`,
        },
        xAxis: {
          type: "category",
          data: view.years.map(String),
          boundaryGap: false,
          axisLine,
          axisTick: { show: false },
          axisLabel: { color: textColor, hideOverlap: true },
        },
        yAxis: {
          type: "value",
          min: 0,
          splitLine,
          axisLabel: {
            show: showNumbers,
            color: textColor,
            formatter: (value: number) =>
              value.toLocaleString("de", { notation: "compact" }),
          },
        },
        series: view.rows.map((row, i) => ({
          type: "line",
          name: row.name,
          data: row.values,
          connectNulls: false,
          smooth: false,
          showSymbol: true,
          symbolSize: 5,
          lineStyle: { width: 2.5, type: i ? "dashed" : "solid" },
        })),
      }
    : {};
  return (
    <>
      <p className="atlas-explanation">
        Das Bild zeigt, wie viel elektrische Leistung die Anlagen bereitstellen
        können. Es beschreibt den Ausbau der Stromwirtschaft. Die jährlich
        erzeugte Strommenge und eine finanzielle Bewertung sind eigene
        Perspektiven.
      </p>
      <div className="atlas-history-controls">
        {technologies.length > 1 && (
          <label>
            Technologie{" "}
            <select
              aria-label="Anlagentechnologie"
              value={technology}
              onChange={(event) => setTechnology(event.target.value)}
            >
              {technologies.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="Netzanbindung"
        >
          {(
            [
              ["ongrid", "Mit Netzanschluss"],
              ["offgrid", "Ohne Netzanschluss"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={grid === value}
              onClick={() => setGrid(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="Anlagenzeitraum"
        >
          {[2000, 2010].map((year) => (
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
      </div>
      {query.isPending && (
        <p role="status">Lokale Anlagenbilder werden geladen …</p>
      )}
      {query.error && (
        <p role="alert">
          {errorText(query.error)}{" "}
          <Button size="sm" onClick={() => void query.refetch()}>
            Erneut prüfen
          </Button>
        </p>
      )}
      {(data?.status === "desktop_required" ||
        data?.status === "not_downloaded") && (
        <div className="atlas-empty">
          <h3>
            {data.status === "desktop_required"
              ? "Anlagenbilder in der Desktop-App laden"
              : "Die IRENA-Grundlage ist noch nicht lokal gespeichert"}
          </h3>
          <p>
            Ein kostenloser Abruf lädt Länder und IRENA-Regionen gemeinsam.
            Danach lassen sich die Bilder offline vergleichen.
          </p>
        </div>
      )}
      {data?.status === "unsupported_area" && (
        <div className="atlas-empty">
          <h3>Kein eigenes IRENA-Profil für dieses Gebiet</h3>
          <p>
            Die Regionsgrenzen unterscheiden sich je Quelle. Wähle für diese
            Perspektive ausdrücklich eine IRENA-Region.
          </p>
          {options.map((area) => (
            <Button
              key={area.id}
              size="sm"
              onClick={() =>
                onAreaChange(
                  atlasCatalog.geographies.find((g) => g.id === area.id)!,
                )
              }
            >
              {area.label} öffnen
            </Button>
          ))}
        </div>
      )}
      {view ? (
        <>
          <div className="atlas-reading">
            <strong>{selected.label}</strong>
            <span>{gridLabel} · Installierte elektrische Leistung</span>
          </div>
          <ul
            className="atlas-energy-legend"
            aria-label="Gebiete im Anlagenvergleich"
          >
            {view.rows.map((row, i) => (
              <li key={row.name}>
                <span style={{ background: colors[i] }} aria-hidden="true" />
                {row.name}
                {i > 0 ? " · gestrichelt" : ""}
              </li>
            ))}
          </ul>
          <div
            role="img"
            aria-label={`${selected.label}: ${gridLabel}, ${view.rows.map((r) => r.name).join(" und ")}. Installierte Leistung in MW. Gemeinsamer Kalender und Maßstab; Lücken bleiben offen.`}
          >
            <BaseChart option={chart} height={320} />
          </div>
          <p className="atlas-comparison-note">
            Installierte elektrische Leistung in MW · {gridLabel}. Gleicher
            Kalender und Maßstab für alle dargestellten Gebiete. Die Quellwerte
            enthalten Schätzungen.
          </p>
          {showNumbers && (
            <details className="atlas-method">
              <summary>Jahreswerte ansehen</summary>
              <table>
                <thead>
                  <tr>
                    <th>Jahr</th>
                    {view.rows.map((r) => (
                      <th key={r.name}>{r.name} · MW</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.years.map((year, i) => (
                    <tr key={year}>
                      <td>{year}</td>
                      {view.rows.map((r) => (
                        <td key={r.name}>
                          {r.values[i]?.toLocaleString("de", {
                            maximumFractionDigits: 2,
                          }) ?? "Ohne Zahlenwert"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      ) : (
        data?.status === "available" && (
          <p className="atlas-notice" role="status">
            Für „{selected.label} · {gridLabel}“ fehlen im gewählten Zeitraum
            Zahlenwerte für mindestens eines der ausgewählten Gebiete. Die
            Regionsdatei enthält weniger Technologien als die Länderdatei; ein
            Solar-Gesamtwert ersetzt keine Photovoltaikreihe.
          </p>
        )
      )}
      {compareId && comparison.isPending && (
        <p role="status">Anlagenvergleich wird geladen …</p>
      )}
      {compareId && comparison.error && (
        <p role="alert">Vergleich: {errorText(comparison.error)}</p>
      )}
      {compareId &&
        comparison.data &&
        comparison.data.status !== "available" && (
          <p className="atlas-notice">
            Für {comparison.data.geography.label} ist kein eigenes lokales
            IRENA-Profil verfügbar. Das Bild zeigt nur {geography.label}.
          </p>
        )}
      {isTauri() && (
        <div className="atlas-overview-download">
          <Button
            size="sm"
            disabled={busy || Boolean(fresh)}
            onClick={() => sync.mutate()}
          >
            {busy ? "Atlas-Abruf läuft …" : "Weltweite Anlagendaten laden"}
          </Button>
          {fresh && (
            <span>Heute bereits geladen · erneuter Abruf nach 24 Stunden.</span>
          )}
        </div>
      )}
      {sync.error && <p role="alert">{errorText(sync.error)}</p>}
      {currentJob && (
        <p role={currentJob.status === "failed" ? "alert" : "status"}>
          {currentJob.message}
        </p>
      )}
      <details className="atlas-method">
        <summary>Quelle und Bild verstehen</summary>
        <p>
          Die Leistung bezieht sich meist auf den Bestand am Jahresende. Bei
          Solarenergie können nationale AC-/DC-Meldegrundlagen abweichen.
          Solarthermische Stromerzeugung bezeichnet hier Kraftwerke, keine
          Heizkollektoren; Pumpspeicherleistung ist keine neu erzeugte
          Primärenergie.
        </p>
        <p>
          Mit und ohne Netzanschluss bleiben getrennt. Der Quellenstrich „−“
          liefert keinen Zahlenwert und wird nicht als null gezeichnet.
          Teiltechnologien und übergeordnete Summen werden nicht addiert.
          IRENA-Regionen werden unverändert aus der Regionsdatei übernommen.
        </p>
        <p>
          <a
            href={atlasCapacityCatalog.sourceUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              if (isTauri()) {
                event.preventDefault();
                void openUrl(atlasCapacityCatalog.sourceUrl);
              }
            }}
          >
            {atlasCapacityCatalog.attribution}
          </a>
        </p>
        {data?.provenance && (
          <p>
            Quellenstand: {data.provenance.sourceUpdatedAt.slice(6, 8)}.
            {data.provenance.sourceUpdatedAt.slice(4, 6)}.
            {data.provenance.sourceUpdatedAt.slice(0, 4)} · Lokal geladen:{" "}
            {new Date(data.provenance.retrievedAt).toLocaleDateString("de")}
          </p>
        )}
      </details>
    </>
  );
}
