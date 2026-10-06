//! PostgreSQL persistence for the shared native Myfxbook reconciliation plan.
//! The caller owns the transaction and locks the journal revision before apply.
use super::{CloudError, CloudResult};
use crate::commands::myfxbook::{
    provider::Snapshot,
    reconcile::{Local, Plan},
};
use rust_decimal::Decimal;
use sqlx::PgConnection;
fn error(code: &str, message: &str) -> CloudError {
    CloudError::new(code, message)
}
pub async fn load(db: &mut PgConnection, account: &str) -> CloudResult<Local> {
    let (currency, initial): (String, i64) = sqlx::query_as(
        "SELECT base_currency, initial_balance_minor FROM accounts WHERE id=$1 AND NOT is_archived",
    )
    .bind(account)
    .fetch_optional(&mut *db)
    .await?
    .ok_or_else(|| {
        error(
            "MYFXBOOK_ACCOUNT",
            "Bitte ein aktives Journal-Konto auswählen.",
        )
    })?;
    let trades = sqlx::query_as("SELECT id,status,instrument,direction,opened_at,closed_at,actual_entry,actual_exit,quantity,net_pnl_minor,planned_risk_minor,source_metadata_json,source,is_deleted,updated_at FROM trades WHERE account_id=$1 ORDER BY id").bind(account).fetch_all(&mut *db).await?;
    let cashflows = sqlx::query_as("SELECT id,occurred_at,amount_minor,note FROM account_cashflows WHERE account_id=$1 ORDER BY id").bind(account).fetch_all(&mut *db).await?;
    let links = sqlx::query_as("SELECT source_key,trade_id,cashflow_id,initial_capital,payload_json FROM myfxbook_links WHERE account_id=$1 ORDER BY source_key").bind(account).fetch_all(&mut *db).await?;
    let connection = sqlx::query_as("SELECT * FROM myfxbook_connections WHERE account_id=$1")
        .bind(account)
        .fetch_optional(&mut *db)
        .await?;
    Ok(Local {
        account_id: account.into(),
        currency,
        initial,
        trades,
        cashflows,
        links,
        connection,
    })
}

pub async fn apply(
    db: &mut PgConnection,
    local: &Local,
    plan: &Plan,
    snapshot: &Snapshot,
    _timezone: &str,
    now: &str,
) -> CloudResult<()> {
    // The caller stores the cloud import receipt and normalized source rows in
    // cloud_myfxbook_imports within this transaction. Legacy desktop import
    // tables remain separately retained records, not new cloud write targets.
    for change in &plan.trades {
        let r = &change.record;
        let calculated = change
            .net
            .zip(change.risk)
            .filter(|(_, risk)| *risk > 0)
            .map(|(net, risk)| {
                (Decimal::from(net) / Decimal::from(risk))
                    .round_dp(4)
                    .normalize()
                    .to_string()
            });
        if change.existing {
            if local
                .trades
                .iter()
                .any(|t| t.id == change.id && t.status == "closed")
            {
                // Only fill a quantity previously imported as unavailable.
                // Historical results, execution timestamps and reviews stay fixed.
                sqlx::query("UPDATE trades SET quantity=$1, source_metadata_json=$2, updated_at=$3 WHERE id=$4 AND account_id=$5 AND status='closed' AND quantity IS NULL AND NOT is_deleted")
                    .bind(r.known_quantity()).bind(change.metadata.to_string()).bind(now).bind(&change.id).bind(&local.account_id).execute(&mut *db).await?;
            } else {
                sqlx::query("UPDATE trades SET status=$1, closed_at=$2, actual_exit=$3, net_pnl_minor=$4, calculated_r=$5, quantity=COALESCE(quantity,$6), source_metadata_json=$7, updated_at=$8 WHERE id=$9 AND account_id=$10 AND status='open' AND NOT is_deleted")
                    .bind(&r.kind).bind(&r.closed_at).bind(&r.exit).bind(change.net).bind(calculated).bind(r.known_quantity()).bind(change.metadata.to_string()).bind(now).bind(&change.id).bind(&local.account_id).execute(&mut *db).await?;
            }
        } else {
            let currencies = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"];
            let asset = if r.symbol.starts_with("XAU") || r.symbol.starts_with("XAG") {
                "metal"
            } else if r.symbol.is_ascii()
                && r.symbol.len() == 6
                && currencies.contains(&&r.symbol[..3])
                && currencies.contains(&&r.symbol[3..])
            {
                "forex"
            } else {
                "other"
            };
            let note = if r.known_quantity().is_some() {
                "<p>Automatisch aus Myfxbook übernommen. Positionsgröße gemäß Quelle; ursprünglicher Stop und ursprüngliches Risiko sind nicht belegt.</p>"
            } else {
                "<p>Automatisch aus Myfxbook übernommen. Myfxbook meldete beim Import die Positionsgröße 0; das Größenfeld wurde deshalb leer gelassen. Ursprünglicher Stop und ursprüngliches Risiko sind nicht belegt.</p>"
            };
            sqlx::query("INSERT INTO trades(id,account_id,status,instrument,asset_class,direction,opened_at,closed_at,actual_entry,actual_exit,quantity,take_profit,net_pnl_minor,source,source_metadata_json,created_at,updated_at,execution_notes_html) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'myfxbook_api',$14,$15,$16,$17)")
                .bind(&change.id).bind(&local.account_id).bind(&r.kind).bind(&r.symbol).bind(asset).bind(&r.direction).bind(&r.opened_at).bind(&r.closed_at).bind(&r.entry).bind(&r.exit).bind(r.known_quantity()).bind(&r.target).bind(change.net).bind(change.metadata.to_string()).bind(now).bind(now).bind(note).execute(&mut *db).await?;
        }
    }
    for (id, r) in &plan.flows {
        sqlx::query("INSERT INTO account_cashflows(id,account_id,occurred_at,amount_minor,kind,note,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)").bind(id).bind(&local.account_id).bind(&r.opened_at).bind(r.profit).bind(&r.kind).bind(format!("Myfxbook {} · {}",snapshot.account.id,r.key)).bind(now).execute(&mut *db).await?;
    }
    for link in &plan.links {
        sqlx::query("INSERT INTO myfxbook_links(account_id,source_key,trade_id,cashflow_id,initial_capital,payload_json) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(account_id,source_key) DO UPDATE SET payload_json=excluded.payload_json")
            .bind(&local.account_id).bind(&link.source_key).bind(&link.trade_id).bind(&link.cashflow_id).bind(link.initial_capital).bind(&link.payload_json).execute(&mut *db).await?;
    }
    Ok(())
}
