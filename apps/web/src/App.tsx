import { useEffect, useState } from "react";
import type { PolicyRate, PolicyRatePayload, RateSignal } from "./types";

const signalLabel: Record<Exclude<RateSignal, null>, string> = {
  "-1": "Bearish",
  "0": "Neutral",
  "1": "Bullish"
};

function signalClass(signal: RateSignal): string {
  if (signal === 1) return "positive";
  if (signal === -1) return "negative";
  if (signal === 0) return "neutral";
  return "unavailable";
}

function formatRate(value: number | null): string {
  return value === null ? "—" : value.toFixed(2) + " %";
}

function formatBps(value: number | null): string {
  if (value === null) return "—";
  return (value > 0 ? "+" : "") + value.toFixed(0) + " bp";
}

function signalText(signal: RateSignal): string {
  return signal === null ? "Nicht verfügbar" : signalLabel[signal];
}

function RateRow({ rate }: { rate: PolicyRate }) {
  return (
    <tr>
      <th scope="row">{rate.currency_code}</th>
      <td>{formatRate(rate.current_target_rate)}</td>
      <td>{formatRate(rate.expected_target_rate)}</td>
      <td>{formatBps(rate.expected_delta_bps)}</td>
      <td>
        <span className={"signal " + signalClass(rate.expected_stance)}>
          {signalText(rate.expected_stance)}
        </span>
      </td>
      <td>
        <span className="status">{rate.availability_status}</span>
      </td>
    </tr>
  );
}

export default function App() {
  const [payload, setPayload] = useState<PolicyRatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/policy-rates/demo")
      .then(async (response) => {
        if (!response.ok) throw new Error("API nicht erreichbar");
        return response.json() as Promise<PolicyRatePayload>;
      })
      .then(setPayload)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Unbekannter API-Fehler");
      });
  }, []);

  const usd = payload?.usd_relative;

  return (
    <main>
      <header className="page-header">
        <p className="eyebrow">Personal Macro · Phase 1</p>
        <h1>Leitzins- und Erwartungsübersicht</h1>
        <p className="subtitle">
          Aktueller Zielzins, nächste Erwartung und relative USD-Stance werden
          getrennt und nachvollziehbar dargestellt.
        </p>
      </header>

      {error ? (
        <section className="card error">
          <h2>Lokale API nicht erreichbar</h2>
          <p>{error}. Starte die API auf Port 8000 und lade die Seite erneut.</p>
        </section>
      ) : null}

      {payload?.is_demo ? (
        <section className="notice" aria-label="Datenstatus">
          <strong>Demo-Modus:</strong> Die gezeigten Werte sind synthetische
          Testdaten. Es werden keine Live-Forecasts behauptet.
        </section>
      ) : null}

      <section className="grid">
        <article className="card usd-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">USD-Relativwirkung</p>
              <h2>Fed gegen Auslandskorb</h2>
            </div>
            <span className={"signal large " + signalClass(usd?.relative_signal ?? null)}>
              {signalText(usd?.relative_signal ?? null)}
            </span>
          </div>
          <dl className="metric-list">
            <div>
              <dt>Auslandskorb</dt>
              <dd>{formatBps(usd?.foreign_pressure_bps ?? null)}</dd>
            </div>
            <div>
              <dt>USD relativ</dt>
              <dd>{formatBps(usd?.relative_stance_bps ?? null)}</dd>
            </div>
            <div>
              <dt>Abdeckung</dt>
              <dd>{usd ? usd.covered_central_banks + " / " + usd.required_central_banks : "—"}</dd>
            </div>
          </dl>
          <p className="muted">
            Hikes {usd?.hike_count ?? "—"} · Holds {usd?.hold_count ?? "—"} ·
            Cuts {usd?.cut_count ?? "—"}
          </p>
        </article>

        <article className="card">
          <p className="eyebrow">Berechnungsregel</p>
          <h2>Was der Wert bedeutet</h2>
          <p>
            Der USD wird nicht isoliert bewertet. Erwartete Fed-Änderung minus
            erwarteter Durchschnitt des abgedeckten Auslandskorbs ergibt die
            relative Stance.
          </p>
          <p className="muted">
            Ein Fed-Hike von +25 bp bei +25 bp im Auslandskorb ergibt 0:
            restriktiv, aber nicht relativ restriktiver.
          </p>
        </article>
      </section>

      <section className="card table-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Eigene Heatmap-Domäne</p>
            <h2>Erwartete Leitzinsentscheidung</h2>
          </div>
          <span className="status">Actual / Forecast / Quality</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Währung</th>
                <th scope="col">Aktueller Zins</th>
                <th scope="col">Erwarteter Zins</th>
                <th scope="col">Erwartete Änderung</th>
                <th scope="col">Stance</th>
                <th scope="col">Datenstatus</th>
              </tr>
            </thead>
            <tbody>{payload?.rates.map((rate) => <RateRow key={rate.currency_code} rate={rate} />)}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
