import { basicsLessons } from "./data/basics";
import { currencyLessons } from "./data/currencies";
import { agricultureLessons } from "./data/agriculture";
import { metalsEnergyLessons } from "./data/metals-energy";
import { macroLessons } from "./data/macro";
import { tokenizationLessons } from "./data/tokenization";
import { practiceLessons } from "./data/practice";
import { learningTerms } from "./data/glossary";
import { learningSources } from "./data/sources";
import type {
  LearningCategory,
  LearningLesson,
  LearningPath,
} from "./learning-types";

export { learningTerms, learningSources };

export const learningCategories: {
  id: LearningCategory;
  title: string;
  description: string;
  mark: string;
}[] = [
  {
    id: "basics",
    title: "Grundlagen",
    description: "Preise, Zinsen und Daten verstehen",
    mark: "01",
  },
  {
    id: "currencies",
    title: "Währungen",
    description: "Die Geschichte hinter CAD, GBP & Co.",
    mark: "02",
  },
  {
    id: "agriculture",
    title: "Agrarrohstoffe",
    description: "Ernte, Verarbeitung, Lager und Käufer",
    mark: "03",
  },
  {
    id: "metals-energy",
    title: "Metalle & Energie",
    description: "Industrie, Angebot und reale Renditen",
    mark: "04",
  },
  {
    id: "macro",
    title: "Wirtschaftliche Zusammenhänge",
    description: "China, Inflation und Wirkungsketten",
    mark: "05",
  },
  {
    id: "tokenization",
    title: "Tokenisierung & digitale Assets",
    description: "Nutzen, Ansprüche und Umgang",
    mark: "06",
  },
  {
    id: "practice",
    title: "Beobachten & anwenden",
    description: "Werkzeuge für eigene Erklärungen",
    mark: "07",
  },
];

export const learningLessons: LearningLesson[] = [
  ...basicsLessons,
  ...currencyLessons,
  ...agricultureLessons,
  ...metalsEnergyLessons,
  ...macroLessons,
  ...tokenizationLessons,
  ...practiceLessons,
];
export const lessonById = new Map(
  learningLessons.map((lesson) => [lesson.id, lesson]),
);
export const termById = new Map(learningTerms.map((term) => [term.id, term]));
export const sourceById = new Map(
  learningSources.map((source) => [source.id, source]),
);

export const learningPaths: LearningPath[] = [
  {
    id: "start",
    title: "Ich starte bei den Grundlagen",
    description: "Erst den Vergleich, dann Daten, dann den Zinsweg verstehen.",
    lessons: [
      "fx-pairs",
      "expectations",
      "central-banks",
      "inflation",
      "real-yields",
      "checklist",
    ],
  },
  {
    id: "cad-gbp",
    title: "CAD und GBP wirklich verstehen",
    description:
      "Zwei Währungen, unterschiedliche Treiber und ein gemeinsames Gegenüber.",
    lessons: ["fx-pairs", "cad", "oil", "gbp", "labor", "bonds", "usd"],
  },
  {
    id: "china",
    title: "Von China zu deinem Asset",
    description:
      "PPI → Nachfrage → Rohstoff → Währung, mit allen Zwischenstationen.",
    lessons: [
      "ppi",
      "china-slowdown",
      "china-ppi",
      "iron-ore",
      "copper",
      "aud",
      "china-stimulus",
    ],
  },
  {
    id: "soy",
    title: "Soja von der Pflanze bis zum Käufer",
    description: "Bohne, Schrot und Öl im gemeinsamen Zusammenhang.",
    lessons: [
      "supply-demand",
      "soybeans",
      "soy-crush",
      "crop-calendar",
      "inventories",
      "basis",
    ],
  },
  {
    id: "metals",
    title: "Metalle auseinanderhalten",
    description:
      "Warum Gold, Silber, Kupfer und Eisenerz nicht dieselbe Geschichte sind.",
    lessons: [
      "real-yields",
      "gold",
      "silver",
      "copper",
      "iron-ore",
      "aluminium",
      "platinum",
    ],
  },
  {
    id: "digital",
    title: "Tokenisierung ohne Vorwissen",
    description:
      "Was du hältst, welchen Nutzen du hast und welche Fragen offen bleiben.",
    lessons: [
      "blockchain",
      "tokenization",
      "token-rights",
      "token-bonds",
      "stablecoins",
      "custody",
      "token-checklist",
    ],
  },
  {
    id: "defi",
    title: "Digitale Erträge kritisch verstehen",
    description:
      "Ertragsquelle, Code, Sicherheiten und Zugang verständlich verbinden.",
    lessons: [
      "smart-contracts",
      "stablecoins",
      "defi",
      "custody",
      "liquidity",
      "risk",
    ],
  },
  {
    id: "observe",
    title: "Meine eigene Beobachtungsroutine",
    description:
      "Aus einer Nachricht eine klare, überprüfbare Erklärung machen.",
    lessons: [
      "expectations",
      "correlations",
      "cot",
      "seasonality",
      "risk",
      "checklist",
    ],
  },
];

export function normalizeLearningText(text: string): string {
  return text
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/tokenasation|tokenisation|tokenization/g, "tokenisierung")
    .replace(/cacao/g, "kakao")
    .replace(/soja\s?bohnen/g, "soja");
}

export function lessonSearchText(lesson: LearningLesson): string {
  return normalizeLearningText(
    [
      lesson.id,
      lesson.title,
      lesson.subtitle,
      lesson.summary,
      lesson.context,
      ...lesson.drivers.flatMap((driver) => [
        driver.name,
        driver.why,
        driver.watch,
      ]),
      ...lesson.chain.flatMap((step) => [step.title, step.text]),
      lesson.example.situation,
      lesson.example.explanation,
      ...lesson.counterweights,
      lesson.takeaway,
      lesson.action,
      ...lesson.terms.map((id) => termById.get(id)?.name ?? id),
      learningCategories.find((category) => category.id === lesson.category)
        ?.title ?? "",
    ].join(" "),
  );
}

const searchIndex = new Map(
  learningLessons.map((lesson) => [lesson.id, lessonSearchText(lesson)]),
);

export function searchLessons(query: string): LearningLesson[] {
  const words = normalizeLearningText(query.trim())
    .split(/\s+/)
    .filter(Boolean);
  const results = learningLessons.filter((lesson) =>
    words.every((word) => searchIndex.get(lesson.id)!.includes(word)),
  );
  if (words.length === 0) return results;
  const relevance = (lesson: LearningLesson) => {
    const title = normalizeLearningText(lesson.title);
    return words.reduce(
      (score, word) =>
        score +
        (title.includes(word) ? 2 : 0) +
        (normalizeLearningText(lesson.id) === word ? 3 : 0),
      0,
    );
  };
  return results.sort((a, b) => relevance(b) - relevance(a));
}

export function readingMinutes(lesson: LearningLesson): number {
  return Math.max(
    2,
    Math.ceil(lessonSearchText(lesson).split(/\s+/).length / 160),
  );
}

export function categoryTitle(category: LearningCategory): string {
  return learningCategories.find((item) => item.id === category)!.title;
}
