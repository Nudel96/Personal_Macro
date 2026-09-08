import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { useUiStore } from "../../stores/ui-store";
import type { JournalResetResult } from "../../types/domain";

const CONFIRMATION = "JOURNAL ZURÜCKSETZEN";
const JOURNAL_QUERY_KEYS = [
  "trades",
  "trade",
  "trade-context",
  "trade-media",
  "trade-mistakes",
  "dashboard",
  "calendar",
  "analytics",
  "reviews",
  "playbook",
  "mistakes",
  "goals",
] as const;

export function JournalResetDialog() {
  const queryClient = useQueryClient();
  const { setSelectedJournalAccountId, setQuickTradeOpen, setGuidedTradeOpen } =
    useUiStore();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<JournalResetResult>();

  const reset = async () => {
    if (confirmation !== CONFIRMATION || pending) return;
    setPending(true);
    try {
      const next = await api.resetJournal(confirmation);
      setSelectedJournalAccountId(null);
      setQuickTradeOpen(false);
      setGuidedTradeOpen(false);
      for (const key of JOURNAL_QUERY_KEYS) {
        queryClient.removeQueries({ queryKey: [key] });
      }
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setResult(next);
      toast.success("Journal wurde nach verifiziertem Backup zurückgesetzt.");
    } catch (error) {
      toast.error(
        (error as { message?: string }).message ??
          "Journal konnte nicht sicher zurückgesetzt werden.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (next) {
          setConfirmation("");
          setResult(undefined);
        }
      }}
    >
      <AlertDialog.Trigger asChild>
        <Button variant="danger" disabled={!isTauri()}>
          <RotateCcw size={14} /> Journal zurücksetzen
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <header className="dialog-header">
            <div>
              <AlertDialog.Title className="dialog-title">
                Journal vollständig zurücksetzen
              </AlertDialog.Title>
              <AlertDialog.Description className="dialog-description">
                Erst nach einem vollständig verifizierten Backup werden Konten,
                Trades, Reviews, Ziele, Importe und alte MT5-Verknüpfungen
                entfernt.
              </AlertDialog.Description>
            </div>
          </header>
          <div className="dialog-body">
            {result ? (
              <div className="notice">
                <strong>Reset abgeschlossen.</strong>
                <div style={{ marginTop: 8 }}>
                  Verifiziertes Backup: {result.backupPath}
                </div>
              </div>
            ) : (
              <>
                <div className="notice form-error">
                  <AlertTriangle size={15} /> Journal-Konten und alle davon
                  abhängigen Einträge werden gelöscht. Macro-, COT-, EODHD-,
                  Zins-, Seasonality-, Markt- und Put/Call-Daten sowie
                  Definitionen und Medienoriginale bleiben erhalten.
                </div>
                <label className="field" style={{ marginTop: 14 }}>
                  <span>Zur Bestätigung exakt eingeben</span>
                  <input
                    className="input"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    placeholder={CONFIRMATION}
                    autoComplete="off"
                    disabled={pending}
                  />
                </label>
              </>
            )}
          </div>
          <footer className="dialog-footer">
            <AlertDialog.Cancel asChild>
              <Button disabled={pending}>
                {result ? "Schließen" : "Abbrechen"}
              </Button>
            </AlertDialog.Cancel>
            {!result && (
              <Button
                variant="danger"
                disabled={confirmation !== CONFIRMATION || pending}
                onClick={reset}
              >
                {pending ? "Backup und Reset laufen …" : "Sicher zurücksetzen"}
              </Button>
            )}
          </footer>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
