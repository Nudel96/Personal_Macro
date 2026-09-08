import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeasonalityControls } from "./seasonality-page";

afterEach(cleanup);

describe("SeasonalityControls", () => {
  it("collects cohort and window changes and applies them only after confirmation", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <SeasonalityControls
        yearFilter={{
          endingDigits: [],
          includeYears: [],
          excludeYears: [],
        }}
        referenceDate="08-16"
        windowStart=""
        windowDays={20}
        selectedYears={[2022, 2023, 2024, 2025]}
        referenceDatePlaceholder="08-16"
        onApply={onApply}
      />,
    );

    await user.click(screen.getByText("Kohorte und Analysefenster anpassen"));
    await user.type(screen.getByLabelText("Zyklus"), "4");
    await user.click(
      screen.getByRole("button", { name: "Jahre mit Endziffer 2 hinzufügen" }),
    );
    await user.type(screen.getByLabelText("Nur diese Jahre"), "2016, 2020");
    await user.clear(screen.getByLabelText("Fensterlänge in Handelstagen"));
    await user.type(
      screen.getByLabelText("Fensterlänge in Handelstagen"),
      "30",
    );

    expect(onApply).not.toHaveBeenCalled();
    expect(
      screen.getByText("Änderungen sind noch nicht angewendet."),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Änderungen übernehmen" }),
    );

    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledWith({
      yearFilter: {
        endingDigits: [2],
        includeYears: [2016, 2020],
        excludeYears: [],
        cycleYears: 4,
      },
      referenceDate: "08-16",
      windowStart: "",
      windowDays: 30,
    });
  });
});
