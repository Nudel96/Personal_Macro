use std::{collections::HashMap, path::Path};

use chrono::{Duration, NaiveDate, Utc};
use sqlx::{
    QueryBuilder, Sqlite, SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};

use super::{
    models::*,
    provider::{difference_bps, error},
};
use crate::errors::CommandResult;

pub async fn initialize(root: &Path) -> CommandResult<SqlitePool> {
    std::fs::create_dir_all(root).map_err(|_| {
        error(
            "BOND_CACHE_ERROR",
            "Der lokale Anleihespeicher konnte nicht angelegt werden.",
        )
    })?;
    let options = SqliteConnectOptions::new()
        .filename(root.join("cache.sqlite"))
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(5));
    let db = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options)
        .await?;
    sqlx::migrate!("./bond-migrations")
        .run(&db)
        .await
        .map_err(|_| {
            error(
                "BOND_CACHE_ERROR",
                "Der Anleihespeicher konnte nicht aktualisiert werden. Das Journal bleibt nutzbar.",
            )
        })?;
    let mut tx = db.begin().await?;
    for item in &catalog().instruments {
        sqlx::query("INSERT OR IGNORE INTO bond_series(symbol) VALUES(?)")
            .bind(&item.symbol)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(db)
}

pub async fn metadata(db: &SqlitePool, key: &str) -> CommandResult<Option<String>> {
    Ok(
        sqlx::query_scalar("SELECT value FROM bond_metadata WHERE key=?")
            .bind(key)
            .fetch_optional(db)
            .await?,
    )
}

pub async fn save_catalog(
    db: &SqlitePool,
    active: &std::collections::HashSet<String>,
    excluded: &[ExcludedInstrument],
) -> CommandResult<()> {
    let excluded = serde_json::to_string(excluded).map_err(|_| {
        error(
            "BOND_CACHE_ERROR",
            "Die Katalogprüfung konnte nicht gespeichert werden.",
        )
    })?;
    let mut tx = db.begin().await?;
    for i in &catalog().instruments {
        sqlx::query("UPDATE bond_series SET active=? WHERE symbol=?")
            .bind(active.contains(&i.symbol))
            .bind(&i.symbol)
            .execute(&mut *tx)
            .await?;
    }
    for (key, value) in [
        ("catalogCheckedAt", Utc::now().to_rfc3339()),
        ("excluded", excluded),
    ] {
        sqlx::query("INSERT INTO bond_metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
            .bind(key).bind(value).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn save_job(db: &SqlitePool, job: &SyncJob) -> CommandResult<()> {
    let payload = serde_json::to_string(job).map_err(|_| {
        error(
            "BOND_CACHE_ERROR",
            "Der Abrufstatus konnte nicht gespeichert werden.",
        )
    })?;
    sqlx::query("INSERT INTO bond_sync_jobs(id,started_at,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload")
        .bind(&job.id).bind(&job.started_at).bind(payload).execute(db).await?;
    Ok(())
}

pub async fn latest_job(db: &SqlitePool) -> CommandResult<Option<SyncJob>> {
    let payload: Option<String> =
        sqlx::query_scalar("SELECT payload FROM bond_sync_jobs ORDER BY started_at DESC LIMIT 1")
            .fetch_optional(db)
            .await?;
    payload
        .map(|p| {
            serde_json::from_str(&p).map_err(|_| {
                error(
                    "BOND_CACHE_ERROR",
                    "Der gespeicherte Abrufstatus ist nicht lesbar.",
                )
            })
        })
        .transpose()
}

#[derive(sqlx::FromRow)]
struct QuoteRow {
    symbol: String,
    active: bool,
    fetched_at: Option<String>,
    last_error: Option<String>,
    date: Option<String>,
    yield_pct: Option<String>,
    previous_date: Option<String>,
    previous_yield: Option<String>,
}

pub async fn quotes(db: &SqlitePool, today: NaiveDate) -> CommandResult<Vec<BondQuote>> {
    let rows = sqlx::query_as::<_, QuoteRow>(
        "SELECT s.symbol,s.active,s.fetched_at,s.last_error,
           a.observation_date AS date,a.yield_pct,
           b.observation_date AS previous_date,b.yield_pct AS previous_yield
         FROM bond_series s
         LEFT JOIN bond_observations a ON a.symbol=s.symbol AND a.observation_date=(
           SELECT observation_date FROM bond_observations
           WHERE symbol=s.symbol AND observation_date<? ORDER BY observation_date DESC LIMIT 1
         )
         LEFT JOIN bond_observations b ON b.symbol=s.symbol AND b.observation_date=(
           SELECT observation_date FROM bond_observations
           WHERE symbol=s.symbol AND observation_date<a.observation_date ORDER BY observation_date DESC LIMIT 1
         )",
    )
    .bind(today.to_string())
    .fetch_all(db)
    .await?;
    let rows: HashMap<_, _> = rows.into_iter().map(|r| (r.symbol.clone(), r)).collect();
    Ok(catalog()
        .instruments
        .iter()
        .map(|instrument| {
            let row = rows.get(&instrument.symbol);
            let date = row.and_then(|r| r.date.clone());
            let stale = date
                .as_deref()
                .and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
                .is_some_and(|d| today.signed_duration_since(d).num_days() > 7);
            BondQuote {
                instrument: instrument.clone(),
                active: row.is_none_or(|r| r.active),
                date,
                yield_pct: row.and_then(|r| r.yield_pct.clone()),
                previous_date: row.and_then(|r| r.previous_date.clone()),
                change_bps: row.and_then(|r| {
                    difference_bps(r.yield_pct.as_deref(), r.previous_yield.as_deref())
                }),
                fetched_at: row.and_then(|r| r.fetched_at.clone()),
                last_error: row.and_then(|r| r.last_error.clone()),
                stale,
            }
        })
        .collect())
}

pub async fn save_history(
    db: &SqlitePool,
    symbol: &str,
    from: NaiveDate,
    through: NaiveDate,
    points: &[Observation],
) -> CommandResult<()> {
    // Validate the whole download before replacing its date range. A rollback preserves the prior snapshot.
    if !catalog().instruments.iter().any(|i| i.symbol == symbol)
        || points.is_empty()
        || points
            .iter()
            .any(|p| p.date < from.to_string() || p.date > through.to_string())
    {
        return Err(error(
            "BOND_DATA_ERROR",
            "Die Renditebeobachtungen passen nicht zum angefragten Zeitraum.",
        ));
    }
    let mut tx = db.begin().await?;
    sqlx::query("DELETE FROM bond_observations WHERE symbol=? AND observation_date>=? AND observation_date<=?")
        .bind(symbol).bind(from.to_string()).bind(through.to_string()).execute(&mut *tx).await?;
    for chunk in points.chunks(250) {
        let mut query = QueryBuilder::<Sqlite>::new(
            "INSERT INTO bond_observations(symbol,observation_date,yield_pct) ",
        );
        query.push_values(chunk, |mut row, p| {
            row.push_bind(symbol)
                .push_bind(&p.date)
                .push_bind(&p.yield_pct);
        });
        query.build().execute(&mut *tx).await?;
    }
    sqlx::query(
        "UPDATE bond_series SET fetched_at=?,last_attempt_at=?,last_error=NULL WHERE symbol=?",
    )
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .bind(symbol)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn save_failure(db: &SqlitePool, symbol: &str, message: &str) -> CommandResult<()> {
    sqlx::query("UPDATE bond_series SET last_attempt_at=?,last_error=? WHERE symbol=?")
        .bind(Utc::now().to_rfc3339())
        .bind(message)
        .bind(symbol)
        .execute(db)
        .await?;
    Ok(())
}

pub fn recently_fetched(value: Option<&str>) -> bool {
    value
        .and_then(|v| chrono::DateTime::parse_from_rfc3339(v).ok())
        .is_some_and(|t| {
            let age = Utc::now().signed_duration_since(t);
            age >= Duration::zero() && age < Duration::hours(24)
        })
}

pub async fn fetch_window(db: &SqlitePool, symbol: &str) -> CommandResult<(NaiveDate, NaiveDate)> {
    let last: Option<String> =
        sqlx::query_scalar("SELECT MAX(observation_date) FROM bond_observations WHERE symbol=?")
            .bind(symbol)
            .fetch_one(db)
            .await?;
    let from = last
        .and_then(|d| NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok())
        .map(|d| d - Duration::days(35))
        .unwrap_or_else(|| NaiveDate::from_ymd_opt(1900, 1, 1).unwrap());
    Ok((from, Utc::now().date_naive() - Duration::days(1)))
}

pub async fn history(db: &SqlitePool, symbol: &str) -> CommandResult<Vec<Observation>> {
    let rows: Vec<(String, Option<String>)> = sqlx::query_as(
        "SELECT observation_date,yield_pct FROM bond_observations WHERE symbol=? AND observation_date<? ORDER BY observation_date")
        .bind(symbol).bind(Utc::now().date_naive().to_string()).fetch_all(db).await?;
    Ok(rows
        .into_iter()
        .map(|(date, yield_pct)| Observation { date, yield_pct })
        .collect())
}

pub async fn detail(db: &SqlitePool, input: &DetailInput) -> CommandResult<Detail> {
    for id in [Some(&input.country_id), input.comparison_id.as_ref()]
        .into_iter()
        .flatten()
    {
        if !catalog().countries.iter().any(|c| &c.id == id) {
            return Err(error(
                "VALIDATION_ERROR",
                "Das gewählte Land ist nicht im Länderverzeichnis.",
            ));
        }
    }
    if !(1..=600).contains(&input.maturity_months) {
        return Err(error(
            "VALIDATION_ERROR",
            "Die gewählte Laufzeit ist ungültig.",
        ));
    }
    let instruments_for = |id: &str| {
        catalog()
            .instruments
            .iter()
            .filter(|i| i.country_id == id)
            .cloned()
            .collect::<Vec<_>>()
    };
    let primary_instruments = instruments_for(&input.country_id);
    let comparison_instruments = input.comparison_id.as_deref().map(instruments_for);
    // At most two countries are loaded; no mixed-date curve is assembled from latest quotes.
    let mut histories = HashMap::new();
    for i in primary_instruments
        .iter()
        .chain(comparison_instruments.iter().flatten())
    {
        if !histories.contains_key(&i.symbol) {
            histories.insert(i.symbol.clone(), history(db, &i.symbol).await?);
        }
    }
    let dates_for = |items: &[Instrument]| -> std::collections::BTreeSet<String> {
        items
            .iter()
            .flat_map(|i| {
                histories[&i.symbol]
                    .iter()
                    .filter(|p| p.yield_pct.is_some())
                    .map(|p| p.date.clone())
            })
            .collect()
    };
    let primary_dates = dates_for(&primary_instruments);
    let curve_date = if let Some(items) = &comparison_instruments {
        primary_dates
            .intersection(&dates_for(items))
            .last()
            .cloned()
    } else {
        primary_dates.last().cloned()
    };
    let make_detail = |id: String, items: Vec<Instrument>| {
        let instrument = items
            .iter()
            .find(|i| i.maturity_months == input.maturity_months)
            .cloned();
        let selected_history = instrument
            .as_ref()
            .map(|i| histories[&i.symbol].clone())
            .unwrap_or_default();
        let mut curve: Vec<_> = items
            .iter()
            .map(|i| CurvePoint {
                symbol: i.symbol.clone(),
                maturity_months: i.maturity_months,
                currency: i.currency.clone(),
                yield_pct: curve_date
                    .as_ref()
                    .and_then(|date| histories[&i.symbol].iter().find(|p| &p.date == date))
                    .and_then(|p| p.yield_pct.clone()),
            })
            .collect();
        curve.sort_by_key(|p| p.maturity_months);
        let two = curve.iter().find(|p| p.maturity_months == 24);
        let ten = curve.iter().find(|p| p.maturity_months == 120);
        let curve_spread_bps = two
            .zip(ten)
            .filter(|(a, b)| a.currency.is_some() && a.currency == b.currency)
            .and_then(|(a, b)| difference_bps(b.yield_pct.as_deref(), a.yield_pct.as_deref()));
        CountryDetail {
            country_id: id,
            instrument,
            history: selected_history,
            curve,
            curve_spread_bps,
        }
    };
    let primary = make_detail(input.country_id.clone(), primary_instruments);
    let comparison = input
        .comparison_id
        .clone()
        .zip(comparison_instruments)
        .map(|(id, items)| make_detail(id, items));
    let spread = comparison.as_ref().and_then(|other| {
        primary.instrument.as_ref()?.currency.as_ref()?;
        other.instrument.as_ref()?.currency.as_ref()?;
        let by_date: HashMap<_, _> = other.history.iter().map(|p| (p.date.as_str(), p)).collect();
        primary.history.iter().rev().find_map(|a| {
            let b = by_date.get(a.date.as_str())?;
            Some((
                a.date.clone(),
                difference_bps(a.yield_pct.as_deref(), b.yield_pct.as_deref())?,
            ))
        })
    });
    Ok(Detail {
        curve_date,
        primary,
        comparison,
        spread_date: spread.as_ref().map(|s| s.0.clone()),
        spread_bps: spread.map(|s| s.1),
    })
}
