import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { percent } from "../../lib/utils";
import type { CotDashboard, CotPairScore } from "../../types/domain";

const forexPriority = [
  "EUR",
  "GBP",
  "AUD",
  "NZD",
  "USD",
  "CAD",
  "CHF",
  "JPY",
  "CNY",
];

export function CotPairHeatmap({
  pairs,
  selected,
  onSelect,
}: {
  pairs: CotPairScore[];
  selected: [string, string];
  onSelect: (pair: [string, string]) => void;
}) {
  const visiblePairs = pairs
    .filter((pair) => {
      const baseRank = forexPriority.indexOf(pair.base);
      const quoteRank = forexPriority.indexOf(pair.quote);
      return baseRank >= 0 && quoteRank >= 0 && baseRank < quoteRank;
    })
    .sort((left, right) => right.rawScore - left.rawScore);

  return (
    <table className="cot-heatmap-table">
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Bias</th>
          <th>Score</th>
          <th>COT Positionierung</th>
          <th>COT Kapitalfluss (4W)</th>
          <th>COT Theil-Sen-Trend (13W)</th>
        </tr>
      </thead>
      <tbody>
        {visiblePairs.map((pair) => {
          const isSelected =
            selected[0] === pair.base && selected[1] === pair.quote;
          return (
            <tr
              key={`${pair.base}:${pair.quote}`}
              className={isSelected ? "selected" : undefined}
              onClick={() => onSelect([pair.base, pair.quote])}
            >
              <th scope="row" className="heatmap-symbol">
                {pair.base}
                {pair.quote}
              </th>
              <td style={cellStyle(pair.rawScore, 4)}>{pair.biasLabel}</td>
              <td className="heatmap-total" style={cellStyle(pair.rawScore, 4)}>
                {signedInteger(pair.rawScore)}
              </td>
              <td
                className={
                  pair.positionScore == null ? "unavailable" : undefined
                }
                style={
                  pair.positionScore == null
                    ? undefined
                    : cellStyle(pair.positionScore, 2)
                }
              >
                {pair.positionScore == null
                  ? "--"
                  : signedInteger(pair.positionScore)}
              </td>
              <td
                className={pair.changeScore == null ? "unavailable" : undefined}
                style={
                  pair.changeScore == null
                    ? undefined
                    : cellStyle(pair.changeScore, 2)
                }
              >
                {pair.changeScore == null
                  ? "--"
                  : signedInteger(pair.changeScore)}
              </td>
              <td
                className={
                  pair.persistenceScore == null ? "unavailable" : undefined
                }
                style={
                  pair.persistenceScore == null
                    ? undefined
                    : cellStyle(pair.persistenceScore, 2)
                }
              >
                {pair.persistenceScore == null
                  ? "--"
                  : signedInteger(pair.persistenceScore)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function CotPairDetail({
  pair,
  selected,
}: {
  pair?: CotPairScore;
  selected: [string, string];
}) {
  return (
    <Card>
      <CardHeader
        title={`${selected[0]}/${selected[1]} COT-Breakdown`}
        subtitle="Base minus Quote; Legacy Futures Only · Non-Commercial · COT v4"
      />
      <CardContent>
        {pair ? (
          <div className="cot-pair-detail">
            <div className="settings-row">
              <span>Long-Anteil-Positionierung</span>
              <strong className={scoreTextTone(pair.positionScore ?? 0)}>
                {pair.positionScore == null
                  ? "--"
                  : signedInteger(pair.positionScore)}
              </strong>
            </div>
            <div className="settings-row">
              <span>Kapitalfluss (4 Wochen)</span>
              <strong className={scoreTextTone(pair.changeScore ?? 0)}>
                {pair.changeScore == null
                  ? "--"
                  : signedInteger(pair.changeScore)}
              </strong>
            </div>
            <div className="settings-row">
              <span>Theil-Sen-Trend (13 Wochen)</span>
              <strong className={scoreTextTone(pair.persistenceScore ?? 0)}>
                {pair.persistenceScore == null
                  ? "--"
                  : signedInteger(pair.persistenceScore)}
              </strong>
            </div>
            <div className="notice" style={{ marginTop: 12 }}>
              Bestätigter Score{" "}
              <strong>
                {signedInteger(pair.confirmedScore ?? pair.rawScore)}
              </strong>{" "}
              · Coverage {percent.format(pair.coverage)}
              {pair.reportDate ? ` · Bericht ${pair.reportDate}` : ""}
            </div>
          </div>
        ) : (
          <div className="empty-copy">
            Für dieses Paar liegen noch keine zwei COT-Signale vor.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CotOverview({ dashboard }: { dashboard?: CotDashboard }) {
  const contracts = [...(dashboard?.contracts ?? [])].sort((left, right) => {
    if (left.weeklyLongShareChange == null) return 1;
    if (right.weeklyLongShareChange == null) return -1;
    return right.weeklyLongShareChange - left.weeklyLongShareChange;
  });
  return (
    <Card style={{ marginBottom: 15 }}>
      <CardHeader
        title="COT Cross-Market-Kontext"
        subtitle="Legacy Futures Only · Non-Commercial"
      />
      <CardContent>
        <div className="notice" style={{ marginBottom: 14 }}>
          Sortierung nach der Veränderung des Non-Commercial-Long-Anteils zur
          Vorwoche. Formel: Long / (Long + Short), Differenz in Prozentpunkten.
        </div>
        <div
          className="cot-contract-grid"
          aria-label="COT Long-Short-Übersicht"
        >
          {contracts
            .filter(
              (contract) =>
                contract.longPositions != null &&
                contract.shortPositions != null,
            )
            .map((contract) => {
              const total =
                (contract.longPositions ?? 0) + (contract.shortPositions ?? 0);
              const longWidth =
                total > 0 ? ((contract.longPositions ?? 0) / total) * 100 : 50;
              return (
                <div className="cot-contract-bar" key={contract.symbol}>
                  <div className="cot-contract-bar-head">
                    <strong>{contract.symbol}</strong>
                    <span>{contract.assetClass}</span>
                  </div>
                  <div
                    className="cot-stacked-bar"
                    title={`${contract.longPositions?.toLocaleString("de-DE")} Long / ${contract.shortPositions?.toLocaleString("de-DE")} Short`}
                  >
                    <span style={{ width: `${longWidth}%` }} />
                    <i style={{ width: `${100 - longWidth}%` }} />
                  </div>
                </div>
              );
            })}
        </div>
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="data-table compact cot-contract-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Long</th>
                <th>Short</th>
                <th>Δ Long</th>
                <th>Δ Short</th>
                <th>Long %</th>
                <th>Short %</th>
                <th>Long-Anteil Δ zur Vorwoche</th>
                <th>Netto</th>
                <th>Open Interest</th>
                <th>Δ OI</th>
                <th>Position</th>
                <th>Flow</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <tr key={contract.symbol}>
                  <td>
                    <strong>{contract.symbol}</strong>
                    <span className="table-secondary">
                      {contract.displayName} · Legacy Futures Only
                    </span>
                  </td>
                  <td>
                    {contract.longPositions?.toLocaleString("de-DE") ?? "--"}
                  </td>
                  <td>
                    {contract.shortPositions?.toLocaleString("de-DE") ?? "--"}
                  </td>
                  <td className={scoreTextTone(contract.longChange ?? 0)}>
                    {contract.longChange == null
                      ? "--"
                      : signedInteger(contract.longChange)}
                  </td>
                  <td className={scoreTextTone(contract.shortChange ?? 0)}>
                    {contract.shortChange == null
                      ? "--"
                      : signedInteger(contract.shortChange)}
                  </td>
                  <td>
                    {contract.longShare == null
                      ? "--"
                      : percent.format(contract.longShare)}
                  </td>
                  <td>
                    {contract.shortShare == null
                      ? "--"
                      : percent.format(contract.shortShare)}
                  </td>
                  <td
                    className={scoreTextTone(
                      contract.weeklyLongShareChange ?? 0,
                    )}
                  >
                    {contract.weeklyLongShareChange == null
                      ? "--"
                      : signedPercentagePoints(contract.weeklyLongShareChange)}
                  </td>
                  <td className={scoreTextTone(contract.netPositions ?? 0)}>
                    {contract.netPositions == null
                      ? "--"
                      : signedInteger(contract.netPositions)}
                  </td>
                  <td>
                    {contract.openInterest?.toLocaleString("de-DE") ?? "--"}
                  </td>
                  <td
                    className={scoreTextTone(contract.openInterestChange ?? 0)}
                  >
                    {contract.openInterestChange == null
                      ? "--"
                      : signedInteger(contract.openInterestChange)}
                  </td>
                  <td>
                    <Badge className={scoreTone(contract.positionSignal ?? 0)}>
                      {contract.positionSignal == null
                        ? "Unavailable"
                        : signalLabel(contract.positionSignal)}
                    </Badge>
                  </td>
                  <td>
                    <Badge className={scoreTone(contract.changeSignal ?? 0)}>
                      {contract.changeSignal == null
                        ? "Unavailable"
                        : signalLabel(contract.changeSignal)}
                    </Badge>
                  </td>
                  <td>{contract.reportDate ?? "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function signedPercentagePoints(value: number) {
  const formatted = (value * 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value > 0 ? "+" : ""}${formatted} PP`;
}

function signedInteger(value: number) {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : ""}${rounded.toLocaleString("de-DE")}`;
}

function signalLabel(value: number) {
  return value > 0 ? "Positiv" : value < 0 ? "Negativ" : "Neutral";
}

function scoreTone(value: number) {
  return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
}

function scoreTextTone(value: number) {
  return value > 0 ? "positive-text" : value < 0 ? "negative-text" : "muted";
}

function cellStyle(score: number, scale: number) {
  const strength = Math.min(1, Math.abs(score) / Math.max(1, scale));
  if (score === 0) {
    return {
      background: "#151515",
      color: "#c9c9c9",
    };
  }
  return score > 0
    ? {
        background: `rgba(20, ${90 + Math.round(strength * 70)}, 52, ${0.52 + strength * 0.3})`,
        color: "#effff3",
      }
    : {
        background: `rgba(${112 + Math.round(strength * 72)}, 25, 42, ${0.52 + strength * 0.3})`,
        color: "#fff0f2",
      };
}
