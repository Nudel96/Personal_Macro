import { convertFileSrc } from "@tauri-apps/api/core";
import type { MediaRecord } from "../types/domain";
import { isPrivateWeb } from "./runtime-mode";

const MEDIA_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Private media is always read through the authenticated same-origin route. */
export function mediaUrl(
  media: Pick<MediaRecord, "id" | "absolutePath">,
): string {
  if (isPrivateWeb()) {
    return typeof media.id === "string" &&
      media.id.length === 36 &&
      MEDIA_ID.test(media.id)
      ? `/api/media?id=${media.id}`
      : "";
  }
  return media.absolutePath.startsWith("data:")
    ? media.absolutePath
    : convertFileSrc(media.absolutePath);
}
