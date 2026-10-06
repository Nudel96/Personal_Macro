import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  CloudRain,
  Droplets,
  ExternalLink,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  Search,
  Sprout,
  Thermometer,
  Wind,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/ui/page-header";
import { api, isTauri } from "../../services/commands";
import type { CommandError } from "../../types/domain";
import {
  assetRegions,
  phaseFor,
  phaseLabels,
  weatherAssets,
  weatherCatalog,
  WEATHER_TTL_MS,
  WEATHER_QUERY_VERSION,
} from "./weather-catalog";
import {
  assessRegion,
  dateLabel,
  effectLabels,
  parseWeatherEnvelope,
  pointDay,
  summarizeRegion,
  utcDate,
  weatherValue,
} from "./weather-model";
import { WeatherMap, layerLabels, type WeatherLayer } from "./weather-map";
import { WeatherChart } from "./weather-chart";
import { WeatherPicture } from "./weather-picture";
import type { WeatherPhase, WeatherSnapshot } from "./weather-types";
import "./weather.css";

const months = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];
const phaseShort: Record<WeatherPhase, string> = {
  growth: "W",
  flowering: "B",
  ripening: "R",
  harvest: "E",
  dormant: "–",
  mixed: "↔",
};

function SourceLink({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  return (
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
      {children}
      <ExternalLink size={12} aria-hidden />
    </a>
  );
}

export function WeatherPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [playing, setPlaying] = useState(false);
  const [override, setOverride] = useState<WeatherPhase | "auto">("auto");
  const [now, setNow] = useState(Date.now());
  const asset =
    weatherAssets.find((a) => a.id === params.get("asset")) ?? weatherAssets[0];
  const regions = assetRegions(asset);
  const region =
    regions.find((r) => r.id === params.get("region")) ?? regions[0];
  const point =
    region.points.find((p) => p.id === params.get("point")) ?? region.points[0];
  const selectedLayer = params.get("layer");
  const layer: WeatherLayer =
    selectedLayer &&
    Object.prototype.hasOwnProperty.call(layerLabels, selectedLayer)
      ? (selectedLayer as WeatherLayer)
      : "picture";
  const rawDay = Number(params.get("day") ?? 0);
  const offset =
    Number.isInteger(rawDay) && rawDay >= -7 && rawDay <= 13 ? rawDay : 0;
  const query = useQuery<WeatherSnapshot, CommandError>({
    queryKey: [
      "weather",
      weatherCatalog.version,
      WEATHER_QUERY_VERSION,
      asset.id,
    ],
    queryFn: async () =>
      parseWeatherEnvelope(await api.weatherForecast(asset.id), asset),
    staleTime: WEATHER_TTL_MS,
    refetchInterval: WEATHER_TTL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const snapshot = query.data;
  const origin = snapshot?.today ?? utcDate();
  const date = utcDate(offset, origin);
  const stale =
    !!snapshot &&
    (now - Date.parse(snapshot.fetchedAt) > 3 * 60 * 60_000 ||
      snapshot.today !== utcDate());
  const fresh = stale ? undefined : snapshot;
  const phase =
    override === "auto" ? phaseFor(asset, region.id, date) : override;
  const assessment = assessRegion(asset, region, fresh, date, phase);
  const forecastPhase =
    override === "auto" ? phaseFor(asset, region.id, origin) : override;
  const forecast = assessRegion(asset, region, fresh, origin, forecastPhase, 7);
  const selectedSummary = summarizeRegion(snapshot, region, date);
  const dates = Array.from({ length: 21 }, (_, i) => utcDate(i - 7, origin));
  const listedAssets = weatherAssets.filter((a) =>
    `${a.label} ${a.group} ${a.marketContext}`
      .toLocaleLowerCase("de-DE")
      .includes(search.toLocaleLowerCase("de-DE")),
  );
  function setValues(values: Record<string, string | null>) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(values)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }
  function chooseRegion(id: string, pointId?: string) {
    setOverride("auto");
    setValues({ region: id, point: pointId ?? null });
  }
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          const day = Number(next.get("day") ?? 0);
          next.set("day", String(day >= 13 || day < 0 ? 0 : day + 1));
          return next;
        },
        { replace: true },
      );
    }, 1400);
    return () => clearInterval(timer);
  }, [playing, setParams]);

  return (
    <div className="page weather-page">
      <PageHeader
        eyebrow="MARKTKONTEXT · WETTER"
        title="Wetter & Rohstoffe"
        icon={CloudRain}
        description="Produktionsregionen, Wetterverlauf und mögliche Einflüsse auf Wachstum, Ernte und Qualität."
        actions={
          <Button
            disabled={query.isFetching}
            onClick={() => {
              setNow(Date.now());
              void query.refetch();
            }}
          >
            <RefreshCw
              size={15}
              className={query.isFetching ? "weather-spin" : ""}
            />
            {query.isFetching
              ? "Wetter wird geladen …"
              : "Wetter aktualisieren"}
          </Button>
        }
      />
      <div className="weather-source-line">
        <span className="weather-source-pill">
          <i /> Open-Meteo · öffentliche Wettermodelle
        </span>
        <SourceLink url="https://open-meteo.com/">
          Open-Meteo · CC BY 4.0
        </SourceLink>
        <span>
          {snapshot
            ? `Abruf ${new Date(snapshot.fetchedAt).toLocaleString("de-DE")} · ${stale ? "alter Stand" : "30-Minuten-Cache"}`
            : query.isFetching
              ? "Echte Wetterdaten werden geladen"
              : "Noch kein bestätigter Wetterstand"}
        </span>
        <span>Tagesfenster UTC · heute + 13 Tage</span>
      </div>
      {query.isError && (
        <div className="weather-notice weather-error" role="alert">
          {query.error.message}
          {snapshot &&
            " Der bisherige Stand bleibt sichtbar; fehlgeschlagene Abrufe erzeugen keine Ersatzwerte."}
        </div>
      )}
      {stale && (
        <div className="weather-notice" role="status">
          Der Wetterstand ist älter als drei Stunden oder stammt vom vorherigen
          UTC-Tag. Die Werte bleiben sichtbar; die Wirkungseinschätzung ist bis
          zu einem frischen Abruf ausgesetzt.
        </div>
      )}
      <div className="weather-layout">
        <aside
          className="weather-assets"
          aria-label="Wetterabhängige Rohstoffe"
        >
          <div className="weather-assets-heading">
            <Sprout size={17} />
            <strong>Rohstoff wählen</strong>
            <span>{weatherAssets.length}</span>
          </div>
          <label className="weather-search">
            <Search size={15} />
            <input
              className="input"
              type="search"
              aria-label="Rohstoffe suchen"
              placeholder="Kaffee, Kakao, Weizen …"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="weather-asset-list">
            {[...new Set(listedAssets.map((a) => a.group))].map((group) => (
              <div key={group}>
                <h3>{group}</h3>
                {listedAssets
                  .filter((a) => a.group === group)
                  .map((a) => (
                    <button
                      type="button"
                      key={a.id}
                      aria-pressed={asset.id === a.id}
                      onClick={() => {
                        setPlaying(false);
                        setOverride("auto");
                        setValues({
                          asset: a.id,
                          region: null,
                          point: null,
                          day: "0",
                        });
                      }}
                    >
                      <span>{a.label}</span>
                      <small>{a.regions.length} Regionen</small>
                    </button>
                  ))}
              </div>
            ))}
            {listedAssets.length === 0 && <p>Kein Rohstoff passt zur Suche.</p>}
          </div>
          <p className="weather-small">
            Produktionsgebiete sind eine redaktionelle Auswahl. Ein Marktkontext
            kann mehrere Qualitäten oder indirekte Märkte betreffen.
          </p>
        </aside>
        <div className="weather-workspace">
          <section className="weather-card weather-asset-intro">
            <div>
              <span className="weather-eyebrow">{asset.group}</span>
              <h2>{asset.label}</h2>
              <p>{asset.mechanism}</p>
              <small>{asset.marketContext}</small>
            </div>
            <div className="weather-coverage">
              <strong>{regions.length}</strong>
              <span>Regionen</span>
              <small>{regions.length * 3} Wetterpunkte</small>
            </div>
          </section>
          <section
            className="weather-card weather-map-card"
            aria-label="Karte und Wettervorhersage"
          >
            <div className="weather-card-header">
              <div>
                <h2>Produktionsregionen & Wetter</h2>
                <p>Wetterpunkte vergleichen · {dateLabel(date, true)} · UTC</p>
              </div>
              <div
                className="weather-layer-switch"
                role="group"
                aria-label="Wetterkartenlayer"
              >
                {(Object.keys(layerLabels) as WeatherLayer[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={layer === key}
                    onClick={() => setValues({ layer: key })}
                  >
                    {layerLabels[key]}
                  </button>
                ))}
              </div>
            </div>
            <WeatherMap
              key={asset.id}
              asset={asset}
              snapshot={layer === "impact" ? fresh : snapshot}
              date={date}
              layer={layer}
              selectedRegionId={region.id}
              selectedPointId={point.id}
              override={override}
              onRegion={chooseRegion}
            />
            <div className="weather-timeline">
              <Button
                size="icon"
                aria-label={
                  playing
                    ? "Wetterverlauf anhalten"
                    : "Wettervorhersage abspielen"
                }
                disabled={!snapshot}
                onClick={() => setPlaying((v) => !v)}
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </Button>
              <div>
                <label htmlFor="weather-day">
                  {dateLabel(date, true)}{" "}
                  <strong>
                    {date < utcDate()
                      ? "Archivierter Modelltag"
                      : offset === 0
                        ? "Heutiger Modelltag"
                        : `Vorhersage +${offset} Tage`}
                  </strong>
                </label>
                <input
                  id="weather-day"
                  type="range"
                  min={-7}
                  max={13}
                  step={1}
                  value={offset}
                  onChange={(e) => {
                    setPlaying(false);
                    setValues({ day: e.target.value });
                  }}
                  aria-valuetext={`${dateLabel(date, true)}, ${date < utcDate() ? "archivierte Modellwerte" : "Vorhersage"}, UTC`}
                />
                <div className="weather-timeline-ticks">
                  <span>−7 Tage · Modellarchiv</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPlaying(false);
                      setValues({ day: "0" });
                    }}
                  >
                    {origin === utcDate() ? "Heute" : "Modellstart"}
                  </button>
                  <span>+13 Tage · Ausblick</span>
                </div>
              </div>
            </div>
            <p className="weather-small weather-forecast-limit">
              {offset >= 7
                ? "Ab dem achten Vorhersagetag: unsicherer Ausblick. Wetterlagen und Mengen können sich deutlich ändern."
                : "Vorhersagen beschreiben mögliche Wetterbedingungen. Die Einschätzung nutzt grobe Regeln; Pflanzenstadium und Feldzustand sind nicht gemessen."}
            </p>
          </section>
          <WeatherPicture
            region={region}
            point={point}
            snapshot={snapshot}
            date={date}
            origin={origin}
            onPoint={(id) => setValues({ point: id })}
            onDay={(day) => {
              setPlaying(false);
              setValues({ day: String(day) });
            }}
          />
          <div className="weather-regional-layout">
            <section
              className="weather-card weather-regions"
              aria-label="Produktionsregionen in der Liste"
            >
              <div className="weather-card-header">
                <div>
                  <h2>Regionen im Vergleich</h2>
                  <p>{dateLabel(date)} · Tageswerte</p>
                </div>
              </div>
              {regions.map((area, i) => {
                const areaPhase =
                  override !== "auto" && area.id === region.id
                    ? override
                    : phaseFor(asset, area.id, date);
                const impact = assessRegion(
                  asset,
                  area,
                  fresh,
                  date,
                  areaPhase,
                );
                const summary = summarizeRegion(snapshot, area, date);
                return (
                  <button
                    key={area.id}
                    type="button"
                    className="weather-region-row"
                    aria-pressed={area.id === region.id}
                    onClick={() => chooseRegion(area.id)}
                  >
                    <span className="weather-region-number">{i + 1}</span>
                    <span className="weather-region-copy">
                      <strong>{area.label}</strong>
                      <small>
                        {area.country} · {phaseLabels[areaPhase]}
                      </small>
                      <span className={`weather-effect ${impact.effect}`}>
                        {effectLabels[impact.effect]}
                      </span>
                    </span>
                    <span className="weather-region-values">
                      <strong>{weatherValue(summary.rainMm, "mm")}</strong>
                      <small>
                        {weatherValue(summary.minC, "°C")} /{" "}
                        {weatherValue(summary.maxC, "°C")}
                      </small>
                      <small>{summary.coverage}/3 Punkte vollständig</small>
                    </span>
                  </button>
                );
              })}
            </section>
            <section
              className="weather-card weather-detail"
              aria-label="Regionale Wettereinschätzung"
            >
              <div className="weather-card-header">
                <div>
                  <span className="weather-eyebrow">
                    <MapPin size={13} /> {region.country}
                  </span>
                  <h2>{region.label}</h2>
                  <p>
                    {dateLabel(date, true)} · {phaseLabels[phase]}
                  </p>
                </div>
              </div>
              <div className="weather-metrics">
                <div>
                  <Droplets size={15} />
                  <span>Regen / Tag</span>
                  <strong>{weatherValue(selectedSummary.rainMm, "mm")}</strong>
                </div>
                <div>
                  <Thermometer size={15} />
                  <span>Punkt-Extrema</span>
                  <strong>
                    {weatherValue(selectedSummary.minC, "°C")} bis{" "}
                    {weatherValue(selectedSummary.maxC, "°C")}
                  </strong>
                </div>
                <div>
                  <Wind size={15} />
                  <span>P−ET₀ / Tag</span>
                  <strong>
                    {weatherValue(selectedSummary.balanceMm, "mm")}
                  </strong>
                </div>
              </div>
              <label className="weather-phase-field">
                Entwicklungsphase für die Einordnung
                <select
                  className="input"
                  value={override}
                  onChange={(e) =>
                    setOverride(e.target.value as WeatherPhase | "auto")
                  }
                >
                  <option value="auto">
                    Typischer regionaler Monatskalender
                  </option>
                  {(
                    Object.entries(phaseLabels) as [WeatherPhase, string][]
                  ).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label} · manuell
                    </option>
                  ))}
                </select>
              </label>
              <div className={`weather-assessment ${assessment.effect}`}>
                <strong>{effectLabels[assessment.effect]}</strong>
                {assessment.findings.map((finding) => (
                  <div key={finding.title}>
                    <b>{finding.title}</b>
                    <p>{finding.explanation}</p>
                  </div>
                ))}
                {assessment.findings.length === 0 && (
                  <p>
                    {assessment.effect === "unknown"
                      ? "Ein vollständiger Wetterstand fehlt. Daraus wird keine günstige oder neutrale Wirkung abgeleitet."
                      : phase === "dormant"
                        ? "Außerhalb der Hauptsaison wird weder ausreichender Wachstumsregen noch Winterschaden aus diesem Screening abgeleitet."
                        : "Die vorhandenen Werte überschreiten keine der verwendeten groben Warnschwellen. Das ist keine Aussage über Ertrag oder Feldzustand."}
                  </p>
                )}
                <small>
                  Abdeckung: {assessment.coverage}/{assessment.expected} Punkte
                  mit vollständigen Grundgrößen · redaktionelle Regeln
                </small>
              </div>
              <div className="weather-next-week">
                <span className="weather-eyebrow">
                  {origin === utcDate() ? "HEUTE" : "MODELLSTART"} UND FOLGENDE
                  6 TAGE · {dateLabel(origin)}–{dateLabel(utcDate(6, origin))}
                </span>
                <strong className={`weather-effect ${forecast.effect}`}>
                  {effectLabels[forecast.effect]}
                </strong>
                <p>
                  {weatherValue(forecast.rainMm, "mm Regen")} ·{" "}
                  {weatherValue(forecast.balanceMm, "mm P−ET₀")} ·{" "}
                  {forecast.coverage}/3 vollständige Wetterpunkte
                </p>
                <small>
                  Ungewichtetes Mittel der Punkt-Summen. Negative P−ET₀ misst
                  weder Bodenwasser noch Dürre; Bewässerung und Vorgeschichte
                  fehlen.
                </small>
              </div>
            </section>
          </div>
          <section
            className="weather-card weather-calendar"
            aria-label="Typischer regionaler Kulturkalender"
          >
            <div className="weather-card-header">
              <div>
                <h2>Saison verstehen</h2>
                <p>
                  Typische Monatsphasen · regionale und jährliche Abweichungen
                  möglich
                </p>
              </div>
            </div>
            <div className="weather-calendar-months">
              {asset.regions
                .find((r) => r.regionId === region.id)!
                .phases.map((p, i) => (
                  <div
                    key={i}
                    className={`weather-calendar-month ${p}${i === Number(date.slice(5, 7)) - 1 ? " selected" : ""}`}
                    title={`${months[i]} · ${phaseLabels[p]}`}
                  >
                    <span>{months[i]}</span>
                    <b>{phaseShort[p]}</b>
                    <small>
                      {p === "mixed"
                        ? "überlappt"
                        : p === "dormant"
                          ? "Ruhe"
                          : p === "flowering"
                            ? "Blüte"
                            : p === "growth"
                              ? "Wachstum"
                              : phaseLabels[p].split(" /")[0]}
                    </small>
                  </div>
                ))}
            </div>
            <p className="weather-small">
              W = Aussaat/Wachstum · B = Blüte/Füllung · R = Reife · E = Ernte ·
              ↔ = überlappende Dauerkultur. Bei Kakao, Palmöl und anderen
              Dauerkulturen wachsen und reifen Bestände gleichzeitig. Der
              Kalender ist keine aktuelle Feldbeobachtung.
            </p>
          </section>
          <section
            className="weather-card weather-history"
            aria-label="Wetterverlauf und einzelne Tageswerte"
          >
            <div className="weather-card-header">
              <div>
                <h2>Wetterverlauf · {region.label}</h2>
                <p>
                  Regen: Mittel vollständiger Punkte · Temperatur: niedrigster /
                  höchster Punktwert
                </p>
              </div>
            </div>
            {snapshot ? (
              <WeatherChart
                snapshot={snapshot}
                region={region}
                selectedDate={date}
              />
            ) : (
              <div className="weather-chart-empty" role="status">
                {query.isFetching
                  ? "Öffentliche Wetterdaten werden abgerufen …"
                  : "Nach einem erfolgreichen Abruf erscheint der Wetterverlauf."}
              </div>
            )}
            <details className="weather-day-table">
              <summary>
                Alle 21 Tageswerte vergleichen · sieben archivierte Tage und 14
                Prognosetage
              </summary>
              <div className="weather-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Tag · UTC</th>
                      <th>Datenart</th>
                      <th>Regen</th>
                      <th>Minimum</th>
                      <th>Maximum</th>
                      <th>P−ET₀</th>
                      <th>Abdeckung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dates.map((d) => {
                      const row = summarizeRegion(snapshot, region, d);
                      return (
                        <tr
                          key={d}
                          className={d === date ? "selected" : undefined}
                        >
                          <td>
                            <button
                              type="button"
                              onClick={() => {
                                setPlaying(false);
                                setValues({
                                  day: String(dates.indexOf(d) - 7),
                                });
                              }}
                            >
                              {dateLabel(d, true)}
                            </button>
                          </td>
                          <td>
                            {d < utcDate()
                              ? "Modellarchiv"
                              : d >= utcDate(7)
                                ? "Ausblick"
                                : "Vorhersage"}
                          </td>
                          <td>{weatherValue(row.rainMm, "mm")}</td>
                          <td>{weatherValue(row.minC, "°C")}</td>
                          <td>{weatherValue(row.maxC, "°C")}</td>
                          <td>{weatherValue(row.balanceMm, "mm")}</td>
                          <td>{row.coverage}/3</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
            <details className="weather-point-details">
              <summary>
                Drei einzelne Wetterpunkte · aktueller Modellstand und
                ausgewählter Tag
              </summary>
              <div className="weather-point-cards">
                {region.points.map((p) => {
                  const point = snapshot?.points.find(
                    (row) => row.pointId === p.id,
                  );
                  const day = pointDay(snapshot, p.id, date);
                  return (
                    <article key={p.id}>
                      <h3>{p.name}</h3>
                      <p>
                        {p.latitude.toFixed(2)}°, {p.longitude.toFixed(2)}° ·
                        angefragter Ort
                      </p>
                      <strong>
                        {weatherValue(point?.currentC, "°C")} aktuell
                      </strong>
                      <small>
                        {point
                          ? `${new Date(point.currentAt).toLocaleString("de-DE")} · Modellbedingungen`
                          : "Noch kein Modellstand"}
                      </small>
                      <p>
                        {dateLabel(date)} UTC:{" "}
                        {weatherValue(day?.rainMm, "mm Regen")} ·{" "}
                        {weatherValue(day?.gustKmh, "km/h Böen")}
                      </p>
                      <small>
                        Regenwahrscheinlichkeit (Tagesmaximum):{" "}
                        {weatherValue(day?.rainProbability, "%", 0)} · keine
                        Ertragswahrscheinlichkeit
                      </small>
                    </article>
                  );
                })}
              </div>
            </details>
          </section>
          <details className="weather-card weather-methodology">
            <summary>Quellen, Warnregeln und Grenzen der Einordnung</summary>
            <div>
              <p>
                Aktuelle Bedingungen und vergangene Tage sind Wettermodellwerte.
                Open-Meteo verbindet öffentliche Modelle im Modus „Best Match“;
                der Anbieter liefert hier keinen eindeutigen
                Modelllaufzeitpunkt. Angezeigt werden Abrufzeit und Zeit der
                aktuellen Modellbedingungen.
              </p>
              <p>
                Grobes Screening für {asset.label}: Hitze ab{" "}
                {asset.thresholds.heatC} °C, Kältehinweis bis{" "}
                {asset.thresholds.frostC} °C, Starkregen ab{" "}
                {asset.thresholds.heavyRainMm} mm/Tag, nasser Abschnitt ab{" "}
                {asset.thresholds.wetWeekMm} mm/7 Tage. Während Reife/Ernte
                gelten 10 mm/Tag als Nasshinweis. Ein P−ET₀-Defizit ab 20 mm/7
                Tage lenkt Aufmerksamkeit auf Wasserversorgung. Diese
                redaktionellen Schwellen sind keine validierten Ertrags- oder
                Schadensgrenzen.
              </p>
              <p>
                Die Karte zeigt feste Stichprobenorte, keine Produktionsmasken
                oder Flächenmittel. Ohne mehrjährige Klimareferenz wird kein
                „ungewöhnlicher“ Regen und keine Niederschlagsanomalie
                behauptet. Bodenfeuchte, Bewässerung, Sorten, Krankheiten,
                Pflanzenbeobachtungen und tatsächliche Produktion sind nicht
                angebunden.
              </p>
              <p>
                Regionen und Kalender: redaktioneller Katalog{" "}
                {weatherCatalog.version}, geprüft am {weatherCatalog.reviewedOn}
                . Die Referenzen erklären Gebiete und Wirkungszusammenhänge,
                bestätigen aber keine diesjährige Pflanzenphase. Manuelle
                Auswahl gilt nur für die ausgewählte Region.
              </p>
              <div className="weather-source-links">
                <SourceLink url="https://open-meteo.com/">
                  Wetterdaten: Open-Meteo · CC BY 4.0
                </SourceLink>
                <SourceLink url="https://open-meteo.com/en/docs">
                  Variablen und Modelle
                </SourceLink>
                <SourceLink url="https://open-meteo.com/en/terms">
                  Private Nutzung und Abruflimits
                </SourceLink>
                {weatherCatalog.sources
                  .filter((s) => asset.sourceIds.includes(s.id))
                  .map((s) => (
                    <SourceLink key={s.id} url={s.url}>
                      {s.label}
                    </SourceLink>
                  ))}
                <SourceLink
                  url={"https://www.naturalearthdata.com/about/terms-of-use/"}
                >
                  Kartengrundlage: Natural Earth · Public Domain
                </SourceLink>
              </div>
              <p className="weather-small">
                Nur öffentliche Koordinaten werden abgerufen. Keine
                Standortfreigabe und keine Übermittlung von Journal- oder
                Kontodaten. Der Wetterbereich verändert keine anderen
                Bewertungen.
              </p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
