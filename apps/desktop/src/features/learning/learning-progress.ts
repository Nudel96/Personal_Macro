import { useSyncExternalStore } from "react";
import {
  getPrivateWebClientState,
  subscribePrivateWebClient,
  supportsPrivateWebCommand,
} from "../../services/private-web-client";
import { api } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import { lessonById } from "./learning-catalog";

export const LEARNING_STORAGE_KEY = "personal-macro:learning:v1";

export interface LearningProgress {
  known: string[];
  saved: string[];
  notes: Record<string, string>;
  last: { lesson: string; step: number } | null;
  storage: "device" | "session" | "memory" | "cloud";
  sync?: "loading" | "saving" | "saved" | "error";
}

const empty = (storage: LearningProgress["storage"]): LearningProgress => ({
  known: [],
  saved: [],
  notes: {},
  last: null,
  storage,
});
let snapshot: LearningProgress = empty("memory");
let scope: string | null = null;
let privateSubscribed = false;
const listeners = new Set<() => void>();
let cloudLoaded = false;
let cloudSaving = false;
let cloudVersion = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let beforeLoad: Array<(current: LearningProgress) => LearningProgress> = [];
const notify = () => listeners.forEach((listener) => listener());
function cloudAvailable() {
  return (
    isPrivateWeb() &&
    getPrivateWebClientState().status === "ready" &&
    supportsPrivateWebCommand("get_learning_progress") &&
    supportsPrivateWebCommand("save_learning_progress")
  );
}
function scheduleCloudSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushLearningProgress(), 750);
}
export async function flushLearningProgress(): Promise<void> {
  if (!cloudAvailable() || !cloudLoaded || cloudSaving) return;
  if (getPrivateWebClientState().writeInFlight) {
    scheduleCloudSave();
    return;
  }
  const activeScope = scope,
    version = cloudVersion;
  const { known, saved, notes, last } = snapshot;
  cloudSaving = true;
  snapshot = { ...snapshot, sync: "saving" };
  notify();
  try {
    await api.saveLearningProgress({ version: 1, known, saved, notes, last });
    if (scope !== activeScope) return;
    snapshot = {
      ...snapshot,
      sync: version === cloudVersion ? "saved" : "saving",
    };
    if (version !== cloudVersion) scheduleCloudSave();
  } catch {
    if (scope === activeScope) snapshot = { ...snapshot, sync: "error" };
  } finally {
    cloudSaving = false;
    if (scope === activeScope) notify();
  }
}
export function retryLearningSync(): void {
  if (!cloudAvailable() || !scope) return;
  if (cloudLoaded) void flushLearningProgress();
  else void loadCloudProgress(scope);
}
async function loadCloudProgress(activeScope: string) {
  try {
    const data = await api.learningProgress();
    if (scope !== activeScope || !cloudAvailable()) return;
    const restored = parseLearningProgress(JSON.stringify(data));
    snapshot = { ...restored, storage: "cloud", sync: "saved" };
    for (const change of beforeLoad) snapshot = change(snapshot);
    cloudLoaded = true;
    if (beforeLoad.length) {
      snapshot = { ...snapshot, sync: "saving" };
      scheduleCloudSave();
    }
    beforeLoad = [];
    notify();
  } catch {
    if (scope === activeScope) {
      snapshot = { ...snapshot, storage: "cloud", sync: "error" };
      notify();
    }
  }
}

export function parseLearningProgress(raw: string | null): LearningProgress {
  const initial = empty("device");
  if (raw === null || raw.length > 300_000) return initial;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data))
      return initial;
    const record = data as Record<string, unknown>;
    if (record.version !== 1) return initial;
    const ids = (value: unknown): string[] =>
      Array.isArray(value)
        ? [
            ...new Set(
              value.filter(
                (id): id is string =>
                  typeof id === "string" && lessonById.has(id),
              ),
            ),
          ]
        : [];
    const notes: Record<string, string> = {};
    if (
      record.notes &&
      typeof record.notes === "object" &&
      !Array.isArray(record.notes)
    ) {
      for (const [id, value] of Object.entries(record.notes)) {
        if (lessonById.has(id) && typeof value === "string")
          notes[id] = value.slice(0, 2000);
      }
    }
    const last = record.last as Record<string, unknown> | null;
    return {
      ...initial,
      known: ids(record.known),
      saved: ids(record.saved),
      notes,
      last:
        last && typeof last.lesson === "string" && lessonById.has(last.lesson)
          ? {
              lesson: last.lesson,
              step:
                Number.isInteger(last.step) &&
                Number(last.step) >= 0 &&
                Number(last.step) <= 5
                  ? Number(last.step)
                  : 0,
            }
          : null,
    };
  } catch {
    return initial;
  }
}

function synchronizeScope(): void {
  if (isPrivateWeb() && !privateSubscribed) {
    subscribePrivateWebClient(() => {
      const previous = snapshot;
      synchronizeScope();
      if (previous !== snapshot) listeners.forEach((listener) => listener());
    });
    privateSubscribed = true;
  }
  const privateState = isPrivateWeb() ? getPrivateWebClientState() : null;
  const nextScope = privateState
    ? `session:${privateState.status === "ready" ? privateState.workspaceId : "closed"}`
    : "device";
  if (scope === nextScope) return;
  scope = nextScope;
  clearTimeout(saveTimer);
  cloudLoaded = false;
  beforeLoad = [];
  cloudVersion = 0;
  if (privateState) {
    snapshot = empty("session");
    if (cloudAvailable()) {
      snapshot = { ...empty("cloud"), sync: "loading" };
      void loadCloudProgress(nextScope);
    }
    return;
  }
  try {
    snapshot = parseLearningProgress(
      localStorage.getItem(LEARNING_STORAGE_KEY),
    );
  } catch {
    snapshot = empty("memory");
  }
}

export function getLearningProgress(): LearningProgress {
  synchronizeScope();
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (
      !isPrivateWeb() &&
      (event.key === LEARNING_STORAGE_KEY || event.key === null)
    ) {
      snapshot = parseLearningProgress(event.newValue);
      listeners.forEach((notify) => notify());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function update(change: (current: LearningProgress) => LearningProgress): void {
  synchronizeScope();
  if (isPrivateWeb() && getPrivateWebClientState().status !== "ready") return;
  snapshot = change(snapshot);
  if (cloudAvailable()) {
    cloudVersion += 1;
    snapshot = {
      ...snapshot,
      storage: "cloud",
      sync: cloudLoaded ? "saving" : "loading",
    };
    if (cloudLoaded) scheduleCloudSave();
    else beforeLoad.push(change);
  }
  if (!isPrivateWeb()) {
    try {
      const { known, saved, notes, last } = snapshot;
      localStorage.setItem(
        LEARNING_STORAGE_KEY,
        JSON.stringify({ version: 1, known, saved, notes, last }),
      );
      snapshot = { ...snapshot, storage: "device" };
    } catch {
      snapshot = { ...snapshot, storage: "memory" };
    }
  }
  listeners.forEach((listener) => listener());
}

export function toggleLearningSaved(id: string): void {
  if (!lessonById.has(id)) return;
  update((current) => ({
    ...current,
    saved: current.saved.includes(id)
      ? current.saved.filter((value) => value !== id)
      : [...current.saved, id],
  }));
}
export function toggleLearningKnown(id: string): void {
  if (!lessonById.has(id)) return;
  update((current) => ({
    ...current,
    known: current.known.includes(id)
      ? current.known.filter((value) => value !== id)
      : [...current.known, id],
  }));
}
export function saveLearningPosition(lesson: string, step: number): void {
  if (
    !lessonById.has(lesson) ||
    !Number.isInteger(step) ||
    step < 0 ||
    step > 5
  )
    return;
  if (
    getLearningProgress().last?.lesson === lesson &&
    snapshot.last?.step === step
  )
    return;
  update((current) => ({ ...current, last: { lesson, step } }));
}
export function saveLearningNote(id: string, value: string): void {
  if (!lessonById.has(id)) return;
  update((current) => ({
    ...current,
    notes: { ...current.notes, [id]: value.slice(0, 2000) },
  }));
}
export function useLearningProgress(): LearningProgress {
  return useSyncExternalStore(subscribe, getLearningProgress);
}
