export interface ProviderAutomationStatus {
  economicEnabled: boolean;
  myfxbookEnabled: boolean;
  nextRunAt: string | null;
  lastCompletedAt: string | null;
  failedJobs: number;
}
