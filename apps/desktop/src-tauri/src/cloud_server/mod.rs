//! Stateless, signed private service. PostgreSQL commits journal mutations,
//! operation receipts, and the workspace revision in one transaction.
mod cot_jobs;
mod economic_jobs;
mod market;
mod market_batches;
#[cfg(test)]
mod market_tests;
mod myfxbook_jobs;
mod provider_jobs;
mod provider_storage;
#[cfg(test)]
mod provider_tests;
mod report_jobs;
#[cfg(test)]
mod tests;

use crate::cloud_postgres;
use axum::{
    Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, OriginalUri, State},
    http::{HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use hmac::{Hmac, KeyInit, Mac};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{
    ConnectOptions, PgConnection, PgPool,
    postgres::{PgConnectOptions, PgPoolOptions, PgSslMode},
};
use std::{str::FromStr, sync::Arc, time::Duration};
use uuid::Uuid;

const BODY_LIMIT: usize = 2 * 1024 * 1024;
// Allow complete analysis responses without enlarging accepted request bodies.
const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;
const SIGNATURE_WINDOW: i64 = 60;
const MAX_REVISION: i64 = 9_007_199_254_740_991;
type AnyError = Box<dyn std::error::Error + Send + Sync>;
type Outcome = (StatusCode, Value);

pub struct CloudConfig {
    pub database_url: String,
    pub schema: String,
    pub workspace_id: String,
    pub gateway_secret: [u8; 32],
}

impl CloudConfig {
    pub fn from_env() -> Result<Self, AnyError> {
        let config = Self {
            database_url: std::env::var("DATABASE_URL").map_err(|_| "Datenbankverbindung fehlt")?,
            schema: std::env::var("MACRO_PG_SCHEMA").unwrap_or_else(|_| "macro_private".into()),
            workspace_id: std::env::var("MACRO_WORKSPACE_ID").map_err(|_| "Workspace fehlt")?,
            gateway_secret: std::env::var("MACRO_GATEWAY_SECRET")
                .ok()
                .and_then(|s| decode_hex(&s))
                .ok_or("Dienstschlüssel fehlt")?,
        };
        validate_scope(&config.schema, &config.workspace_id)?;
        Ok(config)
    }
}

fn validate_scope(schema: &str, workspace: &str) -> Result<(), AnyError> {
    if schema.is_empty()
        || schema.len() > 63
        || !schema.starts_with("macro_")
        || !schema
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_')
        || workspace.is_empty()
        || workspace.len() > 128
        || !workspace
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    {
        return Err("Ungültiger privater Datenbereich".into());
    }
    Ok(())
}

pub struct CloudServer {
    pool: PgPool,
    schema: String,
    workspace_id: String,
    gateway_secret: [u8; 32],
    market: Option<market::MarketRuntime>,
    cot_enabled: bool,
    economic_enabled: bool,
    myfxbook_enabled: bool,
    reports_enabled: bool,
}

impl CloudServer {
    pub async fn open(config: CloudConfig) -> Result<Arc<Self>, AnyError> {
        validate_scope(&config.schema, &config.workspace_id)?;
        let options = PgConnectOptions::from_str(&config.database_url)
            .map_err(|_| "Ungültige Datenbankkonfiguration")?
            .ssl_mode(PgSslMode::VerifyFull)
            .disable_statement_logging();
        let pool = PgPoolOptions::new()
            .max_connections(4)
            .min_connections(0)
            .acquire_timeout(Duration::from_secs(20))
            .idle_timeout(Some(Duration::from_secs(30)))
            .max_lifetime(Some(Duration::from_secs(300)))
            .connect_with(options)
            .await
            .map_err(|_| "Datenbank nicht erreichbar")?;
        let mut server = Self::from_pool(
            pool,
            config.schema,
            config.workspace_id,
            config.gateway_secret,
        )
        .await?;
        Arc::get_mut(&mut server)
            .ok_or("Dienstinitialisierung fehlgeschlagen")?
            .market = market::MarketRuntime::from_env()?;
        Arc::get_mut(&mut server)
            .ok_or("Dienstinitialisierung fehlgeschlagen")?
            .cot_enabled = std::env::var("MACRO_COT_AUTOMATION").ok().as_deref() == Some("1");
        let writable = Arc::get_mut(&mut server).ok_or("Dienstinitialisierung fehlgeschlagen")?;
        writable.economic_enabled =
            std::env::var("MACRO_ECONOMIC_AUTOMATION").ok().as_deref() == Some("1");
        writable.myfxbook_enabled = std::env::var("MACRO_MYFXBOOK_AUTOMATION").ok().as_deref()
            == Some("1")
            && cloud_postgres::provider_secrets::available();
        writable.reports_enabled =
            std::env::var("MACRO_REPORT_AUTOMATION").ok().as_deref() == Some("1");
        Ok(server)
    }

    pub async fn from_pool(
        pool: PgPool,
        schema: String,
        workspace_id: String,
        gateway_secret: [u8; 32],
    ) -> Result<Arc<Self>, AnyError> {
        validate_scope(&schema, &workspace_id)?;
        let server = Arc::new(Self {
            pool,
            schema,
            workspace_id,
            gateway_secret,
            market: None,
            cot_enabled: false,
            economic_enabled: false,
            myfxbook_enabled: false,
            reports_enabled: false,
        });
        let mut tx = server
            .pool
            .begin()
            .await
            .map_err(|_| "Datenbank nicht erreichbar")?;
        server
            .scope(&mut tx)
            .await
            .map_err(|_| "Datenbereich nicht verfügbar")?;
        let identity: Option<String> =
            sqlx::query_scalar("SELECT identity FROM cloud_workspace WHERE id=1")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|_| "Cloud-Übernahme noch nicht abgeschlossen")?;
        if identity.as_deref() != Some(&server.workspace_id) {
            return Err("Cloud-Workspace nicht bestätigt".into());
        }
        tx.rollback()
            .await
            .map_err(|_| "Datenbank nicht erreichbar")?;
        Ok(server)
    }

    async fn scope(&self, conn: &mut PgConnection) -> Result<(), sqlx::Error> {
        // SET LOCAL is transaction-scoped and works through Neon's pooler.
        // Never rely on session state surviving a PgBouncer transaction boundary.
        sqlx::query("SELECT set_config('search_path',$1,true),set_config('statement_timeout','80000',true),set_config('lock_timeout','10000',true)")
            .bind(format!("\"{}\"", self.schema)).execute(conn).await?;
        Ok(())
    }

    async fn revision(&self) -> Result<i64, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let revision =
            sqlx::query_scalar("SELECT revision FROM cloud_workspace WHERE id=1 AND identity=$1")
                .bind(&self.workspace_id)
                .fetch_one(&mut *tx)
                .await?;
        tx.rollback().await?;
        Ok(revision)
    }

    async fn authenticate(
        &self,
        headers: &HeaderMap,
        method: &str,
        path: &str,
        body: &[u8],
    ) -> bool {
        let Some(timestamp_text) = header(headers, "x-macro-timestamp") else {
            return false;
        };
        let Some(nonce) = header(headers, "x-macro-nonce").filter(|v| canonical_uuid(v)) else {
            return false;
        };
        let Some(signature) = header(headers, "x-macro-signature").and_then(decode_hex::<32>)
        else {
            return false;
        };
        let Ok(timestamp) = timestamp_text.parse::<i64>() else {
            return false;
        };
        let now = chrono::Utc::now().timestamp();
        if now.abs_diff(timestamp) > SIGNATURE_WINDOW as u64 {
            return false;
        }
        let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(&self.gateway_secret) else {
            return false;
        };
        mac.update(canonical(timestamp_text, nonce, method, path, body).as_bytes());
        if mac.verify_slice(&signature).is_err() {
            return false;
        }
        self.record_nonce(nonce, timestamp, now)
            .await
            .unwrap_or(false)
    }

    async fn record_nonce(
        &self,
        nonce: &str,
        timestamp: i64,
        now: i64,
    ) -> Result<bool, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        sqlx::query("DELETE FROM cloud_nonces WHERE timestamp < $1")
            .bind(now - SIGNATURE_WINDOW)
            .execute(&mut *tx)
            .await?;
        let inserted = sqlx::query(
            "INSERT INTO cloud_nonces(nonce,timestamp) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        )
        .bind(nonce)
        .bind(timestamp)
        .execute(&mut *tx)
        .await?
        .rows_affected()
            == 1;
        tx.commit().await?;
        Ok(inserted)
    }

    async fn execute(&self, request: CommandRequest) -> Outcome {
        self.execute_scoped(request, false).await
    }

    async fn execute_scoped(&self, request: CommandRequest, internal_media: bool) -> Outcome {
        if request.workspace_id != self.workspace_id {
            return failure(
                StatusCode::CONFLICT,
                "WORKSPACE_CONFLICT",
                "Der Workspace wurde geändert. Bitte neu laden.",
                None,
            );
        }
        if !internal_media && request.command == "get_provider_automation_status" {
            return match (self.provider_status().await, self.revision().await) {
                (Ok(data), Ok(revision)) => (
                    StatusCode::OK,
                    json!({"ok":true,"data":data,"revision":revision}),
                ),
                _ => internal_error(),
            };
        }
        if !internal_media && request.command == "get_weather_forecast" {
            let Ok(input) = serde_json::from_value::<crate::commands::WeatherInput>(
                request.args.get("input").cloned().unwrap_or(Value::Null),
            ) else {
                return failure(
                    StatusCode::BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "Die Wetterauswahl ist ungültig.",
                    None,
                );
            };
            // Public network work does not retain a PG connection or transaction.
            let Ok(revision) = self.revision().await else {
                return internal_error();
            };
            return match crate::commands::get_weather_forecast(input).await {
                Ok(data) => (
                    StatusCode::OK,
                    json!({"ok":true,"data":data,"revision":revision}),
                ),
                Err(error) => failure(
                    if error.code == "VALIDATION_ERROR" {
                        StatusCode::BAD_REQUEST
                    } else {
                        StatusCode::BAD_GATEWAY
                    },
                    &error.code,
                    &error.message,
                    Some(revision),
                ),
            };
        }
        if !internal_media && market::is_command(&request.command) {
            return self.market_read(request).await;
        }
        if !internal_media
            && cloud_postgres::myfxbook::COMMANDS
                .iter()
                .any(|(name, _)| *name == request.command)
        {
            if !self.myfxbook_enabled {
                return failure(
                    StatusCode::NOT_FOUND,
                    "COMMAND_UNAVAILABLE",
                    "Die Myfxbook-Cloud-Anmeldung ist noch nicht eingerichtet.",
                    None,
                );
            }
            if matches!(
                request.command.as_str(),
                "myfxbook_login" | "myfxbook_preview"
            ) {
                return self.myfxbook_network(&request.command, &request.args).await;
            }
        }
        let preflight_error =
            if !internal_media && request.command == "mark_central_bank_report_read" {
                // Slow Blob validation stays outside the journal transaction.
                // A transient failure must not hide an already durable receipt.
                self.report_marker_preflight(&request.args).await
            } else {
                None
            };
        let allowed = if internal_media {
            cloud_postgres::media::INTERNAL_COMMANDS
        } else {
            cloud_postgres::COMMANDS
        };
        let Some((_, write)) = allowed.iter().find(|(name, _)| *name == request.command) else {
            return failure(
                StatusCode::NOT_FOUND,
                "COMMAND_UNAVAILABLE",
                "Diese Funktion ist im privaten Browser noch nicht verfügbar.",
                None,
            );
        };
        match self
            .transaction(request, *write, internal_media, preflight_error)
            .await
        {
            Ok(outcome) => outcome,
            Err(_) => internal_error(),
        }
    }

    async fn report_marker_preflight(&self, args: &Value) -> Option<Outcome> {
        // A new read marker may reference only an actually published report.
        // No Blob download may hold a journal write lock or PG connection.
        let Some(runtime) = &self.market else {
            return Some(failure(
                StatusCode::NOT_FOUND,
                "COMMAND_UNAVAILABLE",
                "Berichte sind noch nicht verfügbar.",
                None,
            ));
        };
        let Ok((_, Some(manifest))) = self.market_snapshot().await else {
            return Some(internal_error());
        };
        if runtime
            .read(&manifest, "get_central_bank_report", args)
            .await
            .is_err()
        {
            return Some(failure(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "Der veröffentlichte Bericht wurde nicht gefunden.",
                None,
            ));
        }
        None
    }

    async fn market_snapshot(
        &self,
    ) -> Result<
        (
            i64,
            Option<crate::cloud_public::manifest::PublishedManifest>,
        ),
        AnyError,
    > {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            .execute(&mut *tx)
            .await?;
        self.scope(&mut tx).await?;
        let revision =
            sqlx::query_scalar("SELECT revision FROM cloud_workspace WHERE id=1 AND identity=$1")
                .bind(&self.workspace_id)
                .fetch_one(&mut *tx)
                .await?;
        let manifest = crate::cloud_public::manifest::load_active(&mut tx)
            .await
            .map_err(|_| "Marktdatenverzeichnis nicht verfügbar")?;
        // The immutable generation is pinned in memory. Slow downloads and
        // calculations must not retain a pooled PG connection or journal lock.
        tx.rollback().await?;
        Ok((revision, manifest))
    }

    async fn market_read(&self, request: CommandRequest) -> Outcome {
        let Some(runtime) = &self.market else {
            return failure(
                StatusCode::NOT_FOUND,
                "COMMAND_UNAVAILABLE",
                "Die Marktansicht ist noch nicht angebunden.",
                None,
            );
        };
        let (revision, manifest) = match self.market_snapshot().await {
            Ok((revision, Some(manifest))) => (revision, manifest),
            Ok((revision, None)) => {
                return failure(
                    StatusCode::NOT_FOUND,
                    "COMMAND_UNAVAILABLE",
                    "Die Marktdaten wurden noch nicht übernommen.",
                    Some(revision),
                );
            }
            Err(_) => return internal_error(),
        };
        if !market::capabilities(&manifest).contains(&request.command.as_str()) {
            return failure(
                StatusCode::NOT_FOUND,
                "COMMAND_UNAVAILABLE",
                "Diese Marktansicht ist noch nicht verfügbar.",
                Some(revision),
            );
        }
        let payload = match runtime
            .read(&manifest, &request.command, &request.args)
            .await
        {
            Ok(mut data) => {
                if request.command == "get_cot_dashboard" {
                    data["automaticRefresh"] = self.cot_status().await.unwrap_or_else(|_|json!({
                        "enabled":false,"calendarAvailable":false,"nextRefreshAt":null,"lastOutcome":null
                    }));
                }
                if request.command == "get_central_bank_reports"
                    && self.reports_enabled
                    && let Ok((automation, sources)) = self.report_status().await
                {
                    data["automation"] = automation;
                    data["sources"] = sources;
                }
                json!({"ok":true,"data":data,"revision":revision})
            }
            Err(error) => {
                let safe = matches!(
                    error.code.as_str(),
                    "VALIDATION_ERROR" | "CONFLICT" | "NOT_FOUND"
                );
                let (code, message) = if safe {
                    (error.code, error.message)
                } else {
                    (
                        "COMMAND_FAILED".into(),
                        "Die Marktdaten konnten nicht geladen werden. Bitte versuche es erneut."
                            .into(),
                    )
                };
                json!({"ok":false,"error":{"code":code,"message":message},"revision":revision})
            }
        };
        if payload.to_string().len() > MAX_RESPONSE_BYTES {
            return failure(
                StatusCode::OK,
                "RESPONSE_TOO_LARGE",
                "Bitte schränke die Marktauswahl ein.",
                Some(revision),
            );
        }
        (StatusCode::OK, payload)
    }

    async fn transaction(
        &self,
        request: CommandRequest,
        write: bool,
        internal_media: bool,
        preflight_error: Option<Outcome>,
    ) -> Result<Outcome, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        if !write {
            sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                .execute(&mut *tx)
                .await?;
        }
        self.scope(&mut tx).await?;
        let revision_sql = if write {
            "SELECT revision FROM cloud_workspace WHERE id=1 AND identity=$1 FOR UPDATE"
        } else {
            "SELECT revision FROM cloud_workspace WHERE id=1 AND identity=$1"
        };
        let revision: i64 = sqlx::query_scalar(revision_sql)
            .bind(&self.workspace_id)
            .fetch_one(&mut *tx)
            .await?;
        let hash = request_hash(&request);
        let operation = if write {
            let Some(id) = request
                .operation_id
                .as_deref()
                .filter(|id| canonical_uuid(id))
            else {
                return Ok(failure(
                    StatusCode::BAD_REQUEST,
                    "INVALID_REQUEST",
                    "Eine gültige Vorgangskennung ist erforderlich.",
                    Some(revision),
                ));
            };
            let previous: Option<(String, String)> = sqlx::query_as("SELECT request_hash,response FROM cloud_operations WHERE workspace_id=$1 AND operation_id=$2")
                .bind(&self.workspace_id).bind(id).fetch_optional(&mut *tx).await?;
            if let Some((previous_hash, response)) = previous {
                if previous_hash != hash {
                    return Ok(failure(
                        StatusCode::CONFLICT,
                        "OPERATION_CONFLICT",
                        "Die Vorgangskennung wurde bereits anders verwendet. Bitte neu laden.",
                        Some(revision),
                    ));
                }
                return Ok(match serde_json::from_str(&response) {
                    Ok(value) => (StatusCode::OK, value),
                    Err(_) => internal_error(),
                });
            }
            if request.expected_revision != Some(revision) {
                return Ok(failure(
                    StatusCode::CONFLICT,
                    "REVISION_CONFLICT",
                    "Der Datenstand wurde geändert. Bitte neu laden.",
                    Some(revision),
                ));
            }
            Some(id.to_owned())
        } else {
            None
        };

        // Retries are resolved from the durable operation receipt above, even
        // if the report vanished from a later generation or Blob is unavailable.
        // Only a new mutation depends on the current membership preflight.
        if let Some(error) = preflight_error {
            return Ok(error);
        }

        sqlx::query("SAVEPOINT command_dispatch")
            .execute(&mut *tx)
            .await?;
        let result = if internal_media {
            cloud_postgres::media::dispatch_internal(&mut tx, &request.command, &request.args).await
        } else {
            cloud_postgres::dispatch(&mut tx, &request.command, &request.args).await
        };
        let next_revision = if write {
            revision.checked_add(1).filter(|r| *r <= MAX_REVISION)
        } else {
            Some(revision)
        };
        let mut changed = write;
        let mut payload = match (result, next_revision) {
            (Ok(data), Some(next)) => json!({"ok":true,"data":data,"revision":next}),
            (Err(error), _) => {
                changed = false;
                sqlx::query("ROLLBACK TO SAVEPOINT command_dispatch")
                    .execute(&mut *tx)
                    .await?;
                let allowed = (request.command.starts_with("myfxbook_")
                    && error.code.starts_with("MYFXBOOK_"))
                    || matches!(
                        error.code.as_str(),
                        "VALIDATION_ERROR" | "CONFLICT" | "NOT_FOUND"
                    );
                let (code, message) = if allowed {
                    (error.code, error.message)
                } else {
                    (
                        "COMMAND_FAILED".into(),
                        "Die Aktion konnte nicht abgeschlossen werden.".into(),
                    )
                };
                json!({"ok":false,"error":{"code":code,"message":message},"revision":revision})
            }
            (_, None) => {
                changed = false;
                sqlx::query("ROLLBACK TO SAVEPOINT command_dispatch")
                    .execute(&mut *tx)
                    .await?;
                json!({"ok":false,"error":{"code":"COMMAND_FAILED","message":"Der Datenstand kann nicht weiter geändert werden."},"revision":revision})
            }
        };
        if payload.to_string().len() > MAX_RESPONSE_BYTES {
            sqlx::query("ROLLBACK TO SAVEPOINT command_dispatch")
                .execute(&mut *tx)
                .await?;
            changed = false;
            payload = json!({"ok":false,"error":{"code":"RESPONSE_TOO_LARGE","message":"Bitte schränke die Auswahl ein."},"revision":revision});
        }
        sqlx::query("RELEASE SAVEPOINT command_dispatch")
            .execute(&mut *tx)
            .await?;
        if let Some(operation) = operation {
            let committed_revision = if changed {
                next_revision.unwrap_or(revision)
            } else {
                revision
            };
            if changed {
                sqlx::query("UPDATE cloud_workspace SET revision=$1 WHERE id=1 AND identity=$2")
                    .bind(committed_revision)
                    .bind(&self.workspace_id)
                    .execute(&mut *tx)
                    .await?;
            }
            sqlx::query("INSERT INTO cloud_operations(workspace_id,operation_id,request_hash,response,revision,created_at) VALUES ($1,$2,$3,$4,$5,$6)")
                .bind(&self.workspace_id).bind(&operation).bind(&hash).bind(payload.to_string())
                .bind(committed_revision).bind(chrono::Utc::now().to_rfc3339()).execute(&mut *tx).await?;
            if tx.commit().await.is_err() {
                // A disconnected COMMIT can still succeed. Check the durable
                // receipt on a new connection; never execute the mutation again.
                return Ok(self.resolve_commit(&operation, &hash).await);
            }
        } else {
            tx.rollback().await?;
        }
        Ok((StatusCode::OK, payload))
    }

    async fn resolve_commit(&self, operation: &str, hash: &str) -> Outcome {
        let recovered = async {
            let mut tx = self.pool.begin().await?;
            self.scope(&mut tx).await?;
            let row: Option<(String, String)> = sqlx::query_as("SELECT request_hash,response FROM cloud_operations WHERE workspace_id=$1 AND operation_id=$2")
                .bind(&self.workspace_id).bind(operation).fetch_optional(&mut *tx).await?;
            tx.rollback().await?;
            Ok::<_, sqlx::Error>(row)
        }.await;
        if let Ok(Some((saved_hash, saved_response))) = recovered
            && saved_hash == hash
            && let Ok(value) = serde_json::from_str(&saved_response)
        {
            return (StatusCode::OK, value);
        }
        failure(
            StatusCode::CONFLICT,
            "OPERATION_UNCERTAIN",
            "Bitte neu laden und den letzten Vorgang prüfen.",
            None,
        )
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CommandRequest {
    workspace_id: String,
    command: String,
    args: Value,
    operation_id: Option<String>,
    expected_revision: Option<i64>,
}

fn request_hash(request: &CommandRequest) -> String {
    hex(&Sha256::digest(json!({"command":request.command,"args":request.args,"expectedRevision":request.expected_revision}).to_string().as_bytes()))
}

pub fn router(server: Arc<CloudServer>) -> Router {
    Router::new()
        .route("/session", get(session))
        .route("/commands", post(command))
        .route("/media/commands", post(media_command))
        .route("/internal/cot/plan", post(cot_jobs::route))
        .route("/internal/cot/run", post(cot_jobs::route))
        .route("/internal/cot/complete", post(cot_jobs::route))
        .route("/internal/providers/plan", post(provider_jobs::route))
        .route("/internal/providers/run", post(provider_jobs::route))
        .route("/internal/providers/complete", post(provider_jobs::route))
        .route("/internal/providers/retire", post(provider_jobs::route))
        .route("/internal/providers/retired", post(provider_jobs::route))
        .layer(DefaultBodyLimit::max(BODY_LIMIT))
        .with_state(server)
}

async fn session(
    State(server): State<Arc<CloudServer>>,
    OriginalUri(uri): OriginalUri,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if method != Method::GET
        || !body.is_empty()
        || !server
            .authenticate(&headers, "GET", &uri.to_string(), &body)
            .await
    {
        return unauthorized();
    }
    let Ok(revision) = server.revision().await else {
        return response(internal_error());
    };
    let mut capabilities = cloud_postgres::COMMANDS
        .iter()
        .filter(|(name, _)| server.myfxbook_enabled || !name.starts_with("myfxbook_"))
        .map(|(name, _)| *name)
        .chain(std::iter::once("upload_private_media"))
        .chain(std::iter::once("create_trade_with_screenshot"))
        .chain(std::iter::once("get_provider_automation_status"))
        .chain(std::iter::once("get_weather_forecast"))
        .collect::<Vec<_>>();
    let mut market_generation = None;
    if server.market.is_some()
        && let Ok((_, Some(manifest))) = server.market_snapshot().await
    {
        capabilities.extend(market::capabilities(&manifest));
        market_generation = Some(manifest.manifest.generation.clone());
    }
    response((
        StatusCode::OK,
        json!({"authenticated":true,"workspaceId":server.workspace_id,"revision":revision,
        "capabilities":capabilities,
        "marketGeneration":market_generation,
        "writableCommands":cloud_postgres::COMMANDS.iter().filter(|(name,write)|*write && (server.myfxbook_enabled || !name.starts_with("myfxbook_"))).map(|(name,_)|*name).chain(["upload_private_media", "create_trade_with_screenshot"]).collect::<Vec<_>>() }),
    ))
}

async fn command(
    State(server): State<Arc<CloudServer>>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    command_response(server, uri.to_string(), headers, body, false).await
}

async fn media_command(
    State(server): State<Arc<CloudServer>>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    command_response(server, uri.to_string(), headers, body, true).await
}

async fn command_response(
    server: Arc<CloudServer>,
    uri: String,
    headers: HeaderMap,
    body: Bytes,
    internal_media: bool,
) -> Response {
    if !server
        .authenticate(&headers, "POST", &uri.to_string(), &body)
        .await
    {
        return unauthorized();
    }
    if header(&headers, "content-type")
        .and_then(|s| s.split(';').next())
        .map(str::trim)
        != Some("application/json")
    {
        return response(failure(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "INVALID_REQUEST",
            "JSON erforderlich.",
            None,
        ));
    }
    let request = match serde_json::from_slice::<CommandRequest>(&body) {
        Ok(request) if request.args.is_object() && request.command.len() <= 128 => request,
        _ => {
            return response(failure(
                StatusCode::BAD_REQUEST,
                "INVALID_REQUEST",
                "Ungültige Anfrage.",
                None,
            ));
        }
    };
    match tokio::spawn(async move {
        if internal_media {
            server.execute_scoped(request, true).await
        } else {
            server.execute(request).await
        }
    })
    .await
    {
        Ok(outcome) => response(outcome),
        Err(_) => response(internal_error()),
    }
}

fn response((status, value): Outcome) -> Response {
    (
        status,
        [
            ("cache-control", "private, no-store"),
            ("x-content-type-options", "nosniff"),
        ],
        Json(value),
    )
        .into_response()
}
fn failure(status: StatusCode, code: &str, message: &str, revision: Option<i64>) -> Outcome {
    let mut value = json!({"ok":false,"error":{"code":code,"message":message}});
    if let Some(revision) = revision {
        value["revision"] = revision.into();
    }
    (status, value)
}
fn internal_error() -> Outcome {
    failure(
        StatusCode::INTERNAL_SERVER_ERROR,
        "SERVER_ERROR",
        "Der private Datenspeicher ist momentan nicht verfügbar.",
        None,
    )
}
fn unauthorized() -> Response {
    response(failure(
        StatusCode::UNAUTHORIZED,
        "UNAUTHORIZED",
        "Zugriff nicht erlaubt.",
        None,
    ))
}
fn header<'a>(headers: &'a HeaderMap, key: &str) -> Option<&'a str> {
    headers.get(key)?.to_str().ok()
}
fn canonical_uuid(value: &str) -> bool {
    Uuid::parse_str(value).is_ok_and(|id| id.to_string() == value)
}
fn canonical(timestamp: &str, nonce: &str, method: &str, path: &str, body: &[u8]) -> String {
    format!(
        "v1\n{timestamp}\n{nonce}\n{method}\n{path}\n{}",
        hex(&Sha256::digest(body))
    )
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}
fn decode_hex<const N: usize>(value: &str) -> Option<[u8; N]> {
    if value.len() != N * 2 || !value.is_ascii() {
        return None;
    }
    let mut bytes = [0; N];
    for (index, byte) in bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16).ok()?;
    }
    Some(bytes)
}
