use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Country {
    pub id: String,
    pub name: String,
    pub region: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Instrument {
    pub symbol: String,
    pub country_id: String,
    pub name: String,
    pub maturity_months: u32,
    pub currency: Option<String>,
    pub provider_country: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcludedInstrument {
    pub symbol: String,
    pub reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub reviewed_at: String,
    pub source_url: String,
    pub methodology_url: String,
    pub countries: Vec<Country>,
    pub instruments: Vec<Instrument>,
    pub excluded: Vec<ExcludedInstrument>,
}

pub fn catalog() -> &'static Catalog {
    static CATALOG: std::sync::OnceLock<Catalog> = std::sync::OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../../src/features/government-bonds/data/catalog.json"
        ))
        .expect("reviewed government bond catalog")
    })
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Observation {
    pub date: String,
    pub yield_pct: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BondQuote {
    #[serde(flatten)]
    pub instrument: Instrument,
    pub active: bool,
    pub date: Option<String>,
    pub yield_pct: Option<String>,
    pub previous_date: Option<String>,
    pub change_bps: Option<String>,
    pub fetched_at: Option<String>,
    pub last_error: Option<String>,
    pub stale: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncJob {
    pub id: String,
    pub status: String,
    pub country_id: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub total: usize,
    pub completed: usize,
    pub skipped: usize,
    pub failed: usize,
    pub current_symbol: Option<String>,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    pub as_of: String,
    pub configured: bool,
    pub desktop: bool,
    pub catalog_reviewed_at: String,
    pub catalog_checked_at: Option<String>,
    pub source_url: String,
    pub methodology_url: String,
    pub countries: Vec<Country>,
    pub instruments: Vec<BondQuote>,
    pub excluded: Vec<ExcludedInstrument>,
    pub job: Option<SyncJob>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailInput {
    pub country_id: String,
    pub comparison_id: Option<String>,
    pub maturity_months: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurvePoint {
    pub symbol: String,
    pub maturity_months: u32,
    pub currency: Option<String>,
    pub yield_pct: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountryDetail {
    pub country_id: String,
    pub instrument: Option<Instrument>,
    pub history: Vec<Observation>,
    pub curve: Vec<CurvePoint>,
    pub curve_spread_bps: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detail {
    pub curve_date: Option<String>,
    pub primary: CountryDetail,
    pub comparison: Option<CountryDetail>,
    pub spread_date: Option<String>,
    pub spread_bps: Option<String>,
}
