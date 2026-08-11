export type PositionSizingMode = "price_distance" | "tick_value";

export interface InstrumentSpec {
  symbol: string;
  label: string;
  assetClass: string;
  mode: PositionSizingMode;
  baseCurrency?: string;
  quoteCurrency: string;
  contractSize: number;
  tickSize?: number;
  tickValue?: number;
  quantityStep: number;
  minimumQuantity: number;
  quantityLabel: "Lots" | "Kontrakte" | "Coins";
}

export interface PositionSizeInput {
  riskAmount: number;
  entryPrice: number;
  stopPrice: number;
  quotePerAccountCurrency: number;
  spec: InstrumentSpec;
}

export interface PositionSizeResult {
  quantity: number;
  rawQuantity: number;
  stopDistance: number;
  riskPerQuantity: number;
  effectiveRisk: number;
}

const FUTURES: Record<string, Omit<InstrumentSpec, "symbol">> = {
  "6E": futures("Euro FX", 0.00005, 6.25),
  M6E: futures("Micro Euro FX", 0.0001, 1.25),
  "6B": futures("British Pound", 0.0001, 6.25),
  M6B: futures("Micro British Pound", 0.0001, 0.625),
  "6J": futures("Japanese Yen", 0.0000005, 6.25),
  M6J: futures("Micro Japanese Yen", 0.000001, 1.25),
  "6A": futures("Australian Dollar", 0.0001, 10),
  M6A: futures("Micro Australian Dollar", 0.0001, 1),
  "6C": futures("Canadian Dollar", 0.00005, 5),
  M6C: futures("Micro Canadian Dollar", 0.0001, 1),
  "6S": futures("Swiss Franc", 0.0001, 12.5),
  "6N": futures("New Zealand Dollar", 0.0001, 10),
  DX: futures("US Dollar Index", 0.005, 5),
  GC: futures("Gold", 0.1, 10),
  MGC: futures("Micro Gold", 0.1, 1),
  SI: futures("Silver", 0.005, 25),
  SIL: futures("Micro Silver", 0.005, 5),
  HG: futures("Copper", 0.0005, 12.5),
  PL: futures("Platinum", 0.1, 5),
  PA: futures("Palladium", 0.1, 10),
  MBT: futures("Micro Bitcoin", 5, 0.5),
  MET: futures("Micro Ether", 0.5, 0.05),
};

function futures(
  label: string,
  tickSize: number,
  tickValue: number,
): Omit<InstrumentSpec, "symbol"> {
  return {
    label,
    assetClass: "futures",
    mode: "tick_value",
    quoteCurrency: "USD",
    contractSize: 1,
    tickSize,
    tickValue,
    quantityStep: 1,
    minimumQuantity: 1,
    quantityLabel: "Kontrakte",
  };
}

export function normalizeInstrument(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function futureRoot(symbol: string) {
  return Object.keys(FUTURES)
    .sort((left, right) => right.length - left.length)
    .find((root) => symbol === root || symbol.startsWith(root));
}

export function inferInstrumentSpec(
  instrument: string,
  assetClass: string,
): InstrumentSpec {
  const symbol = normalizeInstrument(instrument);
  const root = futureRoot(symbol);
  if (assetClass === "futures" && root) {
    return { symbol, ...FUTURES[root] };
  }

  if (symbol.startsWith("XAU")) {
    return cfd(symbol, "Gold", "metals", "XAU", quote(symbol), 100, 0.01);
  }
  if (symbol.startsWith("XAG")) {
    return cfd(symbol, "Silber", "metals", "XAG", quote(symbol), 5_000, 0.01);
  }
  if (symbol.startsWith("XPT") || symbol.startsWith("XPD")) {
    return cfd(
      symbol,
      symbol.startsWith("XPT") ? "Platin" : "Palladium",
      "metals",
      symbol.slice(0, 3),
      quote(symbol),
      100,
      0.01,
    );
  }

  if (
    assetClass === "crypto" ||
    /^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|AVAX|TRX|DOT|LINK)/.test(symbol)
  ) {
    const base =
      symbol.replace(/(USDT|USDC|USD|EUR|GBP|BTC|ETH)$/, "") || symbol;
    return cfd(
      symbol,
      `${base} Spot/CFD`,
      "crypto",
      base,
      quote(symbol),
      1,
      0.0001,
      "Coins",
    );
  }

  if (assetClass === "forex" || /^[A-Z]{6}$/.test(symbol)) {
    const base = symbol.slice(0, 3);
    const quoteCurrency = symbol.slice(3, 6) || "USD";
    return cfd(
      symbol,
      "Forex Standardlot",
      "forex",
      base,
      quoteCurrency,
      100_000,
      0.01,
    );
  }

  return cfd(
    symbol,
    "Benutzerdefinierter Kontrakt",
    assetClass,
    undefined,
    quote(symbol),
    1,
    0.01,
  );
}

function quote(symbol: string) {
  if (symbol.endsWith("USDT") || symbol.endsWith("USDC")) return "USD";
  return (
    ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD"].find((currency) =>
      symbol.endsWith(currency),
    ) ?? "USD"
  );
}

function cfd(
  symbol: string,
  label: string,
  assetClass: string,
  baseCurrency: string | undefined,
  quoteCurrency: string,
  contractSize: number,
  quantityStep: number,
  quantityLabel: InstrumentSpec["quantityLabel"] = "Lots",
): InstrumentSpec {
  return {
    symbol,
    label,
    assetClass,
    mode: "price_distance",
    baseCurrency,
    quoteCurrency,
    contractSize,
    quantityStep,
    minimumQuantity: quantityStep,
    quantityLabel,
  };
}

export function parseTradeNumber(value?: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculatePositionSize(
  input: PositionSizeInput,
): PositionSizeResult | null {
  const { riskAmount, entryPrice, stopPrice, quotePerAccountCurrency, spec } =
    input;
  const stopDistance = Math.abs(entryPrice - stopPrice);
  if (
    riskAmount <= 0 ||
    stopDistance <= 0 ||
    quotePerAccountCurrency <= 0 ||
    spec.quantityStep <= 0
  ) {
    return null;
  }

  const riskPerQuantityQuote =
    spec.mode === "tick_value"
      ? (stopDistance / (spec.tickSize ?? 0)) * (spec.tickValue ?? 0)
      : stopDistance * spec.contractSize;
  const riskPerQuantity = riskPerQuantityQuote / quotePerAccountCurrency;
  if (!Number.isFinite(riskPerQuantity) || riskPerQuantity <= 0) return null;

  const rawQuantity = riskAmount / riskPerQuantity;
  const quantity =
    Math.floor(rawQuantity / spec.quantityStep + 1e-9) * spec.quantityStep;
  if (quantity < spec.minimumQuantity) {
    return {
      quantity: 0,
      rawQuantity,
      stopDistance,
      riskPerQuantity,
      effectiveRisk: 0,
    };
  }
  return {
    quantity: Number(quantity.toFixed(8)),
    rawQuantity,
    stopDistance,
    riskPerQuantity,
    effectiveRisk: quantity * riskPerQuantity,
  };
}

export function formatPositionQuantity(value: number, step: number) {
  const decimals = Math.min(
    8,
    Math.max(0, `${step}`.split(".")[1]?.length ?? 0),
  );
  return value.toFixed(decimals).replace(".", ",");
}
