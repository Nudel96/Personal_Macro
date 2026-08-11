import * as Dialog from "@radix-ui/react-dialog";
import { open } from "@tauri-apps/plugin-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CheckCircle2,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  History,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import Papa from "papaparse";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { PageHeader } from "../../components/ui/page-header";
import { dateTime } from "../../lib/utils";
import { api, isTauri } from "../../services/commands";
import type {
  LegacyPreview,
  RestorePreview,
  TradeInput,
} from "../../types/domain";

type ImportRow = Record<string, unknown>;

export function ImportExportPage() {
  const queryClient = useQueryClient();
  const backups = useQuery({ queryKey: ["backups"], queryFn: api.backups });
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [filename, setFilename] = useState("");
  const [importing, setImporting] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState("");
  const [restorePreview, setRestorePreview] = useState<RestorePreview>();
  const [legacyPreview, setLegacyPreview] = useState<LegacyPreview>();
  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setFilename(file.name);
    try {
      if (/\.xlsx?$/i.test(file.name)) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        setRows(
          XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
            defval: "",
          }) as ImportRow[],
        );
      } else if (/\.json$/i.test(file.name)) {
        const parsed = JSON.parse(await file.text()) as unknown;
        setRows(
          Array.isArray(parsed)
            ? (parsed as ImportRow[])
            : typeof parsed === "object" &&
                parsed &&
                "items" in parsed &&
                Array.isArray((parsed as { items: unknown[] }).items)
              ? (parsed as { items: ImportRow[] }).items
              : [],
        );
      } else {
        const text = await file.text();
        const parsed = Papa.parse<ImportRow>(text, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: false,
          delimitersToGuess: [";", ",", "\t"],
        });
        if (parsed.errors.length)
          toast.warning(`${parsed.errors.length} Parser-Hinweise gefunden.`);
        setRows(parsed.data);
      }
    } catch {
      toast.error("Datei konnte nicht gelesen werden.");
    }
  }, []);
  const dropzone = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-excel": [".xls"],
      "application/json": [".json"],
    },
  });
  const exportMutation = useMutation({
    mutationFn: api.exportTrades,
    onSuccess: (result) =>
      toast.success(
        `${result.recordCount} Trades als ${result.format.toUpperCase()} exportiert.`,
      ),
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Export fehlgeschlagen."),
  });
  const excelMutation = useMutation({
    mutationFn: () =>
      import("./document-exports").then((module) => module.exportTradesExcel()),
    onSuccess: (result) =>
      result.saved &&
      toast.success(
        `${result.count} Trades als Excel-Arbeitsmappe exportiert.`,
      ),
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Excel-Export fehlgeschlagen."),
  });
  const pdfMutation = useMutation({
    mutationFn: () =>
      import("./document-exports").then((module) =>
        module.exportPerformancePdf(),
      ),
    onSuccess: (result) =>
      result.saved && toast.success("Performance-Bericht als PDF exportiert."),
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "PDF-Bericht fehlgeschlagen."),
  });
  const backupMutation = useMutation({
    mutationFn: api.createBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      toast.success("Backup erstellt und geprüft.");
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Backup fehlgeschlagen."),
  });
  const previewMutation = useMutation({
    mutationFn: api.previewBackup,
    onSuccess: setRestorePreview,
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Backup konnte nicht geprüft werden."),
  });
  const restoreMutation = useMutation({
    mutationFn: api.stageBackupRestore,
    onSuccess: (result) =>
      toast.success(
        `Wiederherstellung vorbereitet. Sicherheitskopie: ${result.safetyCopyPath}. Bitte starte die App jetzt neu.`,
      ),
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "Wiederherstellung konnte nicht vorbereitet werden.",
      ),
  });
  const openRestore = (path: string) => {
    setRestoreTarget(path);
    setRestorePreview(undefined);
    previewMutation.mutate(path);
  };
  const legacyImport = useMutation({
    mutationFn: (path: string) => api.importLegacyDatabase(path),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trades"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      ]);
      toast.success(
        `${result.imported} Legacy-Trades übernommen; ${result.skipped} bereits vorhanden.`,
      );
      setLegacyPreview(undefined);
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Legacy-Import fehlgeschlagen."),
  });
  const chooseLegacy = async () => {
    const path = await open({
      multiple: false,
      filters: [
        { name: "SQLite-Datenbank", extensions: ["sqlite", "sqlite3", "db"] },
      ],
    });
    if (typeof path !== "string") return;
    try {
      setLegacyPreview(await api.previewLegacyDatabase(path));
    } catch (error) {
      toast.error(
        (error as { message?: string }).message ??
          "Datenbank konnte nicht geprüft werden.",
      );
    }
  };
  const commitImport = async () => {
    setImporting(true);
    let imported = 0,
      failed = 0;
    for (const row of rows) {
      const input = mapImportRow(row);
      if (!input) {
        failed += 1;
        continue;
      }
      try {
        await api.createTrade(input);
        imported += 1;
      } catch {
        failed += 1;
      }
    }
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ["trades"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    toast.success(
      `${imported} Trades importiert${failed ? `, ${failed} übersprungen` : ""}.`,
    );
    if (imported) {
      setRows([]);
      setFilename("");
    }
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="Daten & System"
        title="Import & Export"
        description="Lokaler Datenaustausch mit Vorschau, Validierung und nachvollziehbaren Berichten."
      />
      <div
        className="grid"
        style={{ gridTemplateColumns: "1.1fr .9fr", marginBottom: 14 }}
      >
        <Card>
          <CardHeader
            title="Trades importieren"
            subtitle="CSV oder Excel · Vorschau vor dem Speichern"
          />
          <CardContent>
            {!rows.length ? (
              <div
                {...dropzone.getRootProps()}
                style={{
                  minHeight: 270,
                  display: "grid",
                  placeItems: "center",
                  border: "1px dashed rgba(111,145,202,.35)",
                  borderRadius: 12,
                  background: "rgba(76,120,255,.035)",
                  cursor: "pointer",
                }}
              >
                <input {...dropzone.getInputProps()} />
                <EmptyState
                  icon={Upload}
                  title="Datei hier ablegen"
                  description="Erkannt werden Instrument, Direction, Status, Datumsfelder, Netto-P&L, Risiko, Setup und Prozessdaten. Die Datei wird nicht in eine Cloud übertragen."
                  action={
                    <Button>
                      <FileSpreadsheet size={14} /> Datei auswählen
                    </Button>
                  }
                />
              </div>
            ) : (
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 13,
                  }}
                >
                  <div>
                    <strong>{filename}</strong>
                    <div
                      className="muted"
                      style={{ fontSize: 9, marginTop: 4 }}
                    >
                      {rows.length} Datenzeilen · erste 10 als Vorschau
                    </div>
                  </div>
                  <Button variant="danger" onClick={() => setRows([])}>
                    Verwerfen
                  </Button>
                </div>
                <div className="table-wrap" style={{ maxHeight: 300 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        {Object.keys(rows[0])
                          .slice(0, 8)
                          .map((key) => (
                            <th key={key}>{key}</th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 10).map((row, index) => (
                        <tr key={index}>
                          {Object.keys(rows[0])
                            .slice(0, 8)
                            .map((key) => (
                              <td key={key}>{String(row[key] ?? "")}</td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="notice" style={{ marginTop: 13 }}>
                  Pflichtfelder: Instrument. Direction wird auf Long/Short
                  normalisiert. Unvollständige Zeilen werden übersprungen und
                  nicht als Nullwerte erfunden.
                </div>
                <Button
                  variant="primary"
                  onClick={commitImport}
                  disabled={importing}
                  style={{ marginTop: 13 }}
                >
                  <CheckCircle2 size={14} />{" "}
                  {importing
                    ? "Importiert …"
                    : `${rows.length} Zeilen importieren`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Trades exportieren"
            subtitle="Aus der lokalen Source of Truth"
          />
          <CardContent>
            <ExportChoice
              icon={FileSpreadsheet}
              title="CSV-Export"
              copy="Semikolon-getrennt, kompatibel mit deutschem Excel."
              action={() => exportMutation.mutate("csv")}
            />
            <ExportChoice
              icon={FileJson}
              title="JSON-Export"
              copy="Vollständige strukturierte Daten für Archiv und Migration."
              action={() => exportMutation.mutate("json")}
            />
            <ExportChoice
              icon={FileSpreadsheet}
              title="Excel-Arbeitsmappe"
              copy="Alle Trades in einer formatierten XLSX-Datei mit Analyse-Spalten."
              action={() => excelMutation.mutate()}
            />
            <ExportChoice
              icon={FileText}
              title="Performance-Bericht (PDF)"
              copy="Kompakter Bericht mit Kernkennzahlen und den letzten Trades."
              action={() => pdfMutation.mutate()}
            />
            <div className="notice" style={{ marginTop: 18 }}>
              Exporte enthalten keine gelöschten Trades. Der Desktop-Export wird
              mit SHA-256 protokolliert.
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader
          title="Backups"
          subtitle="Datenbank, Medien und Prüfsummen in einem ZIP-Archiv"
          action={
            <Button
              variant="primary"
              onClick={() => backupMutation.mutate()}
              disabled={!isTauri() || backupMutation.isPending}
            >
              <Archive size={14} /> Backup erstellen
            </Button>
          }
        />
        <CardContent>
          {!isTauri() ? (
            <div className="notice">
              Vollständige SQLite-/Medien-Backups stehen in der installierten
              Desktop-App zur Verfügung. Die Browser-Vorschau speichert nur
              Testdaten im Browser.
            </div>
          ) : backups.data?.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Datei</th>
                    <th>Erstellt</th>
                    <th>Größe</th>
                    <th>SHA-256</th>
                    <th>Status</th>
                    <th>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.data.map((backup) => (
                    <tr key={backup.path}>
                      <td>
                        <div className="asset-cell">
                          <span className="asset-icon">
                            <FolderArchive size={13} />
                          </span>
                          <strong>{backup.filename}</strong>
                        </div>
                      </td>
                      <td>
                        <Button
                          size="sm"
                          onClick={() => openRestore(backup.path)}
                        >
                          <RotateCcw size={12} /> Wiederherstellen
                        </Button>
                      </td>
                      <td>{dateTime(backup.createdAt)}</td>
                      <td>{(backup.sizeBytes / 1024 / 1024).toFixed(2)} MB</td>
                      <td title={backup.sha256}>
                        {backup.sha256.slice(0, 18)}…
                      </td>
                      <td>
                        <Badge className="positive">
                          <CheckCircle2 size={11} /> Verifiziert
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={FolderArchive}
              title="Noch kein Backup"
              description="Erstelle vor größeren Imports oder Updates ein vollständiges lokales Archiv."
            />
          )}
        </CardContent>
      </Card>
      <Card style={{ marginTop: 14 }}>
        <CardHeader
          title="Migration aus dem bisherigen Journal"
          subtitle="Einmalige, idempotente Übernahme aus personal_macro.sqlite3"
          action={
            <Button disabled={!isTauri()} onClick={chooseLegacy}>
              <History size={14} /> Alte Datenbank auswählen
            </Button>
          }
        />
        <CardContent>
          {legacyPreview ? (
            <div className="settings-row">
              <div className="settings-row-copy">
                <strong>
                  {legacyPreview.valid
                    ? `${legacyPreview.tradeCount} Trades gefunden`
                    : "Datenbank nicht kompatibel"}
                </strong>
                <span title={legacyPreview.path}>{legacyPreview.path}</span>
                {legacyPreview.issues.map((issue) => (
                  <span className="negative-text" key={issue}>
                    {issue}
                  </span>
                ))}
              </div>
              <Button
                variant="primary"
                disabled={!legacyPreview.valid || legacyImport.isPending}
                onClick={() => legacyImport.mutate(legacyPreview.path)}
              >
                <CheckCircle2 size={14} /> Geprüft übernehmen
              </Button>
            </div>
          ) : (
            <div className="notice">
              Strategien, Setups, Preise, R-Ergebnis, P&L, These, Emotion sowie
              Macro- und Seasonality-Kontext werden übernommen. Wiederholte
              Imports erzeugen keine Duplikate.
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog.Root
        open={Boolean(restoreTarget)}
        onOpenChange={(open) => !open && setRestoreTarget("")}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content"
            aria-describedby={undefined}
          >
            <header className="dialog-header">
              <div>
                <Dialog.Title className="dialog-title">
                  Backup wiederherstellen
                </Dialog.Title>
                <div className="dialog-description">
                  Prüfsummenvalidierung, Sicherheitskopie und Anwendung beim
                  nächsten App-Start
                </div>
              </div>
              <Dialog.Close asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Dialog schließen"
                >
                  <X size={17} />
                </Button>
              </Dialog.Close>
            </header>
            <div className="dialog-body">
              {previewMutation.isPending ? (
                <div className="skeleton" style={{ height: 120 }} />
              ) : restorePreview ? (
                <>
                  <div
                    className={`notice${restorePreview.valid ? "" : " form-error"}`}
                  >
                    <strong>
                      {restorePreview.valid
                        ? "Backup vollständig verifiziert"
                        : "Backup ist nicht wiederherstellbar"}
                    </strong>
                    <div style={{ marginTop: 7 }}>
                      {restorePreview.fileCount} Dateien ·{" "}
                      {(restorePreview.totalSizeBytes / 1024 / 1024).toFixed(2)}{" "}
                      MB · App-Version{" "}
                      {restorePreview.appVersion ?? "unbekannt"}
                    </div>
                  </div>
                  {restorePreview.issues.length > 0 && (
                    <ul>
                      {restorePreview.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  <div className="notice" style={{ marginTop: 14 }}>
                    Vor dem Austausch wird automatisch eine Sicherheitskopie der
                    aktuellen Datenbank angelegt. Medien aus dem Backup werden
                    geprüft und beim Neustart eingespielt.
                  </div>
                  {restoreMutation.isSuccess && (
                    <div
                      className="notice"
                      style={{
                        marginTop: 14,
                        borderColor: "rgba(49,211,139,.4)",
                      }}
                    >
                      <strong>Bereit.</strong> Schließe Personal Macro und
                      starte die App erneut. Die Wiederherstellung erfolgt vor
                      dem Öffnen der Datenbank.
                    </div>
                  )}
                </>
              ) : null}
            </div>
            <footer className="dialog-footer">
              <Button onClick={() => setRestoreTarget("")}>Abbrechen</Button>
              <Button
                variant="danger"
                disabled={
                  !restorePreview?.valid ||
                  restoreMutation.isPending ||
                  restoreMutation.isSuccess
                }
                onClick={() => restoreMutation.mutate(restoreTarget)}
              >
                <RotateCcw size={14} />{" "}
                {restoreMutation.isPending
                  ? "Bereite vor …"
                  : "Geprüft wiederherstellen"}
              </Button>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function ExportChoice({
  icon: Icon,
  title,
  copy,
  action,
}: {
  icon: typeof Download;
  title: string;
  copy: string;
  action: () => void;
}) {
  return (
    <div className="settings-row">
      <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
        <div
          className="empty-icon"
          style={{ width: 38, height: 38, margin: 0 }}
        >
          <Icon size={17} />
        </div>
        <div className="settings-row-copy">
          <strong>{title}</strong>
          <span>{copy}</span>
        </div>
      </div>
      <Button onClick={action}>
        <Download size={13} /> Exportieren
      </Button>
    </div>
  );
}

function read(row: ImportRow, ...keys: string[]) {
  const found = keys.find((key) => row[key] != null && row[key] !== "");
  return found ? String(row[found]).trim() : undefined;
}
function minor(value?: string) {
  if (!value) return undefined;
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : undefined;
}
function mapImportRow(row: ImportRow): TradeInput | null {
  const instrument = read(row, "instrument", "Instrument", "Symbol", "symbol");
  if (!instrument) return null;
  const directionRaw = read(
    row,
    "direction",
    "Direction",
    "Richtung",
  )?.toLowerCase();
  const direction =
    directionRaw?.includes("short") || directionRaw === "sell"
      ? "short"
      : "long";
  const statusRaw = read(row, "status", "Status")?.toLowerCase();
  const status =
    statusRaw === "open" || statusRaw === "offen"
      ? "open"
      : statusRaw === "draft" || statusRaw === "entwurf"
        ? "draft"
        : "closed";
  const openedAt = read(row, "opened_at", "openedAt", "Einstieg", "Open Time");
  const closedAt = read(row, "closed_at", "closedAt", "Ausstieg", "Close Time");
  return {
    accountId: undefined,
    strategyId: undefined,
    setupId: undefined,
    status,
    instrument,
    assetClass: read(row, "asset_class", "assetClass") ?? "forex",
    direction,
    session: read(row, "session", "Session"),
    timeframe: read(row, "timeframe", "Timeframe"),
    openedAt: openedAt ? new Date(openedAt).toISOString() : undefined,
    closedAt:
      status === "closed"
        ? closedAt
          ? new Date(closedAt).toISOString()
          : new Date().toISOString()
        : undefined,
    displayTimezone: "Europe/Berlin",
    plannedEntry: read(row, "planned_entry", "plannedEntry"),
    actualEntry: read(row, "actual_entry", "actualEntry", "Entry"),
    initialStopLoss: read(row, "initial_stop_loss", "initialStopLoss", "Stop"),
    actualExit: read(row, "actual_exit", "actualExit", "Exit"),
    takeProfit: read(row, "take_profit", "takeProfit"),
    quantity: read(row, "quantity", "size", "Größe"),
    plannedRiskMinor: minor(read(row, "planned_risk", "plannedRisk", "Risiko")),
    grossPnlMinor: minor(read(row, "gross_pnl", "grossPnl")),
    feesMinor: minor(read(row, "fees", "Gebühren")) ?? 0,
    commissionMinor: minor(read(row, "commission", "Kommission")) ?? 0,
    swapMinor: minor(read(row, "swap", "Swap")) ?? 0,
    netPnlMinor: minor(read(row, "net_pnl", "netPnl", "P&L", "pnl")),
    rOverride: undefined,
    rOverrideReason: undefined,
    maeR: read(row, "mae_r", "maeR"),
    mfeR: read(row, "mfe_r", "mfeR"),
    followedPlan: undefined,
    followedRiskRules: undefined,
    followedEntryRules: undefined,
    followedExitRules: undefined,
    impulseTrade: undefined,
    processScore: undefined,
    executionScore: undefined,
    setupQuality: undefined,
    confidenceBefore: undefined,
    focusBefore: undefined,
    stressBefore: undefined,
    energyBefore: undefined,
    satisfactionAfter: undefined,
    reviewedAt: undefined,
    thesisHtml: read(row, "thesis", "These"),
    executionNotesHtml: undefined,
    reviewNotesHtml: read(row, "review", "Notizen"),
    lessonsHtml: undefined,
  };
}
