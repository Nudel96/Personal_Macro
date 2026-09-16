import { useContext, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { atlasCatalog } from "./atlas-catalog";
import { AtlasDisplayContext } from "./atlas-display-state";
import {
  atlasPublicCatalog,
  publicComparisonSelection,
  publicHorizons,
  publicPartnerOverview,
  publicPicture,
  publicRegimeLabel,
  publicSelection,
  publicValue,
  type PublicMetric,
  type PublicPicture,
} from "./atlas-public";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";
import "./atlas-fiscal.css";
import "./atlas-innovation.css";
import "./atlas-public.css";

const fmt = (n: number, metric: PublicMetric) =>
  new Intl.NumberFormat("de", {
    maximumFractionDigits:
      metric.sourceId === "wits-export-concentration"
        ? 6
        : metric.sourceId === "bis-commercial-property"
          ? 4
          : metric.sourceId.startsWith("oecd-tiva-") ||
              metric.sourceId === "ndgain-climate"
            ? 3
            : metric.unit.endsWith("(Anzahl)")
              ? 0
              : 2,
  }).format(n);
const message = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Die Quellenwerte konnten nicht gelesen werden.";
export function PublicChart({
  picture,
  metric,
  numbers,
  axis,
}: {
  picture: PublicPicture;
  metric: PublicMetric;
  numbers: boolean;
  axis?: { first: number; last: number; min: number; max: number };
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [w, setWidth] = useState(800);
  useEffect(() => {
    if (!svg.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) setWidth(Math.max(320, Math.round(width)));
    });
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, []);
  const h = 320,
    left = numbers ? 76 : 20,
    right = w - 20,
    bottom = h - 30,
    top = 18;
  const scale = axis ?? picture;
  const x = (time: number) =>
    scale.first === scale.last
      ? (left + right) / 2
      : left +
        ((time - scale.first) / (scale.last - scale.first)) * (right - left);
  const y = (n: number) =>
    top + ((scale.max - n) / (scale.max - scale.min)) * (bottom - top);
  const first = picture.points[0],
    last = picture.points[picture.points.length - 1];
  if (metric.kind === "period_snapshot") {
    const window = first.period.replace("/", "–");
    const title = `${metric.label}. Zusammengefasster Zeitraum ${window}. ${metric.unit}.`;
    const barWidth =
      ((first.n - scale.min) / (scale.max - scale.min)) * (w - 48);
    return (
      <svg
        ref={svg}
        className="atlas-innovation-chart atlas-public-period"
        viewBox={`0 0 ${w} 140`}
        role="img"
        aria-label={title}
      >
        <title>{title}</title>
        <text x={24} y={26}>
          {window} · zusammengefasst
        </text>
        <rect x={24} y={48} width={w - 48} height={24} fill="var(--border)" />
        <rect
          className="atlas-public-period-value"
          x={24}
          y={48}
          width={barWidth}
          height={24}
          fill="var(--primary-bright)"
        >
          <title>
            {window}
            {numbers ? ` · ${fmt(first.n, metric)} ${metric.unit}` : ""} ·{" "}
            {first.notes.join(" · ")}
          </title>
        </rect>
        {numbers &&
          [scale.min, (scale.min + scale.max) / 2, scale.max].map((n, i) => (
            <text
              key={n}
              x={24 + (i * (w - 48)) / 2}
              y={98}
              textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
            >
              {fmt(n, metric)}
            </text>
          ))}
        <text x={24} y={126}>
          Gemeinsamer Maßstab für alle Quellengebiete
        </text>
      </svg>
    );
  }
  if (metric.kind === "projection_snapshot") {
    const title = `${metric.label}. Zeitlich konstantes Projektionsmodell mit unterschiedlichen Zukunftshorizonten. ${metric.unit}.`;
    const markerX = 24 + first.n * (w - 48);
    return (
      <svg
        ref={svg}
        className="atlas-innovation-chart atlas-public-projection"
        viewBox={`0 0 ${w} 138`}
        role="img"
        aria-label={title}
      >
        <title>{title}</title>
        <line
          x1={24}
          x2={w - 24}
          y1={58}
          y2={58}
          stroke="var(--border)"
          strokeWidth={5}
        />
        {[0, 0.5, 1].map((n) => (
          <g key={n}>
            <line
              x1={24 + n * (w - 48)}
              x2={24 + n * (w - 48)}
              y1={48}
              y2={68}
              stroke="var(--text-3)"
            />
            {numbers && (
              <text x={24 + n * (w - 48)} y={88} textAnchor="middle">
                {fmt(n, metric)}
              </text>
            )}
          </g>
        ))}
        <circle cx={markerX} cy={58} r={7} fill="var(--primary-bright)">
          <title>
            Projektionsmodell
            {numbers ? ` · ${fmt(first.n, metric)} ${metric.unit}` : ""} ·{" "}
            {first.notes.join(" · ")}
          </title>
        </circle>
        {numbers && (
          <text
            x={Math.min(w - 34, Math.max(34, markerX))}
            y={32}
            textAnchor="middle"
          >
            {fmt(first.n, metric)}
          </text>
        )}
        <text x={24} y={119} textAnchor="start">
          Geringere Exposition
        </text>
        <text x={w - 24} y={119} textAnchor="end">
          Höhere Exposition
        </text>
      </svg>
    );
  }
  if (metric.kind === "binary_regime") {
    const start = scale.first,
      end = scale.last + 1;
    const at = (year: number) =>
      20 + ((year - start) / (end - start)) * (w - 40);
    const title = `${metric.label}, ${first.period} bis ${last.period}. Historische Jahresklassen, keine numerische Bewertung.`;
    const years = [
      start,
      ...[1900, 1950, 2000].filter(
        (y) =>
          y > start && y < scale.last && at(y) - 20 > 45 && w - 20 - at(y) > 45,
      ),
      scale.last,
    ];
    return (
      <svg
        ref={svg}
        className="atlas-innovation-chart atlas-public-regimes"
        viewBox={`0 0 ${w} 190`}
        role="img"
        aria-label={title}
      >
        <title>{title}</title>
        <text x={20} y={25}>
          Jahresweise Quellenklassifikation
        </text>
        {picture.points.map((p) => (
          <rect
            key={p.period}
            className="atlas-regime-year"
            x={at(p.time)}
            y={48}
            width={Math.max(0.5, at(p.time + 1) - at(p.time) - 0.6)}
            height={38}
            fill={p.n === 1 ? "var(--primary-bright)" : "var(--text-3)"}
          >
            <title>
              {p.period} · {publicRegimeLabel(metric, p.n)} ·{" "}
              {p.notes.join(" · ")}
            </title>
          </rect>
        ))}
        {[...new Set(years)].map((year) => (
          <text
            key={year}
            x={year === scale.last ? w - 20 : at(year)}
            y={109}
            textAnchor={
              year === scale.last ? "end" : year === start ? "start" : "middle"
            }
          >
            {year}
          </text>
        ))}
        {[1, 0].map((n, i) => (
          <g key={n}>
            <rect
              x={20}
              y={130 + i * 25}
              width={12}
              height={12}
              fill={n === 1 ? "var(--primary-bright)" : "var(--text-3)"}
            />
            <text x={41} y={140 + i * 25}>
              {publicRegimeLabel(metric, n)}
            </text>
          </g>
        ))}
      </svg>
    );
  }
  const labels = [
    first,
    ...(Math.floor(last.time) - Math.floor(first.time) > 8
      ? picture.points.filter(
          (p) =>
            Number.isInteger(p.time) &&
            p.time % 10 === 0 &&
            x(p.time) - left > 70 &&
            right - x(p.time) > 70,
        )
      : []),
    ...(first.period === last.period ? [] : [last]),
  ];
  const title = `${metric.label}, ${first.period} bis ${last.period}. ${metric.unit}. Lücken und Brüche bleiben offen.`;
  return (
    <svg
      ref={svg}
      className="atlas-innovation-chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {[scale.min, (scale.min + scale.max) / 2, scale.max].map((n) => (
        <g key={n}>
          <line
            x1={left}
            x2={right}
            y1={y(n)}
            y2={y(n)}
            stroke="var(--border)"
          />
          {numbers && (
            <text x={left - 8} y={y(n) + 4} textAnchor="end">
              {fmt(n, metric)}
            </text>
          )}
        </g>
      ))}
      {labels.map((p) => (
        <text
          key={p.period}
          x={x(p.time)}
          y={h - 8}
          textAnchor={p === first ? "start" : p === last ? "end" : "middle"}
        >
          {p.period}
        </text>
      ))}
      {picture.segments
        .filter((s) => s.length > 1)
        .map((s) => (
          <polyline
            key={s[0].period}
            points={s.map((p) => `${x(p.time)},${y(p.n)}`).join(" ")}
            fill="none"
            stroke="var(--primary-bright)"
            strokeWidth={2}
          />
        ))}
      {picture.points.map((p) => {
        const lower = publicValue(p.lowerBound),
          upper = publicValue(p.upperBound);
        // These adapters provide translated status text; older adapters retain
        // provider codes whose meaning is already carried in their notes.
        const status =
          metric.sourceId.startsWith("bgs-") ||
          metric.sourceId.startsWith("eurostat-") ||
          metric.sourceId === "ndgain-climate" ||
          metric.sourceId === "bis-commercial-property"
            ? p.status
            : "";
        const provisional =
          metric.sourceId === "bis-commercial-property" &&
          p.status === "Vorläufiger Quellenwert (P)";
        return (
          <g key={p.period}>
            {lower !== null && upper !== null && (
              <line
                x1={x(p.time)}
                x2={x(p.time)}
                y1={y(lower)}
                y2={y(upper)}
                stroke="var(--text-3)"
                strokeWidth={1.5}
                opacity={0.55}
              />
            )}
            <circle
              cx={x(p.time)}
              cy={y(p.n)}
              r={picture.points.length > 100 ? 1.8 : 2.8}
              fill={provisional ? "var(--surface)" : "var(--primary-bright)"}
              stroke={provisional ? "var(--primary-bright)" : undefined}
              strokeWidth={provisional ? 1.6 : undefined}
            >
              <title>
                {p.period}
                {numbers ? ` · ${fmt(p.n, metric)} ${metric.unit}` : ""}
                {status ? ` · ${status}` : ""}
                {p.breakBefore && !status.includes("Reihenbruch")
                  ? " · Reihenbruch"
                  : ""}
                {p.notes.length ? ` · ${p.notes.join(" · ")}` : ""}
              </title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}
export function AtlasPublicPanel({
  topicId,
  geography,
  compareId,
  showNumbers,
  job,
  onAreaChange,
}: {
  topicId: string;
  geography: AtlasGeography;
  compareId?: string;
  showNumbers: boolean;
  job: AtlasSyncJob | null | undefined;
  onAreaChange: (id: string) => void;
}) {
  const context = useContext(AtlasDisplayContext);
  const [local, setLocal] = useState(new URLSearchParams());
  const [linkError, setLinkError] = useState(false);
  const selected = publicSelection(
    context?.params ?? local,
    topicId,
    geography.id,
  );
  const navigate = (values: Record<string, string>) => {
    if (context) context.navigate(values);
    else
      setLocal((previous) => {
        const p = new URLSearchParams(previous);
        Object.entries(values).forEach(([k, v]) => p.set(k, v));
        return p;
      });
  };
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["atlas", "public", selected.source?.id, geography.id],
    queryFn: () => api.atlasPublicSource(selected.source!.id, geography.id),
    enabled: Boolean(selected.source),
  });
  const sync = useMutation({
    mutationFn: () => api.syncAtlasPublicSource(selected.source!.id),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "public", selected.source?.id, compareId],
    queryFn: () => api.atlasPublicSource(selected.source!.id, compareId!),
    enabled: Boolean(selected.source && compareId),
  });
  if (!selected.source || !selected.metric)
    return (
      <p>Für dieses Thema ist keine geprüfte Quellenreihe eingerichtet.</p>
    );
  const { source, metric, metrics, since } = selected;
  const commercial = source.id === "bis-commercial-property";
  const compareSelection = compareId
    ? publicComparisonSelection(context?.params ?? local, metric, compareId)
    : null;
  const compareMetric = commercial ? compareSelection?.metric : metric;
  const projection = metric.kind === "projection_snapshot";
  const periodSnapshot = metric.kind === "period_snapshot";
  const regime = metric.kind === "binary_regime";
  const data = query.data;
  const picture = data ? publicPicture(data, metric, since) : null;
  const comparable =
    comparison.data &&
    comparison.data.geography.id === compareId &&
    comparison.data.provenance?.retrievedAt === data?.provenance?.retrievedAt;
  const comparePicture =
    comparable && compareMetric
      ? publicPicture(comparison.data!, compareMetric, since)
      : null;
  const commonAxis =
    picture && comparePicture
      ? {
          first: Math.min(picture.first, comparePicture.first),
          last: Math.max(picture.last, comparePicture.last),
          min: Math.min(picture.min, comparePicture.min),
          max: Math.max(picture.max, comparePicture.max),
        }
      : undefined;
  const sameScale = metric.comparison === "same_definition";
  const fresh =
    data?.provenance &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86400000;
  const area = source.areas.find((a) => a.geographyId === geography.id);
  const selfPartner =
    source.id === "oecd-tiva-partners" && metric.providerCode === area?.code;
  const partnerOverview = data ? publicPartnerOverview(data, since) : null;
  const mapped = Boolean(area?.seriesTitles[metric.providerCode]);
  const sourceOptions = atlasPublicCatalog.sources.filter((s) =>
    atlasPublicCatalog.metrics.some(
      (m) => m.topicId === topicId && m.sourceId === s.id,
    ),
  );
  const kind =
    source.observationKind === "operator_report"
      ? "Veröffentlichter Betreiberbericht"
      : source.observationKind === "historical_classification"
        ? "Historische Quellenklassifikation"
        : source.observationKind === "published_research_indices"
          ? "Veröffentlichte Forschungsindizes"
          : source.observationKind === "modeled_estimate"
            ? "Modellschätzungen"
            : source.observationKind === "perception_index"
              ? "Befragungen und Expertenschätzungen"
              : source.observationKind === "household_survey"
                ? "Haushaltsbefragung · Schätzwerte"
                : source.observationKind === "survey_estimate"
                  ? "Unternehmensbefragung · Schätzwerte"
                  : source.observationKind === "source_estimates"
                    ? "Quellenstatistik mit Schätzungen"
                    : "Veröffentlichte Quellenstatistik";
  const availableAreas = source.areas
    .filter((a) => commercial || a.seriesTitles[metric.providerCode])
    .map((a) => atlasCatalog.geographies.find((g) => g.id === a.geographyId)!)
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label, "de"));
  return (
    <section
      className="atlas-public-panel atlas-fiscal-panel"
      aria-label={source.label}
    >
      <div className="atlas-fiscal-controls">
        {sourceOptions.length > 1 && (
          <label>
            Quelle
            <select
              aria-label="Öffentliche Quelle"
              value={source.id}
              onChange={(e) =>
                navigate({ publicSource: e.target.value, publicMetric: "" })
              }
            >
              {sourceOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Perspektive
          <select
            aria-label="Datenperspektive"
            value={metric.id}
            onChange={(e) =>
              navigate({
                publicMetric: e.target.value,
                publicCompareMetric: "",
              })
            }
          >
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {(commercial || source.adapter === "sasol_synfuels") &&
                !area?.seriesTitles[m.providerCode]
                  ? " · hier nicht verfügbar"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        {!projection && !periodSnapshot && (
          <label>
            Zeitraum
            <select
              aria-label="Beginn des Datenbilds"
              value={since}
              onChange={(e) => navigate({ publicSince: e.target.value })}
            >
              {publicHorizons.map((y) => (
                <option key={y} value={y}>
                  {y ? `Ab ${y}` : "Gesamte Geschichte"}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p>{metric.explanation}</p>
      {partnerOverview && (
        <section
          className="atlas-public-partners"
          aria-label="Größte Exportpartner"
        >
          <p>
            Größte Absatzmärkte · {partnerOverview.period} · {geography.label}
          </p>
          <div>
            {partnerOverview.rows.map(({ metric: partner, value }) => (
              <button
                type="button"
                key={partner.id}
                aria-pressed={metric.id === partner.id}
                onClick={() => navigate({ publicMetric: partner.id })}
              >
                <span>{partner.label.replace(/^Exportpartner · /, "")}</span>
                {showNumbers && <span>{fmt(value, partner)} %</span>}
                <span className="atlas-public-partner-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${partnerOverview.rows[0].value > 0 ? (100 * value) / partnerOverview.rows[0].value : 0}%`,
                    }}
                  />
                </span>
              </button>
            ))}
          </div>
          <p className="atlas-comparison-note">
            Veröffentlichte Exportanteile im selben Jahr · gemeinsamer Maßstab ·
            OECD-Modell. Ein Klick öffnet die Geschichte des Partners.
          </p>
        </section>
      )}
      <p className="atlas-comparison-note">
        {projection
          ? "Klimaprojektionen · fester Modellstand"
          : periodSnapshot
            ? "Veröffentlichter Zeitraumwert"
            : kind}{" "}
        ·{" "}
        {projection
          ? "Unterschiedliche Zukunftshorizonte"
          : periodSnapshot
            ? `Gesamter Zeitraum ${source.firstPeriod}–${source.lastPeriod}`
            : regime
              ? "Jahresklassen"
              : metric.frequency === "quarterly"
                ? "Quartalswerte"
                : metric.frequency === "half_yearly"
                  ? "Halbjahreswerte"
                  : metric.frequency === "monthly"
                    ? "Monatswerte"
                    : metric.frequency === "fiscal_annual_june"
                      ? "Geschäftsjahre · Ende am 30. Juni"
                      : metric.frequency === "annual"
                        ? "Jahreswerte"
                        : "Einzelne Beobachtungen"}{" "}
        · {metric.unit}
      </p>
      {query.isPending ? (
        <p role="status">Lokalen Quellenstand lesen …</p>
      ) : query.error ? (
        <p role="alert">{message(query.error)}</p>
      ) : picture ? (
        <>
          <PublicChart
            picture={picture}
            metric={metric}
            numbers={showNumbers}
            axis={
              commonAxis
                ? {
                    ...commonAxis,
                    min: sameScale ? commonAxis.min : picture.min,
                    max: sameScale ? commonAxis.max : picture.max,
                  }
                : undefined
            }
          />
          <p className="atlas-comparison-note">
            {geography.label} ·{" "}
            {projection
              ? `Projektionsmodell · Ausgabe ${source.publishedAt}`
              : periodSnapshot
                ? `${source.firstPeriod}–${source.lastPeriod} · zusammengefasst`
                : `${picture.points[0].period} bis ${picture.points[picture.points.length - 1].period}`}
            {showNumbers && !regime
              ? ` · ${projection ? "Modellwert" : periodSnapshot ? "Zeitraumwert" : "Letzter Wert"}: ${fmt(picture.points[picture.points.length - 1].n, metric)} ${metric.unit}`
              : ""}
          </p>
        </>
      ) : selfPartner ? (
        <div className="atlas-empty">
          <h3>Das eigene Land ist kein Auslandspartner.</h3>
          <p>
            Wähle einen anderen Exportpartner oder einen der Absatzmärkte oben.
          </p>
        </div>
      ) : !mapped ? (
        <div className="atlas-empty">
          <h3>
            Diese Quellenreihe enthält kein eigenes Bild für {geography.label}.
          </h3>
          <p>Die verfügbaren Länder bleiben einzeln auswählbar.</p>
          <label>
            Verfügbares Quellengebiet
            <select
              aria-label="Verfügbares Quellengebiet"
              value=""
              onChange={(e) => {
                if (e.target.value) onAreaChange(e.target.value);
              }}
            >
              <option value="">Land auswählen …</option>
              {availableAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : data?.status === "not_downloaded" ||
        data?.status === "desktop_required" ? (
        <div className="atlas-empty">
          <h3>Die Quellenwerte sind noch nicht lokal geladen.</h3>
          <p>
            Der Abruf speichert den geprüften Quellenstand für alle enthaltenen
            Länder.
          </p>
        </div>
      ) : (
        <p>
          Keine eigenen Beobachtungen im gewählten Zeitraum. Die Perspektive
          bleibt ausgewählt.
        </p>
      )}
      <p className="atlas-comparison-note">
        {source.id === "eu-advanced-materials"
          ? "Patentfamilien mit Unternehmensanmeldern im gesamten Zeitraum 2010–2024. Gebiet bedeutet erstes Patentamt, nicht Unternehmenssitz. EU-Patentämter und EPA bilden ein eigenes Quellengebiet; Sektoren können sich überschneiden."
          : source.id === "sasol-synthetic-fuels"
            ? "Fossile Synthese aus Kohle und Erdgas in einzelnen Anlagen. Ein Jahr endet am 30. Juni. Betreiberberichte für Secunda beziehungsweise ORYX; keine nationalen Gesamtmengen und keine erneuerbaren E-Fuels. Historisches White Product bleibt von Total Refined getrennt."
            : source.id === "ndgain-climate"
              ? projection
                ? "Fester Vergleich künftiger Klimaexposition. Die Teilmodelle reichen von 2030 bis zum Jahrhundertende; höher bedeutet stärkere Exposition."
                : "Veröffentlichte Modellschätzungen. Fehlende Eingangsjahre können vom Anbieter interpoliert oder fortgeschrieben sein."
              : commercial
                ? "Originale Preisbasis und Gebietsabgrenzung. Landes- und Stadtbilder behalten ihren eigenen Maßstab; Preisniveaus werden nicht zu einem Länderranking verbunden."
                : source.id === "eia-battery-storage"
                  ? "Stationäre US-Großbatterien an Standorten ab 1 MW. Endgültige Quellenwerte bis 2023; Bestand, jährlicher Zubau und Dauer neuer Anlagen bleiben getrennte Perspektiven."
                  : source.id === "epo-quantum-sensing"
                    ? "Archivstudie 2019 zur Quantensensorik, Quellenjahre 2000–2017. Prioritätsanmeldungen zählen nach Patentzuständigkeit; sie zeigen keine Herkunft der Erfinder."
                    : source.id === "epo-cosmonautics"
                      ? "Archivstudie 2021 zur Raumfahrt, Quellenjahre 1990–2017. Patentfamilien, einzelne Anmeldungen, Herkunft und Schutzgebiet bleiben getrennte Perspektiven."
                      : source.id === "worldbank-gfdd-concentration"
                        ? "GFDD-Archiv 2022, Quellenjahre 1998–2020. Niedrigerer Anteil außerhalb der Top 10 bedeutet stärkere Konzentration. Börsenmarktwert und Handelsaktivität bleiben getrennt."
                        : source.id === "aci-trilemma"
                          ? "Drei getrennte Forschungsdimensionen auf der Skala 0–1, Ausgabe 2021. Höher bedeutet je nach Perspektive stabilere Wechselkurse, größere geldpolitische Unabhängigkeit oder offeneren Kapitalverkehr."
                          : regime
                            ? "Historische Wechselkursordnungen 1870–2020. Weite und strenge Bindung bleiben getrennt. Die Klassen messen keine Qualität der Geldordnung; aus einer Bindung wird keine Golddeckung abgeleitet."
                            : metric.scopeNote}
      </p>
      {picture && picture.missingPeriods.length > 0 && (
        <p className="atlas-comparison-note">
          {regime
            ? "Ohne Quellenklassifikation:"
            : "Ohne veröffentlichten Zahlenwert:"}{" "}
          {picture.missingPeriods.length <= 12
            ? picture.missingPeriods.join(", ")
            : `${picture.missingPeriods[0]} bis ${picture.missingPeriods[picture.missingPeriods.length - 1]}: mehrere fehlende Beobachtungen`}
          . Diese Lücken werden nicht ersetzt.
        </p>
      )}
      {commercial &&
        [...(picture?.points ?? []), ...(comparePicture?.points ?? [])].some(
          (p) => p.status === "Vorläufiger Quellenwert (P)",
        ) && (
          <p className="atlas-comparison-note">
            Hohle Punkte: vorläufige Quellenwerte.
          </p>
        )}
      {commercial &&
        compareId &&
        compareSelection &&
        compareSelection.metrics.length > 0 && (
          <label className="atlas-public-compare-choice">
            Vergleichsreihe · {comparison.data?.geography.label}
            <select
              aria-label="Gewerbeimmobilienreihe des Vergleichslands"
              value={compareMetric?.id ?? ""}
              onChange={(e) =>
                navigate({ publicCompareMetric: e.target.value })
              }
            >
              {!compareMetric && (
                <option value="">
                  Passende Gebäudeart fehlt · andere Reihe wählen …
                </option>
              )}
              {compareSelection.metrics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
      {compareId && comparePicture && compareMetric && picture && (
        <div className="atlas-public-comparison">
          <p>
            {comparison.data!.geography.label} ·{" "}
            {sameScale
              ? regime
                ? "Gleicher Kalender und gleiche Quellenregel"
                : projection
                  ? "Gleiches Projektionsmodell und gleicher Maßstab"
                  : periodSnapshot
                    ? "Gleicher Zeitraum und gleicher Maßstab"
                    : "Gleicher Kalender und gleicher Maßstab"
              : "Gleicher Kalender; eigener Maßstab für die Landesgeschichte"}
          </p>
          {commercial && (
            <p>
              {compareMetric.label} · {compareMetric.unit} ·{" "}
              {comparePicture.points[0].period} bis{" "}
              {comparePicture.points[comparePicture.points.length - 1].period}
            </p>
          )}
          <PublicChart
            picture={comparePicture}
            metric={compareMetric}
            numbers={showNumbers}
            axis={
              commonAxis
                ? {
                    ...commonAxis,
                    min: sameScale ? commonAxis.min : comparePicture.min,
                    max: sameScale ? commonAxis.max : comparePicture.max,
                  }
                : undefined
            }
          />
          {commercial && (
            <details className="atlas-method">
              <summary>Quelle und Bedeutung des Vergleichsbilds</summary>
              <p>{compareMetric.scopeNote}</p>
            </details>
          )}
        </div>
      )}
      {compareId && !comparePicture && (
        <p className="atlas-comparison-note">
          {comparison.isPending
            ? "Vergleichsland wird gelesen …"
            : comparison.error
              ? message(comparison.error)
              : "Für das Vergleichsland fehlen eigene Werte dieser Perspektive und dieses Quellenstands im gewählten Zeitraum."}
        </p>
      )}
      {picture && comparePicture && (
        <p className="atlas-comparison-note">
          {regime
            ? "Beide Länderbilder verwenden dieselbe Bindungsdefinition. Modellrollen und Bezugsbasen bleiben in den Jahresangaben sichtbar."
            : metric.comparison === "within_country"
              ? commercial
                ? "Beide Originalreihen behalten ihre eigene Preisbasis und Skala. Die Indexstände und Preisniveaus sind nicht direkt vergleichbar."
                : "Die absoluten Niveaus sind zwischen Ländern nur eingeschränkt vergleichbar."
              : "Beide Länderbilder verwenden dieselbe Definition, Einheit und Skala."}
        </p>
      )}
      <div className="atlas-source-actions">
        <Button
          variant="default"
          disabled={
            !isTauri() ||
            Boolean(fresh) ||
            sync.isPending ||
            job?.status === "running"
          }
          onClick={() => sync.mutate()}
        >
          {sync.isPending ||
          (job?.status === "running" && job.seriesId === `public:${source.id}`)
            ? "Quellenwerte werden geladen …"
            : "Quellenwerte laden"}
        </Button>
        <span>{source.label} · öffentlich · lokal gespeichert</span>
      </div>
      {data?.provenance && (
        <p className="atlas-comparison-note">
          Quellenveröffentlichung: {source.publishedAt} ·{" "}
          {projection
            ? "Zeitlich konstantes Projektionsmodell"
            : periodSnapshot
              ? `Zusammengefasster Zeitraum ${source.firstPeriod}–${source.lastPeriod}`
              : source.id === "sasol-synthetic-fuels"
                ? `Berichtspaket bis Geschäftsjahr ${source.lastPeriod}; einzelne Perspektiven enden früher`
                : `${source.id === "ndgain-climate" ? "Modellreihe" : "Beobachtungen"} bis ${source.lastPeriod}`}{" "}
          · Lokal geladen:{" "}
          {new Date(data.provenance.retrievedAt).toLocaleDateString("de")}
        </p>
      )}
      {!isTauri() && (
        <p>Der echte Datenabruf steht in der Desktop-App zur Verfügung.</p>
      )}
      {sync.error && <p role="alert">{message(sync.error)}</p>}
      {job?.seriesId === `public:${source.id}` && job.status === "failed" && (
        <p role="alert">{job.message}</p>
      )}
      <details className="atlas-method">
        <summary>Quelle und Bedeutung</summary>
        <p>{metric.scopeNote}</p>
        {(source.id.startsWith("eurostat-") ||
          source.id.startsWith("bgs-") ||
          commercial ||
          source.id === "wits-export-concentration") &&
          data?.profiles
            .find((profile) => profile.metricId === metric.id)
            ?.points.some((point) => point.value === null && point.status) && (
            <details>
              <summary>Quellenkennzeichen zu fehlenden Werten</summary>
              <ul>
                {data.profiles
                  .find((profile) => profile.metricId === metric.id)
                  ?.points.filter(
                    (point) => point.value === null && point.status,
                  )
                  .map((point) => (
                    <li key={point.period}>
                      {point.period} · kein Zahlenwert · {point.status}
                      {point.notes.length
                        ? ` · ${point.notes.join(" · ")}`
                        : ""}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        <p>
          Quellengebiet: {area?.label ?? "nicht enthalten"}.
          Veröffentlichungsstand {source.publishedAt}; Quellenprüfung{" "}
          {source.reviewedAt}. Der feste Stand bleibt bis zur Prüfung einer
          neueren Veröffentlichung erhalten.
        </p>
        <a
          href={source.documentationUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            if (isTauri()) {
              e.preventDefault();
              void openUrl(source.documentationUrl).catch(() =>
                setLinkError(true),
              );
            }
          }}
        >
          Originalquelle und Methodik
        </a>
        {linkError && (
          <p role="alert">Der Quellenlink konnte nicht geöffnet werden.</p>
        )}
      </details>
    </section>
  );
}
