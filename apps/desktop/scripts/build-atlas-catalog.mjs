import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { format, resolveConfig } from "prettier";
import console from "node:console";

const planning = new URL(
  "../../../docs/planning/world-atlas/catalogs/",
  import.meta.url,
);
const read = async (name) =>
  JSON.parse(await readFile(new URL(name, planning), "utf8"));
const [topics, geography, sources, seed] = await Promise.all([
  read("topics.json"),
  read("geographies.json"),
  read("sources.json"),
  read("series-seed.json"),
]);
const names = new Intl.DisplayNames(["de"], { type: "region" });
const statistics = JSON.parse(
  await readFile(
    new URL(
      "../src/features/world-atlas/data/statistics-catalog.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const energy = JSON.parse(
  await readFile(
    new URL(
      "../src/features/world-atlas/data/energy-catalog.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const regions = [
  ["world", "Welt"],
  ["Europe", "Europa"],
  ["Americas", "Amerika"],
  ["Asia", "Asien"],
  ["Africa", "Afrika"],
  ["Oceania", "Ozeanien"],
  ["Unassigned", "Weitere Gebiete"],
].map(([id, label]) => ({ id, label }));
const sdg = JSON.parse(
  await readFile(
    new URL(
      "../src/features/world-atlas/data/sdg-catalog.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const africa = JSON.parse(
  await readFile(
    new URL(
      "../src/features/world-atlas/data/africa-development-catalog.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const catalog = {
  version: "2026-09-15.1",
  geographySource: geography.source,
  regions,
  geographies: [
    ...africa.regions.map(({ geographyId, label }) => ({
      id: geographyId,
      label,
      iso3: "",
      regionId: "Africa",
      kind: "aggregate",
    })),
    ...JSON.parse(
      await readFile(
        new URL(
          "../src/features/world-atlas/data/public-geographies.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    ...JSON.parse(
      await readFile(
        new URL(
          "../src/features/world-atlas/data/findex-catalog.json",
          import.meta.url,
        ),
        "utf8",
      ),
    )
      .areas.filter((area) => area.geographyId.startsWith("findex:"))
      .map((area) => ({
        id: area.geographyId,
        label: area.title,
        regionId: area.regionId,
        iso3: "",
        kind: "aggregate",
      })),
    {
      id: "ilo:africa",
      label: "Afrika · ILO-Modellregion",
      iso3: "",
      regionId: "Africa",
      kind: "aggregate",
    },
    ...JSON.parse(
      await readFile(
        new URL(
          "../src/features/world-atlas/data/debt-catalog.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ).regions.map(({ geographyId, title, regionId }) => ({
      id: geographyId,
      label: title,
      regionId,
      iso3: "",
      kind: "aggregate",
    })),
    ...JSON.parse(
      await readFile(
        new URL(
          "../src/features/world-atlas/data/agriculture-catalog.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ).regions.map(({ geographyId, title, regionId }) => ({
      id: geographyId,
      label: title,
      regionId,
      iso3: "",
      kind: "aggregate",
    })),
    ...JSON.parse(
      await readFile(
        new URL(
          "../src/features/world-atlas/data/education-catalog.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ).regions.map(({ geographyId, title, regionId }) => ({
      id: geographyId,
      label: title,
      regionId,
      iso3: "",
      kind: "aggregate",
    })),
    ...JSON.parse(
      await readFile(
        new URL(
          "../src/features/world-atlas/data/housing-ratios-catalog.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ).regions.map(({ geographyId, title, regionId }) => ({
      id: geographyId,
      label: title,
      regionId,
      iso3: "",
      kind: "aggregate",
    })),
    ...[
      ["bis:property_world", "Welt · BIS-Immobiliengruppe"],
      [
        "bis:advanced_economies",
        "Fortgeschrittene Volkswirtschaften · BIS-Gruppe",
      ],
      ["bis:emerging_economies", "Schwellenländer · BIS-Gruppe"],
    ].map(([id, label]) => ({
      id,
      label,
      regionId: "world",
      iso3: "",
      kind: "aggregate",
    })),
    {
      id: "bis:euro_area",
      label: "Euroraum · BIS-Region",
      regionId: "Europe",
      iso3: "",
      kind: "aggregate",
    },
    {
      id: "bis:cpp_euro_area20",
      label: "Euroraum · BIS-Gewerbeimmobilien (20 Länder)",
      regionId: "Europe",
      iso3: "",
      kind: "aggregate",
    },
    ...JSON.parse(
      await readFile(
        new URL(
          "../src/features/world-atlas/data/capacity-catalog.json",
          import.meta.url,
        ),
        "utf8",
      ),
    )
      .regions.filter((area) => area.id !== "world")
      .map(({ id, label, regionId }) => ({
        id,
        label,
        regionId,
        iso3: "",
        kind: "aggregate",
      })),
    ...energy.regions.map(({ id, label, regionId }) => ({
      id,
      label,
      regionId,
      iso3: "",
      kind: "aggregate",
    })),
    {
      id: "world",
      label: "Welt",
      iso3: "WLD",
      regionId: "world",
      kind: "aggregate",
    },
    ...[
      ["903", "Afrika", "Africa"],
      ["935", "Asien", "Asia"],
      ["908", "Europa", "Europe"],
      ["5505", "Amerika", "Americas"],
      ["909", "Ozeanien", "Oceania"],
    ].map(([code, label, regionId]) => ({
      id: `un-wpp:${code}`,
      label: `${label} · UN-Region`,
      // UN aggregate IDs are not ISO country codes.
      iso3: "",
      regionId,
      kind: "aggregate",
    })),
    ...[
      ["east_asia", "Ostasien", "Asia"],
      ["eastern_europe", "Osteuropa", "Europe"],
      ["latin_america", "Lateinamerika", "Americas"],
      ["mena", "Nahost und Nordafrika", "world"],
      ["south_southeast_asia", "Süd- und Südostasien", "Asia"],
      ["sub_saharan_africa", "Afrika südlich der Sahara", "Africa"],
      ["western_europe", "Westeuropa", "Europe"],
      ["western_offshoots", "USA, Kanada, Australien und Neuseeland", "world"],
    ].map(([key, label, regionId]) => ({
      id: `maddison:${key}`,
      label: `${label} · Maddison-Region`,
      iso3: "",
      regionId,
      kind: "aggregate",
    })),
    ...geography.areas.map((area) => ({
      id: area.id,
      label: names.of(area.iso2) || area.nameEn,
      iso3: area.iso3,
      regionId: area.regionNameEn || "Unassigned",
      kind: "area",
    })),
    // Separate provider identities; these do not claim UN M49 membership.
    {
      id: "provider:TWN",
      label: "Taiwan",
      iso3: "TWN",
      regionId: "Asia",
      kind: "provider_area",
    },
    {
      id: "provider:XKX",
      label: "Kosovo",
      iso3: "XKX",
      regionId: "Europe",
      kind: "provider_area",
    },
  ],
  domains: topics.domains.map(({ id, labelDe, icon }) => ({
    id,
    label: labelDe,
    icon,
  })),
  groups: topics.groups.map(({ id, domainId, labelDe, sourceCandidates }) => ({
    id,
    domainId,
    label: labelDe,
    sourceIds: sourceCandidates,
  })),
  topics: topics.groups.flatMap((group) =>
    group.topics.map(([id, label]) => ({
      id: `${group.id}:${id}`,
      groupId: group.id,
      label,
    })),
  ),
  sources: sources.sources.map(({ id, label, url, limits }) => ({
    id,
    label,
    url,
    limits,
  })),
  series: [
    ...seed.series.map((series) => ({
      id: series.id,
      topicId: series.topicId,
      sourceId: series.sourceId,
      providerCode: series.providerIndicatorId,
      label: series.labelDe,
      providerLabel: series.providerLabel,
      unit: series.canonicalUnit,
      observationKind: series.observationKind,
    })),
    ...statistics.series,
    ...sdg.series.map(
      ({
        id,
        topicId,
        sourceId,
        providerCode,
        label,
        providerLabel,
        unit,
        observationKind,
        throughYear,
        explanation,
        scopeNote,
      }) => ({
        id,
        topicId,
        sourceId,
        providerCode,
        label,
        providerLabel,
        unit,
        observationKind,
        throughYear,
        explanation,
        scopeNote,
      }),
    ),
    ...africa.series,
  ],
};
catalog.topics.push(...africa.topics);
const marketProxies = JSON.parse(
  await readFile(
    new URL(
      "../src/features/world-atlas/data/market-proxies.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
catalog.sources.push({
  id: "unsdg",
  label: "UN · Global SDG Database",
  url: "https://unstats.un.org/sdgs/dataportal",
  limits:
    "Amtliche Quellenstatistiken mit Schätzungen, Erhebungsdaten und eigenen Länderabgrenzungen. Untergruppen und Veröffentlichungsstand bleiben getrennt.",
});
catalog.sources.push({
  id: "imf_fiscal",
  label: "IMF · Public Finances in Modern History",
  url: "https://www.imf.org/external/datamapper/datasets/FPP",
  limits:
    "Historische Rekonstruktionen für 151 Länder und Gebiete bis 2024; Zentralregierung und Gesamtstaat bleiben getrennt. Originaldatei im öffentlichen OWID-Archiv. Keine Weltaggregate oder Anlagebewertung.",
});
for (const groupId of ["finance", "institutions"])
  catalog.groups
    .find((group) => group.id === groupId)
    .sourceIds.push("imf_fiscal");
for (const fuel of energy.fuels) {
  if (!catalog.topics.some((topic) => topic.id === fuel.topicId))
    catalog.topics.push({
      id: fuel.topicId,
      groupId: "electricity",
      label: fuel.label,
    });
}
catalog.topics.push({
  id: "electricity:total_generation",
  groupId: "electricity",
  label: "Gesamte Stromerzeugung",
});
catalog.topics.push({
  id: "electricity:net_imports",
  groupId: "electricity",
  label: "Strom-Nettoimporte",
});
catalog.sources.push({
  id: "ember_yearly",
  label: "Ember · Yearly Electricity Data",
  url: "https://ember-energy.org/data/yearly-electricity-data/",
  limits:
    "Stromdaten und Schätzungen seit 2000; eigene Regionsabgrenzungen. Keine Börsenbewertung oder vollständige Energiebilanz.",
});
catalog.groups
  .find((group) => group.id === "electricity")
  .sourceIds.push("ember_yearly");
for (const proxy of marketProxies) {
  for (const topicId of proxy.topicIds) {
    if (!catalog.topics.some((topic) => topic.id === topicId)) {
      if (!topicId.startsWith("market_context:sector_"))
        throw Error(`Unknown market topic ${topicId}`);
      catalog.topics.push({
        id: topicId,
        groupId: "market_context",
        label: proxy.label,
      });
    }
  }
}
catalog.topics.push({
  id: "long_history:long_run_output",
  groupId: "long_history",
  label: "Wirtschaftsgröße über Jahrhunderte",
});
catalog.topics.push({
  id: "long_history:financial_history",
  groupId: "long_history",
  label: "Finanzgeschichte seit 1870",
});
for (const key of [
  "geographies",
  "regions",
  "domains",
  "groups",
  "topics",
  "sources",
  "series",
]) {
  if (new Set(catalog[key].map((item) => item.id)).size !== catalog[key].length)
    throw Error(`Duplicate ${key}`);
}
const destination = new URL(
  "../src/features/world-atlas/data/catalog.json",
  import.meta.url,
);
for (const series of catalog.series) {
  if (
    !catalog.topics.some((topic) => topic.id === series.topicId) ||
    !catalog.sources.some((source) => source.id === series.sourceId) ||
    (series.sourceId === "unsdg"
      ? !sdg.series.some(
          (item) =>
            item.id === series.id && item.providerCode === series.providerCode,
        )
      : series.id !== `worldbank:2:${series.providerCode}` ||
        !/^[A-Z0-9.]+$/.test(series.providerCode))
  )
    throw Error(`Invalid statistics mapping ${series.id}`);
  const topic = catalog.topics.find((topic) => topic.id === series.topicId);
  const group = catalog.groups.find((group) => group.id === topic.groupId);
  if (!group.sourceIds.includes(series.sourceId))
    group.sourceIds.push(series.sourceId);
}
await mkdir(new URL(".", destination), { recursive: true });
await writeFile(
  destination,
  await format(JSON.stringify(catalog), {
    ...(await resolveConfig(fileURLToPath(destination))),
    filepath: fileURLToPath(destination),
  }),
);
console.log(
  `Atlas catalog: ${catalog.geographies.length} areas, ${catalog.topics.length} topics → ${fileURLToPath(destination)}`,
);
