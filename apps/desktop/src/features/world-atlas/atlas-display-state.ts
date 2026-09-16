import { createContext, useContext, useState } from "react";

/** All picture choices share the page's URL transaction, including rapid edits. */
export const AtlasDisplayContext = createContext<{
  params: URLSearchParams;
  navigate: (values: Record<string, string>) => void;
} | null>(null);

type DisplayChoice = string | number | boolean | null;
const serialize = (value: DisplayChoice) =>
  value === null
    ? "all"
    : typeof value === "boolean"
      ? value
        ? "1"
        : "0"
      : String(value);

export function useAtlasDisplayChoice<T extends DisplayChoice>(
  key: string,
  fallback: T,
  choices: readonly T[],
): [T, (value: T) => void] {
  const context = useContext(AtlasDisplayContext);
  const [local, setLocal] = useState(fallback);
  const raw = context?.params.get(key);
  const parsed = choices.find((value) => serialize(value) === raw);
  const value = context ? (parsed === undefined ? fallback : parsed) : local;
  return [
    value,
    (next) => {
      if (!choices.includes(next)) return;
      if (context) context.navigate({ [key]: serialize(next) });
      else setLocal(next);
    },
  ];
}

export const atlasDemographyYears = Array.from(
  { length: 151 },
  (_, i) => 1950 + i,
);

export function useAtlasDisplayText(
  key: string,
): [string, (value: string) => void] {
  const context = useContext(AtlasDisplayContext);
  const [local, setLocal] = useState("");
  return [
    context ? (context.params.get(key) ?? "") : local,
    (value) => {
      if (context) context.navigate({ [key]: value });
      else setLocal(value);
    },
  ];
}
