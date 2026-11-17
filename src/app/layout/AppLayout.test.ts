import { describe, expect, it } from "vitest";
import { translate } from "@/shared/i18n";
import { routeTitleKey } from "./AppLayout";

describe("routeTitleKey", () => {
  it("maps the quarantine route to its own section title", () => {
    expect(routeTitleKey("/quarantine")).toBe("quarantine.title");
    expect(routeTitleKey("/quarantine/")).toBe("quarantine.title");
    expect(translate("en", routeTitleKey("/quarantine"))).toBe("Quarantine");
  });

  it("keeps unknown paths on the not-found title", () => {
    expect(routeTitleKey("/missing-screen")).toBe("app.notFound");
  });
});
