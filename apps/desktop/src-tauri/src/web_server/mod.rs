//! Single-process server for a durable private volume. All routes require a
//! fresh signed request from the owner-protected Vercel gateway.
mod dispatch;
#[cfg(test)]
mod tests;

use crate::database::{self, AppState};
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
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};
use std::{fs::File, path::PathBuf, sync::Arc};
use tokio::sync::Mutex;
use uuid::Uuid;

const BODY_LIMIT: usize = 2 * 1024 * 1024;
const SIGNATURE_WINDOW: i64 = 60;
type AnyError = Box<dyn std::error::Error + Send + Sync>;

pub struct ServerConfig {
    pub data_root: PathBuf,
    pub workspace_id: String,
    pub gateway_secret: [u8; 32],
}

impl ServerConfig {
    pub fn from_env() -> Result<Self, AnyError> {
        let secret =
            std::env::var("MACRO_GATEWAY_SECRET").map_err(|_| "MACRO_GATEWAY_SECRET fehlt")?;
        let workspace_id =
            std::env::var("MACRO_WORKSPACE_ID").map_err(|_| "MACRO_WORKSPACE_ID fehlt")?;
        let data_root =
            PathBuf::from(std::env::var("MACRO_DATA_ROOT").map_err(|_| "MACRO_DATA_ROOT fehlt")?);
        Ok(Self {
            data_root,
            workspace_id,
            gateway_secret: decode_hex(&secret)
                .ok_or("MACRO_GATEWAY_SECRET muss 64 Hex-Zeichen enthalten")?,
        })
    }
}

pub struct PrivateServer {
    app: AppState,
    control: SqlitePool,
    workspace_id: String,
    gateway_secret: [u8; 32],
    // Retain the exclusive OS lock for the entire lifetime of this instance.
    _volume_lock: File,
    commands: Mutex<()>,
}

impl PrivateServer {
    pub async fn open(config: ServerConfig) -> Result<Arc<Self>, AnyError> {
        if config.workspace_id.is_empty()
            || config.workspace_id.len() > 128
            || !config
                .workspace_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        {
            return Err("MACRO_WORKSPACE_ID ist ungültig".into());
        }
        if !config.data_root.is_absolute() {
            return Err("Absoluter dauerhafter Datenpfad erforderlich".into());
        }
        std::fs::create_dir_all(&config.data_root)?;
        let volume_lock = File::options()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(config.data_root.join("private-server.lock"))?;
        volume_lock
            .try_lock()
            .map_err(|_| "Das Datenverzeichnis wird bereits von einem Server verwendet")?;
        // A desktop restore covers only the journal. Applying it here could
        // split that journal from durable operation receipts and revisions.
        if config
            .data_root
            .join("settings/pending-restore.json")
            .exists()
        {
            return Err(
                "Ein Desktop-Restore darf nicht auf einen Server-Workspace angewendet werden"
                    .into(),
            );
        }
        let existing_control = config.data_root.join("private-server.sqlite").exists();
        let existing_journal = config.data_root.join("database/journal.sqlite").exists();
        if existing_control != existing_journal {
            return Err("Der Server-Workspace ist unvollständig; Journal und Kontrollspeicher müssen zusammen übernommen werden".into());
        }
        let control = SqlitePoolOptions::new()
            .max_connections(4)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(config.data_root.join("private-server.sqlite"))
                    .create_if_missing(true)
                    .journal_mode(SqliteJournalMode::Wal)
                    .synchronous(SqliteSynchronous::Full)
                    .busy_timeout(std::time::Duration::from_secs(5)),
            )
            .await?;
        if !existing_control {
            sqlx::raw_sql("CREATE TABLE workspace (id INTEGER PRIMARY KEY CHECK(id=1), identity TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>=0));
            CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, revision INTEGER NOT NULL, response TEXT);
            CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, timestamp INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS nonces_timestamp ON nonces(timestamp);").execute(&control).await?;
            sqlx::query("INSERT INTO workspace (id,identity,revision) VALUES (1,?,0)")
                .bind(&config.workspace_id)
                .execute(&control)
                .await?;
        } else {
            // Never rebuild lost metadata around an existing journal: that
            // would reset revisions and make old operation IDs executable again.
            let tables: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('workspace','operations','nonces')")
                .fetch_one(&control).await?;
            if tables != 3 {
                return Err("Der Kontrollspeicher ist unvollständig und muss aus derselben Sicherung wiederhergestellt werden".into());
            }
        }
        let identity: String = sqlx::query_scalar("SELECT identity FROM workspace WHERE id=1")
            .fetch_one(&control)
            .await?;
        if identity != config.workspace_id {
            return Err("Der Datenträger gehört zu einem anderen Workspace".into());
        }
        let app = database::initialize_at(config.data_root).await?;
        Ok(Arc::new(Self {
            app,
            control,
            workspace_id: config.workspace_id,
            gateway_secret: config.gateway_secret,
            _volume_lock: volume_lock,
            commands: Mutex::new(()),
        }))
    }

    async fn revision(&self) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar("SELECT revision FROM workspace WHERE id=1")
            .fetch_one(&self.control)
            .await
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
        let Some(nonce) = header(headers, "x-macro-nonce") else {
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
        if now.abs_diff(timestamp) > SIGNATURE_WINDOW as u64 || Uuid::parse_str(nonce).is_err() {
            return false;
        }
        let message = canonical(timestamp_text, nonce, method, path, body);
        let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(&self.gateway_secret) else {
            return false;
        };
        mac.update(message.as_bytes());
        if mac.verify_slice(&signature).is_err() {
            return false;
        }
        if sqlx::query("DELETE FROM nonces WHERE timestamp < ?")
            .bind(now - SIGNATURE_WINDOW)
            .execute(&self.control)
            .await
            .is_err()
        {
            return false;
        }
        sqlx::query("INSERT INTO nonces(nonce,timestamp) VALUES (?,?)")
            .bind(nonce)
            .bind(timestamp)
            .execute(&self.control)
            .await
            .is_ok()
    }

    async fn execute(&self, request: CommandRequest) -> (StatusCode, Value) {
        if request.workspace_id != self.workspace_id {
            return failure(
                StatusCode::CONFLICT,
                "WORKSPACE_CONFLICT",
                "Der verbundene Workspace wurde geändert. Bitte neu laden.",
                None,
            );
        }
        let _guard = self.commands.lock().await;
        let Some((_, write)) = dispatch::COMMANDS
            .iter()
            .find(|(name, _)| *name == request.command)
        else {
            return failure(
                StatusCode::NOT_FOUND,
                "COMMAND_UNAVAILABLE",
                "Diese Funktion ist im privaten Browser noch nicht verfügbar.",
                None,
            );
        };
        let Ok(mut revision) = self.revision().await else {
            return internal_error();
        };
        let mut operation_id = None;
        if *write {
            let Some(id) = request
                .operation_id
                .as_deref()
                .filter(|id| Uuid::parse_str(id).is_ok())
            else {
                return failure(
                    StatusCode::BAD_REQUEST,
                    "INVALID_REQUEST",
                    "Für diese Änderung fehlt eine gültige Vorgangskennung.",
                    Some(revision),
                );
            };
            let request_hash = hex(&Sha256::digest(json!({"command":request.command,"args":request.args,"expectedRevision":request.expected_revision}).to_string().as_bytes()));
            let existing: Result<Option<(String, Option<String>)>, _> =
                sqlx::query_as("SELECT request_hash,response FROM operations WHERE id=?")
                    .bind(id)
                    .fetch_optional(&self.control)
                    .await;
            match existing {
                Ok(Some((hash, response))) => {
                    if hash != request_hash {
                        return failure(
                            StatusCode::CONFLICT,
                            "OPERATION_CONFLICT",
                            "Die Vorgangskennung wurde bereits anders verwendet. Bitte neu laden.",
                            Some(revision),
                        );
                    }
                    return match response.and_then(|s| serde_json::from_str(&s).ok()) {
                        Some(value) => (StatusCode::OK, value),
                        None => failure(
                            StatusCode::CONFLICT,
                            "OPERATION_UNCERTAIN",
                            "Der letzte Vorgang muss nach dem Neuladen geprüft werden.",
                            Some(revision),
                        ),
                    };
                }
                Ok(None) => {}
                Err(_) => return internal_error(),
            }
            if request.expected_revision != Some(revision) {
                return failure(
                    StatusCode::CONFLICT,
                    "REVISION_CONFLICT",
                    "Der Datenstand wurde geändert. Bitte vor dem Speichern neu laden.",
                    Some(revision),
                );
            }
            let Some(next) = revision
                .checked_add(1)
                .filter(|next| *next <= 9_007_199_254_740_991)
            else {
                return internal_error();
            };
            // Reserve durably BEFORE invoking any business mutation. A crash can
            // consume a revision but can never leave an unversioned successful write.
            let Ok(mut tx) = self.control.begin().await else {
                return internal_error();
            };
            if sqlx::query("UPDATE workspace SET revision=? WHERE id=1")
                .bind(next)
                .execute(&mut *tx)
                .await
                .is_err()
                || sqlx::query("INSERT INTO operations(id,request_hash,revision) VALUES (?,?,?)")
                    .bind(id)
                    .bind(request_hash)
                    .bind(next)
                    .execute(&mut *tx)
                    .await
                    .is_err()
                || tx.commit().await.is_err()
            {
                return internal_error();
            }
            revision = next;
            operation_id = Some(id.to_owned());
        }
        let response = match dispatch::dispatch(&self.app, &request.command, &request.args).await {
            Ok(data) => json!({"ok":true,"data":data,"revision":revision}),
            Err(error) => {
                let (code, message) = match error.code.as_str() {
                    "VALIDATION_ERROR" | "CONFLICT" | "NOT_FOUND" => (error.code, error.message),
                    _ => ("COMMAND_FAILED".into(), "Die Aktion konnte nicht abgeschlossen werden. Bitte neu laden und den Datenstand prüfen.".into()),
                };
                json!({"ok":false,"error":{"code":code,"message":message},"revision":revision})
            }
        };
        let response = if response.to_string().len() > BODY_LIMIT {
            json!({"ok":false,"error":{"code":"RESPONSE_TOO_LARGE","message":"Die Datenmenge ist für diese Ansicht zu groß. Bitte die Auswahl einschränken."},"revision":revision})
        } else {
            response
        };
        if let Some(id) = operation_id
            && sqlx::query("UPDATE operations SET response=? WHERE id=?")
                .bind(response.to_string())
                .bind(id)
                .execute(&self.control)
                .await
                .is_err()
        {
            return failure(
                StatusCode::CONFLICT,
                "OPERATION_UNCERTAIN",
                "Die Änderung muss nach dem Neuladen geprüft werden.",
                Some(revision),
            );
        }
        (StatusCode::OK, response)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CommandRequest {
    workspace_id: String,
    command: String,
    args: Value,
    operation_id: Option<String>,
    expected_revision: Option<i64>,
}

pub fn router(server: Arc<PrivateServer>) -> Router {
    Router::new()
        .route("/session", get(session))
        .route("/commands", post(command))
        .layer(DefaultBodyLimit::max(BODY_LIMIT))
        .with_state(server)
}

async fn session(
    State(server): State<Arc<PrivateServer>>,
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
    let _guard = server.commands.lock().await;
    let Ok(revision) = server.revision().await else {
        return response(internal_error());
    };
    response((
        StatusCode::OK,
        json!({"authenticated":true,"workspaceId":server.workspace_id,"revision":revision,
        "capabilities":dispatch::COMMANDS.iter().map(|(name,_)| *name).collect::<Vec<_>>(),
        "writableCommands":dispatch::COMMANDS.iter().filter(|(_,write)| *write).map(|(name,_)| *name).collect::<Vec<_>>() }),
    ))
}

async fn command(
    State(server): State<Arc<PrivateServer>>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    body: Bytes,
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
    // A lost browser connection must not cancel a write halfway through.
    match tokio::spawn(async move { server.execute(request).await }).await {
        Ok(result) => response(result),
        Err(_) => response(internal_error()),
    }
}

fn response((status, value): (StatusCode, Value)) -> Response {
    (
        status,
        [
            ("cache-control", "no-store"),
            ("x-content-type-options", "nosniff"),
        ],
        Json(value),
    )
        .into_response()
}
fn failure(
    status: StatusCode,
    code: &str,
    message: &str,
    revision: Option<i64>,
) -> (StatusCode, Value) {
    let mut value = json!({"ok":false,"error":{"code":code,"message":message}});
    if let Some(revision) = revision {
        value["revision"] = revision.into();
    }
    (status, value)
}
fn internal_error() -> (StatusCode, Value) {
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
fn canonical(timestamp: &str, nonce: &str, method: &str, path: &str, body: &[u8]) -> String {
    format!(
        "v1\n{timestamp}\n{nonce}\n{method}\n{path}\n{}",
        hex(&Sha256::digest(body))
    )
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}
fn decode_hex<const N: usize>(text: &str) -> Option<[u8; N]> {
    if text.len() != N * 2 || !text.is_ascii() {
        return None;
    }
    let mut bytes = [0u8; N];
    for (index, byte) in bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&text[index * 2..index * 2 + 2], 16).ok()?;
    }
    Some(bytes)
}
