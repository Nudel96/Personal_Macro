import type {
  PutCallAsset,
  PutCallDashboard,
  PutCallSyncResult,
} from "../types/domain";

const assets: PutCallAsset[] = [
  {
    symbol: "EURUSD",
    label: "EUR/USD",
    sourceSymbol: "Euro FX",
    sourceOrientation: "direct",
  },
  {
    symbol: "GBPUSD",
    label: "GBP/USD",
    sourceSymbol: "British Pound",
    sourceOrientation: "direct",
  },
  {
    symbol: "AUDUSD",
    label: "AUD/USD",
    sourceSymbol: "Australian Dollar",
    sourceOrientation: "direct",
  },
  {
    symbol: "NZDUSD",
    label: "NZD/USD",
    sourceSymbol: "New Zealand Dollar",
    sourceOrientation: "direct",
  },
  {
    symbol: "USDJPY",
    label: "USD/JPY",
    sourceSymbol: "Japanese Yen",
    sourceOrientation: "inverse",
  },
  {
    symbol: "USDCAD",
    label: "USD/CAD",
    sourceSymbol: "Canadian Dollar",
    sourceOrientation: "inverse",
  },
  {
    symbol: "USDCHF",
    label: "USD/CHF",
    sourceSymbol: "Swiss Franc",
    sourceOrientation: "inverse",
  },
];

export function browserPutCallDashboard(
  assetSymbol = "EURUSD",
): Promise<PutCallDashboard> {
  const selectedAsset = assets.find((asset) => asset.symbol === assetSymbol);
  if (!selectedAsset) {
    return Promise.reject({ message: "Unbekanntes Put/Call-Asset." });
  }
  return Promise.resolve({
    assets,
    selectedAsset,
    points: [],
    thresholds: null,
    latestValue: null,
    sentiment: "unavailable",
    calibrationSampleSize: 0,
    lastSuccessfulSyncAt: null,
    lastTradeDate: null,
    lastRunStatus: null,
    lastRunMessage: null,
    nativeOnly: true,
  });
}

export function browserSyncPutCall(): Promise<PutCallSyncResult> {
  return Promise.reject({
    message:
      "CME Put/Call-Daten können nur in der Desktop-App aktualisiert werden.",
  });
}
