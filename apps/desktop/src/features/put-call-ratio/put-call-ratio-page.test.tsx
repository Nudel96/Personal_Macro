import { describe, expect, it } from "vitest";
import {
  browserPutCallDashboard,
  browserSyncPutCall,
} from "../../services/put-call-browser";

describe("Put/Call Browser contract", () => {
  it("exposes supported assets without fabricating market observations", async () => {
    const dashboard = await browserPutCallDashboard("EURUSD");

    expect(dashboard.assets).toHaveLength(7);
    expect(dashboard.selectedAsset.symbol).toBe("EURUSD");
    expect(dashboard.nativeOnly).toBe(true);
    expect(dashboard.points).toEqual([]);
    expect(dashboard.thresholds).toBeNull();
    expect(dashboard.sentiment).toBe("unavailable");
  });

  it("rejects a browser sync instead of returning mock success", async () => {
    await expect(browserSyncPutCall()).rejects.toMatchObject({
      message: expect.stringContaining("Desktop-App"),
    });
  });
});
