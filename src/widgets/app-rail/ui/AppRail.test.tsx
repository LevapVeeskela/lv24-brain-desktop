import { describe, expect, it } from "vitest";
import { RootStore } from "@/app/model/RootStore";
import { fakeIdeas } from "@/pages/ideas/api/fakeIdeas";
import { renderPage } from "@/test/render";
import { AppRail } from "./AppRail";

describe("AppRail", () => {
  it("renders the app title as the shell h1", () => {
    const store = new RootStore();
    const html = renderPage(<AppRail store={store} />);
    expect(html).toContain(
      '<h1 class="rail-brand-title">LV24 <span class="brand-accent">Brain</span></h1>',
    );
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("labels the navigation and keeps the locale-independent brand", () => {
    const store = new RootStore();
    const html = renderPage(<AppRail store={store} />, "ru");
    expect(html).toContain('aria-label="Основная навигация"');
    expect(html).toContain('class="rail-nav"');
  });

  it("adds the Ideas link with a global open-count badge", () => {
    const store = new RootStore();
    store.ideas.items = fakeIdeas(new Date(2026, 10, 27, 12));
    const html = renderPage(<AppRail store={store} />);
    expect(html).toContain('href="/ideas"');
    expect(html).toContain(">Ideas</span>");
    expect(html).toContain('class="rail-badge" aria-hidden="true">5</span>');
    expect(html).toContain("5 open ideas");
  });
});
