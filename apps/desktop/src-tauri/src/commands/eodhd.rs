use std::time::Duration;

use chrono::{DateTime, NaiveDateTime, Utc};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::errors::AppError;

pub const ECONOMIC_EVENTS_URL: &str = "https://eodhd.com/api/economic-events";

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EconomicEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub comparison: Option<String>,
    pub period: Option<String>,
    pub country: Option<String>,
    pub date: String,
    pub actual: Option<Value>,
    pub previous: Option<Value>,
    pub estimate: Option<Value>,
}

pub fn country_code(currency: &str) -> Option<&'static str> {
    match currency {
        "AUD" => Some("AU"),
        "CAD" => Some("CA"),
        "CHF" => Some("CH"),
        "CNY" => Some("CN"),
        "EUR" => Some("EU"),
        "GBP" => Some("UK"),
        "JPY" => Some("JP"),
        "NZD" => Some("NZ"),
        "USD" => Some("US"),
        _ => None,
    }
}

pub async fn fetch_events_for_currencies(
    api_key: &str,
    currencies: &[&str],
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> Result<Vec<EconomicEvent>, AppError> {
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("PersonalMacro/1 eodhd-economic-events")
        .build()
        .map_err(|error| AppError::DataTransfer(error.to_string()))?;
    let mut events = Vec::new();
    for currency in currencies {
        let Some(country) = country_code(currency) else {
            continue;
        };
        let mut window_from = from;
        while window_from <= to {
            let window_to = std::cmp::min(window_from + chrono::Duration::days(89), to);
            for page in 0..=1 {
                let offset = page * 1000;
                let mut url = Url::parse(ECONOMIC_EVENTS_URL)
                    .map_err(|error| AppError::DataTransfer(error.to_string()))?;
                url.query_pairs_mut()
                    .append_pair("api_token", api_key)
                    .append_pair("from", &window_from.format("%Y-%m-%d").to_string())
                    .append_pair("to", &window_to.format("%Y-%m-%d").to_string())
                    .append_pair("country", country)
                    .append_pair("limit", "1000")
                    .append_pair("offset", &offset.to_string())
                    .append_pair("fmt", "json");
                let response = client.get(url).send().await.map_err(|error| {
                    AppError::DataTransfer(format!(
                        "EODHD Economic Events konnte nicht abgerufen werden: {}",
                        bounded_error(&error.to_string())
                    ))
                })?;
                let status = response.status();
                let body = response.text().await.map_err(|error| {
                    AppError::DataTransfer(format!(
                        "EODHD-Antwort konnte nicht gelesen werden: {}",
                        bounded_error(&error.to_string())
                    ))
                })?;
                if !status.is_success() {
                    return Err(AppError::DataTransfer(format!(
                        "EODHD Economic Events antwortete mit HTTP {status}: {}",
                        bounded_error(&body)
                    )));
                }
                let payload: Value = serde_json::from_str(&body).map_err(|error| {
                    AppError::DataTransfer(format!(
                        "EODHD-Antwort ist kein gültiges JSON: {}",
                        bounded_error(&error.to_string())
                    ))
                })?;
                let Some(items) = payload.as_array() else {
                    return Err(AppError::DataTransfer(
                        "EODHD-Antwort enthält keine Ereignisliste.".into(),
                    ));
                };
                for item in items {
                    let event: EconomicEvent =
                        serde_json::from_value(item.clone()).map_err(|error| {
                            AppError::DataTransfer(format!(
                                "EODHD-Ereignis konnte nicht gelesen werden: {}",
                                bounded_error(&error.to_string())
                            ))
                        })?;
                    events.push(event);
                }
                if items.len() < 1000 {
                    break;
                }
            }
            window_from = window_to + chrono::Duration::days(1);
        }
    }
    Ok(events)
}

pub fn parse_release_time(value: &str) -> Option<DateTime<Utc>> {
    NaiveDateTime::parse_from_str(value.trim(), "%Y-%m-%d %H:%M:%S")
        .ok()
        .map(|value| DateTime::<Utc>::from_naive_utc_and_offset(value, Utc))
}

pub fn value_decimal(value: &Value) -> Option<String> {
    match value {
        Value::Number(number) => Some(number.to_string()),
        Value::String(text) => {
            let cleaned = text
                .trim()
                .replace(',', "")
                .trim_end_matches('%')
                .trim_end_matches('K')
                .trim_end_matches('k')
                .trim_end_matches('M')
                .trim_end_matches('m')
                .trim()
                .to_string();
            cleaned
                .parse::<rust_decimal::Decimal>()
                .ok()
                .map(|value| value.to_string())
        }
        _ => None,
    }
}

pub fn normalize(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn candidate_score(
    currency: &str,
    canonical_key: &str,
    source_label: &str,
    event_type: &str,
) -> i32 {
    let source = normalize(source_label);
    let event = normalize(event_type);
    let source_tokens = source
        .split_whitespace()
        .filter(|token| token.len() > 2)
        .collect::<Vec<_>>();
    let lexical_score = source_tokens
        .iter()
        .filter(|token| event.contains(**token))
        .count() as i32
        * 5;
    let mut score = 0;

    let has = |needle: &str| event.contains(needle);
    let source_has = |needle: &str| source.contains(needle);
    let has_token = |needle: &str| event.split_whitespace().any(|token| token == needle);
    let source_has_token = |needle: &str| source.split_whitespace().any(|token| token == needle);
    match canonical_key {
        "gdp" => {
            if has("gdp") || has("gross domestic product") {
                score += 40;
            }
            if has("gdpnow") && !source_has("gdpnow") {
                score -= 100;
            }
            if (has("capital expenditure")
                || has("external demand")
                || has("final consumption")
                || has("price index")
                || has("sales"))
                && !source_has("capital expenditure")
                && !source_has("external demand")
                && !source_has("final consumption")
                && !source_has("price index")
                && !source_has("sales")
            {
                score -= 100;
            }
        }
        "manufacturing_pmi" => {
            if has("manufacturing") && has("pmi") {
                score += 60;
                if has("composite") || has("services") {
                    score -= 80;
                }
                if has("non manufacturing") && !source_has("non manufacturing") {
                    score -= 100;
                }
                if source_has_token("ism") && has_token("ism") {
                    score += 30;
                }
                if source_has_token("ism") && !has_token("ism") {
                    score -= 100;
                }
                if source_has_token("nbs") && has_token("nbs") {
                    score += 30;
                }
                if source_has_token("nbs") && !has_token("nbs") {
                    score -= 100;
                }
                if source_has_token("hcob") && has_token("hcob") {
                    score += 30;
                }
                if source_has_token("jibun") && has_token("jibun") {
                    score += 30;
                }
            }
        }
        "services_pmi" => {
            if has("services") && has("pmi") {
                score += 60;
                if has("composite") || has("manufacturing") {
                    score -= 80;
                }
                if source_has_token("nbs") && has_token("nbs") {
                    score += 30;
                }
                if source_has_token("nbs") && !has_token("nbs") {
                    score -= 100;
                }
                if source_has_token("ism") && has_token("ism") {
                    score += 30;
                }
                if source_has_token("ism") && !has_token("ism") {
                    score -= 100;
                }
                if source_has_token("hcob") && has_token("hcob") {
                    score += 30;
                }
                if source_has_token("jibun") && has_token("jibun") {
                    score += 30;
                }
            } else if has("non manufacturing") && has("pmi") {
                score += 40;
            }
        }
        "retail_sales" => {
            if has("retail sales") || has("retail trade") {
                score += 55;
            }
            if source_has("household spending") && has("household spending") {
                score += 70;
            }
            if (has("ex autos") || has("ex gas") || has("ex fuel")) && !source_has("ex") {
                score -= 100;
            }
            if (has("brc") || has("new car")) && !source_has("brc") && !source_has("car") {
                score -= 100;
            }
        }
        "consumer_confidence" => {
            if has("confidence") || has("consumer climate") || has("economic barometer") {
                score += 50;
            }
            if source_has_token("kof") && has_token("kof") {
                score += 35;
            }
            if source_has_token("gfk") && has_token("gfk") {
                score += 35;
            }
            if source_has_token("tankan") && has_token("tankan") {
                score += 35;
            }
            if source_has_token("cb") && has_token("cb") {
                score += 35;
            }
            if source_has("manufacturing") && !has("manufactur") {
                score -= 100;
            }
            if source_has_token("kof") && !has_token("kof") {
                score -= 100;
            }
            if has("employment trends") && !source_has("employment trends") {
                score -= 100;
            }
        }
        "cpi_yoy" => {
            if has("cpi") || has("consumer price") || has("inflation rate") {
                score += 50;
            }
            if source_has("core") || source_has("trimmed") || source_has("median") {
                score -= 80;
            }
            if has("core") || has("trimmed") || has("median") || has("common") || has("ex food") {
                score -= 60;
            }
        }
        "ppi_yoy" => {
            if has("ppi")
                || has("producer price")
                || has("corporate goods price")
                || (has("producer") && has("import"))
            {
                score += 60;
            }
            if (has("ppi")
                || has("producer price")
                || has("corporate goods price")
                || (has("producer") && has("import")))
                && source_has("import")
                && has("import")
            {
                score += 50;
            }
            if (has("ppi")
                || has("producer price")
                || has("corporate goods price")
                || (has("producer") && has("import")))
                && source_has("output")
                && has("output")
            {
                score += 50;
            }
            if (has("core") || has("ex food") || has("ex food energy"))
                && !source_has("core")
                && !source_has("ex")
            {
                score -= 100;
            }
        }
        "pce_yoy" => {
            if has("pce") || has("personal consumption") || has("household consumption") {
                score += 65;
            }
            if source_has("core") && has("core") {
                score += 30;
            }
            if source_has("trimmed") && has("trimmed") {
                score += 40;
            }
            if source_has("median") && has("median") {
                score += 40;
            }
            if source_has("national core") && has("core") {
                score += 40;
            }
            if (source_has("core") || source_has("trimmed") || source_has("median")) && has("cpi") {
                score += 25;
            }
            if source_has("pce") && !has("pce") {
                score -= 100;
            }
            if (source_has("trimmed") && has("median"))
                || (source_has("median") && has("trimmed"))
                || (source_has("core") && (has("trimmed") || has("median")))
            {
                score -= 100;
            }
        }
        "interest_rates" => {
            if has("interest rate decision") || has("rate decision") || has("policy rate") {
                score += 65;
            }
            if source_has("loan prime rate") && has("loan prime rate") {
                score += 55;
                if source_has("1 year") {
                    if has("1y") || has("1 year") || has("loan prime rate 1") {
                        score += 80;
                    }
                    if has("5y") || has("5 year") || has("loan prime rate 5") {
                        score -= 120;
                    }
                }
            }
            if source_has_token("rba") && has_token("rba") {
                score += 30;
            }
            if source_has_token("ecb") && has_token("ecb") {
                score += 30;
            }
            if source_has_token("boe") && (has_token("boe") || has("bank of england")) {
                score += 30;
            }
            if source_has_token("boj") && has_token("boj") {
                score += 30;
            }
            if source_has_token("snb") && has_token("snb") {
                score += 30;
            }
            if source_has("overnight rate") && has("overnight rate") {
                score += 30;
            }
            if (has("summary") || has("opinions"))
                && !source_has("summary")
                && !source_has("opinions")
            {
                score -= 100;
            }
        }
        "nfp" => {
            if has("employment change") || has("non farm payroll") || has("payroll") {
                score += 55;
            }
            if source_has("employment change") && has("employment change") {
                score += 30;
            }
            if has("part time") || has("full time") {
                score -= 60;
            }
            if has("adp") && !source_has("adp") {
                score -= 100;
            }
            if (has("government payroll") || has("private"))
                && !source_has("government")
                && !source_has("private")
            {
                score -= 100;
            }
            if has("manufacturing payroll") && !source_has("manufacturing") {
                score -= 100;
            }
        }
        "unemployment_rate" => {
            if has("unemployment rate") {
                score += 70;
                if source_has("sa") && !has("n s a") {
                    score += 15;
                }
                if has("n s a") && source_has("sa") {
                    score -= 30;
                }
                if has("u 6") && !source_has("u 6") {
                    score -= 100;
                }
            }
        }
        "unemployment_claims" => {
            if has("jobless claims") || has("claimant count") || has("unemployment claims") {
                score += 70;
            }
            if currency == "USD" && (has("continuing") || has("average")) {
                score -= 100;
            }
            if currency == "USD" && has("initial") {
                score += 30;
            }
        }
        "adp" => {
            if has("adp") {
                score += 90;
            }
        }
        "jolts" => {
            if has("jolts")
                || has("jobs to applicants")
                || has("jobs applications")
                || has("job vacancies")
                || has("job openings")
            {
                score += 70;
            }
            if has("quits") && !source_has("quits") {
                score -= 100;
            }
        }
        _ => {}
    }
    if score > 0 {
        score += lexical_score;
        if source == event {
            score += 100;
        }
        if currency == "NZD"
            && (canonical_key == "nfp" || canonical_key == "unemployment_rate")
            && !event.contains("employment indicators")
        {
            score += 10;
        }
    }
    score
}

pub fn frequency(currency: &str, canonical_key: &str, event: &EconomicEvent) -> &'static str {
    if canonical_key == "interest_rates" {
        return "Meeting";
    }
    if canonical_key == "unemployment_claims" {
        return "Weekly";
    }
    if currency == "NZD" && (canonical_key == "nfp" || canonical_key == "unemployment_rate") {
        return "Quarterly";
    }
    if event
        .period
        .as_deref()
        .is_some_and(|period| period.trim().to_ascii_uppercase().starts_with('Q'))
    {
        return "Quarterly";
    }
    "Monthly"
}

fn bounded_error(value: &str) -> String {
    value.chars().take(500).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_mapping_covers_provider_special_cases() {
        assert!(
            candidate_score(
                "AUD",
                "pce_yoy",
                "Trimmed Mean CPI m/m",
                "RBA Trimmed Mean CPI"
            ) > 0
        );
        assert!(candidate_score("CAD", "pce_yoy", "Median CPI y/y", "Median CPI") > 0);
        assert!(
            candidate_score(
                "CNY",
                "interest_rates",
                "1-Year Loan Prime Rate",
                "Loan Prime Rate 1Y"
            ) > candidate_score(
                "CNY",
                "interest_rates",
                "1-Year Loan Prime Rate",
                "Loan Prime Rate 5Y"
            )
        );
        assert!(
            candidate_score(
                "CHF",
                "consumer_confidence",
                "KOF Economic Barometer",
                "KOF Leading Indicator"
            ) > 0
        );
        assert!(
            candidate_score(
                "JPY",
                "jolts",
                "Jobs-to-Applicants Ratio",
                "Jobs/applications ratio"
            ) > 0
        );
        assert!(
            candidate_score(
                "USD",
                "unemployment_claims",
                "Unemployment Claims",
                "Initial Jobless Claims"
            ) > 0
        );
        assert_eq!(
            candidate_score(
                "AUD",
                "nfp",
                "Employment Change",
                "Westpac Consumer Confidence Change"
            ),
            0
        );
        assert_eq!(
            candidate_score(
                "USD",
                "jolts",
                "JOLTS Job Openings",
                "Jobless Claims 4-Week Average"
            ),
            0
        );
        assert_eq!(
            candidate_score(
                "JPY",
                "unemployment_rate",
                "Unemployment Rate",
                "GDP Growth Rate"
            ),
            0
        );
        assert!(
            candidate_score(
                "USD",
                "retail_sales",
                "Retail Sales m/m",
                "Retail Sales Ex Autos"
            ) <= 0
        );
        assert!(candidate_score("USD", "ppi_yoy", "PPI m/m", "Core PPI") <= 0);
        for (canonical, source, unrelated) in [
            ("gdp", "GDP q/q", "Inflation Rate"),
            ("interest_rates", "SNB Policy Rate", "GDP Growth Rate"),
            (
                "unemployment_rate",
                "Unemployment Rate SA",
                "procure.ch Manufacturing PMI",
            ),
            ("nfp", "Employment Change", "ANZ Commodity Price Index"),
            (
                "manufacturing_pmi",
                "ISM Manufacturing PMI",
                "NFIB Business Optimism Index",
            ),
        ] {
            assert!(candidate_score("CHF", canonical, source, unrelated) <= 0);
        }
        assert!(
            candidate_score(
                "USD",
                "manufacturing_pmi",
                "ISM Manufacturing PMI",
                "ISM Non-Manufacturing PMI"
            ) <= 0
        );
        assert!(candidate_score("CNY", "gdp", "GDP q/y", "Inflation Rate") <= 0);
        assert!(candidate_score("AUD", "gdp", "GDP q/q", "GDP Capital Expenditure") <= 0);
        assert!(candidate_score("JPY", "gdp", "Prelim GDP q/q", "GDP External Demand") <= 0);
    }

    #[test]
    fn nzd_labour_data_remains_quarterly() {
        let event = EconomicEvent {
            event_type: "Employment Change".into(),
            comparison: None,
            period: Some("Q2 2026".into()),
            country: Some("NZ".into()),
            date: "2026-08-05 22:45:00".into(),
            actual: Some(Value::from(0.2)),
            previous: Some(Value::from(0.1)),
            estimate: Some(Value::from(0.3)),
        };
        assert_eq!(frequency("NZD", "nfp", &event), "Quarterly");
        assert_eq!(frequency("NZD", "unemployment_rate", &event), "Quarterly");
    }
}
