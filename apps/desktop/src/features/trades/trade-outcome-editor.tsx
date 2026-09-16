import { Check } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { fromInputDateTime, toInputDateTime } from "../../lib/utils";
import type { TradeDetail } from "../../types/domain";
import { parseAccountAmount } from "../accounts/account-input";

export function TradeOutcomeEditor({
  trade,
  currency,
  onChange,
  onValidityChange,
  onSave,
  pending,
}: {
  trade: TradeDetail;
  currency: string;
  onChange: (next: TradeDetail) => void;
  onValidityChange: (valid: boolean) => void;
  onSave: () => void;
  pending: boolean;
}) {
  const [amount, setAmount] = useState(() =>
    trade.netPnlMinor == null
      ? ""
      : (trade.netPnlMinor / 100).toFixed(2).replace(".", ","),
  );
  const [error, setError] = useState("");
  const closed = trade.status === "closed";
  const validDate =
    !closed ||
    Boolean(
      trade.closedAt &&
      (!trade.openedAt || new Date(trade.closedAt) >= new Date(trade.openedAt)),
    );
  return (
    <section className="trade-close-panel" aria-label="Trade-Abschluss">
      <div className="trade-close-panel-heading">
        <div>
          <strong>
            {closed
              ? "Abschluss & Ergebnis"
              : trade.status === "open"
                ? "Dieser Trade läuft noch"
                : "Trade weiterführen"}
          </strong>
          <p>
            {closed
              ? "Trage den endgültigen Gewinn oder Verlust nach allen Kosten ein."
              : "Ergänze den Abschluss, sobald du die Position beendet hast."}
          </p>
        </div>
        {!closed && (
          <Button
            disabled={pending}
            onClick={() =>
              onChange({
                ...trade,
                status: "closed",
                closedAt: trade.closedAt || new Date().toISOString(),
              })
            }
          >
            <Check size={14} /> Trade abschließen
          </Button>
        )}
      </div>
      {closed && (
        <>
          <div className="form-grid cols-3">
            <label className="field">
              Ausstieg
              <input
                className="input"
                type="datetime-local"
                value={toInputDateTime(trade.closedAt)}
                onChange={(e) =>
                  onChange({
                    ...trade,
                    closedAt: fromInputDateTime(e.target.value) ?? null,
                  })
                }
              />
            </label>
            <label className="field">
              Gewinn / Verlust ({currency})
              <input
                className="input"
                inputMode="decimal"
                value={amount}
                placeholder="z. B. 34,59 oder -25,00"
                aria-invalid={Boolean(error)}
                onChange={(e) => {
                  const value = e.target.value;
                  setAmount(value);
                  const minor = parseAccountAmount(value);
                  const valid = value.trim() === "" || minor != null;
                  setError(
                    valid
                      ? ""
                      : "Bitte einen Betrag mit höchstens zwei Nachkommastellen eingeben.",
                  );
                  onValidityChange(valid);
                  if (valid)
                    onChange({
                      ...trade,
                      netPnlMinor: minor,
                      grossPnlMinor: null,
                    });
                }}
              />
            </label>
            <label className="field">
              Exit-Preis (optional)
              <input
                className="input"
                inputMode="decimal"
                value={trade.actualExit ?? ""}
                onChange={(e) =>
                  onChange({ ...trade, actualExit: e.target.value || null })
                }
              />
            </label>
          </div>
          {(error || !validDate) && (
            <p role="alert" className="field-error">
              {error || "Bitte eine Ausstiegszeit nach dem Einstieg angeben."}
            </p>
          )}
          <div className="page-actions">
            <span className="muted">
              Netto · Kosten bereits enthalten · leer bleibt unbekannt
            </span>
            <Button
              variant="primary"
              disabled={pending || Boolean(error) || !validDate}
              onClick={onSave}
            >
              <Check size={14} /> Abschluss speichern
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
