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
import { isPrivateWeb } from "../../services/runtime-mode";
import { officialReportUrl } from "./report-source";
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

function usdMicros(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value / 1_000_000);
}

function message(error: unknown) {
  if (typeof error === "string" && error.trim()) return error;
  if (typeof error === "object" && error && "message" in error) {
    return String(error.message);
  }
  return "Die Zentralbankberichte konnten nicht verarbeitet werden.";
}

export function CentralBankReportsPage() {
  const privateWeb = isPrivateWeb();
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
    refetchInterval: privateWeb ? false : summarize.isPending ? 3_000 : 60_000,
    ...(privateWeb
      ? {
          staleTime: Infinity,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
        }
      : {}),
  });
  const readMarkers = useQuery({
    queryKey: ["central-bank-report-reads"],
    queryFn: api.centralBankReportReadMarkers,
    enabled: privateWeb,
  });
  const detail = useQuery({
    queryKey: [
      "central-bank-report",
      selectedId,
      dashboard.data?.cloudGeneration,
      dashboard.data?.reports.find((report) => report.id === selectedId)
        ?.summarizedAt,
    ],
    queryFn: () =>
      privateWeb
        ? api.centralBankReport(selectedId!, dashboard.data?.cloudGeneration)
        : api.centralBankReport(selectedId!),
    enabled: Boolean(
      selectedId && (!privateWeb || dashboard.data?.cloudGeneration),
    ),
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
        queryKey: ["central-bank-report-reads"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["central-bank-reports"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["central-bank-report", id],
      });
    },
    onError: () =>
      toast.error("Der Lesestatus konnte nicht gespeichert werden."),
  });

  const reports = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("de");
    const markers = new Map(
      readMarkers.data?.map((item) => [item.id, item.readAt]),
    );
    return (dashboard.data?.reports ?? [])
      .map((report) =>
        privateWeb
          ? { ...report, readAt: markers.get(report.id) ?? null }
          : report,
      )
      .filter((report) => {
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
  }, [
    bank,
    dashboard.data?.reports,
    reportType,
    search,
    status,
    privateWeb,
    readMarkers.data,
  ]);

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
  const unread = privateWeb
    ? data.reports.filter(
        (report) => !readMarkers.data?.some((item) => item.id === report.id),
      ).length
    : data.reports.filter((report) => !report.readAt).length;

  async function openReport(report: CentralBankReportListItem) {
    try {
      if (report.localPath && isTauri()) {
        await api.openCentralBankReportFile(report.id);
      } else if (isTauri()) {
        await openUrl(report.sourceUrl);
      } else {
        const url = officialReportUrl(report.bankCode, report.sourceUrl);
        if (!url)
          throw new Error(
            "Die offizielle Berichtsquelle konnte nicht bestätigt werden.",
          );
        window.open(url, "_blank", "noopener,noreferrer");
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
        description={
          privateWeb
            ? data.automation.enabled
              ? data.automation.openaiConfigured
                ? "Offizielle Entscheidungen, geldpolitische Berichte und Projektionen – tägliche Quellenprüfung und deutsche Briefings im privaten Workspace."
                : "Offizielle Entscheidungen, geldpolitische Berichte und Projektionen – tägliche Quellenprüfung im privaten Workspace."
              : "Offizielle Entscheidungen, geldpolitische Berichte und Projektionen aus deinem übernommenen Datenstand – mit vorhandenen deutschen Briefings und Originaltexten."
            : "Offizielle Entscheidungen, geldpolitische Berichte und Projektionen – automatisch geladen, lokal archiviert und auf Deutsch zusammengefasst."
        }
        actions={
          privateWeb ? (
            <Badge className="primary">
              <DatabaseZap size={11} />{" "}
              {data.automation.enabled
                ? "Cloud-Aktualisierung aktiv"
                : "Privater Datenstand"}
            </Badge>
          ) : (
            <>
              <Badge
                className={data.automation.enabled ? "positive" : "warning"}
              >
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
          )
        }
      />

      <DataStatusStrip
        status={
          privateWeb
            ? `${data.reports.length} übernommene offizielle Berichte`
            : `${data.sources.length} offizielle Quellen · ${data.reports.length} Berichte`
        }
        quality={
          privateWeb
            ? readMarkers.isSuccess
              ? `${unread} ungelesen · Originalquellen geprüft`
              : "Lesestatus wird geladen"
            : `${successfulSources}/${data.sources.length} Quellen zuletzt erreichbar · ${unread} ungelesen`
        }
        detail={
          privateWeb
            ? data.automation.enabled
              ? "Tägliche Quellenprüfung" +
                (data.automation.lastSuccessAt
                  ? " · Zuletzt geprüft: " +
                    dateTime(data.automation.lastSuccessAt)
                  : " · Erster Abruf ausstehend")
              : `${data.cloudImportedAt ? `Übernommen am ${dateTime(data.cloudImportedAt)}` : "Übernahmezeit nicht verfügbar"} · Keine automatische Cloud-Aktualisierung.`
            : data.automation.lastSuccessAt
              ? `Zuletzt geprüft: ${dateTime(data.automation.lastSuccessAt)} · Intervall ${data.automation.refreshIntervalMinutes} Minuten`
              : "Der erste Abruf startet automatisch in der Desktop-App."
        }
        action={
          privateWeb ? (
            <Badge>
              {data.automation.enabled && data.automation.openaiConfigured
                ? "Neue deutsche Briefings aktiv"
                : "Vorhandene Briefings"}
            </Badge>
          ) : (
            <Badge
              className={
                data.automation.openaiConfigured ? "positive" : "warning"
              }
            >
              {data.automation.openaiConfigured
                ? `Deutsche KI-Zusammenfassung · ${data.automation.summaryModel}`
                : "Deutsche Zusammenfassung benötigt die Modellanbindung"}
            </Badge>
          )
        }
      />
      {data.automation.aiBudget && (
        <div className="notice central-bank-notice">
          KI-Teilbudget für {data.automation.aiBudget.month} (UTC):{" "}
          {usdMicros(data.automation.aiBudget.spentMicros)} verbraucht,{" "}
          {usdMicros(data.automation.aiBudget.heldMicros)} reserviert · Grenze{" "}
          {usdMicros(data.automation.aiBudget.limitMicros)} pro Monat.
          {data.automation.aiBudget.uncertainRequests > 0 &&
            " Ungeklärte Anfragen bleiben reserviert."}{" "}
          Originalberichte bleiben bei ausgeschöpftem Budget verfügbar.
          <details>
            <summary>Tokenverbrauch anzeigen</summary>
            <p>
              {data.automation.aiBudget.requests.toLocaleString("de-DE")}{" "}
              Anfragen ·{" "}
              {data.automation.aiBudget.inputTokens.toLocaleString("de-DE")}{" "}
              Eingabetokens, davon{" "}
              {data.automation.aiBudget.cachedTokens.toLocaleString("de-DE")}{" "}
              aus dem Cache ·{" "}
              {data.automation.aiBudget.outputTokens.toLocaleString("de-DE")}{" "}
              Ausgabetokens, davon{" "}
              {data.automation.aiBudget.reasoningTokens.toLocaleString("de-DE")}{" "}
              Reasoning-Tokens.
            </p>
          </details>
        </div>
      )}
      {privateWeb && readMarkers.isError && (
        <p className="notice" role="alert">
          Der persönliche Lesestatus konnte nicht geladen werden. Die Berichte
          bleiben verfügbar.
        </p>
      )}

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
              {!privateWeb && (
                <span
                  className={`central-bank-source-dot ${source?.lastStatus === "success" ? "ok" : ""}`}
                />
              )}
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
              <option
                value="unread"
                disabled={privateWeb && !readMarkers.isSuccess}
              >
                Nur ungelesene
              </option>
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
                      {!report.readAt &&
                      (!privateWeb || readMarkers.isSuccess) ? (
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
                description={
                  privateWeb
                    ? "Passe die Filter an. Hier sind die im Datenstand übernommenen Berichte verfügbar."
                    : "Passe die Filter an oder prüfe die offiziellen Quellen jetzt manuell."
                }
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
          privateWeb={privateWeb}
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
  privateWeb,
}: {
  report?: CentralBankReportDetail;
  loading: boolean;
  error: boolean;
  onOpen: (report: CentralBankReportListItem) => Promise<void>;
  onSummarize: (id: string) => void;
  summarizing: boolean;
  canSummarize: boolean;
  summaryError?: string | null;
  privateWeb: boolean;
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
          {report.localPath && (
            <Button
              onClick={() =>
                void (isTauri() ? openUrl(report.sourceUrl) : onOpen(report))
              }
            >
              <ExternalLink size={14} /> Offizielle Quelle
            </Button>
          )}
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
            {summary.quality && (
              <p className="notice central-bank-notice">
                Belegzitate und Zahlen wurden automatisch geprüft.
                {summary.quality.partial
                  ? " Grundlage sind begrenzte Auszüge aus " +
                    summary.quality.sentChunks +
                    " von " +
                    summary.quality.sourceChunks +
                    " Textabschnitten."
                  : " Grundlage sind alle extrahierten Textabschnitte."}{" "}
                Die inhaltliche Einordnung bleibt eine KI-Zusammenfassung.
              </p>
            )}
            <div className="central-bank-summary-sections">
              {summary.sections.map((section) => (
                <section key={section.key}>
                  <h3>{section.title}</h3>
                  <ul>
                    {section.points.map((point, index) => (
                      <li key={`${section.key}-${index}`}>
                        <span>{point.text}</span>
                        <small>{point.sourceRefs.join(" · ")}</small>
                        {point.evidence && point.evidence.length > 0 && (
                          <details className="central-bank-evidence">
                            <summary>Originalbelege anzeigen</summary>
                            {point.evidence.map((evidence, evidenceIndex) => (
                              <blockquote key={evidenceIndex}>
                                <small>{evidence.sourceRef}</small>
                                <p>{evidence.quote}</p>
                              </blockquote>
                            ))}
                          </details>
                        )}
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
                : privateWeb
                  ? "Für diesen übernommenen Bericht liegt noch kein deutsches Briefing vor. Der Originaltext und die offizielle Quelle bleiben verfügbar."
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
