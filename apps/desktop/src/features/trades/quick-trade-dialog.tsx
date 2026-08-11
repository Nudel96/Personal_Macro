import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, X } from "lucide-react";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  type ReactElement,
} from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "../../components/ui/button";
import { fromInputDateTime } from "../../lib/utils";
import { api } from "../../services/commands";
import { useUiStore } from "../../stores/ui-store";
import type { TradeInput } from "../../types/domain";
import { PositionSizeCalculator } from "./position-size-calculator";

const tradeSchema = z
  .object({
    instrument: z.string().trim().min(2, "Instrument fehlt").max(32),
    direction: z.enum(["long", "short"]),
    status: z.enum(["draft", "planned", "open", "closed"]),
    assetClass: z.string(),
    accountId: z.string().optional(),
    setupId: z.string().optional(),
    session: z.string().optional(),
    timeframe: z.string().optional(),
    openedAt: z.string().optional(),
    closedAt: z.string().optional(),
    actualEntry: z.string().optional(),
    initialStopLoss: z.string().optional(),
    actualExit: z.string().optional(),
    takeProfit: z.string().optional(),
    quantity: z.string().optional(),
    plannedRisk: z.string().optional(),
    riskPercent: z.string().optional(),
    grossPnl: z.string().optional(),
    fees: z.string().optional(),
    commission: z.string().optional(),
    swap: z.string().optional(),
    processScore: z.string().optional(),
    executionScore: z.string().optional(),
    setupQuality: z.string().optional(),
    followedPlan: z.enum(["", "true", "false"]),
    followedRiskRules: z.enum(["", "true", "false"]),
    impulseTrade: z.enum(["", "true", "false"]),
    thesisHtml: z.string().optional(),
    reviewNotesHtml: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.status === "closed" && !value.closedAt) {
      context.addIssue({
        code: "custom",
        path: ["closedAt"],
        message: "Ausstiegszeit fehlt",
      });
    }
  });

type TradeFormValues = z.infer<typeof tradeSchema>;

const defaults: TradeFormValues = {
  instrument: "",
  direction: "long",
  status: "closed",
  assetClass: "forex",
  accountId: "",
  setupId: "",
  session: "London",
  timeframe: "H1",
  openedAt: "",
  closedAt: "",
  actualEntry: "",
  initialStopLoss: "",
  actualExit: "",
  takeProfit: "",
  quantity: "",
  plannedRisk: "",
  riskPercent: "",
  grossPnl: "",
  fees: "0",
  commission: "0",
  swap: "0",
  processScore: "",
  executionScore: "",
  setupQuality: "",
  followedPlan: "",
  followedRiskRules: "",
  impulseTrade: "",
  thesisHtml: "",
  reviewNotesHtml: "",
};

function moneyMinor(value?: string) {
  if (value == null || value.trim() === "") return undefined;
  const numeric = Number(value.replace(",", "."));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : undefined;
}

function score(value?: string) {
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 10
    ? numeric
    : undefined;
}

function optionalBoolean(value: "" | "true" | "false") {
  return value === "" ? undefined : value === "true";
}

export function QuickTradeDialog() {
  const { quickTradeOpen, setQuickTradeOpen, setGuidedTradeOpen } =
    useUiStore();
  const queryClient = useQueryClient();
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: api.bootstrap,
  });
  const form = useForm<TradeFormValues>({
    resolver: zodResolver(tradeSchema),
    defaultValues: defaults,
  });
  const status = form.watch("status");
  const accountId = form.watch("accountId");
  const instrument = form.watch("instrument");
  const assetClass = form.watch("assetClass");
  const actualEntry = form.watch("actualEntry");
  const initialStopLoss = form.watch("initialStopLoss");
  const plannedRisk = form.watch("plannedRisk");
  const riskPercent = form.watch("riskPercent");
  const sizingAccount = bootstrap.data?.accounts.find(
    (account) => account.id === accountId,
  );
  useEffect(() => {
    if (
      quickTradeOpen &&
      !form.getValues("accountId") &&
      bootstrap.data?.accounts[0]
    ) {
      form.setValue("accountId", bootstrap.data.accounts[0].id);
    }
  }, [bootstrap.data, form, quickTradeOpen]);
  const setRiskPercent = useCallback(
    (value: string) => form.setValue("riskPercent", value),
    [form],
  );
  const setPlannedRisk = useCallback(
    (value: string) => form.setValue("plannedRisk", value),
    [form],
  );
  const setQuantity = useCallback(
    (value: string) => form.setValue("quantity", value),
    [form],
  );
  const title = useMemo(
    () => (status === "draft" ? "Trade-Entwurf" : "Trade erfassen"),
    [status],
  );

  const mutation = useMutation({
    mutationFn: api.createTrade,
    onSuccess: (trade) => {
      toast.success(`${trade.instrument} wurde gespeichert.`);
      queryClient.invalidateQueries({ queryKey: ["trades"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      form.reset(defaults);
      setQuickTradeOpen(false);
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Trade konnte nicht gespeichert werden."),
  });

  const submit = form.handleSubmit((values) => {
    const input: TradeInput = {
      accountId: values.accountId || undefined,
      strategyId: undefined,
      setupId: values.setupId || undefined,
      status: values.status,
      instrument: values.instrument,
      assetClass: values.assetClass,
      direction: values.direction,
      session: values.session || undefined,
      timeframe: values.timeframe || undefined,
      openedAt: fromInputDateTime(values.openedAt),
      closedAt: fromInputDateTime(values.closedAt),
      displayTimezone: "Europe/Berlin",
      plannedEntry: undefined,
      actualEntry: values.actualEntry || undefined,
      initialStopLoss: values.initialStopLoss || undefined,
      actualExit: values.actualExit || undefined,
      takeProfit: values.takeProfit || undefined,
      quantity: values.quantity || undefined,
      plannedRiskMinor: moneyMinor(values.plannedRisk),
      grossPnlMinor: moneyMinor(values.grossPnl),
      feesMinor: moneyMinor(values.fees) ?? 0,
      commissionMinor: moneyMinor(values.commission) ?? 0,
      swapMinor: moneyMinor(values.swap) ?? 0,
      netPnlMinor: undefined,
      rOverride: undefined,
      rOverrideReason: undefined,
      maeR: undefined,
      mfeR: undefined,
      followedPlan: optionalBoolean(values.followedPlan),
      followedRiskRules: optionalBoolean(values.followedRiskRules),
      followedEntryRules: undefined,
      followedExitRules: undefined,
      impulseTrade: optionalBoolean(values.impulseTrade),
      processScore: score(values.processScore),
      executionScore: score(values.executionScore),
      setupQuality: score(values.setupQuality),
      confidenceBefore: undefined,
      focusBefore: undefined,
      stressBefore: undefined,
      energyBefore: undefined,
      satisfactionAfter: undefined,
      reviewedAt: undefined,
      thesisHtml: values.thesisHtml || undefined,
      executionNotesHtml: undefined,
      reviewNotesHtml: values.reviewNotesHtml || undefined,
      lessonsHtml: undefined,
    };
    mutation.mutate(input);
  });

  return (
    <Dialog.Root open={quickTradeOpen} onOpenChange={setQuickTradeOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content wide"
          aria-describedby="quick-trade-description"
        >
          <form onSubmit={submit}>
            <header className="dialog-header">
              <div>
                <Dialog.Title className="dialog-title">{title}</Dialog.Title>
                <Dialog.Description
                  id="quick-trade-description"
                  className="dialog-description"
                >
                  Schnellerfassung mit Ergebnis-, Risiko- und Prozessdaten
                </Dialog.Description>
              </div>
              <div className="page-actions">
                <Button
                  type="button"
                  onClick={() => {
                    setQuickTradeOpen(false);
                    setGuidedTradeOpen(true);
                  }}
                >
                  Geführte Erfassung
                </Button>
                <Dialog.Close asChild>
                  <Button variant="ghost" size="icon" aria-label="Schließen">
                    <X size={17} />
                  </Button>
                </Dialog.Close>
              </div>
            </header>
            <div className="dialog-body">
              <section className="form-section">
                <h3 className="form-section-title">Grunddaten</h3>
                <div className="form-grid cols-3">
                  <Field
                    label="Instrument"
                    error={form.formState.errors.instrument?.message}
                  >
                    <input
                      className="input"
                      placeholder="z. B. EURUSD"
                      {...form.register("instrument")}
                      autoFocus
                    />
                  </Field>
                  <Field label="Richtung">
                    <select className="select" {...form.register("direction")}>
                      <option value="long">Long</option>
                      <option value="short">Short</option>
                    </select>
                  </Field>
                  <Field label="Status">
                    <select className="select" {...form.register("status")}>
                      <option value="draft">Entwurf</option>
                      <option value="planned">Geplant</option>
                      <option value="open">Offen</option>
                      <option value="closed">Geschlossen</option>
                    </select>
                  </Field>
                  <Field label="Konto">
                    <select className="select" {...form.register("accountId")}>
                      <option value="">Nicht zugeordnet</option>
                      {bootstrap.data?.accounts.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Setup">
                    <select className="select" {...form.register("setupId")}>
                      <option value="">Ohne Setup</option>
                      {bootstrap.data?.setups.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Assetklasse">
                    <select className="select" {...form.register("assetClass")}>
                      <option value="forex">Forex</option>
                      <option value="futures">Futures</option>
                      <option value="metals">Edelmetalle</option>
                      <option value="crypto">Krypto</option>
                      <option value="indices">Indizes</option>
                      <option value="stocks">Aktien</option>
                    </select>
                  </Field>
                  <Field label="Session">
                    <select className="select" {...form.register("session")}>
                      <option>Asia</option>
                      <option>London</option>
                      <option>New York</option>
                      <option>Overlap</option>
                      <option>Außerhalb</option>
                    </select>
                  </Field>
                  <Field label="Timeframe">
                    <select className="select" {...form.register("timeframe")}>
                      <option>M5</option>
                      <option>M15</option>
                      <option>H1</option>
                      <option>H4</option>
                      <option>D1</option>
                    </select>
                  </Field>
                  <div />
                  <Field label="Einstieg">
                    <input
                      className="input"
                      type="datetime-local"
                      {...form.register("openedAt")}
                    />
                  </Field>
                  <Field
                    label="Ausstieg"
                    error={form.formState.errors.closedAt?.message}
                  >
                    <input
                      className="input"
                      type="datetime-local"
                      {...form.register("closedAt")}
                    />
                  </Field>
                </div>
              </section>
              <section className="form-section">
                <h3 className="form-section-title">Ausführung & Risiko</h3>
                <PositionSizeCalculator
                  account={sizingAccount}
                  instrument={instrument}
                  assetClass={assetClass}
                  entryPrice={actualEntry ?? ""}
                  stopPrice={initialStopLoss ?? ""}
                  riskPercent={riskPercent ?? ""}
                  riskAmount={plannedRisk ?? ""}
                  onRiskPercentChange={setRiskPercent}
                  onRiskAmountChange={setPlannedRisk}
                  onQuantityChange={setQuantity}
                />
                <div className="form-grid cols-3">
                  <Field label="Entry-Preis">
                    <input
                      className="input"
                      inputMode="decimal"
                      placeholder="1,0850"
                      {...form.register("actualEntry")}
                    />
                  </Field>
                  <Field label="Initialer Stop">
                    <input
                      className="input"
                      inputMode="decimal"
                      placeholder="1,0800"
                      {...form.register("initialStopLoss")}
                    />
                  </Field>
                  <Field label="Take Profit">
                    <input
                      className="input"
                      inputMode="decimal"
                      {...form.register("takeProfit")}
                    />
                  </Field>
                  <Field label="Exit-Preis">
                    <input
                      className="input"
                      inputMode="decimal"
                      {...form.register("actualExit")}
                    />
                  </Field>
                  <Field label="Positionsgröße">
                    <input
                      className="input"
                      inputMode="decimal"
                      {...form.register("quantity")}
                    />
                  </Field>
                  <Field
                    label={`Geplantes Risiko (${sizingAccount?.baseCurrency ?? "Kontowährung"})`}
                  >
                    <input
                      className="input"
                      inputMode="decimal"
                      placeholder="100,00"
                      {...form.register("plannedRisk")}
                    />
                  </Field>
                  <Field label="Brutto-P&L (€)">
                    <input
                      className="input"
                      inputMode="decimal"
                      placeholder="250,00"
                      {...form.register("grossPnl")}
                    />
                  </Field>
                  <Field label="Gebühren (€)">
                    <input
                      className="input"
                      inputMode="decimal"
                      {...form.register("fees")}
                    />
                  </Field>
                  <Field label="Kommission (€)">
                    <input
                      className="input"
                      inputMode="decimal"
                      {...form.register("commission")}
                    />
                  </Field>
                  <Field label="Swap/Finanzierung (€)">
                    <input
                      className="input"
                      inputMode="decimal"
                      {...form.register("swap")}
                    />
                  </Field>
                </div>
              </section>
              <section className="form-section">
                <h3 className="form-section-title">Prozess & Psychologie</h3>
                <p className="form-section-copy">
                  Nicht bewertete Felder bleiben unbekannt und zählen nicht als
                  Regelverstoß.
                </p>
                <div className="form-grid cols-3">
                  <Field label="Plan eingehalten">
                    <select
                      className="select"
                      {...form.register("followedPlan")}
                    >
                      <option value="">Nicht bewertet</option>
                      <option value="true">Ja</option>
                      <option value="false">Nein</option>
                    </select>
                  </Field>
                  <Field label="Risikoregeln eingehalten">
                    <select
                      className="select"
                      {...form.register("followedRiskRules")}
                    >
                      <option value="">Nicht bewertet</option>
                      <option value="true">Ja</option>
                      <option value="false">Nein</option>
                    </select>
                  </Field>
                  <Field label="Impulstrade">
                    <select
                      className="select"
                      {...form.register("impulseTrade")}
                    >
                      <option value="">Nicht bewertet</option>
                      <option value="false">Nein</option>
                      <option value="true">Ja</option>
                    </select>
                  </Field>
                  <Field label="Prozess-Score (1–10)">
                    <input
                      className="input"
                      min="1"
                      max="10"
                      type="number"
                      {...form.register("processScore")}
                    />
                  </Field>
                  <Field label="Ausführung (1–10)">
                    <input
                      className="input"
                      min="1"
                      max="10"
                      type="number"
                      {...form.register("executionScore")}
                    />
                  </Field>
                  <Field label="Setup-Qualität (1–10)">
                    <input
                      className="input"
                      min="1"
                      max="10"
                      type="number"
                      {...form.register("setupQuality")}
                    />
                  </Field>
                </div>
              </section>
              <section className="form-section">
                <h3 className="form-section-title">Notizen</h3>
                <div className="form-grid">
                  <Field label="These">
                    <textarea
                      className="textarea"
                      placeholder="Warum ist dieser Trade valide?"
                      {...form.register("thesisHtml")}
                    />
                  </Field>
                  <Field label="Review">
                    <textarea
                      className="textarea"
                      placeholder="Was lief gut, was verbesserst du?"
                      {...form.register("reviewNotesHtml")}
                    />
                  </Field>
                </div>
              </section>
            </div>
            <footer className="dialog-footer">
              <span className="muted" style={{ fontSize: 10 }}>
                R wird aus Netto-P&L ÷ geplantem Risiko berechnet.
              </span>
              <div className="page-actions">
                <Dialog.Close asChild>
                  <Button type="button">Abbrechen</Button>
                </Dialog.Close>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={mutation.isPending}
                >
                  <Save size={15} />{" "}
                  {mutation.isPending ? "Speichert …" : "Trade speichern"}
                </Button>
              </div>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  const generatedId = useId();
  const errorId = `${generatedId}-error`;
  const control = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{
          id?: string;
          "aria-invalid"?: boolean;
          "aria-describedby"?: string;
        }>,
        {
          id: (children.props as { id?: string }).id ?? generatedId,
          "aria-invalid": Boolean(error),
          "aria-describedby": error ? errorId : undefined,
        },
      )
    : children;
  return (
    <div className="field">
      <div className="field-label-row">
        <label htmlFor={generatedId}>{label}</label>
        {error && (
          <span id={errorId} className="field-error">
            {error}
          </span>
        )}
      </div>
      {control}
    </div>
  );
}
