import { describe, expect, it, vi } from "vitest";
import { LocalApiError } from "@/shared/api/client";
import { deferred, projectsSource } from "@/test/api";
import { project, projectState } from "@/test/fixtures";
import { ProjectsStore } from "./ProjectsStore";

describe("ProjectsStore", () => {
  it("loads projects and selects the first one", async () => {
    const store = new ProjectsStore(
      projectsSource({
        list: async () => [project({ id: "alpha" }), project({ id: "beta" })],
      }),
    );
    await store.load();
    expect(store.items).toHaveLength(2);
    expect(store.selectedId).toBe("alpha");
    expect(store.selected?.id).toBe("alpha");
    store.select("beta");
    expect(store.selected?.id).toBe("beta");
  });

  it("loads state and saves with the CAS revision", async () => {
    const saveState = vi.fn(async () => projectState({ revision: "rev-2" }));
    const store = new ProjectsStore(projectsSource({ saveState }));
    await store.loadState("lv24");
    expect(store.state?.revision).toBe("rev-1");
    const result = await store.saveState("lv24", { goal: "Next" });
    expect(result).toBe("saved");
    expect(saveState).toHaveBeenCalledWith("lv24", { goal: "Next" }, "rev-1");
    expect(store.state?.revision).toBe("rev-2");
    expect(store.stateConflict).toBe(false);
  });

  it("reports a CAS conflict with the current revision and reloads", async () => {
    const reload = deferred<ReturnType<typeof projectState>>();
    const state = vi
      .fn()
      .mockResolvedValueOnce(projectState({ revision: "rev-1" }))
      .mockReturnValueOnce(reload.promise);
    const saveState = vi.fn(async () => {
      throw new LocalApiError(409, "conflict", "state changed", "rev-2");
    });
    const store = new ProjectsStore(projectsSource({ state, saveState }));
    await store.loadState("lv24");
    const result = await store.saveState("lv24", { nextAction: "Retry" });
    expect(result).toBe("conflict");
    expect(store.stateConflict).toBe(true);
    expect(store.conflictRevision).toBe("rev-2");
    expect(store.saveError).toBe("state changed");

    reload.resolve(projectState({ revision: "rev-2" }));
    await vi.waitFor(() => expect(store.state?.revision).toBe("rev-2"));
    store.clearConflict();
    expect(store.stateConflict).toBe(false);
    expect(store.saveError).toBeNull();
  });

  it("reports non-conflict save failures without a conflict banner", async () => {
    const store = new ProjectsStore(
      projectsSource({
        saveState: async () => Promise.reject(new Error("read only")),
      }),
    );
    await store.loadState("lv24");
    const result = await store.saveState("lv24", { goal: "x" });
    expect(result).toBe("error");
    expect(store.stateConflict).toBe(false);
    expect(store.saveError).toBe("read only");
    expect(store.saving).toBe(false);
  });

  it("drops the previous project state when the selection changes", async () => {
    const store = new ProjectsStore(projectsSource());
    await store.loadState("lv24");
    expect(store.state?.projectId).toBe("lv24");
    store.select("other");
    expect(store.state).toBeNull();
    expect(store.stateLoaded).toBe(false);
  });
});
