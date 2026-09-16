import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calculator,
  Check,
  ChevronDown,
  CircleDot,
  FileText,
  ImagePlus,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { formatR, toInputDateTime } from "../../lib/utils";
import { api } from "../../services/commands";
import { useUiStore } from "../../stores/ui-store";
import type {
  Account,
  TradeInput,
  TradeScreenshotInput,
} from "../../types/domain";
import {
  useJournalAccount,
  type JournalAccountStatus,
} from "../accounts/journal-account-context";
import {
  accountMoney,
  useAccountJournal,
} from "../accounts/use-account-journal";
import { PositionSizeCalculator } from "./position-size-calculator";
import {
  TradeScreenshotImport,
  type ScreenshotReview,
} from "./trade-screenshot-import";
import {
  captureDefaults,
  captureDraftKey,
  captureInput,
  captureMoney,
  captureNetPnl,
  captureSchema,
  readCaptureDraft,
  type CaptureValues,
} from "./trade-capture";
import "./trade-capture.css";

export function readyTradeAccountId(
  status: JournalAccountStatus,
  selectedAccountId: string | null,
) {
  return status === "ready" ? selectedAccountId : null;
}

export function QuickTradeDialog() {
  const { quickTradeOpen, setQuickTradeOpen } = useUiStore();
  const { status, selectedAccount } = useJournalAccount();
  const readyId = readyTradeAccountId(status, selectedAccount?.id ?? null);
  useEffect(() => {
    if (quickTradeOpen && !readyId) setQuickTradeOpen(false);
  }, [quickTradeOpen, readyId, setQuickTradeOpen]);
  return quickTradeOpen && readyId && selectedAccount ? (
    <QuickTradeForm
      key={readyId}
      account={selectedAccount}
      onClose={() => setQuickTradeOpen(false)}
    />
  ) : null;
}

const statusChoices = [
  {
    value: "closed",
    label: "Abgeschlossen",
    hint: "Ergebnis eintragen",
    icon: Check,
  },
  {
    value: "open",
    label: "Läuft noch",
    hint: "Später abschließen",
    icon: CircleDot,
  },
  {
    value: "planned",
    label: "Geplant",
    hint: "Trade vorbereiten",
    icon: FileText,
  },
] as const;

function QuickTradeForm({
  account,
  onClose,
}: {
  account: Account;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const accountJournal = useAccountJournal(account.id);
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: api.bootstrap,
  });
  const [initialDraft] = useState(() => readCaptureDraft(account.id));
  const form = useForm<CaptureValues>({
    resolver: zodResolver(captureSchema),
    defaultValues: initialDraft?.values ?? captureDefaults(),
  });
  const values = form.watch();
  const { status } = values;
  const [screenshot, setScreenshot] = useState<TradeScreenshotInput | null>(
    null,
  );
  const [screenshotReview, setScreenshotReview] =
    useState<ScreenshotReview | null>(initialDraft?.screenshotReview ?? null);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [imageMissing, setImageMissing] = useState(
    initialDraft?.hadScreenshot ?? false,
  );
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [executionOpen, setExecutionOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [automaticSizing, setAutomaticSizing] = useState(false);
  const [draftStatus, setDraftStatus] = useState(
    initialDraft ? "Entwurf wiederhergestellt" : "",
  );
  const saved = useRef(false);
  const saving = useRef(false);
  const currency = account.baseCurrency;
  const net = captureNetPnl(values);
  const risk = captureMoney(values.plannedRisk);
  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(
      amount / 100,
    );

  useEffect(() => {
    const persist = () => {
      if (saved.current) return;
      try {
        localStorage.setItem(
          captureDraftKey(account.id),
          JSON.stringify({
            values: form.getValues(),
            screenshotReview,
            hadScreenshot: Boolean(screenshot) || imageMissing,
          }),
        );
        setDraftStatus("Entwurf lokal gesichert");
      } catch {
        setDraftStatus(
          "Zwischenspeichern nicht verfügbar – bitte Trade speichern",
        );
      }
    };
    const subscription = form.watch(persist);
    if (screenshot || screenshotReview) persist();
    return () => subscription.unsubscribe();
  }, [account.id, form, screenshot, screenshotReview, imageMissing]);

  const setRiskPercent = useCallback(
    (value: string) =>
      form.setValue("riskPercent", value, { shouldDirty: true }),
    [form],
  );
  const setPlannedRisk = useCallback(
    (value: string) =>
      form.setValue("plannedRisk", value, { shouldDirty: true }),
    [form],
  );
  const setQuantity = useCallback(
    (value: string) => form.setValue("quantity", value, { shouldDirty: true }),
    [form],
  );

  const mutation = useMutation({
    mutationFn: (input: TradeInput) =>
      screenshot
        ? api.createTradeWithScreenshot(input, screenshot)
        : api.createTrade(input),
    onSuccess: (trade) => {
      saved.current = true;
      try {
        localStorage.removeItem(captureDraftKey(account.id));
      } catch {
        /* Saving the trade still succeeded. */
      }
      for (const key of [
        "trades",
        "dashboard",
        "bootstrap",
        "media",
        "calendar",
        "analytics",
      ])
        queryClient.invalidateQueries({ queryKey: [key] });
      toast.success(trade.instrument + " wurde gespeichert.", {
        description:
          trade.status === "open"
            ? "Zum Abschließen den Trade in der Liste öffnen."
            : "Du kannst alle Angaben später im Trade ergänzen.",
      });
      onClose();
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Trade konnte nicht gespeichert werden."),
    onSettled: () => {
      saving.current = false;
    },
  });

  const submit = form.handleSubmit(
    (next) => {
      if (screenshotBusy || saving.current) return;
      saving.current = true;
      mutation.mutate(captureInput(next, account.id, screenshotReview));
    },
    (errors) => {
      if (
        [
          "actualEntry",
          "initialStopLoss",
          "actualExit",
          "takeProfit",
          "quantity",
          "plannedRisk",
          "openedAt",
          "fees",
          "commission",
          "swap",
        ].some((key) => key in errors)
      )
        setExecutionOpen(true);
      toast.error("Bitte die markierten Eingaben prüfen.");
    },
  );

  const setStatus = (next: CaptureValues["status"]) => {
    form.setValue("status", next, { shouldDirty: true });
    if (next === "closed" && !form.getValues("closedAt"))
      form.setValue("closedAt", toInputDateTime(new Date().toISOString()));
    if (next === "open" && !form.getValues("openedAt"))
      form.setValue("openedAt", toInputDateTime(new Date().toISOString()));
    form.clearErrors("closedAt");
  };

  const numericField = (
    key: keyof CaptureValues,
    label: string,
    placeholder?: string,
  ) => (
    <CaptureField label={label} error={form.formState.errors[key]?.message}>
      <input
        className="input"
        inputMode="decimal"
        placeholder={placeholder}
        {...form.register(key, {
          onChange: () => {
            if (key === "plannedRisk" || key === "quantity")
              setAutomaticSizing(false);
          },
        })}
      />
    </CaptureField>
  );

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content trade-capture-dialog"
          aria-describedby="capture-description"
        >
          <form onSubmit={submit} noValidate>
            <header className="dialog-header">
              <div>
                <Dialog.Title className="dialog-title">
                  Trade erfassen
                </Dialog.Title>
                <Dialog.Description
                  id="capture-description"
                  className="dialog-description"
                >
                  Die wichtigsten Angaben zuerst. Alles Weitere kannst du später
                  ergänzen.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={mutation.isPending}
                  aria-label="Schließen"
                >
                  <X size={17} />
                </Button>
              </Dialog.Close>
            </header>
            <div className="dialog-body trade-capture-body">
              <div className="trade-capture-account">
                <span>
                  {account.name}{" "}
                  <span className="muted">· Konto-P&L gesamt </span>
                  <strong>
                    {accountMoney(accountJournal.data?.netPnlMinor, currency)}
                  </strong>
                </span>
                <span className="muted" role="status">
                  {draftStatus ||
                    (status === "closed"
                      ? "Nur Instrument und Abschlusszeit sind Pflicht"
                      : "Nur das Instrument ist Pflicht")}
                </span>
              </div>
              <fieldset
                className="trade-capture-status"
                disabled={mutation.isPending}
              >
                <legend>Wo steht dein Trade?</legend>
                <div>
                  {statusChoices.map(({ value, label, hint, icon: Icon }) => (
                    <label
                      key={value}
                      className={status === value ? "selected" : ""}
                    >
                      <input
                        type="radio"
                        value={value}
                        name="capture-status"
                        checked={status === value}
                        onChange={() => setStatus(value)}
                      />
                      <Icon size={17} />
                      <span>
                        <strong>{label}</strong>
                        <small>{hint}</small>
                      </span>
                    </label>
                  ))}
                </div>
                {status === "draft" && (
                  <p className="muted">
                    Dieser Trade ist ein Entwurf. Du kannst ihn direkt speichern
                    oder oben einen Status wählen.
                  </p>
                )}
              </fieldset>
              <fieldset
                className="trade-capture-fields"
                disabled={mutation.isPending}
              >
                <div className="form-grid cols-3">
                  <CaptureField
                    label="Instrument"
                    error={form.formState.errors.instrument?.message}
                  >
                    <input
                      className="input"
                      placeholder="z. B. EURUSD"
                      {...form.register("instrument")}
                      autoFocus
                      autoComplete="off"
                    />
                  </CaptureField>
                  <CaptureField label="Assetklasse">
                    <select className="select" {...form.register("assetClass")}>
                      <option value="forex">Forex</option>
                      <option value="futures">Futures</option>
                      <option value="metals">Edelmetalle</option>
                      <option value="crypto">Krypto</option>
                      <option value="indices">Indizes</option>
                      <option value="stocks">Aktien</option>
                    </select>
                  </CaptureField>
                  <CaptureField label="Richtung">
                    <select className="select" {...form.register("direction")}>
                      <option value="long">Long / Kauf</option>
                      <option value="short">Short / Verkauf</option>
                    </select>
                  </CaptureField>
                </div>
                <div className="form-grid">
                  {status === "closed" ? (
                    <CaptureField
                      label="Ausstieg"
                      error={form.formState.errors.closedAt?.message}
                    >
                      <input
                        className="input"
                        type="datetime-local"
                        {...form.register("closedAt")}
                      />
                    </CaptureField>
                  ) : (
                    <CaptureField
                      label={
                        status === "open" ? "Einstieg" : "Einstieg (optional)"
                      }
                      error={form.formState.errors.openedAt?.message}
                    >
                      <input
                        className="input"
                        type="datetime-local"
                        {...form.register("openedAt")}
                      />
                    </CaptureField>
                  )}
                  {status === "closed"
                    ? numericField(
                        values.pnlMode === "net" ? "netPnl" : "grossPnl",
                        (values.pnlMode === "net"
                          ? "Gewinn / Verlust"
                          : "Brutto-P&L") +
                          " (" +
                          currency +
                          ")",
                        "z. B. 125,50 oder -50,00",
                      )
                    : numericField(
                        "actualEntry",
                        status === "planned"
                          ? "Geplanter Entry-Preis (optional)"
                          : "Entry-Preis",
                        "Optional",
                      )}
                </div>
                {status === "closed" && (
                  <div className="trade-capture-result-help">
                    <span>
                      Gewinn positiv, Verlust mit Minus. Leer bleibt unbekannt.
                    </span>
                    <label>
                      <span className="sr-only">Ergebnisart</span>
                      <select className="select" {...form.register("pnlMode")}>
                        <option value="net">
                          Netto · Kosten bereits enthalten
                        </option>
                        <option value="gross">
                          Brutto · Kosten separat erfassen
                        </option>
                      </select>
                    </label>
                  </div>
                )}
              </fieldset>

              <div className="trade-capture-extras-label">
                Bei Bedarf ergänzen
              </div>
              <CaptureExtra
                title="Screenshot hinzufügen"
                hint={
                  screenshot
                    ? screenshot.filename
                    : "Bild auswählen oder aus der Zwischenablage einfügen"
                }
                icon={<ImagePlus size={16} />}
                open={screenshotOpen}
                onChange={setScreenshotOpen}
              >
                <TradeScreenshotImport
                  accountCurrency={currency}
                  disabled={mutation.isPending}
                  onImageChange={(image) => {
                    setScreenshot(image);
                    setImageMissing(false);
                  }}
                  onBusyChange={setScreenshotBusy}
                  onApply={(patch, review) => {
                    setAutomaticSizing(false);
                    setScreenshotReview(review);
                    setExecutionOpen(true);
                    setCalculatorOpen(true);
                    if (patch.plannedRisk && !patch.riskPercent)
                      form.setValue("riskPercent", "");
                    for (const [key, value] of Object.entries(patch))
                      form.setValue(key as keyof CaptureValues, value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    if (patch.status)
                      setStatus(patch.status as CaptureValues["status"]);
                    if (review.assetClass && patch.instrument)
                      form.setValue("assetClass", review.assetClass);
                  }}
                />
              </CaptureExtra>
              {imageMissing && (
                <p className="trade-capture-notice">
                  Die Eingaben wurden wiederhergestellt. Bitte den Screenshot
                  erneut hinzufügen, wenn du ihn am Trade speichern möchtest.
                </p>
              )}
              <CaptureExtra
                title="Kurse, Risiko & Kosten"
                hint="Entry, Stop, Ziel und Positionsgröße"
                icon={<SlidersHorizontal size={16} />}
                open={executionOpen}
                onChange={setExecutionOpen}
              >
                <fieldset
                  className="trade-capture-fields"
                  disabled={mutation.isPending}
                >
                  <div className="form-grid cols-3">
                    {status === "closed" &&
                      numericField("actualEntry", "Entry-Preis")}
                    {numericField("initialStopLoss", "Initialer Stop")}
                    {numericField("takeProfit", "Take Profit")}
                    {status === "closed" &&
                      numericField("actualExit", "Exit-Preis")}
                    {numericField("quantity", "Positionsgröße")}
                    {numericField(
                      "plannedRisk",
                      "Geplantes Risiko (" + currency + ")",
                      "Optional, für die R-Berechnung",
                    )}
                    {status === "closed" && (
                      <CaptureField
                        label="Einstieg (optional)"
                        error={form.formState.errors.openedAt?.message}
                      >
                        <input
                          className="input"
                          type="datetime-local"
                          {...form.register("openedAt")}
                        />
                      </CaptureField>
                    )}
                  </div>
                  {status === "closed" && values.pnlMode === "gross" && (
                    <div className="form-grid cols-3">
                      {numericField("fees", "Gebühren (" + currency + ")")}
                      {numericField(
                        "commission",
                        "Kommission (" + currency + ")",
                      )}
                      {numericField(
                        "swap",
                        "Swap-Kosten (" + currency + ")",
                        "Gutschrift mit Minus",
                      )}
                    </div>
                  )}
                  {!calculatorOpen ? (
                    <Button
                      type="button"
                      onClick={() => {
                        setCalculatorOpen(true);
                        setAutomaticSizing(true);
                      }}
                    >
                      <Calculator size={14} /> Positionsgröße berechnen
                    </Button>
                  ) : (
                    <PositionSizeCalculator
                      account={account}
                      instrument={values.instrument}
                      assetClass={values.assetClass}
                      entryPrice={values.actualEntry}
                      stopPrice={values.initialStopLoss}
                      riskPercent={values.riskPercent}
                      riskAmount={values.plannedRisk}
                      onRiskPercentChange={setRiskPercent}
                      onRiskAmountChange={setPlannedRisk}
                      onQuantityChange={setQuantity}
                      autoApply={automaticSizing}
                      onEnableAutomatic={() => setAutomaticSizing(true)}
                    />
                  )}
                </fieldset>
              </CaptureExtra>
              <CaptureExtra
                title="Setup & Notizen"
                hint="Strategie festhalten und den Trade später nachvollziehen"
                icon={<FileText size={16} />}
                open={notesOpen}
                onChange={setNotesOpen}
              >
                <fieldset
                  className="trade-capture-fields"
                  disabled={mutation.isPending}
                >
                  <div className="form-grid cols-3">
                    <CaptureField label="Setup">
                      <select className="select" {...form.register("setupId")}>
                        <option value="">Ohne Setup</option>
                        {bootstrap.data?.setups.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </CaptureField>
                    <CaptureField label="Session">
                      <select className="select" {...form.register("session")}>
                        <option value="">Nicht gewählt</option>
                        {[
                          "Asia",
                          "London",
                          "New York",
                          "Overlap",
                          "Außerhalb",
                        ].map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </CaptureField>
                    <CaptureField label="Timeframe">
                      <select
                        className="select"
                        {...form.register("timeframe")}
                      >
                        <option value="">Nicht gewählt</option>
                        {["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"].map(
                          (item) => (
                            <option key={item}>{item}</option>
                          ),
                        )}
                      </select>
                    </CaptureField>
                  </div>
                  <div className="form-grid">
                    <CaptureField label="Trade-Idee / Notiz">
                      <textarea
                        className="textarea"
                        rows={3}
                        placeholder="Warum dieser Trade?"
                        {...form.register("thesisHtml")}
                      />
                    </CaptureField>
                    <CaptureField label="Review-Notiz">
                      <textarea
                        className="textarea"
                        rows={3}
                        placeholder="Was möchtest du beim nächsten Mal beachten?"
                        {...form.register("reviewNotesHtml")}
                      />
                    </CaptureField>
                  </div>
                </fieldset>
              </CaptureExtra>
            </div>
            <footer className="dialog-footer">
              <div className="trade-capture-summary">
                {status === "closed" && net != null ? (
                  <>
                    <span>Netto-Ergebnis</span>
                    <strong
                      className={
                        net > 0
                          ? "positive-text"
                          : net < 0
                            ? "negative-text"
                            : ""
                      }
                    >
                      {formatAmount(net)}
                      {risk != null && risk > 0
                        ? " · " + formatR(net / risk)
                        : ""}
                    </strong>
                  </>
                ) : (
                  <span>
                    {status === "open"
                      ? "Abschluss und Ergebnis später ergänzen."
                      : "Du kannst den Trade jederzeit ergänzen."}
                  </span>
                )}
              </div>
              <div className="page-actions">
                <Button
                  type="button"
                  disabled={mutation.isPending || screenshotBusy}
                  onClick={() => {
                    form.setValue("status", "draft", { shouldDirty: true });
                    void submit();
                  }}
                >
                  Als Entwurf
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={mutation.isPending || screenshotBusy}
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

function CaptureField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label-row">
        <span>{label}</span>
        {error && (
          <span className="field-error" role="alert">
            {error}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function CaptureExtra({
  title,
  hint,
  icon,
  open,
  onChange,
  children,
}: {
  title: string;
  hint: string;
  icon: ReactNode;
  open: boolean;
  onChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={"trade-capture-extra" + (open ? " expanded" : "")}>
      <button
        type="button"
        className="trade-capture-extra-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onChange(!open)}
      >
        {icon}
        <span>
          <strong>{title}</strong>
          <small>{hint}</small>
        </span>
        <ChevronDown size={16} />
      </button>
      <div id={id} hidden={!open} className="trade-capture-extra-body">
        {children}
      </div>
    </section>
  );
}
