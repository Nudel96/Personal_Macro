//! Explicit verification against independently extracted public source originals.
use super::{public_models::*, public_source, public_store, store};
use std::collections::BTreeMap;

fn sorted(mut rows: Vec<PublicProfile>) -> Vec<PublicProfile> {
    rows.sort_by(|a, b| (&a.metric_id, &a.geography_id).cmp(&(&b.metric_id, &b.geography_id)));
    rows
}

#[tokio::test]
#[ignore = "Reviewed public IMF/ILO/ICP/WTO/IEA originals and independent Python oracle; temporary SQLite only"]
async fn public_gap_originals_roundtrip() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-gaps");
    let mut cases: Vec<(String, String)> = [
        ("imf-gdd-pvd_ls", "imf-PVD_LS.json"),
        ("imf-gdd-hh_ls", "imf-HH_LS.json"),
        ("imf-gdd-nfc_ls", "imf-NFC_LS.json"),
        ("imf-gdd-privatedebt_all", "imf-Privatedebt_all.json"),
        ("imf-gdd-hh_all", "imf-HH_ALL.json"),
        ("imf-gdd-nfc_all", "imf-NFC_ALL.json"),
        ("ilo-real-wage-growth", "ilo-real-wages.xlsx"),
        ("ilo-weekly-hours", "ilo-weekly-hours.csv"),
        ("worldbank-icp-housing", "icp-housing.json"),
        ("wto-merchandise", "wto-values.zip"),
        ("iea-battery-world", "iea-battery-world.html"),
        ("iea-battery-region", "iea-battery-region.html"),
        ("iea-battery-2010-2023", "iea-battery-2010-2023.html"),
    ]
    .into_iter()
    .map(|(id, file)| (id.into(), file.into()))
    .collect();
    for partner in [
        "USA", "CHN", "DEU", "GBR", "FRA", "JPN", "IND", "BRA", "SAU", "ZAF", "NGA", "AUS",
    ] {
        cases.push((
            format!("imf-imts-{}", partner.to_lowercase()),
            format!("imts-{partner}.csv"),
        ));
    }
    let root = tempfile::tempdir().unwrap();
    let mut db = store::open(root.path()).await.unwrap();
    let mut total_numeric = 0;
    for (id, file) in cases {
        let source = source(&id).unwrap();
        let bytes = std::fs::read(dir.join(file)).unwrap();
        let parsed = public_source::parse_download(&source, &bytes)
            .unwrap_or_else(|e| panic!("{id}: {}", e.message));
        let expected: Vec<PublicProfile> = serde_json::from_slice(
            &std::fs::read(dir.join("expected").join(format!("{id}.json"))).unwrap(),
        )
        .unwrap();
        let expected = sorted(expected);
        assert_eq!(
            sorted(parsed.profiles.clone()),
            expected,
            "Every original decimal, gap, flag, source title and country must agree: {id}"
        );
        if id == "wto-merchandise" {
            let reordered = std::fs::read(dir.join("wto-merchandise-recheck.bin")).unwrap();
            assert_ne!(bytes, reordered);
            let same = public_source::parse_download(&source, &reordered).unwrap();
            assert_eq!(same.provenance.sha256, parsed.provenance.sha256);
            assert_eq!(sorted(same.profiles), expected);
        }
        total_numeric += parsed.provenance.numeric_values;
        public_store::replace(&db, parsed)
            .await
            .unwrap_or_else(|e| panic!("store {id}: {}", e.message));
        db.close().await;
        db = store::open(root.path()).await.unwrap();
        let raw: Vec<String> =
            sqlx::query_scalar("SELECT profile_json FROM atlas_public_series WHERE dataset_id=?")
                .bind(&id)
                .fetch_all(&db)
                .await
                .unwrap();
        let saved: Vec<PublicProfile> = raw
            .iter()
            .map(|r| serde_json::from_str(r).unwrap())
            .collect();
        assert_eq!(sorted(saved), expected, "Persistence after reopening: {id}");
        let grouped: BTreeMap<_, _> =
            expected
                .iter()
                .fold(BTreeMap::<&str, Vec<PublicProfile>>::new(), |mut all, r| {
                    all.entry(&r.geography_id).or_default().push(r.clone());
                    all
                });
        // All profiles are checked above; exercise command reads for a country, a
        // source aggregate and a zero-only/empty country whenever present.
        let mut selected = vec![source.areas.first().unwrap(), source.areas.last().unwrap()];
        if let Some(a) = source.areas.iter().find(|a| {
            grouped[a.geography_id.as_str()]
                .iter()
                .flat_map(|r| &r.points)
                .all(|p| p.value.is_none())
        }) {
            selected.push(a);
        }
        for a in selected {
            let response = public_store::read(&db, &id, &a.geography_id).await.unwrap();
            assert_eq!(sorted(response.profiles), grouped[a.geography_id.as_str()]);
            assert_eq!(response.provenance.unwrap().sha256, source.expected_sha256);
        }
        // Reject changed data without replacing the verified cache.
        let mut changed = source.clone();
        changed.expected_sha256 = "0".repeat(64);
        assert!(public_source::parse_download(&changed, &bytes).is_err());
        println!(
            "{id}: {} profiles / {} original numeric values verified and reopened",
            expected.len(),
            source.expected_numeric
        );
    }
    assert!(total_numeric > 480_000);
    db.close().await;
}

#[tokio::test]
#[ignore = "Reviewed public IMF original; isolated cache and import gate verification"]
async fn public_gap_original_import_guards() {
    let root = tempfile::tempdir().unwrap();
    let state = super::AtlasState::new(root.path().to_path_buf());
    let id = "imf-gdd-pvd_ls";
    let bytes = std::fs::read(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-gaps/imf-PVD_LS.json"),
    )
    .unwrap();
    assert!(
        state
            .0
            .import_reviewed_public_original(id, b"{}".to_vec())
            .await
            .is_err()
    );
    let guard = state.0.gate.clone().lock_owned().await;
    assert!(
        state
            .0
            .import_reviewed_public_original(id, bytes.clone())
            .await
            .is_err()
    );
    drop(guard);
    let job = state
        .0
        .import_reviewed_public_original(id, bytes.clone())
        .await
        .unwrap();
    assert_eq!(job.status, "complete");
    assert_eq!(job.observations, 8385);
    assert!(
        state
            .0
            .import_reviewed_public_original(id, bytes.clone())
            .await
            .is_err()
    );
    let db = state.0.db().await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM atlas_public_datasets")
            .fetch_one(db)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        public_store::read(db, id, "m49:566").await.unwrap().status,
        "available"
    );
    let mut previous = public_store::read(db, id, "m49:566")
        .await
        .unwrap()
        .provenance
        .unwrap();
    let retrieved_at = previous.retrieved_at.clone();
    previous.recipe = "earlier-reviewed-mapping".into();
    sqlx::query("UPDATE atlas_public_datasets SET provenance_json=? WHERE id=?")
        .bind(serde_json::to_string(&previous).unwrap())
        .bind(id)
        .execute(db)
        .await
        .unwrap();
    // A local mapping rebuild never weakens the network download cooldown.
    assert!(state.0.start_public_source(id).await.is_err());
    assert!(
        state
            .0
            .import_reviewed_public_original(id, b"{}".to_vec())
            .await
            .is_err()
    );
    assert_eq!(
        state
            .0
            .import_reviewed_public_original(id, bytes.clone())
            .await
            .unwrap()
            .status,
        "complete"
    );
    let rebuilt = public_store::read(db, id, "m49:566").await.unwrap();
    assert_eq!(rebuilt.provenance.unwrap().retrieved_at, retrieved_at);
    assert!(
        state
            .0
            .import_reviewed_public_original(id, bytes)
            .await
            .is_err()
    );
}

#[test]
fn public_gap_definition_guards_reject_unreviewed_years_titles_and_urls() {
    // Small deterministic payload, no downloaded files required.
    let mut s = source("imf-gdd-pvd_ls").unwrap();
    let iso = s.areas[0].code.clone();
    let body = format!(
        r#"{{"values":{{"PVD_LS":{{"{iso}":{{"2024":0,"2025":1}}}}}},"api":{{"version":"1","output-method":"json"}}}}"#
    );
    assert!(super::public_gap::parse_imf(&s, body.as_bytes()).is_err());
    let valid = body.replace(",\"2025\":1", "");
    let (p, _) = super::public_gap::parse_imf(&s, valid.as_bytes()).unwrap();
    assert_eq!(p[0].points[0].value.as_deref(), Some("0"));
    s.areas[0]
        .series_titles
        .insert("PVD_LS".into(), "Wrong debt definition".into());
    assert!(super::public_gap::parse_imf(&s, valid.as_bytes()).is_err());
    let mut s = source("iea-battery-world").unwrap();
    s.url = "https://www.iea.org/other".into();
    assert!(super::public_battery::normalize(&s, b"<div></div>").is_err());
}
