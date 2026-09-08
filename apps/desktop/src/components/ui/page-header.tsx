import type { ReactNode } from "react";
import { Layers3, type LucideIcon } from "lucide-react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  context,
  icon: Icon = Layers3,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  context?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <header className="page-header">
      <div className="page-heading">
        <span className="page-heading-icon" aria-hidden="true">
          <Icon size={22} strokeWidth={1.7} />
        </span>
        <div className="page-heading-copy">
          {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
          <h1 className="page-title">{title}</h1>
          {description && <p className="page-description">{description}</p>}
        </div>
      </div>
      {context && <div className="page-context">{context}</div>}
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
