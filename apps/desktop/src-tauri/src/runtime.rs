//! Small runtime boundary shared by the desktop and headless builds.
//!
//! A headless build has no window, desktop credential UI, or file opener.
//! Exposing this core over HTTP requires a separate authenticated allowlist.

#[cfg(feature = "desktop")]
pub use tauri::async_runtime::{spawn, spawn_blocking};
#[cfg(feature = "desktop")]
pub use tauri::{AppHandle, State};

#[cfg(not(feature = "desktop"))]
pub use tokio::{spawn, task::spawn_blocking};

#[cfg(not(feature = "desktop"))]
#[derive(Clone, Copy, Debug, Default)]
pub struct AppHandle;

#[cfg(not(feature = "desktop"))]
pub struct State<'a, T: Send + Sync + 'static>(&'a T);

#[cfg(not(feature = "desktop"))]
impl<'a, T: Send + Sync + 'static> State<'a, T> {
    pub fn new(value: &'a T) -> Self {
        Self(value)
    }

    pub fn inner(&self) -> &'a T {
        self.0
    }
}

#[cfg(not(feature = "desktop"))]
impl<T: Send + Sync + 'static> std::ops::Deref for State<'_, T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        self.0
    }
}

pub fn require_desktop() -> crate::errors::CommandResult<()> {
    if cfg!(feature = "desktop") {
        Ok(())
    } else {
        Err(desktop_required())
    }
}

pub fn desktop_required() -> crate::errors::CommandError {
    crate::errors::CommandError {
        code: "DESKTOP_REQUIRED".into(),
        message: "Diese Funktion benötigt die lokale Desktop-App.".into(),
        details: None,
    }
}

pub(crate) fn emit_myfxbook_update(app: &AppHandle, account_id: &str) {
    #[cfg(feature = "desktop")]
    {
        use tauri::Emitter;
        let _ = app.emit("myfxbook-updated", account_id);
    }
    #[cfg(not(feature = "desktop"))]
    {
        let _ = (app, account_id);
    }
}
