import { Calculator, CircleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Account } from "../../types/domain";
import {
  calculatePositionSize,
  formatPositionQuantity,
  inferInstrumentSpec,
  parseTradeNumber,
} from "./position-sizing";

interface PositionSizeCalculatorProps {
  account?: Account;
  instrument: string;
  assetClass: string;
  entryPrice: string;
  stopPrice: string;
  riskPercent: string;
  riskAmount: string;
  onRiskPercentChange: (value: string) => void;
  onRiskAmountChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
}

export function PositionSizeCalculator({
  account,
  instrument,
  assetClass,
  entryPrice,
  stopPrice,
  riskPercent,
  riskAmount,
  onRiskPercentChange,
  onRiskAmountChange,
  onQuantityChange,
}: PositionSizeCalculatorProps) {
  const callbacks = useRef({
    onRiskPercentChange,
    onRiskAmountChange,
    onQuantityChange,
  });
  callbacks.current = {
    onRiskPercentChange,
    onRiskAmountChange,
    onQuantityChange,
  };
  const inferred = useMemo(
    () => inferInstrumentSpec(instrument, assetClass),
    [instrument, assetClass],
  );
  const [contractSize, setContractSize] = useState(
    String(inferred.contractSize),
  );
  const [tickSize, setTickSize] = useState(String(inferred.tickSize ?? ""));
  const [tickValue, setTickValue] = useState(String(inferred.tickValue ?? ""));
  const [quantityStep, setQuantityStep] = useState(
    String(inferred.quantityStep),
  );
  const [quotePerAccount, setQuotePerAccount] = useState("");

  useEffect(() => {
    setContractSize(String(inferred.contractSize));
    setTickSize(String(inferred.tickSize ?? ""));
    setTickValue(String(inferred.tickValue ?? ""));
    setQuantityStep(String(inferred.quantityStep));
  }, [inferred]);

  useEffect(() => {
    if (!account) {
      setQuotePerAccount("");
      return;
    }
    if (inferred.quoteCurrency === account.baseCurrency) {
      setQuotePerAccount("1");
      return;
    }
    if (
      inferred.baseCurrency === account.baseCurrency &&
      parseTradeNumber(entryPrice) > 0
    ) {
      setQuotePerAccount(String(parseTradeNumber(entryPrice)));
      return;
    }
    setQuotePerAccount("");
  }, [account, entryPrice, inferred.baseCurrency, inferred.quoteCurrency]);

  useEffect(() => {
    if (account && !riskPercent.trim()) {
      callbacks.current.onRiskPercentChange(
        String(account.defaultRiskPercent).replace(".", ","),
      );
    }
  }, [account, riskPercent]);

  const usesBrokerEquity = account?.brokerEquityMinor != null;
  const capital =
    (account?.brokerEquityMinor ?? account?.currentBalanceMinor ?? 0) / 100;
  const riskPercentNumber = parseTradeNumber(riskPercent);
  const automaticRisk =
    capital > 0 && riskPercentNumber > 0
      ? (capital * riskPercentNumber) / 100
      : 0;

  useEffect(() => {
    if (automaticRisk > 0) {
      callbacks.current.onRiskAmountChange(
        automaticRisk.toFixed(2).replace(".", ","),
      );
    }
  }, [automaticRisk]);

  const spec = {
    ...inferred,
    contractSize: parseTradeNumber(contractSize),
    tickSize: parseTradeNumber(tickSize) || undefined,
    tickValue: parseTradeNumber(tickValue) || undefined,
    quantityStep: parseTradeNumber(quantityStep),
    minimumQuantity: parseTradeNumber(quantityStep),
  };
  const result = calculatePositionSize({
    riskAmount: parseTradeNumber(riskAmount),
    entryPrice: parseTradeNumber(entryPrice),
    stopPrice: parseTradeNumber(stopPrice),
    quotePerAccountCurrency: parseTradeNumber(quotePerAccount),
    spec,
  });

  useEffect(() => {
    if (result?.quantity) {
      callbacks.current.onQuantityChange(
        formatPositionQuantity(result.quantity, spec.quantityStep),
      );
    }
  }, [result?.quantity, spec.quantityStep]);

  const conversionMissing = Boolean(
    account &&
    inferred.quoteCurrency !== account.baseCurrency &&
    !parseTradeNumber(quotePerAccount),
  );

  return (
    <div className="position-calculator">
      <div className="position-calculator-heading">
        <div>
          <span className="page-eyebrow">Automatische Positionsgröße</span>
          <strong>
            <Calculator size={15} /> {inferred.label}
          </strong>
        </div>
        <span className="muted">Broker-Spezifikation kontrollierbar</span>
      </div>
      <div className="form-grid cols-3">
        <CalculatorField
          label={`${usesBrokerEquity ? "MT5-Equity" : "Kapital"} (${account?.baseCurrency ?? "Konto"})`}
        >
          <input
            className="input"
            value={account ? capital.toFixed(2).replace(".", ",") : ""}
            placeholder="Konto auswählen"
            readOnly
          />
        </CalculatorField>
        <CalculatorField label="Risiko (%)">
          <input
            className="input"
            inputMode="decimal"
            value={riskPercent}
            onChange={(event) => onRiskPercentChange(event.target.value)}
          />
        </CalculatorField>
        <CalculatorField label={`Risiko (${account?.baseCurrency ?? "Konto"})`}>
          <input className="input" value={riskAmount} readOnly />
        </CalculatorField>
        <CalculatorField label={`Kontraktgröße (${inferred.quantityLabel})`}>
          <input
            className="input"
            inputMode="decimal"
            value={contractSize}
            onChange={(event) => setContractSize(event.target.value)}
            disabled={inferred.mode === "tick_value"}
          />
        </CalculatorField>
        {inferred.mode === "tick_value" ? (
          <>
            <CalculatorField label="Tickgröße">
              <input
                className="input"
                value={tickSize}
                onChange={(event) => setTickSize(event.target.value)}
              />
            </CalculatorField>
            <CalculatorField label={`Tickwert (${inferred.quoteCurrency})`}>
              <input
                className="input"
                value={tickValue}
                onChange={(event) => setTickValue(event.target.value)}
              />
            </CalculatorField>
          </>
        ) : (
          <CalculatorField label="Größenschritt">
            <input
              className="input"
              value={quantityStep}
              onChange={(event) => setQuantityStep(event.target.value)}
            />
          </CalculatorField>
        )}
        <CalculatorField
          label={`${inferred.quoteCurrency} je ${account?.baseCurrency ?? "Kontowährung"}`}
        >
          <input
            className="input"
            inputMode="decimal"
            value={quotePerAccount}
            onChange={(event) => setQuotePerAccount(event.target.value)}
            placeholder={
              conversionMissing ? "Umrechnungskurs erforderlich" : "1"
            }
          />
        </CalculatorField>
      </div>
      <div
        className={`position-calculator-result${result?.quantity ? " ready" : ""}`}
      >
        {result?.quantity ? (
          <>
            <strong>
              {formatPositionQuantity(result.quantity, spec.quantityStep)}{" "}
              {inferred.quantityLabel}
            </strong>
            <span>
              Effektives Risiko{" "}
              {result.effectiveRisk.toFixed(2).replace(".", ",")}{" "}
              {account?.baseCurrency} · Stop-Distanz{" "}
              {result.stopDistance.toLocaleString("de-DE", {
                maximumFractionDigits: 8,
              })}
            </span>
          </>
        ) : (
          <span>
            <CircleAlert size={14} /> Konto, Entry, Stop und gegebenenfalls
            Umrechnungskurs vervollständigen.
          </span>
        )}
      </div>
    </div>
  );
}

function CalculatorField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
