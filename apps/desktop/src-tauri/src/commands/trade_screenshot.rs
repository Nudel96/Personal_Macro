//! Local screenshot OCR and atomic trade/media creation. Images never leave this process.
use std::{io::Write, path::Path};

use crate::runtime::State;
use base64::{Engine, engine::general_purpose::STANDARD};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{
    commands::journal_scope::require_active_account,
    database::AppState,
    domain::models::{TradeDetail, TradeInput},
    errors::{AppError, CommandError, CommandResult},
    repositories::trades,
};

const MAX_IMAGE_BYTES: usize = 12 * 1024 * 1024;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeScreenshotInput {
    pub filename: String,
    pub base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotWord {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotLine {
    pub text: String,
    pub words: Vec<ScreenshotWord>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeScreenshotAnalysis {
    pub width: u32,
    pub height: u32,
    pub language: String,
    pub lines: Vec<ScreenshotLine>,
}

fn decode_image(input: &TradeScreenshotInput) -> CommandResult<(Vec<u8>, &'static str)> {
    if input.base64.len() > MAX_IMAGE_BYTES.div_ceil(3) * 4 {
        return Err(CommandError::validation(
            "Der Screenshot darf höchstens 12 MB groß sein.",
        ));
    }
    let bytes = STANDARD
        .decode(&input.base64)
        .map_err(|_| CommandError::validation("Die Bilddaten sind ungültig."))?;
    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
        return Err(CommandError::validation(
            "Der Screenshot ist leer oder größer als 12 MB.",
        ));
    }
    let extension = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "png"
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        "jpg"
    } else {
        return Err(CommandError::validation(
            "Bitte einen PNG- oder JPEG-Screenshot verwenden.",
        ));
    };
    Ok((bytes, extension))
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn analyze_trade_screenshot(
    input: TradeScreenshotInput,
) -> CommandResult<TradeScreenshotAnalysis> {
    let (bytes, _) = decode_image(&input)?;
    crate::runtime::spawn_blocking(move || inspect_image(&bytes, true))
        .await
        .map_err(|_| {
            CommandError::validation("Die lokale Bilderkennung konnte nicht abgeschlossen werden.")
        })?
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn create_trade_with_screenshot(
    state: State<'_, AppState>,
    mut input: TradeInput,
    screenshot: TradeScreenshotInput,
) -> CommandResult<TradeDetail> {
    input.account_id = input.account_id.trim().to_owned();
    require_active_account(&state.db, &input.account_id).await?;
    let (bytes, extension) = decode_image(&screenshot)?;
    let (bytes, dimensions) = crate::runtime::spawn_blocking(move || {
        let dimensions = inspect_image(&bytes, false)?;
        Ok::<_, CommandError>((bytes, dimensions))
    })
    .await
    .map_err(|_| CommandError::validation("Der Screenshot konnte nicht geprüft werden."))??;
    save_with_screenshot(
        &state.db,
        &state.paths.root,
        input,
        &screenshot.filename,
        &bytes,
        extension,
        &dimensions,
    )
    .await
}

// The file is written before the transaction. On a failed transaction it can remain
// unreferenced, but a trade can never commit without its media record and association.
// Do not delete a content-addressed file on rollback: another trade may already use it.
async fn save_with_screenshot(
    db: &SqlitePool,
    root: &Path,
    input: TradeInput,
    filename: &str,
    bytes: &[u8],
    extension: &str,
    dimensions: &TradeScreenshotAnalysis,
) -> CommandResult<TradeDetail> {
    require_active_account(db, &input.account_id).await?;
    let sha256 = Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let relative_path = format!("media/trades/{sha256}.{extension}");
    let destination = root.join(&relative_path);
    std::fs::create_dir_all(root.join("media/trades")).map_err(AppError::from)?;
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&destination)
    {
        Ok(mut file) => {
            file.write_all(bytes).map_err(AppError::from)?;
            file.sync_all().map_err(AppError::from)?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            if std::fs::read(&destination).map_err(AppError::from)? != bytes {
                return Err(CommandError::validation(
                    "Eine bestehende Bilddatei ist beschädigt. Bitte die Medien prüfen.",
                ));
            }
        }
        Err(error) => return Err(AppError::from(error).into()),
    }
    let mut transaction = db.begin().await?;
    let active: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM accounts WHERE id = ? AND is_archived = 0)",
    )
    .bind(&input.account_id)
    .fetch_one(&mut *transaction)
    .await?;
    if !active {
        return Err(CommandError::validation(
            "Bitte ein aktives Journal-Konto auswählen.",
        ));
    }
    let trade = trades::create_on_connection(&mut transaction, input).await?;
    let existing: Option<String> =
        sqlx::query_scalar("SELECT id FROM media_files WHERE sha256 = ? LIMIT 1")
            .bind(&sha256)
            .fetch_optional(&mut *transaction)
            .await?;
    let media_id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());
    let filename = filename
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("TradingView.png")
        .chars()
        .filter(|character| !character.is_control())
        .take(160)
        .collect::<String>();
    sqlx::query("INSERT OR IGNORE INTO media_files (id, relative_path, original_filename, mime_type, size_bytes, sha256, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&media_id).bind(&relative_path).bind(filename)
        .bind(if extension == "png" { "image/png" } else { "image/jpeg" })
        .bind(bytes.len() as i64).bind(&sha256).bind(dimensions.width).bind(dimensions.height)
        .bind(Utc::now().to_rfc3339()).execute(&mut *transaction).await?;
    sqlx::query("INSERT INTO trade_media (trade_id, media_id, slot, caption, sort_order) VALUES (?, ?, 'other', 'Screenshot bei der Trade-Erfassung', 0)")
        .bind(&trade.id).bind(&media_id).execute(&mut *transaction).await?;
    transaction.commit().await?;
    Ok(trade)
}

#[cfg(not(windows))]
fn inspect_image(_: &[u8], _: bool) -> CommandResult<TradeScreenshotAnalysis> {
    Err(CommandError {
        code: "WINDOWS_REQUIRED".into(),
        message: "Die lokale Screenshot-Erkennung benötigt Windows 10 oder 11.".into(),
        details: None,
    })
}

#[cfg(windows)]
fn inspect_image(bytes: &[u8], recognize: bool) -> CommandResult<TradeScreenshotAnalysis> {
    use windows::{
        Globalization::Language,
        Graphics::Imaging::{
            BitmapAlphaMode, BitmapDecoder, BitmapPixelFormat, BitmapTransform,
            ColorManagementMode, ExifOrientationMode,
        },
        Media::Ocr::OcrEngine,
        Storage::Streams::{DataWriter, InMemoryRandomAccessStream},
        Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize},
        core::HSTRING,
    };
    fn image_error(_: windows::core::Error) -> CommandError {
        CommandError::validation(
            "Das Bild konnte lokal nicht gelesen werden. Bitte als PNG oder JPEG erneut exportieren.",
        )
    }
    // This function runs on a worker thread; balance the apartment initialization
    // on every return path, after all WinRT objects have been dropped.
    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.map_err(image_error)?;
    struct Apartment;
    impl Drop for Apartment {
        fn drop(&mut self) {
            unsafe { RoUninitialize() };
        }
    }
    let _apartment = Apartment;
    let stream = InMemoryRandomAccessStream::new().map_err(image_error)?;
    let writer = DataWriter::CreateDataWriter(&stream).map_err(image_error)?;
    writer.WriteBytes(bytes).map_err(image_error)?;
    writer
        .StoreAsync()
        .map_err(image_error)?
        .get()
        .map_err(image_error)?;
    writer.DetachStream().map_err(image_error)?;
    stream.Seek(0).map_err(image_error)?;
    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(image_error)?
        .get()
        .map_err(image_error)?;
    let width = decoder.PixelWidth().map_err(image_error)?;
    let height = decoder.PixelHeight().map_err(image_error)?;
    if width == 0
        || height == 0
        || width > 8192
        || height > 8192
        || u64::from(width) * u64::from(height) > 32_000_000
    {
        return Err(CommandError::validation(
            "Bitte den Screenshot auf höchstens 8192 Pixel je Seite und 32 Megapixel zuschneiden.",
        ));
    }
    let max_dimension = if recognize {
        OcrEngine::MaxImageDimension().map_err(image_error)?
    } else {
        4096
    };
    let scale = (max_dimension as f32 / width.max(height) as f32).min(2.0);
    let transform = BitmapTransform::new().map_err(image_error)?;
    transform
        .SetScaledWidth((width as f32 * scale).round() as u32)
        .map_err(image_error)?;
    transform
        .SetScaledHeight((height as f32 * scale).round() as u32)
        .map_err(image_error)?;
    let bitmap = decoder
        .GetSoftwareBitmapTransformedAsync(
            BitmapPixelFormat::Bgra8,
            BitmapAlphaMode::Ignore,
            &transform,
            ExifOrientationMode::IgnoreExifOrientation,
            ColorManagementMode::DoNotColorManage,
        )
        .map_err(image_error)?
        .get()
        .map_err(image_error)?;
    let mut analysis = TradeScreenshotAnalysis {
        width,
        height,
        language: String::new(),
        lines: Vec::new(),
    };
    if !recognize {
        return Ok(analysis);
    }
    let engine = ["en-US", "de-DE"].into_iter().find_map(|tag| {
        let language = Language::CreateLanguage(&HSTRING::from(tag)).ok()?;
        OcrEngine::TryCreateFromLanguage(&language).ok()
    }).or_else(|| OcrEngine::TryCreateFromUserProfileLanguages().ok())
        .ok_or_else(|| CommandError { code: "OCR_LANGUAGE_MISSING".into(), message: "Windows-Texterkennung ist nicht verfügbar. Bitte in den Windows-Spracheinstellungen das Sprachpaket Deutsch oder Englisch mit Texterkennung installieren.".into(), details: None })?;
    analysis.language = engine
        .RecognizerLanguage()
        .map_err(image_error)?
        .LanguageTag()
        .map_err(image_error)?
        .to_string();
    let result = engine
        .RecognizeAsync(&bitmap)
        .map_err(image_error)?
        .get()
        .map_err(image_error)?;
    for line in result.Lines().map_err(image_error)? {
        let mut words = Vec::new();
        for word in line.Words().map_err(image_error)? {
            let bounds = word.BoundingRect().map_err(image_error)?;
            words.push(ScreenshotWord {
                text: word.Text().map_err(image_error)?.to_string(),
                x: bounds.X / scale,
                y: bounds.Y / scale,
                width: bounds.Width / scale,
                height: bounds.Height / scale,
            });
        }
        analysis.lines.push(ScreenshotLine {
            text: line.Text().map_err(image_error)?.to_string(),
            words,
        });
    }
    Ok(analysis)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    const TICKET: &[u8] = include_bytes!("../../tests/fixtures/trade-ticket.png");

    fn input(id: &str, account_id: &str) -> TradeInput {
        serde_json::from_value(serde_json::json!({
            "id": id, "accountId": account_id, "instrument": "EURUSD",
            "status": "open", "direction": "long", "actualEntry": "1.0845",
            "initialStopLoss": "1.0800", "quantity": "0.25", "plannedRiskMinor": 11250
        }))
        .unwrap()
    }

    async fn database() -> SqlitePool {
        let db = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(":memory:")
                    .foreign_keys(true),
            )
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&db).await.unwrap();
        sqlx::query("INSERT INTO accounts (id, name, created_at, updated_at) VALUES ('account-a', 'Test', '2026-09-08', '2026-09-08')").execute(&db).await.unwrap();
        db
    }

    fn dimensions() -> TradeScreenshotAnalysis {
        TradeScreenshotAnalysis {
            width: 1000,
            height: 680,
            language: String::new(),
            lines: Vec::new(),
        }
    }

    #[test]
    fn validates_content_instead_of_trusting_extension_or_client_paths() {
        let invalid = TradeScreenshotInput {
            filename: "image.png".into(),
            base64: STANDARD.encode(b"<svg><script>alert(1)</script></svg>"),
        };
        assert!(decode_image(&invalid).is_err());
        let valid = TradeScreenshotInput {
            filename: "../../image.exe".into(),
            base64: STANDARD.encode(TICKET),
        };
        assert_eq!(decode_image(&valid).unwrap().1, "png");
        let oversized = TradeScreenshotInput {
            filename: "image.png".into(),
            base64: "a".repeat(MAX_IMAGE_BYTES.div_ceil(3) * 4 + 1),
        };
        assert!(decode_image(&oversized).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn windows_ocr_reads_real_png_and_rejects_truncated_images() {
        let result = inspect_image(TICKET, true).unwrap();
        let text = result
            .lines
            .iter()
            .map(|line| line.text.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        assert!(text.contains("EURUSD"), "{text}");
        assert!(text.contains("1.08450"), "{text}");
        assert!(text.contains("0.25"), "{text}");
        assert!(
            result
                .lines
                .iter()
                .flat_map(|line| &line.words)
                .all(|word| word.x >= 0.0 && word.y >= 0.0)
        );
        assert!(inspect_image(&TICKET[..32], false).is_err());
    }

    #[tokio::test]
    async fn commits_original_image_and_link_in_the_trades_account_and_deduplicates_media() {
        let db = database().await;
        let root = tempfile::tempdir().unwrap();
        for id in ["first", "second"] {
            let trade = save_with_screenshot(
                &db,
                root.path(),
                input(id, "account-a"),
                "../TradingView.png",
                TICKET,
                "png",
                &dimensions(),
            )
            .await
            .unwrap();
            assert_eq!(trade.account_id.as_deref(), Some("account-a"));
            assert_eq!(trade.quantity.as_deref(), Some("0.25"));
        }
        let (media, links): (i64, i64) = sqlx::query_as(
            "SELECT (SELECT COUNT(*) FROM media_files), (SELECT COUNT(*) FROM trade_media)",
        )
        .fetch_one(&db)
        .await
        .unwrap();
        assert_eq!((media, links), (1, 2));
        let (relative, filename): (String, String) =
            sqlx::query_as("SELECT relative_path, original_filename FROM media_files")
                .fetch_one(&db)
                .await
                .unwrap();
        assert_eq!(filename, "TradingView.png");
        assert_eq!(std::fs::read(root.path().join(relative)).unwrap(), TICKET);
        assert!(
            save_with_screenshot(
                &db,
                root.path(),
                input("first", "account-a"),
                "same.png",
                TICKET,
                "png",
                &dimensions()
            )
            .await
            .is_err()
        );
    }

    #[tokio::test]
    async fn rolls_back_trade_and_media_when_linking_fails_and_rejects_archived_accounts() {
        let db = database().await;
        let root = tempfile::tempdir().unwrap();
        sqlx::query("CREATE TRIGGER reject_screenshot BEFORE INSERT ON trade_media BEGIN SELECT RAISE(ABORT, 'test failure'); END;").execute(&db).await.unwrap();
        assert!(
            save_with_screenshot(
                &db,
                root.path(),
                input("failed", "account-a"),
                "test.png",
                TICKET,
                "png",
                &dimensions()
            )
            .await
            .is_err()
        );
        let counts: (i64, i64) = sqlx::query_as(
            "SELECT (SELECT COUNT(*) FROM trades), (SELECT COUNT(*) FROM media_files)",
        )
        .fetch_one(&db)
        .await
        .unwrap();
        assert_eq!(counts, (0, 0));
        sqlx::query("UPDATE accounts SET is_archived = 1 WHERE id = 'account-a'")
            .execute(&db)
            .await
            .unwrap();
        assert!(
            save_with_screenshot(
                &db,
                root.path(),
                input("archived", "account-a"),
                "test.png",
                TICKET,
                "png",
                &dimensions()
            )
            .await
            .is_err()
        );
    }
}
