import { describe, expect, it } from "vitest";
import { translate } from "@/shared/i18n";
import { filterActions, navigationActions } from "./navigation";

const t = (key: Parameters<typeof translate>[1]) => translate("en", key);

describe("command palette navigation", () => {
  it("lists the shell destinations and the selected project", () => {
    const actions = navigationActions(t, "lv24");
    expect(actions.map((action) => action.to)).toContain("/memory");
    expect(actions.map((action) => action.to)).toContain("/inbox");
    expect(actions).toContainEqual(
      expect.objectContaining({ id: "project", to: "/projects/lv24" }),
    );
  });

  it("filters on labels and keywords without a project", () => {
    const actions = navigationActions(t, null);
    expect(actions.some((action) => action.id === "project")).toBe(false);
    expect(filterActions(actions, "github").map((action) => action.id)).toEqual([
      "connections",
    ]);
    expect(filterActions(actions, "  ").length).toBe(actions.length);
    expect(filterActions(actions, "zzz")).toEqual([]);
  });
});
