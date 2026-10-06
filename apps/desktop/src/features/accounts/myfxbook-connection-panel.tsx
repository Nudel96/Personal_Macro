import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { dateTime } from "../../lib/utils";
import { api, isTauri } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import { supportsPrivateWebCommand } from "../../services/private-web-client";
import type {
  Account,
  MyfxbookLogin,
  MyfxbookPreview,
} from "../../types/domain";
import { accountMoney } from "./use-account-journal";
import { refreshMyfxbookJournal } from "./myfxbook-events";
import "./myfxbook.css";

const statusLabels: Record<string, string> = {
  connected: "Automatisch verbunden",
  paused: "Pausiert",
  syncing: "Abgleich läuft",
  error: "Abruf vorübergehend fehlgeschlagen",
  action_required: "Prüfung erforderlich",
  disconnected: "Getrennt",
};

export function MyfxbookConnectionPanel({ account }: { account: Account }) {
  const native = isTauri();
  const cloud = isPrivateWeb();
  const available =
    native || (cloud && supportsPrivateWebCommand("myfxbook_activate"));
  const client = useQueryClient();
  const connections = useQuery({
    queryKey: ["myfxbook-connections"],
    queryFn: api.myfxbookConnections,
    enabled: available,
    refetchInterval: available ? (cloud ? 60_000 : 10_000) : false,
  });
  const connection = connections.data?.find((c) => c.accountId === account.id);
  const [showLogin, setShowLogin] = useState(false);
  const [login, setLogin] = useState<MyfxbookLogin>();
  const [externalId, setExternalId] = useState("");
  const [timezone, setTimezone] = useState("");
  const [preview, setPreview] = useState<MyfxbookPreview>();
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const busy = Boolean(pending) || connection?.status === "syncing";
  const brokerTimezone = connection?.brokerTimezone ?? timezone.trim();
  const money = (amount: number | null | undefined) =>
    accountMoney(amount, account.baseCurrency);

  async function run(label: string, action: () => Promise<void>) {
    if (busy) return;
    setPending(label);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e && typeof e === "object" && "message" in e
          ? String(e.message)
          : "Der Myfxbook-Vorgang konnte nicht abgeschlossen werden.",
      );
    } finally {
      setPending("");
      void refreshMyfxbookJournal(client);
    }
  }

  return (
    <Card className="myfxbook-panel">
      <CardHeader
        title="Myfxbook automatisch synchronisieren"
        subtitle={`Neue Trades und Abschlüsse in „${account.name}“ übernehmen.`}
      />
      <CardContent>
        <p>
          {cloud
            ? "Der Cloud-Abgleich läuft nach der Aktivierung alle sechs Stunden, auch bei ausgeschaltetem PC."
            : "Der Abgleich läuft alle fünf Minuten, solange die Desktop-App geöffnet ist."}{" "}
          Er übernimmt offene und abgeschlossene Trades sowie Ein- und
          Auszahlungen, sobald Myfxbook sie bereitstellt.
        </p>
        {!available ? (
          <p>
            {cloud
              ? "Die geschützte Myfxbook-Cloud-Anmeldung ist noch nicht eingerichtet."
              : "Öffne die Desktop-App, um Myfxbook sicher zu verbinden."}
          </p>
        ) : (
          <>
            {connections.isPending && (
              <p role="status">Verbindungsstatus wird geladen …</p>
            )}
            {connections.isError && (
              <p role="alert">
                Der Verbindungsstatus konnte nicht geladen werden.
              </p>
            )}
            {connection && (
              <>
                <div className="myfxbook-status-grid">
                  <div>
                    <span>Status</span>
                    <strong>
                      {statusLabels[connection.status] ?? connection.status}
                    </strong>
                  </div>
                  <div>
                    <span>Myfxbook-Portfolio</span>
                    <strong>
                      {connection.externalName} · {connection.externalId}
                    </strong>
                  </div>
                  <div>
                    <span>Letzter erfolgreicher Abgleich</span>
                    <strong>
                      {connection.lastSyncAt
                        ? dateTime(connection.lastSyncAt)
                        : "Noch keiner"}
                    </strong>
                  </div>
                  <div>
                    <span>Geprüfter Kontostand</span>
                    <strong>{money(connection.balanceMinor)}</strong>
                  </div>
                </div>
                <p
                  role={
                    connection.status === "action_required" ||
                    connection.status === "error"
                      ? "alert"
                      : "status"
                  }
                >
                  {connection.message}
                </p>
                {connection.lastProviderAt && (
                  <p className="myfxbook-muted">
                    Quellenstand laut Myfxbook: {connection.lastProviderAt}{" "}
                    (Brokerzeit: {connection.brokerTimezone}).
                  </p>
                )}
                <div className="myfxbook-actions">
                  {connection.status !== "disconnected" && (
                    <>
                      {native && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void run("sync", async () => {
                              const result = await api.myfxbookSync(account.id);
                              toast.success(
                                `Myfxbook: ${result.newTrades} neue Trades, ${result.closedTrades} Abschlüsse übernommen.`,
                              );
                            })
                          }
                        >
                          {pending === "sync"
                            ? "Wird abgeglichen …"
                            : "Jetzt abgleichen"}
                        </Button>
                      )}
                      <Button
                        disabled={
                          busy ||
                          (!connection.enabled &&
                            connection.status === "action_required")
                        }
                        onClick={() =>
                          void run("toggle", () =>
                            api.myfxbookSetEnabled(
                              account.id,
                              !connection.enabled,
                            ),
                          )
                        }
                      >
                        {connection.enabled
                          ? "Automatik pausieren"
                          : "Automatik fortsetzen"}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run("disconnect", async () => {
                            await api.myfxbookDisconnect(account.id);
                            setLogin(undefined);
                            setPreview(undefined);
                          })
                        }
                      >
                        Verbindung trennen
                      </Button>
                    </>
                  )}
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setShowLogin(true);
                      setPreview(undefined);
                      setError("");
                    }}
                  >
                    {connection.status === "disconnected"
                      ? "Erneut verbinden"
                      : "Erneut anmelden / prüfen"}
                  </Button>
                </div>
              </>
            )}
            {connections.isSuccess && (!connection || showLogin) && (
              <div className="myfxbook-setup">
                {!login ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const data = new FormData(form);
                      const email = String(data.get("email") ?? "").trim();
                      const password = String(data.get("password") ?? "");
                      // Never retain credentials in Query/Mutation caches or persisted state.
                      (
                        form.elements.namedItem("password") as HTMLInputElement
                      ).value = "";
                      void run("login", async () => {
                        const result = await api.myfxbookLogin({
                          email,
                          password,
                        });
                        setLogin(result);
                        setPreview(undefined);
                        const matching = result.accounts.filter(
                          (a) =>
                            a.currency === account.baseCurrency &&
                            (connection
                              ? a.id === connection.externalId
                              : a.name.toLowerCase() ===
                                account.name.toLowerCase()),
                        );
                        setExternalId(
                          matching.length === 1 ? matching[0].id : "",
                        );
                      });
                    }}
                  >
                    <p>
                      {cloud
                        ? "Mit deinem Myfxbook-Benutzerkonto anmelden. Deine Zugangsdaten werden für die automatische Cloud-Anmeldung verschlüsselt gespeichert. Beim Trennen der Verbindung werden sie entfernt."
                        : "Mit deinem Myfxbook-Benutzerkonto anmelden. Das Passwort wird nur zur Anmeldung übertragen; die Sitzung wird geschützt im Windows-Anmeldedatenspeicher abgelegt."}
                    </p>
                    <div className="form-grid cols-3">
                      <label className="field">
                        Myfxbook-E-Mail
                        <input
                          className="input"
                          name="email"
                          type="email"
                          autoComplete="username"
                          required
                          maxLength={254}
                          disabled={busy}
                        />
                      </label>
                      <label className="field">
                        Myfxbook-Passwort
                        <input
                          className="input"
                          name="password"
                          type="password"
                          autoComplete="current-password"
                          required
                          maxLength={1024}
                          disabled={busy}
                        />
                      </label>
                      <div className="myfxbook-submit">
                        <Button type="submit" variant="primary" disabled={busy}>
                          {pending === "login"
                            ? "Anmeldung läuft …"
                            : "Bei Myfxbook anmelden"}
                        </Button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      setPreview(undefined);
                      void run("preview", async () =>
                        setPreview(
                          await api.myfxbookPreview({
                            authorizationId: login.authorizationId,
                            accountId: account.id,
                            externalId,
                            brokerTimezone,
                          }),
                        ),
                      );
                    }}
                  >
                    <div className="form-grid cols-3">
                      <label className="field">
                        Myfxbook-Portfolio
                        <select
                          className="input"
                          required
                          value={externalId}
                          disabled={busy}
                          onChange={(event) => {
                            setExternalId(event.target.value);
                            setPreview(undefined);
                          }}
                        >
                          <option value="">Portfolio wählen …</option>
                          {login.accounts.map((a) => (
                            <option
                              key={a.id}
                              value={a.id}
                              disabled={
                                a.currency !== account.baseCurrency ||
                                Boolean(
                                  connection && a.id !== connection.externalId,
                                )
                              }
                            >
                              {a.name} · {a.id} · {a.currency}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Brokerzeitzone
                        <input
                          className="input"
                          required
                          value={brokerTimezone}
                          disabled={busy || Boolean(connection)}
                          placeholder="z. B. UTC oder Europe/Helsinki"
                          onChange={(event) => {
                            setTimezone(event.target.value);
                            setPreview(undefined);
                          }}
                        />
                      </label>
                      <div className="myfxbook-submit">
                        <Button
                          type="submit"
                          disabled={busy || !externalId || !brokerTimezone}
                        >
                          {pending === "preview"
                            ? "Wird geprüft …"
                            : "Verbindung prüfen"}
                        </Button>
                      </div>
                    </div>
                    <p className="myfxbook-muted">
                      Verwende die Zeitzone der Broker-Historie. Die API-Zeit
                      kann von der Anzeige auf der Myfxbook-Webseite abweichen.
                      Im Zweifel im Brokerbericht vergleichen.
                    </p>
                    {login.accounts.length === 0 && (
                      <p role="alert">
                        In diesem Myfxbook-Login sind keine Portfolios
                        verfügbar.
                      </p>
                    )}
                    <Button
                      variant="ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setLogin(undefined);
                        setPreview(undefined);
                      }}
                    >
                      Anderen Login verwenden
                    </Button>
                  </form>
                )}
                {preview && (
                  <div className="myfxbook-preview" aria-label="Importvorschau">
                    <h3>
                      Geprüft: {preview.externalName} → {account.name}
                    </h3>
                    <div className="myfxbook-status-grid">
                      <div>
                        <span>Neue Trades</span>
                        <strong>{preview.summary.newTrades}</strong>
                      </div>
                      <div>
                        <span>Offene Trades abschließen</span>
                        <strong>{preview.summary.closedTrades}</strong>
                      </div>
                      <div>
                        <span>Bereits zugeordnet</span>
                        <strong>{preview.summary.matchedTrades}</strong>
                      </div>
                      <div>
                        <span>Neue Kapitalbuchungen</span>
                        <strong>{preview.summary.newCashflows}</strong>
                      </div>
                    </div>
                    <p>
                      Kontostand: {money(preview.summary.balanceMinor)} ·
                      Realisiertes Ergebnis:{" "}
                      {money(preview.summary.profitMinor)} ·{" "}
                      {preview.summary.openTrades} offene Positionen.
                    </p>
                    <ul>
                      {preview.summary.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                    <p>
                      {cloud
                        ? "Vor jeder Änderung werden die bisherigen Kontodaten für eine Wiederherstellung gesichert."
                        : "Vor der Übernahme entsteht ein Backup."}{" "}
                      Deine Notizen, Bewertungen und Risikoeinträge bleiben
                      erhalten.
                    </p>
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() =>
                        void run("activate", async () => {
                          await api.myfxbookActivate(preview.previewId);
                          setPreview(undefined);
                          setLogin(undefined);
                          setShowLogin(false);
                          toast.success(
                            "Myfxbook ist verbunden. Die Automatik ist aktiv.",
                          );
                        })
                      }
                    >
                      {pending === "activate"
                        ? "Backup und Übernahme laufen …"
                        : "Übernehmen und Automatik aktivieren"}
                    </Button>
                  </div>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="myfxbook-error">
                {error}
              </p>
            )}
          </>
        )}
        <p className="myfxbook-muted">
          Myfxbook liefert höchstens die letzten 50 Historieneinträge. Nach
          längeren Pausen oder bei uneindeutigen Trades kann ein vollständiger
          Brokerbericht nötig sein.
          {cloud
            ? " Geänderte Myfxbook-Zugangsdaten erfordern eine erneute Anmeldung hier in der geschützten App."
            : " Ein IP-Wechsel oder eine abgelaufene Sitzung erfordert eine neue Anmeldung."}
        </p>
      </CardContent>
    </Card>
  );
}
