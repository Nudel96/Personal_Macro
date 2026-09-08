import { openUrl } from "@tauri-apps/plugin-opener";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleCheck,
  CircleOff,
  ExternalLink,
  Link2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import type {
  BrokerConnection,
  BrokerPlatform,
  CTraderCandidateResponse,
  Mt5AccountSnapshot,
} from "../../types/domain";

interface AccountConnectionPanelProps {
  onAccountCreated: (accountId: string) => void;
}

export function AccountConnectionPanel({
  onAccountCreated,
}: AccountConnectionPanelProps) {
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState<BrokerPlatform>("mt5");
  const connections = useQuery({
    queryKey: ["broker-connections"],
    queryFn: api.brokerConnections,
  });

  async function completed(accountId: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      queryClient.invalidateQueries({ queryKey: ["broker-connections"] }),
    ]);
    onAccountCreated(accountId);
  }

  return (
    <div className="broker-connect-panel">
      <div className="broker-connect-heading">
        <div>
          <strong>Bestehendes Broker-Konto verbinden</strong>
          <span>
            Read-only: Kontodaten werden gelesen, Orderfunktionen sind nicht
            Bestandteil der Verbindung.
          </span>
        </div>
        <ShieldCheck size={18} />
      </div>
      <div className="segmented broker-platform-tabs" aria-label="Plattform">
        <button
          type="button"
          className={platform === "mt5" ? "active" : ""}
          onClick={() => setPlatform("mt5")}
        >
          MetaTrader 5
        </button>
        <button
          type="button"
          className={platform === "ctrader" ? "active" : ""}
          onClick={() => setPlatform("ctrader")}
        >
          cTrader
        </button>
      </div>
      {platform === "mt5" ? (
        <Mt5Connector onCompleted={completed} />
      ) : (
        <CTraderConnector onCompleted={completed} />
      )}
      <ConnectionList connections={connections.data ?? []} />
    </div>
  );
}

function Mt5Connector({
  onCompleted,
}: {
  onCompleted: (accountId: string) => Promise<void>;
}) {
  const [terminalPath, setTerminalPath] = useState("");
  const [preview, setPreview] = useState<Mt5AccountSnapshot | null>(null);
  const [name, setName] = useState("");
  const [risk, setRisk] = useState("1");
  const detect = useMutation({
    mutationFn: () => api.detectMt5Account(terminalPath.trim() || undefined),
    onSuccess: (snapshot) => {
      setPreview(snapshot);
      setName(
        [snapshot.company || "MT5", "MT5", snapshot.login].join(" ").trim(),
      );
      toast.success("Aktives MT5-Konto erkannt.");
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "MT5-Konto konnte nicht erkannt werden."),
  });
  const create = useMutation({
    mutationFn: () =>
      api.createAccountFromMt5({
        terminalPath: terminalPath.trim() || undefined,
        name: name.trim() || undefined,
        defaultRiskPercent: parseNumber(risk, 1),
      }),
    onSuccess: async (result) => {
      await onCompleted(result.accountId);
      setPreview(null);
      setName("");
      toast.success("MT5-Konto verbunden und als Journal-Konto angelegt.");
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "MT5-Konto konnte nicht verbunden werden."),
  });

  return (
    <div className="broker-connect-flow">
      <div className="notice">
        Öffne das IC-Markets-MT5-Terminal und melde dich beim gewünschten Konto
        an. Personal Macro liest die aktive Login-/Server-Kennung; dein Passwort
        wird weder abgefragt noch gespeichert.
      </div>
      <div className="field">
        <label>Terminal-Pfad (optional)</label>
        <input
          className="input"
          value={terminalPath}
          onChange={(event) => setTerminalPath(event.target.value)}
          placeholder="Leer lassen für das automatisch erkannte MT5-Terminal"
        />
      </div>
      <Button
        type="button"
        disabled={!isTauri() || detect.isPending}
        onClick={() => detect.mutate()}
      >
        {detect.isPending ? (
          <LoaderCircle className="spin" size={14} />
        ) : (
          <RefreshCw size={14} />
        )}
        Aktives Konto erkennen
      </Button>
      {preview && (
        <div className="broker-preview">
          <div>
            <Badge className="positive">Erkannt</Badge>
            <strong>{preview.company || "MetaTrader 5"}</strong>
            <span>
              Login {preview.login} · {preview.server} · {preview.currency}
            </span>
          </div>
          <div className="broker-preview-money">
            <span>Balance</span>
            <strong>
              {formatDecimalMoney(preview.balance, preview.currency)}
            </strong>
            <small>
              Equity {formatDecimalMoney(preview.equity, preview.currency)}
            </small>
          </div>
        </div>
      )}
      {preview && (
        <ConnectedAccountFields
          name={name}
          setName={setName}
          risk={risk}
          setRisk={setRisk}
        />
      )}
      {preview && (
        <Button
          variant="primary"
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          <Link2 size={14} /> MT5-Konto verbinden
        </Button>
      )}
    </div>
  );
}

function CTraderConnector({
  onCompleted,
}: {
  onCompleted: (accountId: string) => Promise<void>;
}) {
  const authorization = useQuery({
    queryKey: ["ctrader-authorization"],
    queryFn: api.cTraderAuthorization,
  });
  const [code, setCode] = useState("");
  const [candidateResponse, setCandidateResponse] =
    useState<CTraderCandidateResponse | null>(null);
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [risk, setRisk] = useState("1");
  const exchange = useMutation({
    mutationFn: () => api.exchangeCTraderCode(code),
    onSuccess: (response) => {
      setCandidateResponse(response);
      const first = response.accounts[0];
      setAccountId(first?.externalAccountId ?? "");
      setName(
        first
          ? [
              first.brokerName || "cTrader",
              "cTrader",
              first.accountLogin || first.externalAccountId,
            ].join(" ")
          : "",
      );
      toast.success("Freigegebene cTrader-Konten geladen.");
    },
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ??
          "cTrader-Autorisierung konnte nicht abgeschlossen werden.",
      ),
  });
  const create = useMutation({
    mutationFn: () =>
      api.createAccountFromCTrader({
        sessionId: candidateResponse!.sessionId,
        externalAccountId: accountId,
        name: name.trim() || undefined,
        defaultRiskPercent: parseNumber(risk, 1),
      }),
    onSuccess: async (result) => {
      await onCompleted(result.accountId);
      setCandidateResponse(null);
      setCode("");
      setName("");
      toast.success("cTrader-Konto verbunden und als Journal-Konto angelegt.");
    },
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "cTrader-Konto konnte nicht verbunden werden.",
      ),
  });
  const selected = candidateResponse?.accounts.find(
    (candidate) => candidate.externalAccountId === accountId,
  );

  if (authorization.isLoading) {
    return <span className="muted">cTrader-Verbindung wird vorbereitet …</span>;
  }
  if (!authorization.data?.configured) {
    return (
      <div className="notice">
        {authorization.data?.message ??
          "cTrader Open API ist noch nicht konfiguriert."}{" "}
        Dafür ist einmalig eine freigegebene cTrader-Open-API-App erforderlich.
      </div>
    );
  }

  return (
    <div className="broker-connect-flow">
      <div className="notice">
        Die Anmeldung erfolgt bei cTrader. Personal Macro fordert ausschließlich
        den Scope „accounts“ an; Handeln ist mit dieser Freigabe nicht möglich.
      </div>
      <Button
        type="button"
        onClick={() =>
          authorization.data?.authorizationUrl &&
          void openUrl(authorization.data.authorizationUrl)
        }
      >
        <ExternalLink size={14} /> Bei cTrader anmelden
      </Button>
      <div className="field">
        <label htmlFor="ctrader-authorization-code">
          Autorisierungscode oder Weiterleitungsadresse
        </label>
        <input
          id="ctrader-authorization-code"
          className="input"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Nach der Freigabe hier einfügen"
        />
        <small className="muted">
          Der Code ist nur kurz gültig. Die Weiterleitungsadresse muss mit{" "}
          {authorization.data.redirectUri} beginnen.
        </small>
      </div>
      <Button
        type="button"
        disabled={!code.trim() || exchange.isPending}
        onClick={() => exchange.mutate()}
      >
        {exchange.isPending ? (
          <LoaderCircle className="spin" size={14} />
        ) : (
          <RefreshCw size={14} />
        )}
        Freigegebene Konten laden
      </Button>
      {candidateResponse && (
        <div className="field">
          <label>cTrader-Konto</label>
          <select
            className="select"
            value={accountId}
            onChange={(event) => {
              const nextId = event.target.value;
              const next = candidateResponse.accounts.find(
                (candidate) => candidate.externalAccountId === nextId,
              );
              setAccountId(nextId);
              if (next) {
                setName(
                  [
                    next.brokerName || "cTrader",
                    "cTrader",
                    next.accountLogin || next.externalAccountId,
                  ].join(" "),
                );
              }
            }}
          >
            {candidateResponse.accounts.map((candidate) => (
              <option
                key={[candidate.environment, candidate.externalAccountId].join(
                  ":",
                )}
                value={candidate.externalAccountId}
              >
                {candidate.brokerName || "cTrader"} ·{" "}
                {candidate.accountLogin || candidate.externalAccountId} ·{" "}
                {candidate.environment === "live" ? "Live" : "Demo"}
              </option>
            ))}
          </select>
        </div>
      )}
      {selected && (
        <ConnectedAccountFields
          name={name}
          setName={setName}
          risk={risk}
          setRisk={setRisk}
        />
      )}
      {selected && (
        <Button
          variant="primary"
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          <Link2 size={14} /> cTrader-Konto verbinden
        </Button>
      )}
    </div>
  );
}

function ConnectedAccountFields({
  name,
  setName,
  risk,
  setRisk,
}: {
  name: string;
  setName: (value: string) => void;
  risk: string;
  setRisk: (value: string) => void;
}) {
  return (
    <div className="form-grid cols-3 broker-account-fields">
      <div className="field" style={{ gridColumn: "span 2" }}>
        <label>Kontoname in Personal Macro</label>
        <input
          className="input"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="field">
        <label>Standardrisiko (%)</label>
        <input
          className="input"
          inputMode="decimal"
          value={risk}
          onChange={(event) => setRisk(event.target.value)}
        />
      </div>
    </div>
  );
}

function ConnectionList({ connections }: { connections: BrokerConnection[] }) {
  const queryClient = useQueryClient();
  const refresh = useMutation({
    mutationFn: api.refreshBrokerConnection,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["broker-connections"] }),
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      ]);
      toast.success("Broker-Kontodaten aktualisiert.");
    },
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "Verbindung konnte nicht aktualisiert werden.",
      ),
  });
  const disconnect = useMutation({
    mutationFn: api.disconnectBrokerConnection,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["broker-connections"],
      });
      toast.success(
        "Broker-Verbindung getrennt. Das Journal-Konto bleibt erhalten.",
      );
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Verbindung konnte nicht getrennt werden."),
  });

  if (!connections.length) return null;
  return (
    <div className="broker-connections-list">
      <h4>Verbundene Konten</h4>
      {connections.map((connection) => (
        <div className="broker-connection-row" key={connection.id}>
          <div className="broker-connection-status">
            {connection.status === "connected" ? (
              <CircleCheck className="positive-text" size={16} />
            ) : (
              <CircleOff className="negative-text" size={16} />
            )}
            <div>
              <strong>{connection.localAccountName}</strong>
              <span>
                {connection.platform === "mt5" ? "MetaTrader 5" : "cTrader"} ·{" "}
                {connection.brokerName || "Broker"} ·{" "}
                {connection.accountLogin || connection.externalAccountId}
              </span>
              {connection.statusMessage && (
                <small>{connection.statusMessage}</small>
              )}
            </div>
          </div>
          <div className="broker-connection-balance">
            <span>Broker-Balance</span>
            <strong>
              {connection.balanceMinor == null
                ? "—"
                : formatMinorCurrency(
                    connection.balanceMinor,
                    connection.baseCurrency,
                  )}
            </strong>
          </div>
          <div className="broker-connection-actions">
            <Button
              size="sm"
              disabled={
                refresh.isPending || connection.status === "disconnected"
              }
              onClick={() => refresh.mutate(connection.id)}
            >
              <RefreshCw size={12} /> Aktualisieren
            </Button>
            {connection.status !== "disconnected" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={disconnect.isPending}
                onClick={() => disconnect.mutate(connection.id)}
              >
                Trennen
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function parseNumber(value: string, fallback: number) {
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function formatDecimalMoney(
  value: number | null | undefined,
  currency: string,
) {
  if (value == null) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(value);
}

function formatMinorCurrency(
  value: number,
  currency: string | null | undefined,
) {
  if (!currency) return new Intl.NumberFormat("de-DE").format(value / 100);
  return formatDecimalMoney(value / 100, currency);
}
