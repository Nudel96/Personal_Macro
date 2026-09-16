import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  CircleHelp,
  Database,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { api } from "../../services/commands";
import { atlasCatalog } from "./atlas-catalog";
import { atlasMarketProxies } from "./atlas-markets";
import { atlasPublicCatalog } from "./atlas-public";
import { cycleHypothesis } from "./atlas-cycle-hypotheses";
import { atlasContextGuide } from "./atlas-context-guides";
import { valuationCountryScopes } from "./atlas-valuation";
import {
  atlasCoverageMapping,
  coverageAlternatives,
  coverageFamilies,
  coverageFamilyTarget,
  coverageLabels,
  coverageMapped,
  coverageOptions,
  coverageTone,
  coverageTopicStatus,
  type CoverageStatus,
} from "./atlas-coverage";
import type { AtlasGeography } from "./atlas-types";

function Status({ value }: { value: CoverageStatus }) {
  const tone = coverageTone(value);
  const Icon =
    tone === "ready"
      ? CheckCircle2
      : tone === "pending"
        ? CircleDashed
        : tone === "unbound"
          ? CircleHelp
          : TriangleAlert;
  return (
    <span className={`atlas-coverage-status is-${tone}`}>
      <Icon size={14} aria-hidden="true" />
      {coverageLabels[value]}
    </span>
  );
}
export function AtlasCoveragePanel({
  geography,
  showNumbers,
  onNumbersChange,
  filters,
  onNavigate,
}: {
  geography: AtlasGeography;
  showNumbers: boolean;
  onNumbersChange: (value: boolean) => void;
  filters: {
    domain: string | null;
    search: string | null;
    status: string | null;
  };
  onNavigate: (values: Record<string, string>) => void;
}) {
  const catalog = atlasCatalog;
  const client = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const publicQueries = useQueries({
    queries: atlasPublicCatalog.sources.map((source) => ({
      queryKey: ["atlas", "public", source.id, geography.id],
      queryFn: () => api.atlasPublicSource(source.id, geography.id),
    })),
  });
  const series = useQueries({
    queries: catalog.series.map((def) => ({
      queryKey: ["atlas", "series", def.id, geography.id],
      queryFn: () =>
        api.atlasSeries({ seriesId: def.id, geographyId: geography.id }),
    })),
  });
  const demography = useQuery({
    queryKey: ["atlas", "demography", geography.id],
    queryFn: () => api.atlasDemography(geography.id),
  });
  const history = useQuery({
    queryKey: ["atlas", "history", geography.id],
    queryFn: () => api.atlasHistory(geography.id),
  });
  const energy = useQuery({
    queryKey: ["atlas", "energy", geography.id],
    queryFn: () => api.atlasEnergy(geography.id),
  });
  const housingRatios = useQuery({
    queryKey: ["atlas", "housingRatios", geography.id],
    queryFn: () => api.atlasHousingRatios(geography.id),
  });
  const education = useQuery({
    queryKey: ["atlas", "education", geography.id],
    queryFn: () => api.atlasEducation(geography.id),
  });
  const agriculture = useQuery({
    queryKey: ["atlas", "agriculture", geography.id],
    queryFn: () => api.atlasAgriculture(geography.id),
  });
  const commodities = useQuery({
    queryKey: ["atlas", "commodities"],
    queryFn: () => api.atlasCommodities(),
  });
  const findex = useQuery({
    queryKey: ["atlas", "findex", geography.id],
    queryFn: () => api.atlasFindex(geography.id),
  });
  const labor = useQuery({
    queryKey: ["atlas", "labor", geography.id],
    queryFn: () => api.atlasLabor(geography.id),
  });
  const innovation = useQuery({
    queryKey: ["atlas", "innovation", geography.id],
    queryFn: () => api.atlasInnovation(geography.id),
  });
  const health = useQuery({
    queryKey: ["atlas", "health", geography.id],
    queryFn: () => api.atlasHealth(geography.id),
  });
  const fiscal = useQuery({
    queryKey: ["atlas", "fiscal", geography.id],
    queryFn: () => api.atlasFiscal(geography.id),
  });
  const debt = useQuery({
    queryKey: ["atlas", "debt", geography.id],
    queryFn: () => api.atlasDebt(geography.id),
  });
  const households = useQuery({
    queryKey: ["atlas", "households", geography.id],
    queryFn: () => api.atlasHouseholds(geography.id),
  });
  const macrohistory = useQuery({
    queryKey: ["atlas", "macrohistory", geography.id],
    queryFn: () => api.atlasMacrohistory(geography.id),
  });
  const property = useQuery({
    queryKey: ["atlas", "property", geography.id],
    queryFn: () => api.atlasProperty(geography.id),
  });
  const credit = useQuery({
    queryKey: ["atlas", "credit", geography.id],
    queryFn: () => api.atlasCredit(geography.id),
  });
  const capacity = useQuery({
    queryKey: ["atlas", "capacity", geography.id],
    queryFn: () => api.atlasCapacity(geography.id),
  });
  const valuation = useQuery({
    queryKey: ["atlas", "valuation", "countries"],
    queryFn: () => api.atlasValuation("countries"),
  });
  const valuationScope = valuationCountryScopes[geography.id];
  const valuationIndustries = useQuery({
    queryKey: ["atlas", "valuation", `pbv-${valuationScope}`],
    queryFn: () => api.atlasValuation(`pbv-${valuationScope}`),
    enabled: Boolean(valuationScope),
  });
  const proxies = atlasMarketProxies.filter(
    (p) =>
      p.geographyId === geography.id ||
      ["SPY.US", "ACWI.US"].includes(p.symbol),
  );
  const markets = useQueries({
    queries: proxies.map((proxy) => ({
      queryKey: ["atlas", "market", proxy.id],
      queryFn: () => api.atlasMarket(proxy.id),
    })),
  });
  const options = coverageOptions(geography.id, {
    publicSources: Object.fromEntries(
      atlasPublicCatalog.sources.map((source, i) => [
        source.id,
        publicQueries[i],
      ]),
    ),
    series: Object.fromEntries(
      catalog.series.map((def, index) => [def.id, series[index]]),
    ),
    demography,
    history,
    energy,
    capacity,
    credit,
    housingRatios,
    education,
    agriculture,
    property,
    commodities,
    findex,
    labor,
    innovation,
    health,
    fiscal,
    debt,
    households,
    macrohistory,
    valuation,
    valuationIndustries,
    markets: Object.fromEntries(
      proxies.map((proxy, index) => [proxy.id, markets[index]]),
    ),
  });
  const domain = catalog.domains.some((d) => d.id === filters.domain)
    ? filters.domain!
    : "all";
  const search = filters.search?.trim().toLocaleLowerCase("de") ?? "";
  const selectedStatus =
    filters.status === "available" || filters.status === "attention"
      ? filters.status
      : "all";
  const topics = catalog.topics.map((topic) => {
    const choices = options.filter((option) => option.topicId === topic.id);
    return { ...topic, choices, status: coverageTopicStatus(choices) };
  });
  const groups = catalog.groups
    .filter((group) => domain === "all" || group.domainId === domain)
    .map((group) => ({
      ...group,
      topics: topics
        .filter((topic) => topic.groupId === group.id)
        .flatMap((topic) => {
          const topicMatches = `${topic.label} ${group.label}`
            .toLocaleLowerCase("de")
            .includes(search);
          const choices = topicMatches
            ? topic.choices
            : topic.choices.filter((choice) =>
                choice.label.toLocaleLowerCase("de").includes(search),
              );
          if (!topicMatches && !choices.length) return [];
          const status = coverageTopicStatus(choices);
          if (selectedStatus === "available" && status !== "available")
            return [];
          if (
            selectedStatus === "attention" &&
            ["available", "checking"].includes(status)
          )
            return [];
          return [{ ...topic, choices, status }];
        }),
    }))
    .filter((group) => group.topics.length);
  const errors = [
    ...publicQueries,
    debt,
    ...series,
    demography,
    history,
    energy,
    capacity,
    credit,
    property,
    housingRatios,
    valuation,
    valuationIndustries,
    ...markets,
    commodities,
    findex,
    labor,
    innovation,
    health,
    fiscal,
    households,
    macrohistory,
    agriculture,
    education,
  ].some((query) => query.error);
  const issues = atlasCoverageMapping.issues.filter((issue) =>
    issue.geographyIds.includes(geography.id),
  );
  return (
    <section className="atlas-coverage" aria-labelledby="atlas-coverage-title">
      <div className="atlas-overview-heading">
        <div>
          <span className="atlas-kind">Daten & Quellen</span>
          <h2 id="atlas-coverage-title">
            Welche Bilder gibt es für {geography.label}?
          </h2>
        </div>
        <label className="atlas-numbers">
          <input
            type="checkbox"
            checked={showNumbers}
            onChange={(e) => onNumbersChange(e.target.checked)}
          />{" "}
          Zahlen anzeigen
        </label>
      </div>
      <p className="atlas-explanation">
        Hier siehst du den lokalen Stand und die geprüften Gebietszuordnungen.
        Ein vorhandenes Bild kann Lücken oder ältere Daten enthalten. Das Öffnen
        dieser Übersicht lädt keine Daten aus dem Internet.
      </p>
      {issues.map((issue) => (
        <p key={issue.providerId} className="atlas-notice">
          {issue.reason}
        </p>
      ))}
      <div className="atlas-coverage-families">
        {coverageFamilies.map((family) => {
          const own = options.filter(
            (o) => o.family === family.id && o.status !== "elsewhere",
          );
          const mapped =
            coverageMapped(family.id, geography.id) ||
            own.some((o) => o.status === "available");
          const state = mapped ? coverageTopicStatus(own) : "unsupported_area";
          const alternatives = !mapped
            ? coverageAlternatives(family.id, geography.id)
            : [];
          return (
            <article className="atlas-coverage-family" key={family.id}>
              <h3>
                <Database size={17} aria-hidden="true" />
                {family.label}
              </h3>
              <Status value={state} />
              <p>{family.description}</p>
              {mapped ? (
                <Button
                  size="sm"
                  onClick={() =>
                    onNavigate(coverageFamilyTarget(family.id, geography.id))
                  }
                >
                  Bilder öffnen <ArrowUpRight size={14} aria-hidden="true" />
                </Button>
              ) : (
                <p className="atlas-wave-card-meta">
                  Dieses Gebiet wird in der geprüften Quellenzuordnung nicht als
                  eigenes Profil geführt.
                </p>
              )}
              {alternatives.length > 0 && (
                <details className="atlas-coverage-alternatives">
                  <summary>Andere Quellengebiete ansehen</summary>
                  <p>
                    Die folgenden Gebiete haben eine andere Abgrenzung. Deine
                    Auswahl wechselt erst durch einen Klick.
                  </p>
                  {alternatives.map((area) => (
                    <button
                      type="button"
                      key={area.id}
                      onClick={() =>
                        onNavigate({
                          ...coverageFamilyTarget(family.id, area.id),
                          compare: "",
                        })
                      }
                    >
                      {area.label} <ArrowUpRight size={12} aria-hidden="true" />
                    </button>
                  ))}
                </details>
              )}
            </article>
          );
        })}
      </div>
      <p className="atlas-wave-card-meta">
        Gebietszuordnungen geprüft am{" "}
        {new Date(
          atlasCoverageMapping.verifiedAt.includes("T")
            ? atlasCoverageMapping.verifiedAt
            : `${atlasCoverageMapping.verifiedAt}T12:00:00`,
        ).toLocaleDateString("de")}
        . Quellenregionen bleiben getrennt: Eine UN-Region wird beispielsweise
        nicht als Ember-Region verwendet. Die Zuordnung allein bestätigt keine
        vollständige Datenreihe.
      </p>
      {errors && (
        <div className="atlas-notice" role="alert">
          Einzelne lokale Daten konnten nicht gelesen werden. Bereits lesbare
          Bilder bleiben erreichbar.{" "}
          <Button
            size="sm"
            onClick={() =>
              void client.invalidateQueries({
                queryKey: ["atlas"],
                predicate: (query) =>
                  !["catalog", "job"].includes(String(query.queryKey[1])),
              })
            }
          >
            Lokalen Stand erneut prüfen
          </Button>
        </div>
      )}
      <div className="atlas-coverage-controls">
        <label>
          Themenfeld
          <select
            className="input"
            aria-label="Themenfeld der Datenabdeckung"
            value={domain}
            onChange={(e) => onNavigate({ coverageDomain: e.target.value })}
          >
            <option value="all">Alle Themenfelder</option>
            {catalog.domains.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Anzeige
          <select
            className="input"
            aria-label="Datenstatus eingrenzen"
            value={selectedStatus}
            onChange={(e) => onNavigate({ coverageStatus: e.target.value })}
          >
            <option value="all">Alle Themen</option>
            <option value="available">Bilder lokal vorhanden</option>
            <option value="attention">
              Fehlende Daten und Einschränkungen
            </option>
          </select>
        </label>
        <label className="atlas-search">
          <Search size={16} aria-hidden="true" />
          <input
            className="input"
            aria-label="Thema in der Datenabdeckung suchen"
            value={filters.search ?? ""}
            placeholder="Thema suchen …"
            onChange={(e) => onNavigate({ coverageSearch: e.target.value })}
          />
        </label>
      </div>
      <div
        className="atlas-coverage-legend"
        aria-label="Bedeutung der Abdeckungsfarben"
      >
        <span>
          <i className="is-ready" />
          Bild lokal
        </span>
        <span>
          <i className="is-pending" />
          Prüfen / laden
        </span>
        <span>
          <i className="is-limited" />
          Eingeschränkt
        </span>
        <span>
          <i className="is-unbound" />
          Noch nicht angebunden
        </span>
      </div>
      <div className="atlas-coverage-groups">
        {groups.map((group) => {
          const counts = { ready: 0, pending: 0, limited: 0, unbound: 0 };
          group.topics.forEach((topic) => counts[coverageTone(topic.status)]++);
          return (
            <details
              className="atlas-coverage-group"
              key={group.id}
              open={Boolean(search) || Boolean(expanded[group.id])}
              onToggle={(event) => {
                if (search || event.target !== event.currentTarget) return;
                const open = event.currentTarget.open;
                setExpanded((previous) =>
                  previous[group.id] === open
                    ? previous
                    : { ...previous, [group.id]: open },
                );
              }}
            >
              <summary>
                <span className="atlas-coverage-group-heading">
                  <strong>{group.label}</strong>
                  <small>
                    {
                      catalog.domains.find((d) => d.id === group.domainId)
                        ?.label
                    }
                    {showNumbers
                      ? ` · ${counts.ready} von ${group.topics.length} Themen mit lokalem Bild`
                      : ""}
                  </small>
                </span>
                <span
                  className="atlas-coverage-bar"
                  role="img"
                  aria-label={`${group.label}: ${counts.ready} Themen mit lokalem Bild, ${counts.pending} zum Prüfen oder Laden, ${counts.limited} eingeschränkt, ${counts.unbound} noch nicht angebunden`}
                >
                  {Object.entries(counts)
                    .filter(([, count]) => count > 0)
                    .map(([tone, count]) => (
                      <i
                        key={tone}
                        className={`is-${tone}`}
                        style={{ flex: count }}
                      />
                    ))}
                </span>
                <ChevronDown
                  size={16}
                  className="atlas-coverage-chevron"
                  aria-hidden="true"
                />
              </summary>
              {(search || expanded[group.id]) && (
                <div className="atlas-coverage-topic-list">
                  {group.topics.map((topic) => (
                    <section
                      className="atlas-coverage-topic"
                      key={topic.id}
                      aria-label={topic.label}
                    >
                      <h4>{topic.label}</h4>
                      {topic.choices.length ? (
                        topic.choices.map((option) => (
                          <button
                            type="button"
                            className="atlas-coverage-choice"
                            key={option.id}
                            onClick={() => onNavigate(option.target)}
                            aria-label={`${option.label}. ${topic.label}. ${coverageLabels[option.status]}. Perspektive öffnen.`}
                          >
                            <span className="atlas-coverage-choice-title">
                              {option.label}
                              <ArrowUpRight size={14} aria-hidden="true" />
                            </span>
                            <Status value={option.status} />
                            {option.status === "available" && (
                              <span className="atlas-wave-card-meta">
                                {option.periodNote ?? (
                                  <>
                                    Daten {Math.min(...option.years)}–
                                    {Math.max(...option.years)}
                                    {option.family !== "demography" &&
                                    Math.max(...option.years) <
                                      new Date().getFullYear() - 3
                                      ? " · älterer Stand"
                                      : ""}
                                  </>
                                )}
                                {showNumbers && !option.periodNote
                                  ? ` · ${option.years.length} Jahre mit Werten`
                                  : ""}
                              </span>
                            )}
                            {option.note && (
                              <span className="atlas-wave-card-meta">
                                {option.note}
                              </span>
                            )}
                          </button>
                        ))
                      ) : (
                        <>
                          <Status value="unbound" />
                          {atlasContextGuide(topic.id) ? (
                            <>
                              <p className="atlas-wave-card-meta">
                                {atlasContextGuide(topic.id)?.research
                                  ?.finding ??
                                  "Ein Themen-Einstieg verbindet vorhandene Datenperspektiven. Eine eigene zusammengefasste Zeitreihe oder Phasenmessung ist nicht angebunden."}
                              </p>
                              <button
                                type="button"
                                className="atlas-coverage-theory-link"
                                onClick={() =>
                                  onNavigate({
                                    view: "",
                                    topic: topic.id,
                                    fromGuide: "",
                                  })
                                }
                              >
                                Themen-Einstieg öffnen · {topic.label}
                              </button>
                            </>
                          ) : cycleHypothesis(topic.id) ? (
                            <>
                              <p className="atlas-wave-card-meta">
                                Eine belegte Theorieansicht ist vorhanden. Sie
                                enthält ein Modellbild; eine gemessene
                                Zyklusreihe ist nicht angebunden.
                              </p>
                              <button
                                type="button"
                                className="atlas-coverage-theory-link"
                                onClick={() =>
                                  onNavigate({
                                    view: "",
                                    topic: topic.id,
                                    hypothesis: "",
                                    fromCycle: "",
                                  })
                                }
                              >
                                Theoriemodell öffnen · {topic.label}
                              </button>
                            </>
                          ) : (
                            <p className="atlas-wave-card-meta">
                              Das Thema gehört zum Katalog. Eine passende Quelle
                              und Darstellung sind noch nicht implementiert.
                            </p>
                          )}
                        </>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </details>
          );
        })}
      </div>
      {!groups.length && (
        <p className="atlas-notice" role="status">
          Für diese Filter sind keine Themen vorhanden.
        </p>
      )}
    </section>
  );
}
