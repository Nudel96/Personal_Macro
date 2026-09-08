import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { ArrowUpRight } from "lucide-react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn("card", className)} {...props} />;
}

export function CardHeader({
  title,
  subtitle,
  action,
  onOpen,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  onOpen?: () => void;
}) {
  return (
    <header className="card-header">
      <div className="card-heading">
        <h2 className="card-title">
          {onOpen ? (
            <button
              type="button"
              className="card-title-button"
              onClick={onOpen}
            >
              {title}
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          ) : (
            title
          )}
        </h2>
        {subtitle && <div className="card-subtitle">{subtitle}</div>}
      </div>
      {action && <div className="card-header-action">{action}</div>}
    </header>
  );
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card-content", className)} {...props} />;
}
