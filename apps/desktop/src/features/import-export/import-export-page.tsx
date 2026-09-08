import { FolderSync as PageIcon } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { open } from "@tauri-apps/plugin-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  History,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import Papa from "papaparse";
import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { JournalPageHeader } from "../../components/ui/journal-page-header";
import { dateTime } from "../../lib/utils";
import { api, isTauri } from "../../services/commands";
import type {
  LegacyPreview,
  MetaTraderHtmlPreview,
  RestorePreview,
  TradeInput,
} from "../../types/domain";
import {
  useJournalAccount,
  type JournalAccountStatus,
} from "../accounts/journal-account-context";
import { JournalResetDialog } from "./journal-reset-dialog";
import { CTraderStatementImport } from "./ctrader-statement-import";

type ImportRow = Record<string, unknown>;

export function journalTransferReady(
  status: JournalAccountStatus,
  selectedAccountId: string | null,
) {
  return status === "ready" && selectedAccountId !== null;
}

export function ImportExportPage() {
  const queryClient = useQueryClient();
  const { status: journalAccountStatus, selectedAccountId } =
    useJournalAccount();
  const journalReady = journalTransferReady(
    journalAccountStatus,
    selectedAccountId,
  );
  const backups = useQuery({ queryKey: ["backups"], queryFn: api.backups });
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [filename, setFilename] = useState("");
  const [importing, setImporting] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState("");
  const [restorePreview, setRestorePreview] = useState<RestorePreview>();
  const [legacyPreview, setLegacyPreview] = useState<LegacyPreview>();
  const [metaTraderPreview, setMetaTraderPreview] =
    useState<MetaTraderHtmlPreview>();
  const [sourceTimezone, setSourceTimezone] = useState("Europe/Berlin");
  useEffect(() => {
    setMetaTraderPreview(undefined);
  }, [selectedAccountId]);
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
  const excelMutation = useMutation({
    mutationFn: () =>
      import("./document-exports").then((module) =>
        module.exportTradesExcel(selectedAccountId!),
      ),
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
        module.exportPerformancePdf(selectedAccountId!),
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
  const metaTraderPreviewMutation = useMutation({
    mutationFn: (path: string) =>
      api.previewMetaTraderHtml({
        path,
        accountId: selectedAccountId!,
        sourceTimezone: sourceTimezone.trim(),
      }),
    onSuccess: setMetaTraderPreview,
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "MetaTrader-Report konnte nicht geprüft werden.",
      ),
  });
  const metaTraderCommitMutation = useMutation({
    mutationFn: () =>
      api.commitMetaTraderHtml({
        runId: metaTraderPreview!.runId,
        accountId: selectedAccountId!,
      }),
    onSuccess: async (result) => {
      await Promise.all(
        [
          "trades",
          "dashboard",
          "calendar",
          "analytics",
          "playbook",
          "mistakes",
        ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
      toast.success(
        `${result.inserted} historische Trades übernommen; ${result.duplicate} Duplikate übersprungen.`,
      );
      setMetaTraderPreview(undefined);
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "MetaTrader-Import fehlgeschlagen."),
  });
  const chooseMetaTraderHtml = async () => {
    if (!journalReady || !selectedAccountId) {
      toast.error("Wähle zuerst ein Tradingkonto aus.");
      return;
    }
    if (!sourceTimezone.trim()) {
      toast.error("Wähle die Broker-Server-Zeitzone aus.");
      return;
    }
    const path = await open({
      multiple: false,
      filters: [
        { name: "MetaTrader HTML-Historie", extensions: ["html", "htm"] },
      ],
    });
    if (typeof path === "string") metaTraderPreviewMutation.mutate(path);
  };
  const commitImport = async () => {
    setImporting(true);
    let imported = 0,
      failed = 0;
    for (const row of rows) {
      const input = mapImportRow(row, selectedAccountId ?? "");
      if (!input) {
        failed += 1;
        continue;
      }
      try {
        if (!journalReady) throw new Error("ACCOUNT_REQUIRED");
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
    <div className="page import-export-page">
      <JournalPageHeader
        icon={PageIcon}
        eyebrow="Daten & System"
        title="Import & Export"
        description="Lokaler Datenaustausch mit Vorschau, Validierung und nachvollziehbaren Berichten."
      />
      <nav className="section-jump-nav" aria-label="Datenverwaltung">
        <a href="#trade-transfer">
          <FileSpreadsheet size={14} /> Dateien & Exporte
        </a>
        <a href="#broker-imports">
          <FileText size={14} /> Broker-Historien
        </a>
        <a href="#workspace-backups">
          <FolderArchive size={14} /> Backups
        </a>
        <a href="#workspace-migration">
          <History size={14} /> Migration
        </a>
      </nav>
      <div
        id="trade-transfer"
        className="grid workspace-split section-anchor"
        style={{ marginBottom: 16 }}
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
                  disabled={!journalReady || importing}
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
            subtitle="Journal-Daten des ausgewählten Kontos"
          />
          <CardContent>
            <div className="notice">
              CSV/JSON-Export wird erst mit dem kontosicheren nativen Vertrag
              bereitgestellt.
            </div>
            <ExportChoice
              icon={FileSpreadsheet}
              title="Excel-Arbeitsmappe"
              copy="Alle Trades in einer formatierten XLSX-Datei mit Analyse-Spalten."
              action={() => excelMutation.mutate()}
              disabled={!journalReady || excelMutation.isPending}
            />
            <ExportChoice
              icon={FileText}
              title="Performance-Bericht (PDF)"
              copy="Kompakter Bericht mit Kernkennzahlen und den letzten Trades."
              action={() => pdfMutation.mutate()}
              disabled={!journalReady || pdfMutation.isPending}
            />
            <div className="notice" style={{ marginTop: 18 }}>
              Exporte enthalten keine gelöschten Trades. Der Desktop-Export wird
              mit SHA-256 protokolliert.
            </div>
          </CardContent>
        </Card>
      </div>
      <h2 id="broker-imports" className="section-heading section-anchor">
        <FileText size={18} /> Broker-Historien importieren
      </h2>
      <CTraderStatementImport />
      <Card style={{ marginBottom: 14 }}>
        <CardHeader
          title="MetaTrader HTML-Historie"
          subtitle="Klassischen MT5-History-Report prüfen und atomar in das ausgewählte Konto übernehmen"
          action={
            <Button
              variant="primary"
              disabled={
                !isTauri() ||
                !journalReady ||
                !sourceTimezone.trim() ||
                metaTraderPreviewMutation.isPending
              }
              onClick={chooseMetaTraderHtml}
            >
              <FileText size={14} /> HTML-Historie auswählen
            </Button>
          }
        />
        <CardContent>
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>Broker-Server-Zeitzone</strong>
              <span>
                Report-Zeitstempel enthalten keinen Offset. Diese Zone wird für
                die UTC-Umrechnung gespeichert und kann für dieselbe
                Report-Identität später nicht still geändert werden.
              </span>
            </div>
            <input
              className="input"
              style={{ maxWidth: 230 }}
              value={sourceTimezone}
              onChange={(event) => setSourceTimezone(event.target.value)}
              placeholder="z. B. Europe/Berlin"
              disabled={metaTraderPreviewMutation.isPending}
            />
          </div>
          {!isTauri() ? (
            <div className="notice">
              Der sichere HTML-Import steht ausschließlich in der installierten
              Desktop-App zur Verfügung.
            </div>
          ) : metaTraderPreview ? (
            <div style={{ marginTop: 14 }}>
              <div className="notice">
                <strong>
                  Quelle {metaTraderPreview.maskedSourceAccount} ·{" "}
                  {metaTraderPreview.baseCurrency}
                </strong>
                <div style={{ marginTop: 7 }}>
                  {metaTraderPreview.valid} gültig ·{" "}
                  {metaTraderPreview.duplicate} Duplikate ·{" "}
                  {metaTraderPreview.invalid} ungültig ·{" "}
                  {metaTraderPreview.conflict} Konflikte ·{" "}
                  {metaTraderPreview.openPositions} offene Positionen ignoriert
                </div>
              </div>
              {metaTraderPreview.rows.length > 0 && (
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
                        <th>Hinweis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metaTraderPreview.rows.slice(0, 100).map((row) => (
                        <tr key={row.rowNumber}>
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
                          <td>{row.errors.join(", ") || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="page-actions" style={{ marginTop: 13 }}>
                <Button onClick={() => setMetaTraderPreview(undefined)}>
                  Verwerfen
                </Button>
                <Button
                  variant="primary"
                  disabled={
                    !metaTraderPreview.canCommit ||
                    metaTraderCommitMutation.isPending ||
                    !journalReady
                  }
                  onClick={() => metaTraderCommitMutation.mutate()}
                >
                  <CheckCircle2 size={14} />{" "}
                  {metaTraderCommitMutation.isPending
                    ? "Übernimmt atomar …"
                    : "Geprüfte Trades übernehmen"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="notice" style={{ marginTop: 14 }}>
              Unterstützt wird der klassische MT5-History-Report mit
              geschlossenen Positionen. Reine grafische Aggregate-Reports
              enthalten keine importierbare Trade-Historie und werden klar
              abgelehnt. HTML wird niemals in der Oberfläche ausgeführt.
            </div>
          )}
        </CardContent>
      </Card>
      <h2 id="workspace-backups" className="section-heading section-anchor">
        <FolderArchive size={18} /> Sichern & wiederherstellen
      </h2>
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
      <h2 id="workspace-migration" className="section-heading section-anchor">
        <History size={18} /> Bestehendes Journal übernehmen
      </h2>
      <Card>
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
      <Card className="danger-zone" style={{ marginTop: 22 }}>
        <CardHeader
          title="Gefahrenbereich"
          subtitle="Journal-Konten und abhängige Daten nach verifiziertem Sicherheitsbackup entfernen"
          action={<JournalResetDialog />}
        />
        <CardContent>
          <div className="notice form-error">
            Macro-, COT-, EODHD-, Leitzins-, Seasonality-, Markt- und
            Put/Call-Daten bleiben erhalten. Der Reset startet das Journal ohne
            Konto neu und kann nur mit der exakten Bestätigungsphrase ausgeführt
            werden.
          </div>
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
  disabled = false,
}: {
  icon: typeof Download;
  title: string;
  copy: string;
  action: () => void;
  disabled?: boolean;
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
      <Button onClick={action} disabled={disabled}>
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
export function mapImportRow(
  row: ImportRow,
  accountId: string,
): TradeInput | null {
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
    accountId,
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
