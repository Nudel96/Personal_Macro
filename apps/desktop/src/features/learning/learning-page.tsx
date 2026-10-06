import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  Compass,
  GraduationCap,
  Layers,
  Route,
  Search,
  X,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  categoryTitle,
  learningCategories,
  learningLessons,
  learningPaths,
  learningTerms,
  lessonById,
  normalizeLearningText,
  readingMinutes,
  searchLessons,
} from "./learning-catalog";
import { LearningReader, lessonUrl, readingSteps } from "./learning-reader";
import {
  toggleLearningSaved,
  retryLearningSync,
  useLearningProgress,
  type LearningProgress,
} from "./learning-progress";
import {
  LEARNING_REVIEW_DATE,
  type LearningLesson,
  type LearningPath,
} from "./learning-types";
import "./learning.css";

const views = [
  { id: "overview", title: "Entdecken", icon: Compass },
  { id: "library", title: "Alle Kapitel", icon: BookOpen },
  { id: "paths", title: "Lernwege", icon: Route },
  { id: "glossary", title: "Glossar", icon: Layers },
  { id: "saved", title: "Merkliste", icon: Bookmark },
];
const featuredIds = [
  "cad",
  "gbp",
  "soybeans",
  "china-ppi",
  "gold",
  "tokenization",
];

function LessonCard({
  lesson,
  progress,
}: {
  lesson: LearningLesson;
  progress: LearningProgress;
}) {
  const [params] = useSearchParams();
  const saved = progress.saved.includes(lesson.id);
  const known = progress.known.includes(lesson.id);
  return (
    <article className="learning-lesson-card" data-category={lesson.category}>
      <div className="learning-card-top">
        <span>{categoryTitle(lesson.category)}</span>
        <button
          className="learning-save-button"
          aria-pressed={saved}
          aria-label={`${saved ? "Von Merkliste entfernen" : "Merken"}: ${lesson.title}`}
          onClick={() => toggleLearningSaved(lesson.id)}
        >
          <Bookmark
            size={17}
            fill={saved ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </button>
      </div>
      <Link
        className="learning-lesson-link"
        to={lessonUrl(lesson.id, undefined, 0, params)}
        aria-label={lesson.title}
      >
        <h3>{lesson.title}</h3>
        <p>{lesson.summary}</p>
        <div className="learning-card-bottom">
          <span>
            {known ? (
              <>
                <CheckCircle2 size={14} aria-hidden="true" />
                Verstanden
              </>
            ) : (
              `Etwa ${readingMinutes(lesson)} Min. · 6 kleine Schritte`
            )}
          </span>
          <ArrowRight size={17} aria-hidden="true" />
        </div>
      </Link>
    </article>
  );
}

function PathCard({
  path,
  progress,
  expanded = false,
}: {
  path: LearningPath;
  progress: LearningProgress;
  expanded?: boolean;
}) {
  const known = path.lessons.filter((id) => progress.known.includes(id)).length;
  const next =
    path.lessons.find((id) => !progress.known.includes(id)) ?? path.lessons[0];
  return (
    <article className="learning-path-card">
      <div className="learning-path-card-top">
        <Route size={18} aria-hidden="true" />
        <span>{path.lessons.length} Kapitel · in deiner Reihenfolge</span>
      </div>
      <h3>{path.title}</h3>
      <p>{path.description}</p>
      <div className="learning-path-progress">
        <span>
          {known} von {path.lessons.length} als verstanden markiert
        </span>
        <div
          className="learning-progress-track"
          role="progressbar"
          aria-label={`Fortschritt: ${path.title}`}
          aria-valuemin={0}
          aria-valuemax={path.lessons.length}
          aria-valuenow={known}
        >
          <span style={{ width: `${(known / path.lessons.length) * 100}%` }} />
        </div>
      </div>
      {expanded && (
        <ol className="learning-path-chapters">
          {path.lessons.map((id, index) => (
            <li key={id}>
              <span>
                {progress.known.includes(id) ? (
                  <CheckCircle2 size={15} aria-label="Verstanden" />
                ) : (
                  String(index + 1).padStart(2, "0")
                )}
              </span>
              <Link to={lessonUrl(id, path.id)}>
                {lessonById.get(id)!.title}
              </Link>
            </li>
          ))}
        </ol>
      )}
      <Link className="learning-path-start" to={lessonUrl(next, path.id)}>
        {known === path.lessons.length
          ? "Lernweg wiederholen"
          : known > 0
            ? "Nächstes Kapitel öffnen"
            : "Lernweg beginnen"}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </article>
  );
}

export function LearningPage() {
  const [params, setParams] = useSearchParams();
  const progress = useLearningProgress();
  const requestedLesson = params.get("lesson");
  const lesson = requestedLesson ? lessonById.get(requestedLesson) : null;
  const view = views.some((item) => item.id === params.get("view"))
    ? params.get("view")!
    : "overview";
  const query = params.get("q") ?? "";
  const selectedCategory =
    learningCategories.find(
      (category) => category.id === params.get("category"),
    )?.id ?? "all";
  const status = ["new", "known"].includes(params.get("status") ?? "")
    ? params.get("status")!
    : "all";
  const filteredLessons = useMemo(
    () =>
      searchLessons(query).filter(
        (item) =>
          (selectedCategory === "all" || item.category === selectedCategory) &&
          (status === "all" ||
            (status === "known"
              ? progress.known.includes(item.id)
              : !progress.known.includes(item.id))) &&
          (view !== "saved" || progress.saved.includes(item.id)),
      ),
    [query, selectedCategory, status, view, progress.known, progress.saved],
  );
  const filteredTerms = useMemo(() => {
    const words = normalizeLearningText(query).split(/\s+/).filter(Boolean);
    return learningTerms
      .filter((term) =>
        words.every((word) =>
          normalizeLearningText(
            `${term.name} ${term.definition} ${term.example}`,
          ).includes(word),
        ),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [query]);
  const previousLesson = progress.last
    ? lessonById.get(progress.last.lesson)
    : null;
  const selectedPath = learningPaths.find(
    (path) => path.id === params.get("path"),
  );

  function changeParam(key: string, value: string, targetView?: string) {
    const next = new URLSearchParams(params);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    if (targetView) next.set("view", targetView);
    setParams(next, { replace: true });
  }
  function viewUrl(id: string) {
    const next = new URLSearchParams();
    next.set("view", id);
    return `/learning?${next}`;
  }
  function resetFilters() {
    const next = new URLSearchParams({ view });
    setParams(next, { replace: true });
  }

  if (requestedLesson && !lesson)
    return (
      <div className="page learning-page">
        <div className="learning-empty">
          <BookOpen size={30} aria-hidden="true" />
          <h1>Dieses Kapitel ist nicht vorhanden.</h1>
          <p>Wähle ein Thema aus der Bibliothek.</p>
          <Link className="learning-path-start" to="/learning?view=library">
            Zur Bibliothek
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  if (lesson) return <LearningReader lesson={lesson} progress={progress} />;

  return (
    <div className="page learning-page">
      <header className="learning-hero">
        <div className="learning-hero-copy">
          <span className="learning-eyebrow">
            <GraduationCap size={17} aria-hidden="true" />
            Learning · Dein Nachschlagewerk
          </span>
          <h1>Verstehen, was Märkte bewegt.</h1>
          <p>
            Währungen, Rohstoffe und neue Finanztechnologien — mit dem
            Zusammenhang, den du brauchst. Ein Thema, eine Wirkungskette, ein
            kleiner nächster Schritt.
          </p>
          <div className="learning-hero-facts">
            <span>
              <BookOpen size={15} aria-hidden="true" />
              {learningLessons.length} Kapitel
            </span>
            <span>
              <Route size={15} aria-hidden="true" />
              {learningPaths.length} Lernwege
            </span>
            <span>
              <Layers size={15} aria-hidden="true" />
              {learningTerms.length} erklärte Begriffe
            </span>
          </div>
        </div>
        <div className="learning-hero-aside">
          <span className="learning-eyebrow">Eine gute Leitfrage</span>
          <p>
            „Was hat sich verändert — und über welchen Weg wirkt es auf mein
            Asset?“
          </p>
          <span>
            Du musst nicht alles auf einmal lernen. Der Kontext bleibt in jedem
            Kapitel sichtbar.
          </span>
        </div>
      </header>

      <nav className="learning-view-nav" aria-label="Learning-Bereiche">
        {views.map(({ id, title, icon: Icon }) => (
          <Link
            key={id}
            to={viewUrl(id)}
            aria-current={view === id ? "page" : undefined}
          >
            <Icon size={16} aria-hidden="true" />
            {title}
            {id === "saved" && progress.saved.length > 0 && (
              <span className="learning-nav-count">
                {progress.saved.length}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {view === "overview" && (
        <>
          <div className="learning-return-grid">
            <section className="learning-resume">
              <div className="learning-resume-icon">
                <BookOpen size={25} aria-hidden="true" />
              </div>
              <div>
                <span className="learning-eyebrow">
                  {previousLesson
                    ? "Hier warst du zuletzt"
                    : "Ein ruhiger Einstieg"}
                </span>
                <h2>
                  {previousLesson
                    ? previousLesson.title
                    : "Wie ein Marktpreis entsteht"}
                </h2>
                <p>
                  {previousLesson
                    ? `Weiter bei Schritt ${(progress.last?.step ?? 0) + 1}: ${readingSteps[progress.last?.step ?? 0]}. Deine Lesestelle bleibt für dich vorgemerkt.`
                    : "Angebot, Nachfrage und Erwartungen: die gemeinsame Grundlage hinter den einzelnen Assets."}
                </p>
              </div>
              <Link
                className="learning-primary-link"
                to={
                  previousLesson
                    ? lessonUrl(
                        previousLesson.id,
                        undefined,
                        progress.last?.step ?? 0,
                      )
                    : lessonUrl("supply-demand")
                }
              >
                {previousLesson ? "Weiterlesen" : "Mit den Grundlagen starten"}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </section>
            <section className="learning-personal">
              <span className="learning-eyebrow">
                Dein eigenes Nachschlagewerk
              </span>
              <div>
                <span>
                  <strong>{progress.known.length}</strong>verstanden
                </span>
                <span>
                  <strong>{progress.saved.length}</strong>gemerkt
                </span>
              </div>
              <p>
                Kein Tagesziel. Du entscheidest, wann ein Thema für dich klar
                ist.
              </p>
              <Link to={viewUrl("saved")}>
                Meine Merkliste
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </section>
          </div>
          <section className="learning-dashboard-section">
            <div className="learning-section-title">
              <div>
                <span className="learning-eyebrow">
                  Ein Zusammenhang nach dem anderen
                </span>
                <h2>Welches Thema interessiert dich?</h2>
              </div>
              <Link to={viewUrl("library")}>
                Alle Kapitel
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="learning-category-grid">
              {learningCategories.map((category) => (
                <Link
                  key={category.id}
                  className="learning-category-card"
                  to={`/learning?view=library&category=${category.id}`}
                >
                  <span className="learning-category-mark">
                    {category.mark}
                  </span>
                  <div>
                    <h3>{category.title}</h3>
                    <p>{category.description}</p>
                    <small>
                      {
                        learningLessons.filter(
                          (item) => item.category === category.id,
                        ).length
                      }{" "}
                      Kapitel
                    </small>
                  </div>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
          <section className="learning-dashboard-section">
            <div className="learning-section-title">
              <div>
                <span className="learning-eyebrow">
                  Direkt in deine Fragen einsteigen
                </span>
                <h2>Treiber verstehen, Zusammenhänge erkennen</h2>
              </div>
            </div>
            <div className="learning-lesson-grid">
              {featuredIds.map((id) => (
                <LessonCard
                  key={id}
                  lesson={lessonById.get(id)!}
                  progress={progress}
                />
              ))}
            </div>
          </section>
          <section className="learning-dashboard-section">
            <div className="learning-section-title">
              <div>
                <span className="learning-eyebrow">
                  Wenn du einen roten Faden möchtest
                </span>
                <h2>Lernwege mit einer klaren Reihenfolge</h2>
              </div>
              <Link to={viewUrl("paths")}>
                Alle Lernwege
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="learning-path-grid">
              {["china", "soy", "digital"].map((id) => (
                <PathCard
                  key={id}
                  path={learningPaths.find((path) => path.id === id)!}
                  progress={progress}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {(view === "library" || view === "saved") && (
        <section className="learning-library">
          <div className="learning-section-title">
            <div>
              <span className="learning-eyebrow">
                {view === "saved"
                  ? "Deine vorgemerkten Themen"
                  : "Suche nach Asset, Treiber oder Zusammenhang"}
              </span>
              <h2>
                {view === "saved" ? "Meine Merkliste" : "Die Lernbibliothek"}
              </h2>
            </div>
            <span className="learning-result-count" role="status">
              {filteredLessons.length}{" "}
              {filteredLessons.length === 1 ? "Kapitel" : "Kapitel"}
            </span>
          </div>
          <div className="learning-filterbar">
            <label className="learning-search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Kapitel suchen</span>
              <input
                type="search"
                value={query}
                placeholder="z. B. CAD, China PPI, Soja, Tokenisierung …"
                onChange={(event) => changeParam("q", event.target.value)}
              />
              {query && (
                <button
                  aria-label="Suche leeren"
                  onClick={() => changeParam("q", "")}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </label>
            <label className="learning-select-label">
              <span>Themenwelt</span>
              <select
                value={selectedCategory}
                onChange={(event) =>
                  changeParam("category", event.target.value)
                }
              >
                <option value="all">Alle Themenwelten</option>
                {learningCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="learning-select-label">
              <span>Lernstand</span>
              <select
                value={status}
                onChange={(event) => changeParam("status", event.target.value)}
              >
                <option value="all">Alle Kapitel</option>
                <option value="new">Noch nicht als verstanden markiert</option>
                <option value="known">Als verstanden markiert</option>
              </select>
            </label>
          </div>
          {view === "saved" && (
            <p className="learning-section-intro">
              Mit dem Lesezeichen sammelst du Themen für später. Die Markierung
              „verstanden“ ist davon unabhängig.
            </p>
          )}
          {filteredLessons.length > 0 ? (
            <div className="learning-lesson-grid">
              {filteredLessons.map((item) => (
                <LessonCard key={item.id} lesson={item} progress={progress} />
              ))}
            </div>
          ) : (
            <div className="learning-empty">
              <Bookmark size={30} aria-hidden="true" />
              <h3>
                {view === "saved" && progress.saved.length === 0
                  ? "Hier ist Platz für deine nächsten Fragen."
                  : "Für diese Auswahl gibt es keine Kapitel."}
              </h3>
              <p>
                {view === "saved" && progress.saved.length === 0
                  ? "Merke dir ein Kapitel mit dem Lesezeichen. Danach findest du es hier wieder."
                  : "Versuche einen kürzeren Suchbegriff oder eine andere Themenwelt."}
              </p>
              {query || selectedCategory !== "all" || status !== "all" ? (
                <Button onClick={resetFilters}>Filter zurücksetzen</Button>
              ) : (
                <Link className="learning-path-start" to={viewUrl("library")}>
                  Kapitel entdecken
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}
            </div>
          )}
        </section>
      )}

      {view === "paths" && (
        <section className="learning-dashboard-section">
          <div className="learning-section-title">
            <div>
              <span className="learning-eyebrow">
                Kontext in einer sinnvollen Reihenfolge aufbauen
              </span>
              <h2>{selectedPath ? selectedPath.title : "Deine Lernwege"}</h2>
            </div>
            {selectedPath && (
              <Link to={viewUrl("paths")}>
                Alle Lernwege
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            )}
          </div>
          <p className="learning-section-intro">
            Du kannst jedes Kapitel einzeln öffnen. Ein Lernweg verbindet sie zu
            einer Geschichte; dein Fortschritt entsteht durch deine eigenen
            Markierungen.
          </p>
          <div
            className={`learning-path-grid${selectedPath ? " learning-path-single" : ""}`}
          >
            {(selectedPath ? [selectedPath] : learningPaths).map((path) => (
              <PathCard
                key={path.id}
                path={path}
                progress={progress}
                expanded
              />
            ))}
          </div>
        </section>
      )}

      {view === "glossary" && (
        <section className="learning-glossary">
          <div className="learning-section-title">
            <div>
              <span className="learning-eyebrow">
                Fachwörter in einfacher Sprache
              </span>
              <h2>Das Glossar</h2>
            </div>
            <span className="learning-result-count" role="status">
              {filteredTerms.length} Begriffe
            </span>
          </div>
          <label className="learning-search learning-glossary-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Begriff suchen</span>
            <input
              type="search"
              value={query}
              placeholder="z. B. PPI, Realzins, Basis, Smart Contract …"
              onChange={(event) => changeParam("q", event.target.value)}
            />
            {query && (
              <button
                aria-label="Suche leeren"
                onClick={() => changeParam("q", "")}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </label>
          {filteredTerms.length > 0 ? (
            <div className="learning-glossary-grid">
              {filteredTerms.map((term) => (
                <article key={term.id} className="learning-term-card">
                  <h3>{term.name}</h3>
                  <p>{term.definition}</p>
                  <details>
                    <summary>Beispiel & weiterlernen</summary>
                    <p>{term.example}</p>
                    <Link to={lessonUrl(term.lesson)}>
                      {lessonById.get(term.lesson)!.title}
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </details>
                </article>
              ))}
            </div>
          ) : (
            <div className="learning-empty">
              <Layers size={30} aria-hidden="true" />
              <h3>Kein passender Begriff gefunden.</h3>
              <p>Versuche den deutschen oder englischen Namen.</p>
              <Button onClick={() => changeParam("q", "")}>Suche leeren</Button>
            </div>
          )}
        </section>
      )}

      <footer className="learning-footer">
        <p>
          Mechanismen erklären, Beispiele durchdenken, Gegenkräfte prüfen. Die
          Inhalte sind ein Nachschlagewerk; sie werden nicht aus deinen
          persönlichen Journal-Daten erstellt.
        </p>
        <span>
          Quellenstand: {LEARNING_REVIEW_DATE} ·{" "}
          {progress.storage === "device"
            ? "Lesestand, Merkliste und Notizen bleiben auf diesem Gerät."
            : progress.storage === "cloud"
              ? progress.sync === "error"
                ? "Der Lernstand konnte nicht gespeichert werden. Die aktuellen Eingaben bleiben in dieser Sitzung."
                : progress.sync === "loading"
                  ? "Der private Lernstand wird geladen."
                  : progress.sync === "saving"
                    ? "Änderungen am privaten Lernstand werden gespeichert …"
                    : "Lesestand, Merkliste und Notizen sind in deinem privaten Cloud-Workspace gespeichert."
              : progress.storage === "session"
                ? "Lesestand, Merkliste und Notizen bleiben in dieser Websitzung und werden beim Sitzungsende verworfen."
                : "Lesestand, Merkliste und Notizen bleiben derzeit nur im Arbeitsspeicher."}
          {progress.storage === "cloud" && progress.sync === "error" ? (
            <Button onClick={retryLearningSync}>
              Speichern erneut versuchen
            </Button>
          ) : null}
        </span>
      </footer>
    </div>
  );
}
