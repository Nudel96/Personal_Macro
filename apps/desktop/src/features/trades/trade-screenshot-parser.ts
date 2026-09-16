import type { TradeScreenshotAnalysis } from "../../types/domain";
import type { ColoredScreenshotAnalysis } from "./trade-screenshot-colors";
import {
  tradingViewChartTrade,
  tradingViewHeader,
} from "./tradingview-chart-parser";

export const screenshotFieldLabels = {
  instrument: "Instrument",
  direction: "Richtung",
  status: "Status",
  timeframe: "Timeframe",
  actualEntry: "Entry-Preis",
  initialStopLoss: "Initialer Stop",
  takeProfit: "Take Profit",
  actualExit: "Exit-Preis",
  quantity: "Positionsgröße",
  plannedRisk: "Risiko (Betrag)",
  riskPercent: "Risiko (%)",
} as const;
export type ScreenshotFieldKey = keyof typeof screenshotFieldLabels;
export type ScreenshotValues = Partial<Record<ScreenshotFieldKey, string>>;
export interface ScreenshotFinding {
  value: string;
  evidence: string;
  derived?: boolean;
}
export interface ParsedTradeScreenshot {
  fields: Partial<Record<ScreenshotFieldKey, ScreenshotFinding>>;
  assetClass?: string;
  quantityUnit: "lots" | "units" | "contracts" | "unknown";
  currency: string | null;
  drawing: boolean;
  warnings: string[];
}

const numeric = String.raw`[+−-]?\d[\d.,'’]*(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?`;
const currencies = /\b(USD|EUR|GBP|JPY|CHF|CAD|AUD|NZD|SGD|HKD|USDT)\b/gi;

const tableLabels: [RegExp, string][] = [
  [/^(symbol|instrument|ticker)$/i, "Symbol"],
  [/^(side|direction|richtung)$/i, "Direction"],
  [/^(status|positionsstatus)$/i, "Status"],
  [/^(qty|quantity|menge|volume|volumen)$/i, "Qty"],
  [/^(lots?|lotzahl)$/i, "Lots"],
  [
    /^(entry(?: price)?|avg\.? (?:fill )?price|average price|einstiegspreis)$/i,
    "Entry price",
  ],
  [/^(stop[ -]?loss|sl)$/i, "Stop loss"],
  [/^(take[ -]?profit|tp)$/i, "Take profit"],
  [/^(exit(?: price)?|close price|ausstiegspreis)$/i, "Exit price"],
  [/^(risk|risiko)$/i, "Risk"],
];

// OCR often separates input labels from values. Reconstruct nearby label/value
// pairs and single-position tables using word coordinates, without joining trades.
function spatialLines(analysis: TradeScreenshotAnalysis): {
  lines: string[];
  multipleRows: boolean;
} {
  const words = analysis.lines
    .flatMap((line) => line.words)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: (typeof words)[] = [];
  for (const word of words) {
    const row = rows.find(
      (entry) =>
        Math.abs(entry[0].y - word.y) <
        Math.max(6, Math.min(entry[0].height, word.height) * 0.65),
    );
    if (row) row.push(word);
    else rows.push([word]);
  }
  rows.forEach((row) => row.sort((a, b) => a.x - b.x));
  const additions: string[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const labels: { label: string; x: number; right: number; end: number }[] =
      [];
    for (let start = 0; start < row.length; start++) {
      for (
        let length = Math.min(4, row.length - start);
        length >= 1;
        length--
      ) {
        const part = row.slice(start, start + length);
        if (
          part.some(
            (word, i) =>
              i > 0 && word.x - (part[i - 1].x + part[i - 1].width) > 35,
          )
        )
          continue;
        const text = part
          .map((word) => word.text)
          .join(" ")
          .replace(/:$/, "");
        const label = tableLabels.find(([pattern]) => pattern.test(text));
        if (label) {
          labels.push({
            label: label[1],
            x: part[0].x,
            right: part[part.length - 1].x + part[part.length - 1].width,
            end: start + length,
          });
          start += length - 1;
          break;
        }
      }
    }
    if (labels.length === 1 && labels[0].end < row.length) {
      const label = labels[0];
      const next = row[label.end];
      if (next.x - label.right < 360)
        additions.push(
          `${label.label}: ${row
            .slice(label.end)
            .map((word) => word.text)
            .join(" ")}`,
        );
    }
    if (labels.length < 3 || !labels.some((label) => label.label === "Symbol"))
      continue;
    const candidates = rows
      .slice(index + 1)
      .filter((candidate) => candidate[0].y - row[0].y < 180)
      .flatMap((candidate) => {
        const cells = labels.map((label, i) => {
          const left =
            i === 0 ? label.x - 24 : (labels[i - 1].right + label.x) / 2;
          const right =
            i === labels.length - 1
              ? analysis.width
              : (label.right + labels[i + 1].x) / 2;
          return {
            label: label.label,
            value: candidate
              .filter(
                (word) =>
                  word.x + word.width / 2 >= left &&
                  word.x + word.width / 2 < right,
              )
              .map((word) => word.text)
              .join(" "),
          };
        });
        const symbol =
          cells.find((cell) => cell.label === "Symbol")?.value ?? "";
        const direction = cells.find(
          (cell) => cell.label === "Direction",
        )?.value;
        const quantity = cells.find((cell) =>
          ["Qty", "Lots"].includes(cell.label),
        )?.value;
        return /^(?:[A-Z]+:)?[A-Z][A-Z0-9/!.]{1,20}$/.test(symbol) &&
          ((direction && /^(buy|sell|long|short)$/i.test(direction)) ||
            (quantity && /^\d/.test(quantity)))
          ? [cells]
          : [];
      });
    if (candidates.length > 1) return { lines: [], multipleRows: true };
    if (candidates.length === 1)
      additions.push(
        ...candidates[0]
          .filter((cell) => cell.value)
          .map((cell) => `${cell.label}: ${cell.value}`),
      );
  }
  return { lines: additions, multipleRows: false };
}

// A lone separator followed by three digits is ambiguous (1,000 / 1.000).
// FX price labels use decimal prices; elsewhere require an unambiguous spelling.
export function parseScreenshotNumber(
  raw: string,
  decimalPrice = false,
): string | null {
  let value = raw
    .trim()
    .replace(/[\s'’]/g, "")
    .replace("−", "-");
  if (!/^[+-]?\d+(?:[.,]\d+)*$/.test(value)) return null;
  const dots = (value.match(/\./g) ?? []).length;
  const commas = (value.match(/,/g) ?? []).length;
  if (dots && commas) {
    const decimal = value.lastIndexOf(".") > value.lastIndexOf(",") ? "." : ",";
    const grouping = decimal === "." ? "," : ".";
    const [integer, fraction, extra] = value.split(decimal);
    if (
      extra !== undefined ||
      !new RegExp(`^[+-]?\\d{1,3}(?:\\${grouping}\\d{3})+$`).test(integer) ||
      !/^\d+$/.test(fraction)
    )
      return null;
    value = integer.split(grouping).join("") + "." + fraction;
  } else if (dots + commas > 1) {
    if (!/^[+-]?\d{1,3}(?:[.,]\d{3})+$/.test(value)) return null;
    value = value.replace(/[.,]/g, "");
  } else {
    if (!decimalPrice && /^[+-]?\d{1,3}[.,]\d{3}$/.test(value)) return null;
    value = value.replace(",", ".");
  }
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= 1e12
    ? String(number)
    : null;
}

function currencyOf(text: string): string | null {
  const found = [
    ...new Set(
      text.match(currencies)?.map((value) => value.toUpperCase()) ?? [],
    ),
  ];
  if (text.includes("€")) found.push("EUR");
  if (text.includes("£")) found.push("GBP");
  const unique = [...new Set(found)];
  // "$" alone is deliberately not equated with USD.
  return unique.length === 1 ? unique[0] : null;
}

export function parseTradeScreenshot(
  analysis: ColoredScreenshotAnalysis,
): ParsedTradeScreenshot {
  const spatial = spatialLines(analysis);
  if (spatial.multipleRows)
    return {
      fields: {},
      quantityUnit: "unknown",
      currency: null,
      drawing: false,
      warnings: [
        "Mehrere Positionen erkannt. Bitte den Screenshot auf genau einen Trade zuschneiden und erneut hinzufügen.",
      ],
    };
  const lines = [
    ...new Set([
      ...analysis.lines.map((line) => line.text.trim()).filter(Boolean),
      ...spatial.lines,
    ]),
  ];
  const text = lines.join("\n");
  const fields: ParsedTradeScreenshot["fields"] = {};
  const warnings: string[] = [];
  const conflicting = new Set<ScreenshotFieldKey>();
  const add = (
    key: ScreenshotFieldKey,
    value: string | null,
    evidence: string,
    derived = false,
  ) => {
    if (value === null || conflicting.has(key)) return;
    if (fields[key] && fields[key]?.value !== value) {
      delete fields[key];
      conflicting.add(key);
      warnings.push(
        `${screenshotFieldLabels[key]}: mehrere unterschiedliche Werte. Bitte nur eine Position ausschneiden.`,
      );
    } else fields[key] = { value, evidence, derived };
  };
  const drawing =
    /(?:risk\s*[/:-]\s*reward|chance\s*[/:-]\s*risiko|risiko\s*[/:-]\s*ertrag|chancen.risiko|\b(?:target|ziel|stop):[^\n]*\([^\n]*%)/i.test(
      text,
    );
  let quantityUnit: ParsedTradeScreenshot["quantityUnit"] = "unknown";
  let currency: string | null = null;
  const namedHeader = tradingViewHeader(analysis);
  if (namedHeader)
    add("instrument", namedHeader.instrument, namedHeader.evidence);

  // Prefer explicit instrument labels and the chart header; never scan a watchlist
  // for the first plausible ticker and silently attach it to another position.
  for (const line of lines) {
    const explicit = line.match(
      /^(?:symbol|instrument|ticker)\s*[:=]\s*(?:[A-Z0-9_]+:)?([A-Z0-9][A-Z0-9!/.-]{1,31})\s*$/i,
    );
    if (explicit)
      add("instrument", explicit[1].replace("/", "").toUpperCase(), line);
  }
  if (!fields.instrument && !conflicting.has("instrument")) {
    const header = lines.slice(0, 6).join("\n");
    const pair = header.match(
      /\b(?:[A-Z]+:)?((?:EUR|USD|GBP|JPY|CHF|AUD|CAD|NZD|XAU|XAG|BTC|ETH)\/?(?:USD|EUR|GBP|JPY|CHF|AUD|CAD|NZD|USDT))\b/,
    );
    if (pair) add("instrument", pair[1].replace("/", ""), pair[0]);
  }
  const symbol = fields.instrument?.value ?? "";
  const assetClass = /^(XAU|XAG)/.test(symbol)
    ? "metals"
    : /^(BTC|ETH)/.test(symbol)
      ? "crypto"
      : /^(EUR|USD|GBP|JPY|CHF|AUD|CAD|NZD){2}$/.test(symbol)
        ? "forex"
        : undefined;
  const decimalPrice = assetClass === "forex";

  for (const line of lines) {
    const side = line.match(
      /^(?:(?:side|direction|richtung|typ)\s*[:=]?\s*(long|short|buy|sell|kauf|verkauf)|(long|short)(?:\s+position)?)\s*$/i,
    );
    if (side)
      add(
        "direction",
        /^(long|buy|kauf)$/i.test(side[1] ?? side[2]) ? "long" : "short",
        line,
      );
    const status = line.match(
      /^(?:status|trade status|positionsstatus)\s*[:=]?\s*(open|opened|offen|closed|geschlossen|pending|planned|geplant|draft|entwurf)\s*$/i,
    );
    if (status)
      add(
        "status",
        /^(open|opened|offen)$/i.test(status[1])
          ? "open"
          : /^(closed|geschlossen)$/i.test(status[1])
            ? "closed"
            : /^(draft|entwurf)$/i.test(status[1])
              ? "draft"
              : "planned",
        line,
      );
    const frame =
      (namedHeader?.frame && line === lines[0]
        ? ["", namedHeader.frame]
        : null) ??
      line.match(
        /^(?:timeframe|intervall|zeiteinheit)\s*[:=]?\s*(M1|M5|M15|M30|H1|H4|D1|W1|1m|5m|15m|30m|1h|4h|1D|1W)\s*$/i,
      ) ??
      (line.includes(symbol) && symbol
        ? line.match(
            /[·,]\s*(1|5|15|30|60|240|1m|5m|15m|30m|1h|4h|1D|1W|D|W)\s*[·,]/,
          )
        : null);
    if (frame) {
      const value = frame[1].toUpperCase();
      add(
        "timeframe",
        (
          {
            "1": "M1",
            "5": "M5",
            "15": "M15",
            "30": "M30",
            "60": "H1",
            "240": "H4",
            "1M": "M1",
            "5M": "M5",
            "15M": "M15",
            "30M": "M30",
            "1H": "H1",
            "4H": "H4",
            "1D": "D1",
            "1T": "D1",
            IT: "D1",
            D: "D1",
            "1W": "W1",
            W: "W1",
          } as Record<string, string>
        )[value] ?? value,
        line,
      );
    }
    const priceLabels: [ScreenshotFieldKey, string][] = [
      [
        "actualEntry",
        "entry(?: price)?|einstiegspreis|eröffnungspreis|fill price|avg\\.? price",
      ],
      [
        "initialStopLoss",
        "stop[ -]?loss(?: price)?|stop price|stopppreis|stoppkurs|sl",
      ],
      ["takeProfit", "take[ -]?profit(?: price)?|profit price|zielpreis|tp"],
      ["actualExit", "exit(?: price)?|ausstiegspreis|close price"],
    ];
    if (!drawing)
      priceLabels.push(
        ["initialStopLoss", "stop"],
        ["takeProfit", "target|ziel"],
      );
    for (const [key, labels] of priceLabels) {
      const match = line.match(
        new RegExp(
          `^(?:${labels})\\s*[:=]?\\s*(${numeric})(?:\\s*(?:USD|EUR|GBP|JPY|CHF|CAD|AUD|NZD))?\\s*$`,
          "i",
        ),
      );
      if (match) {
        const number = parseScreenshotNumber(match[1], decimalPrice);
        if (number !== null && Number(number) > 0) add(key, number, line);
      }
    }
    const quantity = line.match(
      new RegExp(
        `(?:^|[,;]\\s*)(lots?|lotzahl|qty|quantity|menge|volumen|volume|units|einheiten|contracts|kontrakte)\\s*[:=]?\\s*(${numeric})(?:\\s*(lots?|units|einheiten|contracts|kontrakte))?(?=$|[,;])`,
        "i",
      ),
    );
    if (quantity) {
      const number = parseScreenshotNumber(quantity[2]);
      if (number !== null && Number(number) > 0) {
        add("quantity", number, line);
        const unit = quantity[3] ?? quantity[1];
        quantityUnit = /^lot/i.test(unit)
          ? "lots"
          : /^(units|einheiten)/i.test(unit)
            ? "units"
            : /^(contracts|kontrakte)/i.test(unit)
              ? "contracts"
              : "unknown";
      }
    }
    const risk = line.match(
      new RegExp(
        `^(?:risk(?: amount| size)?|risiko(?:betrag)?|max\\.? loss)\\s*(?:\\((USD|EUR|GBP|CHF|CAD|AUD|NZD|%)\\))?\\s*[:=]?\\s*(USD|EUR|GBP|CHF|CAD|AUD|NZD|[$€£])?\\s*(${numeric})\\s*(%|USD|EUR|GBP|CHF|CAD|AUD|NZD|[$€£])?\\s*$`,
        "i",
      ),
    );
    if (risk) {
      const number = parseScreenshotNumber(risk[3]);
      const percent = risk[1] === "%" || risk[4] === "%";
      if (
        number !== null &&
        Number(number) > 0 &&
        (!percent || Number(number) <= 100)
      ) {
        add(percent ? "riskPercent" : "plannedRisk", number, line);
        if (!percent) currency = currencyOf(line);
      }
    }
  }

  if (!drawing) {
    const chart = tradingViewChartTrade(analysis);
    if (chart) {
      add("quantity", chart.quantity, chart.evidence, true);
      add(
        "plannedRisk",
        chart.risk,
        `Stop-Betrag aus der Positionslinie: ${chart.risk} ${chart.currency}`,
      );
      currency = chart.currency;
      if (chart.entry && chart.stop && chart.target && chart.direction) {
        const evidence =
          "Farbige Preisskala, mit Positionslinie und Stop-/Zielbetrag abgeglichen";
        add("actualEntry", chart.entry, evidence, true);
        add("initialStopLoss", chart.stop, evidence, true);
        add("takeProfit", chart.target, evidence, true);
        add(
          "direction",
          chart.direction,
          "Vorzeichen der offenen Positionsgröße und Stop-/Zielpreise",
          true,
        );
        add(
          "status",
          "open",
          "Offene Positionsanzeige mit laufendem P&L und zugehörigen Stop-/Zielorders",
          true,
        );
      }
      if (chart.warning) warnings.push(chart.warning);
    }
  }

  if (drawing) {
    warnings.push(
      "TradingView-Zeichnung: Open/Closed P&L beschreibt die Simulation. Broker-Status, Ausführungszeit und realisiertes Ergebnis sind daraus nicht nachweisbar.",
    );
    const readOffset = (kind: "target" | "stop") => {
      const label = kind === "target" ? "target|ziel" : "stop|stopp";
      const matches = analysis.lines.flatMap((line) => {
        const match = line.text.match(
          new RegExp(`(?:^|\\s)(?:${label}):\\s*(.+?)\\s*\\([^)]*%\\)`, "i"),
        );
        if (!match) return [];
        const raw = match[1].trim();
        const repaired = /^\d+[.,][\dOo\s]+$/.test(raw) && /[Oo]/.test(raw);
        const value = parseScreenshotNumber(
          repaired ? raw.replace(/[Oo]/g, "0") : raw,
          true,
        );
        const amount = line.text.match(
          new RegExp(`(?:amount|betrag):\\s*(${numeric})`, "i"),
        );
        return value !== null && Number(value) > 0
          ? [
              {
                value: Number(value),
                amount: amount ? parseScreenshotNumber(amount[1]) : null,
                repaired,
                line,
              },
            ]
          : [];
      });
      return matches.length === 1 ? matches[0] : undefined;
    };
    const target = readOffset("target");
    const stop = readOffset("stop");
    if (target && stop) {
      let verifiedLevels = false;
      const targetY = target.line.words[0]?.y;
      const stopY = stop.line.words[0]?.y;
      if (
        targetY !== undefined &&
        stopY !== undefined &&
        Math.abs(targetY - stopY) > 30
      ) {
        const direction = targetY < stopY ? "long" : "short";
        add(
          "direction",
          direction,
          "Anordnung der Ziel- und Stop-Beschriftung",
          true,
        );
        const sign = direction === "long" ? 1 : -1;
        const prices = analysis.lines
          .flatMap((line) => line.words)
          .filter((word) => word.x > analysis.width * 0.72)
          .flatMap((word) => {
            const value = parseScreenshotNumber(word.text, decimalPrice);
            return value !== null && Number(value) > 0
              ? [{ value: Number(value), y: word.y }]
              : [];
          });
        const triples = prices.flatMap((entry) => {
          if (
            entry.y <= Math.min(targetY, stopY) ||
            entry.y >= Math.max(targetY, stopY)
          )
            return [];
          const tp = prices.find(
            (p) =>
              Math.abs(p.y - targetY) < 55 &&
              Math.abs(p.value - entry.value - sign * target.value) <
                Math.max(target.value * 0.0001, 1e-8),
          );
          const sl = prices.find(
            (p) =>
              Math.abs(p.y - stopY) < 55 &&
              Math.abs(entry.value - p.value - sign * stop.value) <
                Math.max(stop.value * 0.0001, 1e-8),
          );
          return tp && sl
            ? [{ entry: entry.value, tp: tp.value, sl: sl.value }]
            : [];
        });
        const unique = [
          ...new Map(triples.map((row) => [JSON.stringify(row), row])).values(),
        ];
        if (unique.length === 1) {
          verifiedLevels = true;
          const levels = unique[0];
          add(
            "actualEntry",
            String(levels.entry),
            "Preisachse, mit Ziel- und Stop-Abstand abgeglichen",
            true,
          );
          add(
            "takeProfit",
            String(levels.tp),
            "Preisachse und Ziel-Abstand",
            true,
          );
          add(
            "initialStopLoss",
            String(levels.sl),
            "Preisachse und Stop-Abstand",
            true,
          );
        }
      }
      if (target.repaired || stop.repaired)
        warnings.push(
          verifiedLevels
            ? "Ein unklar gelesenes Preiszeichen wurde anhand der drei Preislabels abgeglichen. Bitte Preise prüfen."
            : "Ein Preisabstand ist nicht eindeutig lesbar. Bitte den Screenshot vergrößern oder die Preise manuell ergänzen.",
        );
      if (
        target.amount !== null &&
        stop.amount !== null &&
        Number(target.amount) > Number(stop.amount) &&
        !fields.plannedRisk &&
        (!(target.repaired || stop.repaired) || verifiedLevels)
      ) {
        // Amount is the simulated final ACCOUNT BALANCE, not the loss amount.
        const risk =
          ((Number(target.amount) - Number(stop.amount)) * stop.value) /
          (target.value + stop.value);
        if (Number.isFinite(risk) && risk > 0) {
          add(
            "plannedRisk",
            risk.toFixed(2),
            "Aus den beiden Amount-Kontoständen und den Preisabständen berechnet; Rundung möglich",
            true,
          );
          const targetCurrency = currencyOf(target.line.text);
          const stopCurrency = currencyOf(stop.line.text);
          currency = targetCurrency === stopCurrency ? targetCurrency : null;
        }
      }
    }
  }
  if (fields.quantity && quantityUnit === "unknown")
    warnings.push(
      "Die Positionsgröße nennt keine eindeutige Lot-Einheit. Einheit vor der Übernahme festlegen.",
    );
  if (fields.plannedRisk && !currency)
    warnings.push(
      "Die Währung des Risikobetrags ist nicht erkennbar. Bitte mit der Kontowährung abgleichen.",
    );
  if (!fields.status)
    warnings.push(
      "Kein eindeutiger Trade-Status erkannt. Die Vorschau verwendet Entwurf, bis du einen Status auswählst.",
    );
  if (fields.actualEntry && fields.initialStopLoss && !fields.direction) {
    const difference =
      Number(fields.actualEntry.value) - Number(fields.initialStopLoss.value);
    if (difference)
      add(
        "direction",
        difference > 0 ? "long" : "short",
        "Aus Entry und initialem Stop abgeleitet",
        true,
      );
  }
  return { fields, assetClass, quantityUnit, currency, drawing, warnings };
}

export function screenshotFormPatch(
  values: ScreenshotValues,
  status: string,
): ScreenshotValues {
  const patch = { ...values, status };
  // A chart snapshot supplies no fill timestamp or realised P&L. Keep those manual.
  if (status !== "closed") delete patch.actualExit;
  return patch;
}
