import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../features/accounts/myfxbook-events", () => ({
  MyfxbookEvents: () => null,
}));

describe("private workspace cache lifetime", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("cancels pending reads and clears personal query/mutation caches plus open UI on unmount", async () => {
    const { AppProviders } = await import("./providers");
    const { useUiStore } = await import("../stores/ui-store");
    let client!: QueryClient;
    function CaptureClient() {
      client = useQueryClient();
      return null;
    }
    const { unmount } = render(
      <AppProviders>
        <CaptureClient />
      </AppProviders>,
    );
    client.setQueryData(["trade", "account", "trade"], {
      notes: "private notes",
    });
    client
      .getMutationCache()
      .build(client, { mutationKey: ["private-mutation"] });
    useUiStore.getState().setSelectedJournalAccountId("account");
    useUiStore.getState().setQuickTradeOpen(true);
    const aborted = vi.fn();
    let started!: () => void;
    const pendingStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = client
      .fetchQuery({
        queryKey: ["pending-read"],
        queryFn: ({ signal }) =>
          new Promise((_, reject) => {
            signal.addEventListener("abort", () => {
              aborted();
              reject(new Error("cancelled"));
            });
            started();
          }),
      })
      .catch(() => undefined);
    await pendingStarted;
    await act(async () => {
      unmount();
      await pending;
    });
    expect(aborted).toHaveBeenCalledOnce();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(useUiStore.getState().selectedJournalAccountId).toBeNull();
    expect(useUiStore.getState().quickTradeOpen).toBe(false);
  });
});
