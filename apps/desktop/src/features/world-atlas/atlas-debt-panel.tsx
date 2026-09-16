import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { atlasCatalog } from "./atlas-catalog";
import { useAtlasDisplayChoice } from "./atlas-display-state";
import {
  atlasDebtCatalog,
  atlasDebtDataset,
  debtCountryNote,
  debtSegments,
  debtTitle,
  debtView,
  type DebtMode,
  type DebtSector,
} from "./atlas-debt";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";

const errorText = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Die Schuldenbilder konnten nicht geladen werden.";
const quarter = (q: number) => `${Math.floor(q / 4)}-Q${(q % 4) + 1}`;
export function AtlasDebtPanel({
  geography,
  compareId,
  sector,
  showNumbers,
  job,
  onAreaChange,
}: {
  geography: AtlasGeography;
  compareId?: string;
  sector: DebtSector;
  showNumbers: boolean;
  job: AtlasSyncJob | null | undefined;
  onAreaChange: (area: AtlasGeography) => void;
}) {
  const [mode, setMode] = useAtlasDisplayChoice<DebtMode>("debtMode", "level", [
    "level",
    "change",
  ]);
  const [since, setSince] = useAtlasDisplayChoice<number>(
    "debtSince",
    0,
    [0, 1980, 2000],
  );
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["atlas", "debt", geography.id],
    queryFn: () => api.atlasDebt(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "debt", compareId],
    queryFn: () => api.atlasDebt(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasDebt(),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const data = query.data;
  const main = data ? debtView([data], sector, mode, since) : null;
  const compared =
    data && compareId && comparison.data
      ? debtView([data, comparison.data], sector, mode, since)
      : null;
  const view = compared ?? main;
  const compareArea = atlasCatalog.geographies.find((a) => a.id === compareId);
  const unit =
    mode === "level"
      ? "% der Wirtschaftsleistung"
      : "Prozentpunkte gegenüber dem Vorjahresquartal";
  const busy = sync.isPending || job?.status === "running";
  const fresh =
    data?.provenance &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86400000;
  const currentJob = job?.seriesId === atlasDebtDataset ? job : null;
  const colors = ["var(--primary-bright)", "var(--violet)"];
  const choices = atlasDebtCatalog.areas
    .map((a) => atlasCatalog.geographies.find((g) => g.id === a.geographyId)!)
    .filter(
      (a) => a.regionId === geography.regionId || geography.id === "world",
    );
  const shown = [data, ...(compared ? [comparison.data] : [])].filter(
    (row) => row?.profile,
  );
  const x = (q: number) =>
    50 +
    ((q - (view?.start ?? 0)) /
      Math.max(1, (view?.end ?? 0) - (view?.start ?? 0))) *
      920;
  const y = (value: number) =>
    mode === "level"
      ? 265 - (value / (view?.limit ?? 1)) * 235
      : 147.5 - (value / (view?.limit ?? 1)) * 117.5;
  const format = (v: number) =>
    v.toLocaleString("de", { maximumFractionDigits: 3 });
  return (
    <>
      <p className="atlas-explanation">
        {sector === "households"
          ? "Wie sich die Schulden der privaten Haushalte im Verhältnis zur Wirtschaftsleistung entwickeln. Organisationen ohne Erwerbszweck, die Haushalten dienen, zählen mit."
          : "Wie sich die Schulden von Unternehmen außerhalb des Finanzsektors im Verhältnis zur Wirtschaftsleistung entwickeln. Private und staatseigene Unternehmen zählen mit; Banken sind nicht enthalten."}
      </p>
      <div className="atlas-history-controls">
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="Schuldenbild"
        >
          {(
            [
              ["level", "Schuldenquote"],
              ["change", "Steigen & Fallen"],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
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
          aria-label="Schuldenzeitraum"
        >
          {[0, 1980, 2000].map((year) => (
            <button
              type="button"
              key={year}
              aria-pressed={since === year}
              onClick={() => setSince(year)}
            >
              {year ? `Seit ${year}` : "Gesamte Geschichte"}
            </button>
          ))}
        </div>
      </div>
      {query.isPending && (
        <p role="status">Lokale Schuldenbilder werden geladen …</p>
      )}
      {query.error && <p role="alert">{errorText(query.error)}</p>}
      {data?.status === "desktop_required" && (
        <p>
          Die öffentlichen BIS-Schuldenbilder lassen sich in der Desktop-App
          laden.
        </p>
      )}
      {data?.status === "not_downloaded" && (
        <p>
          Die BIS-Grundlage für Haushalts- und Unternehmensschulden wurde noch
          nicht geladen.
        </p>
      )}
      {data?.status === "unsupported_area" && (
        <p>
          Für {geography.label} enthält diese Quelle kein eigenes
          Schuldenprofil. Die BIS-Ländergruppen sind eigene Aggregate und kein
          vollständiges Welt- oder Kontinentbild.
        </p>
      )}
      {data?.status === "available" && !main && (
        <p>
          Im gewählten Zeitraum fehlt ein nutzbares Schuldenbild dieser
          Perspektive.
        </p>
      )}
      {compareId && !compared && (
        <p role="status">
          {compareArea?.label}:{" "}
          {comparison.isPending
            ? "Vergleich wird geladen …"
            : comparison.error
              ? errorText(comparison.error)
              : "Kein vergleichbares Bild im selben Quellenstand und Zeitraum vorhanden."}
        </p>
      )}
      {view && (
        <figure className="atlas-credit-figure">
          <figcaption>
            {debtTitle(sector)} ·{" "}
            {mode === "level" ? "Schuldenquote" : "Veränderung zum Vorjahr"} ·{" "}
            {quarter(view.start)} bis {quarter(view.end)}
          </figcaption>
          <svg
            viewBox="0 0 1000 315"
            style={{ display: "block", width: "100%" }}
            role="img"
            aria-label={`${debtTitle(sector)}: ${view.series.map((s) => s.geography.label).join(" und ")}; ${quarter(view.start)} bis ${quarter(view.end)}. ${unit}. Gemeinsame Skala; Lücken bleiben offen.`}
          >
            {[0, 1, 2, 3, 4].map((i) => {
              const v =
                mode === "level"
                  ? (view.limit * i) / 4
                  : view.limit * (i / 2 - 1);
              return (
                <g key={i}>
                  <line
                    x1="50"
                    x2="970"
                    y1={y(v)}
                    y2={y(v)}
                    stroke="var(--border)"
                    strokeDasharray={
                      mode === "change" && v === 0 ? "6 5" : undefined
                    }
                  />
                  {showNumbers && (
                    <text
                      x="43"
                      y={y(v) + 4}
                      textAnchor="end"
                      fill="var(--text-2)"
                      fontSize="11"
                    >
                      {format(v)}
                    </text>
                  )}
                </g>
              );
            })}
            {Array.from(
              new Set([
                view.start,
                view.end,
                ...[1, 2, 3].map((i) =>
                  Math.round(view.start + ((view.end - view.start) * i) / 4),
                ),
              ]),
            )
              .sort((a, b) => a - b)
              .map((q) => (
                <text
                  key={q}
                  x={x(q)}
                  y="295"
                  textAnchor={
                    q === view.start
                      ? "start"
                      : q === view.end
                        ? "end"
                        : "middle"
                  }
                  fill="var(--text-2)"
                  fontSize="11"
                >
                  {quarter(q)}
                </text>
              ))}
            {view.series.map((s, index) => {
              const segments = debtSegments(s.points);
              const singletons = new Set(
                segments
                  .filter((segment) => segment.length === 1)
                  .map((segment) => segment[0].q),
              );
              return (
                <g key={s.geography.id} fill="none" stroke={colors[index]}>
                  {segments.map((segment, j) => (
                    <path
                      key={j}
                      d={segment
                        .map(
                          (p, i) => `${i ? "L" : "M"}${x(p.q)},${y(p.value!)}`,
                        )
                        .join(" ")}
                      strokeWidth="2.8"
                      strokeDasharray={index ? "7 5" : undefined}
                    />
                  ))}
                  {s.points
                    .filter((p) => p.value != null)
                    .map((p) => (
                      <circle
                        key={p.period}
                        cx={x(p.q)}
                        cy={y(p.value!)}
                        r={p.broken || singletons.has(p.q) ? 4 : 5}
                        fill={
                          p.broken || singletons.has(p.q)
                            ? colors[index]
                            : "transparent"
                        }
                        stroke="none"
                      >
                        <title>
                          {s.geography.label} · {p.period}
                          {showNumbers ? ` · ${format(p.value!)} ${unit}` : ""}
                          {p.broken ? " · Quellenbruch" : ""}
                        </title>
                      </circle>
                    ))}
                </g>
              );
            })}
          </svg>
          <ul className="atlas-energy-legend">
            {view.series.map((s, i) => (
              <li key={s.geography.id}>
                <span style={{ background: colors[i] }} aria-hidden="true" />
                {s.geography.label} · {i ? "gestrichelt" : "durchgehend"}
              </li>
            ))}
          </ul>
          <p className="atlas-comparison-note">
            {unit}.{" "}
            {mode === "change"
              ? "Oberhalb der Mittellinie steigt die Schuldenquote, unterhalb fällt sie. Null bedeutet unverändert zum Vorjahr."
              : "Oben mehr, unten weniger Schulden relativ zur Wirtschaftsleistung. Hohe Quoten können auch durch ein kleineres BIP entstehen."}{" "}
            Das Bild ist keine Schätzung eines fairen Marktwerts.
          </p>
          {compared && (
            <p className="atlas-comparison-note">
              {compared.common.length
                ? `Gemeinsam beobachteter Zeitraum: ${compared.common[0]} bis ${compared.common[compared.common.length - 1]}. Eigene Vorgeschichten bleiben sichtbar.`
                : "Die beiden Länder haben im gewählten Fenster keine gemeinsamen Beobachtungsquartale."}
            </p>
          )}
        </figure>
      )}
      {shown.map((row) => {
        const note = debtCountryNote(row!.profile!.providerCode);
        return note ? (
          <p className="atlas-comparison-note" key={row!.geography.id}>
            {row!.geography.label}: {note}
          </p>
        ) : null;
      })}
      {showNumbers && view && (
        <details className="atlas-method">
          <summary>Quartalswerte · {unit}</summary>
          <div className="atlas-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quartal</th>
                  {view.series.map((s) => (
                    <th key={s.geography.id}>{s.geography.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  new Set(
                    view.series.flatMap((s) => s.points.map((p) => p.period)),
                  ),
                )
                  .sort()
                  .map((period) => (
                    <tr key={period}>
                      <td>{period}</td>
                      {view.series.map((s) => {
                        const v = s.points.find(
                          (p) => p.period === period,
                        )?.value;
                        return (
                          <td key={s.geography.id}>
                            {v == null ? "Nicht verfügbar" : format(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {!main && choices.length > 0 && (
        <label className="atlas-credit-alternatives">
          Verfügbares BIS-Schuldengebiet öffnen{" "}
          <select
            aria-label="BIS-Schuldengebiet öffnen"
            value=""
            onChange={(e) => {
              const a = atlasCatalog.geographies.find(
                (g) => g.id === e.target.value,
              );
              if (a) onAreaChange(a);
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
              : "BIS-Schuldenbilder weltweit laden"}
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
          Quelle: BIS total credit statistics. Schulden am Quartalsende, geteilt
          durch die Wirtschaftsleistung der letzten vier Quartale. Kredite von
          in- und ausländischen Banken sowie anderen Geldgebern zählen mit.
          Eigene Vermögenswerte werden nicht abgezogen; Forderungen zwischen
          Unternehmen desselben Sektors werden nicht gegeneinander aufgerechnet.
        </p>
        <p>
          Die BIS hat historische Brüche rechnerisch angepasst. Frühere
          Jahresdaten können von der Quelle auf Quartale verteilt worden sein.
          Das Diagramm ergänzt keine fehlenden Quartale. Dies ist der heutige
          revidierte Quellenstand, keine Sammlung damals verfügbarer Daten.
        </p>
        <p>
          „Steigen & Fallen“ ist die Differenz zur Quote vier Quartale zuvor.
          Fehlende Zwischenquartale und gekennzeichnete Quellenbrüche
          unterbrechen die Berechnung. Es gibt keine feste Zyklusdauer oder
          Hochrechnung.
        </p>
        <p>
          43 Länder und Wirtschaftsgebiete, der Euroraum und vier eigene
          BIS-Gruppen. Die vier zusätzlichen Aggregate verwenden die
          veröffentlichten Verhältnisse auf Basis von Marktwechselkursen.
          Zusammensetzungen können sich von anderen Quellenfamilien
          unterscheiden. Das Berichtsgebiet „Alle berichtenden
          Volkswirtschaften“ ist kein vollständiges Weltaggregat.
        </p>
        {data?.provenance && (
          <p>
            Lokal geladen:{" "}
            {new Date(data.provenance.retrievedAt).toLocaleDateString("de")}.
            Ein erneuter Download ist nach einem Tag möglich.
          </p>
        )}
        <a
          href="https://data.bis.org/topics/TOTAL_CREDIT"
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            if (isTauri()) {
              e.preventDefault();
              void openUrl("https://data.bis.org/topics/TOTAL_CREDIT");
            }
          }}
        >
          BIS-Quelle und Länderhinweise öffnen
        </a>
      </details>
    </>
  );
}
