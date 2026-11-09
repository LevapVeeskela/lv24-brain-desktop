import { invoke } from "@tauri-apps/api/core";
import {
  LOCAL_API_ORIGIN,
  type ApiResponse,
  type InvokeFn,
} from "./types";

/** Extract the local API path from the fake URL used by openapi-fetch. */
export function localPathFromUrl(input: RequestInfo | URL): string {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const url = new URL(raw);
  if (url.origin !== LOCAL_API_ORIGIN) {
    throw new Error(`Refusing to proxy a non-local URL: ${url.origin}`);
  }
  return `${url.pathname}${url.search}`;
}

/**
 * openapi-fetch transport: the webview sees a normal fetch/Response, while
 * the bearer token and loopback port stay in the Rust `api_request` command.
 */
export function createTauriFetch(invokeFn: InvokeFn = invoke): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const path = localPathFromUrl(request.url);
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? null
        : (await request.text()) || null;
    const result = await invokeFn<ApiResponse>("api_request", {
      method: request.method,
      path,
      body,
    });
    const noBody =
      result.status === 204 || result.status === 205 || result.status === 304;
    const headers = new Headers();
    if (result.contentType) {
      headers.set("content-type", result.contentType);
    }
    return new Response(noBody ? null : result.body, {
      status: result.status,
      headers,
    });
  };
}
