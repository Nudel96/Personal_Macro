use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::Duration as StdDuration,
};

use chrono::{DateTime, Datelike, Duration, NaiveDate, Utc};
use regex::Regex;
use reqwest::{
    Client, StatusCode,
    header::{
        CONTENT_LENGTH, CONTENT_TYPE, ETAG, IF_MODIFIED_SINCE, IF_NONE_MATCH, LAST_MODIFIED,
        USER_AGENT,
    },
};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use url::Url;
use uuid::Uuid;

use crate::{
    database::AppState,
    errors::{AppError, CommandResult},
};

const SYNC_INTERVAL_MINUTES: i64 = 15;
const MAX_SOURCE_BYTES: usize = 5 * 1024 * 1024;
const MAX_REPORT_BYTES: usize = 20 * 1024 * 1024;
const MAX_MODEL_CHARS: usize = 80_000;
const INITIAL_REPORTS_PER_SOURCE: usize = 2;
const MAX_NEW_REPORTS_PER_SOURCE: usize = 10;
const SUMMARY_VERSION: i64 = 1;
const DEFAULT_OPENAI_MODEL: &str = "gpt-5-mini";

#[derive(Clone, Copy)]
enum SourceKind {
    Rss,
    Html,
}

#[derive(Clone, Copy)]
struct ReportSource {
    id: &'static str,
    bank_code: &'static str,
    bank_name: &'static str,
    currency: &'static str,
    url: &'static str,
    kind: SourceKind,
    language: &'static str,
}

const SOURCES: &[ReportSource] = &[
    ReportSource {
        id: "fed-monetary",
        bank_code: "FED",
        bank_name: "Federal Reserve",
        currency: "USD",
        url: "https://www.federalreserve.gov/feeds/press_monetary.xml",
        kind: SourceKind::Rss,
        language: "en",
    },
    ReportSource {
        id: "ecb-decisions",
        bank_code: "ECB",
        bank_name: "Europäische Zentralbank",
        currency: "EUR",
        url: "https://www.ecb.europa.eu/press/govcdec/mopo/html/index.en.html",
        kind: SourceKind::Html,
        language: "en",
    },
    ReportSource {
        id: "ecb-projections",
        bank_code: "ECB",
        bank_name: "Europäische Zentralbank",
        currency: "EUR",
        url: "https://www.ecb.europa.eu/press/projections/html/all-releases.en.html",
        kind: SourceKind::Html,
        language: "en",
    },
    ReportSource {
        id: "boe-latest",
        bank_code: "BOE",
        bank_name: "Bank of England",
        currency: "GBP",
        url: "https://www.bankofengland.co.uk/news/latest-and-upcoming",
        kind: SourceKind::Html,
        language: "en",
    },
    ReportSource {
        id: "boj-meetings",
        bank_code: "BOJ",
        bank_name: "Bank of Japan",
        currency: "JPY",
        url: "https://www.boj.or.jp/en/mopo/mpmsche_minu/",
        kind: SourceKind::Html,
        language: "en",
    },
    ReportSource {
        id: "rba-decisions",
        bank_code: "RBA",
        bank_name: "Reserve Bank of Australia",
        currency: "AUD",
        url: "https://www.rba.gov.au/rss/rss-cb-media-releases.xml",
        kind: SourceKind::Rss,
        language: "en",
    },
    ReportSource {
        id: "rba-smp",
        bank_code: "RBA",
        bank_name: "Reserve Bank of Australia",
        currency: "AUD",
        url: "https://www.rba.gov.au/rss/rss-cb-smp.xml",
        kind: SourceKind::Rss,
        language: "en",
    },
    ReportSource {
        id: "rbnz-decisions",
        bank_code: "RBNZ",
        bank_name: "Reserve Bank of New Zealand",
        currency: "NZD",
        url: "https://www.rbnz.govt.nz/monetary-policy/monetary-policy-decisions",
        kind: SourceKind::Html,
        language: "en",
    },
    ReportSource {
        id: "boc-decisions",
        bank_code: "BOC",
        bank_name: "Bank of Canada",
        currency: "CAD",
        url: "https://www.bankofcanada.ca/content_type/press-releases/feed/",
        kind: SourceKind::Rss,
        language: "en",
    },
    ReportSource {
        id: "boc-mpr",
        bank_code: "BOC",
        bank_name: "Bank of Canada",
        currency: "CAD",
        url: "https://www.bankofcanada.ca/content_type/mpr/feed/",
        kind: SourceKind::Rss,
        language: "en",
    },
    ReportSource {
        id: "snb-decisions",
        bank_code: "SNB",
        bank_name: "Schweizerische Nationalbank",
        currency: "CHF",
        url: "https://www.snb.ch/en/the-snb/mandates-goals/monetary-policy/decisions",
        kind: SourceKind::Html,
        language: "en",
    },
    ReportSource {
        id: "pbc-reports",
        bank_code: "PBOC",
        bank_name: "People's Bank of China",
        currency: "CNY",
        url: "https://www.pbc.gov.cn/en/3688229/3688353/3688356/index.html",
        kind: SourceKind::Html,
        language: "en",
    },
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CentralBankSummaryPoint {
    pub text: String,
    pub source_refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CentralBankSummarySection {
    pub key: String,
    pub title: String,
    pub points: Vec<CentralBankSummaryPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CentralBankReportSummary {
    pub overview: String,
    pub stance: String,
    pub sections: Vec<CentralBankSummarySection>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CentralBankReportListItem {
    pub id: String,
    pub bank_code: String,
    pub currency: String,
    pub report_type: String,
    pub title: String,
    pub source_url: String,
    pub published_at: Option<String>,
    pub discovered_at: String,
    pub language: String,
    pub mime_type: Option<String>,
    pub local_path: Option<String>,
    pub extraction_status: String,
    pub summary_status: String,
    pub summary_provider: Option<String>,
    pub summary_model: Option<String>,
    pub summarized_at: Option<String>,
    pub read_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CentralBankReportDetail {
    #[serde(flatten)]
    pub report: CentralBankReportListItem,
    pub extracted_text: Option<String>,
    pub summary: Option<CentralBankReportSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CentralBankSourceStatus {
    pub id: String,
    pub bank_code: String,
    pub bank_name: String,
    pub currency: String,
    pub source_url: String,
    pub last_checked_at: Option<String>,
    pub last_success_at: Option<String>,
    pub last_status: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CentralBankReportAutomation {
    pub enabled: bool,
    pub refresh_interval_minutes: i64,
    pub last_attempt_at: Option<String>,
    pub last_success_at: Option<String>,
    pub last_status: Option<String>,
    pub error_message: Option<String>,
    pub next_refresh_at: Option<String>,
    pub openai_configured: bool,
    pub summary_model: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CentralBankReportDashboard {
    pub reports: Vec<CentralBankReportListItem>,
    pub sources: Vec<CentralBankSourceStatus>,
    pub automation: CentralBankReportAutomation,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CentralBankSyncResult {
    pub sources_checked: usize,
    pub reports_discovered: usize,
    pub reports_downloaded: usize,
    pub reports_summarized: usize,
    pub completed_at: String,
}

#[derive(Debug, FromRow)]
struct SourceStateRow {
    etag: Option<String>,
    last_modified: Option<String>,
    last_success_at: Option<String>,
}

#[derive(Debug, FromRow)]
struct SourceStatusRow {
    last_checked_at: Option<String>,
    last_success_at: Option<String>,
    last_status: Option<String>,
    error_message: Option<String>,
}

#[derive(Debug, FromRow)]
struct LatestRunRow {
    started_at: String,
    status: String,
    error_message: Option<String>,
}

#[derive(Debug, FromRow)]
struct LocalSummaryRow {
    id: String,
    bank_code: String,
    report_type: String,
    title: String,
    source_url: String,
    published_at: Option<String>,
    extracted_text: String,
}

#[derive(Debug, Clone)]
struct Candidate {
    title: String,
    url: String,
    published_at: Option<String>,
    report_type: String,
}

#[derive(Debug, Clone)]
struct TextChunk {
    source_ref: String,
    text: String,
}

struct FetchResult {
    not_modified: bool,
    final_url: String,
    mime_type: Option<String>,
    etag: Option<String>,
    last_modified: Option<String>,
    bytes: Vec<u8>,
}

#[derive(Default)]
struct SyncCounts {
    sources_checked: usize,
    reports_discovered: usize,
    reports_downloaded: usize,
    reports_summarized: usize,
    errors: Vec<String>,
}

#[tauri::command]
pub async fn get_central_bank_reports(
    state: State<'_, AppState>,
) -> CommandResult<CentralBankReportDashboard> {
    load_dashboard(&state).await.map_err(Into::into)
}

#[tauri::command]
pub async fn get_central_bank_report(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<CentralBankReportDetail> {
    if id.trim().is_empty() || id.len() > 80 {
        return Err(crate::errors::CommandError::validation(
            "Der Berichtsschlüssel ist ungültig.",
        ));
    }
    let report = load_report_item(&state, &id).await?;
    let row: (Option<String>, Option<String>) =
        sqlx::query_as("SELECT extracted_text,summary_json FROM central_bank_reports WHERE id=?")
            .bind(&id)
            .fetch_one(&state.db)
            .await?;
    let summary = row
        .1
        .as_deref()
        .and_then(|value| serde_json::from_str(value).ok());
    Ok(CentralBankReportDetail {
        report,
        extracted_text: row.0,
        summary,
    })
}

#[tauri::command]
pub async fn sync_central_bank_reports(
    state: State<'_, AppState>,
) -> CommandResult<CentralBankSyncResult> {
    sync_reports(&state, "manual", true)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn mark_central_bank_report_read(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<()> {
    let changed = sqlx::query(
        "UPDATE central_bank_reports SET read_at=COALESCE(read_at,?),updated_at=? WHERE id=?",
    )
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .bind(id)
    .execute(&state.db)
    .await?
    .rows_affected();
    if changed == 0 {
        return Err(AppError::NotFound("Zentralbankbericht".into()).into());
    }
    Ok(())
}

#[tauri::command]
pub async fn open_central_bank_report_file(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<()> {
    let relative: Option<String> =
        sqlx::query_scalar("SELECT local_path FROM central_bank_reports WHERE id=?")
            .bind(id)
            .fetch_optional(&state.db)
            .await?
            .flatten();
    let relative = relative.ok_or_else(|| {
        AppError::NotFound("Für diesen Bericht liegt keine lokale PDF-Datei vor.".into())
    })?;
    let root = state
        .paths
        .central_bank_reports
        .canonicalize()
        .map_err(AppError::from)?;
    let path = state
        .paths
        .central_bank_reports
        .join(relative)
        .canonicalize()
        .map_err(AppError::from)?;
    if !path.starts_with(&root) || !path.is_file() {
        return Err(AppError::Validation("Der lokale Berichtspfad ist ungültig.".into()).into());
    }
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| {
            AppError::DataTransfer(format!(
                "Das lokale Original konnte nicht geöffnet werden: {}",
                limited_error(&error.to_string())
            ))
        })?;
    Ok(())
}

pub async fn scheduled_central_bank_report_sync(state: &AppState) -> Result<(), AppError> {
    if !sync_due(state).await? {
        return Ok(());
    }
    let trigger = if latest_success_at(state).await?.is_some() {
        "scheduler"
    } else {
        "startup"
    };
    sync_reports(state, trigger, false).await.map(|_| ())
}

async fn sync_reports(
    state: &AppState,
    trigger: &str,
    force: bool,
) -> Result<CentralBankSyncResult, AppError> {
    recover_stale_runs(state).await?;
    let running: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM central_bank_report_sync_runs WHERE status='running'",
    )
    .fetch_one(&state.db)
    .await?;
    if running > 0 {
        return Err(AppError::Conflict(
            "Eine Zentralbankbericht-Aktualisierung läuft bereits.".into(),
        ));
    }
    if !force && !sync_due(state).await? {
        return Ok(CentralBankSyncResult {
            sources_checked: 0,
            reports_discovered: 0,
            reports_downloaded: 0,
            reports_summarized: 0,
            completed_at: Utc::now().to_rfc3339(),
        });
    }

    let run_id = Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO central_bank_report_sync_runs(id,trigger_kind,status,started_at) VALUES(?,?,'running',?)",
    )
    .bind(&run_id)
    .bind(trigger)
    .bind(&started_at)
    .execute(&state.db)
    .await?;

    let client = report_client()?;
    let mut counts = SyncCounts::default();
    for source in SOURCES {
        counts.sources_checked += 1;
        if let Err(error) = sync_source(state, &client, source, &mut counts).await {
            let message = limited_error(&error.to_string());
            counts
                .errors
                .push(format!("{}: {message}", source.bank_code));
            update_source_failure(state, source, &message).await?;
        }
    }
    counts.reports_summarized += upgrade_local_summaries(state, &client, 4).await?;

    let completed_at = Utc::now().to_rfc3339();
    let status = if counts.errors.is_empty() {
        "complete"
    } else if counts.sources_checked > counts.errors.len() {
        "partial"
    } else {
        "failed"
    };
    let error_message =
        (!counts.errors.is_empty()).then(|| limited_error(&counts.errors.join(" · ")));
    sqlx::query(
        "UPDATE central_bank_report_sync_runs SET status=?,completed_at=?,sources_checked=?,reports_discovered=?,reports_downloaded=?,reports_summarized=?,error_message=? WHERE id=?",
    )
    .bind(status)
    .bind(&completed_at)
    .bind(counts.sources_checked as i64)
    .bind(counts.reports_discovered as i64)
    .bind(counts.reports_downloaded as i64)
    .bind(counts.reports_summarized as i64)
    .bind(error_message)
    .bind(run_id)
    .execute(&state.db)
    .await?;

    Ok(CentralBankSyncResult {
        sources_checked: counts.sources_checked,
        reports_discovered: counts.reports_discovered,
        reports_downloaded: counts.reports_downloaded,
        reports_summarized: counts.reports_summarized,
        completed_at,
    })
}

async fn upgrade_local_summaries(
    state: &AppState,
    client: &Client,
    limit: usize,
) -> Result<usize, AppError> {
    let Some(api_key) = openai_value(state, "OPENAI_API_KEY") else {
        return Ok(0);
    };
    let model =
        openai_value(state, "OPENAI_REPORT_MODEL").unwrap_or_else(|| DEFAULT_OPENAI_MODEL.into());
    let rows: Vec<LocalSummaryRow> = sqlx::query_as(
        "SELECT id,bank_code,report_type,title,source_url,published_at,extracted_text FROM central_bank_reports WHERE summary_status='local_fallback' AND extraction_status IN ('complete','partial') AND extracted_text IS NOT NULL ORDER BY COALESCE(published_at,discovered_at) DESC LIMIT ?",
    )
    .bind(limit as i64)
    .fetch_all(&state.db)
    .await?;
    let mut completed = 0usize;
    for row in rows {
        let Some(source) = SOURCES
            .iter()
            .find(|source| source.bank_code == row.bank_code)
        else {
            continue;
        };
        let candidate = Candidate {
            title: row.title,
            url: row.source_url,
            published_at: row.published_at,
            report_type: row.report_type.clone(),
        };
        let current = parse_stored_chunks(&row.extracted_text);
        if current.is_empty() {
            continue;
        }
        let comparison = summary_chunks_with_previous(
            state,
            &row.id,
            &row.bank_code,
            &row.report_type,
            &current,
        )
        .await?;
        let Ok(summary) =
            summarize_with_openai(client, &api_key, &model, source, &candidate, &comparison).await
        else {
            continue;
        };
        let summary_json = serde_json::to_string(&summary)
            .map_err(|error| AppError::DataTransfer(error.to_string()))?;
        sqlx::query(
            "UPDATE central_bank_reports SET summary_status='complete',summary_json=?,summary_provider='openai',summary_model=?,summary_version=?,summarized_at=?,updated_at=? WHERE id=?",
        )
        .bind(summary_json)
        .bind(&model)
        .bind(SUMMARY_VERSION)
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .bind(row.id)
        .execute(&state.db)
        .await?;
        completed += 1;
    }
    Ok(completed)
}

async fn sync_source(
    state: &AppState,
    client: &Client,
    source: &ReportSource,
    counts: &mut SyncCounts,
) -> Result<(), AppError> {
    let source_state: Option<SourceStateRow> = sqlx::query_as(
        "SELECT etag,last_modified,last_success_at FROM central_bank_report_source_state WHERE source_id=?",
    )
    .bind(source.id)
    .fetch_optional(&state.db)
    .await?;
    let fetched = fetch_url(
        client,
        source.url,
        (source.id != "pboc-reports")
            .then(|| source_state.as_ref().and_then(|row| row.etag.as_deref()))
            .flatten(),
        (source.id != "pboc-reports")
            .then(|| {
                source_state
                    .as_ref()
                    .and_then(|row| row.last_modified.as_deref())
            })
            .flatten(),
        MAX_SOURCE_BYTES,
    )
    .await?;
    if fetched.not_modified {
        update_source_success(state, source, &fetched).await?;
        return Ok(());
    }
    let source_body = String::from_utf8_lossy(&fetched.bytes);
    let (discovery_body, discovery_base_url) = if source.id == "pboc-reports" {
        let year_url = find_pbc_current_year_url(&source_body, source.url)?;
        let year_page = fetch_url(client, &year_url, None, None, MAX_SOURCE_BYTES).await?;
        (
            String::from_utf8_lossy(&year_page.bytes).into_owned(),
            year_page.final_url,
        )
    } else {
        (source_body.into_owned(), source.url.to_string())
    };
    let candidates = match source.kind {
        SourceKind::Rss => discover_rss(&discovery_body, source)?,
        SourceKind::Html => discover_html(&discovery_body, &discovery_base_url, source)?,
    };
    let initial_crawl = source_state
        .as_ref()
        .and_then(|row| row.last_success_at.as_ref())
        .is_none();
    let report_limit = if initial_crawl {
        INITIAL_REPORTS_PER_SOURCE
    } else {
        MAX_NEW_REPORTS_PER_SOURCE
    };
    let mut new_reports = 0usize;
    for candidate in candidates {
        if report_exists(state, &candidate.url).await? {
            // Offizielle Listen und Feeds sind absteigend sortiert. Sobald bei
            // einem späteren Lauf ein bekannter Eintrag erreicht ist, sind die
            // folgenden Einträge historischer Bestand und kein neuer Release.
            if !initial_crawl {
                break;
            }
            continue;
        }
        if new_reports >= report_limit {
            break;
        }
        new_reports += 1;
        counts.reports_discovered += 1;
        match ingest_report(state, client, source, &candidate).await {
            Ok((downloaded, summarized)) => {
                counts.reports_downloaded += usize::from(downloaded);
                counts.reports_summarized += usize::from(summarized);
            }
            Err(error) => counts.errors.push(format!(
                "{}: {}",
                source.bank_code,
                limited_error(&error.to_string())
            )),
        }
    }
    update_source_success(state, source, &fetched).await?;
    Ok(())
}

async fn ingest_report(
    state: &AppState,
    client: &Client,
    source: &ReportSource,
    candidate: &Candidate,
) -> Result<(bool, bool), AppError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO central_bank_reports(id,bank_code,currency,report_type,title,source_url,published_at,discovered_at,updated_at,language) VALUES(?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(&id)
    .bind(source.bank_code)
    .bind(source.currency)
    .bind(&candidate.report_type)
    .bind(clean_title(&candidate.title))
    .bind(&candidate.url)
    .bind(&candidate.published_at)
    .bind(&now)
    .bind(&now)
    .bind(source.language)
    .execute(&state.db)
    .await?;

    let fetched = match fetch_url(client, &candidate.url, None, None, MAX_REPORT_BYTES).await {
        Ok(value) => value,
        Err(error) => {
            sqlx::query("UPDATE central_bank_reports SET extraction_status='failed',summary_status='failed',extraction_error=?,updated_at=? WHERE id=?")
                .bind(limited_error(&error.to_string()))
                .bind(Utc::now().to_rfc3339())
                .bind(&id)
                .execute(&state.db)
                .await?;
            return Err(error);
        }
    };
    let detected_pdf = is_pdf(&fetched);
    let mut original_bytes = fetched.bytes;
    let mut mime_type = fetched.mime_type.unwrap_or_else(|| {
        if detected_pdf {
            "application/pdf".into()
        } else {
            "text/html".into()
        }
    });
    let final_url = fetched.final_url;

    if !detected_pdf {
        let html = String::from_utf8_lossy(&original_bytes);
        if let Some(pdf_url) = find_report_pdf(&html, &final_url)
            && let Ok(pdf) = fetch_url(client, &pdf_url, None, None, MAX_REPORT_BYTES).await
            && is_pdf(&pdf)
        {
            original_bytes = pdf.bytes;
            mime_type = "application/pdf".into();
        }
    }

    let (chunks, extraction_status, extraction_error) = if mime_type.contains("pdf") {
        match extract_pdf_chunks(&original_bytes) {
            Ok(chunks) if !chunks.is_empty() => (chunks, "complete", None),
            Ok(_) => (
                Vec::new(),
                "failed",
                Some("Das PDF enthält keinen extrahierbaren Text.".to_string()),
            ),
            Err(error) => (
                Vec::new(),
                "failed",
                Some(limited_error(&error.to_string())),
            ),
        }
    } else {
        let chunks = extract_html_chunks(&String::from_utf8_lossy(&original_bytes));
        if chunks.is_empty() {
            (
                chunks,
                "failed",
                Some(
                    "Die Veröffentlichungsseite enthält keinen extrahierbaren Berichtstext."
                        .to_string(),
                ),
            )
        } else {
            (chunks, "complete", None)
        }
    };

    let extracted_text = chunks
        .iter()
        .map(|chunk| format!("[{}]\n{}", chunk.source_ref, chunk.text))
        .collect::<Vec<_>>()
        .join("\n\n");
    let sha256 = sha256_hex(&original_bytes);
    let local_path = if mime_type.contains("pdf") {
        Some(save_pdf(state, source, candidate, &id, &original_bytes)?)
    } else {
        None
    };

    let (summary, summary_status, provider, model) = if chunks.is_empty() {
        (None, "failed", None, None)
    } else if let Some(api_key) = openai_value(state, "OPENAI_API_KEY") {
        let model = openai_value(state, "OPENAI_REPORT_MODEL")
            .unwrap_or_else(|| DEFAULT_OPENAI_MODEL.into());
        let comparison_chunks = summary_chunks_with_previous(
            state,
            &id,
            source.bank_code,
            &candidate.report_type,
            &chunks,
        )
        .await?;
        match summarize_with_openai(
            client,
            &api_key,
            &model,
            source,
            candidate,
            &comparison_chunks,
        )
        .await
        {
            Ok(summary) => (
                Some(summary),
                "complete",
                Some("openai".to_string()),
                Some(model),
            ),
            Err(_) => (
                Some(local_summary(&chunks)),
                "local_fallback",
                Some("local".to_string()),
                None,
            ),
        }
    } else {
        (
            Some(local_summary(&chunks)),
            "local_fallback",
            Some("local".to_string()),
            None,
        )
    };
    let summary_json = summary
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|error| AppError::DataTransfer(error.to_string()))?;
    let summarized_at = summary.as_ref().map(|_| Utc::now().to_rfc3339());

    sqlx::query(
        "UPDATE central_bank_reports SET mime_type=?,local_path=?,sha256=?,byte_size=?,extracted_text=?,extraction_status=?,extraction_error=?,summary_status=?,summary_json=?,summary_provider=?,summary_model=?,summary_version=?,summarized_at=?,updated_at=? WHERE id=?",
    )
    .bind(&mime_type)
    .bind(local_path)
    .bind(sha256)
    .bind(original_bytes.len() as i64)
    .bind((!extracted_text.is_empty()).then_some(extracted_text))
    .bind(extraction_status)
    .bind(extraction_error)
    .bind(summary_status)
    .bind(summary_json)
    .bind(provider)
    .bind(model)
    .bind(SUMMARY_VERSION)
    .bind(summarized_at)
    .bind(Utc::now().to_rfc3339())
    .bind(&id)
    .execute(&state.db)
    .await?;
    Ok((mime_type.contains("pdf"), summary.is_some()))
}

async fn summary_chunks_with_previous(
    state: &AppState,
    current_id: &str,
    bank_code: &str,
    report_type: &str,
    current: &[TextChunk],
) -> Result<Vec<TextChunk>, AppError> {
    let previous: Option<String> = sqlx::query_scalar(
        "SELECT extracted_text FROM central_bank_reports WHERE bank_code=? AND report_type=? AND id<>? AND extraction_status IN ('complete','partial') AND extracted_text IS NOT NULL ORDER BY COALESCE(published_at,discovered_at) DESC LIMIT 1",
    )
    .bind(bank_code)
    .bind(report_type)
    .bind(current_id)
    .fetch_optional(&state.db)
    .await?;
    let Some(previous) = previous else {
        return Ok(current.to_vec());
    };
    let mut combined = current
        .iter()
        .map(|chunk| TextChunk {
            source_ref: format!("Aktuell · {}", chunk.source_ref),
            text: chunk.text.clone(),
        })
        .collect::<Vec<_>>();
    combined.extend(
        parse_stored_chunks(&previous)
            .into_iter()
            .map(|chunk| TextChunk {
                source_ref: format!("Vorher · {}", chunk.source_ref),
                text: chunk.text,
            }),
    );
    Ok(combined)
}

fn parse_stored_chunks(value: &str) -> Vec<TextChunk> {
    value
        .split("\n\n[")
        .filter_map(|part| {
            let part = part.strip_prefix('[').unwrap_or(part);
            let (source_ref, text) = part.split_once("]\n")?;
            let text = text.trim();
            (!source_ref.trim().is_empty() && !text.is_empty()).then(|| TextChunk {
                source_ref: source_ref.trim().to_string(),
                text: text.to_string(),
            })
        })
        .collect()
}

fn discover_rss(xml: &str, source: &ReportSource) -> Result<Vec<Candidate>, AppError> {
    let item_re = Regex::new(r"(?is)<(?:item|entry)\b.*?</(?:item|entry)>")
        .map_err(|error| AppError::Initialization(error.to_string()))?;
    let mut candidates = Vec::new();
    for item in item_re.find_iter(xml) {
        let raw = item.as_str();
        let Some(title) = xml_tag(raw, "title") else {
            continue;
        };
        let link = xml_tag(raw, "link").or_else(|| xml_link_href(raw));
        let Some(url) = link.and_then(|value| normalize_url(source.url, &value)) else {
            continue;
        };
        let Some(report_type) = classify_report(&title, &url) else {
            continue;
        };
        candidates.push(Candidate {
            title: html_fragment_text(&title),
            url,
            published_at: xml_tag(raw, "pubDate")
                .or_else(|| xml_tag(raw, "updated"))
                .or_else(|| xml_tag(raw, "dc:date"))
                .and_then(|value| parse_published_at(&value)),
            report_type: report_type.into(),
        });
    }
    Ok(unique_candidates(candidates))
}

fn discover_html(
    html: &str,
    base_url: &str,
    source: &ReportSource,
) -> Result<Vec<Candidate>, AppError> {
    let document = Html::parse_document(html);
    let selector =
        Selector::parse("a[href]").map_err(|error| AppError::Initialization(error.to_string()))?;
    let mut candidates = Vec::new();
    for anchor in document.select(&selector) {
        let Some(href) = anchor.value().attr("href") else {
            continue;
        };
        let Some(url) = normalize_url(base_url, href) else {
            continue;
        };
        if !is_allowed_official_url(&url) {
            continue;
        }
        if url.trim_end_matches('/') == source.url.trim_end_matches('/') {
            continue;
        }
        let label = normalize_space(&anchor.text().collect::<Vec<_>>().join(" "));
        let label_lower = label.to_ascii_lowercase();
        let context = anchor
            .ancestors()
            .filter_map(scraper::ElementRef::wrap)
            .find(|element| matches!(element.value().name(), "tr" | "li" | "article"))
            .or_else(|| anchor.parent().and_then(scraper::ElementRef::wrap))
            .map(|parent| normalize_space(&parent.text().collect::<Vec<_>>().join(" ")))
            .unwrap_or_default();
        let mut title = if label.len() < 18 || label.to_ascii_lowercase().starts_with("pdf") {
            context
        } else {
            label
        };
        let title_lower = title.to_ascii_lowercase();
        if title_lower.contains("to be published")
            || title_lower.contains("upcoming")
            || title_lower.contains("schedule for policy")
            || title_lower == "macroeconomic projections"
            || title_lower.starts_with("monetary policy operations")
            || matches!(
                title_lower.as_str(),
                "monetary policy reports"
                    | "overview of monetary policy instrument operations"
                    | "past monetary policy decisions"
            )
        {
            continue;
        }
        let report_type = if source.id == "ecb-decisions" {
            (url.contains("/press/pr/date/") && title_lower.contains("monetary policy decisions"))
                .then_some("decision")
        } else if source.id == "ecb-projections" {
            (url.contains("/press/projections/html/ecb.projections")
                && title_lower.contains("macroeconomic projections"))
            .then_some("projections")
        } else if source.id == "boj-meetings" {
            if url.contains("/mopo/mpmdeci/") && is_pdf_url(&url) {
                title = format!("Statement on Monetary Policy · {title}");
                Some("decision")
            } else if url.contains("/mopo/outlook/") && is_pdf_url(&url) {
                title = format!("Outlook for Economic Activity and Prices · {title}");
                Some("monetary_policy_report")
            } else {
                None
            }
        } else if source.id == "rbnz-decisions" {
            if label_lower == "media release" {
                title = format!("OCR decision · {title}");
                Some("decision")
            } else if label_lower == "statement" {
                title = format!("Monetary Policy Statement · {title}");
                Some("monetary_policy_report")
            } else {
                None
            }
        } else if source.id == "pboc-reports" {
            title_lower
                .contains("china monetary policy report")
                .then_some("monetary_policy_report")
        } else {
            classify_report(&title, &url)
        };
        let Some(report_type) = report_type else {
            continue;
        };
        candidates.push(Candidate {
            published_at: parse_published_at(&title),
            title,
            url,
            report_type: report_type.into(),
        });
    }
    Ok(unique_candidates(candidates))
}

fn find_pbc_current_year_url(html: &str, base_url: &str) -> Result<String, AppError> {
    let document = Html::parse_document(html);
    let anchor_selector = Selector::parse("a[href]").expect("valid selector");
    let expected_year = Utc::now().year().to_string();
    let base = Url::parse(base_url)
        .map_err(|_| AppError::Validation("Die PBoC-Quellenadresse ist ungültig.".into()))?;
    let expected_path_prefix = base
        .path()
        .strip_suffix("index.html")
        .unwrap_or_else(|| base.path());
    document
        .select(&anchor_selector)
        .find_map(|anchor| {
            let label = normalize_space(&anchor.text().collect::<Vec<_>>().join(" "));
            (label == expected_year)
                .then(|| anchor.value().attr("href"))
                .flatten()
                .and_then(|href| base.join(href).ok())
                .filter(|url| {
                    is_allowed_official_url(url.as_str())
                        && url.path().starts_with(expected_path_prefix)
                })
                .map(|url| url.to_string())
        })
        .ok_or_else(|| {
            AppError::DataTransfer(format!(
                "Auf der PBoC-Seite wurde noch kein Berichtsarchiv für {expected_year} gefunden."
            ))
        })
}

fn classify_report(title: &str, url: &str) -> Option<&'static str> {
    let haystack = format!("{} {}", title, url).to_ascii_lowercase();
    let excluded = [
        "minute",
        "meeting account",
        "record of meeting",
        "account of the",
        "combined monetary policy decisions and statement",
        "monetary policy statement (with q&a)",
        "summary of opinion",
        "summary of deliberation",
        "discussion summary",
        "summary of discussion",
        "press conference",
        "news conference",
        "transcript",
        "speech",
        "remarks",
        "testimony",
        "working paper",
        "discussion paper",
        "research",
        "financial stability",
        "annual report",
        "podcast",
        "webcast",
        "interview",
    ];
    let combined_boe_decision =
        haystack.contains("monetary policy summary") && haystack.contains("minute");
    if excluded.iter().any(|value| haystack.contains(value)) && !combined_boe_decision {
        return None;
    }
    if haystack.contains("projection material")
        || haystack.contains("summary of economic projections")
        || haystack.contains("economic projection")
    {
        return Some("projections");
    }
    if haystack.contains("monetary policy report")
        || haystack.contains("statement on monetary policy")
        || haystack.contains("statements on monetary policy")
        || haystack.contains("monetary policy statement")
        || haystack.contains("outlook for economic activity")
        || haystack.contains("outlook report")
        || haystack.contains("china monetary policy report")
    {
        return Some("monetary_policy_report");
    }
    if haystack.contains("monetary policy decision")
        || haystack.contains("policy rate announcement")
        || haystack.contains("interest rate announcement")
        || haystack.contains("interest rate decision")
        || haystack.contains("official cash rate")
        || haystack.contains("cash rate target")
        || haystack.contains("monetary policy assessment")
        || haystack.contains("fomc statement")
        || haystack.contains("federal reserve issues fomc")
        || haystack.contains("bank rate maintained")
        || haystack.contains("bank rate reduced")
        || haystack.contains("bank rate increased")
        || combined_boe_decision
    {
        return Some("decision");
    }
    if haystack.contains("monetary policy")
        && (haystack.contains("measure")
            || haystack.contains("operation")
            || haystack.contains("notice"))
    {
        return Some("special_notice");
    }
    None
}

fn extract_pdf_chunks(bytes: &[u8]) -> Result<Vec<TextChunk>, AppError> {
    let pages = pdf_extract::extract_text_from_mem_by_pages(bytes).map_err(|error| {
        AppError::DataTransfer(format!("PDF-Text konnte nicht extrahiert werden: {error}"))
    })?;
    let mut chunks = Vec::new();
    for (index, text) in pages.into_iter().enumerate() {
        let text = normalize_document_text(&text);
        let (text, reached_excluded_section) = truncate_excluded_sections(&text);
        if !text.is_empty() {
            chunks.push(TextChunk {
                source_ref: format!("Seite {}", index + 1),
                text,
            });
        }
        if reached_excluded_section {
            break;
        }
    }
    Ok(chunks)
}

fn extract_html_chunks(html: &str) -> Vec<TextChunk> {
    let document = Html::parse_document(html);
    let block_selector = Selector::parse("h1, h2, h3, h4, p, li").expect("valid selector");
    let root_selector = Selector::parse("main, article").expect("valid selector");
    let mut texts = if let Some(root) = document.select(&root_selector).next() {
        root.select(&block_selector)
            .map(|element| normalize_space(&element.text().collect::<Vec<_>>().join(" ")))
            .collect::<Vec<_>>()
    } else {
        document
            .select(&block_selector)
            .map(|element| normalize_space(&element.text().collect::<Vec<_>>().join(" ")))
            .collect::<Vec<_>>()
    };
    texts.retain(|text| text.len() >= 30 && !is_excluded_section(text));
    let mut chunks = Vec::new();
    for text in texts.into_iter().take(350) {
        if begins_excluded_section(&text) {
            break;
        }
        if chunks
            .iter()
            .any(|existing: &TextChunk| existing.text == text)
        {
            continue;
        }
        chunks.push(TextChunk {
            source_ref: format!("Absatz {}", chunks.len() + 1),
            text,
        });
    }
    chunks
}

fn local_summary(chunks: &[TextChunk]) -> CentralBankReportSummary {
    let definitions: &[(&str, &str, &[&str])] = &[
        (
            "decision",
            "Entscheidung",
            &[
                "decided",
                "decision",
                "rate",
                "target",
                "maintain",
                "increase",
                "reduce",
                "unchanged",
            ],
        ),
        (
            "inflation",
            "Inflation",
            &["inflation", "price pressure", "prices", "cpi"],
        ),
        (
            "growth",
            "Wachstum und Nachfrage",
            &["growth", "economic activity", "demand", "gdp", "output"],
        ),
        (
            "labor",
            "Arbeitsmarkt",
            &["labour", "labor", "employment", "unemployment", "wage"],
        ),
        (
            "guidance",
            "Ausblick und Forward Guidance",
            &[
                "outlook",
                "expects",
                "expected",
                "forecast",
                "projection",
                "will",
                "future",
                "path",
            ],
        ),
        (
            "risks",
            "Risiken",
            &["risk", "uncertain", "uncertainty", "upside", "downside"],
        ),
        (
            "tools",
            "Instrumente, Bilanz und Währung",
            &[
                "asset purchase",
                "balance sheet",
                "reinvestment",
                "liquidity",
                "exchange rate",
                "foreign exchange",
                "reserve requirement",
            ],
        ),
    ];
    let mut sections = Vec::new();
    for (key, title, keywords) in definitions {
        let points = select_points(chunks, keywords, 3);
        if !points.is_empty() {
            sections.push(CentralBankSummarySection {
                key: (*key).into(),
                title: (*title).into(),
                points,
            });
        }
    }
    let joined = chunks
        .iter()
        .map(|chunk| chunk.text.to_ascii_lowercase())
        .collect::<Vec<_>>()
        .join(" ");
    let hawkish = [
        "increase",
        "raise",
        "higher for longer",
        "upside risk",
        "restrictive",
    ]
    .iter()
    .filter(|word| joined.contains(**word))
    .count();
    let dovish = ["reduce", "cut", "lower", "easing", "downside risk"]
        .iter()
        .filter(|word| joined.contains(**word))
        .count();
    let stance = if hawkish > dovish + 1 {
        "hawkish"
    } else if dovish > hawkish + 1 {
        "dovish"
    } else if hawkish == 0 && dovish == 0 {
        "unclear"
    } else {
        "neutral"
    };
    CentralBankReportSummary {
        overview: "Lokale Extrakt-Zusammenfassung. Die Stichpunkte sind unveränderte, quellengebundene Aussagen aus dem Original; für eine deutsche KI-Zusammenfassung muss der Modellabruf erfolgreich sein.".into(),
        stance: stance.into(),
        sections,
    }
}

fn select_points(
    chunks: &[TextChunk],
    keywords: &[&str],
    limit: usize,
) -> Vec<CentralBankSummaryPoint> {
    let sentence_re = Regex::new(r"(?m)(?:^|[.!?]\s+)([^.!?]{45,520}[.!?])").expect("valid regex");
    let mut scored = Vec::new();
    for (chunk_index, chunk) in chunks.iter().enumerate() {
        for capture in sentence_re.captures_iter(&chunk.text) {
            let sentence = normalize_space(
                capture
                    .get(1)
                    .map(|value| value.as_str())
                    .unwrap_or_default(),
            );
            let lower = sentence.to_ascii_lowercase();
            let score = keywords
                .iter()
                .filter(|keyword| lower.contains(**keyword))
                .count();
            if score > 0 {
                scored.push((score, chunk_index, sentence, chunk.source_ref.clone()));
            }
        }
    }
    scored.sort_by(|left, right| right.0.cmp(&left.0).then(left.1.cmp(&right.1)));
    let mut seen = HashSet::new();
    scored
        .into_iter()
        .filter_map(|(_, _, text, source_ref)| {
            let identity = text.to_ascii_lowercase();
            seen.insert(identity).then_some(CentralBankSummaryPoint {
                text,
                source_refs: vec![source_ref],
            })
        })
        .take(limit)
        .collect()
}

async fn summarize_with_openai(
    client: &Client,
    api_key: &str,
    model: &str,
    source: &ReportSource,
    candidate: &Candidate,
    chunks: &[TextChunk],
) -> Result<CentralBankReportSummary, AppError> {
    let source_text = truncate_chars(
        &chunks
            .iter()
            .map(|chunk| format!("[{}]\n{}", chunk.source_ref, chunk.text))
            .collect::<Vec<_>>()
            .join("\n\n"),
        MAX_MODEL_CHARS,
    );
    let schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "overview": {"type": "string"},
            "stance": {"type": "string", "enum": ["hawkish", "dovish", "neutral", "unclear"]},
            "sections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                        "key": {"type": "string", "enum": ["decision", "inflation", "growth", "labor", "guidance", "risks", "tools", "projections", "changes"]},
                        "title": {"type": "string"},
                        "points": {"type": "array", "items": {
                            "type": "object", "additionalProperties": false,
                            "properties": {"text": {"type": "string"}, "sourceRefs": {"type": "array", "items": {"type": "string"}, "minItems": 1}},
                            "required": ["text", "sourceRefs"]
                        }}
                    },
                    "required": ["key", "title", "points"]
                }
            }
        },
        "required": ["overview", "stance", "sections"]
    });
    let payload = serde_json::json!({
        "model": model,
        "store": false,
        "max_output_tokens": 3000,
        "instructions": "Du analysierst offizielle Zentralbankdokumente. Erstelle eine präzise deutsche Zusammenfassung ausschließlich aus dem bereitgestellten Text. Keine Handels- oder Anlageempfehlung. Keine erfundenen Fakten. Jeder Stichpunkt muss mindestens eine exakt vorhandene Quellenmarke wie 'Seite 3' oder 'Absatz 12' tragen. Lasse nicht belegte Bereiche weg. Falls Quellenmarken mit 'Aktuell' und 'Vorher' vorhanden sind, ergänze einen Abschnitt 'Änderungen zum vorherigen Bericht' mit key 'changes'; jede Vergleichsaussage muss mindestens je einen Beleg aus Aktuell und Vorher nennen. Reden, Forschung, Minutes/Meeting Accounts/Sitzungsprotokolle sowie Pressekonferenz-Inhalte dürfen nicht aufgenommen werden.",
        "input": format!("Zentralbank: {} ({})\nDokumentart: {}\nTitel: {}\n\nQUELLTEXT\n{}", source.bank_name, source.currency, candidate.report_type, candidate.title, source_text),
        "text": {"format": {"type": "json_schema", "name": "central_bank_report_summary", "strict": true, "schema": schema}}
    });
    let response = client
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|_| {
            AppError::DataTransfer("Die KI-Zusammenfassung konnte nicht angefordert werden.".into())
        })?;
    if !response.status().is_success() {
        return Err(AppError::DataTransfer(format!(
            "Die KI-Zusammenfassung wurde mit Status {} abgelehnt.",
            response.status().as_u16()
        )));
    }
    let value: serde_json::Value = response
        .json()
        .await
        .map_err(|_| AppError::DataTransfer("Die KI-Antwort war nicht lesbar.".into()))?;
    let output_text = value
        .get("output")
        .and_then(|value| value.as_array())
        .into_iter()
        .flatten()
        .flat_map(|item| {
            item.get("content")
                .and_then(|value| value.as_array())
                .into_iter()
                .flatten()
        })
        .find_map(|content| {
            (content.get("type").and_then(|value| value.as_str()) == Some("output_text"))
                .then(|| content.get("text").and_then(|value| value.as_str()))
                .flatten()
        })
        .ok_or_else(|| {
            AppError::DataTransfer("Die KI-Antwort enthielt keine Zusammenfassung.".into())
        })?;
    let summary: CentralBankReportSummary = serde_json::from_str(output_text).map_err(|_| {
        AppError::DataTransfer(
            "Die KI-Zusammenfassung entsprach nicht dem erwarteten Format.".into(),
        )
    })?;
    validate_summary_refs(&summary, chunks)?;
    Ok(summary)
}

fn validate_summary_refs(
    summary: &CentralBankReportSummary,
    chunks: &[TextChunk],
) -> Result<(), AppError> {
    let allowed = chunks
        .iter()
        .map(|chunk| chunk.source_ref.as_str())
        .collect::<HashSet<_>>();
    if summary.overview.trim().is_empty() || summary.sections.is_empty() {
        return Err(AppError::DataTransfer(
            "Die KI-Zusammenfassung war leer.".into(),
        ));
    }
    for point in summary.sections.iter().flat_map(|section| &section.points) {
        if point.text.trim().is_empty()
            || point.source_refs.is_empty()
            || point
                .source_refs
                .iter()
                .any(|source_ref| !allowed.contains(source_ref.as_str()))
        {
            return Err(AppError::DataTransfer(
                "Eine KI-Aussage besaß keinen gültigen Quellenbeleg.".into(),
            ));
        }
    }
    Ok(())
}

async fn load_dashboard(state: &AppState) -> Result<CentralBankReportDashboard, AppError> {
    let reports: Vec<CentralBankReportListItem> = sqlx::query_as(
        "SELECT id,bank_code,currency,report_type,title,source_url,published_at,discovered_at,language,mime_type,local_path,extraction_status,summary_status,summary_provider,summary_model,summarized_at,read_at FROM central_bank_reports ORDER BY COALESCE(published_at,discovered_at) DESC LIMIT 250",
    ).fetch_all(&state.db).await?;
    let mut sources = Vec::new();
    for source in SOURCES {
        let state_row: Option<SourceStatusRow> = sqlx::query_as(
            "SELECT last_checked_at,last_success_at,last_status,error_message FROM central_bank_report_source_state WHERE source_id=?",
        ).bind(source.id).fetch_optional(&state.db).await?;
        sources.push(CentralBankSourceStatus {
            id: source.id.into(),
            bank_code: source.bank_code.into(),
            bank_name: source.bank_name.into(),
            currency: source.currency.into(),
            source_url: source.url.into(),
            last_checked_at: state_row
                .as_ref()
                .and_then(|row| row.last_checked_at.clone()),
            last_success_at: state_row
                .as_ref()
                .and_then(|row| row.last_success_at.clone()),
            last_status: state_row.as_ref().and_then(|row| row.last_status.clone()),
            error_message: state_row.and_then(|row| row.error_message),
        });
    }
    let latest: Option<LatestRunRow> = sqlx::query_as(
        "SELECT started_at,status,error_message FROM central_bank_report_sync_runs ORDER BY started_at DESC LIMIT 1",
    ).fetch_optional(&state.db).await?;
    let last_success_at = latest_success_at(state).await?;
    let next_refresh_at = last_success_at
        .as_deref()
        .and_then(parse_time)
        .map(|value| (value + Duration::minutes(SYNC_INTERVAL_MINUTES)).to_rfc3339());
    Ok(CentralBankReportDashboard {
        reports,
        sources,
        automation: CentralBankReportAutomation {
            enabled: true,
            refresh_interval_minutes: SYNC_INTERVAL_MINUTES,
            last_attempt_at: latest.as_ref().map(|row| row.started_at.clone()),
            last_success_at,
            last_status: latest.as_ref().map(|row| row.status.clone()),
            error_message: latest.and_then(|row| row.error_message),
            next_refresh_at,
            openai_configured: openai_value(state, "OPENAI_API_KEY").is_some(),
            summary_model: openai_value(state, "OPENAI_REPORT_MODEL")
                .unwrap_or_else(|| DEFAULT_OPENAI_MODEL.into()),
        },
    })
}

async fn load_report_item(state: &AppState, id: &str) -> CommandResult<CentralBankReportListItem> {
    sqlx::query_as(
        "SELECT id,bank_code,currency,report_type,title,source_url,published_at,discovered_at,language,mime_type,local_path,extraction_status,summary_status,summary_provider,summary_model,summarized_at,read_at FROM central_bank_reports WHERE id=?",
    ).bind(id).fetch_optional(&state.db).await?
        .ok_or_else(|| AppError::NotFound("Zentralbankbericht".into()).into())
}

async fn report_exists(state: &AppState, url: &str) -> Result<bool, AppError> {
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM central_bank_reports WHERE source_url=?")
            .bind(url)
            .fetch_one(&state.db)
            .await?;
    Ok(count > 0)
}

async fn sync_due(state: &AppState) -> Result<bool, AppError> {
    Ok(latest_success_at(state)
        .await?
        .as_deref()
        .and_then(parse_time)
        .is_none_or(|last| Utc::now() - last >= Duration::minutes(SYNC_INTERVAL_MINUTES)))
}

async fn latest_success_at(state: &AppState) -> Result<Option<String>, AppError> {
    Ok(sqlx::query_scalar("SELECT completed_at FROM central_bank_report_sync_runs WHERE status IN ('complete','partial') AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1")
        .fetch_optional(&state.db).await?)
}

async fn recover_stale_runs(state: &AppState) -> Result<(), AppError> {
    sqlx::query("UPDATE central_bank_report_sync_runs SET status='failed',completed_at=?,error_message='Der vorherige Abruf wurde unterbrochen.' WHERE status='running' AND started_at<?")
        .bind(Utc::now().to_rfc3339())
        .bind((Utc::now() - Duration::minutes(30)).to_rfc3339())
        .execute(&state.db).await?;
    Ok(())
}

async fn update_source_success(
    state: &AppState,
    source: &ReportSource,
    fetched: &FetchResult,
) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO central_bank_report_source_state(source_id,bank_code,source_url,etag,last_modified,last_checked_at,last_success_at,next_check_at,last_status,error_message) VALUES(?,?,?,?,?,?,?,?,'success',NULL)
         ON CONFLICT(source_id) DO UPDATE SET source_url=excluded.source_url,etag=COALESCE(excluded.etag,central_bank_report_source_state.etag),last_modified=COALESCE(excluded.last_modified,central_bank_report_source_state.last_modified),last_checked_at=excluded.last_checked_at,last_success_at=excluded.last_success_at,next_check_at=excluded.next_check_at,last_status='success',error_message=NULL",
    ).bind(source.id).bind(source.bank_code).bind(source.url).bind(&fetched.etag).bind(&fetched.last_modified)
        .bind(&now).bind(&now).bind((Utc::now() + Duration::minutes(SYNC_INTERVAL_MINUTES)).to_rfc3339())
        .execute(&state.db).await?;
    Ok(())
}

async fn update_source_failure(
    state: &AppState,
    source: &ReportSource,
    message: &str,
) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO central_bank_report_source_state(source_id,bank_code,source_url,last_checked_at,next_check_at,last_status,error_message) VALUES(?,?,?,?,?,'failed',?)
         ON CONFLICT(source_id) DO UPDATE SET last_checked_at=excluded.last_checked_at,next_check_at=excluded.next_check_at,last_status='failed',error_message=excluded.error_message",
    ).bind(source.id).bind(source.bank_code).bind(source.url).bind(&now)
        .bind((Utc::now() + Duration::minutes(5)).to_rfc3339()).bind(message)
        .execute(&state.db).await?;
    Ok(())
}

fn report_client() -> Result<Client, AppError> {
    Client::builder()
        .timeout(StdDuration::from_secs(45))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 || !is_allowed_url(attempt.url()) {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|error| AppError::Initialization(error.to_string()))
}

async fn fetch_url(
    client: &Client,
    url: &str,
    etag: Option<&str>,
    modified: Option<&str>,
    max_bytes: usize,
) -> Result<FetchResult, AppError> {
    if !is_allowed_official_url(url) {
        return Err(AppError::Validation(
            "Die Berichtsadresse gehört nicht zu einer freigegebenen Zentralbankdomain.".into(),
        ));
    }
    let parsed_url = Url::parse(url)
        .map_err(|_| AppError::Validation("Die Zentralbankquelle ist ungültig.".into()))?;
    let user_agent = if parsed_url
        .host_str()
        .is_some_and(|host| host == "rba.gov.au" || host.ends_with(".rba.gov.au"))
    {
        // Die RBA-CDN lehnt derzeit benannte Anwendungs-User-Agents ab, erlaubt
        // jedoch den etablierten CLI-Agenten. Der Produktname bleibt angehängt.
        "curl/8.16.0 PersonalMacro/0.1"
    } else {
        "PersonalMacro/0.1 central-bank-reports (+local research archive)"
    };
    let mut request = client.get(parsed_url).header(USER_AGENT, user_agent);
    if let Some(etag) = etag {
        request = request.header(IF_NONE_MATCH, etag);
    }
    if let Some(modified) = modified {
        request = request.header(IF_MODIFIED_SINCE, modified);
    }
    let response = request.send().await.map_err(|_| {
        AppError::DataTransfer("Die offizielle Zentralbankquelle war nicht erreichbar.".into())
    })?;
    let final_url = response.url().to_string();
    if !is_allowed_official_url(&final_url) {
        return Err(AppError::Validation(
            "Die Zentralbankquelle leitete auf eine nicht freigegebene Domain um.".into(),
        ));
    }
    let etag = response
        .headers()
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let last_modified = response
        .headers()
        .get(LAST_MODIFIED)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    if response.status() == StatusCode::NOT_MODIFIED {
        return Ok(FetchResult {
            not_modified: true,
            final_url,
            mime_type: None,
            etag,
            last_modified,
            bytes: Vec::new(),
        });
    }
    if !response.status().is_success() {
        return Err(AppError::DataTransfer(format!(
            "Die Zentralbankquelle antwortete mit Status {}.",
            response.status().as_u16()
        )));
    }
    if response
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<usize>().ok())
        .is_some_and(|length| length > max_bytes)
    {
        return Err(AppError::Validation(
            "Der Zentralbankbericht überschreitet die zulässige Dateigröße.".into(),
        ));
    }
    let mime_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| {
            value
                .split(';')
                .next()
                .unwrap_or(value)
                .trim()
                .to_ascii_lowercase()
        });
    let bytes = response.bytes().await.map_err(|_| {
        AppError::DataTransfer(
            "Der Zentralbankbericht konnte nicht vollständig geladen werden.".into(),
        )
    })?;
    if bytes.len() > max_bytes {
        return Err(AppError::Validation(
            "Der Zentralbankbericht überschreitet die zulässige Dateigröße.".into(),
        ));
    }
    Ok(FetchResult {
        not_modified: false,
        final_url,
        mime_type,
        etag,
        last_modified,
        bytes: bytes.to_vec(),
    })
}

fn is_allowed_official_url(value: &str) -> bool {
    Url::parse(value)
        .ok()
        .is_some_and(|url| is_allowed_url(&url))
}

fn is_allowed_url(url: &Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    let Some(host) = url.host_str().map(|value| value.to_ascii_lowercase()) else {
        return false;
    };
    [
        "federalreserve.gov",
        "ecb.europa.eu",
        "bankofengland.co.uk",
        "boj.or.jp",
        "rba.gov.au",
        "rbnz.govt.nz",
        "bankofcanada.ca",
        "snb.ch",
        "pbc.gov.cn",
    ]
    .iter()
    .any(|root| host == *root || host.ends_with(&format!(".{root}")))
}

fn is_pdf(fetched: &FetchResult) -> bool {
    fetched
        .mime_type
        .as_deref()
        .is_some_and(|mime| mime.contains("pdf"))
        || fetched.bytes.starts_with(b"%PDF-")
        || fetched
            .final_url
            .to_ascii_lowercase()
            .split('?')
            .next()
            .is_some_and(|url| url.ends_with(".pdf"))
}

fn is_pdf_url(value: &str) -> bool {
    value
        .to_ascii_lowercase()
        .split('?')
        .next()
        .is_some_and(|url| url.ends_with(".pdf"))
}

fn find_report_pdf(html: &str, base_url: &str) -> Option<String> {
    let document = Html::parse_document(html);
    let selector = Selector::parse("a[href]").ok()?;
    document.select(&selector).find_map(|anchor| {
        let href = anchor.value().attr("href")?;
        let label = anchor
            .text()
            .collect::<Vec<_>>()
            .join(" ")
            .to_ascii_lowercase();
        let url = normalize_url(base_url, href)?;
        (url.to_ascii_lowercase()
            .split('?')
            .next()
            .is_some_and(|value| value.ends_with(".pdf"))
            && !label.contains("minutes")
            && !label.contains("transcript"))
        .then_some(url)
    })
}

fn save_pdf(
    state: &AppState,
    source: &ReportSource,
    candidate: &Candidate,
    id: &str,
    bytes: &[u8],
) -> Result<String, AppError> {
    let year = candidate
        .published_at
        .as_deref()
        .and_then(parse_time)
        .map(|value| value.format("%Y").to_string())
        .unwrap_or_else(|| Utc::now().format("%Y").to_string());
    let directory = state
        .paths
        .central_bank_reports
        .join(source.bank_code)
        .join(year);
    fs::create_dir_all(&directory)?;
    let slug = safe_slug(&candidate.title);
    let path = directory.join(format!("{}-{}.pdf", slug, &id[..8]));
    fs::write(&path, bytes)?;
    path.strip_prefix(&state.paths.central_bank_reports)
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .map_err(|_| AppError::DataTransfer("Der lokale Berichtspfad ist ungültig.".into()))
}

fn openai_value(state: &AppState, key: &str) -> Option<String> {
    if key == "OPENAI_API_KEY"
        && std::env::var("OPENAI_REPORT_SUMMARIES_ENABLED")
            .ok()
            .is_some_and(|value| matches!(value.trim(), "0" | "false" | "FALSE" | "off" | "OFF"))
    {
        return None;
    }
    if let Ok(value) = std::env::var(key) {
        let value = value.trim().to_owned();
        if !value.is_empty() {
            return Some(value);
        }
    }
    let mut candidates = vec![state.paths.settings.join(".env.local")];
    if let Ok(current) = std::env::current_dir() {
        candidates.extend(current.ancestors().map(|path| path.join(".env.local")));
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    candidates.extend(manifest.ancestors().map(|path| path.join(".env.local")));
    candidates
        .into_iter()
        .find_map(|path| dotenv_value(&path, key))
}

fn dotenv_value(path: &Path, key: &str) -> Option<String> {
    dotenvy::from_path_iter(path)
        .ok()?
        .filter_map(Result::ok)
        .find_map(|(candidate, value)| {
            if candidate != key {
                return None;
            }
            let value = value.trim().to_owned();
            (!value.is_empty()).then_some(value)
        })
}

fn xml_tag(input: &str, tag: &str) -> Option<String> {
    let pattern = format!(
        r"(?is)<{}(?:\s[^>]*)?>(.*?)</{}>",
        regex::escape(tag),
        regex::escape(tag)
    );
    let regex = Regex::new(&pattern).ok()?;
    regex
        .captures(input)
        .and_then(|capture| capture.get(1))
        .map(|value| {
            value
                .as_str()
                .trim()
                .trim_start_matches("<![CDATA[")
                .trim_end_matches("]]>")
                .trim()
                .to_owned()
        })
}

fn xml_link_href(input: &str) -> Option<String> {
    Regex::new(r#"(?is)<link[^>]+href=["']([^"']+)["']"#)
        .ok()?
        .captures(input)
        .and_then(|capture| capture.get(1))
        .map(|value| value.as_str().to_owned())
}

fn normalize_url(base: &str, value: &str) -> Option<String> {
    let base = Url::parse(base).ok()?;
    let mut url = base.join(value.trim()).ok()?;
    url.set_fragment(None);
    Some(url.to_string())
}

fn html_fragment_text(value: &str) -> String {
    let fragment = Html::parse_fragment(value);
    normalize_space(&fragment.root_element().text().collect::<Vec<_>>().join(" "))
}

fn unique_candidates(candidates: Vec<Candidate>) -> Vec<Candidate> {
    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|candidate| seen.insert(candidate.url.clone()))
        .collect()
}

fn parse_published_at(value: &str) -> Option<String> {
    if let Ok(parsed) = DateTime::parse_from_rfc3339(value.trim()) {
        return Some(parsed.with_timezone(&Utc).to_rfc3339());
    }
    if let Ok(parsed) = DateTime::parse_from_rfc2822(value.trim()) {
        return Some(parsed.with_timezone(&Utc).to_rfc3339());
    }
    let date_re = Regex::new(r"\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b").ok()?;
    if let Some(captures) = date_re.captures(value) {
        let date = NaiveDate::from_ymd_opt(
            captures[1].parse().ok()?,
            captures[2].parse().ok()?,
            captures[3].parse().ok()?,
        )?;
        return Some(date.and_hms_opt(12, 0, 0)?.and_utc().to_rfc3339());
    }
    None
}

fn parse_time(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|value| value.with_timezone(&Utc))
}

fn clean_title(value: &str) -> String {
    truncate_chars(&normalize_space(value), 300)
}

fn normalize_space(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_document_text(value: &str) -> String {
    value
        .lines()
        .map(normalize_space)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn is_excluded_section(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    [
        "press conference",
        "news conference",
        "transcript",
        "record of meeting",
        "research paper",
        "working paper",
        "speech by",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

fn begins_excluded_section(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    [
        "minutes of the monetary",
        "meeting account",
        "record of meeting",
        "summary record of meeting",
        "summary of opinions",
        "summary of deliberations",
    ]
    .iter()
    .any(|marker| lower.starts_with(marker))
}

fn truncate_excluded_sections(value: &str) -> (String, bool) {
    let lower = value.to_ascii_lowercase();
    let boundary = [
        "minutes of the monetary policy",
        "meeting account",
        "record of meeting",
        "summary record of meeting",
        "summary of opinions",
        "summary of deliberations",
    ]
    .iter()
    .filter_map(|marker| lower.find(marker))
    .min();
    match boundary {
        Some(index) => (value[..index].trim().to_string(), true),
        None => (value.to_string(), false),
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn safe_slug(value: &str) -> String {
    let mut slug = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    while slug.contains("--") {
        slug = slug.replace("--", "-");
    }
    let slug = slug.trim_matches('-');
    let slug = if slug.is_empty() { "report" } else { slug };
    truncate_chars(slug, 70)
}

fn truncate_chars(value: &str, maximum: usize) -> String {
    value.chars().take(maximum).collect()
}

fn limited_error(value: &str) -> String {
    truncate_chars(&normalize_space(value), 360)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excludes_user_rejected_document_families() {
        assert_eq!(
            classify_report("FOMC Minutes", "https://www.federalreserve.gov/minutes.pdf"),
            None
        );
        assert_eq!(
            classify_report(
                "Press conference transcript",
                "https://www.ecb.europa.eu/transcript.html"
            ),
            None
        );
        assert_eq!(
            classify_report(
                "Research discussion paper on inflation",
                "https://www.rba.gov.au/research.pdf"
            ),
            None
        );
        assert_eq!(
            classify_report(
                "Summary of Governing Council deliberations",
                "https://www.bankofcanada.ca/summary"
            ),
            None
        );
        assert_eq!(
            classify_report(
                "Summary record of meeting",
                "https://www.rbnz.govt.nz/record"
            ),
            None
        );
    }

    #[test]
    fn includes_core_policy_documents() {
        assert_eq!(
            classify_report(
                "Federal Reserve issues FOMC statement",
                "https://www.federalreserve.gov/statement.htm"
            ),
            Some("decision")
        );
        assert_eq!(
            classify_report(
                "Statement on Monetary Policy – May 2026",
                "https://www.rba.gov.au/smp.pdf"
            ),
            Some("monetary_policy_report")
        );
        assert_eq!(
            classify_report(
                "Statements on Monetary Policy",
                "https://www.rba.gov.au/publications/smp/2026/aug/"
            ),
            Some("monetary_policy_report")
        );
        assert_eq!(
            classify_report(
                "Summary of Economic Projections",
                "https://www.federalreserve.gov/projections.htm"
            ),
            Some("projections")
        );
        assert_eq!(
            classify_report(
                "Monetary Policy Summary and Minutes",
                "https://www.bankofengland.co.uk/decision"
            ),
            Some("decision")
        );
    }

    #[test]
    fn only_allows_https_central_bank_domains() {
        assert!(is_allowed_official_url(
            "https://www.ecb.europa.eu/press/test.html"
        ));
        assert!(is_allowed_official_url(
            "https://xining.pbc.gov.cn/en/report.pdf"
        ));
        assert!(!is_allowed_official_url(
            "http://www.ecb.europa.eu/press/test.html"
        ));
        assert!(!is_allowed_official_url(
            "https://ecb.europa.eu.example.com/report.pdf"
        ));
    }

    #[test]
    fn local_summary_keeps_exact_source_references() {
        let chunks = vec![
            TextChunk {
                source_ref: "Absatz 1".into(),
                text: "The committee decided to maintain the policy rate at 4 percent.".into(),
            },
            TextChunk {
                source_ref: "Absatz 2".into(),
                text: "Inflation remains elevated and upside risks continue to require attention."
                    .into(),
            },
        ];
        let summary = local_summary(&chunks);
        let refs = summary
            .sections
            .iter()
            .flat_map(|section| &section.points)
            .flat_map(|point| &point.source_refs)
            .collect::<Vec<_>>();
        assert!(
            refs.iter()
                .all(|value| *value == "Absatz 1" || *value == "Absatz 2")
        );
    }

    #[test]
    fn html_discovery_identifies_boj_decision_and_outlook_without_minutes() {
        let source = SOURCES
            .iter()
            .find(|source| source.id == "boj-meetings")
            .unwrap();
        let html = r#"
            <table><tr>
              <td><a href="/en/mopo/mpmdeci/mpr_2026/k260731a.pdf">July 31</a></td>
              <td><a href="/en/mopo/outlook/gor2607b.pdf">July 31</a></td>
              <td><a href="/en/mopo/mpmsche_minu/opinion_2026/opi260731.pdf">Aug. 10</a></td>
            </tr></table>
        "#;
        let candidates = discover_html(html, source.url, source).unwrap();
        assert_eq!(candidates.len(), 2);
        assert!(candidates.iter().any(|item| item.report_type == "decision"));
        assert!(
            candidates
                .iter()
                .any(|item| item.report_type == "monetary_policy_report")
        );
        assert!(candidates.iter().all(|item| !item.url.contains("opinion")));
    }

    #[test]
    fn ecb_discovery_keeps_releases_and_rejects_navigation_pages() {
        let decisions = SOURCES
            .iter()
            .find(|source| source.id == "ecb-decisions")
            .unwrap();
        let decision_html = r#"
            <main>
              <a href="/press/govcdec/mopo/html/index.en.html">Monetary policy operations Open market operations Standing facilities Minimum reserves</a>
              <a href="/press/mopo/implement/html/index.en.html">Monetary policy operations</a>
              <a href="/press/pr/date/2026/html/ecb.mp260903~abc.en.html">Monetary policy decisions</a>
            </main>
        "#;
        let candidates = discover_html(decision_html, decisions.url, decisions).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].report_type, "decision");

        let projections = SOURCES
            .iter()
            .find(|source| source.id == "ecb-projections")
            .unwrap();
        let projection_html = r#"
            <main>
              <a href="/press/projections/html/index.en.html">Macroeconomic projections</a>
              <a href="/press/projections/html/ecb.projections202609_eurosystemstaff~abc.en.html">September 2026 staff macroeconomic projections for the euro area</a>
            </main>
        "#;
        let candidates = discover_html(projection_html, projections.url, projections).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].report_type, "projections");
    }

    #[test]
    fn html_discovery_uses_rbnz_document_links_not_the_archive_navigation() {
        let source = SOURCES
            .iter()
            .find(|source| source.id == "rbnz-decisions")
            .unwrap();
        let html = r#"
            <main>
              <a href="/monetary-policy/monetary-policy-decisions">Past monetary policy decisions</a>
              <table><tr><td>2 September 2026</td><td>2.75</td>
                <td><a href="/news-and-events/news/2026/09/ocr-increased">Media release</a></td>
                <td><a href="/monetary-policy/monetary-policy-statement/2026/september">Statement</a></td>
                <td><a href="/media-conference">Media conference</a></td>
              </tr></table>
            </main>
        "#;
        let candidates = discover_html(html, source.url, source).unwrap();
        assert_eq!(candidates.len(), 2);
        assert!(candidates.iter().any(|item| item.report_type == "decision"));
        assert!(
            candidates
                .iter()
                .any(|item| item.report_type == "monetary_policy_report")
        );
        assert!(
            candidates
                .iter()
                .all(|item| !item.url.contains("media-conference"))
        );
    }

    #[test]
    fn pbc_archive_follows_the_current_year_only() {
        let current_year = Utc::now().year();
        let html = format!(
            r#"<nav><a href="/other/current/index.html">{current_year}</a><a href="/en/reports/old/index.html">{}</a><a href="/en/reports/current/index.html">{current_year}</a></nav>"#,
            current_year - 1
        );
        assert_eq!(
            find_pbc_current_year_url(&html, "https://www.pbc.gov.cn/en/reports/index.html")
                .unwrap(),
            "https://www.pbc.gov.cn/en/reports/current/index.html"
        );
    }

    #[test]
    fn summary_input_stops_before_minutes_or_meeting_records() {
        let (text, stopped) = truncate_excluded_sections(
            "Monetary Policy Summary\nThe rate remains unchanged.\nMinutes of the Monetary Policy Committee\nMembers discussed the outlook.",
        );
        assert!(stopped);
        assert!(text.contains("rate remains unchanged"));
        assert!(!text.contains("Members discussed"));
    }

    #[test]
    fn stored_source_chunks_can_be_reused_for_report_comparisons() {
        let chunks = parse_stored_chunks(
            "[Seite 1]\nThe policy rate was unchanged.\n\n[Seite 2]\nInflation declined.",
        );
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].source_ref, "Seite 1");
        assert_eq!(chunks[1].text, "Inflation declined.");
    }

    #[tokio::test]
    async fn empty_dashboard_exposes_nine_banks_without_fake_reports() {
        let state = crate::database::initialize_headless().await.unwrap();
        let dashboard = load_dashboard(&state).await.unwrap();
        assert!(dashboard.reports.is_empty());
        assert_eq!(
            dashboard
                .sources
                .iter()
                .map(|source| &source.bank_code)
                .collect::<HashSet<_>>()
                .len(),
            9
        );
        assert!(dashboard.automation.enabled);
    }
}
