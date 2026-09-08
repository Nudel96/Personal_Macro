import { open } from "@tauri-apps/plugin-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileSpreadsheet, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { dateTime } from "../../lib/utils";
import { api, isTauri } from "../../services/commands";
import type { CTraderStatementPreview } from "../../types/domain";
import { useJournalAccount } from "../accounts/journal-account-context";

const JOURNAL_QUERY_KEYS = [
  "trades",
  "dashboard",
  "calendar",
  "analytics",
  "playbook",
  "mistakes",
] as const;

export function CTraderStatementImport() {
  const queryClient = useQueryClient();
  const { status, selectedAccountId } = useJournalAccount();
  const journalReady = status === "ready" && selectedAccountId !== null;
  const [preview, setPreview] = useState<CTraderStatementPreview>();
  const [fallbackTimezone, setFallbackTimezone] = useState("Europe/Berlin");

  useEffect(() => setPreview(undefined), [selectedAccountId]);

  const previewMutation = useMutation({
    mutationFn: (path: string) =>
      api.previewCTraderStatement({
        path,
        accountId: selectedAccountId!,
        sourceTimezone: fallbackTimezone.trim(),
      }),
    onSuccess: setPreview,
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "Das cTrader-Statement konnte nicht geprüft werden.",
      ),
  });
  const commitMutation = useMutation({
    mutationFn: () =>
      api.commitCTraderStatement({
        runId: preview!.runId,
        accountId: selectedAccountId!,
      }),
    onSuccess: async (result) => {
      await Promise.all(
        JOURNAL_QUERY_KEYS.map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      toast.success(
        `${result.inserted} cTrader-Trades übernommen; ${result.duplicate} Duplikate übersprungen.`,
      );
      setPreview(undefined);
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Der cTrader-Import ist fehlgeschlagen."),
  });

  const chooseStatement = async () => {
    if (!journalReady || !selectedAccountId) {
      toast.error("Wähle zuerst ein Tradingkonto aus.");
      return;
    }
    if (!fallbackTimezone.trim()) {
      toast.error("Trage eine gültige Fallback-Zeitzone ein.");
      return;
    }
    const path = await open({
      multiple: false,
      filters: [
        {
          name: "cTrader Statement",
          extensions: ["html", "htm", "xlsx"],
        },
      ],
    });
    if (typeof path === "string") previewMutation.mutate(path);
  };

  return (
    <Card style={{ marginBottom: 14 }}>
      <CardHeader
        title="cTrader Statement"
        subtitle="cTrader-Kontoauszug als HTML oder XLSX prüfen und atomar in das ausgewählte Konto übernehmen"
        action={
          <Button
            variant="primary"
            disabled={
              !isTauri() ||
              !journalReady ||
              !fallbackTimezone.trim() ||
              previewMutation.isPending
            }
            onClick={chooseStatement}
          >
            <FileSpreadsheet size={14} /> cTrader-Datei auswählen
          </Button>
        }
      />
      <CardContent>
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>Fallback-Zeitzone</strong>
            <span>
              Enthält das Statement einen UTC-Offset, wird dieser automatisch
              verwendet. Diese IANA-Zeitzone gilt nur für Dateien ohne Offset.
            </span>
          </div>
          <input
            aria-label="cTrader Fallback-Zeitzone"
            className="input"
            style={{ maxWidth: 230 }}
            value={fallbackTimezone}
            onChange={(event) => setFallbackTimezone(event.target.value)}
            placeholder="z. B. Europe/Berlin"
            disabled={previewMutation.isPending}
          />
        </div>
        {!isTauri() ? (
          <div className="notice">
            Der sichere cTrader-Import steht ausschließlich in der installierten
            Desktop-App zur Verfügung.
          </div>
        ) : preview ? (
          <div style={{ marginTop: 14 }}>
            <div className="notice">
              <strong>
                Quelle {preview.maskedSourceAccount} · {preview.baseCurrency} ·{" "}
                {preview.format.toUpperCase()}
              </strong>
              <div style={{ marginTop: 7 }}>
                {preview.valid} gültig · {preview.duplicate} Duplikate ·{" "}
                {preview.invalid} ungültig · {preview.conflict} Konflikte ·{" "}
                {preview.openPositions} offene Positionen ignoriert ·{" "}
                {preview.orders} Orders ignoriert
              </div>
              <div style={{ marginTop: 7 }}>
                Statement-Zeitzone: {preview.sourceTimezone}. Öffnungszeit sowie
                Kommission/Swap fehlen im cTrader-Statement und bleiben als
                nicht verfügbar gekennzeichnet; Netto-P&amp;L wird direkt
                übernommen.
              </div>
              {preview.currencyMismatch && (
                <div style={{ marginTop: 7 }}>
                  Hinweis: Die Berichtswährung {preview.baseCurrency} weicht von
                  der Kontowährung {preview.targetAccountCurrency} ab. Die
                  Netto-P&amp;L-Beträge werden unverändert übernommen und nicht
                  automatisch umgerechnet.
                </div>
              )}
            </div>
            {preview.rows.length > 0 && (
              <div
                className="table-wrap"
                style={{ maxHeight: 310, marginTop: 12 }}
              >
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Zeile</th>
                      <th>Status</th>
                      <th>Symbol</th>
                      <th>Richtung</th>
                      <th>Geschlossen</th>
                      <th>Netto-P&amp;L</th>
                      <th>Hinweis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr
                        key={`${row.rowNumber}-${row.sourceTradeId ?? "invalid"}`}
                      >
                        <td>{row.rowNumber}</td>
                        <td>
                          <Badge
                            className={
                              row.status === "valid" ||
                              row.status === "duplicate"
                                ? "positive"
                                : "negative"
                            }
                          >
                            {row.status}
                          </Badge>
                        </td>
                        <td>{row.symbol ?? "—"}</td>
                        <td>{row.direction ?? "—"}</td>
                        <td>{row.closedAt ? dateTime(row.closedAt) : "—"}</td>
                        <td>
                          {formatCurrencyMinor(
                            row.netPnlMinor,
                            preview.baseCurrency,
                          )}
                        </td>
                        <td>{row.errors.join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="page-actions" style={{ marginTop: 13 }}>
              <Button onClick={() => setPreview(undefined)}>
                <X size={14} /> Verwerfen
              </Button>
              <Button
                variant="primary"
                disabled={
                  !preview.canCommit ||
                  commitMutation.isPending ||
                  !journalReady
                }
                onClick={() => commitMutation.mutate()}
              >
                <CheckCircle2 size={14} />{" "}
                {commitMutation.isPending
                  ? "Übernimmt atomar …"
                  : "Geprüfte cTrader-Trades übernehmen"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="notice" style={{ marginTop: 14 }}>
            Unterstützt werden cTrader-Account-Statements mit einer
            „History“-Tabelle. Leere XLSX-Exporte werden klar abgelehnt;
            verwende in diesem Fall den HTML-Kontoauszug. Dateien werden
            ausschließlich lokal gelesen und niemals als Webseite ausgeführt.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatCurrencyMinor(
  value: number | null | undefined,
  currency: string,
) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(value / 100);
}
