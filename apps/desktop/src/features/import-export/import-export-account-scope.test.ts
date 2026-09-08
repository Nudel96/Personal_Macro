import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import type { DashboardResponse, PagedTrades } from "../../types/domain";
import { journalTransferReady, mapImportRow } from "./import-export-page";
import { allTrades, loadPerformanceExportData } from "./document-exports";

const page = (pageNumber: number, totalPages: number): PagedTrades => ({
  items: [],
  total: totalPages > 1 ? 251 : 0,
  page: pageNumber,
  pageSize: 250,
  totalPages,
});

describe("account-scoped journal import and document exports", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requires readiness and stamps every mapped import row with the selected account", () => {
    expect(journalTransferReady("selectionRequired", "account-a")).toBe(false);
    expect(journalTransferReady("ready", null)).toBe(false);
    expect(journalTransferReady("ready", "account-a")).toBe(true);
    expect(mapImportRow({ Instrument: "EURUSD" }, "account-a")?.accountId).toBe(
      "account-a",
    );
  });

  it("uses the same account for every XLSX pagination request", async () => {
    const listTrades = vi
      .spyOn(api, "listTrades")
      .mockResolvedValueOnce(page(1, 2))
      .mockResolvedValueOnce(page(2, 2));

    await allTrades("account-a");

    expect(listTrades).toHaveBeenNthCalledWith(1, "account-a", {
      page: 1,
      pageSize: 250,
    });
    expect(listTrades).toHaveBeenNthCalledWith(2, "account-a", {
      page: 2,
      pageSize: 250,
    });
  });

  it("loads PDF metrics and paginated trades from one account", async () => {
    const dashboard = vi
      .spyOn(api, "dashboard")
      .mockResolvedValue({} as DashboardResponse);
    const listTrades = vi
      .spyOn(api, "listTrades")
      .mockResolvedValue(page(1, 1));

    await loadPerformanceExportData("account-b");

    expect(dashboard).toHaveBeenCalledWith("account-b", {});
    expect(listTrades).toHaveBeenCalledWith("account-b", {
      page: 1,
      pageSize: 250,
    });
  });
});
