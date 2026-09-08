import type { ReactNode } from "react";

export function WorkspaceSummary({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; detail: string }>;
}) {
  return (
    <dl className="workspace-summary">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          <p>{item.detail}</p>
        </div>
      ))}
    </dl>
  );
}
