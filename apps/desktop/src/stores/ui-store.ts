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
  globalAccountIds: string[];
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
  setGlobalDatePreset: (preset: UiState["globalDatePreset"]) => void;
  setGlobalFilters: (
    filters: Partial<
      Pick<
        UiState,
        | "globalAccountIds"
        | "globalSetupIds"
        | "globalDirection"
        | "globalDateFrom"
        | "globalDateTo"
      >
    >,
  ) => void;
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
      globalAccountIds: [],
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
      setGlobalDatePreset: (globalDatePreset) => set({ globalDatePreset }),
      setGlobalFilters: (filters) => set(filters),
    }),
    { name: "personal-macro:ui" },
  ),
);
