use super::*;
use provider::{Record, RemoteAccount, Snapshot, money, parse_records, timestamp};
use reconcile::{Local, LocalTrade, plan};
use serde_json::{Value, json};

fn row() -> Value {
    json!({"openTime":"09/16/2026 10:00", "closeTime":"09/16/2026 11:00",
        "symbol":"EURUSD", "action":"Buy", "sizing":{"type":"lots","value":"0.10"},
        "openPrice":1.1, "closePrice":1.105, "sl":0, "tp":1.11,
        "profit":5, "interest":0, "commission":0})
}
fn record(closed: bool) -> Record {
    let field = if closed { "history" } else { "openTrades" };
    parse_records(&json!({field:[row()]}), field, chrono_tz::UTC)
        .unwrap()
        .remove(0)
}
fn sized_record(closed: bool, quantity: Value) -> Record {
    let mut r = row();
    r["sizing"]["value"] = quantity;
    let field = if closed { "history" } else { "openTrades" };
    parse_records(&json!({field:[r]}), field, chrono_tz::UTC)
        .unwrap()
        .remove(0)
}
fn same_minute_other_entry(closed: bool, quantity: Value) -> Record {
    let mut r = row();
    r["openPrice"] = json!("1.1004");
    r["closePrice"] = json!("1.1024");
    r["closeTime"] = json!("09/16/2026 11:01");
    r["profit"] = json!(2);
    r["sizing"]["value"] = quantity;
    let field = if closed { "history" } else { "openTrades" };
    parse_records(&json!({field:[r]}), field, chrono_tz::UTC)
        .unwrap()
        .remove(0)
}
fn deposit(minute: &str, amount: i64) -> Record {
    let value = json!({"history":[{"openTime":format!("09/16/2026 {minute}"),"action":"Deposit","profit":amount}]});
    parse_records(&value, "history", chrono_tz::UTC)
        .unwrap()
        .remove(0)
}
fn local() -> Local {
    Local {
        account_id: "test-account".into(),
        currency: "USD".into(),
        initial: 10_000,
        trades: vec![],
        cashflows: vec![],
        links: vec![],
        connection: None,
    }
}
fn snapshot(records: Vec<Record>, profit: i64, capital: i64) -> Snapshot {
    let history_keys: Vec<_> = records
        .iter()
        .filter(|r| r.kind != "open")
        .map(|r| r.key.clone())
        .collect();
    Snapshot {
        account: RemoteAccount {
            id: "123456".into(),
            name: "Test portfolio".into(),
            currency: "USD".into(),
            balance_minor: capital + profit,
            profit_minor: profit,
            capital_minor: capital,
            updated_at: "09/16/2026 11:05".into(),
        },
        history_count: history_keys.len(),
        history_keys,
        records,
    }
}
fn existing(r: &Record) -> LocalTrade {
    LocalTrade {
        id: "existing-trade".into(),
        status: r.kind.clone(),
        instrument: r.symbol.clone(),
        direction: r.direction.clone(),
        opened_at: Some(r.opened_at.clone()),
        closed_at: r.closed_at.clone(),
        actual_entry: Some(r.entry.clone()),
        actual_exit: r.exit.clone(),
        quantity: Some(r.quantity.clone()),
        net_pnl_minor: r.profit,
        planned_risk_minor: Some(250),
        source_metadata_json: "{}".into(),
        source: "manual".into(),
        is_deleted: false,
        updated_at: "2026-09-16T10:01:00Z".into(),
    }
}
fn connection() -> Connection {
    Connection {
        account_id: "test-account".into(),
        external_id: "123456".into(),
        external_name: "Test portfolio".into(),
        currency: "USD".into(),
        broker_timezone: "UTC".into(),
        pnl_mode: "auto".into(),
        enabled: true,
        status: "connected".into(),
        message: String::new(),
        last_attempt_at: None,
        last_sync_at: None,
        last_provider_at: None,
        balance_minor: Some(10_000),
        history_keys_json: "[]".into(),
        backup_at: None,
        updated_at: String::new(),
    }
}

#[test]
fn exact_money_and_broker_timezone() {
    assert_eq!(money(&json!("-0.2600")).unwrap(), -26);
    assert_eq!(money(&json!(5.01)).unwrap(), 501);
    assert!(money(&json!("0.001")).is_err());
    assert!(money(&json!("9999999999999999999999999999")).is_err());
    assert_eq!(
        timestamp("09/16/2026 10:00", chrono_tz::Europe::Helsinki).unwrap(),
        "2026-09-16T07:00:00+00:00"
    );
    assert!(timestamp("10/25/2026 02:30", chrono_tz::Europe::Berlin).is_err());
    assert!(timestamp("03/29/2026 02:30", chrono_tz::Europe::Berlin).is_err());
}

#[test]
fn money_accepts_serialization_noise_but_not_real_subcent_amounts() {
    for (value, cents) in [
        (json!("  -0.2600  "), -26),
        (json!("0.14000000000000001"), 14),
        (
            serde_json::from_str::<Value>("1.8999999999999997").unwrap(),
            190,
        ),
        (json!("-1.8899999999999999"), -189),
        (json!("1.8899999999999999"), 189),
    ] {
        assert_eq!(money(&value).unwrap(), cents);
    }
    for value in [
        json!("0.001"),
        json!("1.899999"),
        json!("1.900001"),
        json!("-0.00001"),
        json!(""),
        json!(null),
    ] {
        assert!(money(&value).is_err());
    }
}

#[test]
fn optional_blank_fields_are_absent_while_required_fields_remain_required() {
    for blank in [json!(null), json!(""), json!("  ")] {
        let mut r = row();
        for field in ["sl", "tp", "interest", "commission"] {
            r[field] = blank.clone();
        }
        let records =
            parse_records(&json!({"history":[r.clone()]}), "history", chrono_tz::UTC).unwrap();
        assert_eq!(records[0].stop, None);
        assert_eq!(records[0].target, None);
        assert_eq!(records[0].costs, None);
        // Missing optional costs do not prevent a net result proven by the
        // account totals. They also must not be fabricated for a gross result.
        assert_eq!(
            plan(&local(), &snapshot(records.clone(), 500, 10_000))
                .unwrap()
                .mode,
            "net"
        );
        assert!(plan(&local(), &snapshot(records, 480, 10_000)).is_err());
        for field in ["openPrice", "closePrice", "profit", "openTime", "closeTime"] {
            let mut missing = r.clone();
            missing[field] = blank.clone();
            let failure = parse_records(&json!({"history":[missing]}), "history", chrono_tz::UTC)
                .unwrap_err();
            assert_eq!(failure.code, "MYFXBOOK_DATA");
            assert_eq!(failure.details.unwrap()["field"], field);
        }
    }
    let mut r = row();
    r["sl"] = json!("-");
    assert!(parse_records(&json!({"history":[r]}), "history", chrono_tz::UTC).is_err());
}

#[test]
fn one_missing_cost_does_not_make_the_other_cost_zero() {
    let mut r = row();
    r["interest"] = json!(null);
    r["commission"] = json!(-0.20);
    let records = parse_records(&json!({"history":[r]}), "history", chrono_tz::UTC).unwrap();
    assert_eq!(records[0].costs, None);
    let mut l = local();
    let mut c = connection();
    c.pnl_mode = "gross".into();
    l.connection = Some(c);
    assert_eq!(
        plan(&l, &snapshot(records, 480, 10_000))
            .err()
            .unwrap()
            .code,
        "MYFXBOOK_COSTS"
    );
}

#[test]
fn zero_quantity_is_unavailable_but_negative_or_malformed_sizes_still_fail() {
    for closed in [false, true] {
        for zero in [json!(0), json!("0.00"), json!(" 0 ")] {
            let r = sized_record(closed, zero);
            assert_eq!(r.quantity, "0");
            assert_eq!(r.known_quantity(), None);
            assert_eq!(r.kind, if closed { "closed" } else { "open" });
        }
        let small = sized_record(closed, json!("0.001"));
        assert_eq!(small.known_quantity(), Some("0.001"));
        let field = if closed { "history" } else { "openTrades" };
        for invalid in [
            json!(-1),
            json!("-0.001"),
            json!(null),
            json!(""),
            json!("invalid"),
        ] {
            let mut r = row();
            r["sizing"]["value"] = invalid;
            let failure = parse_records(&json!({field:[r]}), field, chrono_tz::UTC).unwrap_err();
            assert_eq!(failure.code, "MYFXBOOK_DATA");
            assert_eq!(failure.details.unwrap()["field"], "sizing.value");
        }
    }
    // Zero volume does not make an incomplete or unexecuted row importable.
    let mut r = row();
    r["sizing"]["value"] = json!(0);
    r["closePrice"] = json!(0);
    let failure = parse_records(&json!({"history":[r]}), "history", chrono_tz::UTC).unwrap_err();
    assert_eq!(failure.details.unwrap()["field"], "closePrice");
}

#[test]
fn unknown_quantity_preserves_existing_sizes_and_requires_exact_results() {
    let r = sized_record(true, json!(0));
    let mut t = existing(&r);
    t.quantity = Some("0.5".into());
    let mut l = local();
    l.trades.push(t);
    let s = snapshot(vec![r.clone()], 500, 10_000);
    let p = plan(&l, &s).unwrap();
    assert!(p.trades.is_empty());
    assert_eq!(p.summary.new_trades, 0);
    assert_eq!(p.summary.matched_trades, 1);
    assert!(p.summary.warnings.iter().any(|w| w.contains("Größe 0")));
    assert!(plan(&l, &snapshot(vec![r.clone()], 499, 10_000)).is_err());
    l.trades[0].net_pnl_minor = Some(499);
    assert_eq!(plan(&l, &s).err().unwrap().code, "MYFXBOOK_LOCAL_CONFLICT");
    l.trades[0].net_pnl_minor = Some(500);
    l.trades[0].actual_entry = Some("1.2".into());
    assert_eq!(plan(&l, &s).err().unwrap().code, "MYFXBOOK_AMBIGUOUS");
}

#[test]
fn unknown_quantity_cannot_select_between_two_positions_even_with_a_prior_link() {
    let r = sized_record(true, json!(0));
    let mut l = local();
    let mut first = existing(&r);
    first.quantity = Some("0.1".into());
    let mut second = first.clone();
    second.id = "another-trade".into();
    second.quantity = Some("0.2".into());
    l.links.push(reconcile::Link {
        source_key: r.key.clone(),
        trade_id: Some(first.id.clone()),
        cashflow_id: None,
        initial_capital: false,
        payload_json: serde_json::to_string(&r).unwrap(),
    });
    l.trades = vec![first, second];
    assert_eq!(
        plan(&l, &snapshot(vec![r], 1000, 10_000))
            .err()
            .unwrap()
            .code,
        "MYFXBOOK_AMBIGUOUS"
    );
}

#[test]
fn unrelated_missing_local_quantity_is_not_filled_from_a_similar_trade() {
    let r = record(true);
    let mut t = existing(&r);
    t.quantity = None;
    let mut l = local();
    l.trades.push(t);
    assert_eq!(
        plan(&l, &snapshot(vec![r], 500, 10_000))
            .err()
            .unwrap()
            .code,
        "MYFXBOOK_AMBIGUOUS"
    );
}

#[test]
fn quantity_availability_changes_cannot_bypass_a_local_edit_or_deletion() {
    for old in [sized_record(true, json!(0)), record(true)] {
        for new in [sized_record(true, json!(0)), record(true)] {
            let mut l = local();
            let mut t = existing(&old);
            t.quantity = old.known_quantity().map(str::to_string);
            t.source_metadata_json = json!({"myfxbookApi":{"record":old}}).to_string();
            l.links.push(reconcile::Link {
                source_key: old.key.clone(),
                trade_id: Some(t.id.clone()),
                cashflow_id: None,
                initial_capital: false,
                payload_json: serde_json::to_string(&old).unwrap(),
            });
            l.trades.push(t);
            // A break-even trade cannot escape the account-total check by
            // being mistaken for a new position after a local identity edit.
            let mut remote = new;
            remote.profit = Some(0);
            l.trades[0].net_pnl_minor = Some(0);
            let s = snapshot(vec![remote], 0, 10_000);
            l.trades[0].instrument = "GBPUSD".into();
            assert_eq!(plan(&l, &s).err().unwrap().code, "MYFXBOOK_LOCAL_CONFLICT");
            l.trades[0].instrument = "EURUSD".into();
            l.trades[0].is_deleted = true;
            assert_eq!(plan(&l, &s).err().unwrap().code, "MYFXBOOK_LOCAL_CONFLICT");
        }
    }
}

#[test]
fn parse_errors_identify_the_field_and_row_without_echoing_provider_values() {
    let mut bad = row();
    bad["openTime"] = json!("private-provider-value");
    for field in ["history", "openTrades"] {
        let failure =
            parse_records(&json!({field:[row(),bad.clone()]}), field, chrono_tz::UTC).unwrap_err();
        assert_eq!(failure.code, "MYFXBOOK_DATA");
        assert!(failure.message.contains("Eintrag 2"));
        assert!(failure.message.contains("openTime"));
        assert!(
            !serde_json::to_string(&failure)
                .unwrap()
                .contains("private-provider-value")
        );
        let details = failure.details.unwrap();
        assert_eq!(details["row"], 2);
        assert_eq!(details["field"], "openTime");
    }
    let failure = parse_records(&json!({"error":false}), "history", chrono_tz::UTC).unwrap_err();
    assert_eq!(failure.details.unwrap()["field"], "history");
    let failure=provider::accounts(&json!({"accounts":[{"id":42,"currency":"USD","name":"Test","deposits":"","withdrawals":0}]})).err().unwrap();
    assert!(failure.message.contains("Konten, Eintrag 1"));
    assert_eq!(failure.details.unwrap()["field"], "deposits");
}

#[test]
fn cashflows_can_use_an_explicit_booking_time_but_trades_cannot() {
    let cash =
        json!({"action":"Deposit","openTime":"","closeTime":"09/16/2026 08:30","profit":100});
    let records = parse_records(
        &json!({"history":[cash.clone()]}),
        "history",
        chrono_tz::UTC,
    )
    .unwrap();
    assert_eq!(records[0].opened_at, "2026-09-16T08:30:00+00:00");
    let mut missing = cash;
    missing["closeTime"] = json!(null);
    assert!(parse_records(&json!({"history":[missing]}), "history", chrono_tz::UTC).is_err());
    let mut trade = row();
    trade["openTime"] = json!("");
    assert!(parse_records(&json!({"history":[trade]}), "history", chrono_tz::UTC).is_err());
}

#[test]
fn timestamps_accept_iso_formats_without_applying_the_timezone_twice() {
    for value in [
        " 09/16/2026 10:00:05 ",
        "2026-09-16 10:00:05",
        "2026-09-16T10:00:05",
    ] {
        assert_eq!(
            timestamp(value, chrono_tz::Europe::Helsinki).unwrap(),
            "2026-09-16T07:00:05+00:00"
        );
    }
    assert_eq!(
        timestamp("2026-09-16T10:00:05+03:00", chrono_tz::Europe::Berlin).unwrap(),
        "2026-09-16T07:00:05+00:00"
    );
    assert_eq!(
        timestamp("2026-09-16T10:00:05Z", chrono_tz::Europe::Helsinki).unwrap(),
        "2026-09-16T10:00:05+00:00"
    );
    assert_eq!(
        timestamp("09/16/2026 10:00:05.123", chrono_tz::UTC).unwrap(),
        "2026-09-16T10:00:05.123+00:00"
    );
}

#[test]
fn malformed_journal_metadata_is_not_reported_as_a_provider_error() {
    let r = record(true);
    let mut l = local();
    let mut t = existing(&r);
    t.source_metadata_json = "[]".into();
    l.trades.push(t);
    assert_eq!(
        plan(&l, &snapshot(vec![r], 500, 10_000))
            .err()
            .unwrap()
            .code,
        "MYFXBOOK_LOCAL_DATA"
    );
}

#[test]
fn parser_rejects_ambiguous_partial_positions_and_unsupported_actions() {
    let mut partial = row();
    partial["sizing"]["value"] = json!("0.05");
    assert_eq!(
        parse_records(
            &json!({"history":[row(),partial]}),
            "history",
            chrono_tz::UTC
        )
        .err()
        .unwrap()
        .code,
        "MYFXBOOK_AMBIGUOUS"
    );
    assert!(provider::ensure_unique(&[record(false), record(true)]).is_err());
    let mut bad = row();
    bad["action"] = json!("Credit");
    assert!(parse_records(&json!({"history":[bad]}), "history", chrono_tz::UTC).is_err());
    let mut pending = row();
    pending["action"] = json!("Buy Limit");
    assert_eq!(
        parse_records(&json!({"history":[pending]}), "history", chrono_tz::UTC).unwrap()[0]
            .direction,
        "long"
    );
    let mut missing = row();
    missing.as_object_mut().unwrap().remove("closeTime");
    assert!(parse_records(&json!({"history":[missing]}), "history", chrono_tz::UTC).is_err());
}

#[test]
fn source_collisions_identify_both_rows_without_retaining_arbitrary_api_fields() {
    let mut r = row();
    r["comment"] = json!("private-comment-not-for-diagnostics");
    r["session"] = json!("never-copy-provider-session");
    let failure = parse_records(
        &json!({"history":[
            {"action":"Deposit","openTime":"09/16/2026 08:00","profit":100},r.clone(),r
        ]}),
        "history",
        chrono_tz::UTC,
    )
    .unwrap_err();
    let serialized = serde_json::to_string(&failure).unwrap();
    assert!(!serialized.contains("private-comment-not-for-diagnostics"));
    assert!(!serialized.contains("never-copy-provider-session"));
    let details = failure.details.unwrap();
    assert_eq!(details["reason"], "duplicate_source_identity");
    assert_eq!(details["firstRow"], 2);
    assert_eq!(details["row"], 3);
    assert_eq!(details["records"][0]["entry"], "1.1");
    let failure =
        provider::ensure_unique(&[deposit("08:00", 100), record(true), record(false)]).unwrap_err();
    let details = failure.details.unwrap();
    assert_eq!(details["firstScope"], "Historie");
    assert_eq!(details["firstRow"], 2);
    assert_eq!(details["scope"], "Offene Trades");
    assert_eq!(details["row"], 1);
}

#[test]
fn different_entry_prices_distinguish_positions_in_the_same_minute() {
    for field in ["history", "openTrades"] {
        let first = row();
        let mut second = row();
        second["openPrice"] = json!("1.1004");
        second["sizing"]["value"] = json!("0.05");
        let records = parse_records(&json!({field:[first,second]}), field, chrono_tz::UTC).unwrap();
        assert_eq!(records.len(), 2);
        assert_ne!(records[0].key, records[1].key);
        assert_eq!(records[0].opened_at, records[1].opened_at);
    }
    // Different entry prices also keep a completed position distinct from a
    // separate still-open entry made in the same minute.
    assert!(
        provider::ensure_unique(&[record(true), same_minute_other_entry(false, json!(0))]).is_ok()
    );
}

#[test]
fn size_and_close_differences_do_not_disambiguate_an_identical_entry_price() {
    let first = row();
    let mut partial = row();
    partial["openPrice"] = json!("1.10000");
    partial["sizing"]["value"] = json!("0.05");
    partial["closeTime"] = json!("09/16/2026 11:01");
    partial["closePrice"] = json!("1.1024");
    partial["profit"] = json!(2);
    let failure = parse_records(
        &json!({"history":[first,partial]}),
        "history",
        chrono_tz::UTC,
    )
    .unwrap_err();
    assert_eq!(failure.code, "MYFXBOOK_AMBIGUOUS");
    assert!(failure.message.contains("Einstiegspreis"));
    let first = record(true);
    let mut partial = first.clone();
    partial.quantity = "0.05".into();
    partial.key = "different-quantity-key".into();
    // Reconciliation enforces the same invariant even when its caller did not
    // obtain the snapshot through Client::snapshot.
    assert_eq!(
        plan(&local(), &snapshot(vec![first, partial], 1000, 10_000))
            .err()
            .unwrap()
            .code,
        "MYFXBOOK_AMBIGUOUS"
    );
}

#[test]
fn a_changed_journal_entry_stays_a_conflict_without_separate_source_evidence() {
    let mut r = record(true);
    r.profit = Some(0);
    let mut t = existing(&r);
    t.actual_entry = Some("1.1004".into());
    let mut l = local();
    l.trades.push(t);
    let failure = plan(&l, &snapshot(vec![r.clone()], 0, 10_000))
        .err()
        .unwrap();
    assert_eq!(failure.code, "MYFXBOOK_AMBIGUOUS");
    assert_eq!(failure.details.unwrap()["reason"], "entry_price_mismatch");
    // Merely having another source row nearby is insufficient when its size
    // does not prove that the existing journal position is present separately.
    let other = same_minute_other_entry(true, json!("0.2"));
    assert!(plan(&l, &snapshot(vec![r, other], 200, 10_000)).is_err());
}

#[test]
fn identity_errors_distinguish_price_size_and_multiple_journal_matches() {
    let r = record(true);
    let s = snapshot(vec![r.clone()], 500, 10_000);
    let mut l = local();
    l.trades.push(existing(&r));
    l.trades[0].actual_entry = Some("1.101".into());
    let failure = plan(&l, &s).err().unwrap();
    assert!(failure.message.contains("abweichendem Einstiegspreis"));
    let details = failure.details.unwrap();
    assert_eq!(details["reason"], "entry_price_mismatch");
    assert_eq!(details["record"]["entry"], "1.1");
    assert_eq!(details["journalCandidates"][0]["entry"], "1.101");
    l.trades[0].actual_entry = Some("1.1".into());
    l.trades[0].quantity = Some("0.2".into());
    assert_eq!(
        plan(&l, &s).err().unwrap().details.unwrap()["reason"],
        "quantity_mismatch"
    );
    l.trades[0].quantity = Some("0.1".into());
    let mut second = l.trades[0].clone();
    second.id = "another-position".into();
    l.trades.push(second);
    assert_eq!(
        plan(&l, &s).err().unwrap().details.unwrap()["reason"],
        "multiple_journal_candidates"
    );
}

#[test]
fn floating_profit_is_not_realized_and_original_risk_is_unknown() {
    let r = record(false);
    assert_eq!(r.profit, None);
    let p = plan(&local(), &snapshot(vec![r], 0, 10_000)).unwrap();
    assert_eq!(p.trades[0].net, None);
    assert_eq!(p.trades[0].risk, None);
    assert_eq!(p.mode, "auto");
    assert_eq!(p.summary.open_trades, 1);
}

#[test]
fn costs_are_reconciled_exactly_once_and_never_guessed() {
    let mut r = record(true);
    r.costs = Some(-120);
    let net = plan(&local(), &snapshot(vec![r.clone()], 500, 10_000)).unwrap();
    assert_eq!(net.mode, "net");
    assert_eq!(net.trades[0].net, Some(500));
    let gross = plan(&local(), &snapshot(vec![r.clone()], 380, 10_000)).unwrap();
    assert_eq!(gross.mode, "gross");
    assert_eq!(gross.trades[0].net, Some(380));
    assert!(plan(&local(), &snapshot(vec![r.clone()], 381, 10_000)).is_err());
    let mut l = local();
    l.connection = Some(connection());
    assert_eq!(
        plan(&l, &snapshot(vec![r.clone()], 380, 10_000))
            .unwrap()
            .mode,
        "gross"
    );
    l.connection.as_mut().unwrap().pnl_mode = "net".into();
    assert!(plan(&l, &snapshot(vec![r], 380, 10_000)).is_err());
    let mut first = record(true);
    first.costs = Some(-100);
    let mut second = record(true);
    second.key = "different".into();
    second.opened_at = "2026-09-16T10:10:00Z".into();
    second.costs = Some(100);
    assert_eq!(
        plan(&local(), &snapshot(vec![first, second], 1000, 10_000))
            .err()
            .unwrap()
            .code,
        "MYFXBOOK_PNL"
    );
}

#[test]
fn existing_open_closes_in_place_and_preserves_corrected_quantity() {
    let mut r = record(true);
    r.quantity = "0.001".into();
    r.symbol = "XTIUSD".into();
    let mut t = existing(&r);
    t.status = "open".into();
    t.closed_at = None;
    t.actual_exit = None;
    t.net_pnl_minor = None;
    t.quantity = Some("0.5".into());
    t.source_metadata_json=json!({"myfxbook":{"portfolioId":"123456","sourceDisplayedLots":"0.001"},"personalFlag":"keep"}).to_string();
    let mut l = local();
    l.trades.push(t);
    let p = plan(&l, &snapshot(vec![r], 500, 10_000)).unwrap();
    assert_eq!(p.summary.closed_trades, 1);
    assert_eq!(p.summary.new_trades, 0);
    assert_eq!(p.trades[0].id, "existing-trade");
    assert_eq!(p.trades[0].risk, Some(250));
    assert_eq!(p.trades[0].metadata["personalFlag"], "keep");
}

#[test]
fn closed_edits_deleted_trades_and_missing_opens_block_import() {
    let r = record(true);
    let mut l = local();
    l.trades.push(existing(&r));
    assert_eq!(
        plan(&l, &snapshot(vec![r.clone()], 500, 10_000))
            .unwrap()
            .summary
            .new_trades,
        0
    );
    l.trades[0].net_pnl_minor = Some(501);
    assert_eq!(
        plan(&l, &snapshot(vec![r.clone()], 500, 10_000))
            .err()
            .unwrap()
            .code,
        "MYFXBOOK_LOCAL_CONFLICT"
    );
    l.trades[0].is_deleted = true;
    assert_eq!(
        plan(&l, &snapshot(vec![r], 500, 10_000))
            .err()
            .unwrap()
            .code,
        "MYFXBOOK_LOCAL_CONFLICT"
    );
    l.trades = vec![existing(&record(false))];
    assert_eq!(
        plan(&l, &snapshot(vec![], 0, 10_000)).err().unwrap().code,
        "MYFXBOOK_MISSING_OPEN"
    );
}

#[test]
fn detects_window_gaps_currency_and_portfolio_mismatch() {
    let mut l = local();
    let mut c = connection();
    c.history_keys_json = "[\"lost-entry\"]".into();
    l.connection = Some(c);
    let s = snapshot(vec![record(true)], 500, 10_000);
    assert_eq!(plan(&l, &s).err().unwrap().code, "MYFXBOOK_GAP");
    l.connection.as_mut().unwrap().external_id = "different".into();
    assert_eq!(plan(&l, &s).err().unwrap().code, "MYFXBOOK_ACCOUNT");
    l.currency = "EUR".into();
    assert_eq!(plan(&l, &s).err().unwrap().code, "MYFXBOOK_CURRENCY");
}

async fn state() -> AppState {
    let state = crate::database::initialize_headless().await.unwrap();
    sqlx::query("INSERT INTO accounts(id,name,base_currency,initial_balance_minor,created_at,updated_at) VALUES ('test-account','Myfxbook Test','USD',10000,'2026-09-16T00:00:00Z','2026-09-16T00:00:00Z')").execute(&state.db).await.unwrap();
    state
}
async fn read(state: &AppState) -> Local {
    let mut db = state.db.acquire().await.unwrap();
    reconcile::load(&mut db, "test-account").await.unwrap()
}
async fn cleanup(state: AppState) {
    state.db.close().await;
    // SQLite worker shutdown can briefly retain a Windows file handle after
    // Pool::close has completed. Only this freshly created temp tree is removed.
    assert_eq!(
        state.paths.root.parent(),
        Some(std::env::temp_dir().as_path())
    );
    for _ in 0..25 {
        match std::fs::remove_dir_all(&state.paths.root) {
            Ok(()) => return,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return,
            Err(_) => tokio::time::sleep(std::time::Duration::from_millis(20)).await,
        }
    }
    std::fs::remove_dir_all(&state.paths.root).unwrap();
}

#[tokio::test]
async fn atomic_lifecycle_is_idempotent_and_preserves_journal_fields() {
    let state = state().await;
    let initial = deposit("08:00", 100);
    let extra = deposit("09:00", 25);
    let s = snapshot(
        vec![initial.clone(), extra.clone(), record(false)],
        0,
        12_500,
    );
    let l = read(&state).await;
    let p = plan(&l, &s).unwrap();
    assert_eq!(p.summary.new_cashflows, 1);
    commit(&state, &l, &p, &s, "UTC", true, true).await.unwrap();
    let id = p.trades[0].id.clone();
    let l = read(&state).await;
    let p = plan(&l, &s).unwrap();
    assert!(!needs_write(&l, &p));
    commit(&state, &l, &p, &s, "UTC", true, false)
        .await
        .unwrap();
    sqlx::query("UPDATE trades SET planned_risk_minor=250,initial_stop_loss='1.095',execution_notes_html='<p>Keep my notes</p>',review_notes_html='<p>Keep review</p>' WHERE id=?").bind(&id).execute(&state.db).await.unwrap();
    let s = snapshot(vec![initial, extra, record(true)], 500, 12_500);
    let l = read(&state).await;
    let p = plan(&l, &s).unwrap();
    assert_eq!(p.summary.closed_trades, 1);
    commit(&state, &l, &p, &s, "UTC", true, false)
        .await
        .unwrap();
    let result:(String,String,String,String,String,i64)=sqlx::query_as("SELECT id,execution_notes_html,review_notes_html,initial_stop_loss,calculated_r,net_pnl_minor FROM trades WHERE account_id='test-account'").fetch_one(&state.db).await.unwrap();
    assert_eq!(
        result,
        (
            id,
            "<p>Keep my notes</p>".into(),
            "<p>Keep review</p>".into(),
            "1.095".into(),
            "2".into(),
            500
        )
    );
    let l = read(&state).await;
    let p = plan(&l, &s).unwrap();
    assert!(!needs_write(&l, &p));
    assert_eq!(l.cashflows.len(), 1);
    assert_eq!(l.links.len(), 3);
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM import_runs WHERE source_type='myfxbook_api'")
            .fetch_one(&state.db)
            .await
            .unwrap();
    assert_eq!(count, 2);
    let check: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&state.db)
        .await
        .unwrap();
    assert_eq!(check, "ok");
    cleanup(state).await;
}

#[tokio::test]
async fn same_minute_positions_arrive_separately_close_independently_and_remain_idempotent() {
    let state = state().await;
    let first_open = record(false);
    let l = read(&state).await;
    let s = snapshot(vec![first_open.clone()], 0, 10_000);
    let p = plan(&l, &s).unwrap();
    let first_id = p.trades[0].id.clone();
    commit(&state, &l, &p, &s, "UTC", true, false)
        .await
        .unwrap();
    sqlx::query("UPDATE trades SET planned_risk_minor=250,execution_notes_html='<p>Original notes</p>' WHERE id=?")
        .bind(&first_id).execute(&state.db).await.unwrap();

    // The newly appearing position is encountered before its already-known
    // neighbour. Identity must depend on execution evidence, not row order.
    let second_open = same_minute_other_entry(false, json!(0));
    let s = snapshot(vec![second_open, first_open], 0, 10_000);
    let l = read(&state).await;
    let p = plan(&l, &s).unwrap();
    assert_eq!(p.summary.new_trades, 1);
    assert_eq!(p.summary.matched_trades, 1);
    let second_id = p.trades.iter().find(|t| !t.existing).unwrap().id.clone();
    commit(&state, &l, &p, &s, "UTC", true, false)
        .await
        .unwrap();
    let l = read(&state).await;
    assert_eq!(l.trades.len(), 2);
    assert_eq!(
        l.trades
            .iter()
            .find(|t| t.id == second_id)
            .unwrap()
            .quantity,
        None
    );

    let first_closed = record(true);
    let second_closed = same_minute_other_entry(true, json!("0.05"));
    let s = snapshot(
        vec![first_closed.clone(), second_closed.clone()],
        700,
        10_000,
    );
    let p = plan(&l, &s).unwrap();
    assert_eq!(p.summary.new_trades, 0);
    assert_eq!(p.summary.closed_trades, 2);
    commit(&state, &l, &p, &s, "UTC", true, false)
        .await
        .unwrap();
    let l = read(&state).await;
    assert_eq!(l.links.len(), 2);
    let first = l.trades.iter().find(|t| t.id == first_id).unwrap();
    let second = l.trades.iter().find(|t| t.id == second_id).unwrap();
    assert_eq!(first.net_pnl_minor, Some(500));
    assert_eq!(first.actual_entry.as_deref(), Some("1.1"));
    assert_eq!(first.quantity.as_deref(), Some("0.1"));
    assert_eq!(second.net_pnl_minor, Some(200));
    assert_eq!(second.actual_entry.as_deref(), Some("1.1004"));
    assert_eq!(second.quantity.as_deref(), Some("0.05"));
    assert_ne!(first.closed_at, second.closed_at);
    let fields: (String, String) =
        sqlx::query_as("SELECT execution_notes_html,calculated_r FROM trades WHERE id=?")
            .bind(&first_id)
            .fetch_one(&state.db)
            .await
            .unwrap();
    assert_eq!(fields, ("<p>Original notes</p>".into(), "2".into()));
    let reordered = snapshot(vec![second_closed, first_closed], 700, 10_000);
    let p = plan(&l, &reordered).unwrap();
    assert!(!needs_write(&l, &p));
    assert_eq!(p.summary.matched_trades, 2);
    let imports: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM import_runs WHERE source_type='myfxbook_api'")
            .fetch_one(&state.db)
            .await
            .unwrap();
    assert_eq!(imports, 3);
    cleanup(state).await;
}

#[tokio::test]
async fn unknown_closed_quantity_is_nullable_and_later_filled_without_duplicates() {
    let state = state().await;
    let zero = sized_record(true, json!(0));
    let zero_snapshot = snapshot(vec![zero.clone()], 500, 10_000);
    let l = read(&state).await;
    let p = plan(&l, &zero_snapshot).unwrap();
    assert_eq!(p.summary.new_trades, 1);
    commit(&state, &l, &p, &zero_snapshot, "UTC", true, false)
        .await
        .unwrap();
    let l = read(&state).await;
    let id = l.trades[0].id.clone();
    assert_eq!(l.trades[0].quantity, None);
    assert_eq!(l.links.len(), 1);
    let original_link_key = l.links[0].source_key.clone();
    let metadata: Value = serde_json::from_str(&l.trades[0].source_metadata_json).unwrap();
    assert_eq!(metadata["myfxbookApi"]["record"]["quantity"], "0");
    assert_eq!(metadata["myfxbookApi"]["quantityAvailable"], false);
    assert!(!needs_write(&l, &plan(&l, &zero_snapshot).unwrap()));
    sqlx::query("UPDATE trades SET planned_risk_minor=250,calculated_r='2',execution_notes_html='<p>My notes</p>',review_notes_html='<p>My review</p>' WHERE id=?")
        .bind(&id).execute(&state.db).await.unwrap();

    let positive_snapshot = snapshot(vec![record(true)], 500, 10_000);
    let l = read(&state).await;
    assert_ne!(zero.key, positive_snapshot.records[0].key);
    let p = plan(&l, &positive_snapshot).unwrap();
    assert_eq!(p.summary.new_trades, 0);
    assert_eq!(p.trades.len(), 1);
    commit(&state, &l, &p, &positive_snapshot, "UTC", true, false)
        .await
        .unwrap();
    let l = read(&state).await;
    assert_eq!(l.trades.len(), 1);
    assert_eq!(l.trades[0].id, id);
    assert_eq!(l.trades[0].quantity.as_deref(), Some("0.1"));
    assert_eq!(l.trades[0].net_pnl_minor, Some(500));
    assert_eq!(l.trades[0].planned_risk_minor, Some(250));
    assert_eq!(
        l.trades[0].opened_at.as_deref(),
        Some(zero.opened_at.as_str())
    );
    assert_eq!(l.trades[0].closed_at, zero.closed_at);
    assert_eq!(l.links.len(), 1);
    assert_eq!(l.links[0].source_key, original_link_key);
    assert!(!needs_write(&l, &plan(&l, &positive_snapshot).unwrap()));
    let notes: (String, String, String) = sqlx::query_as(
        "SELECT execution_notes_html,review_notes_html,calculated_r FROM trades WHERE id=?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .unwrap();
    assert_eq!(
        notes,
        (
            "<p>My notes</p>".into(),
            "<p>My review</p>".into(),
            "2".into()
        )
    );

    // A later zero must never erase a size already established. The source key
    // can change repeatedly without losing continuity or creating another link.
    for s in [&zero_snapshot, &positive_snapshot] {
        let l = read(&state).await;
        let p = plan(&l, s).unwrap();
        assert!(p.trades.is_empty());
        commit(&state, &l, &p, s, "UTC", true, false).await.unwrap();
        let l = read(&state).await;
        assert_eq!(l.trades.len(), 1);
        assert_eq!(l.trades[0].quantity.as_deref(), Some("0.1"));
        assert_eq!(l.links.len(), 1);
        assert_eq!(l.links[0].source_key, original_link_key);
        assert!(!needs_write(&l, &plan(&l, s).unwrap()));
    }
    cleanup(state).await;
}

#[tokio::test]
async fn unknown_open_size_can_be_filled_on_close_without_overwriting_a_correction() {
    for corrected in [false, true] {
        let state = state().await;
        let s = snapshot(vec![sized_record(false, json!(0))], 0, 10_000);
        let l = read(&state).await;
        let p = plan(&l, &s).unwrap();
        commit(&state, &l, &p, &s, "UTC", true, false)
            .await
            .unwrap();
        let id = p.trades[0].id.clone();
        if corrected {
            sqlx::query("UPDATE trades SET quantity='0.5' WHERE id=?")
                .bind(&id)
                .execute(&state.db)
                .await
                .unwrap();
        }
        let r = if corrected {
            sized_record(true, json!(0))
        } else {
            record(true)
        };
        let s = snapshot(vec![r], 500, 10_000);
        let l = read(&state).await;
        let p = plan(&l, &s).unwrap();
        assert_eq!(p.summary.closed_trades, 1);
        assert_eq!(p.summary.new_trades, 0);
        commit(&state, &l, &p, &s, "UTC", true, false)
            .await
            .unwrap();
        let l = read(&state).await;
        assert_eq!(l.trades.len(), 1);
        assert_eq!(l.trades[0].id, id);
        assert_eq!(l.trades[0].status, "closed");
        assert_eq!(
            l.trades[0].quantity.as_deref(),
            Some(if corrected { "0.5" } else { "0.1" })
        );
        assert_eq!(l.links.len(), 1);
        assert!(!needs_write(&l, &plan(&l, &s).unwrap()));
        cleanup(state).await;
    }
}

#[tokio::test]
async fn changing_quantity_availability_does_not_hide_an_unproven_history_gap() {
    let state = state().await;
    let s = snapshot(vec![sized_record(true, json!(0))], 500, 10_000);
    let l = read(&state).await;
    let p = plan(&l, &s).unwrap();
    commit(&state, &l, &p, &s, "UTC", true, false)
        .await
        .unwrap();
    let l = read(&state).await;
    for field in ["openTime", "openPrice", "closeTime", "profit"] {
        let mut r = row();
        r[field] = match field {
            "openTime" => json!("09/16/2026 10:01"),
            "openPrice" => json!(1.101),
            "closeTime" => json!("09/16/2026 11:01"),
            _ => json!(5.01),
        };
        let records = parse_records(&json!({"history":[r]}), "history", chrono_tz::UTC).unwrap();
        assert_eq!(
            plan(&l, &snapshot(records, 500, 10_000))
                .err()
                .unwrap()
                .code,
            "MYFXBOOK_GAP"
        );
    }
    assert_eq!(read(&state).await.fingerprint(), l.fingerprint());
    cleanup(state).await;
}

#[tokio::test]
async fn stale_preview_and_failed_transaction_write_nothing() {
    let state = state().await;
    let s = snapshot(vec![record(true)], 500, 10_000);
    let l = read(&state).await;
    let p = plan(&l, &s).unwrap();
    sqlx::query("UPDATE accounts SET initial_balance_minor=9999 WHERE id='test-account'")
        .execute(&state.db)
        .await
        .unwrap();
    assert_eq!(
        commit(&state, &l, &p, &s, "UTC", true, false)
            .await
            .err()
            .unwrap()
            .code,
        "MYFXBOOK_CONCURRENT"
    );
    sqlx::query("UPDATE accounts SET initial_balance_minor=10000 WHERE id='test-account'")
        .execute(&state.db)
        .await
        .unwrap();
    let mut bad = p.clone();
    bad.links[0].trade_id = Some("does-not-exist".into());
    assert!(
        commit(&state, &l, &bad, &s, "UTC", true, false)
            .await
            .is_err()
    );
    let l = read(&state).await;
    assert!(l.trades.is_empty());
    assert!(l.links.is_empty());
    assert!(l.connection.is_none());
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM import_runs WHERE source_type='myfxbook_api'")
            .fetch_one(&state.db)
            .await
            .unwrap();
    assert_eq!(count, 0);
    cleanup(state).await;
}

#[tokio::test]
async fn migration_upgrades_an_existing_journal_without_changing_its_data() {
    let state = state().await;
    sqlx::raw_sql("DROP TABLE myfxbook_links; DROP TABLE myfxbook_connections; DELETE FROM _sqlx_migrations WHERE version=49;").execute(&state.db).await.unwrap();
    sqlx::query("INSERT INTO trades(id,account_id,instrument,direction,status,net_pnl_minor,execution_notes_html,created_at,updated_at) VALUES ('old-trade','test-account','EURUSD','long','closed',125,'<p>Previous journal</p>','2026-09-10T00:00:00Z','2026-09-10T00:00:00Z')").execute(&state.db).await.unwrap();
    sqlx::migrate!("./migrations").run(&state.db).await.unwrap();
    let l = read(&state).await;
    assert_eq!(l.trades.len(), 1);
    assert_eq!(l.trades[0].net_pnl_minor, Some(125));
    assert_eq!(l.initial, 10000);
    assert!(l.links.is_empty());
    assert!(l.connection.is_none());
    let notes: String =
        sqlx::query_scalar("SELECT execution_notes_html FROM trades WHERE id='old-trade'")
            .fetch_one(&state.db)
            .await
            .unwrap();
    assert_eq!(notes, "<p>Previous journal</p>");
    let columns: Vec<String> =
        sqlx::query_scalar("SELECT name FROM pragma_table_info('myfxbook_connections')")
            .fetch_all(&state.db)
            .await
            .unwrap();
    assert!(
        !columns
            .iter()
            .any(|c| c.contains("password") || c.contains("session") || c.contains("email"))
    );
    cleanup(state).await;
}

#[tokio::test]
async fn interrupted_manual_sync_recovers_without_enabling_automation() {
    let state = state().await;
    let s = snapshot(vec![record(false)], 0, 10_000);
    let l = read(&state).await;
    let p = plan(&l, &s).unwrap();
    commit(&state, &l, &p, &s, "UTC", false, false)
        .await
        .unwrap();
    sqlx::query("UPDATE myfxbook_connections SET status='syncing'")
        .execute(&state.db)
        .await
        .unwrap();
    recover_myfxbook_sync(&state).await.unwrap();
    let c = read(&state).await.connection.unwrap();
    assert!(!c.enabled);
    assert_eq!(c.status, "paused");
    cleanup(state).await;
}

#[tokio::test]
async fn preview_diagnostics_capture_execution_evidence_without_secrets_or_journal_writes() {
    let state = state().await;
    let before = read(&state).await.fingerprint();
    let mut s = snapshot(vec![record(true)], 500, 10_000);
    s.account.name = "private-account-description".into();
    let mut l = local();
    let mut t = existing(&s.records[0]);
    t.actual_entry = Some("1.101".into());
    t.source_metadata_json = json!({"privateNotes":"private-journal-text","password":"private-password","myfxbook":{"sourceDisplayedLots":"0.1"}}).to_string();
    l.trades.push(t);
    l.cashflows.push(reconcile::Cashflow {
        id: "cash".into(),
        occurred_at: "2026-09-16T08:00:00Z".into(),
        amount_minor: 100,
        note: Some("private-cashflow-note".into()),
    });
    let input = PreviewInput {
        authorization_id: "private-session-reference".into(),
        account_id: "test-account".into(),
        external_id: "123456".into(),
        broker_timezone: "UTC".into(),
    };
    let failure = plan(&l, &s).err().unwrap();
    let result =
        diagnostics::save_preview_failure(&state, &input, failure, Some(&s), Some(&l)).await;
    assert_eq!(result.code, "MYFXBOOK_AMBIGUOUS");
    assert!(result.message.contains("Diagnosebericht"));
    let path = state.paths.logs.join("myfxbook-last-preview-error.json");
    let text = tokio::fs::read_to_string(&path).await.unwrap();
    for secret in [
        "private-account-description",
        "private-journal-text",
        "private-password",
        "private-cashflow-note",
        "private-session-reference",
    ] {
        assert!(!text.contains(secret));
    }
    let report: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(report["stage"], "reconciliation");
    assert_eq!(report["source"]["records"][0]["entry"], "1.1");
    assert_eq!(report["journal"]["trades"][0]["entry"], "1.101");
    assert_eq!(report["error"]["details"]["reason"], "entry_price_mismatch");
    assert_eq!(read(&state).await.fingerprint(), before);
    // Login/session errors are not diagnostic trade data and cannot replace
    // the report with an opaque authentication value.
    let failure = error("MYFXBOOK_AUTH", "Bitte erneut anmelden.");
    let result = diagnostics::save_preview_failure(&state, &input, failure, None, None).await;
    assert_eq!(result.message, "Bitte erneut anmelden.");
    assert_eq!(tokio::fs::read_to_string(path).await.unwrap(), text);
    cleanup(state).await;
}

#[tokio::test]
async fn unavailable_diagnostic_directory_keeps_the_original_import_failure() {
    let mut state = state().await;
    state.paths.logs = state.paths.root.join("not-created-for-this-test");
    let input = PreviewInput {
        authorization_id: "unused".into(),
        account_id: "test-account".into(),
        external_id: "123456".into(),
        broker_timezone: "UTC".into(),
    };
    let original =
        parse_records(&json!({"history":[row(),row()]}), "history", chrono_tz::UTC).unwrap_err();
    let expected = serde_json::to_value(&original).unwrap();
    let actual = diagnostics::save_preview_failure(&state, &input, original, None, None).await;
    assert_eq!(serde_json::to_value(actual).unwrap(), expected);
    assert!(read(&state).await.trades.is_empty());
    cleanup(state).await;
}
