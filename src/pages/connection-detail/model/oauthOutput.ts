export interface OAuthOutputHints {
  url?: string;
  deviceCode?: string;
}

export const OAUTH_OUTPUT_MAX_LINES = 500;
export const OAUTH_OUTPUT_MAX_CHARS = 20_000;
const OAUTH_OUTPUT_MAX_LINE_CHARS = 4_000;

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/i;
const DEVICE_CODE_PATTERN =
  /(?:user[\s_-]?code|verification[\s_-]?code|enter(?:\s+the)?\s+code)\s*[:=]?\s*([A-Z0-9][A-Z0-9-]{2,})|(?<![A-Za-z0-9_-])code\s*[:=]\s*([A-Z0-9][A-Z0-9-]{2,})/i;

/**
 * Pick the human-facing URL and device code out of OAuth output lines.
 *
 * URLs are removed before matching the code so an authorization code embedded
 * in a redirect URL is never promoted to the device-code slot. The bare
 * `code` alternative uses a lookbehind to skip `device_code` (a secret).
 */
export function oauthOutputHints(
  lines: readonly string[],
): OAuthOutputHints {
  const text = lines.join("\n");
  const url = URL_PATTERN.exec(text)?.[0]?.replace(/[),.;]+$/, "");
  const withoutUrls = text.replace(/https?:\/\/\S+/gi, " ");
  const match = DEVICE_CODE_PATTERN.exec(withoutUrls);

  return {
    url: url || undefined,
    deviceCode: match?.[1] ?? match?.[2],
  };
}

/**
 * Keep the raw OAuth transcript bounded before it reaches the DOM.
 *
 * The newest lines win, individual lines are truncated, and the total text is
 * capped so a noisy provider cannot grow the page without limit.
 */
export function boundOAuthLines(
  lines: readonly string[],
  maxLines = OAUTH_OUTPUT_MAX_LINES,
  maxChars = OAUTH_OUTPUT_MAX_CHARS,
): string[] {
  const bounded = lines.slice(-maxLines).map((line) =>
    line.length > OAUTH_OUTPUT_MAX_LINE_CHARS
      ? `${line.slice(0, OAUTH_OUTPUT_MAX_LINE_CHARS)}…`
      : line,
  );
  let total = bounded.reduce((sum, line) => sum + line.length + 1, 0);
  let start = 0;
  while (total > maxChars && start < bounded.length - 1) {
    total -= bounded[start].length + 1;
    start += 1;
  }
  return bounded.slice(start);
}
