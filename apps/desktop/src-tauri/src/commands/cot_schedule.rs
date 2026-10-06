//! Official CFTC release calendar shared by the desktop and cloud collectors.
//! The dates describe planned publication, not an assertion that a report arrived.
use std::collections::BTreeMap;

use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Utc};
use chrono_tz::America::New_York;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::errors::AppError;

pub const RELEASE_SCHEDULE_URL: &str =
    "https://www.cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/index.htm";
pub const REFRESH_DELAY_MINUTES: i64 = 60;
const MAX_CALENDAR_BYTES: usize = 512 * 1024;
const MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CotReleaseCalendar {
    pub years: BTreeMap<i32, Vec<NaiveDate>>,
    pub fetched_at: DateTime<Utc>,
    pub source_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CotRelease {
    pub release_date: NaiveDate,
    pub expected_report_date: NaiveDate,
    pub release_at: DateTime<Utc>,
    pub refresh_at: DateTime<Utc>,
}

fn invalid_calendar() -> AppError {
    AppError::DataTransfer(
        "Der offizielle CFTC-Veröffentlichungskalender ist nicht vollständig prüfbar.".into(),
    )
}

fn source_hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

impl CotReleaseCalendar {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.years.is_empty()
            || self.years.len() > 3
            || self.source_sha256.len() != 64
            || !self
                .source_sha256
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(invalid_calendar());
        }
        for (&year, dates) in &self.years {
            if !(2020..=2100).contains(&year)
                || !(40..=60).contains(&dates.len())
                || dates.iter().any(|date| date.year() != year)
                || dates.windows(2).any(|pair| pair[0] >= pair[1])
                || (1..=12).any(|month| !dates.iter().any(|date| date.month() == month))
            {
                return Err(invalid_calendar());
            }
        }
        Ok(())
    }

    /// A calendar without the current year never invents future holiday dates.
    pub fn latest_due(&self, now: DateTime<Utc>) -> Option<CotRelease> {
        if !self
            .years
            .contains_key(&now.with_timezone(&New_York).year())
        {
            return None;
        }
        self.years
            .values()
            .flatten()
            .rev()
            .filter_map(|date| release_for_date(*date))
            .find(|release| release.refresh_at <= now)
    }

    pub fn next_release(&self, now: DateTime<Utc>) -> Option<CotRelease> {
        self.years
            .values()
            .flatten()
            .filter_map(|date| release_for_date(*date))
            .find(|release| release.refresh_at > now)
    }

    /// Verified against the official calendar on 2026-09-26. Used only while
    /// the first live calendar fetch is unavailable; it does not extend to 2027.
    pub fn reviewed_2026() -> Self {
        let days = [
            "05,09,16,23,30",
            "06,13,20,27",
            "06,13,20,27",
            "03,10,17,24",
            "01,08,15,22,29",
            "05,12,22,26",
            "06,10,17,24,31",
            "07,14,21,28",
            "04,11,18,25",
            "02,09,16,23,30",
            "06,16,20,30",
            "04,11,18,28",
        ];
        let dates = days
            .iter()
            .enumerate()
            .flat_map(|(index, days)| {
                days.split(',').map(move |day| {
                    NaiveDate::from_ymd_opt(
                        2026,
                        index as u32 + 1,
                        day.parse().expect("reviewed day"),
                    )
                    .expect("reviewed date")
                })
            })
            .collect();
        Self {
            years: BTreeMap::from([(2026, dates)]),
            fetched_at: Utc.with_ymd_and_hms(2026, 9, 26, 0, 0, 0).unwrap(),
            source_sha256: source_hash(days.join(";").as_bytes()),
        }
    }
}

fn release_for_date(release_date: NaiveDate) -> Option<CotRelease> {
    let release_at = New_York
        .from_local_datetime(&release_date.and_hms_opt(15, 30, 0)?)
        .single()?
        .with_timezone(&Utc);
    // Normally Tuesday positions, including the preceding Tuesday for Monday
    // holiday releases. The collector must additionally verify actual arrival.
    let days_since_tuesday = (release_date.weekday().num_days_from_monday() + 6) % 7;
    let days_since_tuesday = if days_since_tuesday == 0 {
        7
    } else {
        days_since_tuesday
    };
    Some(CotRelease {
        release_date,
        expected_report_date: release_date - Duration::days(i64::from(days_since_tuesday)),
        release_at,
        refresh_at: release_at + Duration::minutes(REFRESH_DELAY_MINUTES),
    })
}

pub fn parse_release_calendar(html: &str) -> Result<CotReleaseCalendar, AppError> {
    if html.len() > MAX_CALENDAR_BYTES {
        return Err(invalid_calendar());
    }
    let document = Html::parse_document(html);
    let page_text = document.root_element().text().collect::<Vec<_>>().join(" ");
    let page_text = page_text.split_whitespace().collect::<Vec<_>>().join(" ");
    if !page_text.contains("3:30 p.m. Eastern time") {
        // A provider change to the publication clock requires an explicit
        // contract update, instead of silently keeping the old time.
        return Err(invalid_calendar());
    }
    let sections = Selector::parse("h1,h2,h3,h4,table").expect("constant selector");
    let rows = Selector::parse("tr").expect("constant selector");
    let cells = Selector::parse("th,td").expect("constant selector");
    let mut pending_year = None;
    let mut years = BTreeMap::new();
    for section in document.select(&sections) {
        if section.value().name() != "table" {
            let title = section.text().collect::<String>();
            pending_year = title
                .trim()
                .strip_suffix(" Release Schedule")
                .and_then(|year| year.parse::<i32>().ok());
            continue;
        }
        let Some(year) = pending_year.take() else {
            continue;
        };
        let mut dates = Vec::new();
        let mut month_index = 0;
        for row in section.select(&rows) {
            let values: Vec<String> = row
                .select(&cells)
                .map(|cell| cell.text().collect::<String>().trim().to_owned())
                .collect();
            if values.first().is_some_and(|value| value == "Month") {
                continue;
            }
            if month_index >= MONTHS.len()
                || values.len() < 2
                || values.first().map(String::as_str) != Some(MONTHS[month_index])
            {
                return Err(invalid_calendar());
            }
            for value in &values[1..] {
                let day = value.trim_end_matches('*').trim();
                if day.is_empty() {
                    continue;
                }
                let day = day.parse::<u32>().map_err(|_| invalid_calendar())?;
                dates.push(
                    NaiveDate::from_ymd_opt(year, month_index as u32 + 1, day)
                        .ok_or_else(invalid_calendar)?,
                );
            }
            month_index += 1;
        }
        if month_index != 12 || years.insert(year, dates).is_some() {
            return Err(invalid_calendar());
        }
    }
    let calendar = CotReleaseCalendar {
        years,
        fetched_at: Utc::now(),
        source_sha256: source_hash(html.as_bytes()),
    };
    calendar.validate()?;
    Ok(calendar)
}

pub async fn fetch_release_calendar() -> Result<CotReleaseCalendar, AppError> {
    let client = reqwest::Client::builder()
        .tls_backend_rustls()
        .timeout(std::time::Duration::from_secs(20))
        .connect_timeout(std::time::Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("PersonalMacro/1.0 (+CFTC release calendar)")
        .build()
        .map_err(|_| invalid_calendar())?;
    let mut response = client
        .get(RELEASE_SCHEDULE_URL)
        .send()
        .await
        .map_err(|_| invalid_calendar())?
        .error_for_status()
        .map_err(|_| invalid_calendar())?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|size| size > MAX_CALENDAR_BYTES as u64)
    {
        return Err(invalid_calendar());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| invalid_calendar())? {
        if bytes.len().saturating_add(chunk.len()) > MAX_CALENDAR_BYTES {
            return Err(invalid_calendar());
        }
        bytes.extend_from_slice(&chunk);
    }
    parse_release_calendar(std::str::from_utf8(&bytes).map_err(|_| invalid_calendar())?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono_tz::Europe::Berlin;

    fn instant(value: &str) -> DateTime<Utc> {
        value.parse().unwrap()
    }

    #[test]
    fn release_delay_observes_new_york_dst_and_berlin_mismatch() {
        for (date, utc_hour, berlin_hour) in [
            ("2026-01-09", 21, 22),
            ("2026-09-25", 20, 22),
            ("2026-03-13", 20, 21),
            ("2026-10-30", 20, 21),
        ] {
            let release = release_for_date(date.parse().unwrap()).unwrap();
            assert_eq!(
                release.refresh_at.format("%H").to_string(),
                utc_hour.to_string()
            );
            assert_eq!(
                release
                    .refresh_at
                    .with_timezone(&Berlin)
                    .format("%H")
                    .to_string(),
                berlin_hour.to_string()
            );
            assert_eq!(
                release.refresh_at - release.release_at,
                Duration::minutes(60)
            );
        }
    }

    #[test]
    fn holiday_dates_and_exact_due_boundary_are_preserved() {
        let calendar = CotReleaseCalendar::reviewed_2026();
        calendar.validate().unwrap();
        for date in [
            "2026-01-05",
            "2026-06-22",
            "2026-07-06",
            "2026-11-16",
            "2026-11-30",
            "2026-12-28",
        ] {
            assert!(calendar.years[&2026].contains(&date.parse().unwrap()));
        }
        let before = calendar
            .latest_due(instant("2026-09-25T20:29:59Z"))
            .unwrap();
        assert_eq!(before.release_date.to_string(), "2026-09-18");
        let due = calendar
            .latest_due(instant("2026-09-25T20:30:00Z"))
            .unwrap();
        assert_eq!(due.expected_report_date.to_string(), "2026-09-22");
        assert!(
            calendar
                .latest_due(instant("2027-01-08T22:00:00Z"))
                .is_none()
        );
        assert_eq!(
            release_for_date("2026-11-30".parse().unwrap())
                .unwrap()
                .expected_report_date
                .to_string(),
            "2026-11-24"
        );
    }

    fn fixture(year: i32) -> String {
        let days = CotReleaseCalendar::reviewed_2026();
        let mut html = format!(
            "<p>The reports are released at 3:30 p.m. Eastern time.</p><h3><strong>{year} Release Schedule</strong></h3><table><tr><td>Month</td><td>Dates</td></tr>"
        );
        for (index, month) in MONTHS.iter().enumerate() {
            html.push_str(&format!("<tr><td>{month}<span>&nbsp;</span></td>"));
            for date in &days.years[&2026] {
                if date.month() == index as u32 + 1 {
                    html.push_str(&format!("<td>{:02}*</td>", date.day()));
                }
            }
            html.push_str("<td>&nbsp;</td></tr>");
        }
        html + "</table>"
    }

    #[test]
    fn parser_accepts_nested_cells_and_new_year_without_code_change() {
        let calendar = parse_release_calendar(&(fixture(2026) + &fixture(2027))).unwrap();
        assert_eq!(
            calendar.years[&2026],
            CotReleaseCalendar::reviewed_2026().years[&2026]
        );
        assert_eq!(calendar.years[&2027].len(), 52);
        assert!(
            calendar
                .latest_due(instant("2027-01-10T22:00:00Z"))
                .is_some()
        );
    }

    #[test]
    fn parser_rejects_partial_duplicate_invalid_and_oversized_calendars() {
        for html in [
            fixture(2026).replace("3:30 p.m.", "4:00 p.m."),
            fixture(2026).replace("February", "Unknown"),
            fixture(2026).replacen("<td>09*</td>", "<td>05*</td>", 1),
            fixture(2026).replacen("<td>05*</td>", "<td>32*</td>", 1),
            fixture(2026) + &fixture(2026),
            "x".repeat(MAX_CALENDAR_BYTES + 1),
        ] {
            assert!(parse_release_calendar(&html).is_err());
        }
    }
}
