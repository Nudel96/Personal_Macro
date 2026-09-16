import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it } from "vitest";
import {
  atlasContextParams,
  atlasNotebookSources,
  atlasSavedContext,
} from "./atlas-notebook-model";
import { atlasValuationCatalog } from "./atlas-valuation";

it("merkt zwei ausdrücklich ausgewählte nationale Gewerbeimmobilienreihen", () => {
  const params = new URLSearchParams({
    topic: "housing:commercial_property",
    area: "m49:276",
    compare: "m49:250",
    publicSource: "bis-commercial-property",
    publicMetric: "bis-commercial-property:Q.DE.0.D.0.2.6.0",
    publicCompareMetric: "bis-commercial-property:Q.FR.0.A.0.0.6.0",
    publicSince: "2000",
  });
  expect(
    Object.fromEntries(atlasContextParams(atlasSavedContext(params))!),
  ).toEqual(Object.fromEntries(params));
});

it("merkt die konkrete zusätzliche Quelle, Veröffentlichung und Periodenauswahl", () => {
  const client = new QueryClient();
  const params = new URLSearchParams({
    topic: "labor:wages",
    publicSource: "oecd-wages",
    publicMetric: "oecd-wages:real_ppp",
    publicSince: "2000",
  });
  expect(
    Object.fromEntries(atlasContextParams(atlasSavedContext(params))!),
  ).toEqual(Object.fromEntries(params));
  const unsubscribe = new QueryObserver(client, {
    queryKey: ["atlas", "public", "oecd-wages", "m49:276"],
    staleTime: Infinity,
    queryFn: async () => null,
    initialData: {
      status: "available",
      source: { id: "oecd-wages", label: "OECD · Reallöhne" },
      geography: { label: "Deutschland" },
      provenance: {
        publishedAt: "nicht angegeben",
        retrievedAt: "2026-09-11T00:00:00Z",
        recipe: "reviewed-source",
        sha256: "a".repeat(64),
      },
    } as unknown,
  }).subscribe(() => undefined);
  expect(atlasNotebookSources(client, atlasSavedContext(params))).toMatchObject(
    [
      {
        family: "public",
        label: "OECD · Reallöhne",
        datasetId: "oecd-wages",
        release: "nicht angegeben",
        hashes: ["a".repeat(64)],
      },
    ],
  );
  unsubscribe();
  client.clear();
});

it("merkt den UN-SDG-Quellenstand mit richtigem Anbieter", () => {
  const client = new QueryClient();
  const unsubscribe = new QueryObserver(client, {
    queryKey: ["atlas", "series", "unsdg:EN_MWT_RCYR", "m49:276"],
    staleTime: Infinity,
    queryFn: async () => null,
    initialData: {
      status: "available",
      series: { id: "unsdg:EN_MWT_RCYR", sourceId: "unsdg" },
      geography: { label: "Deutschland" },
      provenance: {
        providerUpdatedAt: "2026.Q2.G.02",
        pages: [{ sha256: "a".repeat(64) }],
      },
    } as unknown,
  }).subscribe(() => undefined);
  expect(
    atlasNotebookSources(client, { version: 1, params: {} }),
  ).toMatchObject([
    {
      family: "un",
      label: "UN · Global SDG Database",
      release: "2026.Q2.G.02",
      hashes: ["a".repeat(64)],
    },
  ]);
  unsubscribe();
  client.clear();
});

it("erhält alle Bildparameter ohne externe Ziele und lehnt lange Texte sowie unbekannte Versionen ab", () => {
  const params = new URLSearchParams(
    "region=Asia&area=m49%3A356&compare=m49%3A156&topic=people%3Apopulation&demoYear=2050&demoProjection=1&historySince=1500&historyProportional=0&energyMeasure=capacity&marketHorizon=all&marketsGroup=themes&numbers=0&mapSearch=Indien&redirect=https%3A%2F%2Fexample.com",
  );
  const saved = atlasSavedContext(params);
  expect(saved.params.redirect).toBeUndefined();
  params.delete("redirect");
  expect(atlasContextParams(saved)?.toString()).toBe(
    new URLSearchParams(saved.params).toString(),
  );
  expect(Object.fromEntries(atlasContextParams(saved)!)).toEqual(
    Object.fromEntries(params),
  );
  expect(atlasContextParams({ ...saved, version: 2 })).toBeNull();
  params.set("mapSearch", "a".repeat(257));
  expect(() => atlasSavedContext(params)).toThrow(/256/);
});

it("erhält den Themenfilter, die Suchauswahl und die echte Quellenregion beim Wiederöffnen", () => {
  const params = new URLSearchParams({
    view: "valuation",
    area: "m49:276",
    valMode: "industries",
    valTopic: "industry:chemicals",
    valScope: "global",
    valCompareScope: "india",
    valBasis: "pe",
    valSearch: "Spezial",
    valPage: "0",
    numbers: "0",
  });
  expect(
    Object.fromEntries(atlasContextParams(atlasSavedContext(params))!),
  ).toEqual(Object.fromEntries(params));
});

it("bewahrt native Quellenhashes, Rezept und Bewertungsjahre und liest keine Journalqueries", () => {
  const client = new QueryClient();
  const a = "a".repeat(64),
    b = "b".repeat(64);
  const dataset = atlasValuationCatalog.datasets[0];
  const rows = [
    {
      key: ["atlas", "market", "test"],
      data: {
        status: "available",
        proxy: { id: "test", label: "Globaler Fonds" },
        analysis: { recipe: "causal-wave-v1" },
        provenance: { sha256: a, retrievedAt: "2026-09-09T00:00:00Z" },
      },
    },
    {
      key: ["atlas", "valuation", dataset.id],
      data: {
        status: "available",
        datasetId: dataset.id,
        data: {
          provenance: {
            catalogVersion: "valuation-v1",
            files: [
              { sha256: b, publicationYear: 2025 },
              { sha256: b, publicationYear: 2026 },
            ],
          },
        },
      },
    },
    { key: ["trades"], data: { privateNote: "NEVER COPY THIS" } },
  ];
  const unsub = rows.map(({ key, data }) =>
    new QueryObserver(client, {
      queryKey: key,
      initialData: data,
      queryFn: () => data,
      staleTime: Infinity,
    }).subscribe(() => undefined),
  );
  const sources = atlasNotebookSources(client, { version: 1, params: {} });
  expect(sources).toHaveLength(2);
  expect(sources.find((s) => s.family === "eodhd")).toMatchObject({
    hashes: [a],
    recipe: "causal-wave-v1",
  });
  expect(sources.find((s) => s.family === "damodaran")).toMatchObject({
    scope: dataset.scopeLabel,
    hashes: [b],
    release: "2025–2026",
  });
  expect(JSON.stringify(sources)).not.toContain("NEVER COPY");
  unsub.forEach((fn) => fn());
  expect(atlasNotebookSources(client, { version: 1, params: {} })).toEqual([]);
  client.clear();
});

it("kennzeichnet ein gemerktes Zyklusbild ausdrücklich als erklärendes Modell", () => {
  const client = new QueryClient();
  const sources = atlasNotebookSources(client, {
    version: 1,
    params: {
      topic: "cycle_hypotheses:business_cycles",
      hypothesis: "cycle_hypotheses:business_cycles",
    },
  });
  expect(sources).toHaveLength(1);
  expect(sources[0]).toMatchObject({
    family: "hypothesis",
    status: "explanatory_model",
    recipe: "atlas-cycle-model-v1",
    retrievedAt: null,
  });
  client.clear();
});

it("hält beide aktiven Branchenregionen mit eigenen Quellenständen fest", () => {
  const client = new QueryClient();
  const context = atlasSavedContext(
    new URLSearchParams({
      view: "valuation",
      valMode: "industries",
      valScope: "india",
      valCompareScope: "us",
      valSubject: "industry:education",
    }),
  );
  const unsub = ["pbv-india", "pbv-us"].map((id, index) =>
    new QueryObserver(client, {
      queryKey: ["atlas", "valuation", id],
      staleTime: Infinity,
      initialData: {
        status: "available",
        datasetId: id,
        data: {
          provenance: {
            catalogVersion: atlasValuationCatalog.version,
            retrievedAt: `2026-09-0${index + 1}T00:00:00Z`,
            files: [
              { sha256: String(index + 1).repeat(64), publicationYear: 2026 },
            ],
          },
        },
      },
      queryFn: () => {
        throw Error("unexpected network");
      },
    }).subscribe(() => undefined),
  );
  const sources = atlasNotebookSources(client, context);
  expect(sources).toHaveLength(2);
  for (const [index, id] of ["pbv-india", "pbv-us"].entries())
    expect(
      sources.find(
        (s) =>
          s.scope ===
          atlasValuationCatalog.datasets.find((d) => d.id === id)!.scopeLabel,
      ),
    ).toMatchObject({
      family: "damodaran",
      hashes: [String(index + 1).repeat(64)],
      retrievedAt: `2026-09-0${index + 1}T00:00:00Z`,
    });
  expect(atlasContextParams(context)?.get("valCompareScope")).toBe("us");
  unsub.forEach((fn) => fn());
  client.clear();
});
