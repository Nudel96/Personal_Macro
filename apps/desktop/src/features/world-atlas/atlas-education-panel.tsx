import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { atlasCatalog } from "./atlas-catalog";
import { useAtlasDisplayChoice } from "./atlas-display-state";
import {
  atlasEducationCatalog,
  atlasEducationDataset,
  educationMetrics,
  educationPoints,
  educationPointKind,
  educationSegments,
  educationView,
} from "./atlas-education";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";

const message = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Die Bildungsdaten konnten nicht geladen werden.";
export function AtlasEducationPanel({
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
  const metrics = educationMetrics(topicId);
  const [code, setCode] = useAtlasDisplayChoice(
    "educationMetric",
    metrics[0].code,
    metrics.map((m) => m.code),
  );
  const [since, setSince] = useAtlasDisplayChoice<number>(
    "educationSince",
    0,
    [0, 2000, 2010],
  );
  const metric = metrics.find((m) => m.code === code) ?? metrics[0];
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["atlas", "education", geography.id],
    queryFn: () => api.atlasEducation(geography.id),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "education", compareId],
    queryFn: () => api.atlasEducation(compareId!),
    enabled: Boolean(compareId),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasEducation(),
    onSuccess: (j) => client.setQueryData(["atlas", "job"], j),
  });
  const data = query.data;
  const main = data ? educationView([data], metric, since) : null;
  const compared =
    data && comparison.data && compareId
      ? educationView([data, comparison.data], metric, since)
      : null;
  const view = compared ?? main;
  const busy = sync.isPending || job?.status === "running";
  const fresh =
    data?.provenance &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86_400_000;
  const sourceJob = job?.seriesId === atlasEducationDataset ? job : null;
  const comparisonName = atlasCatalog.geographies.find(
    (g) => g.id === compareId,
  )?.label;
  const unit =
    code === "XGDP.FSGOV"
      ? "Anteil am BIP"
      : code === "GER.5T8"
        ? "Bruttoquote zur Bevölkerung im Hochschulalter"
        : "Anteil der beschriebenen Gruppe";
  const kind =
    metric.kind === "modelled"
      ? "Veröffentlichtes UIS-Modell"
      : metric.kind === "assessment"
        ? "Einzelne Lernstandserhebungen"
        : metric.kind === "survey"
          ? "Einzelne Erhebungen"
          : "Quellenstatistik mit möglichen Schätzungen";
  const x = (year: number) =>
    view
      ? 58 + ((year - view.first) / Math.max(1, view.last - view.first)) * 684
      : 58;
  const y = (value: number) => (view ? 246 - (value / view.max) * 210 : 246);
  return (
    <>
      <p className="atlas-explanation">{metric.explanation}</p>
      <div className="atlas-history-controls">
        <label className="field">
          Bildungsperspektive
          <select value={metric.code} onChange={(e) => setCode(e.target.value)}>
            {metrics.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="Bildungszeitraum"
        >
          {[0, 2000, 2010].map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={since === v}
              onClick={() => setSince(v)}
            >
              {v ? `Seit ${v}` : "Gesamte Geschichte"}
            </button>
          ))}
        </div>
      </div>
      <p className="atlas-chart-label">
        <span>{kind}</span>
        <span>{unit}</span>
      </p>
      {metric.kind === "modelled" && (
        <p className="atlas-notice">
          Die jährliche Linie beruht auf dem veröffentlichten UNESCO-Modell.
          Unter „Bildungsperspektive“ sind die ursprünglichen Erhebungen separat
          wählbar.
        </p>
      )}
      {query.isPending && (
        <p role="status">Lokale Bildungsbilder werden geladen …</p>
      )}
      {query.error && <p role="alert">{message(query.error)}</p>}
      {data?.status === "desktop_required" && (
        <p>
          Diese kostenlosen Originaldaten lassen sich in der Desktop-App laden
          und lokal aufbewahren.
        </p>
      )}
      {data?.status === "not_downloaded" && (
        <p>Die weltweite Bildungsgrundlage ist noch nicht geladen.</p>
      )}
      {data && !main && data.provenance && (
        <p className="atlas-notice">
          Für {geography.label} liefert diese Bildungsperspektive im gewählten
          Zeitraum kein Bild. Fehlende Werte bleiben offen.
        </p>
      )}
      {data?.status === "unsupported_area" && (
        <div className="atlas-notice">
          Dieses Gebiet ist kein eigenes UIS-Quellengebiet.{" "}
          <Button
            variant="ghost"
            onClick={() =>
              onAreaChange(
                atlasCatalog.geographies.find((g) => g.id === "uis:world")!,
              )
            }
          >
            Welt · UIS-SDG-Region öffnen
          </Button>
        </div>
      )}
      {compareId && (
        <>
          {comparison.isPending && (
            <p role="status">Vergleichsgebiet wird gelesen …</p>
          )}
          {comparison.error && <p role="alert">{message(comparison.error)}</p>}
          {!compared && main && comparison.data && (
            <p className="atlas-notice">
              {metric.kind === "assessment"
                ? "Lernstandstests unterschiedlicher Programme dürfen nicht automatisch überlagert werden. Das Bild zeigt das ausgewählte Land mit den Originalquellen je Erhebung."
                : `Für den Vergleich mit ${comparisonName} fehlen Werte desselben Quellenstands in gemeinsamen Erhebungsjahren. Das Bild zeigt ${geography.label}.`}
            </p>
          )}
        </>
      )}
      {view && (
        <figure
          className="atlas-education-picture"
          data-testid="education-picture"
        >
          <figcaption>
            {metric.label} · {view.rows.map((r) => r.name).join(" / ")}
            <br />
            {kind} · UNESCO UIS · {data!.provenance!.release}
          </figcaption>
          <svg
            viewBox="0 0 800 300"
            role="img"
            aria-label={`${metric.label}. ${view.rows.map((r) => r.name).join(" und ")}. ${kind}. ${unit}, Prozent. ${view.first} bis ${view.last}. Gemeinsamer Maßstab. Fehlende Jahre bleiben offen. UNESCO UIS, ${data!.provenance!.release}.`}
          >
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line
                  x1="58"
                  x2="742"
                  y1={y(f * view.max)}
                  y2={y(f * view.max)}
                  stroke="var(--border)"
                />
                {showNumbers && (
                  <text
                    x="48"
                    y={y(f * view.max) + 4}
                    textAnchor="end"
                    fill="var(--text-2)"
                    fontSize="12"
                  >
                    {(f * view.max).toLocaleString("de", {
                      maximumFractionDigits: 1,
                    })}
                    %
                  </text>
                )}
              </g>
            ))}
            {[view.first, ...(view.first === view.last ? [] : [view.last])].map(
              (year) => (
                <text
                  key={year}
                  x={x(year)}
                  y="275"
                  textAnchor="middle"
                  fill="var(--text-2)"
                  fontSize="13"
                >
                  {year}
                </text>
              ),
            )}
            {view.rows.map((row, i) => (
              <g
                key={row.name}
                stroke={i ? "var(--violet)" : "var(--primary-bright)"}
                fill={i ? "var(--violet)" : "var(--primary-bright)"}
              >
                {educationSegments(row.points, metric.kind).map((s) => (
                  <polyline
                    key={s[0].year}
                    points={s
                      .map((p) => `${x(p.year)},${y(p.value!)}`)
                      .join(" ")}
                    fill="none"
                    strokeWidth="2.5"
                    strokeDasharray={
                      i || metric.kind === "modelled" ? "6 4" : undefined
                    }
                  />
                ))}
                {row.points.map((p) => (
                  <g key={p.year}>
                    {p.qualifier || metric.kind === "modelled" ? (
                      <rect
                        x={x(p.year) - 3}
                        y={y(p.value!) - 3}
                        width="6"
                        height="6"
                        transform={`rotate(45 ${x(p.year)} ${y(p.value!)})`}
                        fill={
                          p.magnitude === "LOWREL"
                            ? "var(--surface)"
                            : undefined
                        }
                      />
                    ) : (
                      <circle
                        cx={x(p.year)}
                        cy={y(p.value!)}
                        r="3.5"
                        fill={
                          p.magnitude === "LOWREL"
                            ? "var(--surface)"
                            : undefined
                        }
                      />
                    )}
                    {showNumbers && (
                      <title>
                        {row.name} · {p.year}:{" "}
                        {p.value!.toLocaleString("de", {
                          maximumFractionDigits: 2,
                        })}
                        % · {educationPointKind(p, metric)}
                      </title>
                    )}
                  </g>
                ))}
              </g>
            ))}
          </svg>
          <div className="atlas-chart-label">
            <span>Höher = mehr · tiefer = weniger</span>
            <span>Keine Markt- oder Unternehmensbewertung</span>
          </div>
          {view.rows.length > 1 && (
            <p className="atlas-chart-label">
              <span style={{ color: "var(--primary-bright)" }}>
                ● {view.rows[0].name}
              </span>
              <span style={{ color: "var(--violet)" }}>
                ● {view.rows[1].name}
              </span>
            </p>
          )}
          <p className="atlas-chart-label">
            Rauten kennzeichnen Modellwerte oder ausgewiesene Schätzungen.
            Offene Zeichen: geringe Zuverlässigkeit laut Quelle.
          </p>
        </figure>
      )}
      <div className="atlas-sync-actions">
        <Button
          variant="ghost"
          disabled={!isTauri() || Boolean(busy) || Boolean(fresh)}
          onClick={() => sync.mutate()}
        >
          {busy
            ? "Atlas-Abruf läuft …"
            : fresh
              ? "Bildungsgrundlage heute geladen"
              : "Weltweite Bildungsgrundlage laden"}
        </Button>
      </div>
      {sync.error && <p role="alert">{message(sync.error)}</p>}
      {sourceJob && (
        <p role={sourceJob.status === "failed" ? "alert" : "status"}>
          {sourceJob.message}
        </p>
      )}
      <details className="atlas-details">
        <summary>
          Quelle, Erhebungen und Grenzen{showNumbers ? " · mit Werten" : ""}
        </summary>
        <p>
          Quelle: UNESCO Institute for Statistics (UIS), SDG-Veröffentlichung
          Februar 2026. Bildungsstufen und Erhebungsverfahren können zwischen
          Ländern und Jahren abweichen. Lücken werden nicht aufgefüllt. Die
          staatliche Versorgung beschreibt keine private Branchenbewertung.
        </p>
        <p>{metric.providerLabel}</p>
        {data?.provenance && (
          <p>
            Abruf:{" "}
            {new Date(data.provenance.retrievedAt).toLocaleDateString("de")} ·{" "}
            {data.provenance.release} · {atlasEducationCatalog.license}.
          </p>
        )}
        {[
          [atlasEducationCatalog.metadataUrl, "Offizielle Definitionen öffnen"],
          [
            "https://databrowser.uis.unesco.org/resources/bulk",
            "UNESCO-Originalquelle öffnen",
          ],
          [atlasEducationCatalog.licenseUrl, atlasEducationCatalog.license],
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
        {(compared ? [data!, comparison.data!] : data ? [data] : []).map(
          (d) => (
            <div key={d.geography.id}>
              <h3>{d.geography.label}</h3>
              {educationPoints(d, code, since).map((p) => (
                <div key={p.year} className="atlas-notice">
                  <strong>
                    {p.year}
                    {showNumbers
                      ? ` · ${p.value === null ? "Nicht verfügbar" : `${p.value.toLocaleString("de", { maximumFractionDigits: 2 })}%`}`
                      : ""}
                  </strong>
                  <p>{educationPointKind(p, metric)}</p>
                  {p.notes.map((n, i) => (
                    <p key={i}>
                      {n.kind === "Source:Data sources"
                        ? "Originalquelle"
                        : "Erhebungshinweis"}
                      : {n.text}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          ),
        )}
      </details>
    </>
  );
}
