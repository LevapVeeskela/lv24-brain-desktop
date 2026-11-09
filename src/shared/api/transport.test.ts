import { describe, expect, it, vi } from "vitest";
import { createTauriFetch, localPathFromUrl } from "./transport";
import type { ApiResponse, InvokeFn } from "./types";

function invokeFor(response: ApiResponse) {
  return vi.fn(async () => response) as unknown as InvokeFn & {
    mock: { calls: unknown[][] };
  };
}

describe("Tauri local API transport", () => {
  it("extracts only the path from the fake local origin", () => {
    expect(localPathFromUrl("http://localapi.invalid/v1/runs?limit=20")).toBe(
      "/v1/runs?limit=20",
    );
    expect(() =>
      localPathFromUrl("http://127.0.0.1:9000/v1/health"),
    ).toThrow(/non-local URL/);
  });

  it("proxies GET without a body and returns a Response", async () => {
    const invoke = invokeFor({
      status: 200,
      contentType: "application/json",
      body: '{"ok":true}',
    });
    const fetchFn = createTauriFetch(invoke);
    const response = await fetchFn(
      "http://localapi.invalid/v1/connections?limit=5",
    );
    expect(invoke).toHaveBeenCalledWith("api_request", {
      method: "GET",
      path: "/v1/connections?limit=5",
      body: null,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("forwards a POST body", async () => {
    const invoke = invokeFor({
      status: 202,
      contentType: "application/json",
      body: '{"jobId":"job-1"}',
    });
    const fetchFn = createTauriFetch(invoke);
    await fetchFn("http://localapi.invalid/v1/connections/main/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"force":true}',
    });
    expect(invoke).toHaveBeenCalledWith("api_request", {
      method: "POST",
      path: "/v1/connections/main/run",
      body: '{"force":true}',
    });
  });

  it("does not attach a body to a 204 response", async () => {
    const invoke = invokeFor({
      status: 204,
      contentType: "",
      body: "",
    });
    const fetchFn = createTauriFetch(invoke);
    const response = await fetchFn(
      "http://localapi.invalid/v1/connections/main",
      { method: "DELETE" },
    );
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });
});
