import { useAtlasDisplayChoice } from "./atlas-display-state";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { RefreshCw, Zap } from "lucide-react";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { atlasCatalog } from "./atlas-catalog";
import {
  atlasEnergyCatalog,
  atlasEnergyDataset,
  type EnergyMeasure,
  type EnergyMode,
} from "./atlas-energy";
import { AtlasEnergyChart } from "./atlas-energy-chart";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";

const errorText = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Die Stromdaten konnten nicht geladen werden.";

export function AtlasEnergyPanel({
  geography,
  compareId,
  mode,
  showNumbers,
  job,
  onAreaChange,
}: {
  geography: AtlasGeography;
  compareId?: string;
  mode: EnergyMode;
  showNumbers: boolean;
  job: AtlasSyncJob | null | undefined;
  onAreaChange: (area: AtlasGeography) => void;
}) {
  const [measure, setMeasure] = useAtlasDisplayChoice<EnergyMeasure>(
    "energyMeasure",
    "share",
    ["share", "generation", "capacity", "per_capita"],
  );
  const [since, setSince] = useAtlasDisplayChoice<number>(
    "energySince",
    2000,
    [2000, 2010],
  );
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["atlas", "energy", geography.id],
    queryFn: () => api.atlasEnergy(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "energy", compareId],
    queryFn: () => api.atlasEnergy(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasEnergy(),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const data = query.data;
  const rows =
    data?.status === "available"
      ? [
          data,
          ...(compareId && comparison.data?.status === "available"
            ? [comparison.data]
            : []),
        ]
      : [];
  const busy = sync.isPending || job?.status === "running";
  const fresh =
    data?.provenance &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86_400_000;
  const currentJob = job?.seriesId === atlasEnergyDataset ? job : null;
  const regionOptions =
    geography.kind === "aggregate" && data?.status === "unsupported_area"
      ? atlasEnergyCatalog.regions.filter(
          (area) =>
            area.regionId === geography.regionId &&
            area.label.endsWith("Ember-Region"),
        )
      : [];
  return (
    <>
      <p className="atlas-explanation">
        {mode.kind === "mix"
          ? "Das Farbbild zeigt, wie sich die Stromerzeugung im Laufe der Jahre zusammensetzt."
          : mode.kind === "fuel"
            ? `${mode.label}: Das Bild zeigt die Entwicklung in der tatsächlichen Stromwirtschaft des ausgewählten Gebiets.`
            : mode.kind === "net_imports"
              ? "Das Bild zeigt das Verhältnis von eingeführtem und ausgeführtem Strom."
              : "Das Bild zeigt die langfristige Entwicklung der Stromwirtschaft."}{" "}
        Diese Perspektive beschreibt die Energiewirtschaft; eine finanzielle
        Bewertung benötigt eine eigene Grundlage.
      </p>
      {query.isPending && (
        <p role="status">Lokale Stromdaten werden geladen …</p>
      )}
      {query.error && (
        <div className="atlas-notice" role="alert">
          {errorText(query.error)}{" "}
          <Button size="sm" onClick={() => void query.refetch()}>
            Erneut prüfen
          </Button>
        </div>
      )}
      {(data?.status === "desktop_required" ||
        data?.status === "not_downloaded") && (
        <div className="atlas-empty">
          <Zap size={32} aria-hidden="true" />
          <h3>
            {data.status === "desktop_required"
              ? "Stromdaten in der Desktop-App laden"
              : "Die weltweite Stromgrundlage ist noch nicht lokal gespeichert"}
          </h3>
          <p>
            Ein kostenloser Ember-Download lädt alle verfügbaren Länder und
            Quellenregionen gemeinsam. Die Vergleiche sind anschließend offline
            nutzbar.
          </p>
        </div>
      )}
      {data?.status === "unsupported_area" && (
        <div className="atlas-empty">
          <h3>Keine eigene Ember-Reihe für dieses Gebiet</h3>
          <p>
            Die Gebietsdefinitionen unterscheiden sich je Quelle. Für einen
            regionalen Vergleich stehen die ausdrücklich benannten
            Ember-Regionen zur Verfügung.
          </p>
          {regionOptions.map((area) => (
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
      {rows.length > 0 && (
        <>
          {(mode.kind === "fuel" || mode.kind === "demand") && (
            <div
              className="atlas-wave-horizons atlas-energy-measures"
              role="group"
              aria-label="Stromperspektive"
            >
              {(mode.kind === "fuel"
                ? [
                    ["share", "Anteil im Strommix"],
                    ["generation", "Stromerzeugung"],
                    ["capacity", "Installierte Leistung"],
                  ]
                : [
                    ["share", "Strombedarf insgesamt"],
                    ["per_capita", "Je Einwohner"],
                  ]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={measure === value}
                  onClick={() => setMeasure(value as EnergyMeasure)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="atlas-history-controls">
            <div
              className="atlas-wave-horizons"
              role="group"
              aria-label="Stromzeitraum"
            >
              {[
                [2000, "Seit 2000"],
                [2010, "Seit 2010"],
              ].map(([year, label]) => (
                <button
                  key={year}
                  type="button"
                  aria-pressed={since === year}
                  onClick={() => setSince(Number(year))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="atlas-reading">
            <strong>Quellenstatistik mit Schätzungen</strong>
            <span>Ember · jährliche Stromdaten</span>
          </div>
          {measure === "capacity" && (
            <p className="atlas-comparison-note">
              Installierte Leistung beschreibt die mögliche Erzeugungsleistung
              der Anlagen. Wie viel Strom sie jährlich erzeugen, hängt
              zusätzlich von ihrer Nutzung ab. Bei Solarenergie unterscheiden
              sich die AC-/DC-Meldegrundlagen.
            </p>
          )}
          <AtlasEnergyChart
            rows={rows}
            mode={mode}
            measure={measure}
            since={since}
            showNumbers={showNumbers}
          />
        </>
      )}
      {compareId && comparison.isPending && (
        <p role="status">Stromvergleich wird geladen …</p>
      )}
      {compareId && comparison.error && (
        <p className="atlas-notice" role="alert">
          Vergleich: {errorText(comparison.error)}
        </p>
      )}
      {compareId &&
        comparison.data &&
        comparison.data.status !== "available" && (
          <p className="atlas-notice">
            Für {comparison.data.geography.label} ist kein eigenes lokales
            Ember-Profil verfügbar. Das Bild zeigt nur {geography.label}.
          </p>
        )}
      {isTauri() && (
        <div className="atlas-overview-download">
          <Button
            size="sm"
            disabled={busy || Boolean(fresh)}
            onClick={() => sync.mutate()}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Stromdaten für alle Länder laden
          </Button>
          <span>
            {fresh
              ? "Der lokale Stand wurde innerhalb des letzten Tages abgerufen."
              : "Öffentlicher Download · ohne API-Schlüssel"}
          </span>
        </div>
      )}
      {busy && (
        <p role="status">
          {currentJob?.status === "running"
            ? currentJob.message
            : "Eine andere Atlas-Grundlage wird gerade geladen."}
        </p>
      )}
      {currentJob && currentJob.status !== "running" && (
        <p role={currentJob.status === "failed" ? "alert" : "status"}>
          {currentJob.message}
        </p>
      )}
      {sync.error && (
        <p className="atlas-notice" role="alert">
          {errorText(sync.error)}
        </p>
      )}
      <details className="atlas-details">
        <summary>Quelle und Bedeutung der Stromdaten</summary>
        <p>
          Ember, Yearly Electricity Data · CC BY 4.0. Die Veröffentlichung
          verbindet nationale Statistiken mit Schätzungen und kann frühere Jahre
          revidieren. Einzelne Werte tragen in dieser Datei kein Kennzeichen,
          das Messungen und Schätzungen unterscheidet.
        </p>
        <p>
          Die Stromanteile beziehen sich auf die heimische Erzeugung. Importe
          gehören nicht zu diesem Mix. Strombedarf ist Erzeugung zuzüglich
          Nettoimporten; negative Nettoimporte bedeuten einen Exportüberschuss.
          Regionalwerte werden aus den benannten Ember-Aggregaten übernommen.
        </p>
        <p>
          Solar umfasst Photovoltaik und Solarthermie, Wind umfasst Anlagen an
          Land und auf See. „Weitere erneuerbare Quellen“ bündelt unter anderem
          Geothermie und Meeresenergie. „Weitere fossile Quellen“ umfasst
          mehrere Brennstoffe. Quellenangaben zu dezentralen Anlagen und
          Kapazitäten unterscheiden sich zwischen Ländern.
        </p>
        <p>
          Die Bilder verbinden Jahreswerte ohne zusätzliche Glättung oder
          Zukunftsverlängerung. Fehlende Beiträge werden nicht als null ergänzt.
        </p>
        {data?.provenance && (
          <p>
            Abgerufen am{" "}
            {new Date(data.provenance.retrievedAt).toLocaleDateString("de")}
            {data.provenance.sourceUpdatedAt
              ? ` · Datei geändert am ${new Date(data.provenance.sourceUpdatedAt).toLocaleDateString("de")}`
              : ""}
            . Quellenzeitraum: {data.provenance.yearFirst}–
            {data.provenance.yearLast}.
          </p>
        )}
        {rows.map((row) => (
          <p key={row.geography.id}>
            {row.geography.label} · Quellengebiet: {row.profile?.providerLabel}
            {row.profile?.aggregate
              ? " · veröffentlichtes Quellenaggregat"
              : ""}
          </p>
        ))}
        <ul>
          {[
            [
              "Ember: Daten und Quellen",
              "https://ember-energy.org/data/yearly-electricity-data/",
            ],
            [
              "Ember: Methodik und Länderhinweise (PDF)",
              atlasEnergyCatalog.methodologyUrl,
            ],
          ].map(([label, url]) => (
            <li key={url}>
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
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
