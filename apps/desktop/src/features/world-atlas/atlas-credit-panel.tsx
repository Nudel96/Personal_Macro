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
  atlasCreditCatalog,
  atlasCreditDataset,
  creditView,
  type CreditMode,
} from "./atlas-credit";
import { useAtlasDisplayChoice } from "./atlas-display-state";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";

const errorText = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Die Kreditbilder konnten nicht geladen werden.";
export function AtlasCreditPanel({
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
  const [mode, setMode] = useAtlasDisplayChoice<CreditMode>(
    "creditMode",
    "gap",
    ["gap", "ratio"],
  );
  const [since, setSince] = useAtlasDisplayChoice<number>(
    "creditSince",
    0,
    [0, 1980, 2000],
  );
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["atlas", "credit", geography.id],
    queryFn: () => api.atlasCredit(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "credit", compareId],
    queryFn: () => api.atlasCredit(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasCredit(),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const data = query.data;
  const main = data ? creditView([data], mode, since) : null;
  const compared =
    data && compareId && comparison.data
      ? creditView([data, comparison.data], mode, since)
      : null;
  const view = compared ?? main;
  const compareArea = atlasCatalog.geographies.find((g) => g.id === compareId);
  const busy = sync.isPending || job?.status === "running";
  const currentJob = job?.seriesId === atlasCreditDataset ? job : null;
  const fresh =
    data?.provenance &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86_400_000;
  const style = getComputedStyle(document.documentElement);
  const colors = ["--primary-bright", "--violet"].map((key) =>
    style.getPropertyValue(key).trim(),
  );
  const textColor = style.getPropertyValue("--text-2").trim();
  const unit = mode === "gap" ? "Prozentpunkte" : "% der Wirtschaftsleistung";
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
            formatter: (period: string) => period.slice(0, 4),
          },
        },
        yAxis: {
          type: "value",
          min: mode === "gap" ? -view.limit * 1.12 : 0,
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
          lineStyle: {
            width: s.trend ? 1.8 : 2.6,
            type: s.trend ? "dotted" : s.area ? "dashed" : "solid",
            opacity: s.trend ? 0.7 : 1,
          },
          ...(mode === "gap" && i === 0
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
  const choices = atlasCreditCatalog.areas
    .map((a) => atlasCatalog.geographies.find((g) => g.id === a.geographyId)!)
    .filter(
      (a) => a.regionId === geography.regionId || geography.id === "world",
    );
  return (
    <>
      <p className="atlas-explanation">
        Private Schulden im Verhältnis zur Wirtschaftsleistung: Die Welle zeigt
        die Abweichung vom langfristigen BIS-Trend. Oberhalb liegen die Schulden
        höher, unterhalb niedriger als dieser Trend. Die Mittellinie beschreibt
        keine faire Bewertung.
      </p>
      <div className="atlas-history-controls">
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="Kreditbild"
        >
          {(
            [
              ["gap", "Welle um den Trend"],
              ["ratio", "Schulden & Trend"],
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
          aria-label="Kreditzeitraum"
        >
          {[0, 1980, 2000].map((year) => (
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
      </div>
      {query.isPending && (
        <p role="status">Lokale Kreditbilder werden geladen …</p>
      )}
      {query.error && <p role="alert">{errorText(query.error)}</p>}
      {data?.status === "desktop_required" && (
        <p>
          Diese öffentlichen Kreditdaten lassen sich in der Desktop-App laden.
        </p>
      )}
      {data?.status === "not_downloaded" && (
        <p>Die weltweite BIS-Kreditgrundlage wurde noch nicht geladen.</p>
      )}
      {data?.status === "unsupported_area" && (
        <p>
          Für {geography.label} enthält diese BIS-Datei kein eigenes
          Kreditprofil. Die verfügbaren Länder werden nicht zu einer künstlichen
          Region zusammengerechnet.
        </p>
      )}
      {data?.status === "available" && !main && (
        <p>
          Für dieses Bild sind im gewählten Zeitraum keine nutzbaren Kreditwerte
          vorhanden.
        </p>
      )}
      {compareId && !compared && (
        <p role="status">
          {compareArea?.label}:{" "}
          {comparison.isPending
            ? "Vergleich wird geladen …"
            : comparison.error
              ? errorText(comparison.error)
              : "Kein vergleichbares Kreditbild im selben Quellenstand und Zeitraum vorhanden."}
        </p>
      )}
      {view && (
        <figure className="atlas-credit-figure">
          <figcaption>
            {mode === "gap"
              ? "Kreditwelle · oberhalb / unterhalb des BIS-Trends"
              : "Private Schulden und langfristiger BIS-Trend"}{" "}
            · {view.periods[0]} bis {view.periods[view.periods.length - 1]}
          </figcaption>
          <div
            role="img"
            aria-label={`${geography.label}${compared && compareArea ? ` im Vergleich mit ${compareArea.label}` : ""}: ${mode === "gap" ? "Abweichung vom Kredittrend" : "Kreditquote und Trend"}; ${unit}. Lücken bleiben offen.`}
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
                {s.trend ? " · gepunktet" : s.area ? " · gestrichelt" : ""}
              </li>
            ))}
          </ul>
          <p className="atlas-comparison-note">
            {mode === "gap"
              ? "Mittellinie: am statistischen Trend. Beide Bildhälften haben denselben Maßstab."
              : "Durchgehende bzw. gestrichelte Linie: Schuldenquote. Gepunktete Linie: BIS-Modelltrend."}{" "}
            Haushalte und Unternehmen außerhalb des Finanzsektors zusammen;
            keine Staatsschulden.
          </p>
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
                {view.periods.map((period, i) => (
                  <tr key={period}>
                    <td>{period}</td>
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
          Verfügbares BIS-Gebiet öffnen{" "}
          <select
            aria-label="BIS-Gebiet öffnen"
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
              ? "BIS-Stand heute bereits geladen"
              : "BIS-Kreditbilder weltweit laden"}
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
          Quelle: Bank for International Settlements (BIS), Credit-to-GDP gaps;
          nationale Ausgangsstatistiken. Deutsche Erläuterungen sind keine
          offizielle BIS-Übersetzung.
        </p>
        <p>
          Die Quote vergleicht den Schuldenbestand am Quartalsende mit der
          Wirtschaftsleistung der letzten vier Quartale. In- und ausländische
          Kreditgeber, Banken und weitere Finanzierer sind enthalten.
        </p>
        <p>
          Trend und Welle werden unverändert aus der BIS-Datei übernommen. Der
          rückblickende HP-Filter nutzt die Daten bis zum jeweiligen Quartal;
          die BIS veröffentlicht den Trendabstand erst nach zehn Jahren
          Vorgeschichte. Quellenrevisionen und Strukturbrüche können das Bild
          verändern. Es gibt keine feste Zyklusdauer und keine daraus berechnete
          Kauf- oder Verkaufsempfehlung.
        </p>
        <p>
          Die Datei enthält keine ausführlichen historischen Länderbrüche. Die
          heutige Veröffentlichung ist keine Sammlung damals bekannter
          Datenstände. Die Weltbank-Kreditquote bleibt eine eigene Perspektive
          mit anderer Abgrenzung.
        </p>
        {data?.provenance && (
          <p>
            Lokal geladen:{" "}
            {new Date(data.provenance.retrievedAt).toLocaleDateString("de")}.
            Ein erneuter Download ist nach einem Tag möglich.
          </p>
        )}
        <a
          href="https://data.bis.org/topics/CREDIT_GAPS"
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            if (isTauri()) {
              event.preventDefault();
              void openUrl("https://data.bis.org/topics/CREDIT_GAPS");
            }
          }}
        >
          BIS-Quelle und Methodik öffnen
        </a>
      </details>
    </>
  );
}
