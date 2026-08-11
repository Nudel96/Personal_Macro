// Prevents an additional console window when the desktop app is launched on Windows.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
    personal_macro_desktop_lib::run()
}
