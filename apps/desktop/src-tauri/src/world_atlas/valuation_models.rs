//! Source identities and published annual valuation snapshots, separate from prices.
use serde::{Deserialize, Serialize};

use crate::errors::{CommandError, CommandResult};

pub const CATALOG_JSON: &str =
    include_str!("../../../src/features/world-atlas/data/valuation-catalog.json");
pub const JOB_PREFIX: &str = "damodaran:";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValuationCatalog {
    pub version: String,
    pub source_url: String,
    pub archive_url: String,
    pub methodology_url: String,
    pub datasets: Vec<DatasetDefinition>,
    pub metrics: Vec<MetricDefinition>,
    pub industries: Vec<IndustryDefinition>,
    pub geographies: Vec<GeographyMapping>,
    pub excluded_geographies: Vec<ExcludedGeography>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetDefinition {
    pub id: String,
    pub kind: String,
    pub region_id: String,
    pub label: String,
    pub scope_label: String,
    pub files: Vec<FileDefinition>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDefinition {
    pub file_name: String,
    pub url: String,
    pub publication_year: i32,
    pub workbook_date: Option<String>,
    /// Fixed archive bytes are pinned, including files without a workbook date.
    #[serde(default)]
    pub reviewed_sha256: Option<String>,
    pub region_cell: Option<String>,
    pub sheet_name: String,
    pub header_row: u32,
    pub subject_header: String,
    pub count_header: String,
    pub expected_subjects: usize,
    pub ambiguous_subjects: Vec<String>,
    pub fields: Vec<FieldDefinition>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldDefinition {
    pub metric_id: String,
    pub header: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricDefinition {
    pub id: String,
    pub label: String,
    pub explanation: String,
    pub positive_only: bool,
    pub kind: String,
    pub unit: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndustryDefinition {
    pub id: String,
    pub provider_label: String,
    pub label: String,
    pub active: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeographyMapping {
    pub provider_label: String,
    pub geography_id: String,
    pub label: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcludedGeography {
    pub provider_label: String,
    pub reason: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValuationPoint {
    pub year: i32,
    /// Published value, even when non-positive and not meaningful as a multiple.
    pub value: Option<f64>,
    pub status: String,
    pub firm_count: u32,
    pub method_epoch: String,
    pub source_file: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoricalPosition {
    pub status: String,
    pub percentile: Option<f64>,
    pub previous_median: Option<f64>,
    pub reference_first_year: Option<i32>,
    pub reference_last_year: Option<i32>,
    pub reference_count: usize,
    pub composition_changed: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValuationSeries {
    pub metric_id: String,
    pub points: Vec<ValuationPoint>,
    pub historical_position: HistoricalPosition,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValuationSubject {
    pub id: String,
    pub label: String,
    pub provider_label: String,
    pub geography_id: Option<String>,
    pub active: bool,
    pub series: Vec<ValuationSeries>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValuationSourceFile {
    pub url: String,
    pub file_name: String,
    pub sha256: String,
    pub publication_year: i32,
    pub workbook_date: Option<String>,
    pub row_count: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValuationProvenance {
    pub catalog_version: String,
    pub retrieved_at: String,
    pub files: Vec<ValuationSourceFile>,
    pub excluded_subjects: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValuationDownload {
    pub dataset_id: String,
    pub subjects: Vec<ValuationSubject>,
    pub provenance: ValuationProvenance,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValuationResponse {
    pub dataset_id: String,
    pub status: String,
    pub data: Option<ValuationDownload>,
}

pub fn catalog() -> CommandResult<ValuationCatalog> {
    serde_json::from_str(CATALOG_JSON)
        .map_err(|_| CommandError::validation("Der Atlas-Bewertungskatalog ist ungültig."))
}

pub fn dataset(id: &str) -> CommandResult<DatasetDefinition> {
    catalog()?
        .datasets
        .into_iter()
        .find(|row| row.id == id)
        .ok_or_else(|| CommandError::validation("Unbekannte Bewertungsgrundlage."))
}
