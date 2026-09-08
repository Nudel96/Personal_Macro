import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import type { GoalRecord } from "../../types/domain";
import { GoalsPage } from "./goals-page";

const goal: GoalRecord = {
  id: "review-goal",
  name: "Reviews dokumentieren",
  description: "Nach jedem Trade",
  metricKey: "review_rate",
  targetValue: "100",
  unit: "%",
  direction: "at_least",
  status: "active",
  startsAt: "2026-09-01",
  endsAt: null,
  latestValue: null,
  updatedAt: "2026-09-04T12:00:00Z",
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GoalsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Goals collection interactions", () => {
  it("distinguishes missing progress from a measured zero", async () => {
    vi.spyOn(api, "goals").mockResolvedValue([
      goal,
      { ...goal, id: "zero", name: "Bereits erfasst", latestValue: "0" },
    ]);
    renderPage();
    await screen.findByRole("button", { name: goal.name });
    expect(screen.getAllByText("Noch nicht erfasst")).toHaveLength(1);
    expect(screen.getByText("0 %")).toBeTruthy();
  });

  it("filters by translated metric and recovers from an empty search", async () => {
    vi.spyOn(api, "goals").mockResolvedValue([goal]);
    const user = userEvent.setup();
    renderPage();
    const search = await screen.findByRole("searchbox", {
      name: "Ziele durchsuchen",
    });
    await user.type(search, "review-quote");
    expect(screen.getByRole("button", { name: goal.name })).toBeTruthy();
    await user.clear(search);
    await user.type(search, "kein Treffer");
    expect(screen.queryByRole("button", { name: goal.name })).toBeNull();
    expect(screen.getByText("Keine passenden Ziele")).toBeTruthy();
    await user.click(
      screen.getAllByRole("button", { name: "Suche zurücksetzen" })[0],
    );
    expect(screen.getByRole("button", { name: goal.name })).toBeTruthy();
  });

  it("opens by keyboard and saves a new goal without reusing the previously selected id", async () => {
    vi.spyOn(api, "goals").mockResolvedValue([goal]);
    const save = vi.spyOn(api, "saveGoal").mockResolvedValue(goal);
    const user = userEvent.setup();
    renderPage();
    (await screen.findByRole("button", { name: goal.name })).focus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("dialog", { name: "Ziel bearbeiten" }),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: goal.name }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Ziel anlegen" }));
    await user.type(screen.getByLabelText("Name"), "Neuer Prozessfokus");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0]).toMatchObject({
      name: "Neuer Prozessfokus",
      metricKey: "total_r",
    });
    expect(save.mock.calls[0][0].id).toBeUndefined();
  });
});
