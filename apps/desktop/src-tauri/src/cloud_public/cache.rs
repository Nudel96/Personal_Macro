//! Files are disposable read leases. Durable truth belongs to a trusted manifest
//! and private object storage, never this temporary directory.
use std::{
    collections::{HashMap, HashSet},
    fs::{File, OpenOptions},
    io::{BufRead, BufReader, Read, Write},
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    time::Duration,
};

use futures_util::{Stream, StreamExt};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{
    ConnectOptions, SqlitePool,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore, mpsc};
use uuid::Uuid;

pub const MAX_TRANSFER_BYTES: u64 = 32 * 1024 * 1024;
pub const MAX_SQLITE_BYTES: u64 = 128 * 1024 * 1024;
pub const MAX_MANIFEST_BYTES: usize = 1024 * 1024;
pub const MAX_MANIFEST_ARTIFACTS: usize = 1024;
// This is the sum of immutable remote shards, not simultaneous local storage.
// The two leases and per-file limits still cap live temporary bytes at 320 MiB.
pub const MAX_MANIFEST_SQLITE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const LOAD_TIMEOUT: Duration = Duration::from_secs(25);
const MAX_PARALLEL_LEASES: usize = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum CacheError {
    #[error("Das Marktdatenverzeichnis ist ungültig.")]
    InvalidManifest,
    #[error("Das Marktdatenpaket konnte nicht bestätigt werden.")]
    Integrity,
    #[error("Die Struktur des Marktdatenpakets wird nicht unterstützt.")]
    Schema,
    #[error("Das Marktdatenpaket überschreitet die zulässige Größe.")]
    Limit,
    #[error("Es werden bereits Marktdaten geladen. Bitte versuche es erneut.")]
    Busy,
    #[error("Das Marktdatenpaket ist derzeit nicht erreichbar.")]
    Unavailable,
    #[error("Die private Marktdatenverbindung ist noch nicht eingerichtet.")]
    Configuration,
}

type Result<T> = std::result::Result<T, CacheError>;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum ArtifactKind {
    Rates,
    SeasonalityIndex,
    SeasonalitySymbol,
    Macro,
    Cot,
    Technicals,
    Regime,
    Atlas,
    Bonds,
    CentralBankReports,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Artifact {
    pub kind: ArtifactKind,
    pub key: String,
    pub sha256: String,
    pub size_bytes: u64,
    pub rows: u64,
    pub file_name: String,
    pub format: String,
    pub schema_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub schema_version: u32,
    pub generation: String,
    pub created_at: String,
    pub artifacts: Vec<Artifact>,
}

impl Manifest {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        if bytes.len() > MAX_MANIFEST_BYTES {
            return Err(CacheError::Limit);
        }
        let manifest: Self =
            serde_json::from_slice(bytes).map_err(|_| CacheError::InvalidManifest)?;
        manifest.validate()?;
        Ok(manifest)
    }

    pub fn validate(&self) -> Result<()> {
        if self.schema_version != 1
            || !canonical_uuid(&self.generation)
            || !chrono::DateTime::parse_from_rfc3339(&self.created_at)
                .is_ok_and(|date| date.offset().local_minus_utc() == 0)
            || self.artifacts.is_empty()
            || self.artifacts.len() > MAX_MANIFEST_ARTIFACTS
        {
            return Err(CacheError::InvalidManifest);
        }
        let mut identities = HashSet::new();
        let mut total = 0_u64;
        for artifact in &self.artifacts {
            artifact.validate()?;
            if !identities.insert((artifact.kind, &artifact.key)) {
                return Err(CacheError::InvalidManifest);
            }
            total = total
                .checked_add(artifact.size_bytes)
                .ok_or(CacheError::Limit)?;
        }
        if total > MAX_MANIFEST_SQLITE_BYTES {
            return Err(CacheError::Limit);
        }
        Ok(())
    }

    /// Resolve from an already authenticated manifest, never from browser URLs.
    pub fn artifact(&self, kind: ArtifactKind, key: &str) -> Result<&Artifact> {
        self.artifacts
            .iter()
            .find(|item| item.kind == kind && item.key == key)
            .ok_or(CacheError::Unavailable)
    }
}

fn canonical_uuid(value: &str) -> bool {
    Uuid::parse_str(value).is_ok_and(|id| {
        id.get_version_num() == 4
            && id.get_variant() == uuid::Variant::RFC4122
            && id.to_string() == value
    })
}

fn hash_text(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

pub(super) fn lowercase_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

impl Artifact {
    pub fn validate(&self) -> Result<()> {
        let key_valid = match self.kind {
            ArtifactKind::Macro
            | ArtifactKind::Cot
            | ArtifactKind::Technicals
            | ArtifactKind::Regime
            | ArtifactKind::Atlas
            | ArtifactKind::Bonds
            | ArtifactKind::CentralBankReports => {
                super::schema::definition(self.kind, &self.key).is_ok()
            }
            ArtifactKind::Rates => self.key == "eodhd:policy-rates",
            ArtifactKind::SeasonalityIndex => self.key == "eodhd:seasonality",
            ArtifactKind::SeasonalitySymbol => {
                self.key.strip_prefix("eodhd:").is_some_and(|symbol| {
                    !symbol.is_empty()
                        && symbol.len() <= 96
                        && symbol
                            .bytes()
                            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
                })
            }
        };
        if !key_valid
            || !hash_text(&self.sha256)
            || self.schema_version != 1
            || self.format != "sqlite"
            || self.file_name != format!("{}.sqlite", self.sha256)
        {
            return Err(CacheError::InvalidManifest);
        }
        let max_rows = match self.kind {
            ArtifactKind::Rates => 10_002,
            ArtifactKind::SeasonalityIndex => 20_002,
            ArtifactKind::SeasonalitySymbol => 100_002,
            _ => super::schema::definition(self.kind, &self.key)?
                .tables
                .values()
                .try_fold(0_u64, |sum, table| {
                    sum.checked_add(table.max_rows).ok_or(CacheError::Limit)
                })?,
        };
        if self.size_bytes < 512 || self.size_bytes > MAX_SQLITE_BYTES || self.rows > max_rows {
            return Err(CacheError::Limit);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Encoding {
    Identity,
    Gzip,
}

/// Transport metadata is stored separately from the raw SQLite manifest.
#[derive(Debug, Clone)]
pub struct DownloadDescriptor {
    /// The selected manifest remains pinned even when an unchanged object is
    /// reused from an earlier, already verified publication.
    pub generation: String,
    pub object_generation: String,
    pub artifact: Artifact,
    pub encoding: Encoding,
    pub transfer_bytes: u64,
    pub transfer_sha256: String,
}

impl DownloadDescriptor {
    pub fn identity(manifest: &Manifest, kind: ArtifactKind, key: &str) -> Result<Self> {
        manifest.validate()?;
        let artifact = manifest.artifact(kind, key)?.clone();
        let result = Self {
            generation: manifest.generation.clone(),
            object_generation: manifest.generation.clone(),
            transfer_bytes: artifact.size_bytes,
            transfer_sha256: artifact.sha256.clone(),
            artifact,
            encoding: Encoding::Identity,
        };
        result.validate()?;
        Ok(result)
    }

    pub fn validate(&self) -> Result<()> {
        self.artifact.validate()?;
        if !canonical_uuid(&self.generation)
            || !canonical_uuid(&self.object_generation)
            || !hash_text(&self.transfer_sha256)
        {
            return Err(CacheError::InvalidManifest);
        }
        if self.transfer_bytes == 0 || self.transfer_bytes > MAX_TRANSFER_BYTES {
            return Err(CacheError::Limit);
        }
        if self.encoding == Encoding::Identity
            && (self.transfer_bytes != self.artifact.size_bytes
                || self.transfer_sha256 != self.artifact.sha256)
        {
            return Err(CacheError::InvalidManifest);
        }
        Ok(())
    }

    pub fn object_path(&self) -> Result<String> {
        self.validate()?;
        Ok(format!(
            "public-cache/v1/{}/{}{}",
            self.object_generation,
            self.artifact.file_name,
            if self.encoding == Encoding::Gzip {
                ".gz"
            } else {
                ""
            }
        ))
    }
}

static LEASES: OnceLock<Arc<Semaphore>> = OnceLock::new();
static INITIALIZED_ROOTS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();

pub struct PublicCacheLoader {
    root: PathBuf,
    leases: Arc<Semaphore>,
}

impl PublicCacheLoader {
    /// Construct once at process startup, before accepting requests. This root
    /// belongs exclusively to this single server process, never another worker.
    pub fn new(root: PathBuf) -> Result<Self> {
        if !root.is_absolute() {
            return Err(CacheError::Configuration);
        }
        for ancestor in root.ancestors() {
            match ancestor.symlink_metadata() {
                Ok(metadata) if metadata.file_type().is_symlink() => {
                    return Err(CacheError::Configuration);
                }
                Ok(_) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err(CacheError::Unavailable),
            }
        }
        std::fs::create_dir_all(&root).map_err(|_| CacheError::Unavailable)?;
        if std::fs::symlink_metadata(&root)
            .map_err(|_| CacheError::Unavailable)?
            .file_type()
            .is_symlink()
        {
            return Err(CacheError::Configuration);
        }
        let root = root.canonicalize().map_err(|_| CacheError::Unavailable)?;
        let mut initialized = INITIALIZED_ROOTS
            .get_or_init(|| Mutex::new(HashSet::new()))
            .lock()
            .map_err(|_| CacheError::Unavailable)?;
        if initialized.contains(&root) {
            return Err(CacheError::Configuration);
        }
        cleanup_startup_residue(&root)?;
        initialized.insert(root.clone());
        Ok(Self {
            root,
            leases: LEASES
                .get_or_init(|| Arc::new(Semaphore::new(MAX_PARALLEL_LEASES)))
                .clone(),
        })
    }

    /// A stream adapter enables deterministic tests without Blob credentials.
    /// Cancellation closes the writer channel; its lease lives until I/O ends.
    pub async fn load_stream<S>(
        &self,
        descriptor: &DownloadDescriptor,
        stream: S,
    ) -> Result<LoadedShard>
    where
        S: Stream<Item = Result<Vec<u8>>>,
    {
        descriptor.validate()?;
        tokio::time::timeout(LOAD_TIMEOUT, self.load_inner(descriptor.clone(), stream))
            .await
            .map_err(|_| CacheError::Unavailable)?
    }

    async fn load_inner<S>(&self, descriptor: DownloadDescriptor, stream: S) -> Result<LoadedShard>
    where
        S: Stream<Item = Result<Vec<u8>>>,
    {
        let permit = self
            .leases
            .clone()
            .try_acquire_owned()
            .map_err(|_| CacheError::Busy)?;
        let path = self.root.join(format!("request-{}", Uuid::new_v4()));
        std::fs::create_dir(&path).map_err(|_| CacheError::Unavailable)?;
        let lease = Arc::new(TempLease {
            path,
            permit: Some(permit),
        });
        let (send, receive) = mpsc::channel::<WriteMessage>(2);
        let writer_lease = Arc::clone(&lease);
        let writer_descriptor = descriptor.clone();
        let writer = tokio::task::spawn_blocking(move || {
            write_package(writer_lease, &writer_descriptor, receive)
        });
        futures_util::pin_mut!(stream);
        let transfer = async {
            let mut received = 0_u64;
            while let Some(chunk) = stream.next().await {
                let chunk = chunk?;
                received = received
                    .checked_add(chunk.len() as u64)
                    .ok_or(CacheError::Limit)?;
                if received > descriptor.transfer_bytes {
                    return Err(CacheError::Limit);
                }
                send.send(WriteMessage::Data(chunk))
                    .await
                    .map_err(|_| CacheError::Integrity)?;
            }
            if received != descriptor.transfer_bytes {
                return Err(CacheError::Integrity);
            }
            send.send(WriteMessage::Finish)
                .await
                .map_err(|_| CacheError::Integrity)
        }
        .await;
        drop(send);
        let written = writer.await.map_err(|_| CacheError::Unavailable)?;
        transfer?;
        written?;
        // If the caller disconnects during SQLite opening, this bounded task
        // completes and drops its result, closing the pool before deleting files.
        tokio::spawn(async move {
            let options = SqliteConnectOptions::new()
                .filename(lease.path.join("data.sqlite"))
                .read_only(true)
                .immutable(true)
                .create_if_missing(false)
                .pragma("query_only", "ON")
                .pragma("trusted_schema", "OFF")
                .pragma("cache_size", "-8192")
                .disable_statement_logging();
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .acquire_timeout(Duration::from_secs(5))
                .connect_with(options)
                .await
                .map_err(|_| CacheError::Integrity)?;
            let shard = LoadedShard {
                pool: Some(pool),
                lease: Some(lease),
                artifact: descriptor.artifact,
            };
            if let Err(error) = validate_database(shard.pool(), &shard.artifact).await {
                shard.close().await;
                return Err(error);
            }
            Ok(shard)
        })
        .await
        .map_err(|_| CacheError::Unavailable)?
    }
}

fn cleanup_startup_residue(root: &std::path::Path) -> Result<()> {
    let mut directories = Vec::new();
    // Validate the entire inventory first. Unknown content means no deletion.
    for entry in std::fs::read_dir(root).map_err(|_| CacheError::Unavailable)? {
        let entry = entry.map_err(|_| CacheError::Unavailable)?;
        let name = entry.file_name();
        let valid_name = name
            .to_str()
            .and_then(|name| name.strip_prefix("request-"))
            .is_some_and(canonical_uuid);
        let kind = entry.file_type().map_err(|_| CacheError::Unavailable)?;
        if !valid_name || kind.is_symlink() || !kind.is_dir() {
            return Err(CacheError::Configuration);
        }
        let directory = entry
            .path()
            .canonicalize()
            .map_err(|_| CacheError::Unavailable)?;
        if directory.parent() != Some(root) {
            return Err(CacheError::Configuration);
        }
        let mut files = Vec::new();
        for file in std::fs::read_dir(&directory).map_err(|_| CacheError::Unavailable)? {
            let file = file.map_err(|_| CacheError::Unavailable)?;
            let metadata = file
                .path()
                .symlink_metadata()
                .map_err(|_| CacheError::Unavailable)?;
            let name = file.file_name();
            let max_size = match name.to_str() {
                Some("download") => MAX_TRANSFER_BYTES,
                Some("data.sqlite") => MAX_SQLITE_BYTES,
                _ => return Err(CacheError::Configuration),
            };
            if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > max_size
            {
                return Err(CacheError::Configuration);
            }
            let path = file
                .path()
                .canonicalize()
                .map_err(|_| CacheError::Unavailable)?;
            if path.parent() != Some(directory.as_path()) {
                return Err(CacheError::Configuration);
            }
            files.push(path);
        }
        directories.push((directory, files));
    }
    for (directory, files) in directories {
        for file in files {
            // Each resolved absolute path was checked to stay in its owned UUID
            // directory. No recursive delete or arbitrary target is performed.
            if directory
                .canonicalize()
                .map_err(|_| CacheError::Unavailable)?
                .parent()
                != Some(root)
                || file
                    .symlink_metadata()
                    .map_err(|_| CacheError::Unavailable)?
                    .file_type()
                    .is_symlink()
                || file
                    .canonicalize()
                    .map_err(|_| CacheError::Unavailable)?
                    .parent()
                    != Some(directory.as_path())
            {
                return Err(CacheError::Configuration);
            }
            std::fs::remove_file(file).map_err(|_| CacheError::Unavailable)?;
        }
        std::fs::remove_dir(directory).map_err(|_| CacheError::Unavailable)?;
    }
    Ok(())
}

enum WriteMessage {
    Data(Vec<u8>),
    Finish,
}

struct TempLease {
    path: PathBuf,
    permit: Option<OwnedSemaphorePermit>,
}

impl TempLease {
    fn cleanup(&self) -> bool {
        // Delete only our fixed filenames and then the empty UUID directory.
        // Never recursively delete a configured root or arbitrary database path.
        for name in ["download", "data.sqlite"] {
            let _ = std::fs::remove_file(self.path.join(name));
        }
        let _ = std::fs::remove_dir(&self.path);
        matches!(self.path.symlink_metadata(), Err(error) if error.kind() == std::io::ErrorKind::NotFound)
    }
}

impl Drop for TempLease {
    fn drop(&mut self) {
        if !self.cleanup() {
            // A locked leftover still consumes disk. Keep its capacity reserved
            // until process restart and the verified startup cleanup.
            if let Some(permit) = self.permit.take() {
                permit.forget();
            }
        }
    }
}

async fn close_pool(pool: SqlitePool, lease: Option<Arc<TempLease>>) {
    pool.close().await;
    drop(pool);
    if let Some(lease) = lease {
        // SQLite's worker can release its final Windows handle just after pool
        // closure. Retain the disk permit throughout the bounded cleanup retry.
        for _ in 0..20 {
            if lease.cleanup() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        drop(lease);
    }
}

fn write_package(
    lease: Arc<TempLease>,
    descriptor: &DownloadDescriptor,
    mut receive: mpsc::Receiver<WriteMessage>,
) -> Result<()> {
    let path = lease.path.join("download");
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|_| CacheError::Unavailable)?;
    let mut hash = Sha256::new();
    let mut received = 0_u64;
    loop {
        match receive.blocking_recv() {
            Some(WriteMessage::Data(chunk)) => {
                received = received
                    .checked_add(chunk.len() as u64)
                    .ok_or(CacheError::Limit)?;
                if received > descriptor.transfer_bytes {
                    return Err(CacheError::Limit);
                }
                file.write_all(&chunk)
                    .map_err(|_| CacheError::Unavailable)?;
                hash.update(&chunk);
            }
            Some(WriteMessage::Finish) => break,
            None => return Err(CacheError::Unavailable),
        }
    }
    file.flush().map_err(|_| CacheError::Unavailable)?;
    drop(file);
    if received != descriptor.transfer_bytes
        || lowercase_hex(&hash.finalize()) != descriptor.transfer_sha256
    {
        return Err(CacheError::Integrity);
    }
    let output = lease.path.join("data.sqlite");
    match descriptor.encoding {
        Encoding::Identity => {
            std::fs::rename(&path, &output).map_err(|_| CacheError::Unavailable)?
        }
        Encoding::Gzip => {
            let source = File::open(&path).map_err(|_| CacheError::Unavailable)?;
            let mut decoder = flate2::bufread::GzDecoder::new(BufReader::new(source));
            let mut target = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&output)
                .map_err(|_| CacheError::Unavailable)?;
            let mut bytes = [0_u8; 64 * 1024];
            let mut size = 0_u64;
            let mut raw_hash = Sha256::new();
            loop {
                let count = decoder
                    .read(&mut bytes)
                    .map_err(|_| CacheError::Integrity)?;
                if count == 0 {
                    break;
                }
                size = size.checked_add(count as u64).ok_or(CacheError::Limit)?;
                if size > descriptor.artifact.size_bytes || size > MAX_SQLITE_BYTES {
                    return Err(CacheError::Limit);
                }
                target
                    .write_all(&bytes[..count])
                    .map_err(|_| CacheError::Unavailable)?;
                raw_hash.update(&bytes[..count]);
            }
            if size != descriptor.artifact.size_bytes
                || lowercase_hex(&raw_hash.finalize()) != descriptor.artifact.sha256
                || !decoder
                    .into_inner()
                    .fill_buf()
                    .map_err(|_| CacheError::Integrity)?
                    .is_empty()
            {
                return Err(CacheError::Integrity);
            }
            target.flush().map_err(|_| CacheError::Unavailable)?;
            drop(target);
            std::fs::remove_file(&path).map_err(|_| CacheError::Unavailable)?;
        }
    }
    let mut header = [0_u8; 20];
    File::open(output)
        .and_then(|mut file| file.read_exact(&mut header))
        .map_err(|_| CacheError::Integrity)?;
    // Exported packages are closed DELETE-journal snapshots; immutable readers
    // must never ignore an omitted WAL belonging to a different snapshot.
    if &header[..16] != b"SQLite format 3\0" || header[18] != 1 || header[19] != 1 {
        return Err(CacheError::Integrity);
    }
    Ok(())
}

pub struct LoadedShard {
    pool: Option<SqlitePool>,
    lease: Option<Arc<TempLease>>,
    pub artifact: Artifact,
}

impl LoadedShard {
    pub fn pool(&self) -> &SqlitePool {
        self.pool.as_ref().expect("live cache lease")
    }

    /// Copy only a verified public package into a fresh, trusted scratch path.
    /// The original lease and read-only pool remain unchanged. Callers performing
    /// updates own the destination's lifetime and must use a blocking worker.
    pub(crate) fn copy_sqlite_to_new_file(&self, destination: &std::path::Path) -> Result<()> {
        if !destination.is_absolute() {
            return Err(CacheError::Configuration);
        }
        for ancestor in destination.ancestors().skip(1) {
            let metadata = ancestor
                .symlink_metadata()
                .map_err(|_| CacheError::Configuration)?;
            if !metadata.is_dir() || metadata.file_type().is_symlink() {
                return Err(CacheError::Configuration);
            }
        }
        let mut source = File::open(self.directory().join("data.sqlite"))
            .map_err(|_| CacheError::Unavailable)?;
        let mut target = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination)
            .map_err(|_| CacheError::Unavailable)?;
        let mut hash = Sha256::new();
        let mut count = 0_u64;
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let size = source
                .read(&mut buffer)
                .map_err(|_| CacheError::Unavailable)?;
            if size == 0 {
                break;
            }
            count = count.checked_add(size as u64).ok_or(CacheError::Limit)?;
            if count > self.artifact.size_bytes {
                return Err(CacheError::Integrity);
            }
            hash.update(&buffer[..size]);
            target
                .write_all(&buffer[..size])
                .map_err(|_| CacheError::Unavailable)?;
        }
        if count != self.artifact.size_bytes
            || lowercase_hex(&hash.finalize()) != self.artifact.sha256
        {
            return Err(CacheError::Integrity);
        }
        target.sync_all().map_err(|_| CacheError::Unavailable)?;
        Ok(())
    }

    pub async fn close(mut self) {
        if let Some(pool) = self.pool.take() {
            let lease = self.lease.take();
            // Keep both resources owned by cleanup before awaiting: cancelling
            // this future must not release the disk lease ahead of SQLite.
            let _ = tokio::spawn(close_pool(pool, lease)).await;
        }
    }

    pub(super) fn directory(&self) -> &std::path::Path {
        &self.lease.as_ref().unwrap().path
    }
}

impl Drop for LoadedShard {
    fn drop(&mut self) {
        if let Some(pool) = self.pool.take() {
            let lease = self.lease.take();
            if let Ok(runtime) = tokio::runtime::Handle::try_current() {
                runtime.spawn(close_pool(pool, lease));
            } else {
                // Explicit close is preferred. Outside a runtime, give SQLite's
                // worker a fresh runtime so Windows handles close before cleanup.
                std::thread::spawn(move || {
                    if let Ok(runtime) = tokio::runtime::Builder::new_current_thread()
                        .enable_all()
                        .build()
                    {
                        runtime.block_on(close_pool(pool, lease));
                    } else {
                        drop(pool);
                        drop(lease);
                    }
                });
            }
        }
    }
}

type Columns = &'static [(&'static str, &'static str)];
const RATE_EVENTS: Columns = &[
    ("currency", "TEXT"),
    ("provider_type", "TEXT"),
    ("released_at", "TEXT"),
    ("actual_value", "TEXT"),
    ("forecast_value", "TEXT"),
    ("source_url", "TEXT"),
    ("updated_at", "TEXT"),
    ("canonical_key", "TEXT"),
    ("mapping_status", "TEXT"),
];
const RATE_RUNS: Columns = &[
    ("started_at", "TEXT"),
    ("completed_at", "TEXT"),
    ("status", "TEXT"),
    ("error_message", "TEXT"),
];
const INSTRUMENTS: Columns = &[
    ("provider", "TEXT"),
    ("provider_symbol", "TEXT"),
    ("display_symbol", "TEXT"),
    ("category", "TEXT"),
    ("description", "TEXT"),
    ("base_currency", "TEXT"),
    ("quote_currency", "TEXT"),
    ("native_timezone", "TEXT"),
];
const PROFILES: Columns = &[
    ("provider", "TEXT"),
    ("provider_symbol", "TEXT"),
    ("calculated_at", "TEXT"),
    ("complete_years", "INTEGER"),
    ("quality_status", "TEXT"),
    ("missing_days", "INTEGER"),
    ("profile_json", "TEXT"),
];
const SEASONAL_RUNS: Columns = &[
    ("provider", "TEXT"),
    ("started_at", "TEXT"),
    ("completed_at", "TEXT"),
    ("status", "TEXT"),
    ("error_message", "TEXT"),
];
const CANDLES: Columns = &[
    ("provider", "TEXT"),
    ("provider_symbol", "TEXT"),
    ("candle_time", "INTEGER"),
    ("mid_close", "REAL"),
];

fn tables(kind: ArtifactKind) -> Vec<(&'static str, Columns)> {
    match kind {
        ArtifactKind::Rates => vec![
            ("eodhd_events", RATE_EVENTS),
            ("eodhd_sync_runs", RATE_RUNS),
        ],
        ArtifactKind::SeasonalityIndex => vec![
            ("seasonality_provider_instruments", INSTRUMENTS),
            ("seasonality_provider_profiles", PROFILES),
            ("seasonality_provider_sync_runs", SEASONAL_RUNS),
        ],
        ArtifactKind::SeasonalitySymbol => vec![
            ("seasonality_provider_instruments", INSTRUMENTS),
            ("seasonality_provider_profiles", PROFILES),
            ("seasonality_provider_daily_candles", CANDLES),
        ],
        _ => vec![],
    }
}

fn primary_key(table: &str) -> &'static [&'static str] {
    match table {
        "seasonality_provider_instruments" | "seasonality_provider_profiles" => {
            &["provider", "provider_symbol"]
        }
        "seasonality_provider_daily_candles" => &["provider", "provider_symbol", "candle_time"],
        _ => &[],
    }
}

fn normalized_ddl(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_ascii_whitespace() && *character != '"')
        .flat_map(char::to_uppercase)
        .collect()
}

fn expected_ddl(table: &str, columns: Columns) -> String {
    let mut fields = columns
        .iter()
        .map(|(name, kind)| format!("{name} {kind}"))
        .collect::<Vec<_>>();
    let key = primary_key(table);
    if !key.is_empty() {
        fields.push(format!("PRIMARY KEY({})", key.join(",")));
    }
    normalized_ddl(&format!(
        "CREATE TABLE {table} ({}) STRICT",
        fields.join(",")
    ))
}

fn valid_cardinality(kind: ArtifactKind, table: &str, count: i64) -> bool {
    match table {
        "eodhd_events" => (0..=10_000).contains(&count),
        "eodhd_sync_runs" | "seasonality_provider_sync_runs" => (0..=2).contains(&count),
        "seasonality_provider_daily_candles" => (1..=100_000).contains(&count),
        "seasonality_provider_instruments" | "seasonality_provider_profiles" => {
            if kind == ArtifactKind::SeasonalitySymbol {
                count == 1
            } else {
                (0..=10_000).contains(&count)
            }
        }
        _ => false,
    }
}

async fn validate_database(pool: &SqlitePool, artifact: &Artifact) -> Result<()> {
    if !matches!(
        artifact.kind,
        ArtifactKind::Rates | ArtifactKind::SeasonalityIndex | ArtifactKind::SeasonalitySymbol
    ) {
        return super::schema::validate_database(pool, artifact).await;
    }
    let schema: Vec<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT name,type,sql FROM sqlite_schema WHERE NOT(type='index' AND name GLOB 'sqlite_autoindex_*') ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .map_err(|_| CacheError::Schema)?;
    let mut expected = tables(artifact.kind);
    expected.sort_by_key(|(name, _)| *name);
    if schema.len() != expected.len()
        || schema
            .iter()
            .zip(&expected)
            .any(|((name, kind, ddl), (expected, columns))| {
                name != expected
                    || kind != "table"
                    || ddl.as_ref().map(|value| normalized_ddl(value))
                        != Some(expected_ddl(expected, columns))
            })
    {
        return Err(CacheError::Schema);
    }
    let mut rows = 0_u64;
    for (table, columns) in expected {
        let actual: Vec<(String, String, i64)> =
            sqlx::query_as("SELECT name,type,hidden FROM pragma_table_xinfo(?) ORDER BY cid")
                .bind(table)
                .fetch_all(pool)
                .await
                .map_err(|_| CacheError::Schema)?;
        let strict: Option<i64> = sqlx::query_scalar(
            "SELECT strict FROM pragma_table_list WHERE schema='main' AND name=? AND type='table'",
        )
        .bind(table)
        .fetch_optional(pool)
        .await
        .map_err(|_| CacheError::Schema)?;
        if strict != Some(1)
            || actual.len() != columns.len()
            || actual
                .iter()
                .zip(columns)
                .any(|((name, kind, hidden), (wanted, wanted_type))| {
                    name != wanted || kind != wanted_type || *hidden != 0
                })
        {
            return Err(CacheError::Schema);
        }
        // Table names are compile-time constants above, never caller input.
        let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM \"{table}\""))
            .fetch_one(pool)
            .await
            .map_err(|_| CacheError::Integrity)?;
        if !valid_cardinality(artifact.kind, table, count) {
            return Err(CacheError::Integrity);
        }
        rows = rows
            .checked_add(count.try_into().map_err(|_| CacheError::Integrity)?)
            .ok_or(CacheError::Limit)?;
    }
    if rows != artifact.rows {
        return Err(CacheError::Integrity);
    }
    let check: String = sqlx::query_scalar("PRAGMA quick_check(1)")
        .fetch_one(pool)
        .await
        .map_err(|_| CacheError::Integrity)?;
    if check != "ok" {
        return Err(CacheError::Integrity);
    }
    if artifact.kind != ArtifactKind::Rates {
        for table in tables(artifact.kind).iter().map(|(table, _)| table) {
            let mismatches: i64 = sqlx::query_scalar(&format!(
                "SELECT COUNT(*) FROM \"{table}\" WHERE provider IS NOT 'eodhd'"
            ))
            .fetch_one(pool)
            .await
            .map_err(|_| CacheError::Integrity)?;
            if mismatches != 0 {
                return Err(CacheError::Integrity);
            }
        }
        let missing_instruments: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM seasonality_provider_profiles p WHERE NOT EXISTS(SELECT 1 FROM seasonality_provider_instruments i WHERE i.provider=p.provider AND i.provider_symbol=p.provider_symbol)")
            .fetch_one(pool).await.map_err(|_| CacheError::Integrity)?;
        if missing_instruments != 0 {
            return Err(CacheError::Integrity);
        }
    }
    if artifact.kind == ArtifactKind::SeasonalityIndex {
        let instruments: Vec<(String, String)> = sqlx::query_as(
            "SELECT provider_symbol,display_symbol FROM seasonality_provider_instruments",
        )
        .fetch_all(pool)
        .await
        .map_err(|_| CacheError::Integrity)?;
        let mut aliases = HashMap::<String, String>::new();
        for (provider, display) in instruments {
            for alias in [&provider, &display] {
                // Native lookup uses SQLite lower(), whose default folding is
                // ASCII. Provider and display names share one lookup namespace.
                let alias = alias.to_ascii_lowercase();
                if aliases
                    .get(&alias)
                    .is_some_and(|existing| existing != &provider)
                {
                    return Err(CacheError::Integrity);
                }
                aliases.insert(alias, provider.clone());
            }
        }
    }
    if artifact.kind == ArtifactKind::SeasonalitySymbol {
        let expected_symbol = artifact
            .key
            .strip_prefix("eodhd:")
            .ok_or(CacheError::InvalidManifest)?;
        for table in [
            "seasonality_provider_instruments",
            "seasonality_provider_profiles",
            "seasonality_provider_daily_candles",
        ] {
            let mismatches: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM \"{table}\" WHERE provider IS NOT 'eodhd' OR provider_symbol IS NOT ?"))
                .bind(expected_symbol).fetch_one(pool).await.map_err(|_| CacheError::Integrity)?;
            if mismatches != 0 {
                return Err(CacheError::Integrity);
            }
        }
    }
    Ok(())
}

/// No browser-controlled URL, no redirects, and no credentials in Debug/errors.
/// The current deployment does not configure this reader or expose commands.
pub struct PrivateBlobReader {
    origin: reqwest::Url,
    token: String,
    client: reqwest::Client,
}

impl PrivateBlobReader {
    pub fn new(origin: &str, token: String) -> Result<Self> {
        let origin = reqwest::Url::parse(origin).map_err(|_| CacheError::Configuration)?;
        let store = origin
            .host_str()
            .and_then(|host| host.strip_suffix(".private.blob.vercel-storage.com"));
        if origin.scheme() != "https"
            || !origin.username().is_empty()
            || origin.password().is_some()
            || origin.port().is_some_and(|port| port != 443)
            || origin.path() != "/"
            || origin.query().is_some()
            || origin.fragment().is_some()
            || !store.is_some_and(|store| {
                !store.is_empty()
                    && store.len() <= 80
                    && store
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || c == b'-')
            })
            || token.is_empty()
            || token.len() > 4096
            || token.bytes().any(|byte| byte.is_ascii_control())
        {
            return Err(CacheError::Configuration);
        }
        let client = reqwest::Client::builder()
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .timeout(LOAD_TIMEOUT)
            .build()
            .map_err(|_| CacheError::Configuration)?;
        Ok(Self {
            origin,
            token,
            client,
        })
    }

    pub async fn load(
        &self,
        loader: &PublicCacheLoader,
        descriptor: &DownloadDescriptor,
    ) -> Result<LoadedShard> {
        let url = self.object_url(descriptor)?;
        let response = self
            .client
            .get(url)
            .bearer_auth(&self.token)
            .header("Accept-Encoding", "identity")
            .send()
            .await
            .map_err(|_| CacheError::Unavailable)?;
        if response.status() != reqwest::StatusCode::OK {
            return Err(CacheError::Unavailable);
        }
        if let Some(size) = response.headers().get("content-length")
            && size
                .to_str()
                .ok()
                .and_then(|value| value.parse::<u64>().ok())
                != Some(descriptor.transfer_bytes)
        {
            return Err(CacheError::Integrity);
        }
        if response
            .headers()
            .get("content-encoding")
            .is_some_and(|encoding| encoding != "identity")
        {
            return Err(CacheError::Integrity);
        }
        let stream = futures_util::stream::try_unfold(response, |mut response| async {
            match response
                .chunk()
                .await
                .map_err(|_| CacheError::Unavailable)?
            {
                Some(chunk) if chunk.len() as u64 <= MAX_TRANSFER_BYTES => {
                    Ok(Some((chunk.to_vec(), response)))
                }
                Some(_) => Err(CacheError::Limit),
                None => Ok(None),
            }
        });
        loader.load_stream(descriptor, stream).await
    }

    pub(super) fn object_url(&self, descriptor: &DownloadDescriptor) -> Result<reqwest::Url> {
        let mut url = self
            .origin
            .join(&descriptor.object_path()?)
            .map_err(|_| CacheError::InvalidManifest)?;
        // Same no-cache download semantics as the private Blob SDK adapter.
        url.query_pairs_mut().append_pair("cache", "0");
        Ok(url)
    }
}
