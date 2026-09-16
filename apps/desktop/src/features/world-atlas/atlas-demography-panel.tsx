import {
  useAtlasDisplayChoice,
  atlasDemographyYears,
} from "./atlas-display-state";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { RefreshCw, Users } from "lucide-react";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";
import {
  atlasDemographyDataset,
  demographicRows,
  demographicSummary,
  type DemographyMode,
} from "./atlas-demography";
import { AtlasDemographyChart } from "./atlas-demography-chart";

const errorText = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Die Demografiedaten konnten nicht gelesen werden.";
const description: Record<DemographyMode, string> = {
  older:
    "Der Anteil ab 65 Jahren wird aus den vollständigen UN-Altersgruppen derselben Bevölkerung berechnet. So lässt sich die Alterung auch in UN-Gebieten ohne passende Weltbankreihe betrachten.",
  pyramid:
    "Die Altersform macht sichtbar, welche Jahrgänge eine Bevölkerung prägen. Mit dem Jahresregler kannst du den Wandel selbst erkunden.",
  population:
    "Der lange Verlauf zeigt die UN-Schätzungen und ein mögliches Bevölkerungsszenario. Die zukünftige Entwicklung steht nicht fest.",
  working:
    "Das Bild zeigt den Anteil der 15- bis 64-Jährigen. Diese Altersgruppe ist keine Messung tatsächlicher Erwerbstätigkeit.",
  dependency:
    "Jüngere und ältere Altersgruppen werden zur Bevölkerung zwischen 15 und 64 ins Verhältnis gesetzt. Das beschreibt Altersstruktur, keine individuelle Abhängigkeit oder Produktivität.",
  age_shares:
    "Die drei Linien zeigen, wie sich jüngere, mittlere und ältere Altersgruppen im Verlauf verschieben.",
};

export function AtlasDemographyPanel({
  geography,
  compareId,
  mode,
  showNumbers,
  job,
}: {
  geography: AtlasGeography;
  compareId?: string;
  mode: DemographyMode;
  showNumbers: boolean;
  job: AtlasSyncJob | null | undefined;
}) {
  const [includeProjections, setIncludeProjections] = useAtlasDisplayChoice(
    "demoProjection",
    mode === "population",
    [true, false],
  );
  const [selectedYear, setSelectedYear] = useAtlasDisplayChoice(
    "demoYear",
    2023,
    atlasDemographyYears,
  );
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["atlas", "demography", geography.id],
    queryFn: () => api.atlasDemography(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "demography", compareId],
    queryFn: () => api.atlasDemography(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasDemography(),
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
  const comparable = demographicRows(rows, includeProjections);
  const years = comparable[0]?.years.map((y) => y.year) ?? [];
  const year = years.includes(selectedYear)
    ? selectedYear
    : (years.filter((y) => y <= selectedYear).slice(-1)[0] ?? years[0] ?? 2023);
  const selected = comparable[0]?.years.find((y) => y.year === year);
  const summary = demographicSummary(selected);
  const ageBands = summary
    ? [
        { label: "Unter 15", width: summary.youngShare },
        { label: "15–64", width: summary.workingShare },
        { label: "65 und älter", width: summary.olderShare },
      ]
    : [];
  const projection = selected?.kind === "projection";
  const fresh =
    data?.provenance &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86_400_000;
  const busy = sync.isPending || job?.status === "running";
  const currentJob = job?.seriesId === atlasDemographyDataset ? job : null;
  const sourceUrl = "https://population.un.org/wpp/";

  return (
    <>
      <p className="atlas-explanation">{description[mode]}</p>
      {query.isPending && <p role="status">Lokales UN-Profil wird geladen …</p>}
      {query.error && (
        <p className="atlas-notice" role="alert">
          {errorText(query.error)}{" "}
          <Button size="sm" onClick={() => void query.refetch()}>
            Erneut prüfen
          </Button>
        </p>
      )}
      {data?.status === "desktop_required" && (
        <div className="atlas-empty">
          <Users size={32} aria-hidden="true" />
          <h3>Demografie in der Desktop-App laden</h3>
          <p>
            Die kostenlose UN-Grundlage enthält Altersgruppen für Länder und
            Weltregionen. Ein Download speichert die verfügbaren Profile
            gemeinsam für die Offline-Nutzung.
          </p>
        </div>
      )}
      {data?.status === "not_downloaded" && (
        <div className="atlas-empty">
          <Users size={32} aria-hidden="true" />
          <h3>Die UN-Altersprofile sind noch nicht lokal gespeichert</h3>
          <p>
            Ein Abruf lädt rund 31 MB einschließlich Quellenkorrektur und
            Gebietsnoten. Danach kannst du Länder ohne weiteren Download
            vergleichen.
          </p>
        </div>
      )}
      {data?.status === "unsupported_area" && (
        <div className="atlas-empty">
          <h3>Kein eigenständiges UN-Altersprofil für dieses Gebiet</h3>
          <p>
            Die vollständige Quelldatei wurde geprüft. Für dieses Gebiet liegt
            darin keine getrennte Altersreihe vor.
          </p>
        </div>
      )}
      {rows.length > 0 && (
        <>
          <div className="atlas-demography-controls">
            <label className="atlas-numbers">
              <input
                type="checkbox"
                checked={includeProjections}
                onChange={(event) =>
                  setIncludeProjections(event.target.checked)
                }
              />{" "}
              UN-Szenario bis 2100 einblenden
            </label>
            {years.length > 0 && (
              <label className="atlas-year-slider">
                Betrachtetes Jahr: {year}
                <input
                  type="range"
                  aria-label="Jahr der Demografieansicht"
                  aria-valuetext={`${year} · ${projection ? "UN-Szenario" : "UN-Schätzung"}`}
                  min={0}
                  max={years.length - 1}
                  step={1}
                  value={years.indexOf(year)}
                  onChange={(event) =>
                    setSelectedYear(years[Number(event.target.value)])
                  }
                />
                <span className="atlas-slider-labels">
                  <span>{years[0]}</span>
                  <span>{years.slice(-1)[0]}</span>
                </span>
              </label>
            )}
          </div>
          <div
            className={`atlas-reading atlas-demography-status${projection ? " is-projection" : ""}`}
          >
            <strong>
              {projection
                ? "Mittleres UN-Szenario"
                : "Historische UN-Schätzung"}{" "}
              · {year}
            </strong>
            <span>{data?.provenance?.revision}</span>
          </div>
          {projection && (
            <p className="atlas-projection-note">
              Auch die Jahre ab 2024, die bereits vergangen sind, gehören in
              dieser UN-Ausgabe zum Szenario. Sie werden nicht nachträglich als
              beobachtete Vergangenheit dargestellt.
            </p>
          )}
          {mode === "pyramid" && summary && (
            <div className="atlas-age-summary">
              <div className="atlas-chart-label">
                {geography.label} · drei Altersgruppen
              </div>
              <div className="atlas-age-bands" aria-hidden="true">
                {ageBands.map((band, index) => (
                  <div
                    key={band.label}
                    style={{ flexBasis: `${band.width}%` }}
                    className={`atlas-age-band band-${index}`}
                  ></div>
                ))}
              </div>
              <div className="atlas-age-legend">
                {ageBands.map((band, index) => (
                  <span key={band.label}>
                    <i aria-hidden="true" className={`band-${index}`} />
                    {band.label}
                    {showNumbers ? ` · ${Math.round(band.width)} %` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
          <AtlasDemographyChart
            rows={rows}
            mode={mode}
            year={year}
            includeProjections={includeProjections}
            showNumbers={showNumbers}
          />
          {compareId && comparison.isPending && (
            <p role="status">UN-Vergleich wird geladen …</p>
          )}
          {compareId && comparison.error && (
            <p role="alert">Vergleich: {errorText(comparison.error)}</p>
          )}
          {compareId &&
            comparison.data &&
            comparison.data.status !== "available" && (
              <p className="atlas-notice">
                Für {comparison.data.geography.label} ist kein lokales
                UN-Altersprofil verfügbar.
              </p>
            )}
          {rows.some((row) => row.geography.kind === "aggregate") && (
            <p className="atlas-comparison-note">
              Offizielles UN-Aggregat. Die Togo-Korrektur von 2026 wurde von der
              UN noch nicht in Welt- und Regionssummen eingearbeitet; diese
              Aggregate behalten ihren veröffentlichten Stand von 2024.
            </p>
          )}
        </>
      )}
      {isTauri() && (
        <div className="atlas-download">
          <Button
            disabled={Boolean(busy || fresh)}
            onClick={() => sync.mutate()}
          >
            <RefreshCw size={15} />
            {busy
              ? "Abruf läuft …"
              : fresh
                ? "UN-Grundlage lokal verfügbar"
                : data?.provenance
                  ? "UN-Grundlage aktualisieren"
                  : "UN-Profile für alle Länder laden"}
          </Button>
          <span>
            UN · kostenlos · ein gemeinsamer Download · danach offline
          </span>
        </div>
      )}
      {currentJob && (
        <p
          className="atlas-job"
          role={currentJob.status === "failed" ? "alert" : "status"}
        >
          {currentJob.message}
        </p>
      )}
      {!currentJob && job?.status === "running" && (
        <p role="status">Eine andere Atlas-Reihe wird gerade geladen.</p>
      )}
      {sync.error && (
        <p className="atlas-notice" role="alert">
          {errorText(sync.error)}
        </p>
      )}
      <details className="atlas-details">
        <summary>UN-Quelle, Szenario und Gebietsdefinition</summary>
        <p>
          United Nations, Department of Economic and Social Affairs, Population
          Division (2024). World Population Prospects 2024, Online Edition. CC
          BY 3.0 IGO. Die Togo-Zwischenkorrektur vom 19. Januar 2026 wird für
          Togo übernommen.
        </p>
        <p>
          Jahresmitte (1. Juli), Altersgruppen 0–4 bis 95–99 sowie 100+.
          Schätzungen 1950–2023, mittlere Projektion 2024–2100. Die Quelle
          veröffentlicht Tausend Menschen; der Atlas rechnet einmalig in
          Menschen um. Anteile beziehen sich auf die Summe aller Altersgruppen
          desselben Gebiets und Jahres. Rundungen der Quelle können geringe
          Abweichungen zwischen männlich plus weiblich und gesamt erzeugen.
        </p>
        <p>
          Eine Projektion ist eine bedingte Modellrechnung. Das mittlere
          Szenario ist kein Unsicherheitsband und keine garantierte Entwicklung.
          Die Altersform allein beweist keinen Wirtschaftszyklus.
        </p>
        {data?.provenance && (
          <p>
            Abgerufen am{" "}
            {new Date(data.provenance.retrievedAt).toLocaleDateString("de")}.
            Ausgabe: {data.provenance.revision}. UN-Gebiet:{" "}
            {data.profile?.providerLabel ?? "nicht einzeln verfügbar"}
            {data.profile ? ` (${data.profile.providerId})` : ""}.
          </p>
        )}
        {data?.profile?.notes.map((note, index) => (
          <p key={index} lang="en">
            UN-Gebietsnote (Original): {note}
          </p>
        ))}
        {compareId &&
          comparison.data?.profile &&
          comparison.data.profile.notes.length > 0 && (
            <div>
              <strong>
                {comparison.data.geography.label} · UN-Gebietsnoten
              </strong>
              {comparison.data.profile.notes.map((note, index) => (
                <p key={index} lang="en">
                  {note}
                </p>
              ))}
            </div>
          )}
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            if (isTauri()) {
              event.preventDefault();
              void openUrl(sourceUrl);
            }
          }}
        >
          UN World Population Prospects öffnen
        </a>
      </details>
    </>
  );
}
