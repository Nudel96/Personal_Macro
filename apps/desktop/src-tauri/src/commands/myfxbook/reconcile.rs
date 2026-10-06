use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, SqliteConnection};
use std::{collections::BTreeSet, str::FromStr};
use uuid::Uuid;

use super::{
    Connection, Result, error,
    provider::{self, Record, Snapshot, minute},
};

#[derive(Clone, Serialize, FromRow)]
pub struct LocalTrade {
    pub id: String,
    pub status: String,
    pub instrument: String,
    pub direction: String,
    pub opened_at: Option<String>,
    pub closed_at: Option<String>,
    pub actual_entry: Option<String>,
    pub actual_exit: Option<String>,
    pub quantity: Option<String>,
    pub net_pnl_minor: Option<i64>,
    pub planned_risk_minor: Option<i64>,
    pub source_metadata_json: String,
    pub source: String,
    pub is_deleted: bool,
    pub updated_at: String,
}
#[derive(Clone, Serialize, FromRow)]
pub struct Cashflow {
    pub id: String,
    pub occurred_at: String,
    pub amount_minor: i64,
    pub note: Option<String>,
}
#[derive(Clone, Serialize, FromRow)]
pub struct Link {
    pub source_key: String,
    pub trade_id: Option<String>,
    pub cashflow_id: Option<String>,
    pub initial_capital: bool,
    pub payload_json: String,
}
#[derive(Clone, Serialize)]
pub struct Local {
    pub account_id: String,
    pub currency: String,
    pub initial: i64,
    pub trades: Vec<LocalTrade>,
    pub cashflows: Vec<Cashflow>,
    pub links: Vec<Link>,
    pub connection: Option<Connection>,
}
impl Local {
    pub fn fingerprint(&self) -> String {
        provider::hash(&serde_json::to_string(self).expect("serializable local snapshot"))
    }
}

pub async fn load(db: &mut SqliteConnection, account: &str) -> Result<Local> {
    let (currency, initial): (String, i64) = sqlx::query_as(
        "SELECT base_currency, initial_balance_minor FROM accounts WHERE id=? AND is_archived=0",
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
    let trades = sqlx::query_as("SELECT id,status,instrument,direction,opened_at,closed_at,actual_entry,actual_exit,quantity,net_pnl_minor,planned_risk_minor,source_metadata_json,source,is_deleted,updated_at FROM trades WHERE account_id=? ORDER BY id").bind(account).fetch_all(&mut *db).await?;
    let cashflows = sqlx::query_as("SELECT id,occurred_at,amount_minor,note FROM account_cashflows WHERE account_id=? ORDER BY id").bind(account).fetch_all(&mut *db).await?;
    let links = sqlx::query_as("SELECT source_key,trade_id,cashflow_id,initial_capital,payload_json FROM myfxbook_links WHERE account_id=? ORDER BY source_key").bind(account).fetch_all(&mut *db).await?;
    let connection = sqlx::query_as("SELECT * FROM myfxbook_connections WHERE account_id=?")
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

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub new_trades: usize,
    pub closed_trades: usize,
    pub matched_trades: usize,
    pub new_cashflows: usize,
    pub balance_minor: i64,
    pub profit_minor: i64,
    pub open_trades: usize,
    pub history_count: usize,
    pub warnings: Vec<String>,
}
#[derive(Clone)]
pub struct TradeChange {
    pub id: String,
    pub existing: bool,
    pub record: Record,
    pub net: Option<i64>,
    pub metadata: Value,
    pub risk: Option<i64>,
}
#[derive(Clone)]
pub struct Plan {
    pub fingerprint: String,
    pub mode: String,
    pub summary: Summary,
    pub trades: Vec<TradeChange>,
    pub flows: Vec<(String, Record)>,
    pub links: Vec<Link>,
}

fn decimal(value: &str) -> Option<Decimal> {
    Decimal::from_str(value).ok()
}
fn same_number(a: Option<&str>, b: &str) -> bool {
    a.and_then(decimal)
        .zip(decimal(b))
        .is_some_and(|(a, b)| a == b)
}
fn same_minute(a: Option<&str>, b: &str) -> bool {
    a.and_then(|a| minute(a).ok())
        .zip(minute(b).ok())
        .is_some_and(|(a, b)| a == b)
}
fn metadata(trade: &LocalTrade) -> Result<Value> {
    let bad_metadata = || {
        error(
            "MYFXBOOK_LOCAL_DATA",
            "Die Herkunftsdaten eines vorhandenen Journal-Trades sind ungültig. Bitte den lokalen Datensatz prüfen. Es wurde nichts importiert.",
        )
    };
    let m: Value = serde_json::from_str(&trade.source_metadata_json).map_err(|_| bad_metadata())?;
    if !m.is_object() {
        return Err(bad_metadata());
    }
    Ok(m)
}
fn overlap(t: &LocalTrade, r: &Record) -> bool {
    t.instrument == r.symbol
        && t.direction == r.direction
        && same_minute(t.opened_at.as_deref(), &r.opened_at)
}
fn imported_without_quantity(t: &LocalTrade) -> bool {
    t.quantity.is_none()
        && metadata(t).ok().is_some_and(|m| {
            m.pointer("/myfxbookApi/record/quantity")
                .and_then(Value::as_str)
                == Some("0")
        })
}
fn identity(t: &LocalTrade, r: &Record) -> bool {
    if !overlap(t, r) || !same_number(t.actual_entry.as_deref(), &r.entry) {
        return false;
    }
    // Missing source volume cannot disprove an otherwise unique match. Every
    // other execution field, duplicate candidate and account total is checked
    // by the planner. An unavailable journal size is only fillable if this
    // importer previously recorded the explicit zero from the source.
    if r.known_quantity().is_none() || imported_without_quantity(t) {
        return true;
    }
    let m = metadata(t).unwrap_or_default();
    let source_quantity = m
        .pointer("/myfxbook/sourceDisplayedLots")
        .and_then(Value::as_str)
        .or_else(|| {
            m.pointer("/myfxbook/sourceRow/lots")
                .and_then(Value::as_str)
        });
    same_number(t.quantity.as_deref(), &r.quantity) || same_number(source_quantity, &r.quantity)
}

fn quantity_only_transition(old: &Record, new: &Record) -> bool {
    if old.kind != "closed" || new.kind != "closed" || (old.quantity != "0" && new.quantity != "0")
    {
        return false;
    }
    let mut old = old.clone();
    old.key.clone_from(&new.key);
    old.quantity.clone_from(&new.quantity);
    old == *new
}

fn same_source_with_changed_quantity_availability(old: &Record, new: &Record) -> bool {
    matches!(old.kind.as_str(), "open" | "closed")
        && matches!(new.kind.as_str(), "open" | "closed")
        && (old.quantity == "0" || new.quantity == "0")
        && old.symbol == new.symbol
        && old.direction == new.direction
        && same_minute(Some(&old.opened_at), &new.opened_at)
        && old.entry == new.entry
        && old.sizing_type == new.sizing_type
}
fn net(record: &Record, mode: &str) -> Result<Option<i64>> {
    if record.kind != "closed" {
        return Ok(None);
    }
    let profit = record.profit.ok_or_else(provider::invalid)?;
    Ok(Some(if mode == "net" {
        profit
    } else {
        profit
            .checked_add(record.costs.ok_or_else(||error("MYFXBOOK_COSTS", "Für die Bruttoberechnung fehlen Kostenangaben (interest oder commission) in der Myfxbook-Historie. Fehlende Kosten werden nicht als null angenommen. Bitte den Brokerbericht prüfen."))?)
            .ok_or_else(provider::invalid)?
    }))
}
fn mismatch() -> super::CommandError {
    error(
        "MYFXBOOK_RECONCILE",
        "Journal und Myfxbook lassen sich noch nicht vollständig abstimmen. Bitte Brokerzeitzone, Startkapital und fehlende Trades/Einzahlungen anhand eines vollständigen Berichts prüfen. Es wurde nichts importiert.",
    )
}

fn journal_match_error(
    snapshot: &Snapshot,
    index: usize,
    reason: &str,
    message: &str,
    candidates: &[&LocalTrade],
) -> super::CommandError {
    let record = &snapshot.records[index];
    let open = record.kind == "open";
    let scope = if open { "offene Trades" } else { "Historie" };
    let row = snapshot.records[..=index]
        .iter()
        .filter(|r| (r.kind == "open") == open)
        .count();
    let mut failure = error(
        "MYFXBOOK_AMBIGUOUS",
        &format!("Myfxbook {scope}, Eintrag {row}: {message} Es wurde nichts importiert."),
    );
    failure.details = Some(json!({"reason":reason,"scope":scope,"row":row,
        "record":super::diagnostics::record_fields(record),"candidateCount":candidates.len(),
        "journalCandidates":candidates.iter().take(10).map(|t| super::diagnostics::trade_fields(t)).collect::<Vec<_>>() }));
    failure
}

pub fn plan(local: &Local, snapshot: &Snapshot) -> Result<Plan> {
    provider::ensure_unique(&snapshot.records)?;
    if local.currency != snapshot.account.currency {
        return Err(error(
            "MYFXBOOK_CURRENCY",
            "Die Kontowährung stimmt nicht mit Myfxbook überein. Eine automatische Umrechnung findet nicht statt.",
        ));
    }
    if let Some(connection) = &local.connection {
        if connection.external_id != snapshot.account.id {
            return Err(error(
                "MYFXBOOK_ACCOUNT",
                "Dieses Journal-Konto ist bereits einem anderen Myfxbook-Portfolio zugeordnet.",
            ));
        }
        let previous: Vec<String> =
            serde_json::from_str(&connection.history_keys_json).map_err(|_| provider::invalid())?;
        if !previous.is_empty()
            && !previous
                .iter()
                .any(|key| snapshot.history_keys.contains(key))
            && !local.links.iter().any(|link| {
                serde_json::from_str::<Record>(&link.payload_json)
                    .ok()
                    .is_some_and(|old| {
                        previous.contains(&old.key)
                            && snapshot
                                .records
                                .iter()
                                .any(|r| quantity_only_transition(&old, r))
                    })
            })
        {
            return Err(error(
                "MYFXBOOK_GAP",
                "Keine Überlappung zur zuletzt geprüften Historie: Myfxbook liefert höchstens 50 Transaktionen. Bitte die fehlende Historie per Brokerbericht nachtragen und die Verbindung erneut prüfen.",
            ));
        }
    }
    if let Some(c) = &local.connection
        && c.pnl_mode != "auto"
    {
        return plan_mode(local, snapshot, &c.pnl_mode);
    }
    // The provider does not define profit-vs-cost semantics precisely. Resolve only
    // through existing trade evidence AND exact account profit/capital/balance totals.
    let a = plan_mode(local, snapshot, "net");
    let b = plan_mode(local, snapshot, "gross");
    match (a, b) {
        (Ok(mut a), Ok(_)) => {
            if snapshot
                .records
                .iter()
                .all(|r| net(r, "net").ok() == net(r, "gross").ok())
            {
                // Zero costs provide no evidence about future profit semantics.
                a.mode = "auto".into();
                Ok(a)
            } else {
                Err(error(
                    "MYFXBOOK_PNL",
                    "Die Ergebnisberechnung ist nicht eindeutig. Bitte die Kosten im Brokerbericht prüfen.",
                ))
            }
        }
        (Ok(p), Err(_)) | (Err(_), Ok(p)) => Ok(p),
        (Err(e), Err(_)) => Err(e),
    }
}

fn plan_mode(local: &Local, snapshot: &Snapshot, mode: &str) -> Result<Plan> {
    let mut result=Plan { fingerprint:local.fingerprint(),mode:mode.into(),summary: Summary{new_trades:0,closed_trades:0,matched_trades:0,new_cashflows:0,balance_minor:snapshot.account.balance_minor,profit_minor:snapshot.account.profit_minor,open_trades:0,history_count:snapshot.history_count,warnings:vec!["API-Zeiten besitzen meist nur Minutengenauigkeit. Bei identischen Einstiegen oder Teilschließungen ist ein Brokerbericht nötig.".into()]},trades:vec![],flows:vec![],links:vec![] };
    let mut used_trades = BTreeSet::new();
    let mut used_flows = BTreeSet::new();
    let mut pnl = 0_i64;
    let mut capital = local.initial;
    for t in &local.trades {
        if !t.is_deleted && t.status == "closed" {
            pnl = pnl
                .checked_add(t.net_pnl_minor.ok_or_else(mismatch)?)
                .ok_or_else(mismatch)?;
        }
    }
    for f in &local.cashflows {
        capital = capital.checked_add(f.amount_minor).ok_or_else(mismatch)?;
    }
    let mut initial_used = local.links.iter().any(|l| l.initial_capital);
    let earliest_deposit = snapshot
        .records
        .iter()
        .filter(|r| r.kind == "deposit")
        .min_by_key(|r| minute(&r.opened_at).unwrap_or(i64::MAX))
        .map(|r| r.key.as_str());
    for (index, r) in snapshot.records.iter().enumerate() {
        let prior_links: Vec<_> = local
            .links
            .iter()
            .filter(|l| {
                l.source_key == r.key
                    || serde_json::from_str::<Record>(&l.payload_json)
                        .ok()
                        .is_some_and(|old| {
                            old.key == r.key
                                || same_source_with_changed_quantity_availability(&old, r)
                        })
            })
            .collect();
        if prior_links.len() > 1 {
            return Err(provider::ambiguous());
        }
        let prior = prior_links.first().copied();
        let mut link = Link {
            source_key: r.key.clone(),
            trade_id: None,
            cashflow_id: None,
            initial_capital: false,
            payload_json: serde_json::to_string(r).map_err(|_| provider::invalid())?,
        };
        if matches!(r.kind.as_str(), "deposit" | "withdrawal") {
            let amount = r.profit.ok_or_else(provider::invalid)?;
            if let Some(p) = prior {
                if p.initial_capital {
                    link.initial_capital = true;
                } else if let Some(id) = &p.cashflow_id {
                    if !local.cashflows.iter().any(|f| {
                        &f.id == id
                            && f.amount_minor == amount
                            && same_minute(Some(&f.occurred_at), &r.opened_at)
                    }) {
                        return Err(mismatch());
                    }
                    link.cashflow_id = Some(id.clone());
                } else {
                    return Err(provider::ambiguous());
                }
            } else {
                let candidates: Vec<_> = local
                    .cashflows
                    .iter()
                    .filter(|f| {
                        f.amount_minor == amount && same_minute(Some(&f.occurred_at), &r.opened_at)
                    })
                    .collect();
                if candidates.len() > 1 {
                    return Err(provider::ambiguous());
                }
                if let Some(f) = candidates.first() {
                    link.cashflow_id = Some(f.id.clone());
                } else if !initial_used
                    && r.kind == "deposit"
                    && amount == local.initial
                    && earliest_deposit == Some(r.key.as_str())
                {
                    initial_used = true;
                    link.initial_capital = true;
                } else {
                    let id = Uuid::new_v4().to_string();
                    link.cashflow_id = Some(id.clone());
                    capital = capital.checked_add(amount).ok_or_else(mismatch)?;
                    result.flows.push((id, r.clone()));
                    result.summary.new_cashflows += 1;
                }
            }
            if let Some(id) = &link.cashflow_id
                && !used_flows.insert(id.clone())
            {
                return Err(provider::ambiguous());
            }
        } else {
            let candidates: Vec<_> = if r.known_quantity().is_none() {
                // A prior key containing zero is not enough to choose between
                // multiple journal candidates with different known quantities.
                local.trades.iter().filter(|t| identity(t, r)).collect()
            } else if let Some(p) = prior {
                local
                    .trades
                    .iter()
                    .filter(|t| Some(&t.id) == p.trade_id.as_ref())
                    .collect()
            } else {
                local.trades.iter().filter(|t| identity(t, r)).collect()
            };
            if candidates.len() > 1 {
                return Err(journal_match_error(
                    snapshot,
                    index,
                    "multiple_journal_candidates",
                    "Mehrere Journal-Trades passen zu den verfügbaren Einstiegsangaben. Eine eindeutige Zuordnung ist nicht möglich.",
                    &candidates,
                ));
            }
            let existing = candidates.first().copied();
            if prior.is_some_and(|p| !existing.is_some_and(|t| p.trade_id.as_ref() == Some(&t.id)))
            {
                return Err(error(
                    "MYFXBOOK_LOCAL_CONFLICT",
                    "Ein zugehöriger Trade wurde lokal gelöscht oder verändert. Bitte den Konflikt im Journal prüfen; er wird nicht automatisch überschrieben.",
                ));
            }
            if existing.is_none() {
                let overlapping: Vec<_> =
                    local
                        .trades
                        .iter()
                        .filter(|t| {
                            overlap(t, r)
                                && !snapshot.records.iter().enumerate().any(
                                    |(other_index, other)| {
                                        // A distinct entry is only new when the overlapping
                                        // journal position is separately present in this
                                        // same snapshot. Otherwise a local price edit or an
                                        // unexplained provider change must remain a conflict.
                                        other_index != index && identity(t, other)
                                    },
                                )
                        })
                        .collect();
                if !overlapping.is_empty() {
                    let (reason, message) = if overlapping
                        .iter()
                        .any(|t| same_number(t.actual_entry.as_deref(), &r.entry))
                    {
                        (
                            "quantity_mismatch",
                            "Zur Einstiegsminute und zum Einstiegspreis existiert ein Journal-Trade, dessen Positionsgröße nicht eindeutig zur API-Angabe passt.",
                        )
                    } else {
                        (
                            "entry_price_mismatch",
                            "Zur selben Einstiegsminute existiert ein Journal-Trade mit abweichendem Einstiegspreis.",
                        )
                    };
                    return Err(journal_match_error(
                        snapshot,
                        index,
                        reason,
                        message,
                        &overlapping,
                    ));
                }
            }
            let value = net(r, mode)?;
            let id = existing
                .map(|t| t.id.clone())
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            if !used_trades.insert(id.clone()) {
                return Err(provider::ambiguous());
            }
            link.trade_id = Some(id.clone());
            if let Some(known_link) = local
                .links
                .iter()
                .find(|l| l.trade_id.as_ref() == Some(&id))
            {
                // Volume availability can change the provider-derived key.
                // Preserve one stable link per proven journal position.
                link.source_key.clone_from(&known_link.source_key);
            }
            let mut m = if let Some(t) = existing {
                if t.is_deleted
                    || !matches!(t.status.as_str(), "open" | "closed")
                    || !identity(t, r)
                {
                    return Err(error(
                        "MYFXBOOK_LOCAL_CONFLICT",
                        "Ein zugehöriger Trade wurde lokal gelöscht oder verändert. Bitte den Konflikt im Journal prüfen; er wird nicht automatisch überschrieben.",
                    ));
                }
                result.summary.matched_trades += 1;
                let m = metadata(t)?;
                if m.pointer("/myfxbook/portfolioId")
                    .and_then(Value::as_str)
                    .is_some_and(|id| id != snapshot.account.id)
                {
                    return Err(provider::ambiguous());
                }
                if t.status == "closed" {
                    if r.kind != "closed"
                        || t.net_pnl_minor != value
                        || !same_minute(
                            t.closed_at.as_deref(),
                            r.closed_at.as_deref().ok_or_else(provider::invalid)?,
                        )
                        || !same_number(
                            t.actual_exit.as_deref(),
                            r.exit.as_deref().ok_or_else(provider::invalid)?,
                        )
                    {
                        return Err(error(
                            "MYFXBOOK_LOCAL_CONFLICT",
                            "Ein bereits abgeschlossener Trade weicht von Myfxbook ab. Bitte den Trade prüfen; seine Journalwerte bleiben erhalten.",
                        ));
                    }
                    if imported_without_quantity(t) && r.known_quantity().is_some() {
                        let mut m = m;
                        m["myfxbookApi"]["record"] = json!(r);
                        m["myfxbookApi"]["sourceKey"] = json!(r.key);
                        m["myfxbookApi"]["quantityAvailable"] = json!(true);
                        result.trades.push(TradeChange {
                            id: id.clone(),
                            existing: true,
                            record: r.clone(),
                            net: value,
                            metadata: m,
                            risk: t.planned_risk_minor,
                        });
                    }
                    result.links.push(link);
                    continue;
                }
                if r.kind == "closed" {
                    result.summary.closed_trades += 1;
                }
                m
            } else {
                result.summary.new_trades += 1;
                json!({"platform":"myfxbook","statementCurrency":local.currency,"targetAccountCurrency":local.currency,"costBreakdownAvailable":false})
            };
            if r.kind == "open" {
                result.summary.open_trades += 1;
            }
            if let Some(value) = value {
                pnl = pnl.checked_add(value).ok_or_else(mismatch)?;
            }
            // Preserve original risk, all review fields and prior public-import provenance.
            m["myfxbookApi"] = json!({"portfolioId":snapshot.account.id,"sourceKey":r.key,"record":r,"pnlMode":mode,"quantityBasis":r.sizing_type,"quantityAvailable":r.known_quantity().is_some(),"originalRiskAvailable":false});
            if let Some(stop) = &r.stop {
                m["finalStopLoss"] = json!(stop);
            }
            m["statementProvidesNetPnl"] = json!(r.kind == "closed");
            if !existing.is_some_and(|t| r.kind == "open" && metadata(t).ok().as_ref() == Some(&m))
            {
                result.trades.push(TradeChange {
                    id,
                    existing: existing.is_some(),
                    record: r.clone(),
                    net: value,
                    metadata: m,
                    risk: existing.and_then(|t| t.planned_risk_minor),
                });
            }
        }
        result.links.push(link);
    }
    if local
        .trades
        .iter()
        .any(|t| !t.is_deleted && t.status == "open" && !used_trades.contains(&t.id))
    {
        return Err(error(
            "MYFXBOOK_MISSING_OPEN",
            "Eine lokal offene Position fehlt in den Myfxbook-Antworten. Ein Abschluss wird nicht geraten; bitte Historie oder Brokerbericht prüfen.",
        ));
    }
    if pnl != snapshot.account.profit_minor
        || capital != snapshot.account.capital_minor
        || capital.checked_add(pnl) != Some(snapshot.account.balance_minor)
    {
        return Err(mismatch());
    }
    if snapshot.history_count == 50 {
        result.summary.warnings.push("Die API liefert genau 50 Transaktionen. Ältere Trades müssen bereits vollständig im Journal stehen; weitere Lücken stoppen den Abgleich.".into());
    }
    let unknown_sizes = snapshot
        .records
        .iter()
        .filter(|r| matches!(r.kind.as_str(), "open" | "closed") && r.known_quantity().is_none())
        .count();
    if unknown_sizes > 0 {
        result.summary.warnings.push(format!("Myfxbook meldet bei {unknown_sizes} Position(en) die Größe 0. Die tatsächliche Größe ist damit unbekannt. Vorhandene Journalgrößen bleiben erhalten; bei neuen Trades bleibt die Größe leer. Zeiten, Preise, Ergebnisse und Kontosummen wurden trotzdem abgeglichen."));
    }
    if snapshot.records.iter().any(|r| r.symbol == "XTIUSD") {
        result.summary.warnings.push("Öl-Positionsgrößen bleiben Myfxbook-Quellangaben. Bereits korrigierte Journalgrößen werden erhalten.".into());
    }
    Ok(result)
}

pub async fn apply(
    db: &mut SqliteConnection,
    local: &Local,
    plan: &Plan,
    snapshot: &Snapshot,
    timezone: &str,
    now: &str,
) -> Result<()> {
    let run = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO import_runs(id,source_type,status,mapping_json,total_rows,valid_rows,report_json,created_at,committed_at,target_account_id,source_timezone) VALUES (?,'myfxbook_api','committed',?,?,?, ?,?,?,?,?)")
        .bind(&run).bind(json!({"pnlMode":plan.mode,"identity":"unique normalized entry; ambiguous rows rejected"}).to_string()).bind(snapshot.records.len() as i64).bind(snapshot.records.len() as i64).bind(serde_json::to_string(&plan.summary).map_err(|_|provider::invalid())?).bind(now).bind(now).bind(&local.account_id).bind(timezone).execute(&mut *db).await?;
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
                sqlx::query("UPDATE trades SET quantity=?, source_metadata_json=?, updated_at=? WHERE id=? AND account_id=? AND status='closed' AND quantity IS NULL AND is_deleted=0")
                    .bind(r.known_quantity()).bind(change.metadata.to_string()).bind(now).bind(&change.id).bind(&local.account_id).execute(&mut *db).await?;
            } else {
                sqlx::query("UPDATE trades SET status=?, closed_at=?, actual_exit=?, net_pnl_minor=?, calculated_r=?, quantity=COALESCE(quantity,?), source_metadata_json=?, updated_at=? WHERE id=? AND account_id=? AND status='open' AND is_deleted=0")
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
            sqlx::query("INSERT INTO trades(id,account_id,status,instrument,asset_class,direction,opened_at,closed_at,actual_entry,actual_exit,quantity,take_profit,net_pnl_minor,source,source_metadata_json,created_at,updated_at,execution_notes_html) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'myfxbook_api',?,?,?,?)")
                .bind(&change.id).bind(&local.account_id).bind(&r.kind).bind(&r.symbol).bind(asset).bind(&r.direction).bind(&r.opened_at).bind(&r.closed_at).bind(&r.entry).bind(&r.exit).bind(r.known_quantity()).bind(&r.target).bind(change.net).bind(change.metadata.to_string()).bind(now).bind(now).bind(note).execute(&mut *db).await?;
        }
    }
    for (id, r) in &plan.flows {
        sqlx::query("INSERT INTO account_cashflows(id,account_id,occurred_at,amount_minor,kind,note,created_at) VALUES (?,?,?,?,?,?,?)").bind(id).bind(&local.account_id).bind(&r.opened_at).bind(r.profit).bind(&r.kind).bind(format!("Myfxbook {} · {}",snapshot.account.id,r.key)).bind(now).execute(&mut *db).await?;
    }
    for (i, link) in plan.links.iter().enumerate() {
        sqlx::query("INSERT INTO myfxbook_links(account_id,source_key,trade_id,cashflow_id,initial_capital,payload_json) VALUES (?,?,?,?,?,?) ON CONFLICT(account_id,source_key) DO UPDATE SET payload_json=excluded.payload_json")
            .bind(&local.account_id).bind(&link.source_key).bind(&link.trade_id).bind(&link.cashflow_id).bind(link.initial_capital).bind(&link.payload_json).execute(&mut *db).await?;
        sqlx::query("INSERT INTO import_rows(id,import_run_id,row_number,status,raw_json,normalized_json) VALUES (?,?,?,'reconciled',?,?)").bind(Uuid::new_v4().to_string()).bind(&run).bind(i as i64+1).bind(&link.payload_json).bind(json!({"tradeId":link.trade_id,"cashflowId":link.cashflow_id,"initialCapital":link.initial_capital}).to_string()).execute(&mut *db).await?;
    }
    Ok(())
}
