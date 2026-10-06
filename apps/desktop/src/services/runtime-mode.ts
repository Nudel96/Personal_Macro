/**
 * Hosted builds stay closed until a real data adapter is available.
 * This build flag is not authentication; Vercel must protect the deployment.
 */
export function isPrivateWeb(): boolean {
  return (
    import.meta.env.VITE_PRIVATE_WEB === "true" &&
    !("__TAURI_INTERNALS__" in window)
  );
}
