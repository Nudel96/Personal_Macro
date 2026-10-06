import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { ArrowLeftRight, RefreshCw } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { api, isTauri } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import type {
  CotAssetDetail,
  CotDashboard,
  CotParticipantPoint,
} from "../../types/domain";
import {
  buildSeasonality,
  annualHistory,
  cotGroups,
  currentSeason,
  historyExtent,
  historyLines,
  fittedExtent,
  netValue,
  participantHistory,
  seasonalWindows,
  sharedExtent,
  type CotGroup,
  type CotUnit,
} from "./cot-chart-data";
import {
  annualOption,
  formatNet,
  historyOption,
  seasonalOption,
} from "./cot-chart-options";
import { CotScaledChart } from "./cot-scaled-chart";
import "./cot-comparison.css";

type ScaleMode = "shared" | "individual" | "zero";
function ScaleSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ScaleMode;
  onChange: (value: ScaleMode) => void;
}) {
  return (
    <label>
      Werteskala
      <select
        className="input"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as ScaleMode)}
      >
        <option value="shared">Gemeinsam · an Daten anpassen</option>
        <option value="individual">Je Markt · an Daten anpassen</option>
        <option value="zero">Gemeinsam · symmetrisch um Null</option>
      </select>
    </label>
  );
}

function comparisonScales(values: (number | null)[][], mode: ScaleMode) {
  const shared =
    mode === "zero" ? sharedExtent(values.flat()) : fittedExtent(values.flat());
  return mode === "individual"
    ? values.map(fittedExtent)
    : values.map(() => shared);
}

function useCotHistory(symbol: string, dashboard: CotDashboard) {
  return useQuery({
    queryKey: [
      "cot",
      "chart-history",
      dashboard.cloudGeneration,
      dashboard.lastSyncedAt,
      symbol,
    ],
    queryFn: () =>
      api.cotAssetDetail(
        { symbol, lookbackWeeks: 0 },
        dashboard.cloudGeneration,
      ),
    enabled: dashboard.contracts.some((contract) => contract.symbol === symbol),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

function ChartState({
  query,
  symbol,
  available,
  children,
}: {
  query: UseQueryResult<CotAssetDetail, Error>;
  symbol: string;
  available: boolean;
  children: ReactNode;
}) {
  if (!available)
    return (
      <div className="cot-chart-empty">
        Für {symbol} ist noch kein CFTC-Kontrakt verfügbar.
      </div>
    );
  if (query.isPending)
    return (
      <div className="cot-chart-empty" role="status">
        Historie für {symbol} wird geladen …
      </div>
    );
  if (query.isError)
    return (
      <div className="cot-chart-empty" role="alert">
        <p>Die Historie für {symbol} konnte nicht geladen werden.</p>
        <Button size="sm" onClick={() => void query.refetch()}>
          Erneut versuchen
        </Button>
      </div>
    );
  return children;
}

function HistoryCoverage({
  points,
  unit,
}: {
  points: CotParticipantPoint[];
  unit: CotUnit;
}) {
  const latest = points[points.length - 1];
  return (
    <div className="cot-chart-values">
      {cotGroups.map((group) => (
        <div key={group.key}>
          <span>
            <i style={{ background: group.color }} />
            {group.label}
          </span>
          <strong>
            {latest
              ? formatNet(netValue(latest, group.key, unit), unit)
              : "Nicht verfügbar"}
          </strong>
        </div>
      ))}
    </div>
  );
}

export function CotComparison({
  dashboard,
  selected,
  onSelect,
}: {
  dashboard: CotDashboard;
  selected: [string, string];
  onSelect: (pair: [string, string]) => void;
}) {
  const client = useQueryClient();
  const [years, setYears] = useState(5);
  const [unit, setUnit] = useState<CotUnit>("contracts");
  const [group, setGroup] = useState<CotGroup>("nonCommercialNet");
  const [windows, setWindows] = useState<number[]>([5, 10, 15]);
  const [showCurrent, setShowCurrent] = useState(true);
  const referenceYear = new Date().getUTCFullYear();
  const [seasonalView, setSeasonalView] = useState<"average" | "year">(
    "average",
  );
  const [selectedYear, setSelectedYear] = useState(referenceYear - 1);
  const [historyScaleMode, setHistoryScaleMode] = useState<ScaleMode>("shared");
  const [seasonalScaleMode, setSeasonalScaleMode] =
    useState<ScaleMode>("shared");
  const left = useCotHistory(selected[0], dashboard);
  const right = useCotHistory(selected[1], dashboard);
  const leftPoints = useMemo(() => participantHistory(left.data), [left.data]);
  const rightPoints = useMemo(
    () => participantHistory(right.data),
    [right.data],
  );
  const model = useMemo(() => {
    const histories = [leftPoints, rightPoints];
    const dates = historyExtent(histories, years);
    const historyScales = comparisonScales(
      histories.map((points) =>
        cotGroups.flatMap((entry) =>
          historyLines(points, entry.key, unit, ...dates).map(
            ([, value]) => value,
          ),
        ),
      ),
      historyScaleMode,
    );
    const seasonal = histories.map((points) => ({
      curves: windows.map((window) =>
        buildSeasonality(points, group, unit, window, referenceYear),
      ),
      current: showCurrent
        ? currentSeason(points, group, unit, referenceYear)
        : null,
      annual: annualHistory(points, group, unit, selectedYear),
    }));
    const seasonalScales = comparisonScales(
      seasonal.map((data) =>
        seasonalView === "year"
          ? data.annual.map((report) => report.value[1])
          : [
              ...data.curves.flatMap((curve) => curve.values),
              ...(data.current ?? []),
            ],
      ),
      seasonalScaleMode,
    );
    const availableYears = [
      ...new Set([
        selectedYear,
        ...histories
          .flat()
          .map((point) => Number(point.reportDate.slice(0, 4))),
      ]),
    ]
      .filter((year) => Number.isInteger(year) && year <= referenceYear)
      .sort((a, b) => b - a);
    return {
      histories,
      dates,
      historyScales,
      seasonal,
      seasonalScales,
      availableYears,
    };
  }, [
    leftPoints,
    rightPoints,
    years,
    unit,
    group,
    windows,
    referenceYear,
    showCurrent,
    selectedYear,
    seasonalView,
    historyScaleMode,
    seasonalScaleMode,
  ]);
  const refresh = useMutation({
    mutationFn: api.syncCot,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["cot"] });
      await client.invalidateQueries({ queryKey: ["macro"] });
    },
  });
  const selectedGroup = cotGroups.find((item) => item.key === group)!;
  const oldDesktop =
    isTauri() &&
    [left, right].some((query) => query.data && !query.data.participantSeries);
  const missingParticipants = model.histories.some(
    (points) =>
      points.length > 0 &&
      ["commercialNet", "nonReportableNet"].some(
        (key) =>
          !points.some(
            (point) => netValue(point, key as CotGroup, unit) != null,
          ),
      ),
  );

  return (
    <section className="cot-comparison" aria-label="COT-Marktvergleich">
      <Card>
        <CardHeader
          title="COT Insights · Marktvergleich"
          subtitle="Zwei Märkte, drei Teilnehmergruppen. Gemeinsame Zeitachsen und Werteskalen."
          action={
            isTauri() && !isPrivateWeb() ? (
              <Button
                size="sm"
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending || oldDesktop}
              >
                <RefreshCw
                  size={14}
                  className={refresh.isPending ? "spin" : undefined}
                />
                {refresh.isPending
                  ? "Historien werden geladen …"
                  : "Historien laden"}
              </Button>
            ) : undefined
          }
        />
        <CardContent>
          <div className="cot-market-selectors">
            {[0, 1].map((side) => (
              <label
                className={`cot-market-select cot-market-select-${side}`}
                key={side}
              >
                <span>{side === 0 ? "Linker Markt" : "Rechter Markt"}</span>
                <select
                  className="input"
                  value={selected[side]}
                  aria-label={
                    side === 0 ? "Linker COT-Markt" : "Rechter COT-Markt"
                  }
                  onChange={(event) =>
                    onSelect(
                      side === 0
                        ? [event.target.value, selected[1]]
                        : [selected[0], event.target.value],
                    )
                  }
                >
                  {!dashboard.contracts.some(
                    (item) => item.symbol === selected[side],
                  ) && (
                    <option value={selected[side]}>
                      {selected[side]} · nicht verfügbar
                    </option>
                  )}
                  {dashboard.contracts.map((item) => (
                    <option key={item.symbol} value={item.symbol}>
                      {item.symbol} · {item.displayName}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <Button
              className="cot-swap"
              size="icon"
              aria-label="COT-Märkte tauschen"
              title="Märkte tauschen"
              onClick={() => onSelect([selected[1], selected[0]])}
            >
              <ArrowLeftRight size={16} />
            </Button>
          </div>
          <div className="cot-comparison-controls">
            <label>
              Historischer Verlauf
              <select
                className="input"
                aria-label="COT-Zeitraum"
                value={years}
                onChange={(event) => setYears(Number(event.target.value))}
              >
                {[1, 3, 5, 10, 15, 0].map((value) => (
                  <option key={value} value={value}>
                    {value === 0
                      ? "Gesamte Historie"
                      : `${value} ${value === 1 ? "Jahr" : "Jahre"}`}
                  </option>
                ))}
              </select>
            </label>
            <ScaleSelector
              label="Werteskala COT-Verlauf"
              value={historyScaleMode}
              onChange={setHistoryScaleMode}
            />
            <label>
              Darstellung für beide Märkte
              <select
                className="input"
                aria-label="COT-Einheit"
                value={unit}
                onChange={(event) => setUnit(event.target.value as CotUnit)}
              >
                <option value="contracts">Netto-Kontrakte</option>
                <option value="percentOi">Netto in % des Open Interest</option>
              </select>
            </label>
            <p>
              Netto = Long − Short. Für Märkte mit unterschiedlicher Größe
              eignet sich die Ansicht in % des Open Interest.
            </p>
          </div>
          {refresh.isError && (
            <p className="notice" role="alert">
              {refresh.error.message ||
                "Die CFTC-Historien konnten nicht aktualisiert werden."}
            </p>
          )}
          {oldDesktop ? (
            <p className="notice" role="status">
              Die laufende Desktop-Version liefert noch keine Commercials- und
              Non-Reportables-Historie. App schließen und über
              START-MACROTOOL.cmd neu starten, danach „Historien laden“ wählen.
            </p>
          ) : missingParticipants ? (
            <p className="notice" role="status">
              Die zusätzlichen Teilnehmerdaten sind in diesem Datenstand noch
              nicht geladen.{" "}
              {isTauri()
                ? "„Historien laden“ ergänzt Commercials und Non-Reportables über die gesamte CFTC-Historie."
                : "Dafür wird ein aktualisiertes COT-Datenpaket benötigt."}
            </p>
          ) : null}
          {refresh.isSuccess && !missingParticipants && !oldDesktop && (
            <p className="cot-chart-note" role="status">
              Die CFTC-Historien wurden aktualisiert.
            </p>
          )}
        </CardContent>
      </Card>

      <div
        className="cot-comparison-scroll"
        tabIndex={0}
        role="region"
        aria-label="COT-Charts nebeneinander, auf kleinen Bildschirmen horizontal scrollbar"
      >
        <div className="cot-chart-grid">
          {[left, right].map((query, side) => {
            const points = model.histories[side];
            const contract = dashboard.contracts.find(
              (item) => item.symbol === selected[side],
            );
            const visible = points.filter(
              (point) =>
                Date.parse(`${point.reportDate}T00:00:00Z`) >= model.dates[0],
            );
            const missing = cotGroups.filter(
              (entry) =>
                !visible.some(
                  (point) => netValue(point, entry.key, unit) != null,
                ),
            );
            return (
              <Card className="cot-chart-card" key={`history-${side}`}>
                <CardHeader
                  title={`${selected[side]} · COT-Verlauf`}
                  subtitle={`${contract?.displayName ?? selected[side]} · Legacy Futures Only`}
                />
                <CardContent>
                  <ChartState
                    query={query}
                    symbol={selected[side]}
                    available={!!contract}
                  >
                    {visible.length ? (
                      <>
                        <CotScaledChart
                          key={`${selected[side]}-${unit}-${years}-${historyScaleMode}`}
                          label={`${side === 0 ? "Links" : "Rechts"} COT-Verlauf`}
                          unit={unit}
                          automaticExtent={model.historyScales[side]}
                          ariaLabel={`${selected[side]} COT-Netto-Positionen der drei Teilnehmergruppen`}
                          option={(extent) =>
                            historyOption(points, unit, model.dates, extent)
                          }
                        />
                        <HistoryCoverage points={visible} unit={unit} />
                        <p className="cot-chart-note">
                          Berichte {visible[0].reportDate} –{" "}
                          {visible[visible.length - 1].reportDate} ·{" "}
                          {visible.length} Beobachtungen
                        </p>
                        {missing.length > 0 && (
                          <p className="cot-chart-note">
                            Noch nicht im Datenstand:{" "}
                            {missing.map((entry) => entry.label).join(", ")}.
                            {isTauri()
                              ? " Über „Historien laden“ ergänzen."
                              : " Wird mit einem erweiterten COT-Datenpaket verfügbar."}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="cot-chart-empty">
                        Keine COT-Berichte im gewählten Zeitraum.
                      </div>
                    )}
                  </ChartState>
                </CardContent>
              </Card>
            );
          })}

          <div className="cot-seasonal-toolbar">
            <div>
              <h3>COT-Saisonalität</h3>
              <p>Wöchentliche Netto-Positionen · keine zusätzliche Glättung</p>
            </div>
            <label>
              Ansicht
              <select
                className="input"
                aria-label="Saisonale COT-Ansicht"
                value={seasonalView}
                onChange={(event) =>
                  setSeasonalView(event.target.value as "average" | "year")
                }
              >
                <option value="average">Mehrjähriger Durchschnitt</option>
                <option value="year">Einzeljahr · Originalberichte</option>
              </select>
            </label>
            <label>
              Teilnehmergruppe
              <select
                className="input"
                aria-label="Saisonale COT-Teilnehmergruppe"
                value={group}
                onChange={(event) => setGroup(event.target.value as CotGroup)}
              >
                {cotGroups.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            {seasonalView === "average" ? (
              <fieldset>
                <legend>Rückblicke</legend>
                <div className="cot-window-options">
                  {seasonalWindows.map((window) => (
                    <label key={window}>
                      <input
                        type="checkbox"
                        checked={windows.includes(window)}
                        disabled={
                          windows.length === 1 && windows.includes(window)
                        }
                        onChange={() =>
                          setWindows((current) =>
                            current.includes(window)
                              ? current.filter((value) => value !== window)
                              : [...current, window].sort((a, b) => a - b),
                          )
                        }
                      />
                      {window} Jahre
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <label>
                Kalenderjahr
                <select
                  className="input"
                  aria-label="Saisonales COT-Jahr"
                  value={selectedYear}
                  onChange={(event) =>
                    setSelectedYear(Number(event.target.value))
                  }
                >
                  {model.availableYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {seasonalView === "average" && (
              <label className="cot-current-toggle">
                <input
                  type="checkbox"
                  checked={showCurrent}
                  onChange={(event) => setShowCurrent(event.target.checked)}
                />
                {referenceYear} einblenden
              </label>
            )}
            <ScaleSelector
              label="Werteskala COT-Saisonalität"
              value={seasonalScaleMode}
              onChange={setSeasonalScaleMode}
            />
          </div>

          {[left, right].map((query, side) => {
            const data = model.seasonal[side];
            const hasSeasonal = data.curves.some((curve) =>
              curve.values.some((value) => value != null),
            );
            const hasCurrent = data.current?.some((value) => value != null);
            const reportCount = data.annual.filter(
              (report) => report.value[1] != null,
            ).length;
            const hasData =
              seasonalView === "year"
                ? reportCount > 0
                : hasSeasonal || hasCurrent;
            const missingGroup = !model.histories[side].some(
              (point) => netValue(point, group, unit) != null,
            );
            const available = dashboard.contracts.some(
              (item) => item.symbol === selected[side],
            );
            return (
              <Card className="cot-chart-card" key={`seasonal-${side}`}>
                <CardHeader
                  title={`${selected[side]} · COT-Saisonalität`}
                  subtitle={`${selectedGroup.label} · ${seasonalView === "year" ? `${selectedYear} · Originalberichte` : "Durchschnitt"}`}
                />
                <CardContent>
                  <ChartState
                    query={query}
                    symbol={selected[side]}
                    available={available}
                  >
                    {hasData ? (
                      <CotScaledChart
                        key={`${selected[side]}-${unit}-${group}-${seasonalView}-${selectedYear}-${seasonalScaleMode}`}
                        label={`${side === 0 ? "Links" : "Rechts"} COT-Saisonalität`}
                        unit={unit}
                        automaticExtent={model.seasonalScales[side]}
                        ariaLabel={`${selected[side]} saisonale COT-Netto-Positionen`}
                        option={(extent) =>
                          seasonalView === "year"
                            ? annualOption(
                                model.histories[side],
                                group,
                                unit,
                                selectedYear,
                                extent,
                              )
                            : seasonalOption(
                                data.curves,
                                data.current,
                                referenceYear,
                                unit,
                                extent,
                              )
                        }
                      />
                    ) : (
                      <div className="cot-chart-empty">
                        {missingGroup
                          ? `Für ${selectedGroup.label} sind in diesem Datenstand noch keine Teilnehmerdaten geladen. ${oldDesktop ? "Bitte die Desktop-App mit dem neuen Build neu starten." : isTauri() ? "Über „Historien laden“ ergänzen." : "Ein aktualisiertes COT-Datenpaket ist erforderlich."}`
                          : seasonalView === "year"
                            ? `Keine Berichte für ${selectedGroup.label} im Jahr ${selectedYear}.`
                            : `Noch keine ausreichende Historie für ${selectedGroup.label}. Eine Durchschnittskurve benötigt mindestens drei vollständige Jahre je Jahreswoche. Einzelne vorhandene Jahre lassen sich unter „Einzeljahr · Originalberichte“ ansehen.`}
                      </div>
                    )}
                    {seasonalView === "year" ? (
                      <p className="cot-chart-note">
                        {selectedYear} · {reportCount} Originalberichte · ohne
                        Mittelung. Lücken bleiben sichtbar.
                      </p>
                    ) : (
                      <div className="cot-seasonal-samples">
                        {data.curves.map((curve) => (
                          <p
                            key={curve.years}
                            title={
                              curve.includedYears.length
                                ? `Enthaltene Jahre: ${curve.includedYears.join(", ")}`
                                : "Keine vollständigen Jahre"
                            }
                          >
                            <strong>{curve.years} J.</strong>
                            <span>
                              {curve.fromYear}–{curve.toYear}
                            </span>
                            <span>
                              n = {curve.includedYears.length} vollständige
                              Jahre
                              {curve.includedYears.length < 3
                                ? " · nicht verfügbar"
                                : curve.includedYears.length < 5
                                  ? " · explorativ"
                                  : ""}
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                  </ChartState>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
      <details className="cot-chart-method">
        <summary>Berechnung, Teilnehmer und Datenabdeckung</summary>
        <p>
          Commercials, Non-Commercials (große Spekulanten) und Non-Reportables
          stammen aus demselben CFTC-Bericht. Non-Reportables sind Positionen
          unterhalb der Meldegrenze; die Gruppe ist nicht ausschließlich Retail.
          Die Linienfarben kennzeichnen Teilnehmer, keine Handelsrichtung.
        </p>
        <p>
          Die Saisonalität mittelt Netto-Bestände, keine Renditen. Jedes
          historische Jahr zählt gleich. Ein vollständiges Jahr benötigt
          mindestens 50 Berichte, einen Stand bis 7. Januar und ab 25. Dezember
          sowie höchstens zehn Tage Abstand zwischen nutzbaren Berichten. Das
          laufende Jahr bleibt aus den Mittelwerten ausgeschlossen und wird
          separat gestrichelt gezeigt.
        </p>
        <p>
          Jahreswoche 1 umfasst 1.–7. Januar, die letzte 24.–31. Dezember. Der
          29. Februar wird dem 28. Februar zugeordnet. Mehrere Berichte
          derselben Jahreswoche werden zuerst je Jahr gemittelt. Wochen ohne
          Werte bleiben offen; weniger als drei beitragende Jahre ergeben keine
          Kurve, unter fünf Jahren ist sie explorativ. Die konkrete Stichprobe
          steht im Tooltip, die enthaltenen Jahre bei den Rückblicken.
        </p>
        <p>
          Keine zusätzliche Glättung oder Ergänzung fehlender Werte. Die Ansicht
          „Einzeljahr“ zeigt jeden Originalbericht ohne Wochenmittelung; der
          3-Jahres- Rückblick mittelt weniger Jahre. Die automatische Skala kann
          gemeinsam, je Markt oder symmetrisch um Null gewählt werden. Manuelle
          Grenzen und Zoom ändern nur den sichtbaren Ausschnitt des jeweiligen
          Diagramms. Bei unterschiedlicher Datenabdeckung können die Stichproben
          abweichen. Netto-Bestände sind nicht auf 100 normiert. Die bestehende
          COT- und Macro-Bewertung wird dadurch nicht verändert.
        </p>
      </details>
    </section>
  );
}
