import { describe, expect, it } from "vitest";
import {
  learningCategories,
  learningLessons,
  learningPaths,
  learningSources,
  learningTerms,
  lessonById,
  sourceById,
  termById,
  searchLessons,
} from "./learning-catalog";

describe("learning content integrity", () => {
  it("keeps every lesson, learning path, glossary entry and source navigable", () => {
    expect(new Set(learningLessons.map((lesson) => lesson.id)).size).toBe(
      learningLessons.length,
    );
    expect(sourceById.size).toBe(learningSources.length);
    expect(termById.size).toBe(learningTerms.length);
    for (const lesson of learningLessons) {
      expect(
        learningCategories.some((category) => category.id === lesson.category),
        lesson.id,
      ).toBe(true);
      for (const id of lesson.related)
        expect(lessonById.has(id), `${lesson.id} → ${id}`).toBe(true);
      for (const id of lesson.terms)
        expect(termById.has(id), `${lesson.id}: ${id}`).toBe(true);
      expect(lesson.sources.length, lesson.id).toBeGreaterThan(0);
      for (const id of lesson.sources)
        expect(sourceById.has(id), `${lesson.id}: ${id}`).toBe(true);
      expect(lesson.quiz.correct, lesson.id).toBeGreaterThanOrEqual(0);
      expect(lesson.quiz.correct, lesson.id).toBeLessThan(
        lesson.quiz.options.length,
      );
      expect(new Set(lesson.quiz.options).size, lesson.id).toBe(
        lesson.quiz.options.length,
      );
      expect(lesson.drivers.length, lesson.id).toBeGreaterThanOrEqual(2);
      expect(lesson.chain.length, lesson.id).toBeGreaterThanOrEqual(3);
      expect(lesson.counterweights.length, lesson.id).toBeGreaterThanOrEqual(2);
      expect(lesson.context.length, lesson.id).toBeGreaterThan(100);
      expect(lesson.example.situation, lesson.id).toContain(
        "Gedankenbeispiel:",
      );
      for (const tool of lesson.tools ?? [])
        expect(tool.path, lesson.id).toMatch(/^\/[a-z-]+$/);
    }
    for (const path of learningPaths) {
      expect(new Set(path.lessons).size, path.id).toBe(path.lessons.length);
      for (const id of path.lessons)
        expect(lessonById.has(id), `${path.id}: ${id}`).toBe(true);
    }
    for (const term of learningTerms)
      expect(lessonById.has(term.lesson), term.id).toBe(true);
    for (const source of learningSources) {
      expect(new URL(source.url).protocol, source.id).toBe("https:");
      expect(source.scope.length, source.id).toBeGreaterThan(20);
    }
  });

  it("finds the user's assets, causal questions and tokenisation spelling", () => {
    expect(searchLessons("CAD")[0].id).toBe("cad");
    expect(searchLessons("GBP")[0].id).toBe("gbp");
    expect(searchLessons("China PPI").map((lesson) => lesson.id)).toContain(
      "china-ppi",
    );
    expect(searchLessons("Sojabohnen").map((lesson) => lesson.id)).toContain(
      "soybeans",
    );
    expect(searchLessons("Tokenasation")[0].id).toBe("tokenization");
    expect(searchLessons("Tokenization")[0].id).toBe("tokenization");
    expect(searchLessons("Kupfer").map((lesson) => lesson.id)).toContain(
      "copper",
    );
    expect(searchLessons("  ZINSEN  ").length).toBeGreaterThan(0);
    expect(searchLessons("xyzunbekannt")).toEqual([]);
  });
});
