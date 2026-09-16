import type {
  ColoredScreenshotAnalysis,
  ColoredScreenshotWord,
} from "./trade-screenshot-colors";

const currencyNames: [RegExp, string][] = [
  [/^(?:Australischer Dollar|Australian Dollar)$/i, "AUD"],
  [/^(?:Schweizer Franken|Swiss Franc)$/i, "CHF"],
  [/^(?:US[- ]Dollar|U\.S\. Dollar|United States Dollar)$/i, "USD"],
  [/^Euro$/i, "EUR"],
  [
    /^(?:Britisches Pfund|Pfund Sterling|British Pound|Pound Sterling)$/i,
    "GBP",
  ],
  [/^(?:Japanischer Yen|Japanese Yen)$/i, "JPY"],
  [/^(?:Kanadischer Dollar|Canadian Dollar)$/i, "CAD"],
  [/^(?:Neuseeländischer Dollar|New Zealand Dollar)$/i, "NZD"],
  [/^Gold$/i, "XAU"],
  [/^(?:Silber|Silver)$/i, "XAG"],
  [/^Bitcoin$/i, "BTC"],
  [/^(?:Ethereum|Ether)$/i, "ETH"],
];

function wordRows(words: ColoredScreenshotWord[]) {
  const rows: ColoredScreenshotWord[][] = [];
  for (const word of [...words].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const center = word.y + word.height / 2;
    const row = rows.find((items) => {
      const anchor = items[0];
      return (
        Math.abs(anchor.y + anchor.height / 2 - center) <=
        Math.max(3, Math.max(anchor.height, word.height) * 0.4)
      );
    });
    if (row) row.push(word);
    else rows.push([word]);
  }
  return rows.map((row) => row.sort((a, b) => a.x - b.x));
}

export function tradingViewHeader(analysis: ColoredScreenshotAnalysis) {
  const words = analysis.lines
    .flatMap((line) => line.words)
    .filter(
      (word) =>
        word.x < analysis.width * 0.65 &&
        word.y < Math.min(100, analysis.height * 0.18),
    );
  const headers = words.length
    ? wordRows(words).map((row) => row.map((word) => word.text).join(" "))
    : analysis.lines.slice(0, 6).map((line) => line.text);
  for (const header of headers) {
    const pairName = header
      .split(/[·•]/)[0]
      .trim()
      .split(/\s*\/\s*/);
    if (pairName.length !== 2) continue;
    const pair = pairName.map((name) => {
      const clean = name.trim();
      return (
        currencyNames.find(([pattern]) => pattern.test(clean))?.[1] ??
        (/^(EUR|USD|GBP|JPY|CHF|AUD|CAD|NZD|XAU|XAG|BTC|ETH|USDT)$/.test(clean)
          ? clean
          : undefined)
      );
    });
    if (pair.some((part) => !part) || pair[0] === pair[1]) continue;
    // Windows OCR can read the digit in "1T" as I. Only repair it in a
    // delimited chart interval, never inside an instrument or price.
    const frame = header.match(
      /[·•]\s*(1T|IT|1D|1W|1h|4h|1|5|15|30|60|240)\s*[·•]/,
    );
    return { instrument: pair.join(""), evidence: header, frame: frame?.[1] };
  }
  return undefined;
}

function sameColor(a: ColoredScreenshotWord, b: ColoredScreenshotWord) {
  if (!a.color || !b.color) return false;
  const delta = Math.abs(a.color.hue - b.color.hue);
  return Math.min(delta, 360 - delta) < 8;
}

interface ChartBadge {
  quantity: number;
  amount: number;
  currency: string;
  filled: boolean;
  repaired: boolean;
  anchor: ColoredScreenshotWord;
  evidence: string;
}

// Badge numbers are decimals, not chart-axis tick labels. Repair split OCR
// zeroes only for quantities; callers require two independent matching sizes.
function badgeNumber(raw: string, repair = false) {
  const text = raw.replace(/[\s]/g, "").replace(/[−—–]/g, "-");
  const normalized =
    repair && /\d/.test(text) && /[.,]/.test(text)
      ? text.replace(/[Oo]/g, "0")
      : text;
  if (!/^[+-]?\d+(?:[.,]\d{1,8})?$/.test(normalized)) return undefined;
  const value = Number(normalized.replace(",", "."));
  return Number.isFinite(value) && Math.abs(value) <= 1e12 ? value : undefined;
}

function chartBadges(analysis: ColoredScreenshotAnalysis): ChartBadge[] {
  const words = analysis.lines.flatMap((line) => line.words);
  const result: ChartBadge[] = [];
  for (const unit of words.filter(
    (word) =>
      /^(USD|EUR|GBP|CHF|JPY|CAD|AUD|NZD|USDT)$/.test(word.text) &&
      word.color &&
      word.x > analysis.width * 0.35 &&
      word.y > 25,
  )) {
    const row = words
      .filter(
        (word) =>
          sameColor(word, unit) &&
          Math.abs(word.y + word.height / 2 - unit.y - unit.height / 2) <=
            Math.max(4, unit.height * 0.5) &&
          word.x < unit.x &&
          word.x > unit.x - Math.max(180, unit.height * 20),
      )
      .sort((a, b) => a.x - b.x);
    // A gap separates the quantity cell from the monetary P&L cell. Smaller
    // gaps are decimal fragments or a detached +/− sign and stay together.
    const groups: ColoredScreenshotWord[][] = [];
    for (const word of row) {
      const previousGroup = groups[groups.length - 1];
      const previous = previousGroup?.[previousGroup.length - 1];
      if (
        !previous ||
        word.x - previous.x - previous.width > Math.max(9, unit.height)
      )
        groups.push([word]);
      else previousGroup.push(word);
    }
    if (groups.length !== 2) continue;
    const quantityText = groups[0].map((word) => word.text).join("");
    const amountText = groups[1].map((word) => word.text).join("");
    const quantity = badgeNumber(quantityText, true);
    const amount = badgeNumber(amountText);
    if (quantity === undefined || quantity === 0 || amount === undefined)
      continue;
    result.push({
      quantity,
      amount,
      currency: unit.text,
      filled: groups[0].every((word) => word.color?.filled),
      repaired: /[Oo]/.test(quantityText),
      anchor: unit,
      evidence: `${quantityText} · ${amountText} ${unit.text}`,
    });
  }
  return result;
}

export interface TradingViewChartTrade {
  quantity: string;
  risk: string;
  currency: string;
  entry?: string;
  stop?: string;
  target?: string;
  direction?: "long" | "short";
  evidence: string;
  warning?: string;
}

export function tradingViewChartTrade(
  analysis: ColoredScreenshotAnalysis,
): TradingViewChartTrade | undefined {
  const badges = chartBadges(analysis);
  const positions = badges.filter((badge) => badge.filled);
  if (positions.length !== 1) return undefined;
  const position = positions[0];
  const brackets = badges.filter(
    (badge) =>
      !badge.filled &&
      badge.currency === position.currency &&
      Math.abs(badge.quantity) === Math.abs(position.quantity) &&
      !sameColor(badge.anchor, position.anchor),
  );
  const stops = brackets.filter((badge) => badge.amount < 0);
  const targets = brackets.filter((badge) => badge.amount > 0);
  if (
    stops.length !== 1 ||
    targets.length !== 1 ||
    sameColor(stops[0].anchor, targets[0].anchor)
  )
    return undefined;
  const stop = stops[0];
  const target = targets[0];
  if (position.repaired && (stop.repaired || target.repaired)) return undefined;
  const result: TradingViewChartTrade = {
    quantity: String(Math.abs(position.quantity)),
    risk: String(-stop.amount),
    currency: position.currency,
    evidence: `Positionsanzeige ${position.evidence}; Stop ${stop.evidence}; Ziel ${target.evidence}`,
  };
  const words = analysis.lines.flatMap((line) => line.words);
  const prices = wordRows(
    words.filter((word) => word.x > analysis.width * 0.86),
  ).flatMap((row) => {
    if (
      row.some((word) =>
        /^(?:ask|bid|hoch|tief|high|low|[kmb])$/i.test(word.text),
      )
    )
      return [];
    return row.flatMap((word) => {
      if (
        !word.color ||
        word.x < analysis.width * 0.9 ||
        !/^\d+[.,]\d+$/.test(word.text)
      )
        return [];
      const value = badgeNumber(word.text);
      const precision = 10 ** -word.text.split(/[.,]/)[1].length;
      return value && value > 0 ? [{ word, value, precision }] : [];
    });
  });
  const candidates = (badge: ChartBadge) =>
    prices.filter(
      (price) =>
        price.word.x > badge.anchor.x + badge.anchor.width &&
        sameColor(price.word, badge.anchor),
    );
  const triples: {
    entry: number;
    stop: number;
    target: number;
    direction: "long" | "short";
  }[] = [];
  for (const entry of candidates(position)) {
    for (const sl of candidates(stop)) {
      for (const tp of candidates(target)) {
        const direction = position.quantity < 0 ? "short" : "long";
        const sign = direction === "long" ? 1 : -1;
        const lossDistance = (entry.value - sl.value) * sign;
        const winDistance = (tp.value - entry.value) * sign;
        if (lossDistance <= 0 || winDistance <= 0) continue;
        // Color alone cannot separate a red entry from a red Bid. Check the
        // SL/TP money ratio too, allowing only displayed cent/price rounding.
        const rounding =
          (winDistance + lossDistance) * 0.011 +
          (-stop.amount + target.amount) *
            Math.max(entry.precision, sl.precision, tp.precision);
        if (
          Math.abs(winDistance * -stop.amount - lossDistance * target.amount) >
          rounding
        )
          continue;
        triples.push({
          entry: entry.value,
          stop: sl.value,
          target: tp.value,
          direction,
        });
      }
    }
  }
  const unique = [
    ...new Map(
      triples.map((triple) => [JSON.stringify(triple), triple]),
    ).values(),
  ];
  if (unique.length === 1) {
    const match = unique[0];
    return {
      ...result,
      entry: String(match.entry),
      stop: String(match.stop),
      target: String(match.target),
      direction: match.direction,
    };
  }
  return {
    ...result,
    warning:
      "Die farbigen Preislabels lassen sich nicht eindeutig mit Stop- und Zielbetrag abgleichen. Bitte Entry, Stop und Take Profit ergänzen oder deutlicher aufnehmen.",
  };
}
