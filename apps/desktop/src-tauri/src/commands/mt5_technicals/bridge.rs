use super::{MarketSnapshot, error};
use crate::{database::AppPaths, errors::CommandResult};
use serde::Deserialize;
use std::{
    io::{Read, Write},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

const CONNECTOR: &str = include_str!("../../../connectors/mt5_market_connector.py");
const MAX_OUTPUT: u64 = 8 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Response {
    ok: bool,
    data: Option<MarketSnapshot>,
    code: Option<String>,
}

pub(super) fn read(paths: &AppPaths, terminal_path: Option<&str>) -> CommandResult<MarketSnapshot> {
    // A per-call path avoids races with the independent account connector.
    let path = paths
        .settings
        .join(format!("mt5-market-{}.py", uuid::Uuid::new_v4()));
    std::fs::write(&path, CONNECTOR).map_err(|_| error("MT5_CONNECTOR_ERROR"))?;
    let request = serde_json::json!({"operation":"technical-trends","terminalPath":terminal_path})
        .to_string();
    let result = run(&path, "python", &[], &request).or_else(|failure| {
        if failure.code == "PYTHON_NOT_FOUND" {
            run(&path, "py", &["-3"], &request)
        } else {
            Err(failure)
        }
    });
    let _ = std::fs::remove_file(&path);
    let bytes = result?;
    let response: Response =
        serde_json::from_slice(&bytes).map_err(|_| error("MT5_INVALID_SNAPSHOT"))?;
    if !response.ok {
        let code = response.code.as_deref().unwrap_or("MT5_CONNECTOR_ERROR");
        return Err(error(match code {
            "MT5_PACKAGE_MISSING"
            | "MT5_INITIALIZE_FAILED"
            | "MT5_NOT_CONNECTED"
            | "MT5_ACCOUNT_CHANGED"
            | "MT5_SYMBOLS_UNAVAILABLE" => code,
            _ => "MT5_CONNECTOR_ERROR",
        }));
    }
    response.data.ok_or_else(|| error("MT5_INVALID_SNAPSHOT"))
}

fn run(
    path: &std::path::Path,
    executable: &str,
    args: &[&str],
    request: &str,
) -> CommandResult<Vec<u8>> {
    let mut command = Command::new(executable);
    command
        .args(args)
        .arg(path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let mut child = command.spawn().map_err(|_| error("PYTHON_NOT_FOUND"))?;
    let stdin_result = child
        .stdin
        .take()
        .ok_or_else(|| error("MT5_CONNECTOR_ERROR"))
        .and_then(|mut stdin| {
            stdin
                .write_all(request.as_bytes())
                .map_err(|_| error("MT5_CONNECTOR_ERROR"))
        });
    if let Err(failure) = stdin_result {
        let _ = child.kill();
        let _ = child.wait();
        return Err(failure);
    }
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| error("MT5_CONNECTOR_ERROR"))?;
    let reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .take(MAX_OUTPUT + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let started = Instant::now();
    let result = loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                break if status.success() {
                    Ok(())
                } else {
                    Err(error("MT5_CONNECTOR_ERROR"))
                };
            }
            Err(_) => break Err(error("MT5_CONNECTOR_ERROR")),
            Ok(None) if started.elapsed() >= Duration::from_secs(90) => {
                break Err(error("MT5_TIMEOUT"));
            }
            Ok(None) => thread::sleep(Duration::from_millis(100)),
        }
    };
    if result.is_err() {
        let _ = child.kill();
    }
    let _ = child.wait();
    let bytes = reader
        .join()
        .map_err(|_| error("MT5_CONNECTOR_ERROR"))?
        .map_err(|_| error("MT5_CONNECTOR_ERROR"))?;
    result?;
    if bytes.len() as u64 > MAX_OUTPUT {
        return Err(error("MT5_INVALID_SNAPSHOT"));
    }
    Ok(bytes)
}
