import { browserBootstrap } from "./browser-adapter";
import { uid } from "../lib/utils";
import type {
  CustomField,
  CustomFieldInput,
  GoalInput,
  GoalRecord,
  MistakeAnalytics,
  PlaybookSetup,
  ReviewInput,
  ReviewRecord,
  SavedView,
  SavedViewInput,
  TradeContext,
  TradeContextInput,
  TradeMistakeRecord,
} from "../types/domain";

function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}
function save<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function listBrowserReviews() {
  return Promise.resolve(
    load<ReviewRecord[]>("personal-macro:browser-reviews:v1", []),
  );
}
export function saveBrowserReview(input: ReviewInput) {
  const rows = load<ReviewRecord[]>("personal-macro:browser-reviews:v1", []);
  const now = new Date().toISOString();
  const row: ReviewRecord = {
    ...input,
    id: input.id ?? uid(),
    metricSnapshotJson: JSON.stringify(input.metricSnapshot ?? {}),
    completedAt: input.status === "completed" ? now : null,
    createdAt: rows.find((item) => item.id === input.id)?.createdAt ?? now,
    updatedAt: now,
  };
  const index = rows.findIndex((item) => item.id === row.id);
  if (index >= 0) rows[index] = row;
  else rows.unshift(row);
  save("personal-macro:browser-reviews:v1", rows);
  return Promise.resolve(row);
}

export function listBrowserGoals() {
  return Promise.resolve(
    load<GoalRecord[]>("personal-macro:browser-goals:v1", []),
  );
}
export function saveBrowserGoal(input: GoalInput) {
  const rows = load<GoalRecord[]>("personal-macro:browser-goals:v1", []);
  const row: GoalRecord = {
    ...input,
    id: input.id ?? uid(),
    updatedAt: new Date().toISOString(),
  };
  const index = rows.findIndex((item) => item.id === row.id);
  if (index >= 0) rows[index] = row;
  else rows.unshift(row);
  save("personal-macro:browser-goals:v1", rows);
  return Promise.resolve(row);
}
export function recordBrowserGoalProgress(goalId: string, value: string) {
  const rows = load<GoalRecord[]>("personal-macro:browser-goals:v1", []);
  const row = rows.find((item) => item.id === goalId);
  if (row) {
    row.latestValue = value;
    row.updatedAt = new Date().toISOString();
    save("personal-macro:browser-goals:v1", rows);
  }
  return Promise.resolve();
}

export function listBrowserPlaybook(): Promise<PlaybookSetup[]> {
  const versions = load<Record<string, Partial<PlaybookSetup>>>(
    "personal-macro:browser-playbook:v1",
    {},
  );
  const custom = load<
    Array<{ id: string; name: string; color: string; description?: string }>
  >("personal-macro:browser-setups:v1", []);
  const all = [
    ...browserBootstrap.setups,
    ...custom.filter(
      (setup) => !browserBootstrap.setups.some((base) => base.id === setup.id),
    ),
  ];
  return Promise.resolve(
    all.map((setup) => ({ ...setup, tradeCount: 0, ...versions[setup.id] })),
  );
}
export function saveBrowserSetupVersion(
  setupId: string,
  values: {
    rules: unknown;
    checklist: unknown;
    examples: unknown;
    notesHtml?: string;
  },
) {
  const versions = load<Record<string, Partial<PlaybookSetup>>>(
    "personal-macro:browser-playbook:v1",
    {},
  );
  const previous = versions[setupId];
  versions[setupId] = {
    version: (previous?.version ?? 0) + 1,
    versionId: uid(),
    rulesJson: JSON.stringify(values.rules),
    checklistJson: JSON.stringify(values.checklist),
    examplesJson: JSON.stringify(values.examples),
    notesHtml: values.notesHtml,
  };
  save("personal-macro:browser-playbook:v1", versions);
  return Promise.resolve();
}
export function createBrowserSetup(input: {
  name: string;
  description?: string;
  color?: string;
}) {
  const setup = {
    id: uid(),
    name: input.name.trim(),
    color: input.color ?? "#3b82f6",
  };
  browserBootstrap.setups.push(setup);
  const custom = load<Array<typeof setup & { description?: string }>>(
    "personal-macro:browser-setups:v1",
    [],
  );
  custom.push({ ...setup, description: input.description });
  save("personal-macro:browser-setups:v1", custom);
  return Promise.resolve(setup);
}

export function browserMistakes(): Promise<MistakeAnalytics[]> {
  return Promise.resolve(
    browserBootstrap.mistakes.map((mistake) => ({
      ...mistake,
      description: null,
      countermeasure: null,
      occurrences: 0,
      estimatedCostMinor: 0,
      averageSeverity: null,
    })),
  );
}
export function listBrowserTradeMistakes(
  tradeId: string,
): Promise<TradeMistakeRecord[]> {
  return Promise.resolve(
    load<Record<string, TradeMistakeRecord[]>>(
      "personal-macro:browser-trade-mistakes:v1",
      {},
    )[tradeId] ?? [],
  );
}
export function assignBrowserTradeMistake(input: {
  tradeId: string;
  mistakeId: string;
  severity: number;
  estimatedCostMinor?: number;
  note?: string;
}) {
  const all = load<Record<string, TradeMistakeRecord[]>>(
    "personal-macro:browser-trade-mistakes:v1",
    {},
  );
  const rows = all[input.tradeId] ?? [];
  const catalog = browserBootstrap.mistakes.find(
    (item) => item.id === input.mistakeId,
  );
  const row: TradeMistakeRecord = {
    mistakeId: input.mistakeId,
    name: catalog?.name ?? "Fehler",
    severity: input.severity,
    estimatedCostMinor: input.estimatedCostMinor,
    note: input.note,
  };
  const index = rows.findIndex((item) => item.mistakeId === input.mistakeId);
  if (index >= 0) rows[index] = row;
  else rows.push(row);
  all[input.tradeId] = rows;
  save("personal-macro:browser-trade-mistakes:v1", all);
  return Promise.resolve();
}

const emptyTradeContext: TradeContext = {
  legs: [],
  tags: [],
  checklistItems: [],
  emotions: [],
  customValues: [],
};
export function getBrowserTradeContext(tradeId: string) {
  const all = load<Record<string, TradeContext>>(
    "personal-macro:browser-trade-context:v1",
    {},
  );
  return Promise.resolve(all[tradeId] ?? structuredClone(emptyTradeContext));
}
export function saveBrowserTradeContext(input: TradeContextInput) {
  const all = load<Record<string, TradeContext>>(
    "personal-macro:browser-trade-context:v1",
    {},
  );
  const context: TradeContext = {
    legs: input.legs,
    tags: browserBootstrap.tags.filter((tag) => input.tagIds.includes(tag.id)),
    checklistItems: input.checklistItems,
    emotions: input.emotions.map((emotion) => ({
      ...emotion,
      name:
        browserBootstrap.emotions.find((item) => item.id === emotion.emotionId)
          ?.name ?? "Emotion",
      color:
        browserBootstrap.emotions.find((item) => item.id === emotion.emotionId)
          ?.color ?? "#64748b",
    })),
    customValues: input.customValues,
  };
  all[input.tradeId] = context;
  save("personal-macro:browser-trade-context:v1", all);
  return Promise.resolve(context);
}
export function listBrowserSavedViews(scope: string) {
  return Promise.resolve(
    load<SavedView[]>("personal-macro:browser-saved-views:v1", []).filter(
      (view) => view.scope === scope,
    ),
  );
}
export function saveBrowserSavedView(input: SavedViewInput) {
  const rows = load<SavedView[]>("personal-macro:browser-saved-views:v1", []);
  const now = new Date().toISOString();
  const existing = rows.find((item) => item.id === input.id);
  const row: SavedView = {
    ...input,
    id: input.id ?? uid(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const index = rows.findIndex((item) => item.id === row.id);
  if (index >= 0) rows[index] = row;
  else rows.push(row);
  save("personal-macro:browser-saved-views:v1", rows);
  return Promise.resolve(row);
}
export function deleteBrowserSavedView(id: string) {
  save(
    "personal-macro:browser-saved-views:v1",
    load<SavedView[]>("personal-macro:browser-saved-views:v1", []).filter(
      (item) => item.id !== id,
    ),
  );
  return Promise.resolve();
}
export function listBrowserCustomFields(entityType: string) {
  return Promise.resolve(
    load<CustomField[]>("personal-macro:browser-custom-fields:v1", []).filter(
      (field) => field.entityType === entityType,
    ),
  );
}
export function saveBrowserCustomField(input: CustomFieldInput) {
  const rows = load<CustomField[]>(
    "personal-macro:browser-custom-fields:v1",
    [],
  );
  const now = new Date().toISOString();
  const existing = rows.find((item) => item.id === input.id);
  const row: CustomField = {
    ...input,
    id: input.id ?? uid(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const index = rows.findIndex((item) => item.id === row.id);
  if (index >= 0) rows[index] = row;
  else rows.push(row);
  save("personal-macro:browser-custom-fields:v1", rows);
  return Promise.resolve(row);
}
export function deleteBrowserCustomField(id: string) {
  save(
    "personal-macro:browser-custom-fields:v1",
    load<CustomField[]>("personal-macro:browser-custom-fields:v1", []).filter(
      (item) => item.id !== id,
    ),
  );
  return Promise.resolve();
}
