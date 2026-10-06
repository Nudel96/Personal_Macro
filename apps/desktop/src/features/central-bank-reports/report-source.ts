const reportDomains: Record<string, string> = {
  FED: "federalreserve.gov",
  ECB: "ecb.europa.eu",
  BOE: "bankofengland.co.uk",
  BOJ: "boj.or.jp",
  RBA: "rba.gov.au",
  RBNZ: "rbnz.govt.nz",
  BOC: "bankofcanada.ca",
  SNB: "snb.ch",
  PBOC: "pbc.gov.cn",
};

export function officialReportUrl(bank: string, value: string): string | null {
  try {
    const url = new URL(value);
    const domain = reportDomains[bank];
    return domain &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === domain || url.hostname.endsWith(`.${domain}`))
      ? url.href
      : null;
  } catch {
    return null;
  }
}
