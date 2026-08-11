import type { ReactNode } from "react";

export function DataStatusStrip({
  status,
  quality,
  detail,
  action,
}: {
  status: ReactNode;
  quality: ReactNode;
  detail: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="data-status-strip" aria-label="Datenstatus">
      <div>
        <span>Status</span>
        <strong>{status}</strong>
      </div>
      <div>
        <span>Qualität</span>
        <strong>{quality}</strong>
      </div>
      <div className="data-status-detail">
        <span>Nächster Schritt</span>
        <strong>{detail}</strong>
      </div>
      {action && <div className="data-status-action">{action}</div>}
    </section>
  );
}
