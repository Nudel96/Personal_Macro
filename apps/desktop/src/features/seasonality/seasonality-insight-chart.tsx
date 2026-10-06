import * as Dialog from "@radix-ui/react-dialog";
import { Maximize2, RotateCcw, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { BaseChart } from "../../charts/base-chart";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import type { SeasonalityAnalysis } from "../../types/domain";
import {
  annualOption,
  defaultChartSettings,
  formatSeasonalValue,
  fullscreenChartHeight,
  rawSeasonalValue,
  seasonalDay,
  seasonalDayLabel,
  smoothAnnualCurve,
  smoothingWindow,
  windowContextZoom,
  type SeasonalityChartSettings,
} from "./seasonality-annual-chart";
import "./seasonality-insight-chart.css";

interface ChartProps {
  analysis: SeasonalityAnalysis;
  settings: SeasonalityChartSettings;
  onSettingsChange: (settings: SeasonalityChartSettings) => void;
}

export function SeasonalityInsightChart(props: ChartProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [inspectedDay, setInspectedDay] = useState(
    seasonalDay(props.analysis.referenceDate) ?? 1,
  );
  const [height, setHeight] = useState(440);
  useEffect(() => {
    if (!fullscreen) return;
    const resize = () => setHeight(fullscreenChartHeight(window.innerHeight));
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [fullscreen]);
  const body = (expanded: boolean) => (
    <ChartBody
      {...props}
      height={expanded ? height : 380}
      inspectedDay={inspectedDay}
      onInspectDay={setInspectedDay}
    />
  );
  return (
    <Dialog.Root open={fullscreen} onOpenChange={setFullscreen}>
      <Card className="seasonality-annual-card seasonality-insight-card">
        <CardHeader
          title="Saisonaler Jahresverlauf"
          subtitle={`${props.analysis.symbol} · Durchschnitt aus ${props.analysis.selectedYears.length} Jahren`}
          action={
            <Dialog.Trigger asChild>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Seasonality-Chart im Vollbild öffnen"
              >
                <Maximize2 size={15} aria-hidden="true" /> Vergrößern
              </Button>
            </Dialog.Trigger>
          }
        />
        <CardContent>{body(false)}</CardContent>
      </Card>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content seasonality-fullscreen-dialog seasonality-insight-fullscreen">
          <header className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">
                {props.analysis.symbol} · Saisonaler Jahresverlauf
              </Dialog.Title>
              <Dialog.Description className="dialog-description">
                {props.analysis.selectedYears.length} ausgewählte Jahre ·{" "}
                {props.analysis.dataSource}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Vollbild schließen"
              >
                <X size={18} />
              </Button>
            </Dialog.Close>
          </header>
          <div className="seasonality-insight-fullscreen-body">
            {body(true)}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ChartBody({
  analysis,
  settings,
  onSettingsChange,
  height,
  inspectedDay,
  onInspectDay,
}: ChartProps & {
  height: number;
  inspectedDay: number;
  onInspectDay: (day: number) => void;
}) {
  const id = useId();
  const days = smoothingWindow(settings.smoothingDays);
  const hasData = analysis.annualCurve.some(
    (point) => rawSeasonalValue(point) != null,
  );
  const update = (next: Partial<SeasonalityChartSettings>) =>
    onSettingsChange({ ...settings, ...next });
  const option = useMemo(
    () => annualOption(analysis, settings, inspectedDay),
    [analysis, settings, inspectedDay],
  );
  const display = useMemo(
    () => smoothAnnualCurve(analysis.annualCurve, days),
    [analysis.annualCurve, days],
  );
  const index = analysis.annualCurve.findIndex(
    (point) => point.day === inspectedDay,
  );
  const point = analysis.annualCurve[index];
  const format = (value?: number | null) =>
    formatSeasonalValue(value, settings.scale);
  const smoothingLabel = days === 1 ? "Ohne Glättung" : `${days} Kalendertage`;
  const events = {
    click: (params: unknown) => {
      const event = params as { componentType?: string; dataIndex?: number };
      if (event.componentType !== "series" || event.dataIndex == null) return;
      const clicked = analysis.annualCurve[event.dataIndex];
      if (clicked) onInspectDay(clicked.day);
    },
    datazoom: (params: unknown) => {
      const event = params as {
        start?: number;
        end?: number;
        batch?: Array<{ start?: number; end?: number }>;
      };
      const { start, end } = event.batch?.[0] ?? event;
      if (
        start != null &&
        end != null &&
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start >= 0 &&
        end <= 100 &&
        start < end
      ) {
        update({ zoom: [start, end] });
      }
    },
  };
  return (
    <div className="seasonality-insight-body">
      <div className="seasonality-insight-toolbar">
        <div className="seasonality-smoothing-control">
          <label htmlFor={`${id}-smoothing`}>
            Glättung <strong>{smoothingLabel}</strong>
          </label>
          <div className="seasonality-smoothing-input">
            <input
              id={`${id}-smoothing`}
              type="range"
              min={1}
              max={31}
              step={2}
              value={days}
              disabled={!hasData}
              aria-label="Glättung in Kalendertagen"
              aria-valuetext={smoothingLabel}
              aria-describedby={`${id}-method`}
              onChange={(event) =>
                update({ smoothingDays: Number(event.target.value) })
              }
            />
            <div
              className="seasonality-smoothing-presets"
              aria-label="Glättungsvorgaben"
            >
              {[1, 5, 15, 31].map((value) => (
                <button
                  type="button"
                  key={value}
                  disabled={!hasData}
                  aria-pressed={days === value}
                  aria-label={
                    value === 1 ? "Ohne Glättung" : `Glättung: ${value} Tage`
                  }
                  onClick={() => update({ smoothingDays: value })}
                >
                  {value === 1 ? "Aus" : value}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div
          className="seasonality-chart-scale"
          role="group"
          aria-label="Werteskala"
        >
          <button
            type="button"
            aria-pressed={settings.scale === "index"}
            onClick={() => update({ scale: "index" })}
          >
            Index 100
          </button>
          <button
            type="button"
            aria-pressed={settings.scale === "percent"}
            onClick={() => update({ scale: "percent" })}
          >
            Rendite %
          </button>
        </div>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Chartdarstellung zurücksetzen"
          title="Darstellung zurücksetzen"
          onClick={() => onSettingsChange({ ...defaultChartSettings })}
        >
          <RotateCcw size={15} aria-hidden="true" />
        </Button>
      </div>
      <div className="seasonality-chart-context">
        <div
          role="group"
          aria-label="Chartzeitraum"
          className="seasonality-chart-range"
        >
          <button
            type="button"
            disabled={!hasData}
            aria-pressed={settings.zoom[0] === 0 && settings.zoom[1] === 100}
            onClick={() => update({ zoom: [0, 100] })}
          >
            Ganzes Jahr
          </button>
          <button
            type="button"
            disabled={!hasData}
            title="90 Kalendertage um den Fensterstart, innerhalb desselben Jahres"
            onClick={() =>
              update({
                zoom: windowContextZoom(analysis.selectedWindow.startDate),
              })
            }
          >
            Fensterumfeld
          </button>
        </div>
        <label className="seasonality-chart-phases">
          <input
            type="checkbox"
            checked={settings.showPhases}
            disabled={!hasData}
            onChange={(event) => update({ showPhases: event.target.checked })}
          />
          Trendphasen
        </label>
      </div>
      {hasData ? (
        <>
          <BaseChart
            option={option}
            height={height}
            onEvents={events}
            ariaLabel={`Saisonaler Jahresverlauf für ${analysis.symbol}. ${smoothingLabel}. ${settings.scale === "index" ? "Index 100" : "Rendite in Prozent"}.`}
          />
          <div className="seasonality-day-inspector">
            <div className="seasonality-day-picker">
              <label htmlFor={`${id}-day`}>
                Tag prüfen <strong>{seasonalDayLabel(inspectedDay)}</strong>
              </label>
              <input
                id={`${id}-day`}
                type="range"
                min={1}
                max={365}
                value={inspectedDay}
                aria-label="Kalendertag untersuchen"
                aria-valuetext={seasonalDayLabel(inspectedDay)}
                onChange={(event) => onInspectDay(Number(event.target.value))}
              />
              <span>Kurve anklicken oder Tag verschieben</span>
            </div>
            <dl
              className="seasonality-day-values"
              aria-live="polite"
              aria-atomic="true"
            >
              <div>
                <dt>Ungeglätteter Ø</dt>
                <dd>{format(rawSeasonalValue(point))}</dd>
              </div>
              {days > 1 && (
                <div>
                  <dt>Anzeige · {days} Tage</dt>
                  <dd>{format(display[index])}</dd>
                </div>
              )}
              <div>
                <dt>Jahresmedian</dt>
                <dd>
                  {format(point && point.samples > 0 ? point.median : null)}
                </dd>
              </div>
              <div>
                <dt>Stichprobe am Tag</dt>
                <dd>
                  {point?.samples
                    ? `${point.samples} Jahre`
                    : "Nicht verfügbar"}
                  {point && point.samples > 0 && point.samples < 5 && (
                    <small>Explorativ</small>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </>
      ) : (
        <div className="seasonality-chart-empty" role="status">
          <strong>Keine Jahreskurve für diese Auswahl</strong>
          <p>
            Wähle unter „Kohorte und Analysefenster anpassen“ weitere
            vollständige Jahre.
          </p>
        </div>
      )}
      <p id={`${id}-method`} className="seasonality-chart-method">
        {days === 1
          ? "Ungeglätteter Tagesdurchschnitt der gewählten Jahre."
          : `Zentriertes Mittel über ${days} Kalendertage; an Rändern und Datenlücken verkürzt.`}{" "}
        Renditen und Trefferquoten bleiben unverändert.
        {settings.showPhases &&
          " Trendphasen folgen der festen 15-Tage-Auswertung, unabhängig vom Regler."}
      </p>
      <details className="seasonality-chart-provenance">
        <summary>
          {analysis.dataSource} · {analysis.selectedYears.length} Jahre ·
          Datenbasis
        </summary>
        <p>
          Gewählte Jahre:{" "}
          {analysis.selectedYears.length
            ? analysis.selectedYears.join(", ")
            : "keine"}
          . Jedes Jahr beginnt mit seinem ersten verfügbaren Tageskurs bei Index
          100. Die Prozentansicht zeigt die Veränderung zu dieser Basis.
        </p>
        <p>
          Tagesdefinition: {analysis.nativeTimezone ?? "provider-nativ"}.
          Wochenenden und Feiertage verwenden den nächsten verfügbaren Tageskurs
          desselben Jahres; der 29. Februar ist kein eigener Kurvenpunkt.
          Datenlücken bleiben offen. {analysis.qualityReason}
        </p>
        <p>
          „Fensterumfeld“ vergrößert 90 Kalendertage um den Fensterstart. Der
          markierte Start und die gewählte Haltedauer von{" "}
          {analysis.selectedWindow.tradingDays} Handelstagen beziehen sich auf
          die separate Fensteranalyse; ein exaktes Ausstiegsdatum wird hier
          nicht abgeleitet.
        </p>
      </details>
    </div>
  );
}
