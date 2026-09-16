export interface AtlasSavedContext {
  version: number;
  params: Record<string, string>;
}
export interface AtlasSourceReference {
  family:
    | "public"
    | "worldbank"
    | "un"
    | "maddison"
    | "ember"
    | "irena"
    | "bis"
    | "oecd"
    | "uis"
    | "fao"
    | "jst"
    | "ilo"
    | "wipo"
    | "who"
    | "imf"
    | "eodhd"
    | "damodaran"
    | "hypothesis";
  label: string;
  scope: string;
  datasetId: string;
  status: string;
  release: string | null;
  retrievedAt: string | null;
  recipe: string | null;
  hashes: string[];
}
export interface AtlasNotebookSummary {
  id: string;
  title: string;
  notePreview: string;
  favorite: boolean;
  contextLabel: string;
  hasImage: boolean;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  trashedAt: string | null;
}
export interface AtlasNotebookEntry extends AtlasNotebookSummary {
  note: string;
  context: AtlasSavedContext;
  sources: AtlasSourceReference[];
  snapshotDataUrl: string | null;
  snapshotStatus: "available" | "not_captured" | "unreadable";
}
export interface AtlasNotebookCreateInput {
  title: string;
  note: string;
  favorite: boolean;
  contextLabel: string;
  capturedAt: string;
  context: AtlasSavedContext;
  sources: AtlasSourceReference[];
  snapshotBase64: string | null;
}
export interface AtlasNotebookUpdateInput {
  id: string;
  revision: number;
  title: string;
  note: string;
  favorite: boolean;
}
