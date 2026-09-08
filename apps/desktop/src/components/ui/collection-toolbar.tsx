import { Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";

export function CollectionToolbar({
  label,
  value,
  onChange,
  count,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  count: number;
  children?: ReactNode;
}) {
  return (
    <div className="collection-toolbar">
      <label className="collection-search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          aria-label={label}
          placeholder={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {value && (
        <Button size="sm" variant="ghost" onClick={() => onChange("")}>
          <X size={13} /> Suche zurücksetzen
        </Button>
      )}
      {children}
      <span className="collection-count" role="status">
        {count} {count === 1 ? "Eintrag" : "Einträge"}
      </span>
    </div>
  );
}
