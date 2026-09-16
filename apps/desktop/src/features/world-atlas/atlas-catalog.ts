import data from "./data/catalog.json";
import type { AtlasCatalog } from "./atlas-types";

export const atlasCatalog: AtlasCatalog = data;

export function atlasGeographies(regionId: string, search = "") {
  const query = search.trim().toLocaleLowerCase("de");
  return atlasCatalog.geographies
    .filter((area) => regionId === "world" || area.regionId === regionId)
    .filter((area) =>
      `${area.label} ${area.iso3}`.toLocaleLowerCase("de").includes(query),
    )
    .sort((a, b) =>
      a.id === "world"
        ? -1
        : b.id === "world"
          ? 1
          : a.label.localeCompare(b.label, "de"),
    );
}
