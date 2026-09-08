import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  sidebarCollapsed: boolean;
  commandOpen: boolean;
  quickTradeOpen: boolean;
  guidedTradeOpen: boolean;
  onboardingCollapsed: boolean;
  onboardingDismissed: boolean;
  globalDatePreset:
    | "all"
    | "today"
    | "week"
    | "month"
    | "quarter"
    | "year"
    | "30d"
    | "90d"
    | "ytd"
    | "custom";
  selectedJournalAccountId: string | null;
  globalSetupIds: string[];
  globalDirection: "all" | "long" | "short";
  globalDateFrom?: string;
  globalDateTo?: string;
  toggleSidebar: () => void;
  setCommandOpen: (open: boolean) => void;
  setQuickTradeOpen: (open: boolean) => void;
  setGuidedTradeOpen: (open: boolean) => void;
  setOnboardingCollapsed: (collapsed: boolean) => void;
  setOnboardingDismissed: (dismissed: boolean) => void;
  setSelectedJournalAccountId: (accountId: string | null) => void;
  setGlobalDatePreset: (preset: UiState["globalDatePreset"]) => void;
  setGlobalFilters: (
    filters: Partial<
      Pick<
        UiState,
        "globalSetupIds" | "globalDirection" | "globalDateFrom" | "globalDateTo"
      >
    >,
  ) => void;
}

export function migrateUiState(
  persistedState: unknown,
  version: number,
): Record<string, unknown> {
  const state =
    persistedState && typeof persistedState === "object"
      ? { ...(persistedState as Record<string, unknown>) }
      : {};
  const legacyAccountIds = state.globalAccountIds;

  if (version < 1 && Array.isArray(legacyAccountIds)) {
    state.selectedJournalAccountId =
      legacyAccountIds.length === 1 && typeof legacyAccountIds[0] === "string"
        ? legacyAccountIds[0]
        : null;
  }

  delete state.globalAccountIds;
  return state;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      commandOpen: false,
      quickTradeOpen: false,
      guidedTradeOpen: false,
      onboardingCollapsed: false,
      onboardingDismissed: false,
      globalDatePreset: "all",
      selectedJournalAccountId: null,
      globalSetupIds: [],
      globalDirection: "all",
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setQuickTradeOpen: (quickTradeOpen) => set({ quickTradeOpen }),
      setGuidedTradeOpen: (guidedTradeOpen) => set({ guidedTradeOpen }),
      setOnboardingCollapsed: (onboardingCollapsed) =>
        set({ onboardingCollapsed }),
      setOnboardingDismissed: (onboardingDismissed) =>
        set({ onboardingDismissed }),
      setSelectedJournalAccountId: (selectedJournalAccountId) =>
        set({ selectedJournalAccountId }),
      setGlobalDatePreset: (globalDatePreset) => set({ globalDatePreset }),
      setGlobalFilters: (filters) => set(filters),
    }),
    {
      name: "personal-macro:ui",
      version: 1,
      migrate: migrateUiState,
    },
  ),
);
