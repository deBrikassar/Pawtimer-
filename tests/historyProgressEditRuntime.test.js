import { afterEach, describe, expect, it, vi } from "vitest";
import { useHistoryEditing } from "../src/features/history/HistoryFeature";
import { selectAppData } from "../src/features/app/selectors";
import { hydrateDogFromLocal, mergeMutationSafeSyncCollection, save, sessKey } from "../src/features/app/storage";

const makeIso = (value) => new Date(value).toISOString();

const baseSession = {
  id: "sess-1",
  date: makeIso("2026-04-10T10:00:00Z"),
  plannedDuration: 180,
  actualDuration: 180,
  distressLevel: "none",
  belowThreshold: true,
  latencyToFirstDistress: 180,
  result: "success",
  revision: 1,
  updatedAt: makeIso("2026-04-10T10:05:00Z"),
};

const buildHistoryHarness = (initialSessions = [baseSession]) => {
  const showToast = vi.fn();
  const setHistoryModal = vi.fn();
  let state = [...initialSessions];
  const commitSessions = vi.fn((updater) => {
    state = typeof updater === "function" ? updater(state) : updater;
    return state;
  });
  const actions = useHistoryEditing({
    sessions: initialSessions,
    walks: [],
    patterns: [],
    feedings: [],
    patLabels: {},
    showToast,
    pushWithSyncStatus: vi.fn(() => Promise.resolve({ ok: true })),
    addTombstone: vi.fn(),
    commitSessions,
    setWalks: vi.fn(),
    setPatterns: vi.fn(),
    setFeedings: vi.fn(),
    stampLocalEntry: (next, prev) => ({ ...prev, ...next }),
  });
  return {
    actions,
    showToast,
    setHistoryModal,
    getState: () => state,
  };
};

const makeAppData = (sessions) => selectAppData({
  dogs: [{ id: "DOG-EDIT", dogName: "Mochi", goalSeconds: 3600 }],
  activeDogId: "DOG-EDIT",
  sessions,
  walks: [],
  patterns: [],
  feedings: [],
  target: 900,
  protoOverride: {},
  recommendation: { duration: 900, decisionState: null, details: {}, explanation: "" },
});

const createMemoryStorage = () => {
  const db = new Map();
  return {
    getItem: vi.fn((key) => (db.has(key) ? db.get(key) : null)),
    setItem: vi.fn((key, value) => {
      db.set(key, value);
      return undefined;
    }),
    removeItem: vi.fn((key) => db.delete(key)),
    clear: vi.fn(() => db.clear()),
  };
};

describe("runtime regression guard: edit duration -> history/progress/hydration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("edits duration by writing the changed value into the stored session", () => {
    const { actions, getState, setHistoryModal } = buildHistoryHarness();
    actions.saveEditedActivityDuration({ mode: "duration", kind: "session", id: "sess-1", value: "2:10" }, setHistoryModal);

    const edited = getState()[0];
    expect(edited.actualDuration).toBe(130);
    expect(edited.id).toBe("sess-1");
  });

  it("materializes History from edited data immediately after the edit commit", () => {
    const { actions, getState } = buildHistoryHarness();
    actions.saveEditedActivityDuration({ mode: "duration", kind: "session", id: "sess-1", value: "1:37" }, vi.fn());

    const appData = makeAppData(getState());
    expect(appData.timeline[0].kind).toBe("session");
    expect(appData.timeline[0].data.actualDuration).toBe(97);
  });

  it("recomputes progress metrics from edited duration instead of pre-edit values", () => {
    const { actions, getState } = buildHistoryHarness();
    actions.saveEditedActivityDuration({ mode: "duration", kind: "session", id: "sess-1", value: "1:37" }, vi.fn());

    const appData = makeAppData(getState());
    expect(appData.chartData[0].durationSeconds).toBe(97);
    expect(appData.aloneLastWeek).toBe(97);
  });

  it("keeps repeated edits stable without reverting to an earlier duration", () => {
    const { actions, getState } = buildHistoryHarness();
    actions.saveEditedActivityDuration({ mode: "duration", kind: "session", id: "sess-1", value: "1:37" }, vi.fn());
    actions.saveEditedActivityDuration({ mode: "duration", kind: "session", id: "sess-1", value: "2:30" }, vi.fn());

    expect(getState()[0].actualDuration).toBe(150);
  });

  it("keeps edited values through hydration and stale remote merge attempts", () => {
    const storage = createMemoryStorage();
    vi.stubGlobal("localStorage", storage);

    const editedLocal = [{
      ...baseSession,
      actualDuration: 150,
      belowThreshold: false,
      latencyToFirstDistress: 150,
      revision: 3,
      updatedAt: makeIso("2026-04-10T10:15:00Z"),
      pendingSync: true,
      syncState: "local",
      syncError: "",
    }];
    save(sessKey("DOG-EDIT"), editedLocal);

    const hydrated = hydrateDogFromLocal("DOG-EDIT");
    expect(hydrated.sessions[0].actualDuration).toBe(150);

    const merged = mergeMutationSafeSyncCollection({
      currentItems: hydrated.sessions,
      remoteItems: [{
        ...baseSession,
        actualDuration: 120,
        belowThreshold: false,
        latencyToFirstDistress: 120,
        revision: 2,
        updatedAt: makeIso("2026-04-10T10:12:00Z"),
      }],
      tombstones: [],
      kind: "session",
    });

    expect(merged[0].actualDuration).toBe(150);
    expect(merged[0].revision).toBe(3);
  });
});
