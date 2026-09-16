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
  atlasPropertyCatalog,
  atlasPropertyDataset,
  propertyMetric,
  propertyView,
  type PropertyBasis,
  type PropertyMode,
} from "./atlas-property";
import { useAtlasDisplayChoice } from "./atlas-display-state";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";

const errorText = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Die Immobilienbilder konnten nicht geladen werden.";
export function AtlasPropertyPanel({
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
  onAreaChange: (area: AtlasGeography) => void;
}) {
  const [basis, setBasis] = useAtlasDisplayChoice<PropertyBasis>(
    "propertyBasis",
    "real",
    ["real", "nominal"],
  );
  const [mode, setMode] = useAtlasDisplayChoice<PropertyMode>(
    "propertyMode",
    "index",
    ["index", "change"],
  );
  const [since, setSince] = useAtlasDisplayChoice<number>(
    "propertySince",
    0,
    [0, 1970, 2000],
  );
  const [scale, setScale] = useAtlasDisplayChoice<string>(
    "propertyScale",
    "linear",
    ["linear", "proportional"],
  );
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["atlas", "property", geography.id],
    queryFn: () => api.atlasProperty(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "property", compareId],
    queryFn: () => api.atlasProperty(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasProperty(),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const data = query.data,
    metric = propertyMetric(basis, mode);
  const main = data ? propertyView([data], metric, since) : null;
  const compared =
    data && compareId && comparison.data
      ? propertyView([data, comparison.data], metric, since)
      : null;
  const view = compared ?? main;
  const compareArea = atlasCatalog.geographies.find((g) => g.id === compareId);
  const configs = [
    geography,
    ...(compared && compareArea ? [compareArea] : []),
  ].map((g) => ({
    geography: g,
    area: atlasPropertyCatalog.areas.find((a) => a.geographyId === g.id),
  }));
  const busy = sync.isPending || job?.status === "running";
  const fresh =
    data?.provenance &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86_400_000;
  const currentJob = job?.seriesId === atlasPropertyDataset ? job : null;
  const style = getComputedStyle(document.documentElement);
  const colors = ["--primary-bright", "--violet"].map((key) =>
    style.getPropertyValue(key).trim(),
  );
  const textColor = style.getPropertyValue("--text-2").trim();
  const isChange = mode === "change",
    proportional = !isChange && scale === "proportional";
  const unit = isChange
    ? "% gegenüber dem Vorjahresquartal"
    : "Index · 2010 = 100";
  const chart: EChartsOption = view
    ? {
        animation: false,
        grid: { left: showNumbers ? 70 : 25, right: 25, top: 32, bottom: 40 },
        tooltip: {
          ...tooltip,
          show: showNumbers,
          trigger: "axis",
          renderMode: "richText",
          valueFormatter: (v) =>
            v == null
              ? "Ohne Wert"
              : `${Number(v).toLocaleString("de", { maximumFractionDigits: 2 })} ${unit}`,
        },
        xAxis: {
          type: "category",
          data: view.periods,
          boundaryGap: false,
          axisLine,
          axisTick: { show: false },
          axisLabel: {
            color: textColor,
            hideOverlap: true,
            formatter: (p: string) => p.slice(0, 4),
          },
        },
        yAxis: {
          type: proportional ? "log" : "value",
          min: isChange
            ? -view.limit * 1.12
            : proportional
              ? view.minimum / 1.12
              : 0,
          max: view.limit * 1.12,
          splitLine,
          axisLabel: { show: showNumbers, color: textColor },
        },
        series: view.series.map((s, i) => ({
          type: "line",
          name: s.name,
          data: s.values,
          connectNulls: false,
          smooth: false,
          showSymbol: true,
          symbolSize: 3,
          color: colors[s.area],
          lineStyle: { width: 2.6, type: s.area ? "dashed" : "solid" },
          ...(isChange && i === 0
            ? {
                markLine: {
                  silent: true,
                  symbol: ["none", "none"],
                  lineStyle: { color: textColor, width: 1, type: "dashed" },
                  label: { show: false },
                  data: [{ yAxis: 0 }],
                },
              }
            : {}),
        })),
      }
    : {};
  const choices = atlasPropertyCatalog.areas
    .map((a) => atlasCatalog.geographies.find((g) => g.id === a.geographyId)!)
    .filter(
      (a) =>
        a.regionId === geography.regionId || geography.regionId === "world",
    );
  return (
    <>
      <p className="atlas-explanation">
        {isChange
          ? "Oberhalb der Mittellinie sind die Wohnimmobilienpreise höher als ein Jahr zuvor, unterhalb niedriger. Das zeigt die Geschwindigkeit der Veränderung, keine feste Zyklusdauer."
          : "Der lange Verlauf zeigt, wie sich Wohnimmobilienpreise entwickelt haben. Für jedes Gebiet dient der Durchschnitt von 2010 als Bezugsbasis. Vergleichbar ist die Veränderung, nicht der Kaufpreis eines Hauses."}{" "}
        {basis === "real"
          ? "Der Einfluss allgemeiner Verbraucherpreisinflation ist herausgerechnet."
          : "Nominale Preise enthalten den Einfluss der Inflation."}
      </p>
      <div className="atlas-history-controls">
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="Immobilienbild"
        >
          {(
            [
              ["index", "Preisentwicklung"],
              ["change", "Steigen & Fallen"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="Preisbasis"
        >
          {(
            [
              ["real", "Inflation bereinigt"],
              ["nominal", "Mit Inflation"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={basis === value}
              onClick={() => setBasis(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="Immobilienzeitraum"
        >
          {[0, 1970, 2000].map((year) => (
            <button
              key={year}
              type="button"
              aria-pressed={since === year}
              onClick={() => setSince(year)}
            >
              {year ? `Seit ${year}` : "Gesamte Geschichte"}
            </button>
          ))}
        </div>
        {!isChange && (
          <div
            className="atlas-wave-horizons"
            role="group"
            aria-label="Preismaßstab"
          >
            {[
              ["linear", "Gleiche Indexabstände"],
              ["proportional", "Gleiche relative Veränderungen"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={scale === value}
                onClick={() => setScale(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {query.isPending && (
        <p role="status">Lokale Immobilienbilder werden geladen …</p>
      )}
      {query.error && <p role="alert">{errorText(query.error)}</p>}
      {data?.status === "desktop_required" && (
        <p>
          Diese öffentlichen Immobilienpreise lassen sich in der Desktop-App
          laden.
        </p>
      )}
      {data?.status === "not_downloaded" && (
        <p>Die weltweite BIS-Immobiliengrundlage wurde noch nicht geladen.</p>
      )}
      {data?.status === "unsupported_area" && (
        <p>
          Für {geography.label} enthält diese BIS-Datei kein eigenes
          Immobilienprofil. Andere Länder werden nicht zu einer künstlichen
          Region zusammengerechnet.
        </p>
      )}
      {data?.status === "available" && !main && (
        <p>
          Für dieses Bild sind im gewählten Zeitraum keine nutzbaren
          Immobilienwerte vorhanden.
        </p>
      )}
      {compareId && !compared && (
        <p role="status">
          {compareArea?.label}:{" "}
          {comparison.isPending
            ? "Vergleich wird geladen …"
            : comparison.error
              ? errorText(comparison.error)
              : "Kein vergleichbares Immobilienbild im selben Quellenstand mit gemeinsamen Quartalen vorhanden."}
        </p>
      )}
      {view && (
        <figure className="atlas-credit-figure">
          <figcaption>
            Wohnimmobilien ·{" "}
            {isChange ? "Veränderung zum Vorjahr" : "Preisentwicklung"} ·{" "}
            {basis === "real" ? "Inflation bereinigt" : "Mit Inflation"} ·{" "}
            {view.periods[0]} bis {view.periods[view.periods.length - 1]}
          </figcaption>
          <div
            role="img"
            aria-label={`${geography.label}${compared && compareArea ? ` im Vergleich mit ${compareArea.label}` : ""}: ${basis === "real" ? "inflationsbereinigte" : "nominale"} Wohnimmobilienpreise; ${unit}.${proportional ? " Logarithmischer Maßstab." : ""} Lücken bleiben offen. Keine faire Bewertung.`}
          >
            <BaseChart option={chart} height={330} />
          </div>
          <ul className="atlas-energy-legend">
            {view.series.map((s) => (
              <li key={s.name}>
                <span
                  style={{ background: colors[s.area] }}
                  aria-hidden="true"
                />
                {s.name}
                {s.area ? " · gestrichelt" : ""} · {s.first} bis {s.last}
              </li>
            ))}
          </ul>
          <p className="atlas-comparison-note">
            {isChange
              ? "Mittellinie: unverändert zum Vorjahr. Beide Bildhälften haben denselben Maßstab."
              : proportional
                ? "Gleiche Höhenabstände zeigen gleiche prozentuale Veränderungen (logarithmischer Maßstab)."
                : "Die gezeigten Gebiete teilen dieselbe Indexskala."}{" "}
            Kein Maß für faire Bewertung, Mieten oder Bezahlbarkeit.
          </p>
          <p className="atlas-comparison-note">
            Die Erhebungsgebiete und erfassten Häuser unterscheiden sich.
            Quellenwechsel können das Bild verändern.
            {configs.some((c) => c.area?.historicalBackcast) &&
              " Lange Reihen verbinden historische Quellen; frühe Quartale können vom Anbieter aus Jahreswerten berechnet sein."}
          </p>
          {configs.some((c) => c.geography.id.startsWith("bis:")) && (
            <p className="atlas-comparison-note">
              BIS-Gruppen sind veröffentlichte Aggregate ausgewählter
              Volkswirtschaften; sie bilden keine vollständige Welt- oder
              Kontinenterhebung ab.
            </p>
          )}
        </figure>
      )}
      {showNumbers && view && (
        <details className="atlas-method">
          <summary>Quartalswerte · {unit}</summary>
          <div className="atlas-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quartal</th>
                  {view.series.map((s) => (
                    <th key={s.name}>{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.periods.map((p, i) => (
                  <tr key={p}>
                    <td>{p}</td>
                    {view.series.map((s) => (
                      <td key={s.name}>
                        {s.values[i]?.toLocaleString("de", {
                          maximumFractionDigits: 4,
                        }) ?? "Nicht verfügbar"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {!main && choices.length > 0 && (
        <label className="atlas-credit-alternatives">
          Verfügbares BIS-Immobiliengebiet öffnen{" "}
          <select
            aria-label="BIS-Immobiliengebiet öffnen"
            value=""
            onChange={(event) => {
              const area = atlasCatalog.geographies.find(
                (g) => g.id === event.target.value,
              );
              if (area) onAreaChange(area);
            }}
          >
            <option value="">Gebiet auswählen …</option>
            {choices.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="atlas-overview-download">
        <Button
          size="sm"
          disabled={!isTauri() || busy || Boolean(fresh)}
          onClick={() => sync.mutate()}
        >
          {busy
            ? "Atlas-Abruf läuft …"
            : fresh
              ? "BIS-Immobilienstand heute bereits geladen"
              : "BIS-Immobilienbilder weltweit laden"}
        </Button>
        <span>Öffentlicher Download · kein zusätzlicher API-Schlüssel</span>
      </div>
      {sync.error && <p role="alert">{errorText(sync.error)}</p>}
      {currentJob && (
        <p role={currentJob.status === "failed" ? "alert" : "status"}>
          {currentJob.message}
        </p>
      )}
      <details className="atlas-method">
        <summary>Quelle, Bedeutung und Grenzen</summary>
        <p>
          Quelle: Bank for International Settlements (BIS), Selected residential
          property prices. Deutsche Erläuterungen sind keine offizielle
          BIS-Übersetzung.
        </p>
        {configs.map(
          (c) =>
            c.area && (
              <p key={c.geography.id}>
                {c.geography.label} · Nationale Ausgangsquellen laut
                BIS-Verzeichnis vom Juli 2026: {c.area.sourceInstitutions}.
              </p>
            ),
        )}
        <p>
          Die BIS wählt je Gebiet eine möglichst repräsentative Reihe.
          Landesweite Abdeckung und alle neuen und bestehenden Wohnimmobilien
          werden angestrebt, sind aber nicht überall gegeben. Der
          Jahresdurchschnitt 2010 entspricht je Reihe hundert. Die reale Reihe
          ist mit dem jeweiligen Verbraucherpreisindex bereinigt; sie enthält
          keine Mieten oder Haushaltseinkommen.
        </p>
        <p>
          Alle vier Reihen werden unverändert aus dem veröffentlichten Download
          übernommen. Die App fügt keine Glättung oder Zwischenwerte hinzu. Die
          historische BIS-Rekonstruktion kann unterschiedliche Quellen
          verknüpfen und Jahreswerte in Quartale umrechnen. Die Datei liefert
          keine vollständigen Länderhinweise oder datierten Bruchmarkierungen.
          Eine glatte Linie beweist deshalb keine durchgehend gleiche Erhebung.
        </p>
        <p>
          Dies ist der zuletzt geladene, gegebenenfalls revidierte Quellenstand,
          keine Sammlung damals verfügbarer Informationen. Über- und
          Unterbewertung oder Jahrhundertzyklen werden daraus nicht automatisch
          bestimmt.
        </p>
        {data?.provenance && (
          <p>
            Lokal geladen:{" "}
            {new Date(data.provenance.retrievedAt).toLocaleDateString("de")}.
            Ein erneuter Download ist nach einem Tag möglich.
          </p>
        )}
        {[
          ["https://data.bis.org/topics/RPP", "BIS-Quelle und Methodik öffnen"],
          [
            atlasPropertyCatalog.sourceInstitutionsUrl,
            "Nationale Ausgangsquellen bei der BIS",
          ],
        ].map(([url, label]) => (
          <p key={url}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                if (isTauri()) {
                  event.preventDefault();
                  void openUrl(url);
                }
              }}
            >
              {label}
            </a>
          </p>
        ))}
      </details>
    </>
  );
}
