import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  ChartNoAxesCombined,
  GraduationCap,
  History,
  Landmark,
  Users,
  Zap,
} from "lucide-react";
import { useId, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "../../services/commands";
import {
  topicResearchReviewedAt,
  topicResearchSources,
} from "./atlas-topic-research";
import { coverageMapped } from "./atlas-coverage";
import {
  atlasContextTarget,
  type AtlasContextGuide,
} from "./atlas-context-guides";
import type { AtlasGeography } from "./atlas-types";
import "./atlas-context.css";

const icons = {
  work: BriefcaseBusiness,
  output: ChartNoAxesCombined,
  city: Building2,
  energy: Zap,
  school: GraduationCap,
  people: Users,
  prices: Landmark,
  history: History,
};

export function AtlasContextPanel({
  guide,
  geography,
  comparison,
  onNavigate,
}: {
  guide: AtlasContextGuide;
  geography: AtlasGeography;
  comparison?: AtlasGeography;
  onNavigate: (values: Record<string, string>) => void;
}) {
  const id = useId();
  const [linkError, setLinkError] = useState(false);
  return (
    <div className="atlas-context">
      <p className="atlas-explanation">{guide.summary}</p>
      {guide.research && (
        <div className="atlas-research-finding">
          <strong>Eigene Datenansicht noch offen</strong>
          <p>{guide.research.finding}</p>
        </div>
      )}
      {guide.research && guide.links.length > 0 && (
        <p className="atlas-context-footnote">
          Ergänzende Bilder zum Einordnen:
        </p>
      )}
      {guide.links.length > 0 && (
        <div
          className="atlas-context-links"
          aria-label="Bilder zu diesem Thema"
        >
          {guide.links.map((link, index) => {
            const Icon = icons[link.icon];
            const missing = [
              geography,
              ...(comparison ? [comparison] : []),
            ].filter((area) => !coverageMapped(link.family, area.id));
            return (
              <button
                key={link.label}
                type="button"
                className="atlas-context-link"
                aria-label={`${link.label} öffnen`}
                aria-describedby={`${id}-${index}`}
                onClick={() => onNavigate(atlasContextTarget(guide, link))}
              >
                <span className="atlas-context-icon">
                  <Icon size={25} aria-hidden="true" />
                </span>
                <span className="atlas-context-copy" id={`${id}-${index}`}>
                  <strong>{link.label}</strong>
                  <span>{link.explanation}</span>
                  <small>
                    {link.source} · {link.horizon}
                  </small>
                  {missing.length > 0 && (
                    <span className="atlas-context-missing">
                      Kein eigenes Quellenprofil für{" "}
                      {missing.map((area) => area.label).join(" und ")}.
                    </span>
                  )}
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
      <p className="atlas-context-boundary">{guide.boundary}</p>
      {guide.research && (
        <details className="atlas-details atlas-research-sources">
          <summary>Quellenprüfung und offene Datenfragen</summary>
          <p>
            Inhaltlich geprüft am{" "}
            {new Date(
              `${topicResearchReviewedAt}T12:00:00Z`,
            ).toLocaleDateString("de-DE")}
            . Diese Einordnung betrifft Quellen und Definitionen; sie bestätigt
            keine vollständige Datenhistorie für {geography.label}.
          </p>
          {guide.research.sourceIds.map((sourceId) => {
            const source = topicResearchSources[sourceId];
            return (
              <section key={sourceId}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    if (isTauri()) {
                      event.preventDefault();
                      setLinkError(false);
                      void openUrl(source.url).catch(() => setLinkError(true));
                    }
                  }}
                >
                  {source.label}
                </a>
                <p>{source.finding}</p>
              </section>
            );
          })}
          {linkError && (
            <p role="alert">Die externe Quelle konnte nicht geöffnet werden.</p>
          )}
        </details>
      )}
      {guide.links.length > 0 && (
        <p className="atlas-context-footnote">
          Land und Vergleich bleiben erhalten. Verfügbare Jahre und Lücken zeigt
          die jeweilige Datenansicht; ein zugeordnetes Quellenprofil garantiert
          noch keine Werte für jede Messgröße.
        </p>
      )}
    </div>
  );
}
