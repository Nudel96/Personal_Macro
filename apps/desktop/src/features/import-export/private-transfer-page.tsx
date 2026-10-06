import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Archive,
  Download,
  FileSpreadsheet,
  FolderSync,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import Papa from "papaparse";
import { toast } from "sonner";
import { api } from "../../services/commands";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { JournalPageHeader } from "../../components/ui/journal-page-header";
import { dateTime } from "../../lib/utils";
import { useJournalAccount } from "../accounts/journal-account-context";
import { mapImportRow } from "./import-row";
import type { TradeInput } from "../../types/domain";
import type { CloudBackupRecord } from "../../types/cloud-transfer";

const message = (error: unknown) =>
  (error as { message?: string })?.message ??
  "Die Aktion konnte nicht abgeschlossen werden.";
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function PrivateTransferPage() {
  const client = useQueryClient();
  const { selectedAccountId, status } = useJournalAccount();
  const fileInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<TradeInput[]>([]);
  const [previewAccountId, setPreviewAccountId] = useState<string | null>(null);
  const currentAccount = useRef(selectedAccountId);
  currentAccount.current = selectedAccountId;
  const [filename, setFilename] = useState("");
  const [rowError, setRowError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<CloudBackupRecord | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const backups = useQuery({
    queryKey: ["cloud-backups"],
    queryFn: api.cloudBackups,
  });
  const ready = status === "ready" && Boolean(selectedAccountId);
  const invalidate = () =>
    Promise.all(
      [
        "bootstrap",
        "trades",
        "dashboard",
        "calendar",
        "analytics",
        "playbook",
        "mistakes",
        "reviews",
        "goals",
        "media",
        "cloud-backups",
      ].map((key) => client.invalidateQueries({ queryKey: [key] })),
    );
  const createBackup = useMutation({
    mutationFn: api.createCloudBackup,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["cloud-backups"] });
      toast.success("Cloud-Sicherung erstellt und geprüft.");
    },
    onError: (error) => toast.error(message(error)),
  });
  const importBatch = useMutation({
    mutationFn: () => {
      if (previewAccountId !== selectedAccountId)
        throw Error("Bitte die Datei für das ausgewählte Konto erneut prüfen.");
      return api.importTradesBatch(
        selectedAccountId!,
        rows.map((row) => ({
          ...row,
          accountId: selectedAccountId!,
          id: undefined,
        })),
      );
    },
    onSuccess: async (result) => {
      setRows([]);
      setFilename("");
      await invalidate();
      toast.success(`${result.imported} Trades gemeinsam importiert.`);
    },
    onError: (error) => toast.error(message(error)),
  });
  const restore = useMutation({
    mutationFn: () => api.restoreCloudBackup(restoring!.id, confirmation),
    onSuccess: () => {
      toast.success(
        "Journal wiederhergestellt. Die Sicherheitskopie bleibt verfügbar.",
      );
      window.location.reload();
    },
    onError: (error) => toast.error(message(error)),
  });
  async function read(file: File) {
    const accountId = selectedAccountId;
    setRows([]);
    setRowError("");
    setFilename(file.name);
    if (!ready || !file.size || file.size > 2 * 1024 * 1024) {
      setRowError("Wähle ein aktives Konto und eine Datei bis 2 MiB.");
      return;
    }
    try {
      let source: unknown;
      if (/\.xlsx?$/i.test(file.name)) {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        source = XLSX.utils.sheet_to_json(
          workbook.Sheets[workbook.SheetNames[0]],
          { defval: "" },
        );
      } else if (/\.json$/i.test(file.name)) {
        const data: unknown = JSON.parse(await file.text());
        source = Array.isArray(data)
          ? data
          : (data as { items?: unknown })?.items;
      } else {
        const parsed = Papa.parse<Record<string, unknown>>(await file.text(), {
          header: true,
          skipEmptyLines: true,
          delimitersToGuess: [";", ",", "\t"],
        });
        if (parsed.errors.length)
          throw Error(
            "Die CSV-Datei enthält Parserfehler. Bitte die Datei vor dem Import korrigieren.",
          );
        source = parsed.data;
      }
      if (!Array.isArray(source) || source.length === 0 || source.length > 250)
        throw Error("Ein Import kann 1 bis 250 Trades enthalten.");
      const normalized = source.map((row, index) => {
        if (!row || typeof row !== "object" || Array.isArray(row))
          throw Error(`Zeile ${index + 1} ist ungültig.`);
        const mapped = mapImportRow(
          row as Record<string, unknown>,
          selectedAccountId!,
        );
        if (!mapped) throw Error(`Zeile ${index + 1} enthält kein Instrument.`);
        return mapped;
      });
      if (currentAccount.current !== accountId) return;
      setPreviewAccountId(accountId);
      setRows(normalized);
    } catch (error) {
      setRowError(message(error));
    }
  }
  async function exportFile(format: "csv" | "json" | "xlsx" | "pdf") {
    setBusy(true);
    try {
      const module = await import("./document-exports");
      if (format === "xlsx") await module.exportTradesExcel(selectedAccountId!);
      else if (format === "pdf")
        await module.exportPerformancePdf(selectedAccountId!);
      else {
        const trades = await module.allTrades(selectedAccountId!);
        const data =
          format === "json"
            ? JSON.stringify({ items: trades }, null, 2)
            : Papa.unparse(trades, { delimiter: ";", escapeFormulae: true });
        downloadBlob(
          new Blob([format === "csv" ? "\uFEFF" : "", data], {
            type:
              format === "csv" ? "text/csv;charset=utf-8" : "application/json",
          }),
          `PersonalMacro-Trades.${format}`,
        );
      }
      toast.success("Export für das ausgewählte Konto erstellt.");
    } catch (error) {
      toast.error(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function downloadBackup(record: CloudBackupRecord) {
    setBusy(true);
    try {
      const data = await api.cloudBackup(record.id);
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file("journal.json", JSON.stringify(data, null, 2));
      const media = data.tables.media_files ?? [];
      let bytes = 0;
      for (const row of media) {
        const id = String(row.id),
          type = String(row.mime_type),
          size = Number(row.size_bytes),
          sha = String(row.sha256);
        if (
          !/^[a-f0-9-]{36}$/.test(id) ||
          !Number.isSafeInteger(size) ||
          size < 1 ||
          size > 3 * 1024 * 1024 ||
          !/^[a-f0-9]{64}$/.test(sha)
        )
          throw Error("Ein Bildnachweis ist ungültig.");
        bytes += size;
        if (bytes > 128 * 1024 * 1024)
          throw Error(
            "Die Originalbilder überschreiten die Downloadgrenze von 128 MiB.",
          );
        const response = await fetch(`/api/media?id=${id}`, {
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok || response.headers.get("content-type") !== type)
          throw Error("Ein Originalbild konnte nicht abgerufen werden.");
        const image = await response.arrayBuffer();
        const digest = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", image)),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("");
        if (image.byteLength !== size || digest !== sha)
          throw Error(
            "Ein Originalbild stimmt nicht mit seinem Prüfnachweis überein.",
          );
        const extension =
          type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "webp";
        zip.file(`media/${id}.${extension}`, image);
      }
      downloadBlob(
        await zip.generateAsync({ type: "blob", compression: "DEFLATE" }),
        `PersonalMacro-Cloud-${record.id}.zip`,
      );
      toast.success("Journal und geprüfte Originalbilder heruntergeladen.");
    } catch (error) {
      toast.error(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page import-export-page">
      <JournalPageHeader
        icon={FolderSync}
        eyebrow="Daten & System"
        title="Import & Export"
        description="Dateien auf diesem Gerät lesen und herunterladen; Änderungen werden in deinem privaten Cloud-Journal gespeichert."
      />
      <div className="grid workspace-split">
        <Card>
          <CardHeader
            title="Trades importieren"
            subtitle="CSV, JSON oder Excel · Vorschau vor dem Speichern"
          />
          <CardContent>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.json,.xlsx,.xls"
              aria-label="Trade-Datei auswählen"
              disabled={!ready || busy || importBatch.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void read(file);
                event.target.value = "";
              }}
            />
            <p className="muted">
              Bis zu 250 neue Trades im ausgewählten Konto. Die Datei wird auf
              diesem Gerät gelesen; erst die bestätigten Trade-Daten werden
              übertragen. Ein fehlerhafter Batch speichert keine Trades.
            </p>
            {rowError && (
              <p className="form-error" role="alert">
                {rowError}
              </p>
            )}
            {rows.length > 0 && previewAccountId === selectedAccountId && (
              <>
                <strong>
                  {filename} · {rows.length} Trades
                </strong>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Instrument</th>
                        <th>Richtung</th>
                        <th>Status</th>
                        <th>Netto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 10).map((row, index) => (
                        <tr key={index}>
                          <td>{row.instrument}</td>
                          <td>{row.direction}</td>
                          <td>{row.status}</td>
                          <td>
                            {row.netPnlMinor == null
                              ? "Nicht verfügbar"
                              : (row.netPnlMinor / 100).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button
                  variant="primary"
                  disabled={!ready || importBatch.isPending}
                  onClick={() => importBatch.mutate()}
                >
                  <Upload size={14} />
                  {importBatch.isPending
                    ? "Speichere …"
                    : "Bestätigte Trades importieren"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Kontodaten exportieren"
            subtitle="Download auf dieses Gerät"
          />
          <CardContent>
            <div className="page-actions">
              {(["csv", "json", "xlsx", "pdf"] as const).map((format) => (
                <Button
                  key={format}
                  disabled={!ready || busy}
                  onClick={() => void exportFile(format)}
                >
                  <FileSpreadsheet size={14} />
                  {format.toUpperCase()}
                </Button>
              ))}
            </div>
            <p className="muted">
              Der globale Kontofilter bestimmt den Export. JSON enthält die
              Trade-Felder, Excel und PDF die bestehenden Journal-Auswertungen.
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader
          title="Cloud-Sicherungen"
          subtitle="Journal, persönliche Ansichten und Lernstand · Originalbilder bleiben privat"
        />
        <CardContent>
          <Button
            variant="primary"
            disabled={createBackup.isPending || busy}
            onClick={() => createBackup.mutate()}
          >
            <Archive size={14} />
            {createBackup.isPending ? "Sichere …" : "Cloud-Sicherung erstellen"}
          </Button>
          <p className="muted">
            Jede Sicherung ist prüfsummengeschützt. Der ZIP-Download ergänzt die
            unveränderten Originalbilder. Vor einer Wiederherstellung entsteht
            eine weitere Sicherheitskopie. Desktop-SQLite-Sicherungen verwenden
            ein eigenes Format.
          </p>
          {backups.isError && (
            <p role="alert" className="form-error">
              {message(backups.error)}
            </p>
          )}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Erstellt</th>
                  <th>Revision</th>
                  <th>Größe</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {backups.data?.map((record) => (
                  <tr key={record.id}>
                    <td>
                      {dateTime(record.createdAt)}
                      {record.safetyCopy ? " · Sicherheitskopie" : ""}
                    </td>
                    <td>{record.sourceRevision}</td>
                    <td>{(record.sizeBytes / 1024).toFixed(1)} KiB</td>
                    <td>
                      <div className="page-actions">
                        <Button
                          disabled={busy}
                          onClick={() => void downloadBackup(record)}
                        >
                          <Download size={14} />
                          ZIP
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() => {
                            setRestoring(record);
                            setConfirmation("");
                          }}
                        >
                          <RotateCcw size={14} />
                          Wiederherstellen
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Dialog.Root
        open={Boolean(restoring)}
        onOpenChange={(open) => {
          if (!open && !restore.isPending) setRestoring(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <header className="dialog-header">
              <div>
                <Dialog.Title className="dialog-title">
                  Cloud-Journal wiederherstellen
                </Dialog.Title>
                <Dialog.Description className="dialog-description">
                  Der ausgewählte Journalstand ersetzt den aktuellen Stand. Eine
                  geprüfte Sicherheitskopie entsteht in derselben Transaktion.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={restore.isPending}
                  aria-label="Dialog schließen"
                >
                  <X size={17} />
                </Button>
              </Dialog.Close>
            </header>
            <div className="dialog-body">
              <p>
                {restoring && dateTime(restoring.createdAt)} · Revision{" "}
                {restoring?.sourceRevision}
              </p>
              <p>
                Trenne Myfxbook vor der Wiederherstellung. Markt-Snapshots und
                Zugangsdaten werden nicht zurückgesetzt. Nach dem Speichern wird
                die Seite neu geladen.
              </p>
              <label>
                Zum Bestätigen WIEDERHERSTELLEN eingeben
                <input
                  className="input"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  disabled={restore.isPending}
                />
              </label>
            </div>
            <footer className="dialog-footer">
              <Button
                variant="danger"
                disabled={
                  confirmation !== "WIEDERHERSTELLEN" || restore.isPending
                }
                onClick={() => restore.mutate()}
              >
                {restore.isPending
                  ? "Stelle wieder her …"
                  : "Geprüft wiederherstellen"}
              </Button>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
