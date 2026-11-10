export interface OAuthCallbackInfo {
  ok: boolean;
  connectionId?: string;
  /** Provider error code, when the callback reported one. */
  error?: string;
  /** Provider error description, stripped of control characters and bounded. */
  errorDescription?: string;
}

const CONNECTION_PARAMS = [
  "connection",
  "connection_id",
  "connectionId",
] as const;

const MAX_ERROR_CODE = 64;
const MAX_ERROR_DESCRIPTION = 240;
const ERROR_CODE_PATTERN = /^[A-Za-z0-9._~-]+$/;

/** Keep a provider error code only when it looks like an OAuth error code. */
function sanitizeErrorCode(value: string | null): string | undefined {
  const code = value?.trim();
  if (!code || code.length > MAX_ERROR_CODE || !ERROR_CODE_PATTERN.test(code)) {
    return undefined;
  }
  return code;
}

/**
 * Flatten a provider description to one bounded line and redact the
 * authorization code if the provider echoed it back.
 */
function sanitizeErrorDescription(
  value: string | null,
  authorizationCode: string | null,
): string | undefined {
  if (!value) {
    return undefined;
  }
  let description = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (authorizationCode) {
    description = description.split(authorizationCode).join("[redacted]");
  }
  if (!description) {
    return undefined;
  }
  return description.length > MAX_ERROR_DESCRIPTION
    ? `${description.slice(0, MAX_ERROR_DESCRIPTION - 1)}…`
    : description;
}

/**
 * Read a deep-link callback without exposing authorization codes.
 *
 * The engine validates and forwards the URL; this helper only extracts the
 * fields the desktop is allowed to show. The `code` is never returned, and a
 * provider error is sanitized before it reaches the UI.
 */
export function parseOAuthCallback(raw: string): OAuthCallbackInfo {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, connectionId: undefined };
  }

  const authorizationCode = url.searchParams.get("code");
  const error = sanitizeErrorCode(url.searchParams.get("error"));
  const errorDescription = sanitizeErrorDescription(
    url.searchParams.get("error_description"),
    authorizationCode,
  );
  const hasError =
    url.searchParams.has("error") || url.searchParams.has("error_description");

  let connectionId: string | undefined;
  for (const key of CONNECTION_PARAMS) {
    const value = url.searchParams.get(key)?.trim();
    if (value) {
      connectionId = value;
      break;
    }
  }

  const callback: OAuthCallbackInfo = {
    ok: !hasError && Boolean(authorizationCode),
    connectionId,
  };
  if (error) {
    callback.error = error;
  }
  if (errorDescription) {
    callback.errorDescription = errorDescription;
  }
  return callback;
}
