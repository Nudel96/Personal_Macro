import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Pencil,
  Plus,
  Save,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { dateTime, fromInputDateTime, toInputDateTime } from "../../lib/utils";
import { api } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import { useUiStore } from "../../stores/ui-store";
import type {
  Account,
  AccountCashflow,
  AccountInput,
} from "../../types/domain";
import { AccountConnectionPanel } from "./account-connection-panel";
import { MyfxbookConnectionPanel } from "./myfxbook-connection-panel";
import { accountMoney, useAccountJournal } from "./use-account-journal";
import "./journal-workspace.css";
import { parseAccountAmount } from "./account-input";

const emptyAccount = {
  name: "",
  broker: "",
  currency: "EUR",
  initial: "",
  risk: "1",
};

export function AccountSettings({ accounts }: { accounts: Account[] }) {
  const privateWeb = isPrivateWeb();
  const queryClient = useQueryClient();
  const { selectedJournalAccountId, setSelectedJournalAccountId } =
    useUiStore();
  const activeAccounts = accounts.filter((account) => !account.isArchived);
  const selected =
    activeAccounts.find((account) => account.id === selectedJournalAccountId) ??
    activeAccounts[0];
  const journal = useAccountJournal(selected?.id);
  const [form, setForm] = useState(emptyAccount);
  const [mode, setMode] = useState<"none" | "create" | "edit" | "connected">(
    activeAccounts.length ? "none" : "create",
  );
  const [editingId, setEditingId] = useState<string>();
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"deposit" | "withdrawal" | "adjustment">(
    "deposit",
  );
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(() =>
    toInputDateTime(new Date().toISOString()),
  );
  const [note, setNote] = useState("");
  const [fundingError, setFundingError] = useState("");
  const cashflows = useQuery({
    queryKey: ["account-cashflows", selected?.id],
    queryFn: () => api.accountCashflows(selected!.id),
    enabled: Boolean(selected),
  });
  const money = (value: number | null | undefined) =>
    accountMoney(value, selected?.baseCurrency ?? "EUR");
  const parsedAmount = parseAccountAmount(amount);
  const signedAmount =
    parsedAmount == null
      ? null
      : kind === "withdrawal"
        ? -parsedAmount
        : parsedAmount;

  useEffect(() => {
    setAmount("");
    setNote("");
    setFundingError("");
    setError("");
    if (activeAccounts.length) setMode("none");
  }, [selected?.id, activeAccounts.length]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["account-cashflows"] }),
    ]);
  const save = useMutation({
    mutationFn: (input: AccountInput) => api.saveAccount(input),
    onSuccess: async (account) => {
      await refresh();
      setSelectedJournalAccountId(account.id);
      setMode("none");
      setForm(emptyAccount);
      toast.success(
        editingId
          ? "Kontodaten und Startkapital aktualisiert."
          : "Konto mit Startkapital angelegt.",
      );
    },
    onError: (cause: { message?: string }) =>
      setError(cause.message ?? "Das Konto konnte nicht gespeichert werden."),
  });
  const funding = useMutation({
    mutationFn: (input: Omit<AccountCashflow, "id" | "createdAt">) =>
      api.addAccountCashflow(input),
    onSuccess: async () => {
      await refresh();
      setAmount("");
      setNote("");
      setOccurredAt(toInputDateTime(new Date().toISOString()));
      toast.success("Kapitalbuchung gespeichert.");
    },
    onError: (cause: { message?: string }) =>
      setFundingError(
        cause.message ?? "Die Buchung konnte nicht gespeichert werden.",
      ),
  });
  const archive = useMutation({
    mutationFn: api.archiveAccount,
    onSuccess: async (_, id) => {
      if (selectedJournalAccountId === id) setSelectedJournalAccountId(null);
      await refresh();
      toast.success("Konto archiviert.");
    },
    onError: (cause: { message?: string }) =>
      toast.error(cause.message ?? "Archivieren fehlgeschlagen."),
  });

  const edit = (account: Account) => {
    setEditingId(account.id);
    setForm({
      name: account.name,
      broker: account.broker ?? "",
      currency: account.baseCurrency,
      initial: (account.initialBalanceMinor / 100).toFixed(2).replace(".", ","),
      risk: String(account.defaultRiskPercent).replace(".", ","),
    });
    setError("");
    setMode("edit");
  };
  const submitAccount = (event: React.FormEvent) => {
    event.preventDefault();
    const initial = parseAccountAmount(form.initial);
    const risk = Number(form.risk.replace(",", "."));
    if (
      !form.name.trim() ||
      !/^[A-Za-z]{3}$/.test(form.currency) ||
      initial == null ||
      initial < 0
    ) {
      setError(
        "Bitte Kontoname, dreistellige Währung und Startkapital eingeben. Wenn du ohne Kapital beginnst, trage ausdrücklich 0 ein.",
      );
      return;
    }
    if (!Number.isFinite(risk) || risk <= 0 || risk > 25) {
      setError(
        "Das Standardrisiko muss größer als 0 und höchstens 25 Prozent sein.",
      );
      return;
    }
    setError("");
    save.mutate({
      id: mode === "edit" ? editingId : undefined,
      name: form.name.trim(),
      broker: form.broker || undefined,
      accountType:
        mode === "edit"
          ? (accounts.find((account) => account.id === editingId)
              ?.accountType ?? "personal")
          : "personal",
      baseCurrency: form.currency.toUpperCase(),
      initialBalanceMinor: initial,
      defaultRiskPercent: risk,
    });
  };
  const submitFunding = (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !selected ||
      signedAmount == null ||
      signedAmount === 0 ||
      (kind !== "adjustment" && (parsedAmount ?? 0) <= 0) ||
      !occurredAt ||
      !Number.isFinite(new Date(occurredAt).getTime())
    ) {
      setFundingError(
        "Bitte Datum und einen positiven Betrag mit höchstens zwei Nachkommastellen eingeben. Bei Korrekturen ist auch ein Minus möglich.",
      );
      return;
    }
    setFundingError("");
    funding.mutate({
      accountId: selected.id,
      kind,
      amountMinor: signedAmount,
      occurredAt: fromInputDateTime(occurredAt)!,
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="grid" style={{ gap: 18 }}>
      <Card>
        <CardHeader
          title="Deine Tradingkonten"
          subtitle="Startkapital, Geldbewegungen und Trading-Ergebnis bleiben getrennt."
          action={
            <Button
              onClick={() => {
                setEditingId(undefined);
                setForm(emptyAccount);
                setMode("create");
                setError("");
              }}
            >
              <Plus size={14} /> Neues Konto
            </Button>
          }
        />
        <CardContent>
          {privateWeb && (
            <p className="notice">
              MT5- und cTrader-Verbindungen sind hier nicht verfügbar. Du kannst
              Konten und Kapitalbuchungen manuell pflegen. Broker-Verbindungen
              verwaltest du in der Desktop-App.
            </p>
          )}
          <div className="account-settings-list">
            {activeAccounts.map((account) => (
              <button
                type="button"
                className="account-settings-choice"
                key={account.id}
                aria-pressed={selected?.id === account.id}
                onClick={() => setSelectedJournalAccountId(account.id)}
              >
                <strong>{account.name}</strong>
                <span>
                  {account.broker || "Manuelles Konto"} · {account.baseCurrency}
                </span>
                <span>
                  Startkapital{" "}
                  {accountMoney(
                    account.initialBalanceMinor,
                    account.baseCurrency,
                  )}
                </span>
              </button>
            ))}
          </div>
          {selected && (
            <>
              <div className="account-settings-summary">
                <div>
                  Startkapital
                  <strong>{money(journal.data?.initialBalanceMinor)}</strong>
                </div>
                <div>
                  Konto-P&L · Gesamt
                  <strong>{money(journal.data?.netPnlMinor)}</strong>
                </div>
                <div>
                  Journal-Kontostand
                  <strong>{money(journal.data?.journalBalanceMinor)}</strong>
                </div>
              </div>
              {journal.isError && (
                <p role="alert" className="field-error">
                  Die Kontoübersicht konnte nicht geladen werden.
                </p>
              )}
              {journal.data?.brokerBalanceMinor != null && (
                <p className="muted">
                  Letzter Broker-Kontostand:{" "}
                  {money(journal.data.brokerBalanceMinor)}. Der
                  Journal-Kontostand folgt deinem erfassten Startkapital, den
                  Buchungen und Trades.
                </p>
              )}
              <div className="page-actions">
                <Button onClick={() => edit(selected)}>
                  <Pencil size={13} /> Konto / Startkapital bearbeiten
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={activeAccounts.length <= 1 || archive.isPending}
                  onClick={() => archive.mutate(selected.id)}
                >
                  Konto archivieren
                </Button>
              </div>
            </>
          )}
          {mode !== "none" && (
            <div style={{ marginTop: 18 }}>
              <div className="page-actions">
                <strong>
                  {mode === "edit" ? "Kontodaten bearbeiten" : "Konto anlegen"}
                </strong>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Kontoeingabe schließen"
                  onClick={() => setMode("none")}
                >
                  <X size={14} />
                </Button>
              </div>
              {mode !== "edit" && !privateWeb && (
                <div className="segmented" style={{ marginTop: 12 }}>
                  <button
                    className={mode === "create" ? "active" : ""}
                    onClick={() => setMode("create")}
                  >
                    Manuell anlegen
                  </button>
                  <button
                    className={mode === "connected" ? "active" : ""}
                    onClick={() => setMode("connected")}
                  >
                    MT5 / cTrader verbinden
                  </button>
                </div>
              )}
              {mode === "connected" && !privateWeb ? (
                <AccountConnectionPanel
                  onAccountCreated={(id) => {
                    setSelectedJournalAccountId(id);
                    setMode("none");
                  }}
                />
              ) : (
                <form
                  className="account-settings-form"
                  onSubmit={submitAccount}
                  noValidate
                >
                  <p>
                    {mode === "edit"
                      ? "Startkapital ist das Kapital vor deinem ersten erfassten Trade. Eine Korrektur verschiebt den Kapitalverlauf, verändert aber keine Trade-Ergebnisse. Für spätere Ein- und Auszahlungen nutze die Buchung unten."
                      : "Trage das Kapital ein, mit dem du dein Journal beginnst. Es wird sofort im Konto und als erster Punkt der Kapitalentwicklung angezeigt."}
                  </p>
                  <div className="form-grid cols-3">
                    <label className="field">
                      Kontoname
                      <input
                        className="input"
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                        placeholder="z. B. Mein Tradingkonto"
                      />
                    </label>
                    <label className="field">
                      Broker / Firma
                      <input
                        className="input"
                        value={form.broker}
                        onChange={(e) =>
                          setForm({ ...form, broker: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      Basiswährung
                      <input
                        className="input"
                        maxLength={3}
                        disabled={mode === "edit"}
                        value={form.currency}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            currency: e.target.value.toUpperCase(),
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      Startkapital ({form.currency})
                      <input
                        className="input"
                        inputMode="decimal"
                        value={form.initial}
                        onChange={(e) =>
                          setForm({ ...form, initial: e.target.value })
                        }
                        placeholder="z. B. 1000,00"
                      />
                    </label>
                    <label className="field">
                      Standardrisiko (%)
                      <input
                        className="input"
                        inputMode="decimal"
                        value={form.risk}
                        onChange={(e) =>
                          setForm({ ...form, risk: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  {error && (
                    <p role="alert" className="field-error">
                      {error}
                    </p>
                  )}
                  <div className="page-actions">
                    <Button
                      variant="primary"
                      type="submit"
                      disabled={save.isPending}
                    >
                      <Save size={14} />{" "}
                      {mode === "edit"
                        ? "Kontodaten speichern"
                        : "Konto anlegen"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      {selected && (
        <Card>
          <CardHeader
            title="Kapital hinzufügen oder entnehmen"
            subtitle={`${selected.name} · ${selected.baseCurrency} · Geldbewegungen zählen nicht zum Trading-P&L.`}
          />
          <CardContent>
            <form
              className="account-settings-form"
              onSubmit={submitFunding}
              noValidate
            >
              <div className="segmented" aria-label="Kapitalbuchung">
                {(
                  [
                    ["deposit", "Einzahlen"],
                    ["withdrawal", "Auszahlen"],
                    ["adjustment", "Korrektur"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={kind === value ? "active" : ""}
                    aria-pressed={kind === value}
                    onClick={() => {
                      setKind(value);
                      setFundingError("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="form-grid cols-3">
                <label className="field">
                  Betrag ({selected.baseCurrency})
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="z. B. 250,00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label className="field">
                  Buchungsdatum
                  <input
                    className="input"
                    type="datetime-local"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                  />
                </label>
                <label className="field">
                  Notiz (optional)
                  <input
                    className="input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="z. B. Kapital aufgestockt"
                  />
                </label>
              </div>
              {signedAmount != null &&
                parsedAmount !== 0 &&
                (kind === "adjustment" || parsedAmount! > 0) &&
                journal.data && (
                  <div className="account-funding-preview">
                    Journal-Kontostand:{" "}
                    {money(journal.data.journalBalanceMinor)} →{" "}
                    <strong>
                      {money(journal.data.journalBalanceMinor + signedAmount)}
                    </strong>{" "}
                    · Konto-P&L bleibt {money(journal.data.netPnlMinor)}.
                  </div>
                )}
              {fundingError && (
                <p role="alert" className="field-error">
                  {fundingError}
                </p>
              )}
              <div className="page-actions">
                <Button
                  variant="primary"
                  type="submit"
                  disabled={funding.isPending}
                >
                  {kind === "withdrawal" ? (
                    <ArrowUpRight size={15} />
                  ) : (
                    <ArrowDownLeft size={15} />
                  )}
                  {kind === "deposit"
                    ? "Einzahlung buchen"
                    : kind === "withdrawal"
                      ? "Auszahlung buchen"
                      : "Korrektur buchen"}
                </Button>
              </div>
            </form>
            <div style={{ marginTop: 22 }}>
              <h3 className="form-section-title">Kapitalverlauf / Buchungen</h3>
              {cashflows.isError ? (
                <p role="alert">Buchungen konnten nicht geladen werden.</p>
              ) : (
                <table className="account-ledger">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Buchung</th>
                      <th>Notiz</th>
                      <th>Betrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Journalstart</td>
                      <td>Startkapital</td>
                      <td>Vor dem ersten Trade</td>
                      <td>{money(selected.initialBalanceMinor)}</td>
                    </tr>
                    {[...(cashflows.data ?? [])]
                      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
                      .map((row) => (
                        <tr key={row.id}>
                          <td>{dateTime(row.occurredAt)}</td>
                          <td>
                            {row.kind === "deposit"
                              ? "Einzahlung"
                              : row.kind === "withdrawal"
                                ? "Auszahlung"
                                : "Korrektur"}
                          </td>
                          <td>{row.note || "—"}</td>
                          <td>{money(row.amountMinor)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      {selected && (
        <MyfxbookConnectionPanel key={selected.id} account={selected} />
      )}
    </div>
  );
}
