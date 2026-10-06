import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  CheckCircle2,
  ExternalLink,
  Lightbulb,
  List,
  Route,
  Target,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { canUseWorkspaceRoute } from "../../app/workspace-capabilities";
import { isTauri } from "../../services/commands";
import {
  categoryTitle,
  learningPaths,
  lessonById,
  readingMinutes,
  sourceById,
  termById,
} from "./learning-catalog";
import {
  saveLearningNote,
  saveLearningPosition,
  toggleLearningKnown,
  toggleLearningSaved,
  type LearningProgress,
} from "./learning-progress";
import { LEARNING_REVIEW_DATE, type LearningLesson } from "./learning-types";

export const readingSteps = [
  "Einordnung",
  "Treiber",
  "Wirkungskette",
  "Beispiel",
  "Gegenkräfte",
  "Anwenden",
];

export function lessonUrl(
  id: string,
  path?: string,
  step = 0,
  context?: URLSearchParams,
): string {
  const params = new URLSearchParams(context);
  ["path", "step", "mode"].forEach((key) => params.delete(key));
  params.set("lesson", id);
  if (path) params.set("path", path);
  if (step) params.set("step", String(step));
  return `/learning?${params}`;
}

async function openSource(event: MouseEvent<HTMLAnchorElement>, url: string) {
  if (!isTauri()) return;
  event.preventDefault();
  try {
    await openUrl(url);
  } catch {
    toast.error("Die Quelle konnte nicht geöffnet werden.");
  }
}

function KnowledgeCheck({ lesson }: { lesson: LearningLesson }) {
  const [answer, setAnswer] = useState<number | null>(null);
  const correct = answer === lesson.quiz.correct;
  return (
    <div className="learning-quiz">
      <span className="learning-eyebrow">Kurz selbst prüfen</span>
      <h3>{lesson.quiz.question}</h3>
      <div
        className="learning-quiz-options"
        role="group"
        aria-label="Antwort auswählen"
      >
        {lesson.quiz.options.map((option, index) => (
          <button
            key={option}
            className={`learning-quiz-option${answer === index ? " selected" : ""}`}
            aria-pressed={answer === index}
            onClick={() => setAnswer(index)}
          >
            <span className="learning-option-letter" aria-hidden="true">
              {String.fromCharCode(65 + index)}
            </span>
            <span>{option}</span>
            {answer === index && <Check size={16} aria-hidden="true" />}
          </button>
        ))}
      </div>
      {answer !== null && (
        <div
          className={`learning-quiz-feedback${correct ? " correct" : ""}`}
          role="status"
        >
          <strong>
            {correct
              ? "Genau, das ist der Zusammenhang."
              : "Schau noch einmal auf den Zusammenhang."}
          </strong>
          {!correct && (
            <p>
              Die passende Antwort: {lesson.quiz.options[lesson.quiz.correct]}
            </p>
          )}
          <p>{lesson.quiz.explanation}</p>
        </div>
      )}
    </div>
  );
}

function ReadingSection({
  index,
  lesson,
  progress,
}: {
  index: number;
  lesson: LearningLesson;
  progress: LearningProgress;
}) {
  const availableTools =
    lesson.tools?.filter((tool) => canUseWorkspaceRoute(tool.path)) ?? [];
  return (
    <section
      className="learning-reading-section"
      aria-labelledby={`learning-section-${index}`}
    >
      <div className="learning-section-heading">
        <span className="learning-section-number">0{index + 1}</span>
        <div>
          <span className="learning-eyebrow">
            {index === 0
              ? "Zuerst der Kontext"
              : index === 1
                ? "Was bewegt das Thema?"
                : index === 2
                  ? "Ein Schritt führt zum nächsten"
                  : index === 3
                    ? "Der Zusammenhang wird konkret"
                    : index === 4
                      ? "Was die Geschichte verändern kann"
                      : "Vom Lesen zum Verstehen"}
          </span>
          <h2 id={`learning-section-${index}`}>{readingSteps[index]}</h2>
        </div>
      </div>
      {index === 0 && (
        <>
          <p className="learning-context-text">{lesson.context}</p>
          <div className="learning-takeaway">
            <Lightbulb size={21} aria-hidden="true" />
            <div>
              <strong>Ein Satz zum Mitnehmen</strong>
              <p>{lesson.takeaway}</p>
            </div>
          </div>
        </>
      )}
      {index === 1 && (
        <div className="learning-driver-list">
          {lesson.drivers.map((driver, i) => (
            <article className="learning-driver" key={driver.name}>
              <span className="learning-driver-mark">{i + 1}</span>
              <div>
                <h3>{driver.name}</h3>
                <p>{driver.why}</p>
                <div className="learning-watch">
                  <Target size={15} aria-hidden="true" />
                  <span>
                    <strong>Beobachte:</strong> {driver.watch}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {index === 2 && (
        <>
          <p className="learning-section-intro">
            Das ist ein möglicher Übertragungsweg. Jeder Übergang braucht
            passende Bedingungen.
          </p>
          <ol className="learning-chain">
            {lesson.chain.map((item, i) => (
              <li key={item.title}>
                <span className="learning-chain-dot">{i + 1}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="learning-small-note">
            Die Punkte im Abschnitt „Gegenkräfte“ helfen dir zu prüfen, wo diese
            Kette unterbrochen werden könnte.
          </p>
        </>
      )}
      {index === 3 && (
        <div className="learning-example">
          <span className="learning-eyebrow">
            Gedankenbeispiel · keine aktuellen Marktdaten
          </span>
          <h3>{lesson.example.title}</h3>
          <div className="learning-example-block">
            <strong>Stell dir vor …</strong>
            <p>
              {lesson.example.situation.replace(/^Gedankenbeispiel:\s*/, "")}
            </p>
          </div>
          <div className="learning-example-block">
            <strong>Warum das zusammenpasst</strong>
            <p>{lesson.example.explanation}</p>
          </div>
        </div>
      )}
      {index === 4 && (
        <>
          <p className="learning-section-intro">
            Ein Treiber ist eine Erklärungsmöglichkeit. Diese Punkte helfen dir,
            die eigene Annahme zu hinterfragen.
          </p>
          <ul className="learning-counterweights">
            {lesson.counterweights.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <div className="learning-reflection">
            <strong>Deine Kontrollfrage</strong>
            <p>Welche Beobachtung würde meine bisherige Erklärung schwächen?</p>
          </div>
        </>
      )}
      {index === 5 && (
        <>
          <div className="learning-takeaway">
            <Lightbulb size={21} aria-hidden="true" />
            <div>
              <strong>Das Wesentliche</strong>
              <p>{lesson.takeaway}</p>
            </div>
          </div>
          <div className="learning-next-action">
            <Target size={20} aria-hidden="true" />
            <div>
              <strong>Ein kleiner nächster Schritt</strong>
              <p>{lesson.action}</p>
            </div>
          </div>
          <KnowledgeCheck key={lesson.id} lesson={lesson} />
          <div className="learning-notebook">
            <label htmlFor="learning-own-note">
              <strong>In meinen eigenen Worten</strong>
              <span>Was habe ich verstanden? Was möchte ich noch prüfen?</span>
            </label>
            <textarea
              id="learning-own-note"
              rows={4}
              maxLength={2000}
              value={progress.notes[lesson.id] ?? ""}
              onChange={(event) =>
                saveLearningNote(lesson.id, event.target.value)
              }
              placeholder="Ein eigener Satz reicht. Du kannst später weiterschreiben."
            />
            <span className="learning-small-note" role="status">
              {progress.storage === "device"
                ? "Automatisch auf diesem Gerät gespeichert."
                : progress.storage === "session"
                  ? "Nur in dieser bestätigten Websitzung gespeichert."
                  : "Derzeit nur im Arbeitsspeicher gespeichert."}{" "}
              {(progress.notes[lesson.id] ?? "").length}/2000
            </span>
          </div>
          {availableTools.length > 0 && (
            <div className="learning-tool-links">
              <strong>Im Workspace weiterbeobachten</strong>
              <div>
                {availableTools.map((tool) => (
                  <Link key={tool.path} to={tool.path}>
                    {tool.label}
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function LearningReader({
  lesson,
  progress,
}: {
  lesson: LearningLesson;
  progress: LearningProgress;
}) {
  const [params, setParams] = useSearchParams();
  const rawStep = Number(params.get("step") ?? 0);
  const step =
    Number.isInteger(rawStep) && rawStep >= 0 && rawStep < readingSteps.length
      ? rawStep
      : 0;
  const focus = params.get("mode") !== "all";
  const titleRef = useRef<HTMLHeadingElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);
  const currentPath = learningPaths.find(
    (path) =>
      path.id === params.get("path") && path.lessons.includes(lesson.id),
  );
  const pathIndex = currentPath?.lessons.indexOf(lesson.id) ?? -1;
  const nextInPath = currentPath?.lessons[pathIndex + 1];
  const saved = progress.saved.includes(lesson.id);
  const known = progress.known.includes(lesson.id);

  useEffect(() => {
    saveLearningPosition(lesson.id, step);
  }, [lesson.id, step]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    titleRef.current?.focus({ preventScroll: true });
  }, [lesson.id]);

  function goToStep(next: number) {
    const updated = new URLSearchParams(params);
    updated.set("step", String(next));
    setParams(updated, { replace: true });
    contextRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    requestAnimationFrame(() =>
      sectionRef.current?.focus({ preventScroll: true }),
    );
  }
  function setFocus(enabled: boolean) {
    const updated = new URLSearchParams(params);
    if (enabled) updated.delete("mode");
    else updated.set("mode", "all");
    setParams(updated, { replace: true });
  }
  function backToLibrary() {
    const updated = new URLSearchParams(params);
    ["lesson", "step", "mode", "path"].forEach((key) => updated.delete(key));
    updated.set("view", params.get("view") === "saved" ? "saved" : "library");
    return `/learning?${updated}`;
  }
  return (
    <div className="page learning-page learning-reader-page">
      <div className="learning-reader-topline">
        <Link className="learning-back" to={backToLibrary()}>
          <ArrowLeft size={16} aria-hidden="true" />
          {params.get("view") === "saved" ? "Zur Merkliste" : "Zur Bibliothek"}
        </Link>
        <span>
          {categoryTitle(lesson.category)} · etwa {readingMinutes(lesson)} Min.
          Lesezeit
        </span>
      </div>
      {currentPath && (
        <div className="learning-path-context">
          <Route size={17} aria-hidden="true" />
          <span>
            Lernweg: <strong>{currentPath.title}</strong> · Kapitel{" "}
            {pathIndex + 1} von {currentPath.lessons.length}
          </span>
          <Link to={`/learning?view=paths&path=${currentPath.id}`}>
            Lernweg ansehen
          </Link>
        </div>
      )}
      <header className="learning-reader-header">
        <div>
          <span className="learning-eyebrow">
            Learning · Zusammenhänge verstehen
          </span>
          <h1 ref={titleRef} tabIndex={-1}>
            {lesson.title}
          </h1>
          <p>{lesson.subtitle}</p>
        </div>
        <div className="learning-reader-actions">
          <Button
            size="sm"
            aria-pressed={saved}
            onClick={() => toggleLearningSaved(lesson.id)}
          >
            <Bookmark
              size={16}
              fill={saved ? "currentColor" : "none"}
              aria-hidden="true"
            />
            {saved ? "Gemerkt" : "Merken"}
          </Button>
          <Button
            size="sm"
            variant={known ? "primary" : "default"}
            aria-pressed={known}
            onClick={() => toggleLearningKnown(lesson.id)}
          >
            <CheckCircle2 size={16} aria-hidden="true" />
            {known ? "Als verstanden markiert" : "Als verstanden markieren"}
          </Button>
        </div>
      </header>
      <div className="learning-reader-layout">
        <aside className="learning-reader-aside">
          <div className="learning-reading-controls">
            <span className="learning-eyebrow">Dein Lesetempo</span>
            <div
              className="learning-mode-switch"
              role="group"
              aria-label="Darstellung"
            >
              <button aria-pressed={focus} onClick={() => setFocus(true)}>
                Schritt für Schritt
              </button>
              <button aria-pressed={!focus} onClick={() => setFocus(false)}>
                <List size={14} aria-hidden="true" />
                Alles
              </button>
            </div>
            <p className="learning-small-note">
              Du kannst jederzeit pausieren und hier wieder einsteigen.
            </p>
            <nav aria-label="Kapitelabschnitte" className="learning-step-nav">
              {readingSteps.map((label, i) =>
                focus ? (
                  <button
                    key={label}
                    aria-current={step === i ? "step" : undefined}
                    onClick={() => goToStep(i)}
                  >
                    <span aria-hidden="true">0{i + 1}</span>
                    {label}
                    {step === i && <ArrowRight size={14} aria-hidden="true" />}
                  </button>
                ) : (
                  <a key={label} href={`#learning-section-${i}`}>
                    <span aria-hidden="true">0{i + 1}</span>
                    {label}
                  </a>
                ),
              )}
            </nav>
          </div>
          <div className="learning-inline-glossary">
            <span className="learning-eyebrow">Begriffe direkt erklärt</span>
            {lesson.terms.map((id) => {
              const term = termById.get(id)!;
              return (
                <details key={id}>
                  <summary>{term.name}</summary>
                  <p>{term.definition}</p>
                  <span>{term.example}</span>
                  <Link to={lessonUrl(term.lesson)}>
                    Dazu weiterlesen
                    <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                </details>
              );
            })}
          </div>
        </aside>
        <div className="learning-reader-body">
          <div className="learning-context-anchor" ref={contextRef}>
            <span className="learning-eyebrow">Worum es hier geht</span>
            <p>{lesson.summary}</p>
          </div>
          <div
            ref={sectionRef}
            className="learning-reading-content"
            tabIndex={-1}
            aria-label={
              focus
                ? `Abschnitt ${step + 1}: ${readingSteps[step]}`
                : "Alle Kapitelabschnitte"
            }
          >
            {(focus ? [step] : [0, 1, 2, 3, 4, 5]).map((index) => (
              <ReadingSection
                key={`${lesson.id}-${index}`}
                index={index}
                lesson={lesson}
                progress={progress}
              />
            ))}
          </div>
          {focus && (
            <div className="learning-step-footer">
              <Button
                size="sm"
                onClick={() => goToStep(step - 1)}
                disabled={step === 0}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Zurück
              </Button>
              <span>Schritt {step + 1} von 6</span>
              {step < 5 ? (
                <Button variant="primary" onClick={() => goToStep(step + 1)}>
                  Weiter: {readingSteps[step + 1]}
                  <ArrowRight size={16} aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  variant={known ? "default" : "primary"}
                  aria-pressed={known}
                  onClick={() => toggleLearningKnown(lesson.id)}
                >
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {known
                    ? "Verstanden · Markierung aufheben"
                    : "Als verstanden markieren"}
                </Button>
              )}
            </div>
          )}
          <details className="learning-source-panel">
            <summary>
              Quellen & Einordnung · geprüft am {LEARNING_REVIEW_DATE}
            </summary>
            <p>
              Die Texte erklären Mechanismen in eigenen Worten. Beispiele sind
              erfundene Szenarien. Quellen belegen die Grundlagen; konkrete
              Marktreaktionen hängen von Erwartungen und Gegenkräften ab.
            </p>
            <ul>
              {lesson.sources.map((id) => {
                const source = sourceById.get(id)!;
                return (
                  <li key={id}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => void openSource(event, source.url)}
                    >
                      {source.publisher} · {source.title}
                      <ExternalLink size={13} aria-hidden="true" />
                    </a>
                    <p>{source.scope}</p>
                  </li>
                );
              })}
            </ul>
          </details>
          <section
            className="learning-related"
            aria-label="Verbindungen und nächste Kapitel"
          >
            <div className="learning-related-heading">
              <span className="learning-eyebrow">
                Den Zusammenhang erweitern
              </span>
              <h2>
                {nextInPath
                  ? "Dein nächstes Kapitel im Lernweg"
                  : "Hier passt das Gelernte dazu"}
              </h2>
            </div>
            {nextInPath && (
              <Link
                className="learning-path-next"
                to={lessonUrl(nextInPath, currentPath?.id)}
              >
                <div>
                  <small>Weiter im Lernweg</small>
                  <strong>{lessonById.get(nextInPath)!.title}</strong>
                </div>
                <ArrowRight size={20} aria-hidden="true" />
              </Link>
            )}
            <div className="learning-related-grid">
              {lesson.related
                .filter((id) => id !== nextInPath)
                .map((id) => {
                  const related = lessonById.get(id)!;
                  return (
                    <Link key={id} to={lessonUrl(id)}>
                      <small>{categoryTitle(related.category)}</small>
                      <strong>{related.title}</strong>
                      <span>{related.subtitle}</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  );
                })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
