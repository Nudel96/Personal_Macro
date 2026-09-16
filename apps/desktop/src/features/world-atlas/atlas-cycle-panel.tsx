import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, BookOpen, ChevronDown } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "../../components/ui/button";
import { isTauri } from "../../services/commands";
import {
  cycleContextTarget,
  cycleSources,
  type CycleDiagram,
  type CycleHypothesis,
} from "./atlas-cycle-hypotheses";
import type { AtlasGeography } from "./atlas-types";
import "./atlas-cycle.css";

// These are hand-drawn teaching diagrams in screen coordinates, never data.
const drawings: Record<
  CycleDiagram,
  { path: string; positions: [number, number][] }
> = {
  wave: {
    path: "M30 150 C65 150 75 137 110 107 S150 65 180 65 C225 65 230 111 270 132 S290 155 310 155 C400 155 400 60 455 85 S530 190 610 175",
    positions: [
      [110, 107],
      [180, 65],
      [270, 132],
      [310, 155],
    ],
  },
  credit: {
    path: "M30 170 C70 170 90 165 105 161 S170 150 215 100 S300 35 365 50 S420 145 485 162 S560 172 610 158",
    positions: [
      [105, 161],
      [215, 100],
      [365, 50],
      [485, 162],
    ],
  },
  investment: {
    path: "M30 175 L145 175 C165 175 180 155 195 127 S245 60 280 60 C335 60 355 145 395 155 S455 167 485 167 S560 170 610 170",
    positions: [
      [95, 175],
      [195, 127],
      [280, 60],
      [485, 167],
    ],
  },
  diffusion: {
    path: "M30 175 L110 175 C165 175 185 175 220 145 S300 70 340 50 C390 35 470 35 535 35 L610 35",
    positions: [
      [110, 175],
      [220, 145],
      [340, 50],
      [535, 35],
    ],
  },
  long_wave: {
    path: "M30 170 C60 170 80 155 125 111 S200 45 260 45 C310 45 320 89 355 119 S415 175 450 175 C490 175 500 165 530 143 S580 110 610 95",
    positions: [
      [125, 111],
      [260, 45],
      [355, 119],
      [530, 143],
    ],
  },
  branches: {
    path: "M30 115 C60 115 75 113 85 112 S190 92 230 107 L260 110 L325 110",
    positions: [
      [85, 112],
      [230, 107],
      [325, 110],
      [610, 110],
    ],
  },
};

function CycleDrawing({
  model,
  step,
}: {
  model: CycleHypothesis;
  step: number;
}) {
  const id = useId();
  const drawing = drawings[model.diagram];
  const [x, y] = drawing.positions[step];
  const markers =
    model.diagram === "branches" && step === 3
      ? [
          [610, 35],
          [610, 110],
          [610, 180],
        ]
      : [[x, y]];
  return (
    <figure className="atlas-cycle-figure">
      <div className="atlas-cycle-caption">
        <strong>Modellvorstellung · frei gezeichnet</strong>
        <span>Ohne Messwerte oder Kalender</span>
      </div>
      <svg
        viewBox="0 0 640 225"
        role="img"
        aria-labelledby={`${id}-title ${id}-description`}
      >
        <title id={`${id}-title`}>{model.diagramLabel}</title>
        <desc id={`${id}-description`}>
          Schematisches Lernbild. Der markierte Abschnitt wurde zum Erkunden
          ausgewählt. Er ist keine aktuelle Länderphase und keine Bewertung.
        </desc>
        <line
          className="atlas-cycle-guide"
          x1="30"
          y1="202"
          x2="610"
          y2="202"
        />
        <path
          className={`atlas-cycle-line${model.diagram === "long_wave" ? " is-hypothesis" : ""}`}
          d={drawing.path}
        />
        {model.diagram === "branches" && (
          <g className="atlas-cycle-alternatives">
            <path d="M325 110 C405 110 435 35 610 35" />
            <path d="M325 110 L610 110" />
            <path d="M325 110 C405 110 435 180 610 180" />
          </g>
        )}
        {markers.map(([mx, my]) => (
          <g key={`${mx}:${my}`}>
            <circle
              className="atlas-cycle-marker-halo"
              cx={mx}
              cy={my}
              r="16"
            />
            <circle className="atlas-cycle-marker" cx={mx} cy={my} r="6" />
          </g>
        ))}
      </svg>
      <figcaption>
        Gedanklicher Ablauf · Die Breite der Abschnitte steht für keine feste
        Dauer.
      </figcaption>
    </figure>
  );
}

export function AtlasCyclePanel({
  model,
  geography,
  comparison,
  opened,
  stepId,
  onNavigate,
}: {
  model: CycleHypothesis;
  geography: AtlasGeography;
  comparison?: AtlasGeography;
  opened: boolean;
  stepId: string | null;
  onNavigate: (values: Record<string, string>) => void;
}) {
  const [linkError, setLinkError] = useState(false);
  const contentId = useId();
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = content.current;
    if (!opened || !element) return;
    const top = element.getBoundingClientRect().top;
    if (top < 80 || top > window.innerHeight / 2) {
      element.focus({ preventScroll: true });
      element.scrollIntoView?.({ block: "start", behavior: "auto" });
    }
  }, [opened]);
  const step = Math.max(
    0,
    model.steps.findIndex((item) => item.id === stepId),
  );
  const selected = model.steps[step];
  const countries = [geography.label, comparison?.label]
    .filter(Boolean)
    .join(" und ");
  return (
    <div className="atlas-cycle-panel">
      <p className="atlas-explanation">{model.summary}</p>
      <div className="atlas-cycle-intro">
        <BookOpen size={24} aria-hidden="true" />
        <div>
          <strong>{model.kind}</strong>
          <p>
            Ein Bild zum Nachdenken über Veränderungen. Die ausgewählte Phase
            ist ein Lernschritt; sie wird keinem Land als heutiger Zustand
            zugeordnet.
          </p>
        </div>
      </div>
      <Button
        aria-expanded={opened}
        aria-controls={contentId}
        onClick={() => onNavigate({ hypothesis: opened ? "" : model.topicId })}
      >
        <ChevronDown
          size={16}
          className={
            opened ? "atlas-cycle-chevron is-open" : "atlas-cycle-chevron"
          }
          aria-hidden="true"
        />
        {opened ? "Modellbild schließen" : "Modellbild erkunden"}
      </Button>
      <div
        id={contentId}
        ref={content}
        tabIndex={-1}
        role="region"
        hidden={!opened}
        className="atlas-cycle-content"
        aria-label="Modellbild erkunden"
      >
        {opened && (
          <>
            <CycleDrawing model={model} step={step} />
            <div
              className="atlas-cycle-steps"
              role="group"
              aria-label="Bildabschnitt erkunden"
            >
              {model.steps.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={item.id === selected.id}
                  onClick={() => onNavigate({ cycleStep: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div
              className="atlas-cycle-step-copy"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <strong>{selected.label}</strong>
              <p>{selected.explanation}</p>
            </div>
            <div className="atlas-cycle-evidence">
              <section>
                <h3>Was die Quelle beschreibt</h3>
                <p>{model.finding}</p>
                <small>{cycleSources[model.sourceIds[0]].author}</small>
              </section>
              <section>
                <h3>Was offenbleibt</h3>
                <p>{model.limitation}</p>
              </section>
            </div>
            <details className="atlas-details atlas-cycle-sources">
              <summary>Quellen, Geltungsbereich und Gegenargumente</summary>
              {model.sourceIds.map((sourceId) => {
                const source = cycleSources[sourceId];
                return (
                  <section key={sourceId}>
                    <h4>{source.author}</h4>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => {
                        if (isTauri()) {
                          event.preventDefault();
                          setLinkError(false);
                          void openUrl(source.url).catch(() =>
                            setLinkError(true),
                          );
                        }
                      }}
                    >
                      {source.title}
                    </a>
                    <p>{source.scope}</p>
                    <small>{source.locator}</small>
                  </section>
                );
              })}
              {linkError && (
                <p role="alert">
                  Die externe Quelle konnte nicht geöffnet werden.
                </p>
              )}
              <section>
                <h4>Einordnung im Atlas</h4>
                <p>{model.alternative}</p>
                <p>Für eine eigene Prüfung: {model.needed}</p>
                <small>
                  Redaktionelle Einordnung auf Grundlage der genannten Arbeiten
                  · geprüft am 09.09.2026. Die Formen und Lernabschnitte wurden
                  für den Atlas frei gestaltet.
                </small>
              </section>
            </details>
            <section
              className="atlas-cycle-context"
              aria-label="Länderdaten zur eigenen Betrachtung"
            >
              <h3>Mit Länderdaten weiterdenken</h3>
              <p>{model.contextNote}</p>
              <p className="atlas-cycle-context-label">
                Datenverweise für {countries} · Verfügbarkeit und Zeitraum
                stehen in der jeweiligen Ansicht.
              </p>
              <div>
                {model.context.map((context) => (
                  <button
                    key={context.topicId}
                    type="button"
                    onClick={() =>
                      onNavigate(
                        cycleContextTarget(model, context, selected.id),
                      )
                    }
                  >
                    <span>{context.label}</span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
