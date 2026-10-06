fn main() {
    println!("cargo::rustc-check-cfg=cfg(mobile)");
    // SQLx embeds migrations at compile time, so adding a migration must
    // invalidate the build even when no Rust source file changed.
    println!("cargo:rerun-if-changed=migrations");
    println!("cargo:rerun-if-changed=bond-migrations");
    println!("cargo:rerun-if-changed=atlas-migrations");
    // Re-embed the Windows application icon whenever branding assets change.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/32x32.png");
    println!("cargo:rerun-if-changed=icons/128x128.png");
    println!("cargo:rerun-if-changed=icons/128x128@2x.png");
    #[cfg(feature = "desktop")]
    tauri_build::build()
}
