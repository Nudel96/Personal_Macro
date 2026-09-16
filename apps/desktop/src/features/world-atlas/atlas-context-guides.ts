import { atlasCatalog } from "./atlas-catalog";
import type { CoverageFamily } from "./atlas-coverage";
import {
  atlasTopicResearch,
  type AtlasTopicResearch,
} from "./atlas-topic-research";

export interface AtlasContextLink {
  label: string;
  explanation: string;
  source: string;
  horizon: string;
  family: CoverageFamily;
  icon:
    | "work"
    | "output"
    | "city"
    | "energy"
    | "school"
    | "people"
    | "prices"
    | "history";
  target: Record<string, string>;
}

export interface AtlasContextGuide {
  topicId: string;
  summary: string;
  boundary: string;
  links: AtlasContextLink[];
  research?: AtlasTopicResearch;
}

function wdi(code: string) {
  const definition = atlasCatalog.series.find((s) => s.providerCode === code)!;
  return {
    topic: definition.topicId,
    series: definition.id,
    perspective: "worldbank",
  };
}

function jst(metric: string, group: string, crises = false) {
  return {
    topic: "long_history:financial_history",
    jstMetric: metric,
    jstGroup: group,
    jstSince: "1870",
    jstReal: "1",
    jstCrises: crises ? "1" : "0",
  };
}

function fiscal(metric: string) {
  return {
    topic: "institutions:public_finances",
    fiscalMetric: metric,
    fiscalGroup: "economy",
    fiscalSince: "1800",
  };
}

// Curated entrances to existing pictures. These do not create a composite series,
// infer a current phase, or count as an additional measured coverage option.
export const atlasContextGuides: AtlasContextGuide[] = [
  {
    topicId: "macro:productivity",
    summary:
      "Eine eigene Reihe zur Gesamtproduktivität ist noch nicht angebunden. Als ergänzenden Blick kannst du die Wirtschaftsleistung je erwerbstätiger Person erkunden.",
    boundary:
      "Die Reihe berücksichtigt Preise und Kaufkraft. Arbeitszeit und Wirtschaftsstruktur wirken mit; sie misst weder Stundenproduktivität noch die gemeinsame Effizienz von Arbeit und Kapital. Ein höherer Wert sagt nichts über Löhne oder eine günstige Marktbewertung aus.",
    links: [
      {
        label: "Leistung je erwerbstätiger Person",
        explanation:
          "Preis- und kaufkraftbereinigte Wirtschaftsleistung geteilt durch die Zahl der Erwerbstätigen.",
        source: "Modellschätzung · über WDI",
        horizon: "Jahresreihen · Zeitraum je nach Gebiet",
        family: "statistics",
        icon: "work",
        target: wdi("SL.GDP.PCAP.EM.KD"),
      },
    ],
  },
  {
    topicId: "institutions:inequality",
    summary:
      "Wie ungleich sind Einkommen oder Konsumausgaben innerhalb eines Landes verteilt? Die verfügbaren Erhebungen geben einen ersten Überblick.",
    boundary:
      "Der Gini-Index beschreibt die Verteilung, nicht den Wohlstand oder die Armutsquote. Einkommen und Konsum sind unterschiedliche Erhebungsgrundlagen; Länderwerte sind deshalb nur eingeschränkt vergleichbar. Vermögensungleichheit wird hier nicht erfasst.",
    links: [
      {
        label: "Verteilung von Einkommen oder Konsum",
        explanation:
          "Ein höherer Gini-Wert bedeutet größere Ungleichheit. Einzelne Erhebungsjahre und Lücken bleiben sichtbar.",
        source: "World Bank · Haushaltsbefragungen über WDI",
        horizon: "Verfügbare Erhebungsjahre · je nach Gebiet",
        family: "statistics",
        icon: "people",
        target: wdi("SI.POV.GINI"),
      },
    ],
  },
  {
    topicId: "innovation:technology_adoption",
    summary:
      "Wie verbreiten sich digitale Verbindungen im Alltag? Drei Bilder zeigen Internetnutzung und Kommunikationsanschlüsse.",
    boundary:
      "Menschen und Verträge haben verschiedene Nenner. Mehrere Anschlüsse pro Person sind möglich. Die Bilder zeigen einen Teil der digitalen Verbreitung; sie messen weder die Nutzung einzelner Technologien wie KI noch Qualität, Erschwinglichkeit oder Unternehmensbewertung.",
    links: [
      {
        label: "Menschen mit Internetnutzung",
        explanation:
          "Der Anteil der Bevölkerung, der das Internet nutzt, unabhängig von Gerät oder Zugangsort.",
        source: "ITU · über WDI",
        horizon: "Jahresreihen · Zeitraum je nach Gebiet",
        family: "statistics",
        icon: "people",
        target: wdi("IT.NET.USER.ZS"),
      },
      {
        label: "Feste Breitbandanschlüsse",
        explanation:
          "Feste Breitbandverträge je hundert Einwohner; kein Anteil eindeutig gezählter Nutzer.",
        source: "ITU · über WDI",
        horizon: "Jahresreihen · Zeitraum je nach Gebiet",
        family: "statistics",
        icon: "city",
        target: wdi("IT.NET.BBND.P2"),
      },
      {
        label: "Mobilfunkanschlüsse",
        explanation:
          "Mobilfunkverträge einschließlich aktiver Prepaid-Anschlüsse je hundert Einwohner; keine reine Smartphone- oder Internetquote.",
        source: "ITU · über WDI",
        horizon: "Jahresreihen · Zeitraum je nach Gebiet",
        family: "statistics",
        icon: "people",
        target: wdi("IT.CEL.SETS.P2"),
      },
    ],
  },
  {
    topicId: "finance:financial_stress",
    summary:
      "Wie haben sich Kredite und dokumentierte Finanzkrisen entwickelt? Diese getrennten Bilder helfen, das langfristige Finanzumfeld einzuordnen.",
    boundary:
      "Der Kreditabstand ist ein Modellindikator für den Aufbau möglicher Verwundbarkeit, kein Maß für gegenwärtigen Stress. Krisenmarkierungen nennen historische Anfänge. Daraus wird weder ein gemeinsamer Stressindex noch eine Krisenprognose oder faire Marktbewertung berechnet.",
    links: [
      {
        label: "Kredite im Verhältnis zum langfristigen Trend",
        explanation:
          "Der von der BIS veröffentlichte Abstand der privaten Kreditquote zu ihrem rückblickenden Modelltrend.",
        source: "BIS · veröffentlichter Modellindikator",
        horizon: "43 Länder und Euroraum · frühestens 1961",
        family: "credit",
        icon: "prices",
        target: {
          topic: "finance:credit_growth",
          perspective: "credit",
          creditMode: "gap",
          creditSince: "0",
        },
      },
      {
        label: "Wirtschaft mit Finanzkrisenanfängen",
        explanation:
          "Reale Wirtschaftsleistung je Einwohner mit den veröffentlichten JST-Krisenmarkierungen.",
        source: "Jordà–Schularick–Taylor · R6",
        horizon: "18 Länder · frühestens 1870 bis 2020",
        family: "macrohistory",
        icon: "history",
        target: jst("output", "economy", true),
      },
    ],
  },
  {
    topicId: "structural_change:industrialization",
    summary:
      "Wie viel Raum nimmt Industrie in der Arbeit und in der Wirtschaftsleistung ein? Diese Bilder zeigen verschiedene Seiten des Wandels.",
    boundary:
      "Beschäftigung und Wertschöpfung haben verschiedene Nenner. Ein sinkender Anteil kann auch entstehen, wenn andere Bereiche schneller wachsen. Die Reihen bestimmen keine feste Industrialisierungsphase.",
    links: [
      {
        label: "Arbeit in der Industrie",
        explanation:
          "Anteil der Erwerbstätigen in Industrie einschließlich Bau, Bergbau und Versorgern.",
        source: "ILO-Modellschätzung · über WDI",
        horizon: "Jahresreihen bis 2024 · Beginn je nach Gebiet",
        family: "statistics",
        icon: "work",
        target: wdi("SL.IND.EMPL.ZS"),
      },
      {
        label: "Industrie in der Wirtschaftsleistung",
        explanation:
          "Wertschöpfungsanteil der Industrie einschließlich Bau am gesamten BIP.",
        source: "World Development Indicators",
        horizon: "Jahresreihen · Zeitraum je nach Gebiet",
        family: "statistics",
        icon: "output",
        target: wdi("NV.IND.TOTL.ZS"),
      },
      {
        label: "Verarbeitendes Gewerbe",
        explanation:
          "Der engere Produktionsbereich als Anteil am BIP; Bau und Bergbau zählen hier nicht mit.",
        source: "World Development Indicators",
        horizon: "Jahresreihen · Zeitraum je nach Gebiet",
        family: "statistics",
        icon: "output",
        target: wdi("NV.IND.MANF.ZS"),
      },
    ],
  },
  {
    topicId: "structural_change:service_transition",
    summary:
      "Wie stark prägen Dienstleistungen die Arbeit und die Wirtschaftsleistung eines Landes?",
    boundary:
      "Beide Bilder fassen öffentliche und private Dienstleistungen zusammen. Sie zeigen keine einzelnen Branchen, Arbeitsplatzqualität oder finanzielle Bewertung.",
    links: [
      {
        label: "Arbeit in Dienstleistungen",
        explanation:
          "Das Gewicht der Dienstleistungen unter allen Erwerbstätigen.",
        source: "ILO-Modellschätzung · über WDI",
        horizon: "Jahresreihen bis 2024 · Beginn je nach Gebiet",
        family: "statistics",
        icon: "work",
        target: wdi("SL.SRV.EMPL.ZS"),
      },
      {
        label: "Dienstleistungen in der Wirtschaftsleistung",
        explanation:
          "Der Wertschöpfungsanteil von Dienstleistungen am gesamten BIP.",
        source: "World Development Indicators",
        horizon: "Jahresreihen · Zeitraum je nach Gebiet",
        family: "statistics",
        icon: "output",
        target: wdi("NV.SRV.TOTL.ZS"),
      },
    ],
  },
  {
    topicId: "structural_change:urban_transition",
    summary:
      "Wie verschiebt sich das Verhältnis zwischen städtischer und ländlicher Bevölkerung?",
    boundary:
      "Was als städtisch gilt, richtet sich nach den nationalen Definitionen. Der Landesanteil beschreibt keine einzelne Stadt, Wohnqualität oder Immobilienbewertung.",
    links: [
      {
        label: "Bevölkerung in städtischen Gebieten",
        explanation:
          "Der städtische Anteil an der gesamten Bevölkerung im Zeitverlauf.",
        source: "World Development Indicators",
        horizon: "Jahresreihen · Zeitraum je nach Gebiet",
        family: "statistics",
        icon: "city",
        target: wdi("SP.URB.TOTL.IN.ZS"),
      },
    ],
  },
  {
    topicId: "structural_change:energy_transitions",
    summary:
      "Wie verändert sich die Herkunft des Stroms? Der heutige Atlas zeigt den jüngeren Abschnitt des Energiewandels.",
    boundary:
      "Diese Bilder beginnen frühestens 2000. Strom ist nur ein Teil des gesamten Energieverbrauchs; daraus ergibt sich keine vollständige historische Energiewende über Jahrhunderte.",
    links: [
      {
        label: "Strommix im Wandel",
        explanation: "Wie sich die Anteile der Erzeugungsarten verschieben.",
        source: "Ember · Quellenstatistik mit Schätzungen",
        horizon: "Ab frühestens 2000 · je nach Gebiet",
        family: "energy",
        icon: "energy",
        target: {
          topic: "electricity:generation_mix",
          energySince: "2000",
          energyMeasure: "share",
        },
      },
      {
        label: "Solarstrom im Strommix",
        explanation:
          "Der Anteil von Solarenergie an der heimischen Stromerzeugung.",
        source: "Ember · Quellenstatistik mit Schätzungen",
        horizon: "Ab frühestens 2000 · je nach Gebiet",
        family: "energy",
        icon: "energy",
        target: {
          topic: "electricity:solar",
          perspective: "energy",
          energySince: "2000",
          energyMeasure: "share",
        },
      },
      {
        label: "Kernenergie im Strommix",
        explanation:
          "Der Anteil von Kernenergie an der heimischen Stromerzeugung.",
        source: "Ember · Quellenstatistik mit Schätzungen",
        horizon: "Ab frühestens 2000 · je nach Gebiet",
        family: "energy",
        icon: "energy",
        target: {
          topic: "electricity:nuclear",
          perspective: "energy",
          energySince: "2000",
          energyMeasure: "share",
        },
      },
    ],
  },
  {
    topicId: "structural_change:education_expansion",
    summary:
      "Wie verbreiten sich Schulbesuch, Abschlüsse und Hochschulbildung? Wähle die Bildungsstufe, die du verstehen möchtest.",
    boundary:
      "Bruttoeinschulungsquoten und tatsächlich erworbene Abschlüsse messen unterschiedliche Dinge. Einzelne Erhebungen bleiben einzelne Punkte; die Bilder zeigen keinen Börsenwert des Bildungssektors.",
    links: [
      {
        label: "Besuch der Grundschule",
        explanation:
          "Einschreibungen aller Altersgruppen im Verhältnis zur üblichen Altersgruppe; die Bruttoquote kann über hundert liegen.",
        source: "World Development Indicators",
        horizon: "Jahresreihen · Zeitraum je nach Gebiet",
        family: "statistics",
        icon: "school",
        target: wdi("SE.PRM.ENRR"),
      },
      {
        label: "Abschluss der unteren Sekundarstufe",
        explanation:
          "Tatsächliche Abschlüsse junger Menschen laut Haushaltsbefragungen und Volkszählungen.",
        source: "UNESCO UIS · Erhebungen",
        horizon: "Verfügbare Erhebungsjahre · je nach Gebiet",
        family: "education",
        icon: "school",
        target: {
          topic: "education:secondary_school",
          perspective: "education",
          educationMetric: "CR.2",
          educationSince: "0",
        },
      },
      {
        label: "Besuch tertiärer Bildung",
        explanation:
          "Einschreibungen an Hochschulen und anderen tertiären Einrichtungen im Verhältnis zur üblichen Altersgruppe.",
        source: "World Development Indicators",
        horizon: "Jahresreihen · Zeitraum je nach Gebiet",
        family: "statistics",
        icon: "school",
        target: wdi("SE.TER.ENRR"),
      },
    ],
  },
  {
    topicId: "structural_change:productivity_regimes",
    summary:
      "Wie verändert sich die Wirtschaftsleistung je erwerbstätiger Person? Eine zweite Perspektive erweitert den Blick auf die lange Entwicklung je Einwohner.",
    boundary:
      "Je Erwerbstätigen und je Einwohner sind verschiedene Größen. Arbeitszeit, Beschäftigung und Wirtschaftsstruktur wirken mit. Diese Bilder grenzen keine Produktivitätsphasen automatisch ab.",
    links: [
      {
        label: "Leistung je erwerbstätiger Person",
        explanation:
          "Preis- und kaufkraftbereinigte Wirtschaftsleistung; keine Stundenproduktivität und kein Lohn.",
        source: "Modellschätzung · über WDI",
        horizon: "Jahresreihen · Zeitraum je nach Gebiet",
        family: "statistics",
        icon: "work",
        target: wdi("SL.GDP.PCAP.EM.KD"),
      },
      {
        label: "Lange Entwicklung je Einwohner",
        explanation:
          "Historische Rekonstruktion der Wirtschaftsleistung je Einwohner als ergänzender Kontext.",
        source: "Maddison Project Database · über OWID",
        horizon: "Gesamte verfügbare Geschichte · frühe Werte oft lückenhaft",
        family: "history",
        icon: "history",
        target: {
          topic: "long_history:long_run_prosperity",
          historySince: "1",
          historyProportional: "1",
        },
      },
    ],
  },
  {
    topicId: "long_history:long_run_population",
    summary:
      "Bevölkerungsgröße und Altersform zeigen unterschiedliche Seiten derselben langen Entwicklung.",
    boundary:
      "Die historische UN-Grundlage beginnt 1950. Ab 2024 sind die Werte Projektionen; sie lassen sich im Bild zusätzlich einschalten. Eine Bevölkerungsrekonstruktion vor 1950 ist hier noch nicht angebunden.",
    links: [
      {
        label: "Bevölkerung seit 1950",
        explanation:
          "Die historische Entwicklung der Bevölkerungsgröße, zunächst ohne Zukunftsszenario.",
        source: "UN World Population Prospects 2024",
        horizon: "Historische Schätzungen 1950–2023",
        family: "demography",
        icon: "people",
        target: {
          topic: "demography:population_projection",
          demoProjection: "0",
          demoYear: "2023",
        },
      },
      {
        label: "Altersform über die Zeit",
        explanation:
          "Mit dem Jahresregler erkunden, welche Jahrgänge eine Bevölkerung prägen.",
        source: "UN World Population Prospects 2024",
        horizon: "Historische Schätzungen 1950–2023",
        family: "demography",
        icon: "people",
        target: {
          topic: "demography:age_structure",
          demoProjection: "0",
          demoYear: "2023",
        },
      },
    ],
  },
  {
    topicId: "long_history:long_run_inflation",
    summary:
      "Wann beschleunigt oder verlangsamt sich der Anstieg der Verbraucherpreise? Die Jahresreihe bietet dafür einen ersten historischen Blick.",
    boundary:
      "Diese WDI-Grundlage bietet keine vollständige Jahrhundertgeschichte für alle Länder. Eine sinkende positive Inflationsrate bedeutet weiterhin steigende Preise. Phasen werden nicht automatisch klassifiziert.",
    links: [
      {
        label: "Verbraucherpreisinflation im Zeitverlauf",
        explanation:
          "Die jährliche Veränderung der Verbraucherpreise; Warenkörbe und Erhebungen unterscheiden sich zwischen Ländern.",
        source: "World Development Indicators",
        horizon: "Jahresreihen · Zeitraum je nach Gebiet",
        family: "statistics",
        icon: "prices",
        target: wdi("FP.CPI.TOTL.ZG"),
      },
    ],
  },
  {
    topicId: "long_history:long_run_rates",
    summary:
      "Kurzfristige und langfristige Zinsen können sich unterschiedlich entwickeln. Ein Realzins ergänzt den Blick nach Berücksichtigung der Inflation.",
    boundary:
      "Nominale und reale Zinsen bleiben getrennte Perspektiven. Historische Ausgangsquellen und Instrumente wechseln. Die Reihen sind kein einheitlicher Leitzins und keine heutige Anlagebewertung.",
    links: [
      {
        label: "Kurzfristige Zinsen",
        explanation:
          "Historische nominale Zinsen aus der JST-Finanzgeschichte.",
        source: "Jordà–Schularick–Taylor · R6",
        horizon: "18 Länder · frühestens 1870 bis 2020",
        family: "macrohistory",
        icon: "prices",
        target: jst("shortRate", "interest"),
      },
      {
        label: "Langfristige Zinsen",
        explanation:
          "Historische nominale Langfristzinsen aus derselben JST-Quelle.",
        source: "Jordà–Schularick–Taylor · R6",
        horizon: "18 Länder · frühestens 1870 bis 2020",
        family: "macrohistory",
        icon: "prices",
        target: jst("longRate", "interest"),
      },
      {
        label: "Langfristiger Realzins",
        explanation:
          "Die von der IMF-Quelle veröffentlichte inflationsbereinigte Zinsreihe.",
        source: "IMF · Public Finances in Modern History",
        horizon: "Frühestens 1800 bis 2024 · je nach Land",
        family: "fiscal",
        icon: "prices",
        target: fiscal("realLongRate"),
      },
    ],
  },
  {
    topicId: "long_history:crises_recoveries",
    summary:
      "Wirtschaftliche Einbrüche und Erholungen lassen sich im historischen Verlauf erkunden. Für die JST-Länder können dokumentierte Finanzkrisenanfänge eingeblendet werden.",
    boundary:
      "Die Krisenmarkierungen bezeichnen Anfänge, keine Dauer oder vollständige Liste aller Krisen. Der Wachstumsverlauf allein identifiziert keine Ursache, Erholungsphase oder nächste Krise.",
    links: [
      {
        label: "Wirtschaft mit Finanzkrisenanfängen",
        explanation:
          "Reale Wirtschaftsleistung je Einwohner mit den veröffentlichten JST-Krisenmarkierungen.",
        source: "Jordà–Schularick–Taylor · R6",
        horizon: "18 Länder · frühestens 1870 bis 2020",
        family: "macrohistory",
        icon: "history",
        target: jst("output", "economy", true),
      },
      {
        label: "Historisches Wirtschaftswachstum",
        explanation:
          "Veränderungen der preisbereinigten Wirtschaftsleistung; als weiterer Länderkontext ohne Krisenmarkierungen.",
        source: "IMF · Public Finances in Modern History",
        horizon: "Frühestens 1800 bis 2024 · je nach Land",
        family: "fiscal",
        icon: "output",
        target: fiscal("realGrowth"),
      },
    ],
  },
  ...atlasTopicResearch.map((research): AtlasContextGuide => ({
    topicId: research.topicId,
    summary: research.meaning,
    boundary: research.boundary,
    research,
    links: (research.contextCodes ?? []).map((code) => {
      const definition = atlasCatalog.series.find(
        (s) => s.providerCode === code,
      );
      if (!definition)
        throw new Error(`Unknown Atlas context statistic: ${code}`);
      return {
        label: definition.label,
        explanation:
          definition.explanation ?? definition.scopeNote ?? definition.label,
        source: "Ergänzender Kontext · WDI",
        horizon: "Eigener Zeitraum und Quellenstand je Statistik",
        family: "statistics",
        icon: "output",
        target: wdi(code),
      };
    }),
  })),
];

export const atlasContextGuide = (topicId: string | null) =>
  atlasContextGuides.find((guide) => guide.topicId === topicId);

export function atlasContextOrigin(topicId: string, originId: string | null) {
  const guide = atlasContextGuide(originId);
  return guide?.links.some((link) => link.target.topic === topicId)
    ? guide
    : undefined;
}

export function atlasContextTarget(
  guide: AtlasContextGuide,
  link: AtlasContextLink,
): Record<string, string> {
  return {
    view: "",
    series: "",
    perspective: "",
    proxy: "",
    fromCycle: "",
    hypothesis: "",
    ...link.target,
    fromGuide: guide.topicId,
  };
}
