export interface CloudBackupRecord {
  id: string;
  createdAt: string;
  sourceRevision: number;
  sha256: string;
  sizeBytes: number;
  safetyCopy: boolean;
}
export interface CloudTransferSnapshot {
  format: "personal-macro-cloud-v1";
  tables: Record<string, Record<string, unknown>[]>;
}
