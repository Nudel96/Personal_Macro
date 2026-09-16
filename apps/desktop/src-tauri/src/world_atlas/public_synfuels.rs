//! Original operating reports: fossil synthesis, fiscal years, no national extrapolation.
use super::public_models::*;
use crate::errors::{CommandError, CommandResult};
use calamine::{Data, Reader, Xlsx};
use regex::Regex;
use rust_decimal::Decimal;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    io::{Cursor, Read},
    str::FromStr,
};

pub const URL: &str = "https://www.sasol.com/sites/default/files/2026-07/Business%20Performance%20Metrics%20for%20the%20year%20ended%2030%20June%202026_excel.xlsx";
const ID: &str = "sasol-synthetic-fuels";
const CONTRACT: &str =
    include_str!("../../../src/features/world-atlas/data/public-synfuels-contract.json");
const URLS: [&str; 6] = [
    "https://www.sasol.com/sites/default/files/2023-11/Analyst%20Book%20FY16_0.pdf",
    "https://sasol.com/sites/default/files/2023-11/Additional%20Analyst%20information%20for%2030%20June%202019.pdf",
    "https://www.sasol.com/sites/default/files/2023-11/Production%20and%20sales%20metrics%20for%20the%20year%20ended%2030%20June%202022_Excel%20data_0.xlsx",
    "https://www.sasol.com/sites/default/files/2023-11/Production%20and%20sales%20metrics%20for%20the%20year%20ended%2030%20June%202023%20-%20Excel%20Data.xlsx",
    "https://www.sasol.com/sites/default/files/2025-07/Production%20and%20sales%20metrics%20for%20the%20year%20ended%2030%20June%202025_excel.xlsx",
    URL,
];
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    source_id: String,
    files: Vec<Original>,
    areas: Vec<PublicArea>,
    profiles: Vec<PublicProfile>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Original {
    url: String,
    bytes: usize,
    sha256: String,
    format: String,
    years: Vec<i32>,
    rows: Vec<Row>,
    #[serde(default)]
    page: usize,
    #[serde(default)]
    pages: usize,
    #[serde(default)]
    sheet: String,
    #[serde(default)]
    sheet_names: Vec<String>,
    #[serde(default)]
    dimensions: Vec<usize>,
    #[serde(default)]
    data_xml: String,
    #[serde(default)]
    zip_entries: usize,
    #[serde(default)]
    uncompressed_bytes: u128,
    #[serde(default)]
    columns: Vec<u32>,
    #[serde(default)]
    unit_column: u32,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Row {
    code: String,
    values: Vec<String>,
    #[serde(default)]
    pattern: String,
    #[serde(default)]
    after_oryx: bool,
    #[serde(default)]
    row: u32,
    #[serde(default)]
    label_column: u32,
    #[serde(default)]
    label: String,
    #[serde(default)]
    unit: String,
}
fn hash(b: &[u8]) -> String {
    Sha256::digest(b)
        .iter()
        .map(|v| format!("{v:02x}"))
        .collect()
}
fn normalize(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}
fn contract() -> CommandResult<Contract> {
    let c: Contract = serde_json::from_str(CONTRACT).map_err(|_| invalid())?;
    if c.source_id != ID || c.files.len() != 6 || c.areas.len() != 2 || c.profiles.len() != 4 {
        return Err(invalid());
    }
    for (i, f) in c.files.iter().enumerate() {
        if f.url != URLS[i]
            || f.bytes == 0
            || f.bytes > 5 * 1024 * 1024
            || f.sha256.len() != 64
            || f.years.len() != 3
            || f.rows.iter().any(|r| r.values.len() != 3)
        {
            return Err(invalid());
        }
    }
    Ok(c)
}
/// The bounded package concatenates untouched originals in a fixed, hashed order.
pub async fn download_bytes(client: &reqwest::Client) -> CommandResult<Vec<u8>> {
    let c = contract()?;
    let mut package = Vec::new();
    let network = || {
        CommandError::validation(
            "Die öffentlichen Betriebsberichte konnten nicht vollständig geladen werden. Der bisherige Atlasstand bleibt erhalten.",
        )
    };
    for f in c.files {
        let mut response = client.get(&f.url).send().await.map_err(|_| network())?;
        if !response.status().is_success()
            || response
                .content_length()
                .is_some_and(|n| n > f.bytes as u64)
        {
            return Err(network());
        }
        let mut b = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| network())? {
            if b.len() + chunk.len() > f.bytes {
                return Err(invalid());
            }
            b.extend_from_slice(&chunk);
        }
        if b.len() != f.bytes || hash(&b) != f.sha256 {
            return Err(invalid());
        }
        package.extend(b);
    }
    Ok(package)
}
type Values = BTreeMap<(String, i32), String>;
fn add(values: &mut Values, code: &str, year: i32, raw: String) -> CommandResult<()> {
    let number = Decimal::from_str(&raw).map_err(|_| invalid())?;
    let max = if code == "oryx_utilisation" { 150 } else { 100 };
    if !(2014..=2026).contains(&year)
        || number < Decimal::ZERO
        || number > Decimal::from(max)
        || ![
            "secunda_total",
            "secunda_white",
            "oryx_production",
            "oryx_utilisation",
        ]
        .contains(&code)
    {
        return Err(invalid());
    }
    if let Some(old) = values.insert((code.into(), year), raw)
        && Decimal::from_str(&old).map_err(|_| invalid())? != number
    {
        return Err(invalid());
    }
    Ok(())
}
// The 2016 Type1 font uses names such as eight.fitted. The general extractor
// loses those glyphs. Decode this one reviewed page through its ORIGINAL
// ToUnicode bfchar table; no digits are supplied or inferred by this adapter.
fn type1_table_text(bytes: &[u8]) -> CommandResult<String> {
    let doc = pdf_extract::Document::load_mem(bytes).map_err(|_| invalid())?;
    let page = *doc.get_pages().get(&20).ok_or_else(invalid)?;
    let fonts = doc.get_page_fonts(page).map_err(|_| invalid())?;
    if fonts.len() != 1 {
        return Err(invalid());
    }
    let font = fonts.get(b"T1_0".as_slice()).ok_or_else(invalid)?;
    if font
        .get(b"Subtype")
        .and_then(|v| v.as_name())
        .map_err(|_| invalid())?
        != b"Type1"
        || font
            .get(b"BaseFont")
            .and_then(|v| v.as_name())
            .map_err(|_| invalid())?
            != b"KVVKSW+MyriadPro-Regular"
    {
        return Err(invalid());
    }
    let id = font
        .get(b"ToUnicode")
        .and_then(|v| v.as_reference())
        .map_err(|_| invalid())?;
    let stream = doc
        .get_object(id)
        .and_then(|v| v.as_stream())
        .map_err(|_| invalid())?;
    let cmap = String::from_utf8(stream.decompressed_content().map_err(|_| invalid())?)
        .map_err(|_| invalid())?;
    if cmap.len() > 20_000 || !cmap.contains("95 beginbfchar") {
        return Err(invalid());
    }
    let body = cmap
        .split_once("95 beginbfchar")
        .ok_or_else(invalid)?
        .1
        .split_once("endbfchar")
        .ok_or_else(invalid)?
        .0;
    let re =
        Regex::new(r"(?m)^<([0-9A-Fa-f]{2})> <((?:[0-9A-Fa-f]{4})+)>$").map_err(|_| invalid())?;
    let mut mapping = BTreeMap::new();
    for c in re.captures_iter(body) {
        let code = u8::from_str_radix(&c[1], 16).map_err(|_| invalid())?;
        if c[2].len() > 16 {
            return Err(invalid());
        }
        let units = (0..c[2].len())
            .step_by(4)
            .map(|i| u16::from_str_radix(&c[2][i..i + 4], 16).map_err(|_| invalid()))
            .collect::<CommandResult<Vec<_>>>()?;
        let text = String::from_utf16(&units).map_err(|_| invalid())?;
        if mapping.insert(code, text).is_some() {
            return Err(invalid());
        }
    }
    if mapping.len() != 95 {
        return Err(invalid());
    }
    let content = doc.get_page_content(page).map_err(|_| invalid())?;
    if content.len() > 256_000 {
        return Err(invalid());
    }
    let decoded = pdf_extract::content::Content::decode(&content).map_err(|_| invalid())?;
    if decoded.operations.len() > 10_000 {
        return Err(invalid());
    }
    let mut text = String::new();
    for op in decoded.operations {
        if op.operator == "Tf"
            && op.operands.first().and_then(|v| v.as_name().ok()) != Some(b"T1_0".as_slice())
        {
            return Err(invalid());
        }
        if op.operator != "Tj" && op.operator != "TJ" {
            continue;
        }
        for operand in &op.operands {
            let parts = match operand {
                pdf_extract::Object::Array(a) => a.as_slice(),
                o => std::slice::from_ref(o),
            };
            for part in parts {
                match part {
                    pdf_extract::Object::String(bytes, _) => {
                        for code in bytes {
                            text.push_str(mapping.get(code).ok_or_else(invalid)?);
                        }
                    }
                    pdf_extract::Object::Integer(_) | pdf_extract::Object::Real(_) => {}
                    _ => return Err(invalid()),
                }
            }
        }
        text.push(' ');
    }
    Ok(text)
}
fn pdf_values(f: &Original, b: &[u8], values: &mut Values) -> CommandResult<usize> {
    let pages = pdf_extract::extract_text_from_mem_by_pages(b).map_err(|_| invalid())?;
    if pages.len() != f.pages
        || pages.iter().map(String::len).sum::<usize>() > 2 * 1024 * 1024
        || f.page == 0
        || f.page > pages.len()
    {
        return Err(invalid());
    }
    let t = if f.url == URLS[0] {
        normalize(&type1_table_text(b)?)
    } else {
        normalize(&pages[f.page - 1])
    };
    if !t.contains("Synfuels refined product")
        || !t.contains("Energy")
        || f.years.iter().any(|y| !t.contains(&y.to_string()))
    {
        return Err(invalid());
    }
    for r in &f.rows {
        let section = if r.after_oryx {
            let start = t.find("ORYX GTL").ok_or_else(invalid)?;
            &t[start..]
        } else {
            &t
        };
        let regex = Regex::new(&r.pattern).map_err(|_| invalid())?;
        let matches = regex.captures_iter(section).collect::<Vec<_>>();
        if matches.len() != 1 {
            return Err(invalid());
        }
        for (i, year) in f.years.iter().enumerate() {
            let raw = matches[0][i + 1].replace(',', ".");
            if raw != r.values[i] {
                return Err(invalid());
            }
            add(values, &r.code, *year, raw)?;
        }
    }
    Ok(f.rows.len() * 3)
}
fn text(d: Option<&Data>) -> CommandResult<String> {
    match d {
        Some(Data::String(s)) => Ok(normalize(s)),
        _ => Err(invalid()),
    }
}
fn xlsx_values(f: &Original, b: &[u8], values: &mut Values) -> CommandResult<usize> {
    let mut z = zip::ZipArchive::new(Cursor::new(b)).map_err(|_| invalid())?;
    if z.len() != f.zip_entries
        || z.decompressed_size() != Some(f.uncompressed_bytes)
        || f.uncompressed_bytes > 4 * 1024 * 1024
        || f.data_xml != "xl/worksheets/sheet3.xml"
        || f.columns.len() != 3
        || f.sheet != "Fuels"
    {
        return Err(invalid());
    }
    let member = z.by_name(&f.data_xml).map_err(|_| invalid())?;
    if member.size() > 200_000 {
        return Err(invalid());
    }
    let mut xml = String::new();
    member
        .take(200_001)
        .read_to_string(&mut xml)
        .map_err(|_| invalid())?;
    if xml.contains("<!DOCTYPE") || xml.contains("<!ENTITY") {
        return Err(invalid());
    }
    let regex =
        Regex::new(r#"(?s)<c r="([A-Z]+[0-9]+)"([^>/]*)>(.*?)</c>"#).map_err(|_| invalid())?;
    let numeric = Regex::new(r"^<v>([-+0-9.eE]+)</v>$").map_err(|_| invalid())?;
    let mut originals = BTreeMap::new();
    for cell in regex.captures_iter(&xml) {
        if cell[2].contains("t=") {
            continue;
        }
        if let Some(v) = numeric.captures(&cell[3])
            && originals
                .insert(cell[1].to_owned(), v[1].to_owned())
                .is_some()
        {
            return Err(invalid());
        }
    }
    let mut book = Xlsx::new(Cursor::new(b)).map_err(|_| invalid())?;
    if book.sheet_names() != f.sheet_names {
        return Err(invalid());
    }
    let sheet = book.worksheet_range(&f.sheet).map_err(|_| invalid())?;
    let end = sheet.end().ok_or_else(invalid)?;
    // Calamine omits trailing styled empty rows that the XLSX dimension retains.
    if f.dimensions.len() != 2
        || end.0 as usize + 1 > f.dimensions[0]
        || end.1 as usize + 1 > f.dimensions[1]
    {
        return Err(invalid());
    }
    for (i, col) in f.columns.iter().enumerate() {
        if text(sheet.get_value((2, *col - 1)))? != "Full year" {
            return Err(invalid());
        }
        let year = sheet
            .get_value((3, *col - 1))
            .ok_or_else(invalid)?
            .to_string();
        if year != f.years[i].to_string() {
            return Err(invalid());
        }
    }
    for r in &f.rows {
        if r.row == 0
            || r.label_column == 0
            || f.unit_column == 0
            || text(sheet.get_value((r.row - 1, r.label_column - 1)))? != r.label
            || text(sheet.get_value((r.row - 1, f.unit_column - 1)))? != r.unit
        {
            return Err(invalid());
        }
        for (i, col) in f.columns.iter().enumerate() {
            if !(1..=26).contains(col) {
                return Err(invalid());
            }
            let address = format!("{}{}", char::from(b'A' + (*col - 1) as u8), r.row);
            let raw = originals.get(&address).ok_or_else(invalid)?;
            let n = match sheet.get_value((r.row - 1, *col - 1)) {
                Some(Data::Float(n)) => *n,
                Some(Data::Int(n)) => *n as f64,
                _ => return Err(invalid()),
            };
            if raw != &r.values[i] || raw.parse::<f64>().map_err(|_| invalid())? != n {
                return Err(invalid());
            }
            add(values, &r.code, f.years[i], raw.clone())?;
        }
    }
    Ok(f.rows.len() * 3)
}
pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let c = contract()?;
    if source.id != ID
        || source.adapter != "sasol_synfuels"
        || source.url != URL
        || source.first_period != "2014"
        || source.last_period != "2026"
        || source.observation_kind != "operator_report"
        || source.areas.len() != 2
        || bytes.len() != c.files.iter().map(|f| f.bytes).sum::<usize>()
        || serde_json::to_value(&source.areas).map_err(|_| invalid())?
            != serde_json::to_value(&c.areas).map_err(|_| invalid())?
    {
        return Err(invalid());
    }
    let mut offset = 0;
    let mut values = Values::new();
    let mut count = 0;
    for f in &c.files {
        let b = &bytes[offset..offset + f.bytes];
        offset += f.bytes;
        if hash(b) != f.sha256 {
            return Err(invalid());
        }
        count += match f.format.as_str() {
            "pdf" => pdf_values(f, b, &mut values)?,
            "xlsx" => xlsx_values(f, b, &mut values)?,
            _ => return Err(invalid()),
        };
    }
    if count != 48 || values.len() != 36 {
        return Err(invalid());
    }
    let config = config()?;
    let mut profiles = c.profiles;
    for p in &mut profiles {
        let m = config
            .metrics
            .iter()
            .find(|m| m.id == p.metric_id && m.source_id == ID)
            .ok_or_else(invalid)?;
        let geography = if m.provider_code.starts_with("secunda_") {
            "m49:710"
        } else {
            "m49:634"
        };
        if m.frequency != "fiscal_annual_june"
            || m.kind != "plant_production"
            || m.comparison != "within_country"
            || !m.connect_adjacent
            || p.geography_id != geography
            || p.unit != m.unit
        {
            return Err(invalid());
        }
        for point in &mut p.points {
            let year = point.period.parse::<i32>().map_err(|_| invalid())?;
            let actual = values
                .remove(&(m.provider_code.clone(), year))
                .ok_or_else(invalid)?;
            if point.value.as_ref() != Some(&actual) {
                return Err(invalid());
            }
            point.value = Some(actual);
        }
    }
    if !values.is_empty() {
        return Err(invalid());
    }
    Ok((profiles, count))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn synthetic_production_rejects_negative_or_conflicting_annual_amounts() {
        let mut v = Values::new();
        assert!(add(&mut v, "secunda_total", 2024, "29.1".into()).is_ok());
        assert!(add(&mut v, "secunda_total", 2024, "29.2".into()).is_err());
        assert!(add(&mut v, "oryx_utilisation", 2024, "-1".into()).is_err());
        assert!(add(&mut v, "natref", 2024, "17.8".into()).is_err());
        assert!(super::super::public_source::valid_period(
            "2024",
            "fiscal_annual_june"
        ));
    }
    #[tokio::test]
    #[ignore = "Six original operating reports, independent PyPDF/OpenPyXL audit and temporary SQLite"]
    async fn public_synfuels_original_roundtrip() {
        let dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-remaining-40");
        let bytes = std::fs::read(dir.join("sasol-synthetic-fuels-originals.bin")).unwrap();
        let expected: Vec<PublicProfile> = serde_json::from_slice(
            &std::fs::read(dir.join("synfuels-expected-profiles.json")).unwrap(),
        )
        .unwrap();
        let s = source(ID).unwrap();
        let download = super::super::public_source::parse_download(&s, &bytes).unwrap();
        assert_eq!(download.profiles, expected);
        let root = tempfile::tempdir().unwrap();
        let db = super::super::store::open(root.path()).await.unwrap();
        super::super::public_store::replace(&db, download)
            .await
            .unwrap();
        db.close().await;
        let db = super::super::store::open(root.path()).await.unwrap();
        for geo in ["m49:710", "m49:634"] {
            assert_eq!(
                super::super::public_store::read(&db, ID, geo)
                    .await
                    .unwrap()
                    .profiles,
                expected
                    .iter()
                    .filter(|p| p.geography_id == geo)
                    .cloned()
                    .collect::<Vec<_>>()
            );
        }
        for geo in ["world", "m49:356", "m49:276"] {
            assert_eq!(
                super::super::public_store::read(&db, ID, geo)
                    .await
                    .unwrap()
                    .status,
                "unsupported_area"
            );
        }
        let mut bad = s.clone();
        bad.areas[0].geography_id = "m49:276".into();
        assert!(parse(&bad, &bytes).is_err());
        let mut changed = bytes;
        changed[20] ^= 1;
        assert!(super::super::public_source::parse_download(&s, &changed).is_err());
        db.close().await;
    }
}
