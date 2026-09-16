import { z } from "zod";
import { fromInputDateTime, toInputDateTime } from "../../lib/utils";
import type { TradeInput } from "../../types/domain";
import type { ScreenshotReview } from "./trade-screenshot-import";

export function captureMoney(value?: string) {
  if (!value?.trim()) return undefined;
  const numeric = Number(value.trim().replace(",", "."));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : undefined;
}

const decimal = z
  .string()
  .refine(
    (value) =>
      !value.trim() || /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value.trim()),
    "Bitte eine Zahl eingeben, z. B. 125,50.",
  );
const dateTime = z
  .string()
  .refine(
    (value) => !value || Number.isFinite(new Date(value).getTime()),
    "Bitte Datum und Uhrzeit prüfen.",
  );

export const captureSchema = z
  .object({
    instrument: z
      .string()
      .trim()
      .min(1, "Bitte ein Instrument eingeben.")
      .max(32),
    direction: z.enum(["long", "short"]),
    status: z.enum(["closed", "open", "planned", "draft"]),
    assetClass: z.string(),
    setupId: z.string(),
    session: z.string(),
    timeframe: z.string(),
    openedAt: dateTime,
    closedAt: dateTime,
    actualEntry: decimal,
    initialStopLoss: decimal,
    actualExit: decimal,
    takeProfit: decimal,
    quantity: decimal,
    plannedRisk: decimal.refine(
      (value) => !value || Number(value.replace(",", ".")) >= 0,
      "Risiko darf nicht negativ sein.",
    ),
    riskPercent: decimal,
    pnlMode: z.enum(["net", "gross"]),
    netPnl: decimal,
    grossPnl: decimal,
    fees: decimal,
    commission: decimal,
    swap: decimal,
    thesisHtml: z.string(),
    reviewNotesHtml: z.string(),
  })
  .superRefine((value, context) => {
    if (value.status === "closed" && !value.closedAt) {
      context.addIssue({
        code: "custom",
        path: ["closedAt"],
        message: "Bitte die Ausstiegszeit ergänzen.",
      });
    }
    if (
      value.status === "closed" &&
      value.openedAt &&
      value.closedAt &&
      new Date(value.closedAt) < new Date(value.openedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["closedAt"],
        message: "Der Ausstieg darf nicht vor dem Einstieg liegen.",
      });
    }
  });

export type CaptureValues = z.infer<typeof captureSchema>;

export function captureDefaults(): CaptureValues {
  return {
    instrument: "",
    direction: "long",
    status: "closed",
    assetClass: "forex",
    setupId: "",
    session: "",
    timeframe: "",
    openedAt: "",
    closedAt: toInputDateTime(new Date().toISOString()),
    actualEntry: "",
    initialStopLoss: "",
    actualExit: "",
    takeProfit: "",
    quantity: "",
    plannedRisk: "",
    riskPercent: "",
    pnlMode: "net",
    netPnl: "",
    grossPnl: "",
    fees: "",
    commission: "",
    swap: "",
    thesisHtml: "",
    reviewNotesHtml: "",
  };
}

export function captureNetPnl(values: CaptureValues) {
  if (values.pnlMode === "net") return captureMoney(values.netPnl);
  const gross = captureMoney(values.grossPnl);
  return gross == null
    ? undefined
    : gross -
        (captureMoney(values.fees) ?? 0) -
        (captureMoney(values.commission) ?? 0) -
        (captureMoney(values.swap) ?? 0);
}

export function captureInput(
  values: CaptureValues,
  accountId: string,
  screenshotReview: ScreenshotReview | null,
): TradeInput {
  // A saved draft retains entered outcomes without contributing to realized P&L.
  const hasOutcome = values.status === "closed" || values.status === "draft";
  return {
    accountId,
    instrument: values.instrument.trim(),
    assetClass: values.assetClass,
    direction: values.direction,
    status: values.status,
    setupId: values.setupId || undefined,
    session: values.session || undefined,
    timeframe: values.timeframe || undefined,
    openedAt: fromInputDateTime(values.openedAt),
    closedAt: hasOutcome ? fromInputDateTime(values.closedAt) : undefined,
    displayTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    plannedEntry:
      values.status === "planned" ? values.actualEntry || undefined : undefined,
    actualEntry:
      values.status === "planned" ? undefined : values.actualEntry || undefined,
    initialStopLoss: values.initialStopLoss || undefined,
    actualExit: hasOutcome ? values.actualExit || undefined : undefined,
    takeProfit: values.takeProfit || undefined,
    quantity: values.quantity || undefined,
    plannedRiskMinor: captureMoney(values.plannedRisk),
    grossPnlMinor:
      hasOutcome && values.pnlMode === "gross"
        ? captureMoney(values.grossPnl)
        : undefined,
    netPnlMinor:
      hasOutcome && values.pnlMode === "net"
        ? captureMoney(values.netPnl)
        : undefined,
    feesMinor: captureMoney(values.fees) ?? 0,
    commissionMinor: captureMoney(values.commission) ?? 0,
    swapMinor: captureMoney(values.swap) ?? 0,
    thesisHtml: values.thesisHtml || undefined,
    reviewNotesHtml: values.reviewNotesHtml || undefined,
    sourceMetadataJson: JSON.stringify({
      riskPercent: values.riskPercent,
      screenshotImport: screenshotReview,
    }),
  };
}

export const captureDraftKey = (accountId: string) =>
  `personal-macro:quick-trade-draft:v1:${accountId}`;

export interface CaptureDraft {
  values: CaptureValues;
  screenshotReview: ScreenshotReview | null;
  hadScreenshot: boolean;
}

export function readCaptureDraft(accountId: string): CaptureDraft | null {
  try {
    const saved = JSON.parse(
      localStorage.getItem(captureDraftKey(accountId)) ?? "null",
    );
    if (!saved?.values || typeof saved.values !== "object") return null;
    const defaults = captureDefaults();
    // Retain incomplete form values, but never spread arbitrary stored properties.
    const values = Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [
        key,
        typeof saved.values[key] === "string" ? saved.values[key] : value,
      ]),
    ) as CaptureValues;
    if (!["closed", "open", "planned", "draft"].includes(values.status))
      values.status = "draft";
    if (!["long", "short"].includes(values.direction))
      values.direction = "long";
    if (!["net", "gross"].includes(values.pnlMode)) values.pnlMode = "net";
    return {
      values,
      screenshotReview: saved.screenshotReview ?? null,
      hadScreenshot: saved.hadScreenshot === true,
    };
  } catch {
    return null;
  }
}
