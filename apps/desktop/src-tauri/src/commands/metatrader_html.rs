#[cfg(test)]
mod tests {
    use std::fs;

    use chrono_tz::Europe::Berlin;
    use serde_json::json;
    use tempfile::NamedTempFile;

    use super::*;

    fn report(account: &str, currency: &str, rows: &[&str]) -> String {
        format!(
            r#"<!doctype html><html><head><meta name="generator" content="client terminal"><title>MetaTrader 5</title></head><body>
            <p>Account: {account}</p><p>Currency: {currency}</p>
            <table><tr><th>Positions</th></tr>
            <tr><th>Time</th><th>Position</th><th>Symbol</th><th>Type</th><th>Volume</th><th>Price</th><th>S / L</th><th>T / P</th><th>Time</th><th>Price</th><th>Commission</th><th>Swap</th><th>Profit</th></tr>
            {}</table></body></html>"#,
            rows.join("\n")
        )
    }

    fn row(id: &str, direction: &str, profit: &str) -> String {
        format!(
            "<tr><td>2026.01.15 10:00:00</td><td>{id}</td><td>EURUSD</td><td>{direction}</td><td>0.10</td><td>1.10000</td><td>1.09000</td><td>1.12000</td><td>2026.01.15 11:00:00</td><td>1.11000</td><td>-1.25</td><td>-0.25</td><td>{profit}</td></tr>"
        )
    }

    fn utf16le_bom(text: &str) -> Vec<u8> {
        let mut bytes = vec![0xff, 0xfe];
        for unit in text.encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        bytes
    }

    #[test]
    fn parser_decodes_utf16le_and_maps_exact_closed_position_values() {
        let html = report("123456", "EUR", &[&row("9001", "Buy", "25.50")]);
        let parsed = parse_classic_metatrader_report(&utf16le_bom(&html), Berlin).unwrap();

        assert_eq!(parsed.identity.platform, "mt5");
        assert_eq!(parsed.identity.base_currency, "EUR");
        assert_eq!(parsed.rows.len(), 1);
        let position = parsed.rows[0].position.as_ref().unwrap();
        assert_eq!(position.source_position_id, "9001");
        assert_eq!(position.direction, "long");
        assert_eq!(position.quantity, "0.10");
        assert_eq!(position.gross_pnl_minor, 2550);
        assert_eq!(position.commission_minor, 125);
        assert_eq!(position.swap_minor, 25);
        assert_eq!(position.net_pnl_minor, 2400);
        assert_eq!(position.opened_at, "2026-01-15T09:00:00+00:00");
    }

    #[test]
    fn parser_canonicalizes_mt_adjustments_to_nonnegative_journal_costs() {
        let credit_row = row("credit", "Buy", "10.00")
            .replace("<td>-1.25</td>", "<td>0.75</td>")
            .replace("<td>-0.25</td>", "<td>0.50</td>");
        let mixed_row = row("mixed", "Buy", "10.00").replace("<td>-0.25</td>", "<td>0.50</td>");
        let html = report("123456", "EUR", &[&credit_row, &mixed_row]);

        let parsed = parse_classic_metatrader_report(html.as_bytes(), Berlin).unwrap();
        let credit = parsed.rows[0].position.as_ref().unwrap();
        assert_eq!(credit.gross_pnl_minor, 1_125);
        assert_eq!(credit.commission_minor, 0);
        assert_eq!(credit.swap_minor, 0);
        assert_eq!(credit.net_pnl_minor, 1_125);
        let mixed = parsed.rows[1].position.as_ref().unwrap();
        assert_eq!(mixed.gross_pnl_minor, 1_050);
        assert_eq!(mixed.commission_minor, 125);
        assert_eq!(mixed.swap_minor, 0);
        assert_eq!(mixed.net_pnl_minor, 925);
        assert!(parsed.rows.iter().all(|row| {
            let position = row.position.as_ref().unwrap();
            position
                .commission_minor
                .checked_add(position.swap_minor)
                .is_some_and(|costs| costs >= 0)
        }));
    }

    #[test]
    fn parser_supports_utf8_english_sell_rows_without_executing_markup() {
        let html = report(
            "123456",
            "USD",
            &[&format!(
                "<script data-boundary='>'>window.evil = true</script>{}",
                row("9002", "Sell", "-10.00")
            )],
        );
        let parsed = parse_classic_metatrader_report(html.as_bytes(), Berlin).unwrap();
        let position = parsed.rows[0].position.as_ref().unwrap();
        assert_eq!(position.direction, "short");
        assert!(
            !serde_json::to_string(&parsed)
                .unwrap()
                .contains("window.evil")
        );
    }

    #[test]
    fn parser_requires_metatrader_signature_and_explicit_closed_section() {
        let valid = report("123456", "EUR", &[&row("9005", "Buy", "1.00")]);
        let unsigned = valid.replace(r#"<meta name="generator" content="client terminal">"#, "");
        assert_eq!(
            parse_classic_metatrader_report(unsigned.as_bytes(), Berlin)
                .unwrap_err()
                .code(),
            "METATRADER_SIGNATURE_MISSING"
        );
        let commented_signature = unsigned.replace(
            "<head>",
            "<head><!-- <meta name='generator' content='client terminal'> -->",
        );
        assert_eq!(
            parse_classic_metatrader_report(commented_signature.as_bytes(), Berlin)
                .unwrap_err()
                .code(),
            "METATRADER_SIGNATURE_MISSING"
        );

        let header_without_section = valid.replace("<tr><th>Positions</th></tr>", "");
        assert_eq!(
            parse_classic_metatrader_report(header_without_section.as_bytes(), Berlin)
                .unwrap_err()
                .code(),
            "POSITIONS_TABLE_NOT_FOUND"
        );

        let open_positions = valid.replace(">Positions<", ">Open Positions<");
        assert_eq!(
            parse_classic_metatrader_report(open_positions.as_bytes(), Berlin)
                .unwrap_err()
                .code(),
            "POSITIONS_TABLE_NOT_FOUND"
        );
    }

    #[test]
    fn parser_discards_unclosed_active_content_instead_of_parsing_hidden_tables() {
        let hidden = report("123456", "EUR", &[&row("9006", "Buy", "1.00")])
            .replace("<table>", "<script data-boundary='>'><table>");

        assert_eq!(
            parse_classic_metatrader_report(hidden.as_bytes(), Berlin)
                .unwrap_err()
                .code(),
            "POSITIONS_TABLE_NOT_FOUND"
        );
    }

    #[test]
    fn parser_accepts_missing_optional_protection_and_mt5_k_volume() {
        let special = row("9003", "Buy", "1.00")
            .replace("<td>0.10</td>", "<td>1K</td>")
            .replace("<td>1.09000</td>", "<td></td>")
            .replace("<td>1.12000</td>", "<td></td>");
        let html = report("123456", "EUR", &[&special]);

        let parsed = parse_classic_metatrader_report(html.as_bytes(), Berlin).unwrap();
        let position = parsed.rows[0].position.as_ref().unwrap();
        assert_eq!(position.quantity, "1000");
        assert_eq!(position.stop_loss, None);
        assert_eq!(position.take_profit, None);
    }

    #[test]
    fn parser_rejects_aggregate_duplicate_ids_and_oversized_input_stably() {
        let aggregate = b"<html><script>window.__report = {}</script></html>";
        assert_eq!(
            parse_classic_metatrader_report(aggregate, Berlin)
                .unwrap_err()
                .code(),
            "UNSUPPORTED_AGGREGATE_REPORT"
        );

        let duplicate = report(
            "123456",
            "EUR",
            &[&row("same", "Buy", "1.00"), &row("same", "Buy", "1.00")],
        );
        assert_eq!(
            parse_classic_metatrader_report(duplicate.as_bytes(), Berlin)
                .unwrap_err()
                .code(),
            "DUPLICATE_POSITION_ID"
        );

        let oversized = vec![b'x'; MAX_FILE_BYTES + 1];
        assert_eq!(
            parse_classic_metatrader_report(&oversized, Berlin)
                .unwrap_err()
                .code(),
            "FILE_TOO_LARGE"
        );
    }

    #[test]
    fn parser_rejects_invalid_encoding_duplicate_headers_and_excessive_cells() {
        assert_eq!(
            parse_classic_metatrader_report(&[b'<', 0, b'h', 0], Berlin)
                .unwrap_err()
                .code(),
            "INVALID_ENCODING"
        );
        let header = "<tr><th>Time</th><th>Position</th><th>Symbol</th><th>Type</th><th>Volume</th><th>Price</th><th>S / L</th><th>T / P</th><th>Time</th><th>Price</th><th>Commission</th><th>Swap</th><th>Profit</th></tr>";
        let duplicate_headers = report("123456", "EUR", &[header, &row("1", "Buy", "1.00")]);
        assert_eq!(
            parse_classic_metatrader_report(duplicate_headers.as_bytes(), Berlin)
                .unwrap_err()
                .code(),
            "DUPLICATE_POSITIONS_TABLE"
        );
        let cells = (0..=MAX_CELLS_PER_ROW)
            .map(|_| "<td>x</td>")
            .collect::<String>();
        let excessive = format!(
            "<html><head><meta name='generator' content='client terminal'></head><p>Account: 123456 Currency: EUR</p><table><tr>{cells}</tr></table></html>"
        );
        assert_eq!(
            parse_classic_metatrader_report(excessive.as_bytes(), Berlin)
                .unwrap_err()
                .code(),
            "PARSER_LIMIT_EXCEEDED"
        );
    }

    #[test]
    fn parser_marks_malformed_required_fields_and_rejects_missing_positions_table() {
        let malformed = row("9004", "Buy", "1.00")
            .replace("<td>0.10</td>", "<td>not-a-number</td>")
            .replace("2026.01.15 11:00:00", "")
            .replace("<td>Buy</td>", "<td>Buy Limit</td>");
        let html = report("123456", "EUR", &[&malformed]);
        let parsed = parse_classic_metatrader_report(html.as_bytes(), Berlin).unwrap();

        assert_eq!(
            parsed.rows[0].errors,
            vec![
                "UNSUPPORTED_POSITION_TYPE",
                "MISSING_CLOSE_OR_OPEN_TIME",
                "INVALID_VOLUME",
            ]
        );
        assert!(parsed.rows[0].position.is_none());
        assert_eq!(
            parse_classic_metatrader_report(
                b"<html><head><meta name='generator' content='client terminal'></head><p>Account: 123456 Currency: EUR</p></html>",
                Berlin,
            )
            .unwrap_err()
            .code(),
            "POSITIONS_TABLE_NOT_FOUND"
        );
    }

    #[test]
    fn parser_blocks_ambiguous_and_nonexistent_broker_times_as_invalid_rows() {
        let ambiguous =
            row("a", "Buy", "1.00").replace("2026.01.15 10:00:00", "2026.10.25 02:30:00");
        let nonexistent =
            row("b", "Buy", "1.00").replace("2026.01.15 10:00:00", "2026.03.29 02:30:00");
        let html = report("123456", "EUR", &[&ambiguous, &nonexistent]);
        let parsed = parse_classic_metatrader_report(html.as_bytes(), Berlin).unwrap();

        assert_eq!(parsed.rows[0].errors, vec!["AMBIGUOUS_LOCAL_TIME"]);
        assert_eq!(parsed.rows[1].errors, vec!["NONEXISTENT_LOCAL_TIME"]);
        assert!(parsed.rows.iter().all(|row| row.position.is_none()));
    }

    #[test]
    fn parser_validates_symbol_positive_numbers_time_order_and_checked_money() {
        let invalid_values = row("invalid", "Buy", "1.00")
            .replace("EURUSD", "EUR/USD")
            .replace("<td>0.10</td>", "<td>0</td>")
            .replace("<td>1.10000</td>", "<td>-1</td>")
            .replace("<td>1.09000</td>", "<td>0</td>")
            .replace("<td>1.12000</td>", "<td>-2</td>")
            .replace("<td>1.11000</td>", "<td>0</td>")
            .replace("2026.01.15 11:00:00", "2026.01.15 09:00:00");
        let overflow = row("overflow", "Buy", "92233720368547758.07")
            .replace("<td>-1.25</td>", "<td>0.01</td>")
            .replace("<td>-0.25</td>", "<td>0.00</td>");
        let decimal_overflow = row("decimal-overflow", "Buy", "1.00")
            .replace("<td>0.10</td>", "<td>79228162514264337593543950335K</td>");
        let html = report(
            "123456",
            "EUR",
            &[&invalid_values, &overflow, &decimal_overflow],
        );

        let parsed = parse_classic_metatrader_report(html.as_bytes(), Berlin).unwrap();
        assert_eq!(
            parsed.rows[0].errors,
            vec![
                "INVALID_SYMBOL",
                "CLOSE_BEFORE_OPEN",
                "INVALID_VOLUME",
                "INVALID_ENTRY_PRICE",
                "INVALID_STOP_LOSS",
                "INVALID_TAKE_PROFIT",
                "INVALID_EXIT_PRICE",
            ]
        );
        assert_eq!(parsed.rows[1].errors, vec!["MONEY_OVERFLOW"]);
        assert_eq!(parsed.rows[2].errors, vec!["INVALID_VOLUME"]);
        assert!(parsed.rows.iter().all(|row| row.position.is_none()));
    }

    #[test]
    fn asset_classification_is_deterministic_and_unknown_is_not_forex() {
        assert_eq!(classify_asset_class("EURUSD"), "forex");
        assert_eq!(classify_asset_class("XAUUSD.m"), "metal");
        assert_eq!(classify_asset_class("BTCUSD"), "crypto");
        assert_eq!(classify_asset_class("US500.cash"), "index");
        assert_eq!(classify_asset_class("M6EU6"), "futures");
        assert_eq!(classify_asset_class("AAPL"), "other");
    }

    #[test]
    fn parser_counts_but_does_not_import_open_orders_deals_or_balance_rows() {
        let balance = row("balance-id", "Balance", "5.00");
        let extra_sections = r#"
            <table><tr><th>Open Positions</th></tr><tr><th>Time</th><th>Position</th><th>Symbol</th></tr>
            <tr><td>2026.01.15 12:00:00</td><td>open-id</td><td>EURUSD</td></tr></table>
            <table><tr><th>Orders</th></tr><tr><th>Time</th><th>Order</th><th>Symbol</th></tr>
            <tr><td>2026.01.15 12:00:00</td><td>order-id</td><td>EURUSD</td></tr></table>
            <table><tr><th>Deals</th></tr><tr><th>Time</th><th>Deal</th><th>Symbol</th></tr>
            <tr><td>2026.01.15 12:00:00</td><td>deal-id</td><td>EURUSD</td></tr></table>"#;
        let html = report(
            "123456",
            "EUR",
            &[&row("closed-id", "Buy", "1.00"), &balance],
        )
        .replace("</body>", &format!("{extra_sections}</body>"));

        let parsed = parse_classic_metatrader_report(html.as_bytes(), Berlin).unwrap();

        assert_eq!(parsed.rows.len(), 1);
        assert_eq!(parsed.ignored.balance_rows, 1);
        assert_eq!(parsed.ignored.open_positions, 1);
        assert_eq!(parsed.ignored.orders, 1);
        assert_eq!(parsed.ignored.deals, 1);
    }

    #[tokio::test]
    async fn import_preview_commit_is_idempotent_and_changed_payload_conflicts() {
        let state = crate::database::initialize_headless().await.unwrap();
        insert_account(&state.db, "account-a", "EUR", false).await;
        let file = write_report(&report("123456", "EUR", &[&row("9001", "Buy", "25.50")]));

        let first =
            preview_metatrader_html_core(&state.db, file.path(), "account-a", "Europe/Berlin")
                .await
                .unwrap();
        assert!(first.can_commit);
        assert_eq!(first.valid, 1);
        assert_eq!(first.masked_source_account, "••••3456");
        let source_details: (String, String) =
            sqlx::query_as("SELECT source_sha256, mapping_json FROM import_runs WHERE id = ?")
                .bind(&first.run_id)
                .fetch_one(&state.db)
                .await
                .unwrap();
        assert_eq!(source_details.0.len(), 64);
        assert!(!source_details.1.contains("123456"));
        let staged_text: String = sqlx::query_scalar(
            "SELECT raw_json || COALESCE(normalized_json, '') FROM import_rows WHERE import_run_id = ?",
        )
        .bind(&first.run_id)
        .fetch_one(&state.db)
        .await
        .unwrap();
        assert!(!staged_text.contains("<html"));
        assert!(!staged_text.contains("<script"));
        let committed = commit_metatrader_html_core(&state.db, &first.run_id, "account-a")
            .await
            .unwrap();
        assert_eq!(committed.inserted, 1);

        let duplicate =
            preview_metatrader_html_core(&state.db, file.path(), "account-a", "Europe/Berlin")
                .await
                .unwrap();
        assert_eq!((duplicate.duplicate, duplicate.conflict), (1, 0));
        let duplicate_commit =
            commit_metatrader_html_core(&state.db, &duplicate.run_id, "account-a")
                .await
                .unwrap();
        assert_eq!(
            (duplicate_commit.inserted, duplicate_commit.duplicate),
            (0, 1)
        );

        fs::write(
            file.path(),
            report("123456", "EUR", &[&row("9001", "Buy", "99.00")]),
        )
        .unwrap();
        let conflict =
            preview_metatrader_html_core(&state.db, file.path(), "account-a", "Europe/Berlin")
                .await
                .unwrap();
        assert_eq!(conflict.conflict, 1);
        assert!(!conflict.can_commit);
        assert_eq!(count(&state.db, "trades").await, 1);
        assert_eq!(
            preview_metatrader_html_core(&state.db, file.path(), "account-a", "UTC")
                .await
                .unwrap_err()
                .code,
            "IMPORT_SOURCE_TIMEZONE_MISMATCH"
        );
    }

    #[tokio::test]
    async fn import_rejects_account_switch_archive_currency_and_invalid_paths() {
        let state = crate::database::initialize_headless().await.unwrap();
        insert_account(&state.db, "account-a", "EUR", false).await;
        insert_account(&state.db, "account-b", "USD", false).await;
        let file = write_report(&report("123456", "EUR", &[&row("9001", "Buy", "25.50")]));
        let preview =
            preview_metatrader_html_core(&state.db, file.path(), "account-a", "Europe/Berlin")
                .await
                .unwrap();

        assert_eq!(
            commit_metatrader_html_core(&state.db, &preview.run_id, "account-b")
                .await
                .unwrap_err()
                .code,
            "IMPORT_ACCOUNT_MISMATCH"
        );
        sqlx::query("UPDATE accounts SET is_archived = 1 WHERE id = 'account-a'")
            .execute(&state.db)
            .await
            .unwrap();
        assert_eq!(
            commit_metatrader_html_core(&state.db, &preview.run_id, "account-a")
                .await
                .unwrap_err()
                .code,
            "ACCOUNT_NOT_FOUND"
        );
        assert_eq!(
            preview_metatrader_html_core(&state.db, file.path(), "account-a", "Europe/Berlin",)
                .await
                .unwrap_err()
                .code,
            "ACCOUNT_NOT_FOUND"
        );
        assert_eq!(
            preview_metatrader_html_core(&state.db, file.path(), "", "Europe/Berlin")
                .await
                .unwrap_err()
                .code,
            "ACCOUNT_REQUIRED"
        );

        let runs_before = count(&state.db, "import_runs").await;
        assert_eq!(
            preview_metatrader_html_core(&state.db, file.path(), "account-b", "Europe/Berlin")
                .await
                .unwrap_err()
                .code,
            "IMPORT_CURRENCY_MISMATCH"
        );
        assert_eq!(count(&state.db, "import_runs").await, runs_before);

        let invalid_extension = tempfile::Builder::new().suffix(".txt").tempfile().unwrap();
        fs::write(
            invalid_extension.path(),
            report("123456", "USD", &[&row("1", "Buy", "1.00")]),
        )
        .unwrap();
        assert_eq!(
            preview_metatrader_html_core(
                &state.db,
                invalid_extension.path(),
                "account-b",
                "Europe/Berlin",
            )
            .await
            .unwrap_err()
            .code,
            "INVALID_FILE_EXTENSION"
        );
    }

    #[tokio::test]
    async fn import_commit_rejects_tampered_normalized_payload_hash_atomically() {
        let state = crate::database::initialize_headless().await.unwrap();
        insert_account(&state.db, "account-a", "EUR", false).await;
        let file = write_report(&report(
            "123456",
            "EUR",
            &[&row("9001", "Buy", "25.50"), &row("9002", "Sell", "10.00")],
        ));
        let preview =
            preview_metatrader_html_core(&state.db, file.path(), "account-a", "Europe/Berlin")
                .await
                .unwrap();
        let row_id: String = sqlx::query_scalar(
            "SELECT id FROM import_rows WHERE import_run_id = ? AND status = 'valid' ORDER BY row_number DESC LIMIT 1",
        )
        .bind(&preview.run_id)
        .fetch_one(&state.db)
        .await
        .unwrap();
        let normalized: String =
            sqlx::query_scalar("SELECT normalized_json FROM import_rows WHERE id = ?")
                .bind(&row_id)
                .fetch_one(&state.db)
                .await
                .unwrap();
        let mut payload: serde_json::Value = serde_json::from_str(&normalized).unwrap();
        payload["position"]["symbol"] = json!("GBPUSD");
        sqlx::query("UPDATE import_rows SET normalized_json = ? WHERE id = ?")
            .bind(payload.to_string())
            .bind(row_id)
            .execute(&state.db)
            .await
            .unwrap();

        assert_eq!(
            commit_metatrader_html_core(&state.db, &preview.run_id, "account-a")
                .await
                .unwrap_err()
                .code,
            "IMPORT_STAGING_HASH_MISMATCH"
        );
        assert_eq!(count(&state.db, "trades").await, 0);
        assert_eq!(count(&state.db, "metatrader_trade_links").await, 0);
    }

    #[tokio::test]
    async fn import_commit_persists_asset_class_derived_from_symbol() {
        let state = crate::database::initialize_headless().await.unwrap();
        insert_account(&state.db, "account-a", "EUR", false).await;
        let equity = row("9001", "Buy", "25.50").replace("EURUSD", "AAPL");
        let file = write_report(&report("123456", "EUR", &[&equity]));
        let preview =
            preview_metatrader_html_core(&state.db, file.path(), "account-a", "Europe/Berlin")
                .await
                .unwrap();

        commit_metatrader_html_core(&state.db, &preview.run_id, "account-a")
            .await
            .unwrap();
        let asset_class: String =
            sqlx::query_scalar("SELECT asset_class FROM trades WHERE account_id = 'account-a'")
                .fetch_one(&state.db)
                .await
                .unwrap();
        assert_eq!(asset_class, "other");
    }

    #[tokio::test]
    async fn import_commit_revalidates_cross_account_source_binding_races() {
        let state = crate::database::initialize_headless().await.unwrap();
        insert_account(&state.db, "account-a", "EUR", false).await;
        insert_account(&state.db, "account-b", "EUR", false).await;
        let file = write_report(&report("123456", "EUR", &[&row("9001", "Buy", "25.50")]));
        let preview_a =
            preview_metatrader_html_core(&state.db, file.path(), "account-a", "Europe/Berlin")
                .await
                .unwrap();
        let preview_b =
            preview_metatrader_html_core(&state.db, file.path(), "account-b", "Europe/Berlin")
                .await
                .unwrap();

        commit_metatrader_html_core(&state.db, &preview_a.run_id, "account-a")
            .await
            .unwrap();
        assert_eq!(
            commit_metatrader_html_core(&state.db, &preview_b.run_id, "account-b")
                .await
                .unwrap_err()
                .code,
            "IMPORT_SOURCE_ALREADY_BOUND"
        );
        assert_eq!(count(&state.db, "trades").await, 1);
    }

    fn write_report(html: &str) -> NamedTempFile {
        let file = tempfile::Builder::new().suffix(".html").tempfile().unwrap();
        fs::write(file.path(), html).unwrap();
        file
    }

    async fn insert_account(db: &sqlx::SqlitePool, id: &str, currency: &str, archived: bool) {
        sqlx::query("INSERT INTO accounts (id, name, base_currency, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
            .bind(id)
            .bind(id)
            .bind(currency)
            .bind(archived)
            .execute(db)
            .await
            .unwrap();
    }

    async fn count(db: &sqlx::SqlitePool, table: &str) -> i64 {
        sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
            .fetch_one(db)
            .await
            .unwrap()
    }

    #[test]
    #[ignore]
    fn validates_supplied_reports_without_persisting_personal_data() {
        let classic_path = std::env::var("METATRADER_CLASSIC_REPORT_PATH").unwrap();
        let modern_path = std::env::var("METATRADER_MODERN_REPORT_PATH").unwrap();
        let classic = fs::read(classic_path).unwrap();
        let parsed = parse_classic_metatrader_report(&classic, Berlin)
            .unwrap_or_else(|error| panic!("classic structural error: {}", error.code()));
        let mut error_counts = std::collections::BTreeMap::<String, usize>::new();
        for row in &parsed.rows {
            for code in &row.errors {
                *error_counts.entry(code.clone()).or_default() += 1;
            }
        }
        assert_eq!(
            parsed
                .rows
                .iter()
                .filter(|row| row.position.is_some())
                .count(),
            207,
            "sanitized rows={}, open={}, errors={error_counts:?}",
            parsed.rows.len(),
            parsed.ignored.open_positions
        );
        assert_eq!(parsed.ignored.open_positions, 5);
        let modern = fs::read(modern_path).unwrap();
        assert_eq!(
            parse_classic_metatrader_report(&modern, Berlin)
                .unwrap_err()
                .code(),
            "UNSUPPORTED_AGGREGATE_REPORT"
        );
    }
}
use std::{
    collections::HashSet,
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    str::FromStr,
};

use chrono::{LocalResult, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Tz;
use regex::Regex;
use rust_decimal::{Decimal, prelude::ToPrimitive};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use tauri::State;
use uuid::Uuid;

use crate::{
    database::AppState,
    errors::{CommandError, CommandResult},
};

pub const MAX_FILE_BYTES: usize = 16 * 1024 * 1024;
const MAX_TABLES: usize = 64;
const MAX_ROWS: usize = 25_000;
const MAX_CELLS_PER_ROW: usize = 64;
const MAX_TEXT_BYTES: usize = 4 * 1024 * 1024;
const MAX_TAG_BYTES: usize = 64 * 1024;

#[derive(Debug)]
pub struct MetaTraderHtmlError {
    code: &'static str,
    message: &'static str,
}

impl MetaTraderHtmlError {
    fn new(code: &'static str, message: &'static str) -> Self {
        Self { code, message }
    }

    #[cfg(test)]
    fn code(&self) -> &'static str {
        self.code
    }

    fn command(self) -> CommandError {
        command_error(self.code, self.message)
    }
}

impl std::fmt::Display for MetaTraderHtmlError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.message)
    }
}

impl std::error::Error for MetaTraderHtmlError {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedReportIdentity {
    pub platform: String,
    #[serde(skip_serializing)]
    pub report_account: String,
    pub base_currency: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IgnoredSectionCounts {
    pub open_positions: usize,
    pub orders: usize,
    pub deals: usize,
    pub balance_rows: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedClosedPosition {
    pub source_position_id: String,
    pub symbol: String,
    pub direction: String,
    pub quantity: String,
    pub entry_price: String,
    pub stop_loss: Option<String>,
    pub take_profit: Option<String>,
    pub exit_price: String,
    pub opened_at: String,
    pub closed_at: String,
    pub display_timezone: String,
    pub gross_pnl_minor: i64,
    pub fees_minor: i64,
    pub commission_minor: i64,
    pub swap_minor: i64,
    pub net_pnl_minor: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedPositionRow {
    pub row_number: usize,
    pub source_position_id: Option<String>,
    pub position: Option<ParsedClosedPosition>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedMetaTraderReport {
    pub identity: ParsedReportIdentity,
    pub rows: Vec<ParsedPositionRow>,
    pub ignored: IgnoredSectionCounts,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct MetaTraderHtmlPreviewInput {
    pub path: String,
    pub account_id: String,
    pub source_timezone: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct MetaTraderHtmlCommitInput {
    pub run_id: String,
    pub account_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaTraderHtmlRowPreview {
    pub row_number: usize,
    pub status: String,
    pub source_position_id: Option<String>,
    pub symbol: Option<String>,
    pub direction: Option<String>,
    pub opened_at: Option<String>,
    pub closed_at: Option<String>,
    pub net_pnl_minor: Option<i64>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaTraderHtmlPreview {
    pub run_id: String,
    pub masked_source_account: String,
    pub base_currency: String,
    pub source_timezone: String,
    pub valid: usize,
    pub invalid: usize,
    pub ignored: usize,
    pub duplicate: usize,
    pub conflict: usize,
    pub open_positions: usize,
    pub orders: usize,
    pub deals: usize,
    pub can_commit: bool,
    pub rows: Vec<MetaTraderHtmlRowPreview>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaTraderHtmlCommitResult {
    pub run_id: String,
    pub inserted: usize,
    pub duplicate: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StagedSource {
    platform: String,
    report_account_sha256: String,
    report_account_masked: String,
    base_currency: String,
    source_timezone: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StagedPosition {
    position: ParsedClosedPosition,
    payload_sha256: String,
}

#[tauri::command]
#[allow(dead_code)]
pub async fn preview_metatrader_html(
    state: State<'_, AppState>,
    input: MetaTraderHtmlPreviewInput,
) -> CommandResult<MetaTraderHtmlPreview> {
    preview_metatrader_html_core(
        &state.db,
        Path::new(&input.path),
        &input.account_id,
        &input.source_timezone,
    )
    .await
}

#[tauri::command]
#[allow(dead_code)]
pub async fn commit_metatrader_html(
    state: State<'_, AppState>,
    input: MetaTraderHtmlCommitInput,
) -> CommandResult<MetaTraderHtmlCommitResult> {
    commit_metatrader_html_core(&state.db, &input.run_id, &input.account_id).await
}

pub fn parse_classic_metatrader_report(
    bytes: &[u8],
    source_timezone: Tz,
) -> Result<ParsedMetaTraderReport, MetaTraderHtmlError> {
    let decoded = decode_report(bytes)?;
    let lower = decoded.to_ascii_lowercase();
    if lower.contains("window.__report") || lower.contains("__svelte") {
        return Err(MetaTraderHtmlError::new(
            "UNSUPPORTED_AGGREGATE_REPORT",
            "Dieser interaktive MetaTrader-Bericht enthält keine importierbaren Einzelpositionen.",
        ));
    }

    let inert = sanitize_active_content(&decoded)?;
    if !has_metatrader_signature(&inert)? {
        return Err(format_error("METATRADER_SIGNATURE_MISSING"));
    }
    let table_re = regex(r"(?is)<table\b[^>]*>(.*?)</table\s*>")?;
    let row_re = regex(r"(?is)<tr\b[^>]*>(.*?)</tr\s*>")?;
    let cell_re = regex(r"(?is)<t[dh]\b[^>]*>(.*?)</t[dh]\s*>")?;
    let tables = table_re.captures_iter(&inert).collect::<Vec<_>>();
    if tables.is_empty() {
        return Err(format_error("POSITIONS_TABLE_NOT_FOUND"));
    }
    if tables.len() > MAX_TABLES {
        return Err(format_error("PARSER_LIMIT_EXCEEDED"));
    }

    let document_text = html_text(&inert)?;
    if document_text.len() > MAX_TEXT_BYTES {
        return Err(format_error("PARSER_LIMIT_EXCEEDED"));
    }
    let identity = parse_identity(&document_text)?;
    let mut all_rows = Vec::<Vec<String>>::new();
    for table in tables {
        for row in row_re.captures_iter(&table[1]) {
            if all_rows.len() >= MAX_ROWS {
                return Err(format_error("PARSER_LIMIT_EXCEEDED"));
            }
            let cells = cell_re
                .captures_iter(&row[1])
                .map(|cell| html_text(&cell[1]))
                .collect::<Result<Vec<_>, _>>()?;
            if cells.len() > MAX_CELLS_PER_ROW {
                return Err(format_error("PARSER_LIMIT_EXCEEDED"));
            }
            if !cells.is_empty() {
                all_rows.push(cells);
            }
        }
    }

    let closed_sections = all_rows
        .iter()
        .enumerate()
        .filter_map(|(index, cells)| is_closed_positions_section(cells).then_some(index))
        .collect::<Vec<_>>();
    if closed_sections.len() > 1 {
        return Err(format_error("DUPLICATE_POSITIONS_TABLE"));
    }
    let section_index = closed_sections
        .first()
        .copied()
        .ok_or_else(|| format_error("POSITIONS_TABLE_NOT_FOUND"))?;
    let section_end = all_rows
        .iter()
        .enumerate()
        .skip(section_index + 1)
        .find_map(|(index, cells)| (cells.len() == 1).then_some(index))
        .unwrap_or(all_rows.len());
    let headers = all_rows[section_index + 1..section_end]
        .iter()
        .enumerate()
        .filter_map(|(offset, cells)| {
            HeaderMap::from_cells(cells).map(|map| (section_index + 1 + offset, map))
        })
        .collect::<Vec<_>>();
    if headers.len() > 1 {
        return Err(format_error("DUPLICATE_POSITIONS_TABLE"));
    }
    let (header_index, map) = headers
        .first()
        .copied()
        .ok_or_else(|| format_error("POSITIONS_TABLE_NOT_FOUND"))?;
    let mut parsed_rows = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut ignored = count_ignored_sections(&all_rows, header_index);
    for (offset, cells) in all_rows[header_index + 1..section_end].iter().enumerate() {
        let row_map = map.for_data_row(cells);
        if cells.len() <= row_map.max_index() || cells.iter().all(|cell| cell.trim().is_empty()) {
            continue;
        }
        let kind = normalized(&cells[row_map.kind]);
        if matches!(
            kind.as_str(),
            "balance" | "credit" | "deposit" | "withdrawal"
        ) {
            ignored.balance_rows += 1;
            continue;
        }
        let source_id = cells[row_map.position].trim().to_owned();
        if !source_id.is_empty() && !seen_ids.insert(source_id.clone()) {
            return Err(format_error("DUPLICATE_POSITION_ID"));
        }
        parsed_rows.push(parse_position_row(
            offset + 1,
            cells,
            &row_map,
            source_timezone,
        ));
    }
    if parsed_rows.is_empty() {
        return Err(format_error("POSITIONS_TABLE_NOT_FOUND"));
    }
    Ok(ParsedMetaTraderReport {
        identity,
        rows: parsed_rows,
        ignored,
    })
}

pub async fn preview_metatrader_html_core(
    db: &SqlitePool,
    path: &Path,
    account_id: &str,
    source_timezone: &str,
) -> CommandResult<MetaTraderHtmlPreview> {
    let account_id = account_id.trim();
    let timezone = Tz::from_str(source_timezone.trim()).map_err(|_| {
        command_error(
            "INVALID_TIMEZONE",
            "Die Broker-Zeitzone muss eine gültige IANA-Zeitzone sein.",
        )
    })?;
    let account = active_account(db, account_id).await?;
    let canonical = validate_report_path(path)?;
    let bytes = read_bounded_file(&canonical)?;
    let parsed =
        parse_classic_metatrader_report(&bytes, timezone).map_err(|error| error.command())?;
    if !parsed.identity.base_currency.eq_ignore_ascii_case(&account) {
        return Err(command_error(
            "IMPORT_CURRENCY_MISMATCH",
            "Die Berichtswährung stimmt nicht mit dem ausgewählten Konto überein.",
        ));
    }

    let account_hash = sha256_hex(parsed.identity.report_account.trim().as_bytes());
    let masked = mask_account(&parsed.identity.report_account);
    let staged_source = StagedSource {
        platform: parsed.identity.platform.clone(),
        report_account_sha256: account_hash.clone(),
        report_account_masked: masked.clone(),
        base_currency: parsed.identity.base_currency.clone(),
        source_timezone: timezone.name().to_owned(),
    };
    let source = validate_existing_source(db, account_id, &staged_source).await?;

    let run_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let mut valid = 0usize;
    let mut invalid = 0usize;
    let mut duplicate = 0usize;
    let mut conflict = 0usize;
    let mut staged = Vec::new();
    let mut previews = Vec::new();
    for row in &parsed.rows {
        let (status, normalized_json, errors) = if let Some(position) = &row.position {
            let payload_sha256 = payload_hash(position)?;
            let status = if let Some(source_id) = source.as_ref().map(|item| item.0.as_str()) {
                match existing_link_hash(db, source_id, &position.source_position_id).await? {
                    Some(existing) if existing == payload_sha256 => "duplicate",
                    Some(_) => "conflict",
                    None => "valid",
                }
            } else {
                "valid"
            };
            match status {
                "valid" => valid += 1,
                "duplicate" => duplicate += 1,
                "conflict" => conflict += 1,
                _ => {}
            }
            let payload = StagedPosition {
                position: position.clone(),
                payload_sha256,
            };
            (
                status,
                Some(serde_json::to_string(&payload).map_err(json_error)?),
                Vec::new(),
            )
        } else {
            invalid += 1;
            ("invalid", None, row.errors.clone())
        };
        staged.push((
            row.row_number,
            status.to_owned(),
            normalized_json,
            errors.clone(),
        ));
        if previews.len() < 25 {
            previews.push(MetaTraderHtmlRowPreview {
                row_number: row.row_number,
                status: status.to_owned(),
                source_position_id: row.source_position_id.clone(),
                symbol: row
                    .position
                    .as_ref()
                    .map(|position| position.symbol.clone()),
                direction: row
                    .position
                    .as_ref()
                    .map(|position| position.direction.clone()),
                opened_at: row
                    .position
                    .as_ref()
                    .map(|position| position.opened_at.clone()),
                closed_at: row
                    .position
                    .as_ref()
                    .map(|position| position.closed_at.clone()),
                net_pnl_minor: row.position.as_ref().map(|position| position.net_pnl_minor),
                errors,
            });
        }
    }
    let ignored_total = parsed.ignored.open_positions
        + parsed.ignored.orders
        + parsed.ignored.deals
        + parsed.ignored.balance_rows;
    let report_json = serde_json::json!({
        "ignored": parsed.ignored,
        "conflictRows": conflict,
    });
    let mut tx = db.begin().await?;
    sqlx::query("INSERT INTO import_runs (id, source_type, source_filename, source_sha256, status, mapping_json, total_rows, valid_rows, invalid_rows, duplicate_rows, report_json, created_at, target_account_id, source_timezone) VALUES (?, 'metatrader_html', 'metatrader-report.html', ?, 'preview', ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&run_id)
        .bind(sha256_hex(&bytes))
        .bind(serde_json::to_string(&staged_source).map_err(json_error)?)
        .bind(parsed.rows.len() as i64)
        .bind(valid as i64)
        .bind(invalid as i64)
        .bind(duplicate as i64)
        .bind(report_json.to_string())
        .bind(&now)
        .bind(account_id)
        .bind(timezone.name())
        .execute(&mut *tx)
        .await?;
    for (row_number, status, normalized_json, errors) in staged {
        sqlx::query("INSERT INTO import_rows (id, import_run_id, row_number, status, raw_json, normalized_json, errors_json) VALUES (?, ?, ?, ?, '{}', ?, ?)")
            .bind(Uuid::new_v4().to_string())
            .bind(&run_id)
            .bind(row_number as i64)
            .bind(status)
            .bind(normalized_json)
            .bind(serde_json::to_string(&errors).map_err(json_error)?)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(MetaTraderHtmlPreview {
        run_id,
        masked_source_account: masked,
        base_currency: parsed.identity.base_currency,
        source_timezone: timezone.name().to_owned(),
        valid,
        invalid,
        ignored: ignored_total,
        duplicate,
        conflict,
        open_positions: parsed.ignored.open_positions,
        orders: parsed.ignored.orders,
        deals: parsed.ignored.deals,
        can_commit: invalid == 0 && conflict == 0,
        rows: previews,
    })
}

pub async fn commit_metatrader_html_core(
    db: &SqlitePool,
    run_id: &str,
    account_id: &str,
) -> CommandResult<MetaTraderHtmlCommitResult> {
    let mut connection = db.acquire().await?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await?;
    let result: CommandResult<MetaTraderHtmlCommitResult> = async {
        let run = sqlx::query("SELECT status, target_account_id, mapping_json FROM import_runs WHERE id = ? AND source_type = 'metatrader_html'")
            .bind(run_id.trim())
            .fetch_optional(&mut *connection)
            .await?
            .ok_or_else(|| command_error("IMPORT_RUN_NOT_FOUND", "Die Importvorschau wurde nicht gefunden."))?;
        let status: String = run.try_get("status")?;
        let target_account_id: Option<String> = run.try_get("target_account_id")?;
        if status != "preview" {
            return Err(command_error("IMPORT_RUN_NOT_PREVIEW", "Diese Importvorschau kann nicht mehr übernommen werden."));
        }
        if target_account_id.as_deref() != Some(account_id.trim()) {
            return Err(command_error("IMPORT_ACCOUNT_MISMATCH", "Die Importvorschau gehört zu einem anderen Konto."));
        }
        let currency = active_account_on_connection(&mut connection, account_id.trim()).await?;
        let mapping_json: String = run.try_get("mapping_json")?;
        let source: StagedSource = serde_json::from_str(&mapping_json).map_err(json_error)?;
        if !currency.eq_ignore_ascii_case(&source.base_currency) {
            return Err(command_error("IMPORT_CURRENCY_MISMATCH", "Die Berichtswährung stimmt nicht mehr mit dem Konto überein."));
        }
        let blocked: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM import_rows WHERE import_run_id = ? AND status IN ('invalid','conflict')")
            .bind(run_id.trim())
            .fetch_one(&mut *connection)
            .await?;
        if blocked > 0 {
            return Err(command_error("IMPORT_NOT_COMMITTABLE", "Die Vorschau enthält ungültige oder konfliktbehaftete Zeilen."));
        }
        let source_id = bind_source_on_commit(&mut connection, account_id.trim(), &source).await?;
        let rows = sqlx::query("SELECT status, normalized_json FROM import_rows WHERE import_run_id = ? ORDER BY row_number")
            .bind(run_id.trim())
            .fetch_all(&mut *connection)
            .await?;
        let mut inserted = 0usize;
        let mut duplicates = 0usize;
        let now = Utc::now().to_rfc3339();
        for row in rows {
            let row_status: String = row.try_get("status")?;
            let normalized_json: Option<String> = row.try_get("normalized_json")?;
            let staged: StagedPosition = serde_json::from_str(normalized_json.as_deref().unwrap_or(""))
                .map_err(json_error)?;
            let computed_payload_hash = payload_hash(&staged.position)?;
            if computed_payload_hash != staged.payload_sha256 {
                return Err(command_error(
                    "IMPORT_STAGING_HASH_MISMATCH",
                    "Die normalisierten Importdaten wurden seit der Vorschau verändert.",
                ));
            }
            if row_status == "duplicate" {
                duplicates += 1;
                continue;
            }
            if let Some(existing) = existing_link_hash_on_connection(&mut connection, &source_id, &staged.position.source_position_id).await? {
                if existing == computed_payload_hash {
                    duplicates += 1;
                    continue;
                }
                return Err(command_error("IMPORT_PAYLOAD_CONFLICT", "Eine Quellposition besitzt bereits abweichende Daten."));
            }
            let trade_id = Uuid::new_v4().to_string();
            let metadata = serde_json::json!({
                "platform": source.platform,
                "sourcePositionId": staged.position.source_position_id,
                "sourceAccount": source.report_account_masked,
                "importRunId": run_id,
            });
            sqlx::query("INSERT INTO trades (id, account_id, status, instrument, asset_class, direction, broker_trade_id, opened_at, closed_at, display_timezone, actual_entry, initial_stop_loss, actual_exit, take_profit, quantity, gross_pnl_minor, fees_minor, commission_minor, swap_minor, net_pnl_minor, source, source_metadata_json, created_at, updated_at) VALUES (?, ?, 'closed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'metatrader_html', ?, ?, ?)")
                .bind(&trade_id)
                .bind(account_id.trim())
                .bind(&staged.position.symbol)
                .bind(classify_asset_class(&staged.position.symbol))
                .bind(&staged.position.direction)
                .bind(&staged.position.source_position_id)
                .bind(&staged.position.opened_at)
                .bind(&staged.position.closed_at)
                .bind(&staged.position.display_timezone)
                .bind(&staged.position.entry_price)
                .bind(&staged.position.stop_loss)
                .bind(&staged.position.exit_price)
                .bind(&staged.position.take_profit)
                .bind(&staged.position.quantity)
                .bind(staged.position.gross_pnl_minor)
                .bind(staged.position.fees_minor)
                .bind(staged.position.commission_minor)
                .bind(staged.position.swap_minor)
                .bind(staged.position.net_pnl_minor)
                .bind(metadata.to_string())
                .bind(&now)
                .bind(&now)
                .execute(&mut *connection)
                .await?;
            sqlx::query("INSERT INTO metatrader_trade_links (source_id, source_position_id, trade_id, payload_sha256, import_run_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
                .bind(&source_id)
                .bind(&staged.position.source_position_id)
                .bind(&trade_id)
                .bind(&computed_payload_hash)
                .bind(run_id.trim())
                .bind(&now)
                .execute(&mut *connection)
                .await?;
            inserted += 1;
        }
        sqlx::query("UPDATE import_runs SET status = 'committed', committed_at = ? WHERE id = ?")
            .bind(&now)
            .bind(run_id.trim())
            .execute(&mut *connection)
            .await?;
        Ok(MetaTraderHtmlCommitResult { run_id: run_id.trim().to_owned(), inserted, duplicate: duplicates })
    }
    .await;
    match result {
        Ok(result) => {
            sqlx::query("COMMIT").execute(&mut *connection).await?;
            Ok(result)
        }
        Err(error) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            Err(error)
        }
    }
}

#[derive(Clone, Copy)]
struct HeaderMap {
    opened: usize,
    position: usize,
    symbol: usize,
    kind: usize,
    volume: usize,
    entry: usize,
    stop: usize,
    target: usize,
    closed: usize,
    exit: usize,
    commission: usize,
    swap: usize,
    profit: usize,
}

impl HeaderMap {
    fn from_cells(cells: &[String]) -> Option<Self> {
        let values = cells
            .iter()
            .map(|cell| normalized(cell))
            .collect::<Vec<_>>();
        let opened = find_alias(&values, 0, &["time", "zeit"])?;
        let position = find_alias(&values, opened + 1, &["position"])?;
        let symbol = find_alias(&values, position + 1, &["symbol"])?;
        let kind = find_alias(&values, symbol + 1, &["type", "typ"])?;
        let volume = find_alias(&values, kind + 1, &["volume", "volumen"])?;
        let entry = find_alias(&values, volume + 1, &["price", "preis"])?;
        let stop = find_alias(&values, entry + 1, &["s/l", "sl"])?;
        let target = find_alias(&values, stop + 1, &["t/p", "tp"])?;
        let closed = find_alias(&values, target + 1, &["time", "zeit"])?;
        let exit = find_alias(&values, closed + 1, &["price", "preis"])?;
        let commission = find_alias(&values, exit + 1, &["commission", "kommission"])?;
        let swap = find_alias(&values, commission + 1, &["swap"])?;
        let profit = find_alias(&values, swap + 1, &["profit", "gewinn"])?;
        Some(Self {
            opened,
            position,
            symbol,
            kind,
            volume,
            entry,
            stop,
            target,
            closed,
            exit,
            commission,
            swap,
            profit,
        })
    }

    fn max_index(self) -> usize {
        self.profit
    }

    fn for_data_row(self, cells: &[String]) -> Self {
        if cells.len() > self.max_index() + 1
            && cells
                .get(self.volume)
                .is_some_and(|value| value.trim().is_empty())
        {
            Self {
                volume: self.volume + 1,
                entry: self.entry + 1,
                stop: self.stop + 1,
                target: self.target + 1,
                closed: self.closed + 1,
                exit: self.exit + 1,
                commission: self.commission + 1,
                swap: self.swap + 1,
                profit: self.profit + 1,
                ..self
            }
        } else {
            self
        }
    }
}

fn parse_position_row(
    row_number: usize,
    cells: &[String],
    map: &HeaderMap,
    timezone: Tz,
) -> ParsedPositionRow {
    let source_position_id = cells[map.position].trim().to_owned();
    let mut errors = Vec::new();
    if source_position_id.is_empty() {
        errors.push("MISSING_POSITION_ID".to_owned());
    }
    let symbol = validate_symbol(&cells[map.symbol], &mut errors);
    let direction = match normalized(&cells[map.kind]).as_str() {
        "buy" | "kauf" => Some("long".to_owned()),
        "sell" | "verkauf" => Some("short".to_owned()),
        _ => {
            errors.push("UNSUPPORTED_POSITION_TYPE".to_owned());
            None
        }
    };
    let opened_at = parse_local_time(&cells[map.opened], timezone, &mut errors);
    let closed_at = parse_local_time(&cells[map.closed], timezone, &mut errors);
    if opened_at
        .as_ref()
        .zip(closed_at.as_ref())
        .is_some_and(|(opened, closed)| closed < opened)
    {
        errors.push("CLOSE_BEFORE_OPEN".to_owned());
    }
    let quantity = parse_positive_quantity(&cells[map.volume], &mut errors);
    let entry = parse_positive_decimal(&cells[map.entry], "INVALID_ENTRY_PRICE", &mut errors);
    let stop = parse_optional_positive_decimal(&cells[map.stop], "INVALID_STOP_LOSS", &mut errors);
    let target =
        parse_optional_positive_decimal(&cells[map.target], "INVALID_TAKE_PROFIT", &mut errors);
    let exit = parse_positive_decimal(&cells[map.exit], "INVALID_EXIT_PRICE", &mut errors);
    let commission = parse_money(&cells[map.commission], "INVALID_COMMISSION", &mut errors);
    let swap = parse_money(&cells[map.swap], "INVALID_SWAP", &mut errors);
    let report_profit = parse_money(&cells[map.profit], "INVALID_PROFIT", &mut errors);
    let money = match (report_profit, commission, swap) {
        (Some(report_profit), Some(commission), Some(swap)) => {
            canonicalize_mt_money(report_profit, commission, swap, &mut errors)
        }
        _ => None,
    };
    let position = if errors.is_empty() {
        let (gross_pnl_minor, commission_minor, swap_minor, net_pnl_minor) = money.unwrap();
        Some(ParsedClosedPosition {
            source_position_id: source_position_id.clone(),
            symbol: symbol.unwrap(),
            direction: direction.unwrap(),
            quantity: quantity.unwrap().to_string(),
            entry_price: entry.unwrap().to_string(),
            stop_loss: stop.flatten().map(|value| value.to_string()),
            take_profit: target.flatten().map(|value| value.to_string()),
            exit_price: exit.unwrap().to_string(),
            opened_at: opened_at.unwrap(),
            closed_at: closed_at.unwrap(),
            display_timezone: timezone.name().to_owned(),
            gross_pnl_minor,
            fees_minor: 0,
            commission_minor,
            swap_minor,
            net_pnl_minor,
        })
    } else {
        None
    };
    ParsedPositionRow {
        row_number,
        source_position_id: (!source_position_id.is_empty()).then_some(source_position_id),
        position,
        errors,
    }
}

fn parse_local_time(value: &str, timezone: Tz, errors: &mut Vec<String>) -> Option<String> {
    if value.trim().is_empty() {
        errors.push("MISSING_CLOSE_OR_OPEN_TIME".to_owned());
        return None;
    }
    let local = match NaiveDateTime::parse_from_str(value.trim(), "%Y.%m.%d %H:%M:%S") {
        Ok(value) => value,
        Err(_) => {
            errors.push("INVALID_LOCAL_TIME".to_owned());
            return None;
        }
    };
    match timezone.from_local_datetime(&local) {
        LocalResult::Single(value) => Some(value.with_timezone(&Utc).to_rfc3339()),
        LocalResult::Ambiguous(_, _) => {
            errors.push("AMBIGUOUS_LOCAL_TIME".to_owned());
            None
        }
        LocalResult::None => {
            errors.push("NONEXISTENT_LOCAL_TIME".to_owned());
            None
        }
    }
}

fn parse_decimal(value: &str, code: &str, errors: &mut Vec<String>) -> Option<Decimal> {
    match Decimal::from_str(&value.replace([' ', '\u{a0}'], "")) {
        Ok(value) => Some(value),
        Err(_) => {
            errors.push(code.to_owned());
            None
        }
    }
}

pub(super) fn parse_positive_decimal(
    value: &str,
    code: &str,
    errors: &mut Vec<String>,
) -> Option<Decimal> {
    parse_decimal(value, code, errors).and_then(|value| {
        if value > Decimal::ZERO {
            Some(value)
        } else {
            errors.push(code.to_owned());
            None
        }
    })
}

fn parse_quantity(value: &str, errors: &mut Vec<String>) -> Option<Decimal> {
    let normalized = value.replace([' ', '\u{a0}'], "");
    let (number, multiplier) = match normalized.strip_suffix(['K', 'k']) {
        Some(number) => (number, Decimal::from(1_000)),
        None => (normalized.as_str(), Decimal::ONE),
    };
    match Decimal::from_str(number)
        .ok()
        .and_then(|value| value.checked_mul(multiplier))
    {
        Some(value) => Some(value),
        None => {
            errors.push("INVALID_VOLUME".to_owned());
            None
        }
    }
}

fn parse_positive_quantity(value: &str, errors: &mut Vec<String>) -> Option<Decimal> {
    parse_quantity(value, errors).and_then(|value| {
        if value > Decimal::ZERO {
            Some(value)
        } else {
            errors.push("INVALID_VOLUME".to_owned());
            None
        }
    })
}

fn parse_optional_decimal(
    value: &str,
    code: &str,
    errors: &mut Vec<String>,
) -> Option<Option<Decimal>> {
    let normalized = value.replace([' ', '\u{a0}'], "");
    if normalized.is_empty() || normalized.chars().all(|character| character == '-') {
        return Some(None);
    }
    parse_decimal(&normalized, code, errors).map(Some)
}

fn parse_optional_positive_decimal(
    value: &str,
    code: &str,
    errors: &mut Vec<String>,
) -> Option<Option<Decimal>> {
    parse_optional_decimal(value, code, errors).and_then(|value| match value {
        Some(value) if value <= Decimal::ZERO => {
            errors.push(code.to_owned());
            None
        }
        value => Some(value),
    })
}

pub(super) fn parse_money(value: &str, code: &str, errors: &mut Vec<String>) -> Option<i64> {
    parse_decimal(value, code, errors).and_then(|value| {
        let minor = value
            .checked_mul(Decimal::from(100))
            .and_then(|value| value.round().to_i64());
        if minor.is_none() {
            errors.push(code.to_owned());
        }
        minor
    })
}

fn canonicalize_mt_money(
    report_profit: i64,
    report_commission: i64,
    report_swap: i64,
    errors: &mut Vec<String>,
) -> Option<(i64, i64, i64, i64)> {
    let result = (|| {
        let commission_cost = if report_commission < 0 {
            report_commission.checked_neg()?
        } else {
            0
        };
        let swap_cost = if report_swap < 0 {
            report_swap.checked_neg()?
        } else {
            0
        };
        let gross = report_profit
            .checked_add(report_commission.max(0))?
            .checked_add(report_swap.max(0))?;
        let total_costs = commission_cost.checked_add(swap_cost)?;
        let net = gross.checked_sub(total_costs)?;
        let report_net = report_profit
            .checked_add(report_commission)?
            .checked_add(report_swap)?;
        (net == report_net).then_some((gross, commission_cost, swap_cost, net))
    })();
    if result.is_none() {
        errors.push("MONEY_OVERFLOW".to_owned());
    }
    result
}

pub(super) fn decode_report(bytes: &[u8]) -> Result<String, MetaTraderHtmlError> {
    if bytes.len() > MAX_FILE_BYTES {
        return Err(format_error("FILE_TOO_LARGE"));
    }
    if bytes.starts_with(&[0xff, 0xfe]) {
        let body = &bytes[2..];
        if !body.len().is_multiple_of(2) {
            return Err(format_error("INVALID_ENCODING"));
        }
        let units = body
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        String::from_utf16(&units).map_err(|_| format_error("INVALID_ENCODING"))
    } else if bytes.starts_with(&[0xfe, 0xff]) || bytes.contains(&0) {
        Err(format_error("INVALID_ENCODING"))
    } else {
        let body = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes);
        std::str::from_utf8(body)
            .map(str::to_owned)
            .map_err(|_| format_error("INVALID_ENCODING"))
    }
}

pub(super) fn sanitize_active_content(html: &str) -> Result<String, MetaTraderHtmlError> {
    let bytes = html.as_bytes();
    let mut output = Vec::with_capacity(bytes.len().min(MAX_FILE_BYTES));
    let mut index = 0usize;
    let mut blocked_tag: Option<&'static str> = None;
    while index < bytes.len() {
        if bytes[index] != b'<' {
            if blocked_tag.is_none() {
                output.push(bytes[index]);
                if output.len() > MAX_FILE_BYTES {
                    return Err(format_error("PARSER_LIMIT_EXCEEDED"));
                }
            }
            index += 1;
            continue;
        }
        if blocked_tag.is_none() && bytes[index..].starts_with(b"<!--") {
            let comment_start = index + 4;
            let comment_limit = bytes.len().min(comment_start.saturating_add(MAX_TAG_BYTES));
            let Some(relative_end) = bytes[comment_start..comment_limit]
                .windows(3)
                .position(|window| window == b"-->")
            else {
                break;
            };
            index = comment_start + relative_end + 3;
            continue;
        }
        let Some(end) = find_tag_end(bytes, index + 1) else {
            break;
        };
        let raw_tag = &html[index + 1..end];
        let descriptor = describe_tag(raw_tag);
        if let Some(active) = blocked_tag {
            if descriptor.is_some_and(|tag| {
                tag.closing
                    && tag.name.eq_ignore_ascii_case(active)
                    && tag.remainder.trim().is_empty()
            }) {
                blocked_tag = None;
            }
            index = end + 1;
            continue;
        }
        if let Some(tag) = descriptor
            && let Some(active) = active_tag_name(tag.name)
        {
            if !tag.closing {
                blocked_tag = Some(active);
            }
            index = end + 1;
            continue;
        }
        output.extend_from_slice(&bytes[index..=end]);
        if output.len() > MAX_FILE_BYTES {
            return Err(format_error("PARSER_LIMIT_EXCEEDED"));
        }
        index = end + 1;
    }
    String::from_utf8(output).map_err(|_| format_error("INVALID_ENCODING"))
}

fn find_tag_end(bytes: &[u8], start: usize) -> Option<usize> {
    let limit = bytes.len().min(start.saturating_add(MAX_TAG_BYTES));
    let mut quote = None;
    for (offset, byte) in bytes[start..limit].iter().enumerate() {
        match (quote, *byte) {
            (None, b'\'' | b'"') => quote = Some(*byte),
            (Some(expected), current) if expected == current => quote = None,
            (None, b'>') => return Some(start + offset),
            _ => {}
        }
    }
    None
}

#[derive(Clone, Copy)]
struct TagDescriptor<'a> {
    closing: bool,
    name: &'a str,
    remainder: &'a str,
}

fn describe_tag(raw_tag: &str) -> Option<TagDescriptor<'_>> {
    let mut content = raw_tag.trim_start();
    let closing = content.starts_with('/');
    if closing {
        content = content[1..].trim_start();
    }
    let name_end = content
        .find(|character: char| {
            !character.is_ascii_alphanumeric() && character != ':' && character != '-'
        })
        .unwrap_or(content.len());
    if name_end == 0 {
        return None;
    }
    Some(TagDescriptor {
        closing,
        name: &content[..name_end],
        remainder: &content[name_end..],
    })
}

fn active_tag_name(name: &str) -> Option<&'static str> {
    if name.eq_ignore_ascii_case("script") {
        Some("script")
    } else if name.eq_ignore_ascii_case("style") {
        Some("style")
    } else if name.eq_ignore_ascii_case("template") {
        Some("template")
    } else {
        None
    }
}

fn has_metatrader_signature(html: &str) -> Result<bool, MetaTraderHtmlError> {
    let meta_re = regex(r"(?is)<meta\b([^>]*)>")?;
    let generator_re = regex(r#"(?i)\bname\s*=\s*(?:"generator"|'generator'|generator(?:\s|$))"#)?;
    let client_terminal_re =
        regex(r#"(?i)\bcontent\s*=\s*(?:"client\s+terminal"|'client\s+terminal')"#)?;
    Ok(meta_re.captures_iter(html).any(|capture| {
        generator_re.is_match(&capture[1]) && client_terminal_re.is_match(&capture[1])
    }))
}

fn parse_identity(text: &str) -> Result<ParsedReportIdentity, MetaTraderHtmlError> {
    let account_re = regex(r"(?i)(?:account|konto|login)\s*:?\s*([0-9]{3,})")?;
    let currency_re = regex(r"(?i)(?:currency|währung|waehrung)\s*:?\s*([A-Z]{3})")?;
    let account_currency_re =
        regex(r"(?i:account|konto|login)\s*:?\s*[0-9]{3,}[^A-Z]{0,40}([A-Z]{3})\b")?;
    let report_account = account_re
        .captures(text)
        .map(|capture| capture[1].to_owned())
        .ok_or_else(|| format_error("REPORT_IDENTITY_MISSING"))?;
    let base_currency = currency_re
        .captures(text)
        .or_else(|| account_currency_re.captures(text))
        .map(|capture| capture[1].to_ascii_uppercase())
        .ok_or_else(|| format_error("REPORT_CURRENCY_MISSING"))?;
    Ok(ParsedReportIdentity {
        platform: "mt5".to_owned(),
        report_account,
        base_currency,
    })
}

pub(super) fn html_text(html: &str) -> Result<String, MetaTraderHtmlError> {
    let tags = regex(r"(?is)<[^>]*>")?;
    let without_tags = tags.replace_all(html, " ");
    let decoded = without_tags
        .replace("&nbsp;", " ")
        .replace("&#160;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"");
    Ok(decoded.split_whitespace().collect::<Vec<_>>().join(" "))
}

fn regex(pattern: &str) -> Result<Regex, MetaTraderHtmlError> {
    Regex::new(pattern).map_err(|_| format_error("PARSER_INTERNAL_ERROR"))
}

fn normalized(value: &str) -> String {
    value.trim().to_lowercase().replace(' ', "")
}

pub(super) fn validate_symbol(value: &str, errors: &mut Vec<String>) -> Option<String> {
    let symbol = value.trim();
    let valid = !symbol.is_empty()
        && symbol.len() <= 32
        && symbol.is_ascii()
        && symbol
            .chars()
            .any(|character| character.is_ascii_alphanumeric())
        && symbol.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-' | '#' | '+')
        });
    if valid {
        Some(symbol.to_owned())
    } else {
        errors.push("INVALID_SYMBOL".to_owned());
        None
    }
}

pub(super) fn classify_asset_class(symbol: &str) -> &'static str {
    let upper = symbol.trim().to_ascii_uppercase();
    let core = upper
        .split(['.', '_', '#', '-', '+'])
        .next()
        .unwrap_or(upper.as_str());
    if ["XAU", "XAG", "XPT", "XPD"]
        .iter()
        .any(|prefix| core.starts_with(prefix))
    {
        return "metal";
    }
    if ["BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "LTC", "BCH"]
        .iter()
        .any(|prefix| core.starts_with(prefix))
    {
        return "crypto";
    }
    if core.is_ascii() && core.len() == 6 {
        let currencies = [
            "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK", "PLN",
            "CZK", "HUF", "TRY", "ZAR", "MXN", "CNH", "HKD", "SGD",
        ];
        if currencies.contains(&&core[..3]) && currencies.contains(&&core[3..]) {
            return "forex";
        }
    }
    if [
        "US30", "US100", "US500", "NAS100", "USTEC", "SPX500", "SP500", "GER40", "DE40", "UK100",
        "JP225", "HK50", "AUS200", "STOXX50", "EU50", "FRA40", "DAX", "NDX", "DJI", "SPX",
    ]
    .iter()
    .any(|index| core.starts_with(index))
    {
        return "index";
    }
    if is_futures_symbol(core) {
        return "futures";
    }
    "other"
}

fn is_futures_symbol(symbol: &str) -> bool {
    const ROOTS: &[&str] = &[
        "6E", "M6E", "6B", "M6B", "6J", "M6J", "6A", "M6A", "6C", "M6C", "6S", "6N", "DX", "GC",
        "MGC", "SI", "SIL", "HG", "PL", "PA", "MBT", "MET", "ES", "MES", "NQ", "MNQ", "YM", "MYM",
        "RTY", "M2K", "CL", "MCL", "NG", "ZB", "ZN",
    ];
    if ROOTS.contains(&symbol) || symbol.ends_with("FUT") {
        return true;
    }
    let month_codes = "FGHJKMNQUVXZ";
    let bytes = symbol.as_bytes();
    let Some(month_index) = bytes
        .iter()
        .rposition(|byte| month_codes.as_bytes().contains(byte))
    else {
        return false;
    };
    let root = &symbol[..month_index];
    let year = &symbol[month_index + 1..];
    !root.is_empty()
        && root.len() <= 4
        && root
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
        && (1..=4).contains(&year.len())
        && year.chars().all(|character| character.is_ascii_digit())
}

fn find_alias(values: &[String], start: usize, aliases: &[&str]) -> Option<usize> {
    values
        .iter()
        .enumerate()
        .skip(start)
        .find_map(|(index, value)| aliases.contains(&value.as_str()).then_some(index))
}

fn is_closed_positions_section(cells: &[String]) -> bool {
    cells.len() == 1 && matches!(normalized(&cells[0]).as_str(), "positions" | "positionen")
}

fn count_ignored_sections(rows: &[Vec<String>], closed_header: usize) -> IgnoredSectionCounts {
    let mut counts = IgnoredSectionCounts::default();
    let mut section = "";
    let mut section_header_seen = false;
    for (index, cells) in rows.iter().enumerate() {
        if index == closed_header {
            section = "closed";
            section_header_seen = true;
            continue;
        }
        if cells.len() == 1 {
            let value = cells[0].to_lowercase();
            if value.contains("offene position") || value.contains("open position") {
                section = "open";
                section_header_seen = false;
            } else if value.contains("order") || value.contains("auftr") {
                section = "orders";
                section_header_seen = false;
            } else if value.contains("deal")
                || value.contains("trade")
                || value.contains("geschäft")
            {
                section = "deals";
                section_header_seen = false;
            } else if index > closed_header {
                section = "";
                section_header_seen = false;
            }
            continue;
        }
        if section != "closed" && !section_header_seen {
            section_header_seen = true;
            continue;
        }
        if section_header_seen && cells.len() > 2 && looks_like_report_time(&cells[0]) {
            match section {
                "open" => counts.open_positions += 1,
                "orders" => counts.orders += 1,
                "deals" => counts.deals += 1,
                _ => {}
            }
        }
    }
    counts
}

fn looks_like_report_time(value: &str) -> bool {
    NaiveDateTime::parse_from_str(value.trim(), "%Y.%m.%d %H:%M:%S").is_ok()
}

fn format_error(code: &'static str) -> MetaTraderHtmlError {
    MetaTraderHtmlError::new(
        code,
        "Der MetaTrader-Bericht besitzt kein unterstütztes klassisches Format.",
    )
}

pub(super) fn command_error(code: impl Into<String>, message: impl Into<String>) -> CommandError {
    CommandError {
        code: code.into(),
        message: message.into(),
        details: None,
    }
}

fn json_error(_: serde_json::Error) -> CommandError {
    command_error(
        "IMPORT_STAGING_INVALID",
        "Die normalisierten Importdaten sind ungültig.",
    )
}

fn validate_report_path(path: &Path) -> CommandResult<PathBuf> {
    if path.as_os_str().is_empty() {
        return Err(command_error(
            "IMPORT_PATH_REQUIRED",
            "Eine HTML-Datei ist erforderlich.",
        ));
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "html" | "htm") {
        return Err(command_error(
            "INVALID_FILE_EXTENSION",
            "Es werden nur .html- und .htm-Dateien unterstützt.",
        ));
    }
    let canonical = path.canonicalize().map_err(|_| {
        command_error(
            "IMPORT_FILE_NOT_FOUND",
            "Die ausgewählte Datei wurde nicht gefunden.",
        )
    })?;
    let metadata = canonical.metadata().map_err(|_| {
        command_error(
            "IMPORT_FILE_NOT_FOUND",
            "Die ausgewählte Datei wurde nicht gefunden.",
        )
    })?;
    if !metadata.is_file() {
        return Err(command_error(
            "IMPORT_NOT_A_FILE",
            "Der ausgewählte Pfad ist keine Datei.",
        ));
    }
    if metadata.len() > MAX_FILE_BYTES as u64 {
        return Err(command_error(
            "FILE_TOO_LARGE",
            "Die HTML-Datei ist größer als 16 MiB.",
        ));
    }
    Ok(canonical)
}

fn read_bounded_file(path: &Path) -> CommandResult<Vec<u8>> {
    let file = File::open(path).map_err(|_| {
        command_error(
            "IMPORT_FILE_NOT_FOUND",
            "Die ausgewählte Datei wurde nicht gefunden.",
        )
    })?;
    let mut bytes = Vec::new();
    file.take((MAX_FILE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| {
            command_error(
                "IMPORT_FILE_READ_FAILED",
                "Die HTML-Datei konnte nicht gelesen werden.",
            )
        })?;
    if bytes.len() > MAX_FILE_BYTES {
        return Err(command_error(
            "FILE_TOO_LARGE",
            "Die HTML-Datei ist größer als 16 MiB.",
        ));
    }
    Ok(bytes)
}

pub(super) async fn active_account(db: &SqlitePool, account_id: &str) -> CommandResult<String> {
    if account_id.is_empty() {
        return Err(command_error(
            "ACCOUNT_REQUIRED",
            "Ein aktives Konto ist erforderlich.",
        ));
    }
    sqlx::query_scalar("SELECT base_currency FROM accounts WHERE id = ? AND is_archived = 0")
        .bind(account_id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| {
            command_error(
                "ACCOUNT_NOT_FOUND",
                "Das ausgewählte Konto ist nicht verfügbar.",
            )
        })
}

pub(super) async fn active_account_on_connection(
    connection: &mut sqlx::pool::PoolConnection<sqlx::Sqlite>,
    account_id: &str,
) -> CommandResult<String> {
    if account_id.is_empty() {
        return Err(command_error(
            "ACCOUNT_REQUIRED",
            "Ein aktives Konto ist erforderlich.",
        ));
    }
    sqlx::query_scalar("SELECT base_currency FROM accounts WHERE id = ? AND is_archived = 0")
        .bind(account_id)
        .fetch_optional(&mut **connection)
        .await?
        .ok_or_else(|| {
            command_error(
                "ACCOUNT_NOT_FOUND",
                "Das ausgewählte Konto ist nicht verfügbar.",
            )
        })
}

async fn validate_existing_source(
    db: &SqlitePool,
    account_id: &str,
    source: &StagedSource,
) -> CommandResult<Option<(String, String)>> {
    if let Some(row) = sqlx::query("SELECT id, report_account_sha256, base_currency, source_timezone FROM metatrader_import_sources WHERE account_id = ? AND platform = ?")
        .bind(account_id).bind(&source.platform).fetch_optional(db).await? {
        let existing_hash: String = row.try_get("report_account_sha256")?;
        let existing_currency: String = row.try_get("base_currency")?;
        let existing_timezone: String = row.try_get("source_timezone")?;
        if existing_hash != source.report_account_sha256 {
            return Err(command_error("IMPORT_SOURCE_ACCOUNT_CONFLICT", "Dieses Journal-Konto ist bereits mit einem anderen MetaTrader-Berichtskonto verbunden."));
        }
        if existing_timezone != source.source_timezone {
            return Err(command_error("IMPORT_SOURCE_TIMEZONE_MISMATCH", "Für diese Importquelle muss die bereits gebundene Broker-Zeitzone verwendet werden."));
        }
        if !existing_currency.eq_ignore_ascii_case(&source.base_currency) {
            return Err(command_error("IMPORT_CURRENCY_MISMATCH", "Die gebundene Importquelle besitzt eine andere Währung."));
        }
        return Ok(Some((row.try_get("id")?, existing_hash)));
    }
    let bound_elsewhere: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM metatrader_import_sources WHERE platform = ? AND report_account_sha256 = ? AND account_id <> ?)")
        .bind(&source.platform).bind(&source.report_account_sha256).bind(account_id).fetch_one(db).await?;
    if bound_elsewhere {
        return Err(command_error(
            "IMPORT_SOURCE_ALREADY_BOUND",
            "Dieses MetaTrader-Berichtskonto ist bereits einem anderen Journal-Konto zugeordnet.",
        ));
    }
    Ok(None)
}

async fn bind_source_on_commit(
    connection: &mut sqlx::pool::PoolConnection<sqlx::Sqlite>,
    account_id: &str,
    source: &StagedSource,
) -> CommandResult<String> {
    if let Some(row) = sqlx::query("SELECT id, report_account_sha256, base_currency, source_timezone FROM metatrader_import_sources WHERE account_id = ? AND platform = ?")
        .bind(account_id).bind(&source.platform).fetch_optional(&mut **connection).await? {
        let hash: String = row.try_get("report_account_sha256")?;
        let currency: String = row.try_get("base_currency")?;
        let timezone: String = row.try_get("source_timezone")?;
        if hash != source.report_account_sha256 || currency != source.base_currency || timezone != source.source_timezone {
            return Err(command_error("IMPORT_SOURCE_CHANGED", "Die Importquelle hat sich seit der Vorschau geändert."));
        }
        return Ok(row.try_get("id")?);
    }
    let bound_elsewhere: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM metatrader_import_sources WHERE platform = ? AND report_account_sha256 = ? AND account_id <> ?)",
    )
    .bind(&source.platform)
    .bind(&source.report_account_sha256)
    .bind(account_id)
    .fetch_one(&mut **connection)
    .await?;
    if bound_elsewhere {
        return Err(command_error(
            "IMPORT_SOURCE_ALREADY_BOUND",
            "Dieses MetaTrader-Berichtskonto ist bereits einem anderen Journal-Konto zugeordnet.",
        ));
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO metatrader_import_sources (id, account_id, platform, report_account_sha256, report_account_masked, base_currency, source_timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id).bind(account_id).bind(&source.platform).bind(&source.report_account_sha256).bind(&source.report_account_masked).bind(&source.base_currency).bind(&source.source_timezone).bind(&now).bind(&now).execute(&mut **connection).await?;
    Ok(id)
}

async fn existing_link_hash(
    db: &SqlitePool,
    source_id: &str,
    position_id: &str,
) -> CommandResult<Option<String>> {
    Ok(sqlx::query_scalar("SELECT payload_sha256 FROM metatrader_trade_links WHERE source_id = ? AND source_position_id = ?")
        .bind(source_id).bind(position_id).fetch_optional(db).await?)
}

async fn existing_link_hash_on_connection(
    connection: &mut sqlx::pool::PoolConnection<sqlx::Sqlite>,
    source_id: &str,
    position_id: &str,
) -> CommandResult<Option<String>> {
    Ok(sqlx::query_scalar("SELECT payload_sha256 FROM metatrader_trade_links WHERE source_id = ? AND source_position_id = ?")
        .bind(source_id).bind(position_id).fetch_optional(&mut **connection).await?)
}

fn payload_hash(position: &ParsedClosedPosition) -> CommandResult<String> {
    Ok(sha256_hex(
        serde_json::to_vec(position).map_err(json_error)?,
    ))
}

pub(super) fn sha256_hex(bytes: impl AsRef<[u8]>) -> String {
    Sha256::digest(bytes.as_ref())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(super) fn mask_account(account: &str) -> String {
    let suffix = account
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<String>();
    format!("••••{suffix}")
}
