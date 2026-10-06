//! Trusted public-cache publication. The caller owns one PostgreSQL transaction;
//! generation rows are immutable and the active pointer changes with explicit CAS.
use super::cache::{
    ArtifactKind, CacheError, DownloadDescriptor, Encoding, MAX_MANIFEST_ARTIFACTS,
    MAX_MANIFEST_BYTES, Manifest,
};
use crate::cloud_postgres::{CloudError, CloudResult};
use serde::{Deserialize, Serialize};
use sqlx::PgConnection;
use std::collections::HashSet;

pub const MAX_DESCRIPTOR_BYTES: usize = 2 * MAX_MANIFEST_BYTES;
pub const MAX_GENERATION_TRANSFER_BYTES: u64 = 500 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Transport {
    pub kind: ArtifactKind,
    pub key: String,
    pub encoding: Encoding,
    pub transfer_bytes: u64,
    pub transfer_sha256: String,
    /// Omission preserves the original format: the object belongs to this
    /// manifest's generation. Reuse must be proved against the active manifest.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub object_generation: Option<String>,
}

impl Transport {
    fn object_generation<'a>(&'a self, manifest: &'a Manifest) -> &'a str {
        self.object_generation
            .as_deref()
            .unwrap_or(&manifest.generation)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UploadDescriptor {
    pub version: u32,
    pub complete: bool,
    pub manifest: Manifest,
    pub transports: Vec<Transport>,
}

fn invalid() -> CloudError {
    CloudError::new(
        "PUBLIC_CACHE_INVALID",
        "Der Marktdaten-Nachweis ist unvollständig oder ungültig.",
    )
}
fn cache_error(error: CacheError) -> CloudError {
    let code = match error {
        CacheError::Limit => "PUBLIC_CACHE_LIMIT",
        CacheError::Unavailable => "PUBLIC_CACHE_UNAVAILABLE",
        _ => "PUBLIC_CACHE_INVALID",
    };
    CloudError::new(code, error.to_string())
}
fn canonical_generation(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok_and(|uuid| {
        uuid.get_version_num() == 4
            && uuid.get_variant() == uuid::Variant::RFC4122
            && uuid.to_string() == value
    })
}

impl UploadDescriptor {
    pub fn parse(bytes: &[u8]) -> CloudResult<Self> {
        if bytes.len() > MAX_DESCRIPTOR_BYTES {
            return Err(invalid());
        }
        let descriptor: Self = serde_json::from_slice(bytes).map_err(|_| invalid())?;
        descriptor.validate()?;
        Ok(descriptor)
    }

    pub fn validate(&self) -> CloudResult<()> {
        if self.version != 1 || !self.complete {
            return Err(invalid());
        }
        validate_parts(&self.manifest, &self.transports)
    }
}

fn validate_parts(manifest: &Manifest, transports: &[Transport]) -> CloudResult<()> {
    manifest.validate().map_err(cache_error)?;
    if !canonical_generation(&manifest.generation)
        || serde_json::to_vec(manifest)?.len() > MAX_MANIFEST_BYTES
        || transports.len() != manifest.artifacts.len()
    {
        return Err(invalid());
    }
    let mut identities = HashSet::new();
    let mut raw_hashes = HashSet::new();
    for artifact in &manifest.artifacts {
        // The reviewed exporter writes one distinct SQLite file per identity.
        if !raw_hashes.insert(&artifact.sha256) {
            return Err(invalid());
        }
    }
    let mut total = 0_u64;
    for transport in transports {
        if transport.encoding != Encoding::Gzip
            || !identities.insert((transport.kind, transport.key.as_str()))
        {
            return Err(invalid());
        }
        let artifact = manifest
            .artifact(transport.kind, &transport.key)
            .map_err(cache_error)?
            .clone();
        DownloadDescriptor {
            generation: manifest.generation.clone(),
            object_generation: transport.object_generation(manifest).to_owned(),
            artifact,
            encoding: transport.encoding,
            transfer_bytes: transport.transfer_bytes,
            transfer_sha256: transport.transfer_sha256.clone(),
        }
        .validate()
        .map_err(cache_error)?;
        total = total
            .checked_add(transport.transfer_bytes)
            .ok_or_else(invalid)?;
    }
    if total > MAX_GENERATION_TRANSFER_BYTES {
        return Err(CloudError::new(
            "PUBLIC_CACHE_LIMIT",
            "Die Marktdatenpakete überschreiten die Speicherreserve.",
        ));
    }
    Ok(())
}

/// A fully validated, pinned generation. No subsequent active-pointer lookup is
/// used when resolving a descriptor, even if a publisher switches generations.
#[derive(Debug, Clone)]
pub struct PublishedManifest {
    pub manifest: Manifest,
    transports: Vec<Transport>,
}
impl PublishedManifest {
    /// Start a new generation while retaining each verified object's original
    /// location. The publisher must replace changed artifacts and their transport
    /// metadata; publication rechecks all reused entries under the active lock.
    pub fn reusable_descriptor(
        &self,
        generation: String,
        created_at: String,
    ) -> CloudResult<UploadDescriptor> {
        let mut descriptor = UploadDescriptor {
            version: 1,
            complete: true,
            manifest: self.manifest.clone(),
            transports: self.transports.clone(),
        };
        for transport in &mut descriptor.transports {
            transport.object_generation =
                Some(transport.object_generation(&self.manifest).to_owned());
        }
        descriptor.manifest.generation = generation;
        descriptor.manifest.created_at = created_at;
        descriptor.validate()?;
        Ok(descriptor)
    }

    pub fn descriptor(&self, kind: ArtifactKind, key: &str) -> CloudResult<DownloadDescriptor> {
        let artifact = self
            .manifest
            .artifact(kind, key)
            .map_err(cache_error)?
            .clone();
        let transport = self
            .transports
            .iter()
            .find(|item| item.kind == kind && item.key == key)
            .ok_or_else(invalid)?;
        let result = DownloadDescriptor {
            generation: self.manifest.generation.clone(),
            object_generation: transport.object_generation(&self.manifest).to_owned(),
            artifact,
            encoding: transport.encoding,
            transfer_bytes: transport.transfer_bytes,
            transfer_sha256: transport.transfer_sha256.clone(),
        };
        result.validate().map_err(cache_error)?;
        Ok(result)
    }
}

fn validate_reused_objects(
    descriptor: &UploadDescriptor,
    previous: Option<&PublishedManifest>,
) -> CloudResult<()> {
    for transport in &descriptor.transports {
        let object_generation = transport.object_generation(&descriptor.manifest);
        if object_generation == descriptor.manifest.generation {
            continue;
        }
        let previous = previous.ok_or_else(invalid)?;
        let prior = previous.descriptor(transport.kind, &transport.key)?;
        let artifact = descriptor
            .manifest
            .artifact(transport.kind, &transport.key)
            .map_err(cache_error)?;
        // An arbitrary historical generation, renamed identity or changed raw
        // or encoded content is never accepted as a previously reviewed object.
        if artifact != &prior.artifact
            || object_generation != prior.object_generation
            || transport.encoding != prior.encoding
            || transport.transfer_bytes != prior.transfer_bytes
            || transport.transfer_sha256 != prior.transfer_sha256
        {
            return Err(invalid());
        }
    }
    Ok(())
}

fn kind_name(kind: ArtifactKind) -> &'static str {
    match kind {
        ArtifactKind::Rates => "rates",
        ArtifactKind::SeasonalityIndex => "seasonality-index",
        ArtifactKind::SeasonalitySymbol => "seasonality-symbol",
        ArtifactKind::Macro => "macro",
        ArtifactKind::Cot => "cot",
        ArtifactKind::Technicals => "technicals",
        ArtifactKind::Regime => "regime",
        ArtifactKind::Atlas => "atlas",
        ArtifactKind::Bonds => "bonds",
        ArtifactKind::CentralBankReports => "central-bank-reports",
    }
}

/// `None` explicitly expects an unpublished cache. It never means force/ignore
/// the current generation. No personal table or journal revision is modified.
pub async fn publish(
    connection: &mut PgConnection,
    descriptor: UploadDescriptor,
    expected_generation: Option<&str>,
) -> CloudResult<String> {
    descriptor.validate()?;
    if expected_generation.is_some_and(|value| !canonical_generation(value)) {
        return Err(invalid());
    }
    let pointer: Option<(Option<String>,)> =
        sqlx::query_as("SELECT generation FROM cloud_public_active WHERE id=1 FOR UPDATE")
            .fetch_optional(&mut *connection)
            .await?;
    let (current,) = pointer.ok_or_else(|| {
        CloudError::new(
            "PUBLIC_CACHE_NOT_INITIALIZED",
            "Die Marktdatenfreigabe ist noch nicht eingerichtet.",
        )
    })?;
    if current.as_deref() != expected_generation {
        return Err(CloudError::new(
            "PUBLIC_CACHE_CONFLICT",
            "Der aktive Marktdatenstand hat sich geändert. Prüfe ihn vor einem weiteren Versuch.",
        ));
    }
    if descriptor.transports.iter().any(|transport| {
        transport.object_generation(&descriptor.manifest) != descriptor.manifest.generation
    }) {
        // The active-pointer row is locked above. This check and publication
        // belong to the caller's same transaction, including concurrent jobs.
        let previous = load_active(&mut *connection).await?;
        validate_reused_objects(&descriptor, previous.as_ref())?;
    }
    let generation = descriptor.manifest.generation.clone();
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM cloud_public_generations WHERE generation=$1)",
    )
    .bind(&generation)
    .fetch_one(&mut *connection)
    .await?;
    if exists {
        return Err(CloudError::new(
            "PUBLIC_CACHE_GENERATION_EXISTS",
            "Ein bereits veröffentlichter Marktdatenstand wird nicht verändert.",
        ));
    }
    sqlx::query("INSERT INTO cloud_public_generations(generation,manifest_json,published_at) VALUES($1,$2,$3)")
        .bind(&generation).bind(serde_json::to_string(&descriptor.manifest)?)
        .bind(chrono::Utc::now().to_rfc3339()).execute(&mut *connection).await?;
    for transport in descriptor.transports {
        sqlx::query("INSERT INTO cloud_public_transports(generation,kind,artifact_key,encoding,transfer_bytes,transfer_sha256,object_generation) VALUES($1,$2,$3,'gzip',$4,$5,$6)")
            .bind(&generation).bind(kind_name(transport.kind)).bind(transport.key)
            .bind(transport.transfer_bytes as i64).bind(transport.transfer_sha256)
            .bind(transport.object_generation)
            .execute(&mut *connection).await?;
    }
    let updated = sqlx::query("UPDATE cloud_public_active SET generation=$1 WHERE id=1 AND generation IS NOT DISTINCT FROM $2")
        .bind(&generation).bind(expected_generation).execute(connection).await?;
    if updated.rows_affected() != 1 {
        return Err(CloudError::new(
            "PUBLIC_CACHE_CONFLICT",
            "Der aktive Marktdatenstand hat sich geändert.",
        ));
    }
    Ok(generation)
}

/// One PostgreSQL statement observes one active generation and its immutable
/// transport rows. No object URL or arbitrary pathname is loaded from a client.
pub async fn load_active(connection: &mut PgConnection) -> CloudResult<Option<PublishedManifest>> {
    let row: Option<(String,String,String)> = sqlx::query_as(
        "SELECT g.generation,g.manifest_json,
          (SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'kind',t.kind,'key',t.artifact_key,'encoding',t.encoding,
             'transferBytes',t.transfer_bytes,'transferSha256',t.transfer_sha256,
             'objectGeneration',t.object_generation)), '[]'::jsonb)::text
           FROM (SELECT kind,artifact_key,encoding,transfer_bytes,transfer_sha256,object_generation
                 FROM cloud_public_transports WHERE generation=g.generation
                 ORDER BY kind,artifact_key LIMIT $1) t)
         FROM cloud_public_active a JOIN cloud_public_generations g ON g.generation=a.generation WHERE a.id=1"
    )
    // Fetch one sentinel beyond the allowed count so corrupt extra rows cannot
    // be silently truncated into an apparently valid generation.
    .bind((MAX_MANIFEST_ARTIFACTS + 1) as i64)
    .fetch_optional(connection).await?;
    let Some((generation, manifest_json, transport_json)) = row else {
        return Ok(None);
    };
    let manifest = Manifest::parse(manifest_json.as_bytes()).map_err(cache_error)?;
    if generation != manifest.generation || transport_json.len() > MAX_DESCRIPTOR_BYTES {
        return Err(invalid());
    }
    let transports: Vec<Transport> =
        serde_json::from_str(&transport_json).map_err(|_| invalid())?;
    validate_parts(&manifest, &transports)?;
    Ok(Some(PublishedManifest {
        manifest,
        transports,
    }))
}

#[cfg(test)]
mod tests {
    use super::super::cache::{Artifact, MAX_TRANSFER_BYTES};
    use super::*;
    use futures_util::FutureExt;
    use std::panic::{AssertUnwindSafe, resume_unwind};

    fn fixture() -> UploadDescriptor {
        UploadDescriptor {
            version: 1,
            complete: true,
            manifest: Manifest {
                schema_version: 1,
                generation: uuid::Uuid::new_v4().to_string(),
                created_at: "2026-09-24T00:00:00Z".into(),
                artifacts: vec![Artifact {
                    kind: ArtifactKind::Rates,
                    key: "eodhd:policy-rates".into(),
                    sha256: "a".repeat(64),
                    size_bytes: 4096,
                    rows: 0,
                    file_name: format!("{}.sqlite", "a".repeat(64)),
                    format: "sqlite".into(),
                    schema_version: 1,
                }],
            },
            transports: vec![Transport {
                kind: ArtifactKind::Rates,
                key: "eodhd:policy-rates".into(),
                encoding: Encoding::Gzip,
                transfer_bytes: 512,
                transfer_sha256: "b".repeat(64),
                object_generation: None,
            }],
        }
    }

    fn many_artifacts(count: usize) -> UploadDescriptor {
        let mut result = fixture();
        let base = result.manifest.artifacts[0].clone();
        result.manifest.artifacts.clear();
        result.transports.clear();
        for index in 0..count {
            let mut artifact = base.clone();
            artifact.kind = ArtifactKind::SeasonalitySymbol;
            artifact.key = format!("eodhd:TEST{index:04}.FOREX");
            artifact.sha256 = format!("{index:064x}");
            artifact.file_name = format!("{}.sqlite", artifact.sha256);
            result.transports.push(Transport {
                kind: artifact.kind,
                key: artifact.key.clone(),
                encoding: Encoding::Gzip,
                transfer_bytes: 512,
                transfer_sha256: format!("{:064x}", index + count),
                object_generation: None,
            });
            result.manifest.artifacts.push(artifact);
        }
        result
    }

    #[test]
    fn full_generation_fits_manifest_and_descriptor_limits() {
        let descriptor = many_artifacts(MAX_MANIFEST_ARTIFACTS);
        let manifest = serde_json::to_vec(&descriptor.manifest).unwrap();
        let serialized = serde_json::to_vec(&descriptor).unwrap();
        assert!(manifest.len() <= MAX_MANIFEST_BYTES);
        assert!(serialized.len() <= MAX_DESCRIPTOR_BYTES);
        assert_eq!(
            Manifest::parse(&manifest).unwrap().artifacts.len(),
            MAX_MANIFEST_ARTIFACTS
        );
        assert_eq!(
            UploadDescriptor::parse(&serialized)
                .unwrap()
                .transports
                .len(),
            MAX_MANIFEST_ARTIFACTS
        );
        assert!(
            many_artifacts(MAX_MANIFEST_ARTIFACTS + 1)
                .validate()
                .is_err()
        );
    }

    #[tokio::test]
    #[ignore = "Requires MACRO_TEST_ENV_FILE; uses only a disposable isolated schema"]
    async fn active_generation_loads_more_than_512_transports_and_rejects_extras() {
        let fixture_db = crate::cloud_postgres::test_support::TestDatabase::open().await;
        let result = AssertUnwindSafe(async {
            let descriptor = many_artifacts(MAX_MANIFEST_ARTIFACTS);
            descriptor.validate().unwrap();
            let generation = descriptor.manifest.generation.clone();
            let mut tx = fixture_db.pool.begin().await.unwrap();
            // Bulk insert synthetic metadata in three statements: no private
            // data, shard files or one-network-roundtrip-per-artifact fixture.
            sqlx::query("INSERT INTO cloud_public_generations(generation,manifest_json,published_at) VALUES($1,$2,$3)")
                .bind(&generation).bind(serde_json::to_string(&descriptor.manifest).unwrap())
                .bind("2026-09-25T00:00:00Z").execute(&mut *tx).await.unwrap();
            let mut insert = sqlx::QueryBuilder::<sqlx::Postgres>::new(
                "INSERT INTO cloud_public_transports(generation,kind,artifact_key,encoding,transfer_bytes,transfer_sha256) "
            );
            insert.push_values(&descriptor.transports, |mut row, transport| {
                row.push_bind(&generation).push_bind(kind_name(transport.kind))
                    .push_bind(&transport.key).push_bind("gzip")
                    .push_bind(transport.transfer_bytes as i64).push_bind(&transport.transfer_sha256);
            });
            insert.build().execute(&mut *tx).await.unwrap();
            sqlx::query("UPDATE cloud_public_active SET generation=$1 WHERE id=1")
                .bind(&generation).execute(&mut *tx).await.unwrap();
            let loaded = load_active(&mut tx).await.unwrap().unwrap();
            assert_eq!(loaded.manifest.generation, generation);
            assert_eq!(loaded.transports.len(), MAX_MANIFEST_ARTIFACTS);
            for item in &descriptor.transports {
                let actual = loaded.descriptor(item.kind, &item.key).unwrap();
                assert_eq!(actual.transfer_sha256, item.transfer_sha256);
            }
            // The extra row sorts last: LIMIT MAX would hide it, while the
            // MAX+1 sentinel makes the count mismatch fail closed.
            sqlx::query("INSERT INTO cloud_public_transports(generation,kind,artifact_key,encoding,transfer_bytes,transfer_sha256) VALUES($1,'seasonality-symbol','eodhd:ZZZ_EXTRA.FOREX','gzip',512,$2)")
                .bind(&generation).bind("f".repeat(64)).execute(&mut *tx).await.unwrap();
            assert!(load_active(&mut tx).await.is_err());
            tx.rollback().await.unwrap();
        }).catch_unwind().await;
        fixture_db.close().await;
        if let Err(error) = result {
            resume_unwind(error);
        }
    }

    #[test]
    fn upload_descriptor_rejects_untrusted_fields_incomplete_and_wrong_sets() {
        let good = fixture();
        assert!(good.validate().is_ok());
        let mut invalid = good.clone();
        invalid.complete = false;
        assert!(invalid.validate().is_err());
        let mut invalid = good.clone();
        invalid.transports.clear();
        assert!(invalid.validate().is_err());
        let mut invalid = good.clone();
        invalid.transports[0].key = "eodhd:other".into();
        assert!(invalid.validate().is_err());
        let mut invalid = good.clone();
        invalid.transports.push(invalid.transports[0].clone());
        assert!(invalid.validate().is_err());
        let mut invalid = good.clone();
        invalid.transports[0].encoding = Encoding::Identity;
        assert!(invalid.validate().is_err());
        let mut invalid = good.clone();
        invalid.transports[0].transfer_bytes = MAX_TRANSFER_BYTES + 1;
        assert!(invalid.validate().is_err());
        for path in ["blobPathname", "url", "path"] {
            let mut value = serde_json::to_value(&good).unwrap();
            value["transports"][0][path] = serde_json::json!("https://untrusted.invalid/");
            assert!(UploadDescriptor::parse(&serde_json::to_vec(&value).unwrap()).is_err());
        }
        let mut value = serde_json::to_value(&good).unwrap();
        value["manifest"]["generation"] =
            serde_json::json!(format!("{}\n", good.manifest.generation));
        assert!(UploadDescriptor::parse(&serde_json::to_vec(&value).unwrap()).is_err());
    }

    #[test]
    fn total_transport_budget_and_pinned_path_are_checked() {
        let mut data = fixture();
        data.manifest.artifacts.clear();
        data.transports.clear();
        for index in 0..16 {
            let mut artifact = fixture().manifest.artifacts.remove(0);
            artifact.kind = ArtifactKind::SeasonalitySymbol;
            artifact.key = format!("eodhd:TEST{index}.FOREX");
            artifact.sha256 = format!("{index:064x}");
            artifact.file_name = format!("{}.sqlite", artifact.sha256);
            data.transports.push(Transport {
                kind: artifact.kind,
                key: artifact.key.clone(),
                encoding: Encoding::Gzip,
                transfer_bytes: MAX_TRANSFER_BYTES,
                transfer_sha256: "b".repeat(64),
                object_generation: None,
            });
            data.manifest.artifacts.push(artifact);
        }
        assert_eq!(data.validate().unwrap_err().code, "PUBLIC_CACHE_LIMIT");
        let good = fixture();
        let generation = good.manifest.generation.clone();
        let pinned = PublishedManifest {
            manifest: good.manifest,
            transports: good.transports,
        };
        let descriptor = pinned
            .descriptor(ArtifactKind::Rates, "eodhd:policy-rates")
            .unwrap();
        assert_eq!(
            descriptor.object_path().unwrap(),
            format!("public-cache/v1/{generation}/{}.sqlite.gz", "a".repeat(64))
        );
    }

    fn pinned(descriptor: UploadDescriptor) -> PublishedManifest {
        descriptor.validate().unwrap();
        PublishedManifest {
            manifest: descriptor.manifest,
            transports: descriptor.transports,
        }
    }

    #[test]
    fn legacy_transports_keep_their_original_paths_and_invalid_origins_fail_closed() {
        let original = fixture();
        let serialized = serde_json::to_vec(&original).unwrap();
        assert!(!String::from_utf8_lossy(&serialized).contains("objectGeneration"));
        let loaded = pinned(UploadDescriptor::parse(&serialized).unwrap());
        let descriptor = loaded
            .descriptor(ArtifactKind::Rates, "eodhd:policy-rates")
            .unwrap();
        assert_eq!(descriptor.generation, original.manifest.generation);
        assert_eq!(descriptor.object_generation, original.manifest.generation);
        for value in [
            "../another-generation".to_owned(),
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".to_uppercase(),
            "01010101-0101-1101-8101-010101010101".into(),
            "01010101-0101-4101-7101-010101010101".into(),
            format!("{}\n", original.manifest.generation),
        ] {
            let mut invalid = original.clone();
            invalid.transports[0].object_generation = Some(value);
            assert!(invalid.validate().is_err());
        }
    }

    #[test]
    fn reused_objects_remain_pinned_to_original_generation_across_publications() {
        let first = pinned(fixture());
        let original = first
            .descriptor(ArtifactKind::Rates, "eodhd:policy-rates")
            .unwrap();
        let second = first
            .reusable_descriptor(
                uuid::Uuid::new_v4().to_string(),
                "2026-09-25T00:00:00Z".into(),
            )
            .unwrap();
        validate_reused_objects(&second, Some(&first)).unwrap();
        assert!(validate_reused_objects(&second, None).is_err());
        let second = pinned(second);
        let second_download = second
            .descriptor(ArtifactKind::Rates, "eodhd:policy-rates")
            .unwrap();
        assert_ne!(second_download.generation, original.generation);
        assert_eq!(second_download.object_generation, original.generation);
        assert_eq!(second_download.object_path(), original.object_path());
        let third = second
            .reusable_descriptor(
                uuid::Uuid::new_v4().to_string(),
                "2026-09-26T00:00:00Z".into(),
            )
            .unwrap();
        validate_reused_objects(&third, Some(&second)).unwrap();
        assert_eq!(
            third.transports[0].object_generation.as_deref(),
            Some(original.generation.as_str())
        );
        let mut wrong_parent = third.clone();
        wrong_parent.transports[0].object_generation = Some(second.manifest.generation.clone());
        assert!(validate_reused_objects(&wrong_parent, Some(&second)).is_err());
    }

    #[test]
    fn reuse_rejects_arbitrary_references_and_every_changed_content_contract() {
        let previous = pinned(fixture());
        let successor = previous
            .reusable_descriptor(
                uuid::Uuid::new_v4().to_string(),
                "2026-09-25T00:00:00Z".into(),
            )
            .unwrap();
        let mut cases = Vec::new();
        let mut changed = successor.clone();
        changed.transports[0].object_generation = Some(uuid::Uuid::new_v4().to_string());
        cases.push(changed);
        let mut changed = successor.clone();
        changed.transports[0].transfer_sha256 = "c".repeat(64);
        cases.push(changed);
        let mut changed = successor.clone();
        changed.transports[0].transfer_bytes += 1;
        cases.push(changed);
        let mut changed = successor.clone();
        changed.manifest.artifacts[0].sha256 = "d".repeat(64);
        changed.manifest.artifacts[0].file_name = format!("{}.sqlite", "d".repeat(64));
        cases.push(changed);
        let mut changed = successor.clone();
        changed.manifest.artifacts[0].size_bytes += 1;
        cases.push(changed);
        let mut changed = successor.clone();
        changed.manifest.artifacts[0].rows += 1;
        cases.push(changed);
        let mut changed = successor.clone();
        changed.manifest.artifacts[0].kind = ArtifactKind::SeasonalitySymbol;
        changed.manifest.artifacts[0].key = "eodhd:EURUSD.FOREX".into();
        changed.transports[0].kind = ArtifactKind::SeasonalitySymbol;
        changed.transports[0].key = "eodhd:EURUSD.FOREX".into();
        cases.push(changed);
        for changed in cases {
            // Each is a well-formed standalone manifest. The provenance check
            // specifically rejects reuse under a different content contract.
            changed.validate().unwrap();
            assert!(validate_reused_objects(&changed, Some(&previous)).is_err());
        }
        // Explicitly fresh objects may replace content but cannot silently use
        // the previous pathname; None resolves to this new publication.
        let mut replacement = successor;
        replacement.transports[0].object_generation = None;
        replacement.transports[0].transfer_sha256 = "c".repeat(64);
        replacement.validate().unwrap();
        validate_reused_objects(&replacement, Some(&previous)).unwrap();
        assert_ne!(
            pinned(replacement)
                .descriptor(ArtifactKind::Rates, "eodhd:policy-rates")
                .unwrap()
                .object_path()
                .unwrap(),
            previous
                .descriptor(ArtifactKind::Rates, "eodhd:policy-rates")
                .unwrap()
                .object_path()
                .unwrap()
        );
    }

    #[tokio::test]
    #[ignore = "Requires MACRO_TEST_ENV_FILE; uses only a disposable isolated schema"]
    async fn incremental_publication_reuses_only_active_verified_objects_atomically() {
        let fixture_db = crate::cloud_postgres::test_support::TestDatabase::open().await;
        let result = AssertUnwindSafe(async {
            // Recreate the prior table shape only inside this disposable test
            // schema, then apply the additive migration over existing rows.
            let first = fixture();
            let first_id = first.manifest.generation.clone();
            let mut tx = fixture_db.pool.begin().await.unwrap();
            sqlx::query("ALTER TABLE cloud_public_transports DROP COLUMN object_generation")
                .execute(&mut *tx).await.unwrap();
            sqlx::query("INSERT INTO cloud_public_generations(generation,manifest_json,published_at) VALUES($1,$2,$3)")
                .bind(&first_id).bind(serde_json::to_string(&first.manifest).unwrap())
                .bind("2026-09-24T00:00:00Z").execute(&mut *tx).await.unwrap();
            sqlx::query("INSERT INTO cloud_public_transports(generation,kind,artifact_key,encoding,transfer_bytes,transfer_sha256) VALUES($1,'rates','eodhd:policy-rates','gzip',512,$2)")
                .bind(&first_id).bind("b".repeat(64)).execute(&mut *tx).await.unwrap();
            sqlx::query("UPDATE cloud_public_active SET generation=$1 WHERE id=1")
                .bind(&first_id).execute(&mut *tx).await.unwrap();
            sqlx::raw_sql(include_str!("../../postgres-migrations/0007_public_object_generation.sql"))
                .execute(&mut *tx).await.unwrap();
            tx.commit().await.unwrap();
            let mut connection = fixture_db.pool.acquire().await.unwrap();
            let previous = load_active(&mut connection).await.unwrap().unwrap();
            drop(connection);
            let second = previous.reusable_descriptor(
                uuid::Uuid::new_v4().to_string(), "2026-09-25T00:00:00Z".into()
            ).unwrap();
            let second_id = second.manifest.generation.clone();
            let mut tx = fixture_db.pool.begin().await.unwrap();
            let mut forged = second.clone();
            forged.transports[0].object_generation = Some(uuid::Uuid::new_v4().to_string());
            assert!(publish(&mut tx, forged, Some(&first_id)).await.is_err());
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cloud_public_generations")
                .fetch_one(&mut *tx).await.unwrap();
            assert_eq!(count, 1);
            tx.rollback().await.unwrap();
            let mut tx = fixture_db.pool.begin().await.unwrap();
            publish(&mut tx, second.clone(), Some(&first_id)).await.unwrap();
            let loaded = load_active(&mut tx).await.unwrap().unwrap();
            let reused = loaded.descriptor(ArtifactKind::Rates, "eodhd:policy-rates").unwrap();
            assert_eq!(reused.generation, second_id);
            assert_eq!(reused.object_generation, first_id);
            tx.rollback().await.unwrap();
            let mut tx = fixture_db.pool.begin().await.unwrap();
            assert_eq!(load_active(&mut tx).await.unwrap().unwrap().manifest.generation, first_id);
            publish(&mut tx, second, Some(&first_id)).await.unwrap();
            tx.commit().await.unwrap();
            let mut tx = fixture_db.pool.begin().await.unwrap();
            let third = load_active(&mut tx).await.unwrap().unwrap().reusable_descriptor(
                uuid::Uuid::new_v4().to_string(), "2026-09-26T00:00:00Z".into()
            ).unwrap();
            assert_eq!(publish(&mut tx, third.clone(), Some(&first_id)).await.unwrap_err().code,
                "PUBLIC_CACHE_CONFLICT");
            tx.rollback().await.unwrap();
            let mut tx = fixture_db.pool.begin().await.unwrap();
            publish(&mut tx, third, Some(&second_id)).await.unwrap();
            let reused = load_active(&mut tx).await.unwrap().unwrap()
                .descriptor(ArtifactKind::Rates, "eodhd:policy-rates").unwrap();
            assert_eq!(reused.object_generation, first_id);
            let revision: i64 = sqlx::query_scalar("SELECT revision FROM cloud_workspace WHERE id=1")
                .fetch_one(&mut *tx).await.unwrap();
            assert_eq!(revision, 0);
            tx.rollback().await.unwrap();
        }).catch_unwind().await;
        fixture_db.close().await;
        if let Err(error) = result {
            resume_unwind(error);
        }
    }

    #[tokio::test]
    #[ignore = "Requires MACRO_TEST_ENV_FILE; uses only a disposable isolated schema"]
    async fn publication_is_atomic_cas_pinned_and_separate_from_journal_revision() {
        let fixture_db = crate::cloud_postgres::test_support::TestDatabase::open().await;
        let result = AssertUnwindSafe(async {
            let first = fixture();
            let first_id = first.manifest.generation.clone();
            let mut tx = fixture_db.pool.begin().await.unwrap();
            assert!(load_active(&mut tx).await.unwrap().is_none());
            publish(&mut tx, first.clone(), None).await.unwrap();
            assert_eq!(
                load_active(&mut tx)
                    .await
                    .unwrap()
                    .unwrap()
                    .manifest
                    .generation,
                first_id
            );
            tx.rollback().await.unwrap();
            let mut tx = fixture_db.pool.begin().await.unwrap();
            assert!(load_active(&mut tx).await.unwrap().is_none());
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cloud_public_generations")
                .fetch_one(&mut *tx)
                .await
                .unwrap();
            assert_eq!(count, 0);
            publish(&mut tx, first, None).await.unwrap();
            tx.commit().await.unwrap();
            let mut connection = fixture_db.pool.acquire().await.unwrap();
            let pinned = load_active(&mut connection).await.unwrap().unwrap();
            drop(connection);
            let second = fixture();
            let second_id = second.manifest.generation.clone();
            let mut tx = fixture_db.pool.begin().await.unwrap();
            assert_eq!(
                publish(&mut tx, second.clone(), None)
                    .await
                    .unwrap_err()
                    .code,
                "PUBLIC_CACHE_CONFLICT"
            );
            tx.rollback().await.unwrap();
            let mut tx = fixture_db.pool.begin().await.unwrap();
            publish(&mut tx, second, Some(&first_id)).await.unwrap();
            tx.commit().await.unwrap();
            assert_eq!(
                pinned
                    .descriptor(ArtifactKind::Rates, "eodhd:policy-rates")
                    .unwrap()
                    .generation,
                first_id
            );
            let mut connection = fixture_db.pool.acquire().await.unwrap();
            assert_eq!(
                load_active(&mut connection)
                    .await
                    .unwrap()
                    .unwrap()
                    .manifest
                    .generation,
                second_id
            );
            let revision: i64 =
                sqlx::query_scalar("SELECT revision FROM cloud_workspace WHERE id=1")
                    .fetch_one(&mut *connection)
                    .await
                    .unwrap();
            assert_eq!(revision, 0);
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cloud_public_generations")
                .fetch_one(&mut *connection)
                .await
                .unwrap();
            assert_eq!(count, 2);
            drop(connection);
            let mut tx = fixture_db.pool.begin().await.unwrap();
            sqlx::query("DELETE FROM cloud_public_transports WHERE generation=$1")
                .bind(&second_id)
                .execute(&mut *tx)
                .await
                .unwrap();
            assert!(load_active(&mut tx).await.is_err());
            tx.rollback().await.unwrap();
        })
        .catch_unwind()
        .await;
        fixture_db.close().await;
        if let Err(error) = result {
            resume_unwind(error);
        }
    }
}
