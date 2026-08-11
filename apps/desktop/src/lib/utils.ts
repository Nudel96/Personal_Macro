import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const money = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

export const number = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 2,
});

export const percent = new Intl.NumberFormat("de-DE", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** Keeps display-only rounding artifacts from being presented as a loss. */
export function normalizeDisplayNumber(value: number) {
  return Object.is(value, -0) || Math.abs(value) < Number.EPSILON ? 0 : value;
}

export function formatMoneyMinor(value?: number | null) {
  return value == null
    ? "—"
    : money.format(normalizeDisplayNumber(value) / 100);
}

export function formatR(value?: number | string | null) {
  if (value == null || value === "") return "—";
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(parsed)) return "—";
  const numeric = normalizeDisplayNumber(parsed);
  return `${numeric > 0 ? "+" : ""}${number.format(numeric)} R`;
}

export function dateTime(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function localDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

export function toInputDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function fromInputDateTime(value?: string) {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

export function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
