use chrono::{NaiveDateTime, TimeZone, Utc};
use chrono_tz::Tz;
use rust_decimal::{Decimal, prelude::ToPrimitive};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    str::FromStr,
    time::Duration,
};

use super::{Result, error};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteAccount {
    pub id: String,
    pub name: String,
    pub currency: String,
    pub balance_minor: i64,
    pub profit_minor: i64,
    pub capital_minor: i64,
    pub updated_at: String,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub key: String,
    pub kind: String,
    pub symbol: String,
    pub direction: String,
    pub opened_at: String,
    pub closed_at: Option<String>,
    pub quantity: String,
    pub sizing_type: String,
    pub entry: String,
    pub exit: Option<String>,
    pub stop: Option<String>,
    pub target: Option<String>,
    pub profit: Option<i64>,
    pub costs: Option<i64>,
}

impl Record {
    // Retain the normalized source value in the audit payload/key. Zero is
    // not an executable position size and must never become a journal quantity.
    pub fn known_quantity(&self) -> Option<&str> {
        (!self.quantity.is_empty() && self.quantity != "0").then_some(self.quantity.as_str())
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub account: RemoteAccount,
    pub records: Vec<Record>,
    pub history_keys: Vec<String>,
    pub history_count: usize,
}

pub fn number(value: &Value) -> Result<Decimal> {
    let raw = match value {
        Value::String(s) => s.trim().to_string(),
        Value::Number(n) => n.to_string(),
        _ => return Err(invalid()),
    };
    if raw.len() > 80 {
        return Err(invalid());
    }
    Decimal::from_str(&raw).map_err(|_| invalid())
}

pub fn money(value: &Value) -> Result<i64> {
    let amount = number(value)?
        .checked_mul(Decimal::from(100))
        .ok_or_else(invalid)?;
    // Tolerate serialization noise far below a cent, never actual sub-cent
    // amounts. For example 0.14000000000000001 still means exactly 14 cents.
    let rounded = amount.round();
    if (amount - rounded).abs() > Decimal::new(1, 8) {
        return Err(invalid());
    }
    rounded.to_i64().ok_or_else(invalid)
}

pub fn hash(value: &str) -> String {
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn invalid() -> super::CommandError {
    error(
        "MYFXBOOK_DATA",
        "Myfxbook liefert unvollständige oder unerwartete Daten. Es wurde nichts importiert.",
    )
}

// Only fixed schema names and row numbers enter these errors. Never echo a
// response value, URL, session, password or an arbitrary provider message.
#[derive(Clone, Copy)]
struct Context<'a> {
    scope: &'a str,
    row: Option<usize>,
}
impl Context<'_> {
    fn bad(self, field: &str, reason: &str) -> super::CommandError {
        let position = self
            .row
            .map(|n| format!(", Eintrag {n}"))
            .unwrap_or_default();
        let mut failure = error(
            "MYFXBOOK_DATA",
            &format!(
                "Myfxbook {}{position}, Feld „{field}“: {reason} Es wurde nichts importiert.",
                self.scope
            ),
        );
        failure.details =
            Some(serde_json::json!({"scope":self.scope,"row":self.row,"field":field}));
        failure
    }
    fn text<'a>(self, row: &'a Value, field: &str) -> Result<&'a str> {
        text(row, field).map_err(|_| {
            self.bad(
                field,
                "Ein erforderlicher Text fehlt oder hat ein unerwartetes Format.",
            )
        })
    }
    fn amount(self, value: &Value, field: &str) -> Result<i64> {
        money(value).map_err(|_| {
            self.bad(
                field,
                "Der Geldbetrag fehlt, ist ungültig oder enthält echte Bruchteile eines Cents.",
            )
        })
    }
    fn time(self, row: &Value, field: &str, timezone: Tz) -> Result<String> {
        let value = self.text(row, field)?;
        timestamp(value, timezone).map_err(|e| {
            if e.code == "MYFXBOOK_TIMEZONE" {
                e
            } else {
                self.bad(field, "Datum fehlt oder hat ein unerwartetes Format (erwartet MM/TT/JJJJ hh:mm oder ein ISO-Datum).")
            }
        })
    }
    fn price(self, row: &Value, field: &str, required: bool) -> Result<Option<String>> {
        let value = price(row, field)
            .map_err(|_| self.bad(field, "Der Preis ist ungültig; erwartet wird eine Zahl."))?;
        if required && value.is_none() {
            return Err(self.bad(field, "Ein erforderlicher Ausführungspreis fehlt."));
        }
        Ok(value)
    }
}

fn empty(value: Option<&Value>) -> bool {
    matches!(value, None | Some(Value::Null))
        || matches!(value,Some(Value::String(s)) if s.trim().is_empty())
}

fn text<'a>(value: &'a Value, key: &str) -> Result<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty() && v.len() <= 200)
        .ok_or_else(invalid)
}

pub fn timestamp(value: &str, timezone: Tz) -> Result<String> {
    let value = value.trim();
    if let Ok(date) = chrono::DateTime::parse_from_rfc3339(value) {
        return Ok(date.with_timezone(&Utc).to_rfc3339());
    }
    let date = [
        "%m/%d/%Y %H:%M:%S%.f",
        "%m/%d/%Y %H:%M",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S%.f",
    ]
    .iter()
    .find_map(|format| NaiveDateTime::parse_from_str(value, format).ok())
    .ok_or_else(invalid)?;
    let date = timezone.from_local_datetime(&date).single().ok_or_else(|| error("MYFXBOOK_TIMEZONE", "Eine Brokerzeit ist durch die Zeitumstellung mehrdeutig oder ungültig. Bitte den Bericht prüfen."))?;
    Ok(date.with_timezone(&Utc).to_rfc3339())
}

pub fn minute(value: &str) -> Result<i64> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|t| t.timestamp().div_euclid(60))
        .map_err(|_| invalid())
}

fn price(row: &Value, key: &str) -> Result<Option<String>> {
    if empty(row.get(key)) {
        return Ok(None);
    }
    match row.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(v) => {
            let d = number(v)?;
            if d < Decimal::ZERO {
                return Err(invalid());
            }
            Ok((!d.is_zero()).then(|| d.normalize().to_string()))
        }
    }
}

pub fn parse_records(data: &Value, field: &str, timezone: Tz) -> Result<Vec<Record>> {
    let scope = if field == "history" {
        "Historie"
    } else {
        "offene Trades"
    };
    let context = Context { scope, row: None };
    let array = data
        .get(field)
        .and_then(Value::as_array)
        .ok_or_else(|| context.bad(field, "Die erwartete Liste fehlt in der API-Antwort."))?;
    if array.len() > 5000 || (field == "history" && array.len() > 50) {
        return Err(context.bad(
            field,
            "Die API-Antwort überschreitet die unterstützte Anzahl von Einträgen.",
        ));
    }
    let mut records = Vec::new();
    for (index, row) in array.iter().enumerate() {
        let context = Context {
            scope,
            row: Some(index + 1),
        };
        let action = context.text(row, "action")?.to_ascii_lowercase();
        let cash = matches!(action.as_str(), "deposit" | "withdrawal");
        let direction = match action.as_str() {
            "buy" | "buy limit" | "buy stop" => "long",
            "sell" | "sell limit" | "sell stop" => "short",
            "deposit" | "withdrawal" if field == "history" => "",
            _ => {
                return Err(error(
                    "MYFXBOOK_ACTION",
                    "Eine Buchungsart von Myfxbook wird noch nicht unterstützt. Bitte den Kontoauszug prüfen.",
                ));
            }
        };
        // Balance entries have no position opening. If only their booking/close
        // time is populated, use that explicit timestamp instead of inventing one.
        let open_field = if cash && empty(row.get("openTime")) {
            "closeTime"
        } else {
            "openTime"
        };
        let opened_at = context.time(row, open_field, timezone)?;
        let closed_at = if field == "history" && !cash {
            Some(context.time(row, "closeTime", timezone)?)
        } else {
            None
        };
        if closed_at
            .as_ref()
            .is_some_and(|t| minute(t).unwrap_or(0) < minute(&opened_at).unwrap_or(0))
        {
            return Err(context.bad("closeTime", "Der Abschluss liegt vor dem Einstieg."));
        }
        let symbol = if cash {
            String::new()
        } else {
            context.text(row, "symbol")?.to_string()
        };
        let (quantity, sizing_type, entry) = if cash {
            (String::new(), String::new(), String::new())
        } else {
            let sizing = row
                .get("sizing")
                .ok_or_else(|| context.bad("sizing", "Die Positionsgröße fehlt."))?;
            let unit = text(sizing, "type")
                .map_err(|_| context.bad("sizing.type", "Die Einheit der Positionsgröße fehlt."))?
                .to_ascii_lowercase();
            if !matches!(unit.as_str(), "lots" | "units") {
                return Err(context.bad("sizing.type", "Erwartet wird lots oder units."));
            }
            let quantity = number(&sizing["value"]).map_err(|_| {
                context.bad(
                    "sizing.value",
                    "Die Positionsgröße fehlt oder ist keine Zahl.",
                )
            })?;
            if quantity < Decimal::ZERO {
                return Err(context.bad(
                    "sizing.value",
                    "Die Positionsgröße darf nicht negativ sein.",
                ));
            }
            (
                quantity.normalize().to_string(),
                unit.to_string(),
                context.price(row, "openPrice", true)?.ok_or_else(invalid)?,
            )
        };
        let profit = if field == "history" {
            Some(context.amount(&row["profit"], "profit")?)
        } else {
            None
        };
        if cash
            && ((action == "deposit" && profit <= Some(0))
                || (action == "withdrawal" && profit >= Some(0)))
        {
            return Err(context.bad(
                "profit",
                "Einzahlungen müssen positiv und Auszahlungen negativ sein.",
            ));
        }
        let costs = if !cash && field == "history" {
            let interest = if empty(row.get("interest")) {
                None
            } else {
                Some(context.amount(&row["interest"], "interest")?)
            };
            let commission = if empty(row.get("commission")) {
                None
            } else {
                Some(context.amount(&row["commission"], "commission")?)
            };
            interest
                .zip(commission)
                .map(|(a, b)| {
                    a.checked_add(b).ok_or_else(|| {
                        context.bad("interest/commission", "Die Kostensumme ist zu groß.")
                    })
                })
                .transpose()?
        } else {
            None
        };
        // The API documents no stable transaction ID. Ambiguous identities are rejected.
        let key = hash(
            &serde_json::to_string(&(
                cash,
                &symbol,
                direction,
                minute(&opened_at)?,
                &quantity,
                &sizing_type,
                &entry,
                cash.then_some(profit),
            ))
            .map_err(|_| invalid())?,
        );
        records.push(Record {
            key,
            kind: if cash {
                action
            } else if field == "history" {
                "closed".into()
            } else {
                "open".into()
            },
            symbol,
            direction: direction.into(),
            opened_at,
            closed_at,
            quantity,
            sizing_type,
            entry,
            exit: if field == "history" && !cash {
                Some(
                    context
                        .price(row, "closePrice", true)?
                        .ok_or_else(invalid)?,
                )
            } else {
                None
            },
            stop: if cash {
                None
            } else {
                context.price(row, "sl", false)?
            },
            target: if cash {
                None
            } else {
                context.price(row, "tp", false)?
            },
            profit,
            costs,
        });
    }
    ensure_unique(&records)?;
    Ok(records)
}

pub fn ambiguous() -> super::CommandError {
    error(
        "MYFXBOOK_AMBIGUOUS",
        "Trades sind nicht eindeutig zuordenbar (z. B. gleiche Einstiegsminute oder Teilschließung). Bitte einen vollständigen Brokerbericht importieren und erneut prüfen.",
    )
}

pub fn ensure_unique(records: &[Record]) -> Result<()> {
    let mut identities = BTreeMap::new();
    for (index, r) in records.iter().enumerate() {
        // Distinct execution prices distinguish separate entries in the same
        // minute. Quantity and close details alone cannot distinguish a partial
        // close from another position, so identical entry prices still block.
        let identity = if matches!(r.kind.as_str(), "open" | "closed") {
            serde_json::to_string(&(&r.symbol, &r.direction, minute(&r.opened_at)?, &r.entry))
                .map_err(|_| invalid())?
        } else {
            r.key.clone()
        };
        if let Some(first) = identities.insert(identity, index) {
            let source_row = |i: usize| {
                let open = records[i].kind == "open";
                let row = records[..=i]
                    .iter()
                    .filter(|r| (r.kind == "open") == open)
                    .count();
                (if open { "Offene Trades" } else { "Historie" }, row)
            };
            let (first_scope, first_row) = source_row(first);
            let (scope, row) = source_row(index);
            let mut failure = error(
                "MYFXBOOK_AMBIGUOUS",
                &format!(
                    "Myfxbook {first_scope}, Eintrag {first_row}, und {scope}, Eintrag {row}: Instrument, Richtung, Einstiegsminute und Einstiegspreis sind identisch oder dieselbe Kapitalbuchung liegt mehrfach vor. Unterschiedliche Mengen oder Abschlüsse allein belegen keine getrennten Positionen. Es wurde nichts importiert."
                ),
            );
            failure.details = Some(serde_json::json!({"reason":"duplicate_source_identity",
                "firstScope":first_scope,"firstRow":first_row,"scope":scope,"row":row,
                "records":[super::diagnostics::record_fields(&records[first]),super::diagnostics::record_fields(r)]}));
            return Err(failure);
        }
    }
    Ok(())
}

pub fn accounts(value: &Value) -> Result<Vec<RemoteAccount>> {
    let context = Context {
        scope: "Konten",
        row: None,
    };
    let rows = value
        .get("accounts")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            context.bad(
                "accounts",
                "Die erwartete Kontoliste fehlt in der API-Antwort.",
            )
        })?;
    if rows.len() > 1000 {
        return Err(context.bad("accounts", "Die API-Antwort enthält zu viele Konten."));
    }
    let mut ids = BTreeSet::new();
    rows.iter()
        .enumerate()
        .map(|(index, row)| {
            let context = Context {
                scope: "Konten",
                row: Some(index + 1),
            };
            let id = number(&row["id"])
                .map_err(|_| context.bad("id", "Die Kontonummer fehlt oder ist keine Zahl."))?;
            if id <= Decimal::ZERO || !id.fract().is_zero() || !ids.insert(id) {
                return Err(context.bad(
                    "id",
                    "Die Kontonummer ist ungültig oder mehrfach enthalten.",
                ));
            }
            let currency = context.text(row, "currency")?.to_ascii_uppercase();
            if currency.len() != 3 || !currency.bytes().all(|c| c.is_ascii_alphabetic()) {
                return Err(
                    context.bad("currency", "Erwartet wird ein dreistelliger Währungscode.")
                );
            }
            let deposits = context.amount(&row["deposits"], "deposits")?;
            let withdrawals = context.amount(&row["withdrawals"], "withdrawals")?;
            if deposits < 0 || withdrawals < 0 {
                return Err(context.bad(
                    "deposits/withdrawals",
                    "Die Kontosummen für Ein- und Auszahlungen müssen positiv oder null sein.",
                ));
            }
            let capital_minor = deposits
                .checked_sub(withdrawals)
                .ok_or_else(|| context.bad("deposits/withdrawals", "Die Differenz ist zu groß."))?;
            Ok(RemoteAccount {
                id: id.normalize().to_string(),
                name: context.text(row, "name")?.into(),
                currency,
                balance_minor: context.amount(&row["balance"], "balance")?,
                profit_minor: context.amount(&row["profit"], "profit")?,
                capital_minor,
                updated_at: context.text(row, "lastUpdateDate")?.into(),
            })
        })
        .collect()
}

pub struct Client(reqwest::Client);
impl Client {
    pub fn new() -> Result<Self> {
        reqwest::Client::builder()
            .tls_backend_rustls()
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(30))
            .build()
            .map(Self)
            .map_err(|_| network())
    }
    pub async fn request(&self, method: &str, parameters: &[(&str, &str)]) -> Result<Value> {
        // A fixed host, no redirects, no raw errors or URLs in logs: query contains secrets.
        if !matches!(
            method,
            "login" | "logout" | "get-my-accounts" | "get-history" | "get-open-trades"
        ) {
            return Err(invalid());
        }
        let context = Context {
            scope: method,
            row: None,
        };
        let mut response = self
            .0
            .get(format!("https://www.myfxbook.com/api/{method}.json"))
            .query(parameters)
            .send()
            .await
            .map_err(|_| network())?;
        if !response.status().is_success() {
            return Err(network());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| network())? {
            if bytes.len() + chunk.len() > 4 * 1024 * 1024 {
                return Err(
                    context.bad("Antwort", "Die Antwort überschreitet die zulässige Größe.")
                );
            }
            bytes.extend_from_slice(&chunk);
        }
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|_| context.bad("Antwort", "Die Antwort enthält kein gültiges JSON."))?;
        match value.get("error").and_then(Value::as_bool) {
            Some(false) => Ok(value),
            Some(true) => {
                let message = value
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                if message.contains("session")
                    || message.contains("password")
                    || message.contains("email")
                {
                    Err(error(
                        "MYFXBOOK_AUTH",
                        "Myfxbook-Anmeldung fehlt oder ist abgelaufen. Bitte erneut anmelden; auch eine geänderte IP-Adresse kann die Sitzung beenden.",
                    ))
                } else {
                    Err(error(
                        "MYFXBOOK_PROVIDER",
                        "Myfxbook hat den Abruf abgelehnt. Bitte später erneut versuchen oder den Kontozugriff prüfen.",
                    ))
                }
            }
            _ => Err(context.bad(
                "error",
                "Die erwartete Erfolgs- oder Fehlermarkierung fehlt.",
            )),
        }
    }
    pub async fn accounts(&self, session: &str) -> Result<Vec<RemoteAccount>> {
        accounts(
            &self
                .request("get-my-accounts", &[("session", session)])
                .await?,
        )
    }
    pub async fn snapshot(&self, session: &str, id: &str, timezone: &str) -> Result<Snapshot> {
        let tz: Tz = timezone.parse().map_err(|_| {
            error(
                "MYFXBOOK_TIMEZONE",
                "Bitte eine gültige IANA-Brokerzeitzone eingeben, z. B. UTC oder Europe/Helsinki.",
            )
        })?;
        let before = self
            .accounts(session)
            .await?
            .into_iter()
            .find(|a| a.id == id)
            .ok_or_else(|| {
                error(
                    "MYFXBOOK_ACCOUNT",
                    "Dieses Portfolio gehört nicht zur angemeldeten Myfxbook-Sitzung.",
                )
            })?;
        let history = self
            .request("get-history", &[("session", session), ("id", id)])
            .await?;
        let open = self
            .request("get-open-trades", &[("session", session), ("id", id)])
            .await?;
        let after = self
            .accounts(session)
            .await?
            .into_iter()
            .find(|a| a.id == id)
            .ok_or_else(||error("MYFXBOOK_CHANGED", "Das ausgewählte Portfolio fehlt beim erneuten Kontoabruf. Bitte die Verbindung erneut prüfen."))?;
        if serde_json::to_value(&before).ok() != serde_json::to_value(&after).ok() {
            return Err(error(
                "MYFXBOOK_CHANGED",
                "Myfxbook wurde während des Abrufs aktualisiert. Bitte den Abgleich wiederholen.",
            ));
        }
        let mut records = parse_records(&history, "history", tz)?;
        let history_keys = records.iter().map(|r| r.key.clone()).collect();
        let history_count = records.len();
        records.extend(parse_records(&open, "openTrades", tz)?);
        ensure_unique(&records)?;
        Ok(Snapshot {
            account: after,
            records,
            history_keys,
            history_count,
        })
    }
}
fn network() -> super::CommandError {
    error(
        "MYFXBOOK_NETWORK",
        "Myfxbook ist derzeit nicht erreichbar. Deine lokalen Trades bleiben unverändert.",
    )
}
