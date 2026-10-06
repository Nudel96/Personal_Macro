import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  vi.stubEnv("VITE_PRIVATE_WEB", "false");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("learning progress and private session boundaries", () => {
  it("loads and saves cloud notes without browser storage and ignores a late response after logout", async () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    const { api } = await import("../../services/commands");
    const load = vi
      .spyOn(api, "learningProgress")
      .mockResolvedValue({
        version: 1,
        known: ["cad"],
        saved: [],
        notes: { cad: "Stored" },
        last: null,
      });
    const save = vi
      .spyOn(api, "saveLearningProgress")
      .mockResolvedValue(undefined);
    const client = await import("../../services/private-web-client");
    client.configurePrivateWebSession({
      authenticated: true,
      workspaceId: "cloud-learning",
      revision: 0,
      csrfToken: "a".repeat(48),
      capabilities: ["get_learning_progress", "save_learning_progress"],
      writableCommands: ["save_learning_progress"],
    });
    const get = vi.spyOn(Storage.prototype, "getItem"),
      set = vi.spyOn(Storage.prototype, "setItem");
    const store = await import("./learning-progress");
    store.getLearningProgress();
    await load.mock.results[0].value;
    await Promise.resolve();
    expect(store.getLearningProgress()).toMatchObject({
      storage: "cloud",
      notes: { cad: "Stored" },
      sync: "saved",
    });
    store.saveLearningNote("cad", "Changed");
    await store.flushLearningProgress();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ notes: { cad: "Changed" } }),
    );
    expect(store.getLearningProgress().sync).toBe("saved");
    client.clearPrivateWebSession();
    expect(store.getLearningProgress().notes).toEqual({});
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
  it("rejects corrupt state and unknown chapters while recovering valid progress", async () => {
    const { parseLearningProgress } = await import("./learning-progress");
    expect(parseLearningProgress("not json").known).toEqual([]);
    expect(
      parseLearningProgress(JSON.stringify({ version: 5, known: ["cad"] }))
        .known,
    ).toEqual([]);
    const parsed = parseLearningProgress(
      JSON.stringify({
        version: 1,
        known: ["cad", "cad", "missing", 7],
        saved: ["gbp"],
        notes: { cad: "x".repeat(2100), missing: "personal" },
        last: { lesson: "china-ppi", step: 100 },
      }),
    );
    expect(parsed.known).toEqual(["cad"]);
    expect(parsed.saved).toEqual(["gbp"]);
    expect(parsed.notes.cad).toHaveLength(2000);
    expect(parsed.notes.missing).toBeUndefined();
    expect(parsed.last).toEqual({ lesson: "china-ppi", step: 0 });
  });

  it("restores a note, bookmark and reading position on this device", async () => {
    const store = await import("./learning-progress");
    store.toggleLearningSaved("cad");
    store.toggleLearningKnown("gbp");
    store.saveLearningNote("cad", "Ölursache und Gegenwährung prüfen.");
    store.saveLearningPosition("cad", 3);
    const persisted = localStorage.getItem(store.LEARNING_STORAGE_KEY);
    expect(persisted).not.toBeNull();
    vi.resetModules();
    const restored = await import("./learning-progress");
    expect(restored.getLearningProgress()).toMatchObject({
      saved: ["cad"],
      known: ["gbp"],
      notes: { cad: "Ölursache und Gegenwährung prüfen." },
      last: { lesson: "cad", step: 3 },
      storage: "device",
    });
  });

  it("never reads or writes personal learning state in browser storage in private web", async () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    localStorage.setItem(
      "personal-macro:learning:v1",
      JSON.stringify({
        version: 1,
        saved: ["cad"],
        notes: { cad: "Local only" },
      }),
    );
    const get = vi.spyOn(Storage.prototype, "getItem");
    const set = vi.spyOn(Storage.prototype, "setItem");
    const client = await import("../../services/private-web-client");
    const store = await import("./learning-progress");
    expect(store.getLearningProgress()).toMatchObject({
      saved: [],
      notes: {},
      storage: "session",
    });
    store.toggleLearningSaved("gold");
    expect(store.getLearningProgress().saved).toEqual([]);
    const session = {
      authenticated: true,
      workspaceId: "learning-test",
      revision: 0,
      csrfToken: "s".repeat(48),
      capabilities: [],
      writableCommands: [],
    };
    client.configurePrivateWebSession(session);
    store.toggleLearningSaved("gold");
    store.saveLearningNote("gold", "Nur hier.");
    expect(store.getLearningProgress()).toMatchObject({
      saved: ["gold"],
      notes: { gold: "Nur hier." },
    });
    client.clearPrivateWebSession();
    expect(store.getLearningProgress()).toMatchObject({
      saved: [],
      notes: {},
      last: null,
    });
    client.configurePrivateWebSession(session);
    expect(store.getLearningProgress().saved).toEqual([]);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    client.clearPrivateWebSession();
  });

  it("keeps working and labels memory storage when device persistence is blocked", async () => {
    const store = await import("./learning-progress");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    store.toggleLearningSaved("soybeans");
    expect(store.getLearningProgress()).toMatchObject({
      saved: ["soybeans"],
      storage: "memory",
    });
  });
});
