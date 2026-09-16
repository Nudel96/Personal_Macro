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
import { useAtlasDisplayChoice } from "./atlas-display-state";
import {
  atlasHousingRatiosCatalog,
  atlasHousingRatiosDataset,
  housingRatioDefaultBasis,
  housingRatiosView,
  type HousingRatioBasis,
  type HousingRatioMode,
} from "./atlas-housing-ratios";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";

const errorText = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Die Wohnvergleiche konnten nicht geladen werden.";
export function AtlasHousingRatiosPanel({
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
  const [basis, setBasis] = useAtlasDisplayChoice<HousingRatioBasis>(
    "ratioBasis",
    housingRatioDefaultBasis(topicId),
    ["income", "rent"],
  );
  const [mode, setMode] = useAtlasDisplayChoice<HousingRatioMode>(
    "ratioMode",
    "relative",
    ["relative", "index"],
  );
  const [since, setSince] = useAtlasDisplayChoice<number>(
    "ratioSince",
    0,
    [0, 2000, 2010],
  );
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["atlas", "housingRatios", geography.id],
    queryFn: () => api.atlasHousingRatios(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "housingRatios", compareId],
    queryFn: () => api.atlasHousingRatios(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasHousingRatios(),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const data = query.data;
  const main = data ? housingRatiosView([data], basis, mode, since) : null;
  const compared =
    data && compareId && comparison.data
      ? housingRatiosView([data, comparison.data], basis, mode, since)
      : null;
  const view = compared ?? main;
  const indexAvailable =
    data && housingRatiosView([data], basis, "index", since);
  const compareArea = atlasCatalog.geographies.find((g) => g.id === compareId);
  const busy = sync.isPending || job?.status === "running";
  const fresh =
    data?.provenance &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86_400_000;
  const currentJob = job?.seriesId === atlasHousingRatiosDataset ? job : null;
  const relative = mode === "relative";
  const basisLabel =
    basis === "income" ? "Kaufpreise zu Einkommen" : "Kaufpreise zu Mieten";
  const unit = relative
    ? "% gegenüber dem OECD-Langfristdurchschnitt"
    : "Index · 2015 = 100";
  const style = getComputedStyle(document.documentElement);
  const colors = ["--primary-bright", "--violet"].map((k) =>
    style.getPropertyValue(k).trim(),
  );
  const textColor = style.getPropertyValue("--text-2").trim();
  const yearSpan = view
    ? Number(view.periods[view.periods.length - 1].slice(0, 4)) -
      Number(view.periods[0].slice(0, 4))
    : 0;
  const yearStep =
    yearSpan > 40 ? 10 : yearSpan > 20 ? 5 : yearSpan > 10 ? 2 : 1;
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
              : `${Number(v).toLocaleString("de", { maximumFractionDigits: 1 })} ${unit}`,
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
            interval: (i: number, p: string) =>
              i === 0 ||
              (p.endsWith("Q1") && Number(p.slice(0, 4)) % yearStep === 0),
            formatter: (p: string) => p.slice(0, 4),
          },
        },
        yAxis: {
          type: "value",
          min: relative ? -view.limit * 1.12 : 0,
          max: view.limit * 1.12,
          splitLine,
          axisLabel: {
            show: showNumbers,
            color: textColor,
            formatter: (value: number) =>
              value.toLocaleString("de", { maximumFractionDigits: 1 }),
          },
        },
        series: view.series.flatMap((s) =>
          s.segments.map((segment, i) => ({
            type: "line" as const,
            name: s.name,
            data: segment,
            connectNulls: false,
            smooth: false,
            showSymbol: true,
            symbolSize: 3,
            color: colors[s.area],
            lineStyle: {
              width: 2.6,
              type: s.area ? ("dashed" as const) : ("solid" as const),
            },
            ...(relative && s.area === 0 && i === 0
              ? {
                  markLine: {
                    silent: true,
                    symbol: ["none", "none"],
                    lineStyle: {
                      color: textColor,
                      width: 1,
                      type: "dashed" as const,
                    },
                    label: { show: false },
                    data: [{ yAxis: 0 }],
                  },
                }
              : {}),
          })),
        ),
      }
    : {};
  const choices = atlasHousingRatiosCatalog.areas
    .map((a) => atlasCatalog.geographies.find((g) => g.id === a.geographyId)!)
    .filter(
      (a) =>
        geography.regionId === "world" || a.regionId === geography.regionId,
    );
  return (
    <>
      <p className="atlas-explanation">
        {basis === "income"
          ? "Dieses Bild setzt Kaufpreise von Wohnimmobilien ins Verhältnis zum verfügbaren Einkommen je Einwohner. Steigt die Linie, wachsen die Kaufpreise relativ zum Einkommen."
          : "Dieses Bild setzt Kaufpreise von Wohnimmobilien ins Verhältnis zu Wohnungsmieten. Steigt die Linie, wachsen Kaufpreise relativ zu Mieten."}{" "}
        {relative
          ? "Oberhalb der Mittellinie liegt dieses Verhältnis über dem langfristigen OECD-Vergleichswert, unterhalb darunter."
          : "Der Verlauf zeigt die Veränderung gegenüber dem jeweiligen Durchschnitt von 2015."}
      </p>
      <div className="atlas-history-controls">
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="Wohnvergleich"
        >
          {(
            [
              ["income", "Zu Einkommen"],
              ["rent", "Zu Mieten"],
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
          aria-label="Vergleichsbild"
        >
          {(
            [
              ["relative", "Hoch & Tief"],
              ["index", "Verhältnis im Verlauf"],
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
          aria-label="Vergleichszeitraum"
        >
          {[0, 2000, 2010].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={since === value}
              onClick={() => setSince(value)}
            >
              {value ? `Seit ${value}` : "Gesamte Geschichte"}
            </button>
          ))}
        </div>
      </div>
      {query.isPending && (
        <p role="status">Lokale Wohnvergleiche werden geladen …</p>
      )}
      {query.error && <p role="alert">{errorText(query.error)}</p>}
      {data?.status === "desktop_required" && (
        <p>
          Diese öffentlichen OECD-Vergleiche lassen sich in der Desktop-App
          laden.
        </p>
      )}
      {data?.status === "not_downloaded" && (
        <p>
          Die OECD-Grundlage für Kaufpreise, Einkommen und Mieten wurde noch
          nicht geladen.
        </p>
      )}
      {data?.status === "unsupported_area" && (
        <p>
          Für {geography.label} enthält diese OECD-Quelle keinen eigenen
          Wohnvergleich.
        </p>
      )}
      {data?.status === "available" && !main && (
        <p>
          Für diese Kombination sind im gewählten Zeitraum keine nutzbaren
          Vergleichswerte vorhanden.
        </p>
      )}
      {relative && !main && indexAvailable && (
        <Button size="sm" onClick={() => setMode("index")}>
          Verlauf mit Bezugsjahr 2015 ansehen
        </Button>
      )}
      {compareId && !compared && (
        <p role="status">
          {compareArea?.label}:{" "}
          {comparison.isPending
            ? "Vergleich wird geladen …"
            : comparison.error
              ? errorText(comparison.error)
              : "Kein passendes Vergleichsbild mit demselben Quellenstand und gemeinsamen Quartalen vorhanden."}
        </p>
      )}
      {view && (
        <figure className="atlas-credit-figure">
          <figcaption>
            {basisLabel} ·{" "}
            {relative ? "Hoch & Tief zum OECD-Durchschnitt" : "Bezugsjahr 2015"}{" "}
            · {view.periods[0]} bis {view.periods[view.periods.length - 1]}
          </figcaption>
          <div
            role="img"
            aria-label={`${geography.label}${compared && compareArea ? ` im Vergleich mit ${compareArea.label}` : ""}: ${basisLabel}; ${unit}. ${relative ? "Mittellinie: OECD-Langfristdurchschnitt, kein fairer Preis." : "Jedes Gebiet hat seine eigene Bezugsbasis."} Lücken und eingeschränkt vergleichbare Abschnitte bleiben getrennt.`}
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
            {relative
              ? "Mittellinie: veröffentlichter OECD-Langfristdurchschnitt. Obere und untere Bildhälfte haben denselben Maßstab."
              : compared
                ? "Beide Gebiete teilen die Skala; vergleichbar ist die Entwicklung ihres Verhältnisses, nicht das absolute Preisniveau."
                : "Die Linie zeigt die Entwicklung des Verhältnisses gegenüber dem Bezugsjahr; sie zeigt kein absolutes Preisniveau."}{" "}
            Ein historischer Durchschnitt ist kein fairer Preis. Kreditkosten,
            Steuern und Unterschiede zwischen Haushalten sind hier nicht
            erfasst.
          </p>
          {relative && (
            <p className="atlas-comparison-note">
              Die OECD nennt in dieser Datei keinen einheitlichen Zeitraum für
              den Langfristvergleich. Die jeweilige Referenz und frühere Werte
              können sich mit neuen Veröffentlichungen ändern.
            </p>
          )}
          {view.series.some((s) => s.breaks.length > 0) && (
            <p className="atlas-comparison-note">
              Historische Quellenabschnitte sind nur eingeschränkt vergleichbar
              und werden getrennt gezeichnet:{" "}
              {view.series
                .filter((s) => s.breaks.length)
                .map((s) => `${s.name} (${s.breaks.join(", ")})`)
                .join("; ")}
              .
            </p>
          )}
          {[geography, ...(compared && compareArea ? [compareArea] : [])].some(
            (g) => g.id.startsWith("oecd:"),
          ) && (
            <p className="atlas-comparison-note">
              Diese OECD-Gruppen sind eigenständige Quellenaggregate. Der
              Euroraum mit 17 Ländern bleibt vom anderen Euroraum getrennt;
              OECD-Länder sind keine vollständige Welt.
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
                          maximumFractionDigits: 1,
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
          OECD-Vergleichsgebiet öffnen{" "}
          <select
            aria-label="OECD-Vergleichsgebiet öffnen"
            value=""
            onChange={(e) => {
              const area = atlasCatalog.geographies.find(
                (g) => g.id === e.target.value,
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
              ? "OECD-Wohnvergleiche heute bereits geladen"
              : "OECD-Wohnvergleiche für alle Gebiete laden"}
        </Button>
        <span>Öffentliche Daten · kein zusätzlicher API-Schlüssel</span>
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
          Quelle: OECD (2026), Analytical house prices indicators.{" "}
          {data?.provenance
            ? `Abgerufen am ${new Date(data.provenance.retrievedAt).toLocaleDateString("de")}.`
            : "Der lokale Abrufzeitpunkt erscheint nach dem Laden."}{" "}
          Deutsche Erläuterungen und Darstellungen wurden für diesen Atlas
          erstellt; sie sind keine offizielle OECD-Übersetzung.
        </p>
        <p>
          Kaufpreis zu Einkommen teilt den nominalen Hauspreisindex durch das
          nominale verfügbare Einkommen je Einwohner. Kaufpreis zu Mieten
          verwendet den Mietpreisindex. Das sind Indexverhältnisse, keine Anzahl
          benötigter Jahresgehälter und keine Mietrendite. Finanzierungskosten
          und die Verteilung von Einkommen bleiben unberücksichtigt.
        </p>
        <p>
          Die Quelle veröffentlicht die saisonbereinigten Verhältnisse mit
          Bezugsjahr 2015 und getrennt als Prozent des jeweiligen
          Langfristdurchschnitts. Die Hoch-/Tiefansicht zieht von dieser
          veröffentlichten Prozentreihe hundert ab. Es wird kein eigener Trend,
          Durchschnitt oder Sinus geschätzt. Fehlende normalisierte Reihen
          werden nicht durch selbst berechnete Referenzen ersetzt.
        </p>
        <p>
          Der Abgleich von Index und normalisierter Reihe zeigt bei einigen
          historischen Abschnitten unterschiedliche Skalierungen. Die Linien
          bleiben an diesen Stellen getrennt; daraus werden keine offiziell
          datierten Methodenwechsel behauptet. Die Datei enthält keine
          vollständigen Länder- und Referenzzeitraumhinweise. Hausarten,
          Erhebungsgebiete und Quellen können sich unterscheiden; diese
          OECD-Reihen sind nicht unmittelbar mit den BIS-Preisindizes
          gleichzusetzen.
        </p>
        <p>
          Ein neuer Quellenstand kann die Vergangenheit revidieren. Die Kurve
          zeigt keinen damaligen Informationsstand und prognostiziert keine
          Rückkehr zur Mittellinie. Ein erneuter Datenabruf ist nach einem Tag
          möglich.
        </p>
        {[
          [
            atlasHousingRatiosCatalog.documentationUrl,
            "OECD-Definitionen und Datensatz",
          ],
          [
            atlasHousingRatiosCatalog.termsUrl,
            "OECD-Nutzung und Quellenangabe",
          ],
        ].map(([url, label]) => (
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
      </details>
    </>
  );
}
