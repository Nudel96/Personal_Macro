use super::*;
use rust_decimal::Decimal;
use std::str::FromStr;

pub(super) fn coverage(chunks: &[TextChunk]) -> (usize, usize) {
    (
        chunks.len(),
        chunks.iter().map(|c| c.text.chars().count()).sum(),
    )
}
// Share the input limit across the whole document, including its final pages.
// This is a sampled excerpt, never a claim of complete report coverage.
pub(super) fn bounded_chunks(chunks: &[TextChunk]) -> Vec<TextChunk> {
    let comparison = chunks
        .iter()
        .any(|c| c.source_ref.starts_with("Aktuell · "))
        && chunks.iter().any(|c| c.source_ref.starts_with("Vorher · "));
    let mut result = Vec::new();
    for group in 0..if comparison { 2 } else { 1 } {
        let candidates = chunks
            .iter()
            .filter(|c| usize::from(comparison && c.source_ref.starts_with("Vorher · ")) == group)
            .collect::<Vec<_>>();
        let count = candidates.len().min(100);
        let mut budget = if comparison {
            MAX_MODEL_CHARS / 2
        } else {
            MAX_MODEL_CHARS
        };
        for n in 0..count {
            let index = if count <= 1 {
                0
            } else {
                n * (candidates.len() - 1) / (count - 1)
            };
            let chunk = candidates[index];
            let share = budget / (count - n);
            let overhead = chunk.source_ref.chars().count() + 5;
            if share <= overhead {
                continue;
            }
            let text = truncate_chars(&chunk.text, share - overhead);
            if text.trim().is_empty() {
                continue;
            }
            budget -= overhead + text.chars().count();
            result.push(TextChunk {
                source_ref: chunk.source_ref.clone(),
                text,
            });
        }
    }
    result
}

fn invalid() -> AppError {
    AppError::DataTransfer("Das Briefing hat die Quellen-, Zahlen- oder Umfangsprüfung nicht bestanden. Der Originalbericht bleibt erhalten.".into())
}

fn numbers(text: &str) -> HashSet<String> {
    numeric_values(text, false)
}
fn source_numbers(text: &str) -> HashSet<String> {
    numeric_values(text, true)
}
fn numeric_values(text: &str, english: bool) -> HashSet<String> {
    let text = text.replace(['\u{2010}', '\u{2011}'], "-");
    let grouping = Regex::new(if english {
        r"\b[1-9]\d{0,2}(?:,\d{3})+\b"
    } else {
        r"\b[1-9]\d{0,2}(?:\.\d{3})+\b"
    })
    .unwrap();
    let text = grouping.replace_all(&text, |c: &regex::Captures| {
        c[0].replace(if english { ',' } else { '.' }, "")
    });
    // English monetary decisions commonly use mixed fractions (4-1/4 percent).
    let fractions = Regex::new(r"(\d+)-([13])/([24])").unwrap();
    let normalized = fractions.replace_all(&text, |caps: &regex::Captures| {
        let whole = Decimal::from_str(&caps[1]).unwrap_or_default();
        let num = Decimal::from_str(&caps[2]).unwrap_or_default();
        let den = Decimal::from_str(&caps[3]).unwrap_or(Decimal::ONE);
        (whole + num / den).normalize().to_string()
    });
    let simple = Regex::new(r"(?P<n>[13])/(?P<d>[24])").unwrap();
    let normalized = simple.replace_all(&normalized, |caps: &regex::Captures| {
        (Decimal::from_str(&caps["n"]).unwrap() / Decimal::from_str(&caps["d"]).unwrap())
            .normalize()
            .to_string()
    });
    let regex = Regex::new(r"[-−]?\d+(?:[.,]\d+)?").unwrap();
    regex
        .find_iter(&normalized)
        .filter_map(|m| {
            let number = if m.as_str().starts_with('-')
                && normalized[..m.start()]
                    .chars()
                    .next_back()
                    .is_some_and(|c| c.is_ascii_digit())
            {
                &m.as_str()[1..]
            } else {
                m.as_str()
            };
            Decimal::from_str(&number.replace('−', "-").replace(',', ".")).ok()
        })
        .map(|n| n.normalize().to_string())
        .collect()
}
fn normalized(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}
fn without_references(text: &str, refs: &HashSet<&str>) -> String {
    if refs.is_empty() {
        return text.to_owned();
    }
    // A verified "Absatz 12" or "Seite 3" is a citation, not a policy value.
    // Match whole labels only; arbitrary numbers remain subject to verification.
    let labels = refs
        .iter()
        .map(|reference| regex::escape(reference))
        .collect::<Vec<_>>()
        .join("|");
    Regex::new(&format!(r"\b(?:{labels})\b"))
        .unwrap()
        .replace_all(text, "")
        .into_owned()
}
fn critical_meaning(section: &str, text: &str, evidence: &str) -> bool {
    let text = text.to_lowercase();
    let source = evidence.to_lowercase();
    let negative = Regex::new(r"\b(nicht|kein[e]?|unverändert|offen|unsicher)\b")
        .unwrap()
        .is_match(&text);
    if (source.contains("not pre-committing") || source.contains("not precommitting"))
        && !negative
        && ["festgelegt", "garantiert", "sicherer zinspfad"]
            .iter()
            .any(|s| text.contains(s))
    {
        return false;
    }
    let uncertain = Regex::new(r"\b(may|could|might)\b")
        .unwrap()
        .is_match(&source);
    let qualified = Regex::new(
        r"\b(könnte[n]?|möglicherweise|dürfte[n]?|falls|wenn|erwartet|prognostiziert|unsicher)\b",
    )
    .unwrap()
    .is_match(&text);
    if uncertain && !qualified && (text.contains("garantiert") || text.contains("wird sicher")) {
        return false;
    }
    if section == "decision" {
        let decrease = Regex::new(r"\b(senkt|senken|gesenkt|senkung|reduziert)\b")
            .unwrap()
            .is_match(&text);
        let increase = Regex::new(r"\b(erhöht|erhöhen|anhebt|angehoben)\b")
            .unwrap()
            .is_match(&text);
        let unchanged = source.contains("remain unchanged")
            || source.contains("remains at")
            || source.contains("maintain");
        let denied_cut = source.contains("not lower")
            || source.contains("not cut")
            || source.contains("not reduce");
        if ((unchanged && (decrease || increase)) || (denied_cut && decrease)) && !negative {
            return false;
        }
    }
    true
}

fn bank_mentions(text: &str) -> HashSet<&'static str> {
    [
        ("FED", r"(?i)\b(?:Fed|Federal Reserve|FOMC|US-Notenbank|US-Zentralbank)\b"),
        ("ECB", r"(?i)\b(?:ECB|EZB|EZB-Rat|Europäische Zentralbank|European Central Bank)\b"),
        ("BOE", r"(?i)\b(?:BoE|Bank of England|Bank von England)\b"),
        ("BOJ", r"(?i)\b(?:BoJ|Bank of Japan|Bank von Japan|japanische Zentralbank)\b"),
        ("RBA", r"(?i)\b(?:RBA|Reserve Bank of Australia|australische Zentralbank)\b"),
        ("RBNZ", r"(?i)\b(?:RBNZ|Reserve Bank of New Zealand|neuseeländische Zentralbank)\b"),
        ("BOC", r"(?i)\b(?:BoC|Bank of Canada|Bank von Kanada|kanadische Zentralbank)\b"),
        ("SNB", r"(?i)\b(?:SNB|Schweizerische Nationalbank|Swiss National Bank)\b"),
        ("PBOC", r"(?i)\b(?:PBoC|People.s Bank of China|Chinesische Volksbank|chinesische Zentralbank)\b"),
    ]
    .into_iter()
    .filter_map(|(bank, pattern)| Regex::new(pattern).unwrap().is_match(text).then_some(bank))
    .collect()
}

// A cited figure does not justify attributing the decision to another bank.
// Other banks may still appear when explicitly named in the quoted source.
pub(super) fn validate_bank(
    summary: &CentralBankReportSummary,
    source: &ReportSource,
) -> Result<(), AppError> {
    let supports = |text: &str, quotes: &str| {
        bank_mentions(text)
            .into_iter()
            .all(|bank| bank == source.bank_code || bank_mentions(quotes).contains(bank))
    };
    let mut all_quotes = Vec::new();
    for section in &summary.sections {
        let mut section_quotes = Vec::new();
        for point in &section.points {
            let quotes = point
                .evidence
                .iter()
                .map(|e| e.quote.as_str())
                .collect::<Vec<_>>();
            if !supports(&point.text, &quotes.join(" ")) {
                return Err(invalid());
            }
            section_quotes.extend(quotes);
        }
        if !supports(&section.title, &section_quotes.join(" ")) {
            return Err(invalid());
        }
        all_quotes.extend(section_quotes);
    }
    if !supports(&summary.overview, &all_quotes.join(" ")) {
        return Err(invalid());
    }
    Ok(())
}

pub(super) fn validate(
    summary: &CentralBankReportSummary,
    chunks: &[TextChunk],
) -> Result<(), AppError> {
    let total = summary
        .sections
        .iter()
        .map(|s| s.points.len())
        .sum::<usize>();
    if total > 12
        || summary.sections.len() > 9
        || summary.overview.chars().count() > 700
        || !matches!(
            summary.stance.as_str(),
            "hawkish" | "dovish" | "neutral" | "unclear"
        )
    {
        return Err(invalid());
    }
    let comparison = chunks
        .iter()
        .any(|c| c.source_ref.starts_with("Aktuell · "))
        && chunks.iter().any(|c| c.source_ref.starts_with("Vorher · "));
    let mut supported_numbers = HashSet::new();
    let mut used_refs = HashSet::new();
    let mut keys = HashSet::new();
    for section in &summary.sections {
        if !matches!(
            section.key.as_str(),
            "decision"
                | "inflation"
                | "growth"
                | "labor"
                | "guidance"
                | "risks"
                | "tools"
                | "projections"
                | "changes"
        ) || !keys.insert(&section.key)
        {
            return Err(invalid());
        }
        if section.title.chars().count() > 120 {
            return Err(invalid());
        }
        for point in &section.points {
            if point.text.chars().count() > 700
                || point.evidence.is_empty()
                || point.evidence.len() > 3
            {
                return Err(invalid());
            }
            let refs = point
                .source_refs
                .iter()
                .map(String::as_str)
                .collect::<HashSet<_>>();
            let cited = point
                .evidence
                .iter()
                .map(|e| e.source_ref.as_str())
                .collect::<HashSet<_>>();
            if refs != cited
                || (comparison
                    && section.key != "changes"
                    && refs.iter().any(|r| !r.starts_with("Aktuell · ")))
            {
                return Err(invalid());
            }
            let mut allowed_numbers = HashSet::new();
            for evidence in &point.evidence {
                let quote = normalized(&evidence.quote);
                let source = chunks
                    .iter()
                    .find(|c| c.source_ref == evidence.source_ref)
                    .ok_or_else(invalid)?;
                if !(12..=600).contains(&quote.chars().count())
                    || !normalized(&source.text).contains(&quote)
                {
                    return Err(invalid());
                }
                allowed_numbers.extend(source_numbers(&quote));
            }
            let stated = numbers(&without_references(&point.text, &refs));
            if !stated.is_subset(&allowed_numbers) {
                return Err(invalid());
            }
            let quoted = point
                .evidence
                .iter()
                .map(|e| e.quote.as_str())
                .collect::<Vec<_>>()
                .join(" ");
            if !critical_meaning(&section.key, &point.text, &quoted) {
                return Err(invalid());
            }
            supported_numbers.extend(stated);
            used_refs.extend(refs);
            let text = point.text.to_lowercase();
            if [
                "kaufe jetzt",
                "verkaufe jetzt",
                "gehe long",
                "gehe short",
                "du solltest kaufen",
                "du solltest verkaufen",
            ]
            .iter()
            .any(|s| text.contains(s))
            {
                return Err(invalid());
            }
        }
    }
    if !numbers(&without_references(&summary.overview, &used_refs)).is_subset(&supported_numbers) {
        return Err(invalid());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normalizes_decimal_commas_and_mixed_policy_rate_fractions_without_converting_units() {
        assert_eq!(
            numbers("4-1/4 to 4-1/2 percent"),
            numbers("4,25 bis 4,50 Prozent")
        );
        assert_ne!(numbers("1/4 percentage point"), numbers("25 Basispunkte"));
        assert_eq!(
            numbers("4‑1/4 bis 4‑1/2 Prozent"),
            numbers("4,25-4,50 Prozent")
        );
        assert_eq!(
            source_numbers("12,000.25 million"),
            numbers("12.000,25 Millionen")
        );
        assert_ne!(source_numbers("3,500 units"), numbers("3,5 Einheiten"));
        assert_ne!(numbers("-0,25 Prozent"), numbers("0,25 Prozent"));
    }
    #[test]
    fn sampling_keeps_the_final_page_and_each_report_under_the_total_limit() {
        let chunks = (0..240)
            .map(|n| TextChunk {
                source_ref: format!("Seite {n}"),
                text: "Public paragraph. ".repeat(500),
            })
            .collect::<Vec<_>>();
        let sent = bounded_chunks(&chunks);
        assert_eq!(sent.len(), 100);
        assert_eq!(sent.last().unwrap().source_ref, "Seite 239");
        assert!(
            sent.iter()
                .map(|c| c.text.chars().count() + c.source_ref.chars().count() + 5)
                .sum::<usize>()
                <= MAX_MODEL_CHARS
        );
    }
    #[test]
    fn report_bank_attribution_rejects_foreign_bank_without_quoted_support() {
        let mut summary = CentralBankReportSummary {
            language: Some("de".into()),
            overview: "Die Fed senkt den Leitzins.".into(),
            stance: "dovish".into(),
            quality: None,
            sections: vec![CentralBankSummarySection {
                key: "decision".into(), title: "Entscheidung".into(),
                points: vec![CentralBankSummaryPoint {
                    text: "Die Federal Reserve senkt den US-Leitzins.".into(),
                    source_refs: vec!["Absatz 1".into()],
                    evidence: vec![CentralBankEvidence {
                        source_ref: "Absatz 1".into(),
                        quote: "The Committee decided to lower the target range for the federal funds rate.".into(),
                    }],
                }],
            }],
        };
        assert!(validate_bank(&summary, &SOURCES[0]).is_ok());
        summary.sections[0].points[0].text = "Der EZB-Rat senkt den US-Leitzins.".into();
        assert!(validate_bank(&summary, &SOURCES[0]).is_err());
        summary.sections[0].points[0].text = "Die Fed senkt den Leitzins.".into();
        summary.overview = "Der EZB-Rat senkt den Leitzins.".into();
        assert!(validate_bank(&summary, &SOURCES[0]).is_err());
        summary.overview = "Die Fed erwähnt die EZB.".into();
        summary.sections[0].points[0].text = "Die Fed erwähnt die Europäische Zentralbank.".into();
        summary.sections[0].points[0].evidence[0].quote =
            "The Federal Reserve statement mentions the European Central Bank.".into();
        assert!(validate_bank(&summary, &SOURCES[0]).is_ok());
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Golden {
        id: String,
        source_url: Option<String>,
        source_text: String,
        key: String,
        expected_text: String,
        bad_text: String,
        overview: String,
    }
    #[test]
    fn report_quality_goldens_reject_guardrail_regressions_with_real_and_synthetic_references() {
        let cases: Vec<Golden> = serde_json::from_str(include_str!(
            "../../../fixtures/report-quality-goldens.json"
        ))
        .unwrap();
        assert!(cases.len() >= 6);
        for case in cases {
            if let Some(url) = &case.source_url {
                assert!(Url::parse(url).unwrap().scheme() == "https")
            }
            let chunks = vec![TextChunk {
                source_ref: "Absatz 1".into(),
                text: case.source_text.clone(),
            }];
            let mut summary = CentralBankReportSummary {
                language: Some("de".into()),
                overview: case.overview,
                stance: "unclear".into(),
                quality: None,
                sections: vec![CentralBankSummarySection {
                    key: case.key,
                    title: "Belegte Aussage".into(),
                    points: vec![CentralBankSummaryPoint {
                        text: case.expected_text,
                        source_refs: vec!["Absatz 1".into()],
                        evidence: vec![CentralBankEvidence {
                            source_ref: "Absatz 1".into(),
                            quote: case.source_text,
                        }],
                    }],
                }],
            };
            assert!(
                validate(&summary, &chunks).is_ok(),
                "positive reference: {}",
                case.id
            );
            summary.sections[0].points[0].text = case.bad_text;
            assert!(
                validate(&summary, &chunks).is_err(),
                "factual regression: {}",
                case.id
            );
            summary.sections[0].points[0].evidence[0].quote =
                "Invented original quotation that is not in the report.".into();
            assert!(
                validate(&summary, &chunks).is_err(),
                "invented evidence: {}",
                case.id
            );
        }
    }
    #[tokio::test]
    #[ignore = "Explicit new-key opt-in and a persistent isolated API evaluation ledger required"]
    async fn report_live_public_reference_evaluation() {
        let env_file = std::env::var("MACRO_REPORT_EVAL_ENV_FILE")
            .expect("explicit confirmed key configuration required");
        let key = dotenvy::from_path_iter(env_file)
            .expect("evaluation configuration unavailable")
            .filter_map(Result::ok)
            .find(|(name, _)| name == "OPENAI_API_KEY")
            .map(|(_, key)| key)
            .expect("new evaluation key required");
        let ledger = std::path::PathBuf::from(
            std::env::var("MACRO_REPORT_EVAL_LEDGER").expect("persistent isolated ledger required"),
        );
        let output = std::path::PathBuf::from(
            std::env::var("MACRO_REPORT_EVAL_OUTPUT").expect("evaluation evidence path required"),
        );
        assert!(ledger.is_absolute() && output.is_absolute());
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(&ledger)
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        let initialized: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='report_ai_usage'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        if initialized == 0 {
            sqlx::raw_sql(include_str!(
                "../../../migrations/0051_report_ai_budget.sql"
            ))
            .execute(&pool)
            .await
            .unwrap();
        }
        let budget = BudgetStore::Sqlite(pool.clone());
        if let Ok(package) = std::env::var("MACRO_REPORT_EVAL_PACKAGE") {
            let id =
                std::env::var("MACRO_REPORT_EVAL_ID").expect("explicit public report ID required");
            let package = PathBuf::from(package);
            assert!(package.is_absolute());
            let reports = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(
                    sqlx::sqlite::SqliteConnectOptions::new()
                        .filename(package)
                        .read_only(true),
                )
                .await
                .unwrap();
            let row: LocalSummaryRow = sqlx::query_as("SELECT id,bank_code,report_type,title,source_url,published_at,extracted_text FROM central_bank_reports WHERE id=?").bind(&id).fetch_one(&reports).await.unwrap();
            let source = SOURCES
                .iter()
                .find(|s| s.bank_code == row.bank_code)
                .unwrap();
            let candidate = Candidate {
                title: row.title,
                url: row.source_url,
                published_at: row.published_at,
                report_type: row.report_type.clone(),
            };
            let chunks = parse_stored_chunks(&row.extracted_text);
            let temporary = tempfile::tempdir().unwrap();
            let state = AppState {
                db: reports.clone(),
                paths: crate::database::AppPaths::from_root(temporary.path().to_path_buf())
                    .unwrap(),
            };
            let chunks = summary_chunks_with_previous(
                &state,
                &id,
                &row.bank_code,
                &row.report_type,
                &chunks,
            )
            .await
            .unwrap();
            let generated = summarize_with_openai(
                &report_client().unwrap(),
                &key,
                DEFAULT_OPENAI_MODEL,
                source,
                &candidate,
                &chunks,
                &budget,
                StdDuration::from_secs(60),
            )
            .await;
            let report = match &generated {
                Ok(summary) => {
                    serde_json::json!({"passed":true,"id":id,"bank":row.bank_code,"summary":summary,"budget":budget.status().await.unwrap()})
                }
                Err(e) => {
                    serde_json::json!({"passed":false,"id":id,"bank":row.bank_code,"error":e.to_string(),"budget":budget.status().await.unwrap()})
                }
            };
            std::fs::write(output, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
            reports.close().await;
            pool.close().await;
            assert!(
                generated.is_ok(),
                "See the public full-report evaluation evidence"
            );
            return;
        }
        let cases: Vec<Golden> = serde_json::from_str(include_str!(
            "../../../fixtures/report-quality-goldens.json"
        ))
        .unwrap();
        let first_only = std::env::var("MACRO_REPORT_EVAL_FIRST_ONLY")
            .ok()
            .as_deref()
            == Some("1");
        let mut results = Vec::new();
        for case in cases.iter().take(if first_only { 1 } else { cases.len() }) {
            let source = SOURCES
                .iter()
                .find(|s| {
                    s.bank_code
                        == if case.id.starts_with("ecb") {
                            "ECB"
                        } else {
                            "FED"
                        }
                })
                .unwrap();
            let candidate = Candidate {
                title: format!("Isolated public reference {}", case.id),
                url: case.source_url.clone().unwrap_or_else(|| source.url.into()),
                published_at: None,
                report_type: "decision".into(),
            };
            let chunks = vec![TextChunk {
                source_ref: "Absatz 1".into(),
                text: case.source_text.clone(),
            }];
            let generated = summarize_with_openai(
                &report_client().unwrap(),
                &key,
                DEFAULT_OPENAI_MODEL,
                source,
                &candidate,
                &chunks,
                &budget,
                StdDuration::from_secs(60),
            )
            .await;
            match generated {
                Ok(summary) => {
                    let text = summary
                        .sections
                        .iter()
                        .flat_map(|s| s.points.iter().map(|p| p.text.as_str()))
                        .collect::<Vec<_>>()
                        .join(" ");
                    let useful =
                        !text.is_empty() && numbers(&case.expected_text).is_subset(&numbers(&text));
                    results
                        .push(serde_json::json!({"id":case.id,"passed":useful,"summary":summary}));
                }
                Err(error) => results.push(
                    serde_json::json!({"id":case.id,"passed":false,"error":error.to_string()}),
                ),
            }
        }
        if !first_only {
            let chunks = vec![
                TextChunk {
                    source_ref: "Aktuell · Absatz 1".into(),
                    text: cases[0].source_text.clone(),
                },
                TextChunk {
                    source_ref: "Vorher · Absatz 1".into(),
                    text: cases[1].source_text.clone(),
                },
            ];
            let candidate = Candidate {
                title: "Public Fed rate decision comparison December versus November 2024".into(),
                url: cases[0].source_url.clone().unwrap(),
                published_at: None,
                report_type: "decision".into(),
            };
            let comparison = summarize_with_openai(
                &report_client().unwrap(),
                &key,
                DEFAULT_OPENAI_MODEL,
                &SOURCES[0],
                &candidate,
                &chunks,
                &budget,
                StdDuration::from_secs(60),
            )
            .await;
            match comparison {Ok(summary)=>{
            let compared=summary.sections.iter().any(|s|s.key=="changes"&&!s.points.is_empty());
            results.push(serde_json::json!({"id":"fed-two-report-comparison","passed":compared,"summary":summary}));
        },Err(_)=>results.push(serde_json::json!({"id":"fed-two-report-comparison","passed":false,"error":"API_OR_QUALITY_CHECK_FAILED"}))}
        }
        let passed = results.iter().filter(|r| r["passed"] == true).count();
        let report = serde_json::json!({"finishedAt":Utc::now().to_rfc3339(),"model":DEFAULT_OPENAI_MODEL,"passed":passed,"total":results.len(),"shortPublicReferencesOnly":true,"humanSemanticReviewRequired":true,"budget":budget.status().await.unwrap(),"cases":results});
        std::fs::write(output, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
        pool.close().await;
        assert_eq!(
            passed,
            if first_only { 1 } else { 9 },
            "See the local public evaluation evidence; no raw API error or credential is logged"
        );
    }
}
