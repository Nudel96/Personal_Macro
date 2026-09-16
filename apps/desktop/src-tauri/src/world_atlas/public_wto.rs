//! WTO merchandise values: original product groups, nominal units, flags and territories.
use super::{
    public_gap::{contract, metrics, point, profile},
    public_models::*,
    public_source::decimal,
};
use crate::errors::CommandResult;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Cursor, Read},
};

pub const URL: &str =
    "https://stats.wto.org/assets/UserGuide/merchandise_values_annual_dataset.zip";
fn csv_text(bytes: &[u8]) -> CommandResult<String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if zip.len() != 1 {
        return Err(invalid());
    }
    let member = zip.by_index(0).map_err(|_| invalid())?;
    const MAX: u64 = 96 * 1024 * 1024;
    if member.name() != "merchandise_values_annual_dataset.csv" || member.size() > MAX {
        return Err(invalid());
    }
    let mut body = vec![];
    member
        .take(MAX + 1)
        .read_to_end(&mut body)
        .map_err(|_| invalid())?;
    if body.len() as u64 > MAX {
        return Err(invalid());
    }
    let (text, _, errors) = encoding_rs::WINDOWS_1252.decode(&body);
    if errors {
        return Err(invalid());
    }
    Ok(text.into_owned())
}

/// WTO regenerates the same CSV with a different row order. Hash all original
/// fields as a sorted multiset, retaining repeated rows so duplicates fail later.
pub fn fingerprint(bytes: &[u8]) -> CommandResult<String> {
    let text = csv_text(bytes)?;
    let mut reader = csv::Reader::from_reader(text.as_bytes());
    let header = reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .collect::<Vec<_>>()
        .join("\0");
    let mut hashes = Vec::new();
    for row in reader.records() {
        let row = row.map_err(|_| invalid())?;
        if row.iter().any(|v| v.contains('\0')) {
            return Err(invalid());
        }
        hashes.push(Sha256::digest(row.iter().collect::<Vec<_>>().join("\0").as_bytes()).to_vec());
    }
    hashes.sort_unstable();
    let mut hasher = Sha256::new();
    hasher.update(header.as_bytes());
    hasher.update([0]);
    for hash in hashes {
        hasher.update(hash);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}
pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let c = contract(&source.id)?;
    if source.id != "wto-merchandise" || source.url != URL {
        return Err(invalid());
    }
    let text = csv_text(bytes)?;
    let mut reader = csv::Reader::from_reader(text.as_bytes());
    let headers: Vec<String> =
        serde_json::from_value(c["headers"].clone()).map_err(|_| invalid())?;
    if reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .ne(headers.iter().map(String::as_str))
    {
        return Err(invalid());
    }
    let areas: BTreeMap<_, _> = source.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    let ms = metrics(source)?;
    let mut groups: BTreeMap<(String, String), Vec<PublicPoint>> = BTreeMap::new();
    let mut seen = BTreeSet::new();
    let mut count = 0;
    for row in reader.records() {
        let r = row.map_err(|_| invalid())?;
        count += 1;
        if &r[0] != "Merchandise trade values"
            || c["reporters"][&r[3]][0] != r[4]
            || c["reporters"][&r[3]][1] != r[5]
            || c["partners"][&r[6]][0] != r[7]
            || c["partners"][&r[6]][1] != r[8]
            || &r[9] != "SITC3"
            || &r[10] != "Merchandise - SITC Revision 3 (aggregates)"
            || c["products"][&r[11]] != r[12]
            || [&r[13], &r[14], &r[15], &r[16], &r[17], &r[18]]
                != ["A", "Annual", "A", "Annual", "USM", "Million US dollar"]
            || r[19].len() != 4
            || !("1948"..="2025").contains(&&r[19])
            || c["flags"][&r[20]] != r[21]
        {
            return Err(invalid());
        }
        if &r[6] != "000" {
            continue;
        }
        let a = areas.get(&r[3]).ok_or_else(invalid)?;
        let code = format!("{}:{}", &r[1], &r[11]);
        let m = ms.get(&code).ok_or_else(invalid)?;
        if a.label != r[5]
            || a.series_titles.get(&code) != Some(&format!("{} · {}", &r[2], &r[12]))
            || !seen.insert((r[3].to_owned(), code.clone(), r[19].to_owned()))
        {
            return Err(invalid());
        }
        let mut p = point(
            r[19].into(),
            decimal(&r[22])?,
            if &r[20] == "E" {
                "estimated"
            } else {
                "source_statistics"
            },
        );
        if p.value
            .as_ref()
            .is_some_and(|s| s.parse::<f64>().is_ok_and(|n| n < 0.0))
        {
            return Err(invalid());
        }
        p.notes.push("Partner: World · SITC Revision 3".into());
        if !r[20].is_empty() {
            p.notes.push(format!("{}: {}", &r[20], &r[21]));
        }
        groups
            .entry((a.code.clone(), m.provider_code.clone()))
            .or_default()
            .push(p);
    }
    let mut profiles = vec![];
    for ((country, code), mut points) in groups {
        points.sort_by(|a, b| a.period.cmp(&b.period));
        profiles.push(profile(&ms[&code], areas[country.as_str()], points)?);
    }
    Ok((profiles, count))
}
