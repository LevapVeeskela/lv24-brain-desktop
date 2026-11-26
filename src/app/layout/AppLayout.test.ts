import { describe, expect, it } from "vitest";
import { translate } from "@/shared/i18n";
import { routeTitleKey } from "./AppLayout";

describe("routeTitleKey", () => {
  it("maps the quarantine route to its own section title", () => {
    expect(routeTitleKey("/quarantine")).toBe("quarantine.title");
    expect(routeTitleKey("/quarantine/")).toBe("quarantine.title");
    expect(translate("en", routeTitleKey("/quarantine"))).toBe("Quarantine");
  });

  it("maps the ideas route to the Ideas title", () => {
    expect(routeTitleKey("/ideas")).toBe("nav.ideas");
    expect(translate("en", routeTitleKey("/ideas"))).toBe("Ideas");
    expect(translate("ru", routeTitleKey("/ideas"))).toBe("Идеи");
  });

  it("keeps unknown paths on the not-found title", () => {
    expect(routeTitleKey("/missing-screen")).toBe("app.notFound");
  });
});
