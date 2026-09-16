import { Landmark as PageIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  BookOpen,
  Building2,
  DatabaseZap,
  ExternalLink,
  FileDown,
  FileText,
  Languages,
  RefreshCw,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { DataStatusStrip } from "../../components/ui/data-status-strip";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { PageHeader } from "../../components/ui/page-header";
import { dateTime, localDate } from "../../lib/utils";
import { api, isTauri } from "../../services/commands";
import type {
  CentralBankReportDetail,
  CentralBankReportListItem,
  CentralBankReportType,
} from "../../types/domain";

const bankNames: Record<string, string> = {
  FED: "Federal Reserve",
  ECB: "Europäische Zentralbank",
  BOE: "Bank of England",
  BOJ: "Bank of Japan",
  RBA: "Reserve Bank of Australia",
  RBNZ: "Reserve Bank of New Zealand",
  BOC: "Bank of Canada",
  SNB: "Schweizerische Nationalbank",
  PBOC: "People's Bank of China",
};

const reportLabels: Record<CentralBankReportType, string> = {
  decision: "Zinsentscheidung",
  monetary_policy_report: "Geldpolitischer Bericht",
  projections: "Projektionen und Ausblick",
  special_notice: "Geldpolitische Sondermitteilung",
};

const stanceLabels = {
  hawkish: "Restriktive Geldpolitik",
  dovish: "Lockere Geldpolitik",
  neutral: "Neutral",
  unclear: "Nicht eindeutig",
};

function message(error: unknown) {
  if (typeof error === "string" && error.trim()) return error;
  if (typeof error === "object" && error && "message" in error) {
    return String(error.message);
  }
  return "Die Zentralbankberichte konnten nicht verarbeitet werden.";
}

export function CentralBankReportsPage() {
  const queryClient = useQueryClient();
  const [bank, setBank] = useState("all");
  const [reportType, setReportType] = useState<CentralBankReportType | "all">(
    "all",
  );
  const [status, setStatus] = useState<"all" | "unread">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const summarize = useMutation({
    mutationFn: (id?: string) => api.summarizeCentralBankReports(id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: ["central-bank-reports"],
      });
      void queryClient.invalidateQueries({ queryKey: ["central-bank-report"] });
      if (result.errorMessage) {
        toast.warning(
          `${result.reportsSummarized} Briefings auf Deutsch erstellt. ${result.errorMessage}`,
        );
      } else {
        toast.success(
          `${result.reportsSummarized} Briefings auf Deutsch erstellt.${result.reportsPending ? ` ${result.reportsPending} weitere sind noch ausstehend.` : ""}`,
        );
      }
    },
    onError: (error) => toast.error(message(error)),
  });

  const dashboard = useQuery({
    queryKey: ["central-bank-reports"],
    queryFn: api.centralBankReports,
    refetchInterval: summarize.isPending ? 3_000 : 60_000,
  });
  const detail = useQuery({
    queryKey: [
      "central-bank-report",
      selectedId,
      dashboard.data?.reports.find((report) => report.id === selectedId)
        ?.summarizedAt,
    ],
    queryFn: () => api.centralBankReport(selectedId!),
    enabled: Boolean(selectedId),
  });
  const sync = useMutation({
    mutationFn: api.syncCentralBankReports,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: ["central-bank-reports"],
      });
      void queryClient.invalidateQueries({ queryKey: ["central-bank-report"] });
      toast.success(
        `${result.reportsDiscovered} neue Berichte gefunden, ${result.reportsSummarized} zusammengefasst.`,
      );
    },
    onError: (error) => toast.error(message(error)),
  });
  const markRead = useMutation({
    mutationFn: api.markCentralBankReportRead,
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({
        queryKey: ["central-bank-reports"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["central-bank-report", id],
      });
    },
  });

  const reports = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("de");
    return (dashboard.data?.reports ?? []).filter((report) => {
      if (bank !== "all" && report.bankCode !== bank) return false;
      if (reportType !== "all" && report.reportType !== reportType)
        return false;
      if (status === "unread" && report.readAt) return false;
      return (
        !needle ||
        `${report.title} ${report.bankCode} ${report.currency}`
          .toLocaleLowerCase("de")
          .includes(needle)
      );
    });
  }, [bank, dashboard.data?.reports, reportType, search, status]);

  useEffect(() => {
    if (selectedId || reports.length === 0) return;
    const firstSummarized = reports.find(
      (report) =>
        report.summaryStatus === "complete" ||
        report.summaryStatus === "local_fallback",
    );
    setSelectedId((firstSummarized ?? reports[0]).id);
  }, [reports, selectedId]);

  if (dashboard.isLoading) {
    return (
      <div className="page central-bank-reports-page">
        <PageLoading />
      </div>
    );
  }
  if (dashboard.isError || !dashboard.data) {
    return (
      <div className="page central-bank-reports-page">
        <ErrorState message="Zentralbankberichte konnten nicht geladen werden." />
      </div>
    );
  }

  const data = dashboard.data;
  const successfulSources = data.sources.filter(
    (source) => source.lastStatus === "success",
  ).length;
  const unread = data.reports.filter((report) => !report.readAt).length;

  async function openReport(report: CentralBankReportListItem) {
    try {
      if (report.localPath && isTauri()) {
        await api.openCentralBankReportFile(report.id);
      } else {
        await openUrl(report.sourceUrl);
      }
    } catch (error) {
      toast.error(message(error));
    }
  }

  function selectReport(report: CentralBankReportListItem) {
    setSelectedId(report.id);
    if (!report.readAt) markRead.mutate(report.id);
  }

  return (
    <div className="page central-bank-page">
      <PageHeader
        icon={PageIcon}
        eyebrow="Marktkontext"
        title="Zentralbank-Briefings"
        description="Offizielle Entscheidungen, geldpolitische Berichte und Projektionen – automatisch geladen, lokal archiviert und auf Deutsch zusammengefasst."
        actions={
          <>
            <Badge className={data.automation.enabled ? "positive" : "warning"}>
              <DatabaseZap size={11} />{" "}
              {data.automation.enabled
                ? "Automatisch aktiv"
                : "Desktop erforderlich"}
            </Badge>
            <Button
              onClick={() => summarize.mutate(undefined)}
              disabled={
                summarize.isPending ||
                sync.isPending ||
                !isTauri() ||
                !data.automation.openaiConfigured
              }
            >
              <Languages size={14} />
              {summarize.isPending
                ? "Briefings werden übersetzt …"
                : "Briefings auf Deutsch"}
            </Button>
            <Button
              variant="primary"
              onClick={() => sync.mutate()}
              disabled={sync.isPending || summarize.isPending || !isTauri()}
            >
              <RefreshCw
                size={14}
                className={sync.isPending ? "spin" : undefined}
              />
              {sync.isPending ? "Prüfe Quellen …" : "Jetzt aktualisieren"}
            </Button>
          </>
        }
      />

      <DataStatusStrip
        status={`${data.sources.length} offizielle Quellen · ${data.reports.length} Berichte`}
        quality={`${successfulSources}/${data.sources.length} Quellen zuletzt erreichbar · ${unread} ungelesen`}
        detail={
          data.automation.lastSuccessAt
            ? `Zuletzt geprüft: ${dateTime(data.automation.lastSuccessAt)} · Intervall ${data.automation.refreshIntervalMinutes} Minuten`
            : "Der erste Abruf startet automatisch in der Desktop-App."
        }
        action={
          <Badge
            className={
              data.automation.openaiConfigured ? "positive" : "warning"
            }
          >
            {data.automation.openaiConfigured
              ? `Deutsche KI-Zusammenfassung · ${data.automation.summaryModel}`
              : "Deutsche Zusammenfassung benötigt die Modellanbindung"}
          </Badge>
        }
      />

      {data.automation.errorMessage ? (
        <div className="notice central-bank-notice">
          Einzelne Quellen konnten zuletzt nicht geprüft werden. Bereits
          gespeicherte Berichte bleiben vollständig verfügbar.{" "}
          {data.automation.errorMessage}
        </div>
      ) : null}

      <div className="central-bank-kpis">
        {Object.entries(bankNames).map(([code, name]) => {
          const source = data.sources.find((item) => item.bankCode === code);
          const count = data.reports.filter(
            (report) => report.bankCode === code,
          ).length;
          return (
            <button
              type="button"
              className={`central-bank-kpi${bank === code ? " active" : ""}`}
              key={code}
              onClick={() => setBank(bank === code ? "all" : code)}
              title={`${name} filtern`}
            >
              <span className="asset-icon">{source?.currency ?? code}</span>
              <span>
                <strong>{code}</strong>
                <small>{count} Berichte</small>
              </span>
              <span
                className={`central-bank-source-dot ${source?.lastStatus === "success" ? "ok" : ""}`}
              />
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title="Berichtsarchiv"
          subtitle="Bewusst ohne Reden, Forschung, Minutes, Meeting Accounts und Pressekonferenz-Inhalte"
        />
        <CardContent className="central-bank-filters">
          <div className="field central-bank-search">
            <label htmlFor="central-bank-search">Suche</label>
            <div className="central-bank-search-input">
              <Search size={14} />
              <input
                id="central-bank-search"
                className="input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Titel, Zentralbank oder Währung …"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="central-bank-filter">Zentralbank</label>
            <select
              id="central-bank-filter"
              className="select"
              value={bank}
              onChange={(event) => setBank(event.target.value)}
            >
              <option value="all">Alle Zentralbanken</option>
              {Object.entries(bankNames).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="central-bank-type">Dokumentart</label>
            <select
              id="central-bank-type"
              className="select"
              value={reportType}
              onChange={(event) =>
                setReportType(
                  event.target.value as CentralBankReportType | "all",
                )
              }
            >
              <option value="all">Alle Dokumentarten</option>
              {Object.entries(reportLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="central-bank-status">Lesestatus</label>
            <select
              id="central-bank-status"
              className="select"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as "all" | "unread")
              }
            >
              <option value="all">Alle Berichte</option>
              <option value="unread">Nur ungelesene</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="central-bank-workspace">
        <Card className="central-bank-list-card">
          <CardHeader
            title={`${reports.length} Berichte`}
            subtitle="Neueste Veröffentlichung zuerst"
          />
          <CardContent className="central-bank-report-list">
            {reports.length ? (
              reports.map((report) => (
                <button
                  type="button"
                  className={`central-bank-report-row${selectedId === report.id ? " active" : ""}`}
                  key={report.id}
                  onClick={() => selectReport(report)}
                >
                  <span className="central-bank-report-mark">
                    <FileText size={16} />
                  </span>
                  <span className="central-bank-report-copy">
                    <span className="central-bank-report-meta">
                      <strong>
                        {report.bankCode} · {report.currency}
                      </strong>
                      <small>
                        {localDate(report.publishedAt ?? report.discoveredAt)}
                      </small>
                    </span>
                    <span className="central-bank-report-title">
                      {report.title}
                    </span>
                    <span className="central-bank-report-badges">
                      <Badge>{reportLabels[report.reportType]}</Badge>
                      <Badge
                        className={
                          report.summaryStatus === "complete"
                            ? "positive"
                            : report.summaryStatus === "local_fallback"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {report.summaryStatus === "complete"
                          ? "Deutsch zusammengefasst"
                          : report.summaryStatus === "local_fallback"
                            ? "Deutsch ausstehend"
                            : "Zusammenfassung ausstehend"}
                      </Badge>
                      {!report.readAt ? (
                        <Badge className="positive">Neu</Badge>
                      ) : null}
                    </span>
                    <span className="central-bank-report-open-hint">
                      Zusammenfassung anzeigen →
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <EmptyState
                icon={Building2}
                title="Keine passenden Berichte"
                description="Passe die Filter an oder prüfe die offiziellen Quellen jetzt manuell."
              />
            )}
          </CardContent>
        </Card>

        <ReportDetailPanel
          report={detail.data}
          loading={detail.isLoading}
          error={detail.isError}
          onOpen={openReport}
          onSummarize={(id) => summarize.mutate(id)}
          summarizing={summarize.isPending}
          canSummarize={
            isTauri() && data.automation.openaiConfigured && !sync.isPending
          }
          summaryError={
            summarize.error
              ? message(summarize.error)
              : summarize.data?.errorMessage
          }
        />
      </div>
    </div>
  );
}

function ReportDetailPanel({
  report,
  loading,
  error,
  onOpen,
  onSummarize,
  summarizing,
  canSummarize,
  summaryError,
}: {
  report?: CentralBankReportDetail;
  loading: boolean;
  error: boolean;
  onOpen: (report: CentralBankReportListItem) => Promise<void>;
  onSummarize: (id: string) => void;
  summarizing: boolean;
  canSummarize: boolean;
  summaryError?: string | null;
}) {
  if (loading)
    return (
      <Card className="central-bank-detail-card">
        <CardContent>
          <PageLoading />
        </CardContent>
      </Card>
    );
  if (error)
    return (
      <Card className="central-bank-detail-card">
        <CardContent>
          <ErrorState message="Das Briefing konnte nicht geöffnet werden." />
        </CardContent>
      </Card>
    );
  if (!report) {
    return (
      <Card className="central-bank-detail-card">
        <CardContent className="central-bank-detail-empty">
          <BookOpen size={28} />
          <strong>Bericht auswählen</strong>
          <span className="muted">
            Öffne links einen Bericht, um die Zusammenfassung und Quellenbelege
            zu lesen.
          </span>
        </CardContent>
      </Card>
    );
  }
  const summary = report.summaryStatus === "complete" ? report.summary : null;
  return (
    <Card className="central-bank-detail-card">
      <CardHeader
        title={`${report.bankCode} · ${reportLabels[report.reportType]}`}
        subtitle={`${bankNames[report.bankCode]} · ${localDate(report.publishedAt ?? report.discoveredAt)}`}
        action={
          <Badge
            className={
              summary?.stance === "hawkish"
                ? "positive"
                : summary?.stance === "dovish"
                  ? "negative"
                  : "neutral"
            }
          >
            {summary ? stanceLabels[summary.stance] : "Nicht bewertet"}
          </Badge>
        }
      />
      <CardContent>
        <h2 className="central-bank-detail-title">{report.title}</h2>
        <div className="page-actions central-bank-detail-actions">
          <Button variant="primary" onClick={() => void onOpen(report)}>
            {report.localPath ? (
              <FileDown size={14} />
            ) : (
              <ExternalLink size={14} />
            )}
            {report.localPath
              ? "Lokales Original öffnen"
              : "Offizielle Quelle öffnen"}
          </Button>
          <Button onClick={() => void openUrl(report.sourceUrl)}>
            <ExternalLink size={14} /> Offizielle Quelle
          </Button>
        </div>
        {summary ? (
          <>
            <div className="central-bank-summary-heading">
              <div>
                <span className="eyebrow">Briefing</span>
                <h3>Zusammenfassung auf Deutsch</h3>
              </div>
              <Badge className="positive">Deutsch</Badge>
            </div>
            <div className="notice central-bank-overview">
              {summary.overview}
            </div>
            <div className="central-bank-summary-sections">
              {summary.sections.map((section) => (
                <section key={section.key}>
                  <h3>{section.title}</h3>
                  <ul>
                    {section.points.map((point, index) => (
                      <li key={`${section.key}-${index}`}>
                        <span>{point.text}</span>
                        <small>{point.sourceRefs.join(" · ")}</small>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            icon={FileText}
            title={
              summarizing
                ? "Deutsches Briefing wird erstellt"
                : "Deutsche Zusammenfassung ausstehend"
            }
            description={
              summaryError ??
              (canSummarize
                ? "Erstelle die deutsche Zusammenfassung aus dem gespeicherten Originalbericht."
                : "Für deutsche Briefings muss die Modellanbindung verfügbar sein. Das Original kannst du weiterhin öffnen.")
            }
            action={
              canSummarize && report.extractedText ? (
                <Button
                  onClick={() => onSummarize(report.id)}
                  disabled={summarizing}
                >
                  <Languages size={14} />{" "}
                  {summarizing ? "Wird übersetzt …" : "Deutsch zusammenfassen"}
                </Button>
              ) : undefined
            }
          />
        )}
        {report.extractedText ? (
          <details className="central-bank-source-text">
            <summary>Originaltext in Quellsprache anzeigen</summary>
            <pre>{report.extractedText}</pre>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
