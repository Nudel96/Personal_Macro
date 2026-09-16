/** Unambiguous decimal amount, with at most two fractional digits. */
export function parseAccountAmount(value: string) {
  const clean = value.trim();
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(clean)) return null;
  const minor = Math.round(Number(clean.replace(",", ".")) * 100);
  return Number.isSafeInteger(minor) ? minor : null;
}
