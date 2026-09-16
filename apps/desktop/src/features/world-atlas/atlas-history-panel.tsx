import { useAtlasDisplayChoice } from "./atlas-display-state";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { History, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { atlasHistoryDataset, type HistoryMode } from "./atlas-history";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";
import { AtlasHistoryChart } from "./atlas-history-chart";

const errorText = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Die historische Datenreihe konnte nicht gelesen werden.";
const descriptions: Record<HistoryMode, string> = {
  gdpPerCapita:
    "Das Bild zeigt die langfristig rekonstruierte Wirtschaftsleistung je Einwohner. Es macht Wachstum, Rückgänge und Unterschiede sichtbar. Wohlstand umfasst zusätzlich Verteilung und Lebensbedingungen.",
  gdp: "Das Bild zeigt die rekonstruierte Größe einer Volkswirtschaft. Bevölkerungsgröße und Leistung je Einwohner beeinflussen gemeinsam diesen Verlauf.",
  worldGdpShare:
    "Diese historischen Schätzpunkte zeigen den Anteil eines Gebiets an der Weltwirtschaft. Ein Anteil entsteht nur mit einem veröffentlichten Weltwert aus demselben Jahr und Datenstand.",
};
const links = [
  [
    "Maddison Project Database 2023 und Originalarbeiten",
    "https://www.rug.nl/ggdc/historicaldevelopment/maddison/releases/maddison-project-database-2023",
  ],
  [
    "Quellenverzeichnis der Originalarbeiten (Quellenblatt der Datei)",
    "https://dataverse.nl/api/access/datafile/421302",
  ],
  [
    "Wirtschaftsleistung je Einwohner bei Our World in Data",
    "https://ourworldindata.org/grapher/gdp-per-capita-maddison-project-database",
  ],
  [
    "Gesamtwirtschaft und Berechnung bei Our World in Data",
    "https://ourworldindata.org/grapher/gdp-maddison-project-database",
  ],
] as const;

export function AtlasHistoryPanel({
  geography,
  compareId,
  mode,
  showNumbers,
  job,
}: {
  geography: AtlasGeography;
  compareId?: string;
  mode: HistoryMode;
  showNumbers: boolean;
  job: AtlasSyncJob | null | undefined;
}) {
  const [since, setSince] = useAtlasDisplayChoice<number>(
    "historySince",
    1820,
    [1, 1500, 1820, 1950],
  );
  const [proportional, setProportional] = useAtlasDisplayChoice(
    "historyProportional",
    true,
    [true, false],
  );
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["atlas", "history", geography.id],
    queryFn: () => api.atlasHistory(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "history", compareId],
    queryFn: () => api.atlasHistory(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasHistory(),
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
  const currentJob = job?.seriesId === atlasHistoryDataset ? job : null;
  return (
    <>
      <p className="atlas-explanation">{descriptions[mode]}</p>
      {query.isPending && (
        <p role="status">Lokale Jahrhundertperspektive wird geladen …</p>
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
          <History size={32} aria-hidden="true" />
          <h3>
            {data.status === "desktop_required"
              ? "Jahrhundertperspektiven in der Desktop-App laden"
              : "Die historische Grundlage ist noch nicht lokal gespeichert"}
          </h3>
          <p>
            Ein kostenloser Download lädt die verfügbaren Länder und
            Maddison-Regionen gemeinsam. Danach sind die historischen Vergleiche
            offline nutzbar.
          </p>
        </div>
      )}
      {data?.status === "unsupported_area" && (
        <div className="atlas-empty">
          <h3>Keine eigene Maddison-Reihe für dieses Gebiet</h3>
          <p>
            Der veröffentlichte Datensatz wurde vollständig geprüft. Länder und
            anders zugeschnittene Regionen werden nicht stellvertretend
            gleichgesetzt.
          </p>
        </div>
      )}
      {rows.length > 0 && (
        <>
          <div className="atlas-history-controls">
            <div
              className="atlas-wave-horizons"
              role="group"
              aria-label="Historischer Zeitraum"
            >
              {[
                [1950, "Seit 1950"],
                [1820, "Seit 1820"],
                [1500, "Seit 1500"],
                [1, "Alle Quellenjahre"],
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
            {mode !== "worldGdpShare" && (
              <label className="atlas-numbers">
                <input
                  type="checkbox"
                  checked={proportional}
                  onChange={(event) => setProportional(event.target.checked)}
                />{" "}
                Proportionale Entwicklung
              </label>
            )}
          </div>
          <div className="atlas-reading">
            <strong>Historische Rekonstruktion</strong>
            <span>MPD 2023 · letzter Quellenzeitpunkt 2022</span>
          </div>
          <AtlasHistoryChart
            rows={rows}
            mode={mode}
            since={since}
            proportional={proportional}
            showNumbers={showNumbers}
          />
          <p className="atlas-comparison-note">
            Bolt und van Zanden (2024), Maddison Project Database 2023 ·
            Bereitstellung und Aufbereitung: Our World in Data. Originalarbeiten
            und Datenbedeutung stehen direkt darunter.
          </p>
          {compareId && comparison.isPending && (
            <p role="status">Historischer Vergleich wird geladen …</p>
          )}
          {compareId && comparison.error && (
            <p role="alert">Vergleich: {errorText(comparison.error)}</p>
          )}
          {compareId &&
            comparison.data &&
            comparison.data.status !== "available" && (
              <p className="atlas-notice">
                Für {comparison.data.geography.label} ist keine eigene lokale
                Maddison-Reihe verfügbar.
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
                ? "Historische Grundlage lokal verfügbar"
                : data?.provenance
                  ? "Historische Grundlage aktualisieren"
                  : "Historische Daten für alle Länder laden"}
          </Button>
          <span>
            Maddison über OWID · kostenlos · rund 1 MB · danach offline
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
        <summary>Originalarbeiten, Quelle und historische Grenzen</summary>
        <p>
          Bolt, Jutta und Jan Luiten van Zanden (2024): „Maddison style
          estimates of the evolution of the world economy: A new 2023 update“,
          Journal of Economic Surveys. DOI: 10.1111/joes.12618. Die
          länderspezifischen Originalarbeiten sind im Quellenverzeichnis der
          verlinkten Datenbank aufgeführt.
        </p>
        <p>
          MPD 2023 und die Aufbereitung von Our World in Data sind unter CC BY
          4.0 veröffentlicht. Der Atlas lädt die öffentlich angebotenen
          OWID-CSV-Dateien und ihre Metadaten. Die Originalarbeitsmappe wird
          nicht als selbst abgerufene Quelle ausgegeben.
        </p>
        <p>
          Kaufkraft- und preisbereinigte internationale Dollar mit Preisbasis
          2011, keine heutigen US-Dollar oder persönlichen Einkommen. OWID
          berechnet die Gesamtwirtschaft aus Wirtschaftsleistung je Einwohner
          mal Bevölkerung. Der Atlas übernimmt diese Werte und berechnet nur die
          ausgewiesenen Weltanteile. Regionale Werte stammen aus den
          veröffentlichten Aggregaten.
        </p>
        <p>
          Die Quelle verbindet Forschungsschätzungen, historische Benchmarks und
          moderne Volkswirtschaftliche Gesamtrechnungen. Frühe Daten können nur
          Teilgebiete oder bestimmte Bevölkerungsgruppen betreffen.
          Ländergrenzen und Methoden ändern sich. Vor 1900 und in Teilen Afrikas
          vor 1950 ist die Rekonstruktion besonders lückenhaft. Eine
          durchgezogene Linie belegt keine unveränderte Erhebungsmethode.
        </p>
        {rows.some((r) => r.geography.iso3 === "GBR") && (
          <p>
            Großbritannien: Vor 1700 beziehen sich Teile der zugrunde liegenden
            Rekonstruktion auf England.
          </p>
        )}
        {rows.some((r) => r.geography.iso3 === "NLD") && (
          <p>
            Niederlande: Vor 1807 beziehen sich Teile der zugrunde liegenden
            Rekonstruktion auf Holland.
          </p>
        )}
        {rows.some((r) => r.geography.iso3 === "USA") && (
          <p>
            USA: Frühe koloniale Einkommensschätzungen können indigene
            Bevölkerungen ausschließen. Der heutige Landesname bezeichnet hier
            die Zuordnung der historischen Quelle.
          </p>
        )}
        <p>
          Die historischen Länder USSR, Jugoslawien, Tschechoslowakei und
          früherer Sudan werden nicht auf heutige Nachfolgestaaten umgebucht.
          Eine UN-Region hat außerdem eine andere Definition als eine
          Maddison-Region.
        </p>
        <p>
          Die Darstellung ergänzt keine fehlenden Jahre und berechnet keine
          regelmäßige Jahrhundertperiode, Gleichgewichtsmitte oder
          Zukunftsprognose. Historischer Aufstieg und Rückgang belegen allein
          keine Über- oder Unterbewertung eines Marktes.
        </p>
        {data?.provenance && (
          <p>
            {data.provenance.revision} · abgerufen am{" "}
            {new Date(data.provenance.retrievedAt).toLocaleDateString("de")}.
          </p>
        )}
        {rows.map((row) => (
          <div key={row.geography.id}>
            <strong>
              {row.geography.label} · Quellengebiet:{" "}
              {row.profile?.providerLabel}
            </strong>
            {row.profile?.notes.map((note) => (
              <p key={note} lang="en">
                {note}
              </p>
            ))}
          </div>
        ))}
        <ul>
          {links.map(([label, url]) => (
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
