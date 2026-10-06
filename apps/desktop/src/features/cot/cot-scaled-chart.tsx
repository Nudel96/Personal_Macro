import { useState, type FormEvent } from "react";
import type { EChartsOption } from "echarts";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { BaseChart } from "../../charts/base-chart";
import { Button } from "../../components/ui/button";
import { unitLabel } from "./cot-chart-options";
import type { CotUnit } from "./cot-chart-data";

type Extent = [number, number];

function AxisEditor({
  label,
  extent,
  onApply,
}: {
  label: string;
  extent: Extent;
  onApply: (extent: Extent) => void;
}) {
  const [minimum, setMinimum] = useState(String(extent[0]));
  const [maximum, setMaximum] = useState(String(extent[1]));
  const [error, setError] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const min = Number(minimum.trim().replace(",", "."));
    const max = Number(maximum.trim().replace(",", "."));
    if (
      !minimum.trim() ||
      !maximum.trim() ||
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min >= max ||
      !Number.isFinite(max - min)
    ) {
      setError(true);
      return;
    }
    setError(false);
    onApply([min, max]);
  };
  return (
    <form className="cot-axis-form" onSubmit={submit}>
      <label>
        Min
        <input
          className="input"
          inputMode="decimal"
          aria-label={`${label} Achsenminimum`}
          aria-invalid={error}
          value={minimum}
          onChange={(event) => setMinimum(event.target.value)}
        />
      </label>
      <label>
        Max
        <input
          className="input"
          inputMode="decimal"
          aria-label={`${label} Achsenmaximum`}
          aria-invalid={error}
          value={maximum}
          onChange={(event) => setMaximum(event.target.value)}
        />
      </label>
      <Button
        size="sm"
        type="submit"
        aria-label={`${label} Achsengrenzen übernehmen`}
      >
        Anwenden
      </Button>
      {error && (
        <p className="cot-axis-error" role="alert">
          Gültige Zahlen eingeben: Minimum muss kleiner als Maximum sein.
        </p>
      )}
    </form>
  );
}

/** Explicit per-chart viewports; the underlying reports are never transformed. */
export function CotScaledChart({
  label,
  ariaLabel,
  unit,
  automaticExtent,
  option,
}: {
  label: string;
  ariaLabel: string;
  unit: CotUnit;
  automaticExtent: Extent;
  option: (extent: Extent) => EChartsOption;
}) {
  const [manual, setManual] = useState<Extent | null>(null);
  const extent = manual ?? automaticExtent;
  const zoom = (factor: number) => {
    const center = extent[0] / 2 + extent[1] / 2;
    const half = ((extent[1] - extent[0]) / 2) * factor;
    const bounds: Extent = [center - half, center + half];
    if (bounds.every(Number.isFinite) && bounds[0] < bounds[1])
      setManual(bounds);
  };
  return (
    <div className="cot-scaled-chart">
      <BaseChart height={320} ariaLabel={ariaLabel} option={option(extent)} />
      <details className="cot-axis-controls">
        <summary>
          Werteskala · {manual ? "manuell für diesen Chart" : "automatisch"}
        </summary>
        <div className="cot-axis-actions">
          <span>{unitLabel(unit)}</span>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`${label} vertikal herauszoomen`}
            onClick={() => zoom(1.4)}
          >
            <Minus size={14} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`${label} vertikal hineinzoomen`}
            onClick={() => zoom(1 / 1.4)}
          >
            <Plus size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`${label} Werteskala zurücksetzen`}
            onClick={() => setManual(null)}
          >
            <RotateCcw size={13} /> Auto
          </Button>
        </div>
        <AxisEditor
          key={`${extent[0]}:${extent[1]}`}
          label={label}
          extent={extent}
          onApply={setManual}
        />
        <p>
          Zoom und Grenzen gelten für diesen Chart. „Auto“ stellt die gewählte
          Vergleichsskala wieder her.
        </p>
      </details>
    </div>
  );
}
