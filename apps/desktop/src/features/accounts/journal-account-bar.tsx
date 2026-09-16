import { ArrowDownUp, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useJournalAccount } from "./journal-account-context";
import { JournalAccountSelector } from "./journal-account-selector";
import { accountMoney, useAccountJournal } from "./use-account-journal";
import "./journal-workspace.css";

export function JournalAccountBar() {
  const { status, selectedAccount } = useJournalAccount();
  const query = useAccountJournal(
    status === "ready" ? selectedAccount?.id : null,
  );
  const data =
    query.data?.accountId === selectedAccount?.id ? query.data : undefined;
  const currency = selectedAccount?.baseCurrency ?? "EUR";
  return (
    <section className="journal-account-bar" aria-label="Gesamtes Tradingkonto">
      <div className="journal-account-bar-selection">
        <Wallet size={18} />
        <JournalAccountSelector />
      </div>
      {selectedAccount ? (
        <>
          <div className="journal-account-number journal-account-profit">
            <span>Konto-P&L · Gesamt</span>
            <strong
              className={
                data && data.netPnlMinor > 0
                  ? "positive-text"
                  : data && data.netPnlMinor < 0
                    ? "negative-text"
                    : ""
              }
            >
              {accountMoney(data?.netPnlMinor, currency)}
            </strong>
            <small>
              {query.isError
                ? "Kontodaten konnten nicht geladen werden"
                : data?.missingPnlTrades
                  ? `${data.missingPnlTrades} abgeschlossene Trades ohne Ergebnis`
                  : "Alle abgeschlossenen Trades · nach Kosten"}
            </small>
          </div>
          <div className="journal-account-number">
            <span>Journal-Kontostand</span>
            <strong>{accountMoney(data?.journalBalanceMinor, currency)}</strong>
            <small>Startkapital + Geldbewegungen + P&L</small>
          </div>
          <div className="journal-account-funding">
            <span>
              Startkapital{" "}
              <strong>
                {accountMoney(data?.initialBalanceMinor, currency)}
              </strong>
            </span>
            <span>
              Ein-/Auszahlungen{" "}
              <strong>{accountMoney(data?.cashflowMinor, currency)}</strong>
            </span>
          </div>
          <Link className="button sm" to="/settings?section=accounts">
            <ArrowDownUp size={14} /> Kapital verwalten
          </Link>
        </>
      ) : (
        <p className="muted">
          Wähle dein Konto, um Kapital und das gesamte Trading-Ergebnis zu
          sehen.
        </p>
      )}
    </section>
  );
}
