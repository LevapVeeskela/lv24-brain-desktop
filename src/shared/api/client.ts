import createClient from "openapi-fetch";
import type { paths } from "./generated/schema";
import { createTauriFetch } from "./transport";
import { LOCAL_API_ORIGIN } from "./types";

export const apiClient = createClient<paths>({
  baseUrl: LOCAL_API_ORIGIN,
  fetch: createTauriFetch(),
});

export class LocalApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LocalApiError";
  }
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
}

/** Convert the engine's sanitized `{error:{code,message}}` envelope. */
export function toApiError(response: Response, body: unknown): LocalApiError {
  const envelope = body as ErrorEnvelope | undefined;
  const code = envelope?.error?.code?.trim() || "api_error";
  const message =
    envelope?.error?.message?.trim() ||
    `Local API returned status ${response.status}`;
  return new LocalApiError(response.status, code, message);
}
