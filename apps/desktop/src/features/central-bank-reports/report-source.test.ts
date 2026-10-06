import { describe, expect, it } from "vitest";
import { officialReportUrl } from "./report-source";
describe("official report links", () => {
  it("opens only verified bank hosts over HTTPS", () => {
    expect(
      officialReportUrl("FED", "https://www.federalreserve.gov/report.pdf"),
    ).toBe("https://www.federalreserve.gov/report.pdf");
    for (const url of [
      "https://federalreserve.gov.evil.example/report",
      "http://federalreserve.gov/report",
      "javascript:alert(1)",
      "https://secret@federalreserve.gov/report",
      "https://federalreserve.gov:8443/report",
      "https://www.ecb.europa.eu/report",
    ]) {
      expect(officialReportUrl("FED", url)).toBeNull();
    }
  });
});
