import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Save, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { fromInputDateTime } from "../../lib/utils";
import { api } from "../../services/commands";
import { useUiStore } from "../../stores/ui-store";
import type {
  BootstrapData,
  Account,
  TradeContextInput,
  TradeInput,
} from "../../types/domain";
import { useJournalAccount } from "../accounts/journal-account-context";
import { PositionSizeCalculator } from "./position-size-calculator";

const DRAFT_KEY = "personal-macro:guided-trade-draft:v1";
type BoolValue = "" | "true" | "false";
interface GuidedValues {
  instrument: string;
  assetClass: string;
  accountId: string;
  strategyId: string;
  setupId: string;
  direction: "long" | "short";
  session: string;
  timeframe: string;
  marketCondition: string;
  tags: string;
  plannedEntry: string;
  initialStopLoss: string;
  takeProfit: string;
  plannedRisk: string;
  riskPercent: string;
  confidence: string;
  thesis: string;
  invalidation: string;
  preChecklist: string;
  openedAt: string;
  closedAt: string;
  actualEntry: string;
  quantity: string;
  actualRisk: string;
  finalStopLoss: string;
  actualExit: string;
  fees: string;
  commission: string;
  swap: string;
  executionNotes: string;
  deviations: string;
  legs: string;
  grossPnl: string;
  mae: string;
  maeR: string;
  mfe: string;
  mfeR: string;
  setupQuality: string;
  executionScore: string;
  riskQuality: string;
  followedPlan: BoolValue;
  followedRiskRules: BoolValue;
  followedEntryRules: BoolValue;
  followedExitRules: BoolValue;
  positiveReview: string;
  negativeReview: string;
  lesson: string;
  nextAction: string;
  emotionBefore: string;
  emotionDuring: string;
  emotionAfter: string;
  focus: string;
  stress: string;
  energy: string;
  emotionalControl: string;
  processScore: string;
  satisfaction: string;
}

const emptyValues: GuidedValues = {
  instrument: "",
  assetClass: "forex",
  accountId: "",
  strategyId: "",
  setupId: "",
  direction: "long",
  session: "London",
  timeframe: "H1",
  marketCondition: "Trend",
  tags: "",
  plannedEntry: "",
  initialStopLoss: "",
  takeProfit: "",
  plannedRisk: "",
  riskPercent: "",
  confidence: "",
  thesis: "",
  invalidation: "",
  preChecklist: "Macro Bias geprüft\nRisiko berechnet\nNews-Zeit geprüft",
  openedAt: "",
  closedAt: "",
  actualEntry: "",
  quantity: "",
  actualRisk: "",
  finalStopLoss: "",
  actualExit: "",
  fees: "0",
  commission: "0",
  swap: "0",
  executionNotes: "",
  deviations: "",
  legs: "",
  grossPnl: "",
  mae: "",
  maeR: "",
  mfe: "",
  mfeR: "",
  setupQuality: "",
  executionScore: "",
  riskQuality: "",
  followedPlan: "",
  followedRiskRules: "",
  followedEntryRules: "",
  followedExitRules: "",
  positiveReview: "",
  negativeReview: "",
  lesson: "",
  nextAction: "",
  emotionBefore: "",
  emotionDuring: "",
  emotionAfter: "",
  focus: "",
  stress: "",
  energy: "",
  emotionalControl: "",
  processScore: "",
  satisfaction: "",
};

export function resolveGuidedDraft(
  saved: GuidedValues | null,
  selectedAccountId: string | null,
) {
  return saved && saved.accountId === selectedAccountId
    ? saved
    : { ...emptyValues, accountId: selectedAccountId ?? "" };
}

const steps = ["Planung", "Ausführung", "Ergebnis", "Review"];
export function GuidedTradeDialog() {
  const { guidedTradeOpen, setGuidedTradeOpen } = useUiStore();
  const { status: journalAccountStatus, selectedAccount } = useJournalAccount();
  const ready = journalAccountStatus === "ready" && selectedAccount !== null;
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: api.bootstrap,
  });
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<GuidedValues>(emptyValues);
  const [savedAt, setSavedAt] = useState<string>();
  useEffect(() => {
    if (!guidedTradeOpen) return;
    try {
      const saved = JSON.parse(
        localStorage.getItem(DRAFT_KEY) ?? "null",
      ) as GuidedValues | null;
      setValues(resolveGuidedDraft(saved, selectedAccount?.id ?? null));
    } catch {
      setValues(emptyValues);
    }
    setStep(0);
  }, [guidedTradeOpen, selectedAccount]);
  useEffect(() => {
    if (guidedTradeOpen && !ready) setGuidedTradeOpen(false);
  }, [guidedTradeOpen, ready, setGuidedTradeOpen]);
  useEffect(() => {
    if (!guidedTradeOpen) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
      setSavedAt(new Date().toISOString());
    }, 450);
    return () => window.clearTimeout(timer);
  }, [values, guidedTradeOpen]);
  const progress = useMemo(
    () => Math.round(((step + 1) / steps.length) * 100),
    [step],
  );
  const mutation = useMutation({
    mutationFn: async (finalize: boolean) => {
      const trade = await api.createTrade(
        toTradeInput(values, finalize, selectedAccount!.id),
      );
      await api.saveTradeContext(
        selectedAccount!.id,
        toTradeContext(trade.id, values, bootstrap.data),
      );
      return trade;
    },
    onSuccess: async (trade, finalize) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trades"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      ]);
      localStorage.removeItem(DRAFT_KEY);
      setValues(emptyValues);
      toast.success(
        finalize
          ? `${trade.instrument} vollständig gespeichert.`
          : `${trade.instrument} als Datenbank-Entwurf gespeichert.`,
      );
      setGuidedTradeOpen(false);
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Trade konnte nicht gespeichert werden."),
  });
  const set = useCallback(
    <K extends keyof GuidedValues>(key: K, value: GuidedValues[K]) =>
      setValues((current) => ({ ...current, [key]: value })),
    [],
  );
  return (
    <Dialog.Root open={guidedTradeOpen} onOpenChange={setGuidedTradeOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content wide guided-dialog"
          aria-describedby="guided-description"
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">
                Geführte Trade-Erfassung
              </Dialog.Title>
              <Dialog.Description
                id="guided-description"
                className="dialog-description"
              >
                Vier Schritte · automatische lokale Zwischenspeicherung
              </Dialog.Description>
            </div>
            <div className="page-actions">
              <Badge className="positive">
                {savedAt ? "Automatisch gespeichert" : "Bereit"}
              </Badge>
              <Dialog.Close asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Dialog schließen"
                >
                  <X size={17} />
                </Button>
              </Dialog.Close>
            </div>
          </header>
          <div className="guided-steps">
            {steps.map((label, index) => (
              <button
                key={label}
                className={
                  index === step ? "active" : index < step ? "complete" : ""
                }
                onClick={() => setStep(index)}
              >
                <span>{index < step ? <Check size={12} /> : index + 1}</span>
                {label}
              </button>
            ))}
            <div className="guided-progress">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="dialog-body">
            {step === 0 && (
              <PlanningStep
                values={values}
                set={set}
                bootstrap={bootstrap.data}
                selectedAccount={selectedAccount}
              />
            )}
            {step === 1 && <ExecutionStep values={values} set={set} />}
            {step === 2 && <ResultStep values={values} set={set} />}
            {step === 3 && (
              <ReviewStep
                values={values}
                set={set}
                bootstrap={bootstrap.data}
              />
            )}
          </div>
          <footer className="dialog-footer">
            <div className="page-actions">
              <Button
                disabled={step === 0}
                onClick={() => setStep((value) => value - 1)}
              >
                <ChevronLeft size={14} /> Zurück
              </Button>
              <Button
                onClick={() => mutation.mutate(false)}
                disabled={
                  !ready || !values.instrument.trim() || mutation.isPending
                }
              >
                <Save size={14} /> Als Entwurf
              </Button>
            </div>
            {step < 3 ? (
              <Button
                variant="primary"
                onClick={() => setStep((value) => value + 1)}
              >
                Weiter <ChevronRight size={14} />
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => mutation.mutate(true)}
                disabled={
                  !ready || !values.instrument.trim() || mutation.isPending
                }
              >
                <Check size={14} /> Trade abschließen
              </Button>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type Setter = <K extends keyof GuidedValues>(
  key: K,
  value: GuidedValues[K],
) => void;
function PlanningStep({
  values,
  set,
  bootstrap,
  selectedAccount,
}: {
  values: GuidedValues;
  set: Setter;
  bootstrap?: Awaited<ReturnType<typeof api.bootstrap>>;
  selectedAccount: Account | null;
}) {
  return (
    <>
      <Section title="Markt & Setup">
        <div className="form-grid cols-3">
          <Input
            label="Instrument"
            value={values.instrument}
            onChange={(value) => set("instrument", value)}
            autoFocus
          />
          <Select
            label="Assetklasse"
            value={values.assetClass}
            onChange={(value) => set("assetClass", value)}
            options={[
              "forex",
              "futures",
              "metals",
              "crypto",
              "indices",
              "stocks",
              "etf",
              "options",
              "bonds",
            ]}
          />
          <Select
            label="Richtung"
            value={values.direction}
            onChange={(value) => set("direction", value as "long" | "short")}
            options={["long", "short"]}
          />
          <Select
            label="Strategie"
            value={values.strategyId}
            onChange={(value) => set("strategyId", value)}
            options={[
              "",
              ...(bootstrap?.strategies.map((item) => item.id) ?? []),
            ]}
            labels={[
              "Ohne Strategie",
              ...(bootstrap?.strategies.map((item) => item.name) ?? []),
            ]}
          />
          <Select
            label="Setup"
            value={values.setupId}
            onChange={(value) => set("setupId", value)}
            options={["", ...(bootstrap?.setups.map((item) => item.id) ?? [])]}
            labels={[
              "Ohne Setup",
              ...(bootstrap?.setups.map((item) => item.name) ?? []),
            ]}
          />
          <Select
            label="Session"
            value={values.session}
            onChange={(value) => set("session", value)}
            options={["Asia", "London", "New York", "Overlap", "Außerhalb"]}
          />
          <Select
            label="Timeframe"
            value={values.timeframe}
            onChange={(value) => set("timeframe", value)}
            options={["M5", "M15", "H1", "H4", "D1", "W1"]}
          />
          <Select
            label="Marktumfeld"
            value={values.marketCondition}
            onChange={(value) => set("marketCondition", value)}
            options={[
              "Trend",
              "Range",
              "Breakout",
              "Reversal",
              "High Volatility",
              "Low Volatility",
              "News Event",
              "Unklar",
            ]}
          />
          <Input
            label="Tags (kommagetrennt)"
            value={values.tags}
            onChange={(value) => set("tags", value)}
          />
        </div>
      </Section>
      <Section title="Plan & Risiko">
        <PositionSizeCalculator
          account={selectedAccount ?? undefined}
          instrument={values.instrument}
          assetClass={values.assetClass}
          entryPrice={values.plannedEntry}
          stopPrice={values.initialStopLoss}
          riskPercent={values.riskPercent}
          riskAmount={values.plannedRisk}
          onRiskPercentChange={(value) => set("riskPercent", value)}
          onRiskAmountChange={(value) => set("plannedRisk", value)}
          onQuantityChange={(value) => set("quantity", value)}
        />
        <div className="form-grid cols-3">
          <Input
            label="Geplanter Entry"
            value={values.plannedEntry}
            onChange={(value) => set("plannedEntry", value)}
          />
          <Input
            label="Initialer Stop"
            value={values.initialStopLoss}
            onChange={(value) => set("initialStopLoss", value)}
          />
          <Input
            label="Take Profit"
            value={values.takeProfit}
            onChange={(value) => set("takeProfit", value)}
          />
          <Input
            label={`Geplantes Risiko (${selectedAccount?.baseCurrency ?? "Kontowährung"})`}
            value={values.plannedRisk}
            onChange={(value) => set("plannedRisk", value)}
          />
          <Input
            label="Risiko (%)"
            value={values.riskPercent}
            onChange={(value) => set("riskPercent", value)}
          />
          <Input
            label="Confidence (1–10)"
            value={values.confidence}
            onChange={(value) => set("confidence", value)}
            type="number"
          />
        </div>
        <TextArea
          label="These / geplantes Einstiegsszenario"
          value={values.thesis}
          onChange={(value) => set("thesis", value)}
        />
        <TextArea
          label="Invalidierung"
          value={values.invalidation}
          onChange={(value) => set("invalidation", value)}
        />
        <TextArea
          label="Pre-Trade-Checkliste (damaliger Snapshot)"
          value={values.preChecklist}
          onChange={(value) => set("preChecklist", value)}
        />
      </Section>
    </>
  );
}
function ExecutionStep({ values, set }: { values: GuidedValues; set: Setter }) {
  return (
    <>
      <Section title="Zeit & Ausführung">
        <div className="form-grid cols-3">
          <Input
            label="Eröffnet"
            value={values.openedAt}
            onChange={(value) => set("openedAt", value)}
            type="datetime-local"
          />
          <Input
            label="Geschlossen"
            value={values.closedAt}
            onChange={(value) => set("closedAt", value)}
            type="datetime-local"
          />
          <Input
            label="Tatsächlicher Entry"
            value={values.actualEntry}
            onChange={(value) => set("actualEntry", value)}
          />
          <Input
            label="Positionsgröße"
            value={values.quantity}
            onChange={(value) => set("quantity", value)}
          />
          <Input
            label="Tatsächliches Risiko (€)"
            value={values.actualRisk}
            onChange={(value) => set("actualRisk", value)}
          />
          <Input
            label="Finaler Stop"
            value={values.finalStopLoss}
            onChange={(value) => set("finalStopLoss", value)}
          />
          <Input
            label="Tatsächlicher Exit"
            value={values.actualExit}
            onChange={(value) => set("actualExit", value)}
          />
          <Input
            label="Gebühren (€)"
            value={values.fees}
            onChange={(value) => set("fees", value)}
          />
          <Input
            label="Kommission (€)"
            value={values.commission}
            onChange={(value) => set("commission", value)}
          />
          <Input
            label="Swap / Finanzierung (€)"
            value={values.swap}
            onChange={(value) => set("swap", value)}
          />
        </div>
      </Section>
      <Section title="Management">
        <TextArea
          label="Teilpositionen (entry/exit; Zeit; Preis; Größe; Gebühren; Notiz)"
          value={values.legs}
          onChange={(value) => set("legs", value)}
        />
        <TextArea
          label="Ausführungsnotizen"
          value={values.executionNotes}
          onChange={(value) => set("executionNotes", value)}
        />
        <TextArea
          label="Abweichungen vom Plan"
          value={values.deviations}
          onChange={(value) => set("deviations", value)}
        />
      </Section>
    </>
  );
}
function ResultStep({ values, set }: { values: GuidedValues; set: Setter }) {
  return (
    <>
      <Section title="Ergebnis">
        <div className="form-grid cols-3">
          <Input
            label="Brutto-P&L (€)"
            value={values.grossPnl}
            onChange={(value) => set("grossPnl", value)}
          />
          <Input
            label="MAE"
            value={values.mae}
            onChange={(value) => set("mae", value)}
          />
          <Input
            label="MAE (R)"
            value={values.maeR}
            onChange={(value) => set("maeR", value)}
          />
          <Input
            label="MFE"
            value={values.mfe}
            onChange={(value) => set("mfe", value)}
          />
          <Input
            label="MFE (R)"
            value={values.mfeR}
            onChange={(value) => set("mfeR", value)}
          />
        </div>
      </Section>
      <Section title="Qualität & Regelkonformität">
        <div className="form-grid cols-3">
          <Input
            label="Setup-Qualität (1–10)"
            value={values.setupQuality}
            onChange={(value) => set("setupQuality", value)}
            type="number"
          />
          <Input
            label="Ausführungsqualität (1–10)"
            value={values.executionScore}
            onChange={(value) => set("executionScore", value)}
            type="number"
          />
          <Input
            label="Risikoqualität (1–10)"
            value={values.riskQuality}
            onChange={(value) => set("riskQuality", value)}
            type="number"
          />
          <BooleanSelect
            label="Plan eingehalten"
            value={values.followedPlan}
            onChange={(value) => set("followedPlan", value)}
          />
          <BooleanSelect
            label="Risikoregeln"
            value={values.followedRiskRules}
            onChange={(value) => set("followedRiskRules", value)}
          />
          <BooleanSelect
            label="Entry-Regeln"
            value={values.followedEntryRules}
            onChange={(value) => set("followedEntryRules", value)}
          />
          <BooleanSelect
            label="Exit-Regeln"
            value={values.followedExitRules}
            onChange={(value) => set("followedExitRules", value)}
          />
        </div>
      </Section>
    </>
  );
}
function ReviewStep({
  values,
  set,
  bootstrap,
}: {
  values: GuidedValues;
  set: Setter;
  bootstrap?: Awaited<ReturnType<typeof api.bootstrap>>;
}) {
  const emotions = [
    "",
    ...(bootstrap?.emotions.map((item) => item.name) ?? []),
  ];
  return (
    <>
      <Section title="Reflexion">
        <div className="form-grid">
          <TextArea
            label="Was wurde gut umgesetzt?"
            value={values.positiveReview}
            onChange={(value) => set("positiveReview", value)}
          />
          <TextArea
            label="Was wurde schlecht umgesetzt?"
            value={values.negativeReview}
            onChange={(value) => set("negativeReview", value)}
          />
          <TextArea
            label="Wichtigste Erkenntnis"
            value={values.lesson}
            onChange={(value) => set("lesson", value)}
          />
          <TextArea
            label="Nächste konkrete Aktion"
            value={values.nextAction}
            onChange={(value) => set("nextAction", value)}
          />
        </div>
      </Section>
      <Section title="Psychologie & Prozess">
        <div className="form-grid cols-3">
          <Select
            label="Emotion vorher"
            value={values.emotionBefore}
            onChange={(value) => set("emotionBefore", value)}
            options={emotions}
          />
          <Select
            label="Emotion währenddessen"
            value={values.emotionDuring}
            onChange={(value) => set("emotionDuring", value)}
            options={emotions}
          />
          <Select
            label="Emotion danach"
            value={values.emotionAfter}
            onChange={(value) => set("emotionAfter", value)}
            options={emotions}
          />
          <Input
            label="Fokus (1–10)"
            value={values.focus}
            onChange={(value) => set("focus", value)}
            type="number"
          />
          <Input
            label="Stress (1–10)"
            value={values.stress}
            onChange={(value) => set("stress", value)}
            type="number"
          />
          <Input
            label="Energie (1–10)"
            value={values.energy}
            onChange={(value) => set("energy", value)}
            type="number"
          />
          <Input
            label="Emotionskontrolle (1–10)"
            value={values.emotionalControl}
            onChange={(value) => set("emotionalControl", value)}
            type="number"
          />
          <Input
            label="Prozess-Score (1–10)"
            value={values.processScore}
            onChange={(value) => set("processScore", value)}
            type="number"
          />
          <Input
            label="Zufriedenheit (1–10)"
            value={values.satisfaction}
            onChange={(value) => set("satisfaction", value)}
            type="number"
          />
        </div>
      </Section>
    </>
  );
}

function toTradeContext(
  tradeId: string,
  values: GuidedValues,
  bootstrap?: BootstrapData,
): TradeContextInput {
  const tags = values.tags
    .split(",")
    .map((value) => value.trim().toLocaleLowerCase("de-DE"))
    .filter(Boolean);
  const emotions = (
    [
      ["before", values.emotionBefore],
      ["during", values.emotionDuring],
      ["after", values.emotionAfter],
    ] as const
  ).flatMap(([phase, name]) => {
    const match = bootstrap?.emotions.find(
      (emotion) =>
        emotion.name.toLocaleLowerCase("de-DE") ===
        name.toLocaleLowerCase("de-DE"),
    );
    return match ? [{ emotionId: match.id, phase, intensity: 5 }] : [];
  });
  const legs = values.legs.split("\n").flatMap((line, index) => {
    const [type, occurredAt, price, quantity, fees, ...note] = line
      .split(";")
      .map((value) => value.trim());
    if (!occurredAt || !price || !quantity) return [];
    return [
      {
        legType:
          type.toLocaleLowerCase("de-DE") === "exit"
            ? ("exit" as const)
            : ("entry" as const),
        occurredAt: fromInputDateTime(occurredAt) ?? occurredAt,
        price,
        quantity,
        feesMinor: fees
          ? Math.round(Number(fees.replace(",", ".")) * 100) || 0
          : 0,
        note: note.join("; ") || undefined,
        sortOrder: index,
      },
    ];
  });
  return {
    tradeId,
    tagIds:
      bootstrap?.tags
        .filter((tag) => tags.includes(tag.name.toLocaleLowerCase("de-DE")))
        .map((tag) => tag.id) ?? [],
    legs,
    checklistItems: values.preChecklist
      .split("\n")
      .map((label, index) => ({
        label: label.trim(),
        isRequired: true,
        isChecked: true,
        sortOrder: index,
      }))
      .filter((item) => item.label.length > 0),
    emotions,
    customValues: [],
  };
}

function toTradeInput(
  values: GuidedValues,
  finalize: boolean,
  accountId: string,
): TradeInput {
  const bool = (value: BoolValue) =>
    value === "" ? undefined : value === "true";
  const score = (value: string) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10
      ? parsed
      : undefined;
  };
  const money = (value: string) => {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) && value.trim()
      ? Math.round(parsed * 100)
      : undefined;
  };
  const metadata = {
    version: 1,
    marketCondition: values.marketCondition,
    riskPercent: values.riskPercent,
    invalidationReason: values.invalidation,
    preTradeChecklistSnapshot: values.preChecklist.split("\n").filter(Boolean),
    actualRiskMinor: money(values.actualRisk),
    finalStopLoss: values.finalStopLoss,
    deviations: values.deviations,
    tradeLegsText: values.legs,
    mae: values.mae,
    mfe: values.mfe,
    riskQuality: score(values.riskQuality),
    emotionalControl: score(values.emotionalControl),
    positiveReview: values.positiveReview,
    negativeReview: values.negativeReview,
    nextAction: values.nextAction,
    emotionBefore: values.emotionBefore,
    emotionDuring: values.emotionDuring,
    emotionAfter: values.emotionAfter,
  };
  return {
    accountId,
    strategyId: values.strategyId || undefined,
    setupId: values.setupId || undefined,
    status: finalize ? (values.closedAt ? "closed" : "open") : "draft",
    instrument: values.instrument,
    assetClass: values.assetClass,
    direction: values.direction,
    session: values.session,
    timeframe: values.timeframe,
    openedAt: fromInputDateTime(values.openedAt),
    closedAt: fromInputDateTime(values.closedAt),
    displayTimezone: "Europe/Berlin",
    plannedEntry: values.plannedEntry || undefined,
    actualEntry: values.actualEntry || undefined,
    initialStopLoss: values.initialStopLoss || undefined,
    actualExit: values.actualExit || undefined,
    takeProfit: values.takeProfit || undefined,
    quantity: values.quantity || undefined,
    plannedRiskMinor: money(values.plannedRisk),
    grossPnlMinor: money(values.grossPnl),
    feesMinor: money(values.fees) ?? 0,
    commissionMinor: money(values.commission) ?? 0,
    swapMinor: money(values.swap) ?? 0,
    netPnlMinor: undefined,
    rOverride: undefined,
    rOverrideReason: undefined,
    maeR: values.maeR || undefined,
    mfeR: values.mfeR || undefined,
    followedPlan: bool(values.followedPlan),
    followedRiskRules: bool(values.followedRiskRules),
    followedEntryRules: bool(values.followedEntryRules),
    followedExitRules: bool(values.followedExitRules),
    impulseTrade: undefined,
    processScore: score(values.processScore),
    executionScore: score(values.executionScore),
    setupQuality: score(values.setupQuality),
    confidenceBefore: score(values.confidence),
    focusBefore: score(values.focus),
    stressBefore: score(values.stress),
    energyBefore: score(values.energy),
    satisfactionAfter: score(values.satisfaction),
    reviewedAt: finalize ? new Date().toISOString() : undefined,
    thesisHtml: values.thesis || undefined,
    executionNotesHtml: values.executionNotes || undefined,
    reviewNotesHtml:
      [values.positiveReview, values.negativeReview]
        .filter(Boolean)
        .join("\n\n") || undefined,
    lessonsHtml:
      [values.lesson, values.nextAction].filter(Boolean).join("\n\n") ||
      undefined,
    sourceMetadataJson: JSON.stringify(metadata),
  };
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="form-section">
      <h3 className="form-section-title">{title}</h3>
      {children}
    </section>
  );
}
function Input({
  label,
  value,
  onChange,
  type = "text",
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoFocus?: boolean;
}) {
  const id = `guided-${label.replace(/\W/g, "-")}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoFocus={autoFocus}
        min={type === "number" ? 1 : undefined}
        max={type === "number" ? 10 : undefined}
      />
    </div>
  );
}
function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `guided-${label.replace(/\W/g, "-")}`;
  return (
    <div className="field" style={{ marginTop: 12 }}>
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        className="textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labels?: string[];
}) {
  const id = `guided-${label.replace(/\W/g, "-")}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option, index) => (
          <option key={`${option}-${index}`} value={option}>
            {(labels?.[index] ?? option) || "Nicht gewählt"}
          </option>
        ))}
      </select>
    </div>
  );
}
function BooleanSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: BoolValue;
  onChange: (value: BoolValue) => void;
}) {
  return (
    <Select
      label={label}
      value={value}
      onChange={(next) => onChange(next as BoolValue)}
      options={["", "true", "false"]}
      labels={["Nicht bewertet", "Ja", "Nein"]}
    />
  );
}
