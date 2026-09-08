import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  availabilityReason,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
  availabilityReason?: string;
}) {
  return (
    <div className={`empty-state${compact ? " compact" : ""}`}>
      <div className="empty-icon" aria-hidden="true">
        <Icon size={21} />
      </div>
      <div className="empty-title">{title}</div>
      <div className="empty-copy">{description}</div>
      {availabilityReason && (
        <div className="availability-reason">{availabilityReason}</div>
      )}
      {action}
    </div>
  );
}
