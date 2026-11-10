import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";
import { Field } from "./Field";
import { Tabs } from "./Tabs";

describe("native primitive contracts", () => {
  it("blocks activation while loading and preserves caller busy announcements", () => {
    const loading = renderToStaticMarkup(<Button loading>Save</Button>);
    expect(loading).toContain('disabled=""');
    expect(loading).toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<Button aria-busy>Refresh</Button>)).toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<Button>Save</Button>)).not.toContain('disabled=');
  });

  it("associates labels, hints and errors without exposing required decoration", () => {
    const html = renderToStaticMarkup(<Field id="source" label="Source" required hint="Local path" error="Choose a path"><input id="source" required aria-describedby="source-hint source-error" /></Field>);
    expect(html).toContain('for="source"');
    expect(html).toContain('id="source-hint"');
    expect(html).toContain('id="source-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("keeps inactive tab panels out of navigation while retaining their content", () => {
    const html = renderToStaticMarkup(<Tabs label="Settings" items={[
      { id: "general", label: "General", content: <button>Language</button> },
      { id: "details", label: "Diagnostics", content: <button>Refresh</button> },
    ]} />);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true" tabindex="0"');
    expect(html).toContain('aria-selected="false" tabindex="-1"');
    expect(html).toContain('hidden=""');
    expect(html).toContain('>Refresh</button>');
  });
});
