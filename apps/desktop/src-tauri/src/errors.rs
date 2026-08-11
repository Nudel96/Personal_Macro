use serde::Serialize;
use serde_json::Value;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Datenbankfehler")]
    Database(#[from] sqlx::Error),
    #[error("Dateisystemfehler")]
    Io(#[from] std::io::Error),
    #[error("Ungültige Eingabe: {0}")]
    Validation(String),
    #[error("Datensatz nicht gefunden: {0}")]
    NotFound(String),
    #[error("Konflikt: {0}")]
    Conflict(String),
    #[error("Die Anwendung konnte nicht initialisiert werden: {0}")]
    Initialization(String),
    #[error("Import- oder Exportfehler: {0}")]
    DataTransfer(String),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

impl CommandError {
    pub fn validation(message: impl Into<String>) -> Self {
        Self {
            code: "VALIDATION_ERROR".into(),
            message: message.into(),
            details: None,
        }
    }
}

impl From<AppError> for CommandError {
    fn from(error: AppError) -> Self {
        let code = match &error {
            AppError::Database(_) => "DATABASE_ERROR",
            AppError::Io(_) => "FILESYSTEM_ERROR",
            AppError::Validation(_) => "VALIDATION_ERROR",
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::Conflict(_) => "CONFLICT",
            AppError::Initialization(_) => "INITIALIZATION_ERROR",
            AppError::DataTransfer(_) => "DATA_TRANSFER_ERROR",
        };

        let message = match &error {
            AppError::Database(database_error) => {
                tracing::error!(error = ?database_error, "database operation failed");
                "Die lokale Datenbank konnte die Aktion nicht ausführen.".to_string()
            }
            _ => error.to_string(),
        };

        Self {
            code: code.into(),
            message,
            details: None,
        }
    }
}

impl From<sqlx::Error> for CommandError {
    fn from(error: sqlx::Error) -> Self {
        AppError::Database(error).into()
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
