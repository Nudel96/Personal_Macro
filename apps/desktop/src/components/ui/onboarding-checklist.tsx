import { CheckCircle2, ChevronDown, Circle, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  complete: boolean;
  action?: ReactNode;
}

export function OnboardingChecklist({
  steps,
  collapsed,
  onCollapsedChange,
  onDismiss,
}: {
  steps: OnboardingStep[];
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onDismiss: () => void;
}) {
  const complete = steps.filter((step) => step.complete).length;
  const nextStep = steps.find((step) => !step.complete);

  return (
    <section className={`onboarding-card${collapsed ? " is-collapsed" : ""}`}>
      <div className="onboarding-header">
        <div>
          <div className="page-eyebrow">Erste Schritte</div>
          <strong>
            Dein Journal ist bereit für den ersten aussagekräftigen Blick.
          </strong>
          <span className="onboarding-progress">
            {complete} von {steps.length} erledigt
          </span>
        </div>
        <div className="onboarding-actions">
          <Button
            size="icon"
            variant="ghost"
            aria-label={
              collapsed
                ? "Erste Schritte ausklappen"
                : "Erste Schritte einklappen"
            }
            onClick={() => onCollapsedChange(!collapsed)}
          >
            <ChevronDown className={collapsed ? "rotate-180" : ""} size={16} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Erste Schritte ausblenden"
            onClick={onDismiss}
          >
            <X size={16} />
          </Button>
        </div>
      </div>
      {!collapsed && (
        <div className="onboarding-steps">
          {steps.map((step, index) => (
            <div
              className={`onboarding-step${step.complete ? " complete" : ""}`}
              key={step.id}
            >
              {step.complete ? (
                <CheckCircle2 size={17} />
              ) : (
                <Circle size={17} />
              )}
              <div className="onboarding-copy">
                <strong>
                  {index + 1}. {step.title}
                </strong>
                <span>{step.description}</span>
              </div>
              {!step.complete && step.id === nextStep?.id && step.action}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
