use serde_json::{Value, json};

use super::{
    AppState, CommandError, PreviewInput,
    provider::{Record, Snapshot},
    reconcile::{Local, LocalTrade},
};

const MAX_ROWS: usize = 100;
const REPORT_NAME: &str = "myfxbook-last-preview-error.json";

fn bounded(value: &str) -> String {
    value.chars().filter(|c| !c.is_control()).take(96).collect()
}

pub(super) fn record_fields(record: &Record) -> Value {
    let mut r = record.clone();
    r.symbol = bounded(&r.symbol);
    json!(r)
}

pub(super) fn trade_fields(t: &LocalTrade) -> Value {
    // Only execution data needed for reconciliation. Never write arbitrary
    // journal metadata, notes, media, credentials or cashflow descriptions.
    let metadata: Value = serde_json::from_str(&t.source_metadata_json).unwrap_or_default();
    let public_quantity = metadata
        .pointer("/myfxbook/sourceDisplayedLots")
        .or_else(|| metadata.pointer("/myfxbook/sourceRow/lots"))
        .and_then(Value::as_str)
        .map(bounded);
    json!({"id":t.id,"status":t.status,"instrument":bounded(&t.instrument),
            "direction":t.direction,"openedAt":t.opened_at,"closedAt":t.closed_at,
            "entry":t.actual_entry,"exit":t.actual_exit,"quantity":t.quantity,
            "publicSourceQuantity":public_quantity,"netPnlMinor":t.net_pnl_minor,
            "isDeleted":t.is_deleted})
}

fn journal_fields(local: &Local) -> Value {
    let trades: Vec<_> = local
        .trades
        .iter()
        .take(MAX_ROWS)
        .map(trade_fields)
        .collect();
    let cashflows: Vec<_> = local
        .cashflows
        .iter()
        .take(MAX_ROWS)
        .map(|f| json!({"id":f.id,"occurredAt":f.occurred_at,"amountMinor":f.amount_minor}))
        .collect();
    json!({"currency":local.currency,"initialBalanceMinor":local.initial,
        "tradeCount":local.trades.len(),"trades":trades,
        "cashflowCount":local.cashflows.len(),"cashflows":cashflows,"linkCount":local.links.len()})
}

pub(super) async fn save_preview_failure(
    state: &AppState,
    input: &PreviewInput,
    mut failure: CommandError,
    snapshot: Option<&Snapshot>,
    local: Option<&Local>,
) -> CommandError {
    if !matches!(
        failure.code.as_str(),
        "MYFXBOOK_AMBIGUOUS"
            | "MYFXBOOK_DATA"
            | "MYFXBOOK_LOCAL_CONFLICT"
            | "MYFXBOOK_LOCAL_DATA"
            | "MYFXBOOK_RECONCILE"
            | "MYFXBOOK_PNL"
            | "MYFXBOOK_COSTS"
            | "MYFXBOOK_MISSING_OPEN"
    ) {
        return failure;
    }
    let source = snapshot.map(|s| {
        json!({
            "currency":s.account.currency,"balanceMinor":s.account.balance_minor,
            "profitMinor":s.account.profit_minor,"capitalMinor":s.account.capital_minor,
            "historyCount":s.history_count,"recordCount":s.records.len(),
            "records":s.records.iter().take(MAX_ROWS).map(record_fields).collect::<Vec<_>>()
        })
    });
    // PreviewInput.authorization_id and Authorization.session are deliberately
    // not serializable through this report. This file stays in local AppData.
    let report = json!({"version":1,"createdAt":chrono::Utc::now().to_rfc3339(),
        "stage":if snapshot.is_some() {"reconciliation"} else {"source_data"},
        "journalAccountId":bounded(&input.account_id),"portfolioId":bounded(&input.external_id),
        "brokerTimezone":bounded(&input.broker_timezone),"error":failure,
        "source":source,"journal":local.map(journal_fields),"maxRowsPerList":MAX_ROWS});
    let Ok(bytes) = serde_json::to_vec_pretty(&report) else {
        return failure;
    };
    // Diagnostics must never replace the actual import error or allow a write
    // to the journal, even when the logs directory is unavailable or full.
    if bytes.len() <= 1_048_576
        && tokio::fs::write(state.paths.logs.join(REPORT_NAME), bytes)
            .await
            .is_ok()
    {
        let mut details = failure.details.take().unwrap_or_else(|| json!({}));
        if !details.is_object() {
            details = json!({"cause":details});
        }
        details["diagnosticFile"] = json!(REPORT_NAME);
        failure.details = Some(details);
        failure
            .message
            .push_str(" Ein lokaler Diagnosebericht wurde gespeichert.");
    }
    failure
}
