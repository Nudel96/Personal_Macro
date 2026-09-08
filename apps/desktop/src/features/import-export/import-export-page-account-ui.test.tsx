import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";

vi.mock("../accounts/journal-account-context", () => ({
  useJournalAccount: () => ({
    status: "ready",
    selectedAccountId: "account-a",
    selectedAccount: null,
    accounts: [],
    selectAccount: vi.fn(),
  }),
}));

import { ImportExportPage } from "./import-export-page";

describe("ImportExportPage account-safe actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "backups").mockResolvedValue([]);
  });

  it("does not expose the deferred unscoped CSV/JSON export actions", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ImportExportPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      screen.getByText(/CSV\/JSON-Export wird erst mit dem kontosicheren/),
    ).toBeTruthy();
    expect(screen.queryByText("CSV-Export")).toBeNull();
    expect(screen.queryByText("JSON-Export")).toBeNull();
  });
});
