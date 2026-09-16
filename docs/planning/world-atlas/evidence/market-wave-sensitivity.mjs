import fs from "node:fs";
import process from "node:process";
const rows = JSON.parse(
  fs.readFileSync(
    process.argv[2] ||
      new URL(
        "../../../../apps/desktop/.tmp/atlas-validation/market-review.json",
        import.meta.url,
      ),
    "utf8",
  ),
);
function calculate(row, trend, smooth) {
  const logs = [],
    residuals = [],
    result = [];
  for (const point of row.analysis.points) {
    if (row.proxy.breaks.includes(point.month) || point.adjustedClose == null) {
      logs.length = 0;
      residuals.length = 0;
    }
    if (point.adjustedClose == null) {
      result.push(null);
      continue;
    }
    logs.push(Math.log(point.adjustedClose));
    if (logs.length < trend) {
      result.push(null);
      continue;
    }
    const window = logs.slice(-trend),
      xbar = (trend - 1) / 2;
    const mean = window.reduce((a, b) => a + b, 0) / trend;
    const denominator = window.reduce((sum, _, i) => sum + (i - xbar) ** 2, 0);
    const numerator = window.reduce(
      (sum, y, i) => sum + (i - xbar) * (y - mean),
      0,
    );
    residuals.push(
      window[trend - 1] - (mean + (numerator / denominator) * xbar),
    );
    if (residuals.length < smooth) {
      result.push(null);
      continue;
    }
    result.push(
      100 *
        Math.expm1(
          residuals.slice(-smooth).reduce((a, b) => a + b, 0) / smooth,
        ),
    );
  }
  return result;
}
const report = rows.map((row) => {
  const base = calculate(row, 60, 12);
  const error = Math.max(
    0,
    ...base.map((value, index) =>
      value == null ? 0 : Math.abs(value - row.analysis.points[index].wave),
    ),
  );
  if (
    error > 1e-8 ||
    base.some(
      (value, index) =>
        (value == null) !== (row.analysis.points[index].wave == null),
    )
  )
    throw Error("Native recipe mismatch");
  const variations = [
    [48, 12],
    [84, 12],
    [60, 6],
    [60, 18],
  ].map(([trend, smooth]) => {
    const alt = calculate(row, trend, smooth);
    const overlap = base
      .map((v, i) => [v, alt[i]])
      .filter(([a, b]) => a != null && b != null);
    return {
      trend,
      smooth,
      commonMonths: overlap.length,
      directionAgreement: overlap.length
        ? overlap.filter(([a, b]) => Math.sign(a) === Math.sign(b)).length /
          overlap.length
        : null,
      latestDirection: alt.at(-1) == null ? null : Math.sign(alt.at(-1)),
    };
  });
  return {
    symbol: row.proxy.symbol,
    sourceHash: row.provenance.sha256,
    sourceLastDate: row.provenance.sourceLastDate,
    maxNativeDifference: error,
    latestDirection: base.at(-1) == null ? null : Math.sign(base.at(-1)),
    variations,
  };
});
fs.writeFileSync(
  new URL("./market-wave-sensitivity.json", import.meta.url),
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      recipe: rows[0].analysis.recipe,
      note: "Parameterempfindlichkeit, keine Prognosevalidierung. Nur vorhandene Werte, keine persönlichen Daten.",
      results: report,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(report));
