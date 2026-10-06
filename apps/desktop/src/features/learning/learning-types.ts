export type LearningCategory =
  | "basics"
  | "currencies"
  | "agriculture"
  | "metals-energy"
  | "macro"
  | "tokenization"
  | "practice";

export interface LearningLesson {
  id: string;
  category: LearningCategory;
  title: string;
  subtitle: string;
  summary: string;
  context: string;
  drivers: { name: string; why: string; watch: string }[];
  chain: { title: string; text: string }[];
  example: { title: string; situation: string; explanation: string };
  counterweights: string[];
  takeaway: string;
  action: string;
  quiz: {
    question: string;
    options: string[];
    correct: number;
    explanation: string;
  };
  related: string[];
  terms: string[];
  sources: string[];
  tools?: { label: string; path: string }[];
}

type LessonInput = Omit<LearningLesson, "category" | "drivers" | "chain"> & {
  drivers: [name: string, why: string, watch: string][];
  chain: [title: string, text: string][];
};

export function defineLesson(
  category: LearningCategory,
  input: LessonInput,
): LearningLesson {
  return {
    ...input,
    category,
    drivers: input.drivers.map(([name, why, watch]) => ({ name, why, watch })),
    chain: input.chain.map(([title, text]) => ({ title, text })),
  };
}

export interface LearningSource {
  id: string;
  publisher: string;
  title: string;
  url: string;
  scope: string;
}

export interface LearningTerm {
  id: string;
  name: string;
  definition: string;
  example: string;
  lesson: string;
}

export interface LearningPath {
  id: string;
  title: string;
  description: string;
  lessons: string[];
}

export const LEARNING_REVIEW_DATE = "05.10.2026";
