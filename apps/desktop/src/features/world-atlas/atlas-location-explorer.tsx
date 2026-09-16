import { useRef, useState, type KeyboardEvent } from "react";
import { Check, Globe, MapPin, Search } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "../../services/commands";
import { atlasCatalog, atlasGeographies } from "./atlas-catalog";
import type { AtlasGeography } from "./atlas-types";
import geometry from "./data/map-geometry.json";
import "./atlas-location-explorer.css";

const shapes = new Map(geometry.areas.map((area) => [area.id, area.path]));

export default function AtlasLocationExplorer({
  geography,
  comparison,
  allowComparison,
  filters,
  onFilter,
  onChoose,
}: {
  geography: AtlasGeography;
  comparison?: AtlasGeography;
  allowComparison: boolean;
  filters: { region: string | null; search: string | null };
  onFilter: (values: Record<string, string>) => void;
  onChoose: (area: AtlasGeography, target: "area" | "compare") => void;
}) {
  const [target, setTarget] = useState<"area" | "compare">("area");
  const [focusedId, setFocusedId] = useState(geography.id);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const map = useRef<SVGSVGElement>(null);
  const region = atlasCatalog.regions.some((r) => r.id === filters.region)
    ? filters.region!
    : "world";
  const areas = atlasGeographies(region, filters.search ?? "");
  const shownIds = new Set(areas.map((a) => a.id));
  const mapped = atlasGeographies("world").filter((a) => shapes.has(a.id));
  const keyboardAreas = mapped.filter((a) => shownIds.has(a.id));
  const keyboardId = keyboardAreas.some((a) => a.id === focusedId)
    ? focusedId
    : keyboardAreas[0]?.id;
  const hovered = atlasCatalog.geographies.find((a) => a.id === hoveredId);
  const selectedTarget = allowComparison ? target : "area";
  function choose(area: AtlasGeography) {
    onChoose(area, selectedTarget);
  }
  function keydown(event: KeyboardEvent<SVGPathElement>, area: AtlasGeography) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(area);
      return;
    }
    if (!keyboardAreas.length) return;
    const current = keyboardAreas.findIndex((a) => a.id === area.id);
    let index: number;
    if (["ArrowRight", "ArrowDown"].includes(event.key))
      index = current < 0 ? 0 : (current + 1) % keyboardAreas.length;
    else if (["ArrowLeft", "ArrowUp"].includes(event.key))
      index =
        current < 0
          ? keyboardAreas.length - 1
          : (current - 1 + keyboardAreas.length) % keyboardAreas.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = keyboardAreas.length - 1;
    else return;
    event.preventDefault();
    const id = keyboardAreas[index].id;
    setFocusedId(id);
    map.current?.querySelector<SVGPathElement>(`[data-area="${id}"]`)?.focus();
  }
  return (
    <section
      className="atlas-location-explorer"
      aria-label="Gebiete auf Karte und Liste erkunden"
    >
      <div className="atlas-location-explorer-header">
        <div>
          <h2>
            <Globe size={18} aria-hidden /> Weltkarte & Länderliste
          </h2>
          <p>
            Wähle einen Ort für deine Themenbilder. Kleine Gebiete und
            Quellenregionen findest du in der Liste.
          </p>
        </div>
        {allowComparison && (
          <div
            className="atlas-wave-horizons"
            role="group"
            aria-label="Ziel der Gebietsauswahl"
          >
            <button
              type="button"
              aria-pressed={selectedTarget === "area"}
              onClick={() => setTarget("area")}
            >
              Land wählen
            </button>
            <button
              type="button"
              aria-pressed={selectedTarget === "compare"}
              onClick={() => setTarget("compare")}
            >
              Vergleich wählen
            </button>
          </div>
        )}
      </div>
      <div className="atlas-map-layout">
        <div className="atlas-map-picture">
          <svg
            ref={map}
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            role="group"
            aria-label="Weltkarte zur Gebietsauswahl"
            aria-describedby="atlas-map-instructions"
          >
            <path
              d={geometry.outline}
              className="atlas-map-ocean"
              aria-hidden
            />
            <path
              d={geometry.graticule}
              className="atlas-map-graticule"
              aria-hidden
            />
            {geometry.unbound.map((area) => (
              <path
                key={area.id}
                d={area.path}
                className="atlas-map-unbound"
                fillRule="evenodd"
              >
                <title>{area.label} · keine eigene Atlaszuordnung</title>
              </path>
            ))}
            {mapped.map((area) => (
              <path
                key={area.id}
                data-area={area.id}
                d={shapes.get(area.id)}
                fillRule="evenodd"
                role="button"
                aria-label={`${area.label} auf der Karte wählen`}
                aria-pressed={
                  selectedTarget === "compare"
                    ? comparison?.id === area.id
                    : geography.id === area.id
                }
                tabIndex={area.id === keyboardId ? 0 : -1}
                className={`atlas-map-country${area.id === geography.id ? " is-selected" : ""}${area.id === comparison?.id ? " is-comparison" : ""}${shownIds.has(area.id) ? "" : " is-dimmed"}`}
                onClick={() => choose(area)}
                onKeyDown={(event) => keydown(event, area)}
                onFocus={() => {
                  setFocusedId(area.id);
                  setHoveredId(area.id);
                }}
                onBlur={() => setHoveredId(null)}
                onMouseEnter={() => setHoveredId(area.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <title>{area.label}</title>
              </path>
            ))}
          </svg>
          <div className="atlas-map-legend">
            <span className="is-selected">
              <MapPin size={14} aria-hidden />
              {geography.label}
            </span>
            {comparison && (
              <span className="is-comparison">
                ⋯ {comparison.label} · Vergleich
              </span>
            )}
            <span className="atlas-map-hover" aria-live="polite">
              {hovered ? hovered.label : "Ortsauswahl"}
            </span>
          </div>
          {!shapes.has(geography.id) && (
            <p className="atlas-notice">
              {geography.label}:{" "}
              {geography.iso3
                ? "In diesem Kartenmaßstab ohne eigene Fläche. Über die Liste ausgewählt."
                : "Welt- oder Quellenaggregat; keine einzelne Länderfläche."}
            </p>
          )}
          <p id="atlas-map-instructions" className="atlas-map-help">
            Tab erreicht die Karte. Pfeiltasten wechseln alphabetisch zwischen
            den gefilterten Gebieten; Enter wählt aus. Die Listenbuttons
            funktionieren genauso.
          </p>
        </div>
        <div className="atlas-map-directory">
          <label>
            Region der Liste
            <select
              className="input"
              value={region}
              onChange={(event) => onFilter({ mapRegion: event.target.value })}
            >
              {atlasCatalog.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="atlas-map-search">
            Land oder Gebiet suchen
            <span>
              <Search size={15} aria-hidden />
              <input
                className="input"
                type="search"
                value={filters.search ?? ""}
                placeholder="Name oder ISO-Code …"
                onChange={(event) =>
                  onFilter({ mapSearch: event.target.value })
                }
              />
            </span>
          </label>
          <div
            className="atlas-map-list"
            role="group"
            aria-label="Gefilterte Gebiete"
          >
            {areas.map((area) => (
              <button
                key={area.id}
                type="button"
                aria-label={`${area.label} in der Liste wählen`}
                aria-pressed={
                  selectedTarget === "compare"
                    ? comparison?.id === area.id
                    : geography.id === area.id
                }
                onClick={() => choose(area)}
              >
                <span>
                  {area.label}
                  <small>
                    {!area.iso3
                      ? "Quellenaggregat"
                      : shapes.has(area.id)
                        ? "Auch auf der Karte"
                        : "Über die Liste erreichbar"}
                  </small>
                </span>
                {area.id === geography.id && (
                  <Check size={15} aria-label="Ausgewähltes Gebiet" />
                )}
                {area.id === comparison?.id && (
                  <span aria-label="Vergleichsgebiet">⋯</span>
                )}
              </button>
            ))}
            {areas.length === 0 && (
              <p role="status">
                Kein Gebiet gefunden. Prüfe den Namen oder wähle eine andere
                Region.
              </p>
            )}
          </div>
        </div>
      </div>
      <details className="atlas-details">
        <summary>Kartenquelle und Bedeutung</summary>
        <p>
          Natural Earth · Map Units · Maßstab 1:110 Mio. · Stand{" "}
          {geometry.source.version}. Die Umrisse dienen zur Orientierung.
          Flächen und Auswahlfarben zeigen keine wirtschaftliche Stärke oder
          Bewertung. Die Datengebiete der einzelnen Quellen bleiben maßgeblich.
        </p>
        <p>
          Die flächentreue Equal-Earth-Projektion verwendet eine Kugelnäherung.
          Vereinfachte Grenzen und getrennte Quellenumrisse treffen keine
          Aussage über Gebietsansprüche. Regionen mit fehlenden Umrissen bleiben
          in der vollständigen Liste.
        </p>
        <a
          href={geometry.source.url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            if (isTauri()) {
              event.preventDefault();
              void openUrl(geometry.source.url);
            }
          }}
        >
          Natural Earth · öffentliche Kartendaten
        </a>
        <p>Public domain · mit der App gespeichert, offline verwendbar.</p>
      </details>
    </section>
  );
}
