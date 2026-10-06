//! PostgreSQL implementation of the explicitly allowed private-browser commands.
//! The caller owns a single transaction and passes its connection to dispatch.
mod atlas;
mod common;
pub mod finalize;
pub mod importer;
mod journal;
pub mod media;
pub(crate) mod myfxbook;
pub(crate) mod myfxbook_apply;
pub(crate) mod provider_secrets;
mod reports;
mod system;
#[cfg(test)]
pub(crate) mod test_support;
mod trades;
mod transfer;
mod workspace;

use crate::errors::{AppError, CommandError};
use serde::Serialize;
use serde_json::Value;
use sqlx::{PgConnection, PgPool};

pub type CloudResult<T> = Result<T, CloudError>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudError {
    pub code: String,
    pub message: String,
}

impl CloudError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::new("VALIDATION_ERROR", message)
    }

    pub fn to_command_error(&self) -> CommandError {
        CommandError {
            code: self.code.clone(),
            message: self.message.clone(),
            details: None,
        }
    }
}

impl std::fmt::Display for CloudError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for CloudError {}

impl From<sqlx::Error> for CloudError {
    fn from(error: sqlx::Error) -> Self {
        // PostgreSQL details can contain submitted journal values. Never log or
        // serialize the original error, statement, connection string or detail.
        match error {
            sqlx::Error::RowNotFound => {
                Self::new("NOT_FOUND", "Der Datensatz wurde nicht gefunden.")
            }
            sqlx::Error::Database(ref database) if database.is_unique_violation() => Self::new(
                "CONFLICT",
                "Ein Datensatz mit dieser Zuordnung besteht bereits.",
            ),
            sqlx::Error::Database(ref database) if database.is_foreign_key_violation() => {
                Self::validation("Eine verknüpfte Auswahl ist nicht mehr verfügbar.")
            }
            _ => Self::new(
                "DATABASE_ERROR",
                "Die Datenbank konnte die Aktion nicht ausführen.",
            ),
        }
    }
}

impl From<AppError> for CloudError {
    fn from(error: AppError) -> Self {
        match error {
            AppError::Validation(message) => Self::validation(message),
            AppError::Conflict(message) => Self::new("CONFLICT", message),
            AppError::NotFound(_) => Self::new("NOT_FOUND", "Der Datensatz wurde nicht gefunden."),
            AppError::Database(error) => error.into(),
            _ => Self::new(
                "COMMAND_FAILED",
                "Die Aktion konnte nicht abgeschlossen werden.",
            ),
        }
    }
}

impl From<serde_json::Error> for CloudError {
    fn from(_: serde_json::Error) -> Self {
        Self::validation("Die Eingabe ist unvollständig oder ungültig.")
    }
}

pub const COMMANDS: &[(&str, bool)] = &[
    ("import_trades_batch", true),
    ("list_cloud_backups", false),
    ("create_cloud_backup", true),
    ("get_cloud_backup", false),
    ("restore_cloud_backup", true),
    ("get_learning_progress", false),
    ("save_learning_progress", true),
    ("myfxbook_connections", false),
    ("myfxbook_login", false),
    ("myfxbook_preview", false),
    ("myfxbook_activate", true),
    ("myfxbook_set_enabled", true),
    ("myfxbook_disconnect", true),
    ("get_bootstrap_data", false),
    ("get_settings", false),
    ("update_setting", true),
    ("get_account_journal", false),
    ("save_account", true),
    ("archive_account", true),
    ("list_account_cashflows", false),
    ("add_account_cashflow", true),
    ("create_strategy", true),
    ("create_setup", true),
    ("create_tag", true),
    ("list_trades", false),
    ("get_trade", false),
    ("create_trade", true),
    ("update_trade", true),
    ("trash_trade", true),
    ("restore_trade", true),
    ("duplicate_trade", true),
    ("list_deleted_trades", false),
    ("get_trade_context", false),
    ("save_trade_context", true),
    ("calculate_dashboard", false),
    ("calculate_calendar", false),
    ("list_saved_views", false),
    ("save_saved_view", true),
    ("delete_saved_view", true),
    ("list_custom_fields", false),
    ("save_custom_field", true),
    ("delete_custom_field", true),
    ("list_reviews", false),
    ("save_review", true),
    ("list_goals", false),
    ("save_goal", true),
    ("record_goal_progress", true),
    ("list_playbook", false),
    ("create_setup_version", true),
    ("get_mistake_analytics", false),
    ("list_trade_mistakes", false),
    ("assign_trade_mistake", true),
    ("list_media", false),
    ("list_trade_media", false),
    ("attach_trade_media", true),
    ("detach_trade_media", true),
    ("get_media_annotation", false),
    ("save_media_annotation", true),
    ("list_atlas_notebook", false),
    ("get_atlas_notebook_entry", false),
    ("create_atlas_notebook_entry", true),
    ("update_atlas_notebook_entry", true),
    ("trash_atlas_notebook_entry", true),
    ("get_atlas_last_context", false),
    ("save_atlas_last_context", true),
    ("list_central_bank_report_reads", false),
    ("mark_central_bank_report_read", true),
];

pub async fn initialize(pool: &PgPool) -> CloudResult<()> {
    // Running this on a new database does not seed personal accounts or silently
    // initialize a workspace identity. The caller owns that explicit operation.
    sqlx::migrate!("./postgres-migrations")
        .run(pool)
        .await
        .map_err(|_| {
            CloudError::new(
                "MIGRATION_ERROR",
                "Die Cloud-Datenbank konnte nicht vorbereitet werden.",
            )
        })
}

pub async fn dispatch(
    connection: &mut PgConnection,
    name: &str,
    args: &Value,
) -> CloudResult<Value> {
    if !args.is_object() {
        return Err(CloudError::validation(
            "Die Eingabe ist unvollständig oder ungültig.",
        ));
    }
    if myfxbook::COMMANDS
        .iter()
        .any(|(command, _)| *command == name)
    {
        return myfxbook::dispatch(connection, name, args).await;
    }
    if system::COMMANDS.iter().any(|(command, _)| *command == name) {
        return system::dispatch(connection, name, args).await;
    }
    if transfer::COMMANDS
        .iter()
        .any(|(command, _)| *command == name)
    {
        return transfer::dispatch(connection, name, args).await;
    }
    if atlas::COMMANDS.iter().any(|(command, _)| *command == name) {
        return atlas::dispatch(connection, name, args).await;
    }
    if name == "list_central_bank_report_reads" {
        if args.as_object().is_none_or(|args| !args.is_empty()) {
            return Err(CloudError::validation("Ungültige Berichtsanfrage."));
        }
        return reports::read_markers(connection).await;
    }
    if name == "mark_central_bank_report_read" {
        return reports::mark_read(connection, args).await;
    }
    if media::COMMANDS.iter().any(|(command, _)| *command == name) {
        return media::dispatch(connection, name, args).await;
    }
    if trades::COMMANDS.iter().any(|(command, _)| *command == name) {
        return trades::dispatch(connection, name, args).await;
    }
    if journal::COMMANDS
        .iter()
        .any(|(command, _)| *command == name)
    {
        return journal::dispatch(connection, name, args).await;
    }
    if workspace::COMMANDS
        .iter()
        .any(|(command, _)| *command == name)
    {
        return workspace::dispatch(connection, name, args).await;
    }
    Err(CloudError::new(
        "COMMAND_UNAVAILABLE",
        "Diese Funktion ist im privaten Browser noch nicht verfügbar.",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::FutureExt;
    use std::panic::{AssertUnwindSafe, resume_unwind};

    #[test]
    fn allowlist_matches_module_dispatchers_without_duplicates() {
        let combined = [
            system::COMMANDS,
            transfer::COMMANDS,
            myfxbook::COMMANDS,
            trades::COMMANDS,
            journal::COMMANDS,
            workspace::COMMANDS,
            media::COMMANDS,
            atlas::COMMANDS,
            &[
                ("list_central_bank_report_reads", false),
                ("mark_central_bank_report_read", true),
            ],
        ]
        .concat();
        assert_eq!(combined.len(), 67);
        let expected: std::collections::BTreeMap<_, _> = COMMANDS.iter().copied().collect();
        let actual: std::collections::BTreeMap<_, _> = combined.into_iter().collect();
        assert_eq!(expected.len(), 67);
        assert_eq!(expected, actual);
    }

    #[test]
    fn database_errors_never_expose_their_original_detail() {
        let error = CloudError::from(sqlx::Error::Protocol("PRIVATE-JOURNAL-SECRET".into()));
        assert_eq!(error.code, "DATABASE_ERROR");
        assert!(!format!("{error:?}").contains("PRIVATE-JOURNAL-SECRET"));
        assert!(
            !serde_json::to_string(&error.to_command_error())
                .unwrap()
                .contains("PRIVATE-JOURNAL-SECRET")
        );
    }

    #[tokio::test]
    #[ignore = "Requires MACRO_TEST_ENV_FILE; creates and removes an isolated Neon schema"]
    async fn cloud_journal_workspace_contract_and_atomic_context_rollback() {
        let fixture = test_support::TestDatabase::open().await;
        let result = AssertUnwindSafe(async {
            let mut tx = fixture.pool.begin().await.unwrap();
            journal::tests::assert_journal_workspace_contract(&mut tx).await.unwrap();
            tx.commit().await.unwrap();
            let args = serde_json::json!({"accountId":"pg-contract-account-a","tradeId":"pg-contract-trade-a"});
            let mut before_tx = fixture.pool.begin().await.unwrap();
            let before = dispatch(&mut before_tx, "get_trade_context", &args).await.unwrap();
            before_tx.rollback().await.unwrap();
            let mut failed = fixture.pool.begin().await.unwrap();
            assert!(journal::tests::fail_after_replacing_context(&mut failed).await.is_err());
            failed.rollback().await.unwrap();
            let mut after_tx = fixture.pool.begin().await.unwrap();
            let after = dispatch(&mut after_tx, "get_trade_context", &args).await.unwrap();
            after_tx.rollback().await.unwrap();
            assert_eq!(after, before);
            assert_eq!(after["legs"][0]["id"], "pg-contract-leg");
            assert_eq!(after["tags"].as_array().unwrap().len(), 1);
            assert_eq!(after["checklistItems"].as_array().unwrap().len(), 3);
            assert_eq!(after["emotions"].as_array().unwrap().len(), 1);
        }).catch_unwind().await;
        fixture.close().await;
        if let Err(error) = result {
            resume_unwind(error);
        }
    }
}
